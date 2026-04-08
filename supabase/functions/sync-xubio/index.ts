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

    // Armar lookups de clientes y proveedores (xubio_id → {uuid, cuit})
    const { data: clientes } = await supabase
      .from("contable_clientes")
      .select("id, xubio_id, cuit")
      .eq("tenant_id", tenantId)
      .not("xubio_id", "is", null);
    const clienteMap = new Map<string, { id: string; cuit: string | null }>();
    clientes?.forEach((c: { id: string; xubio_id: string; cuit: string | null }) =>
      clienteMap.set(String(c.xubio_id), { id: c.id, cuit: c.cuit })
    );

    const { data: proveedores } = await supabase
      .from("contable_proveedores")
      .select("id, xubio_id, cuit")
      .eq("tenant_id", tenantId)
      .not("xubio_id", "is", null);
    const proveedorMap = new Map<string, { id: string; cuit: string | null }>();
    proveedores?.forEach((p: { id: string; xubio_id: string; cuit: string | null }) =>
      proveedorMap.set(String(p.xubio_id), { id: p.id, cuit: p.cuit })
    );

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    // Helper: armar query params de fecha
    function buildEndpoint(base: string): string {
      const params: string[] = [];
      if (fechaDesde) params.push(`fechaDesde=${fechaDesde}`);
      if (fechaHasta) params.push(`fechaHasta=${fechaHasta}`);
      return params.length ? `${base}?${params.join("&")}` : base;
    }

    // Helper: mapear comprobante a row de DB
    function mapComprobante(c: any, tipo: "venta" | "compra"): Record<string, unknown> | null {
      const xubioId = String(c.transaccionid || c.comprobante || c.numeroDocumento || "");
      if (!xubioId) return null;

      const esVenta = tipo === "venta";
      const tipoNombre = mapTipoComprobante(c.tipo, esVenta);
      const letra = c.nombre?.match(/[ABC]/)?.[0] || "";
      const tipoComprobante = letra ? `${tipoNombre} ${letra}` : tipoNombre;

      let entityUuid: string | null = null;
      let entityCuit: string | null = null;
      if (esVenta) {
        const clienteXubioId = c.cliente?.ID || c.cliente?.id;
        const clienteData = clienteXubioId ? clienteMap.get(String(clienteXubioId)) : null;
        entityUuid = clienteData?.id || null;
        entityCuit = clienteData?.cuit || null;
      } else {
        const provXubioId = c.proveedor?.ID || c.proveedor?.id;
        const provData = provXubioId ? proveedorMap.get(String(provXubioId)) : null;
        entityUuid = provData?.id || null;
        entityCuit = provData?.cuit || null;
      }

      const row: Record<string, unknown> = {
        tenant_id: tenantId,
        tipo,
        tipo_comprobante: tipoComprobante,
        fecha: c.fecha,
        numero_comprobante: c.numeroDocumento || null,
        ...(esVenta
          ? { cliente_id: entityUuid, cuit_receptor: entityCuit }
          : { proveedor_id: entityUuid, cuit_emisor: entityCuit }),
        moneda: "ARS",
        monto_original: c.importetotal || 0,
        monto_ars: c.importetotal || 0,
        neto_gravado: c.importeGravado || 0,
        total_iva: c.importeImpuestos || 0,
        estado: "aprobado",
        source: "xubio",
        xubio_id: xubioId,
        xubio_synced_at: now,
        descripcion: c.descripcion || null,
      };
      if (c.fechaVto) row.fecha_vencimiento = c.fechaVto;
      if (c.cotizacion && c.cotizacion !== 1) row.tipo_cambio = c.cotizacion;
      return row;
    }

    // Helper: upsert en batches de hasta 200 registros
    async function upsertBatch(rows: Record<string, unknown>[], label: string) {
      const BATCH_SIZE = 200;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error, count } = await supabase
          .from("contable_comprobantes")
          .upsert(batch, { onConflict: "tenant_id,xubio_id", count: "exact" });
        if (error) {
          failed += batch.length;
          errors.push(`${label} batch ${i}-${i + batch.length}: ${error.message}`);
        } else {
          imported += count || batch.length;
        }
      }
    }

    // --- Fetch ventas y compras en paralelo ---
    const [ventasResult, comprasResult] = await Promise.allSettled([
      xubioApiRequest<any[]>(buildEndpoint("comprobanteVentaBean"), accessToken!),
      xubioApiRequest<any[]>(buildEndpoint("comprobanteCompraBean"), accessToken!),
    ]);

    // --- Procesar Ventas ---
    if (ventasResult.status === "fulfilled") {
      const ventasList = Array.isArray(ventasResult.value) ? ventasResult.value : [];
      const rows = ventasList.map((c) => mapComprobante(c, "venta")).filter(Boolean) as Record<string, unknown>[];
      if (rows.length) await upsertBatch(rows, "Ventas");
    } else {
      errors.push(`Error descargando ventas: ${ventasResult.reason?.message || "Unknown"}`);
    }

    // --- Procesar Compras ---
    if (comprasResult.status === "fulfilled") {
      const comprasList = Array.isArray(comprasResult.value) ? comprasResult.value : [];
      const rows = comprasList.map((c) => mapComprobante(c, "compra")).filter(Boolean) as Record<string, unknown>[];
      if (rows.length) await upsertBatch(rows, "Compras");
    } else {
      errors.push(`Error descargando compras: ${comprasResult.reason?.message || "Unknown"}`);
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
