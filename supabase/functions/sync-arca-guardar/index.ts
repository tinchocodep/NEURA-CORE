// ============================================================
// Edge Function: sync-arca-guardar
// ============================================================
// Paso 2 del sync con ARCA: recibe los datos crudos de AFIP
// (que n8n obtuvo haciendo polling) y los parsea/guarda.
//
// Deploy: supabase functions deploy sync-arca-guardar
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createSupabaseAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
  TIPOS_COMPROBANTE_AFIP,
  parseAFIPNumber,
  formatDate,
  normalizeNumeroComprobante,
  completeSyncRun,
} from "../_shared/utils.ts";

interface AfipRawRecord {
  "Punto de Venta"?: string;
  "Número Desde"?: string;
  "Tipo de Comprobante"?: string;
  "Fecha de Emisión"?: string;
  "Imp. Total"?: string;
  "Imp. Neto Gravado"?: string;
  "Imp. Neto No Gravado"?: string;
  IVA?: string;
  "Otros Tributos"?: string;
  "Cód. Autorización"?: string;
  "Nro. Doc. Receptor"?: string;
  "Denominación Receptor"?: string;
  Moneda?: string;
  [key: string]: string | undefined;
}

/** Normaliza un CUIT removiendo guiones y espacios */
function cleanCuit(cuit: string | null | undefined): string {
  return (cuit || "").replace(/[-\s]/g, "").trim();
}

interface ProveedorMatch {
  id: string;
  categoria_default_id: string | null;
  centro_costo_default_id: string | null;
}
interface ClienteMatch {
  id: string;
}

