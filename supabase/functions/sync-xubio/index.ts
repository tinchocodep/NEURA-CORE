// ============================================================
// Edge Function: sync-xubio
// ============================================================
// Sincroniza comprobantes de venta y compra desde Xubio ERP.
// Lógica extraída de src/services/XubioService.ts
//
// Deploy: supabase functions deploy sync-xubio
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createSupabaseAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
  createSyncRun,
  completeSyncRun,
} from "../_shared/utils.ts";

// --- Xubio constants ---

const XUBIO_BASE = "https://xubio.com/API/1.1";
const TOKEN_ENDPOINT = `${XUBIO_BASE}/TokenEndpoint`;
const XUBIO_PROXY = "https://n8n.neuracall.net/webhook/xubio-proxy";

// --- Xubio helpers ---

function mapTipoComprobante(tipo: number, esVenta: boolean): string {
  if (esVenta) {
    const map: Record<number, string> = {
      1: "Factura", 2: "Nota de Débito", 3: "Nota de Crédito",
      4: "Informe Z", 6: "Recibo",
    };
    return map[tipo] || `Tipo ${tipo}`;
  }
  const map: Record<number, string> = {
    1: "Factura", 2: "Nota de Débito", 3: "Nota de Crédito",
    6: "Recibo", 99: "Otros",
  };
  return map[tipo] || `Tipo ${tipo}`;
}

async function xubioAuthenticate(
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch(XUBIO_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "POST",
      url: TOKEN_ENDPOINT,
      data: {
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Xubio auth error ${response.status}: ${err}`);
  }

  const tokenData = await response.json();
  return {
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in,
  };
}

async function xubioApiRequest<T>(
  endpoint: string,
  accessToken: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<T> {
  const url = `${XUBIO_BASE}/${endpoint}`;

  const response = await fetch(XUBIO_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method,
      url,
      token: accessToken,
      data: body || undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Xubio API error ${response.status} on ${method} ${endpoint}: ${err}`);
  }

  const json = await response.json();
  // n8n proxy wraps array responses in {items: [...]}
  if (json && typeof json === "object" && Array.isArray(json.items)) {
    if (json.items.length === 1 && json.items[0]?.error) {
      const err = json.items[0].error;
      throw new Error(`Xubio API error: ${err.message || err.status || "Unknown error"}`);
    }
    return json.items as T;
  }
  return json as T;
}

