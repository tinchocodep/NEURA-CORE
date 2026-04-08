// ============================================================
// Edge Function: sync-arca-guardar
// ============================================================
// Paso 2 del sync con ARCA: recibe los datos crudos de AFIP
// (que n8n obtuvo haciendo polling) y los parsea/guarda.
//
// Deploy: supabase functions deploy sync-arca-guardar
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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
    const errors: string[] = [];

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

          // Deduplicación: buscar si ya existe
          const { data: existe } = await supabase
            .from("contable_comprobantes")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("numero_comprobante", nroComprobante)
            .eq("tipo_comprobante", tipoNombre)
            .eq("tipo", isVenta ? "venta" : "compra")
            .maybeSingle();

          if (existe) {
            skipped++;
            continue;
          }

          const cuitClean = (arcaCuit || "").replace(/-/g, "");

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
            origen: "arca",
            cuit_receptor: isVenta ? nroDocReceptor : cuitClean,
            cuit_emisor: isVenta ? cuitClean : nroDocReceptor,
            descripcion: `${denominacion}${codAutorizacion ? ` | CAE: ${codAutorizacion}` : ""}${otrosTributos ? ` | Otros tributos: ${otrosTributos}` : ""}`,
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
    });

    return jsonResponse({
      success: true,
      syncRunId,
      imported,
      skipped,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