/** Carga TODOS los proveedores del tenant a un Map por CUIT limpio */
async function loadProveedoresMap(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Map<string, ProveedorMatch>> {
  const map = new Map<string, ProveedorMatch>();
  // Paginación para soportar tenants con miles de proveedores
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contable_proveedores")
      .select("id, cuit, categoria_default_id, centro_costo_default_id")
      .eq("tenant_id", tenantId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const p of data as any[]) {
      const c = cleanCuit(p.cuit);
      if (c) {
        map.set(c, {
          id: p.id,
          categoria_default_id: p.categoria_default_id,
          centro_costo_default_id: p.centro_costo_default_id,
        });
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

/** Carga TODOS los clientes del tenant a un Map por CUIT limpio */
async function loadClientesMap(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Map<string, ClienteMatch>> {
  const map = new Map<string, ClienteMatch>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contable_clientes")
      .select("id, cuit")
      .eq("tenant_id", tenantId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data as any[]) {
      const cu = cleanCuit(c.cuit);
      if (cu) map.set(cu, { id: c.id });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

/** Crea un proveedor nuevo y lo agrega al map */
async function createProveedor(
  supabase: SupabaseClient,
  tenantId: string,
  cuit: string,
  razonSocial: string,
  map: Map<string, ProveedorMatch>
): Promise<ProveedorMatch | null> {
  const cuitClean = cleanCuit(cuit);
  if (!cuitClean || !razonSocial.trim()) return null;
  const { data: nuevo, error } = await supabase
    .from("contable_proveedores")
    .insert({
      tenant_id: tenantId,
      razon_social: razonSocial.trim(),
      cuit: cuitClean,
      activo: true,
      es_caso_rojo: false,
      es_favorito: false,
    })
    .select("id, categoria_default_id, centro_costo_default_id")
    .single();
  if (error || !nuevo) return null;
  const m: ProveedorMatch = {
    id: nuevo.id,
    categoria_default_id: nuevo.categoria_default_id,
    centro_costo_default_id: nuevo.centro_costo_default_id,
  };
  map.set(cuitClean, m);
  return m;
}

/** Crea un cliente nuevo y lo agrega al map */
async function createCliente(
  supabase: SupabaseClient,
  tenantId: string,
  cuit: string,
  razonSocial: string,
  map: Map<string, ClienteMatch>
): Promise<ClienteMatch | null> {
  const cuitClean = cleanCuit(cuit);
  if (!cuitClean || !razonSocial.trim()) return null;
  const { data: nuevo, error } = await supabase
    .from("contable_clientes")
    .insert({
      tenant_id: tenantId,
      razon_social: razonSocial.trim(),
      cuit: cuitClean,
      activo: true,
    })
    .select("id")
    .single();
  if (error || !nuevo) return null;
  const m: ClienteMatch = { id: nuevo.id };
  map.set(cuitClean, m);
  return m;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const {
      tenantId,
      syncRunId,
      arcaCuit,
      emitidosData,
      recibidosData,
    } = await req.json();

    if (!tenantId) return errorResponse("tenantId es requerido");
    if (!syncRunId) return errorResponse("syncRunId es requerido");

    const supabase = createSupabaseAdmin();

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let proveedoresCreados = 0;
    let clientesCreados = 0;
    let comprobantesVinculados = 0;
    const errors: string[] = [];

    // Pre-cargar todos los proveedores y clientes del tenant en memoria (1 sola vez)
    const proveedoresMap = await loadProveedoresMap(supabase, tenantId);
    const clientesMap = await loadClientesMap(supabase, tenantId);

    // Procesar ambos tipos: E (ventas) y R (compras)
    const datasets: { data: AfipRawRecord[]; isVenta: boolean }[] = [
      { data: emitidosData || [], isVenta: true },
      { data: recibidosData || [], isVenta: false },
    ];

    for (const { data, isVenta } of datasets) {
      if (!Array.isArray(data) || data.length === 0) continue;

      for (const r of data) {
        try {
          const pv = (r["Punto de Venta"] || "").padStart(5, "0");
          const numDesde = (r["Número Desde"] || "").padStart(8, "0");
          const nroComprobante = normalizeNumeroComprobante(pv, numDesde);
          const tipoComp = r["Tipo de Comprobante"] || "";
          const tipoNombre = TIPOS_COMPROBANTE_AFIP[tipoComp] || `Tipo ${tipoComp}`;
          const fecha = formatDate(r["Fecha de Emisión"] || "");

          const total = parseAFIPNumber(r["Imp. Total"] || "0");
          const netoGravado = parseAFIPNumber(r["Imp. Neto Gravado"] || "0");
          const netoNoGravado = parseAFIPNumber(r["Imp. Neto No Gravado"] || "0");
          const iva = parseAFIPNumber(r["IVA"] || "0");
          const otrosTributos = parseAFIPNumber(r["Otros Tributos"] || "0");
          const codAutorizacion = r["Cód. Autorización"] || "";
          const nroDocReceptor = r["Nro. Doc. Receptor"] || "";
          const denominacion = r["Denominación Receptor"] || "";
          const monedaRaw = r["Moneda"] || "PES";
          const moneda = monedaRaw === "PES" ? "ARS" : monedaRaw === "DOL" ? "USD" : monedaRaw;

          const cuitClean = (arcaCuit || "").replace(/-/g, "");
          const cuitReceptor = isVenta ? nroDocReceptor : cuitClean;
          const cuitEmisor = isVenta ? cuitClean : nroDocReceptor;

          // Deduplicación por clave natural (tenant+tipo+tipo_comp+nro+cuits).
          // Si existe: agregamos 'arca' a sources[] en vez de saltear — evita duplicados
          // cross-source (ej: comprobante ya traido por Xubio o carga manual).
          let existeQuery = supabase
            .from("contable_comprobantes")
            .select("id, sources")
            .eq("tenant_id", tenantId)
            .eq("tipo", isVenta ? "venta" : "compra")
            .eq("tipo_comprobante", tipoNombre)
            .eq("numero_comprobante", nroComprobante);
          existeQuery = cuitEmisor ? existeQuery.eq("cuit_emisor", cuitEmisor) : existeQuery.is("cuit_emisor", null);
          existeQuery = cuitReceptor ? existeQuery.eq("cuit_receptor", cuitReceptor) : existeQuery.is("cuit_receptor", null);
          const { data: existe } = await existeQuery.maybeSingle();

          if (existe) {
            const currentSources: string[] = Array.isArray(existe.sources) ? existe.sources : [];
            if (!currentSources.includes("arca")) {
              await supabase
                .from("contable_comprobantes")
                .update({ sources: [...currentSources, "arca"] })
                .eq("id", existe.id);
            }
            skipped++;
            continue;
          }

          // ── Resolver proveedor o cliente ──
          let proveedorId: string | null = null;
          let clienteId: string | null = null;
          let categoriaIdDefault: string | null = null;
          let proyectoIdDefault: string | null = null;

          const cuitContraparte = cleanCuit(nroDocReceptor);

          if (isVenta) {
            // Es una venta nuestra → contraparte es CLIENTE (el receptor)
            if (cuitContraparte) {
              let cli = clientesMap.get(cuitContraparte);
              if (!cli && denominacion) {
                const created = await createCliente(supabase, tenantId, cuitContraparte, denominacion, clientesMap);
                if (created) {
                  cli = created;
                  clientesCreados++;
                }
              }
              if (cli) clienteId = cli.id;
            }
          } else {
            // Es una compra nuestra → contraparte es PROVEEDOR (el emisor)
            if (cuitContraparte) {
              let prov = proveedoresMap.get(cuitContraparte);
              if (!prov && denominacion) {
                const created = await createProveedor(supabase, tenantId, cuitContraparte, denominacion, proveedoresMap);
                if (created) {
                  prov = created;
                  proveedoresCreados++;
                }
              }
              if (prov) {
                proveedorId = prov.id;
                categoriaIdDefault = prov.categoria_default_id;
                proyectoIdDefault = prov.centro_costo_default_id;
              }
            }
          }

          if (proveedorId || clienteId) comprobantesVinculados++;

          const payload = {
            tenant_id: tenantId,
            tipo: isVenta ? "venta" : "compra",
            tipo_comprobante: tipoNombre,
            numero_comprobante: nroComprobante,
            fecha,
            monto_original: total,
            monto_ars: total,
            moneda,
            neto_gravado: netoGravado,
            neto_no_gravado: netoNoGravado,
            total_iva: iva,
            estado: "aprobado",
            source: "arca",
            sources: ["arca"],
            origen: "arca",
            cuit_receptor: cuitReceptor,
            cuit_emisor: cuitEmisor,
            descripcion: `${denominacion}${codAutorizacion ? ` | CAE: ${codAutorizacion}` : ""}${otrosTributos ? ` | Otros tributos: ${otrosTributos}` : ""}`,
            // Vinculación con proveedor/cliente y aplicación de defaults
            proveedor_id: proveedorId,
            cliente_id: clienteId,
            categoria_id: categoriaIdDefault,
            proyecto_id: proyectoIdDefault,
          };

          const { error } = await supabase
            .from("contable_comprobantes")
            .insert(payload);

          if (error) {
            failed++;
            errors.push(`${nroComprobante}: ${error.message}`);
          } else {
            imported++;
          }
        } catch (recErr: unknown) {
          failed++;
          const msg = recErr instanceof Error ? recErr.message : "Error procesando registro";
          errors.push(msg);
        }
      }
    }

    // Actualizar sync_run
    const status = failed > 0 && imported > 0 ? "partial" : failed > 0 ? "error" : "success";
    await completeSyncRun(supabase, syncRunId, {
      status,
      records_imported: imported,
      records_skipped: skipped,
      records_failed: failed,
      error_messages: errors,
      result_summary: {
        proveedores_creados: proveedoresCreados,
        clientes_creados: clientesCreados,
        comprobantes_vinculados: comprobantesVinculados,
      },
    });

    return jsonResponse({
      success: true,
      syncRunId,
      imported,
      skipped,
      failed,
      proveedoresCreados,
      clientesCreados,
      comprobantesVinculados,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