// --- Main handler ---

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { tenantId, fechaDesde, fechaHasta, triggeredBy } = await req.json();

    if (!tenantId) return errorResponse("tenantId es requerido");

    const supabase = createSupabaseAdmin();

    // Leer config de Xubio
    const { data: config, error: cfgErr } = await supabase
      .from("contable_config")
      .select("id, xubio_client_id, xubio_client_secret, xubio_token, xubio_token_expires_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (cfgErr || !config) {
      return errorResponse("No se encontró configuración Xubio para este tenant", 404);
    }
    if (!config.xubio_client_id || !config.xubio_client_secret) {
      return errorResponse("Credenciales Xubio incompletas. Configurá client_id y client_secret.");
    }

    // Crear sync_run
    const syncRunId = await createSyncRun(supabase, {
      tenantId,
      runType: "sync-xubio",
      triggeredBy: triggeredBy || "manual",
      fechaDesde: fechaDesde || null,
      fechaHasta: fechaHasta || null,
    });

    // Autenticar con Xubio (usar token cacheado si es válido)
    let accessToken = config.xubio_token;
    if (!accessToken || !config.xubio_token_expires_at ||
        new Date(config.xubio_token_expires_at) <= new Date()) {
      const auth = await xubioAuthenticate(config.xubio_client_id, config.xubio_client_secret);
      accessToken = auth.accessToken;
      const expiresAt = new Date(Date.now() + auth.expiresIn * 1000 - 60_000);

      // Persistir token nuevo
      await supabase
        .from("contable_config")
        .update({
          xubio_token: accessToken,
          xubio_token_expires_at: expiresAt.toISOString(),
        })
        .eq("id", config.id);
    }

    // Armar lookups de clientes y proveedores (xubio_id → uuid)
    const { data: clientes } = await supabase
      .from("contable_clientes")
      .select("id, xubio_id")
      .eq("tenant_id", tenantId)
      .not("xubio_id", "is", null);
    const clienteMap = new Map<string, string>();
    clientes?.forEach((c: { id: string; xubio_id: string }) =>
      clienteMap.set(String(c.xubio_id), c.id)
    );

    const { data: proveedores } = await supabase
      .from("contable_proveedores")
      .select("id, xubio_id")
      .eq("tenant_id", tenantId)
      .not("xubio_id", "is", null);
    const proveedorMap = new Map<string, string>();
    proveedores?.forEach((p: { id: string; xubio_id: string }) =>
      proveedorMap.set(String(p.xubio_id), p.id)
    );

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // --- Comprobantes de Venta ---
    try {
      let endpoint = "comprobanteVentaBean";
      const params: string[] = [];
      if (fechaDesde) params.push(`fechaDesde=${fechaDesde}`);
      if (fechaHasta) params.push(`fechaHasta=${fechaHasta}`);
      if (params.length) endpoint += `?${params.join("&")}`;

      const ventas = await xubioApiRequest<any[]>(endpoint, accessToken!);
      const ventasList = Array.isArray(ventas) ? ventas : [];

      for (const cv of ventasList) {
        const xubioId = String(cv.transaccionid || cv.comprobante || cv.numeroDocumento || "");
        if (!xubioId) continue;

        try {
          const { data: existing } = await supabase
            .from("contable_comprobantes")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("xubio_id", xubioId)
            .maybeSingle();

          const tipoNombre = mapTipoComprobante(cv.tipo, true);
          const letra = cv.nombre?.match(/[ABC]/)?.[0] || "";
          const tipoComprobante = letra ? `${tipoNombre} ${letra}` : tipoNombre;

          const clienteXubioId = cv.cliente?.ID || cv.cliente?.id;
          const clienteUuid = clienteXubioId ? clienteMap.get(String(clienteXubioId)) : null;

          const compData: Record<string, unknown> = {
            tenant_id: tenantId,
            tipo: "venta",
            tipo_comprobante: tipoComprobante,
            fecha: cv.fecha,
            numero_comprobante: cv.numeroDocumento || null,
            cliente_id: clienteUuid || null,
            moneda: "ARS",
            monto_original: cv.importetotal || 0,
            monto_ars: cv.importetotal || 0,
            neto_gravado: cv.importeGravado || 0,
            total_iva: cv.importeImpuestos || 0,
            estado: "aprobado",
            source: "xubio",
            xubio_id: xubioId,
            xubio_synced_at: new Date().toISOString(),
            descripcion: cv.descripcion || null,
          };
          if (cv.fechaVto) compData.fecha_vencimiento = cv.fechaVto;
          if (cv.cotizacion && cv.cotizacion !== 1) compData.tipo_cambio = cv.cotizacion;

          if (existing) {
            await supabase.from("contable_comprobantes").update(compData).eq("id", existing.id);
            updated++;
          } else {
            await supabase.from("contable_comprobantes").insert(compData);
            imported++;
          }
        } catch (err) {
          failed++;
          errors.push(`Venta ${cv.numeroDocumento || xubioId}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      errors.push(`Error descargando ventas: ${(err as Error).message}`);
    }

    // --- Comprobantes de Compra ---
    try {
      let endpoint = "comprobanteCompraBean";
      const params: string[] = [];
      if (fechaDesde) params.push(`fechaDesde=${fechaDesde}`);
      if (fechaHasta) params.push(`fechaHasta=${fechaHasta}`);
      if (params.length) endpoint += `?${params.join("&")}`;

      const compras = await xubioApiRequest<any[]>(endpoint, accessToken!);
      const comprasList = Array.isArray(compras) ? compras : [];

      for (const cc of comprasList) {
        const xubioId = String(cc.transaccionid || cc.comprobante || cc.numeroDocumento || "");
        if (!xubioId) continue;

        try {
          const { data: existing } = await supabase
            .from("contable_comprobantes")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("xubio_id", xubioId)
            .maybeSingle();

          const tipoNombre = mapTipoComprobante(cc.tipo, false);
          const letra = cc.nombre?.match(/[ABC]/)?.[0] || "";
          const tipoComprobante = letra ? `${tipoNombre} ${letra}` : tipoNombre;

          const provXubioId = cc.proveedor?.ID || cc.proveedor?.id;
          const provUuid = provXubioId ? proveedorMap.get(String(provXubioId)) : null;

          const compData: Record<string, unknown> = {
            tenant_id: tenantId,
            tipo: "compra",
            tipo_comprobante: tipoComprobante,
            fecha: cc.fecha,
            numero_comprobante: cc.numeroDocumento || null,
            proveedor_id: provUuid || null,
            moneda: "ARS",
            monto_original: cc.importetotal || 0,
            monto_ars: cc.importetotal || 0,
            neto_gravado: cc.importeGravado || 0,
            total_iva: cc.importeImpuestos || 0,
            estado: "aprobado",
            source: "xubio",
            xubio_id: xubioId,
            xubio_synced_at: new Date().toISOString(),
            descripcion: cc.descripcion || null,
          };
          if (cc.fechaVto) compData.fecha_vencimiento = cc.fechaVto;
          if (cc.cotizacion && cc.cotizacion !== 1) compData.tipo_cambio = cc.cotizacion;

          if (existing) {
            await supabase.from("contable_comprobantes").update(compData).eq("id", existing.id);
            updated++;
          } else {
            await supabase.from("contable_comprobantes").insert(compData);
            imported++;
          }
        } catch (err) {
          failed++;
          errors.push(`Compra ${cc.numeroDocumento || xubioId}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      errors.push(`Error descargando compras: ${(err as Error).message}`);
    }

    // Actualizar sync_run
    const status = failed > 0 && imported > 0 ? "partial" : failed > 0 && imported === 0 ? "error" : "success";
    await completeSyncRun(supabase, syncRunId, {
      status,
      records_imported: imported,
      records_updated: updated,
      records_failed: failed,
      error_messages: errors,
    });

    return jsonResponse({
      success: true,
      syncRunId,
      imported,
      updated,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
