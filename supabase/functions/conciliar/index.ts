// ============================================================
// Edge Function: conciliar
// ============================================================
// Compara comprobantes de ARCA vs el ERP del tenant (Xubio,
// Colppy, etc.) y clasifica cada uno como: conciliado,
// diferencia, solo_arca, o solo_erp.
//
// Lee el erp_type de contable_config para saber contra qué
// source comparar. Default: "xubio".
//
// Deploy: supabase functions deploy conciliar
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createSupabaseAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
  formatCurrency,
  createSyncRun,
  completeSyncRun,
} from "../_shared/utils.ts";

// --- Types ---

interface ComprobanteRow {
  id: string;
  tipo: string;
  tipo_comprobante: string;
  numero_comprobante: string | null;
  fecha: string;
  monto_original: number;
  neto_gravado: number | null;
  total_iva: number | null;
  cuit_emisor: string | null;
  cuit_receptor: string | null;
  source: string;
  descripcion: string | null;
}

interface MatchResult {
  status: "conciliado" | "diferencia" | "solo_arca" | "solo_erp";
  arca: ComprobanteRow | null;
  erp: ComprobanteRow | null;
  diferencias?: string[];
}

// --- Matching logic (from ConciliacionComprobantes.tsx) ---

function normalizeNumero(n: string | null): string {
  if (!n) return "";
  return n.replace(/\s/g, "").replace(/[^0-9-]/g, "");
}

function conciliarLists(
  arcaList: ComprobanteRow[],
  erpList: ComprobanteRow[],
  erpName: string
): MatchResult[] {
  const results: MatchResult[] = [];

  // Index ERP comprobantes by numero_comprobante
  const erpMap = new Map<string, ComprobanteRow>();
  for (const x of erpList) {
    if (x.numero_comprobante) {
      erpMap.set(normalizeNumero(x.numero_comprobante), x);
    }
  }

  const matchedErpIds = new Set<string>();

  for (const arca of arcaList) {
    let found: ComprobanteRow | undefined;

    // Strategy 1: exact match on numero_comprobante
    const arcaNum = normalizeNumero(arca.numero_comprobante);
    if (arcaNum) {
      for (const [xNum, xRow] of erpMap) {
        if (matchedErpIds.has(xRow.id)) continue;
        if (xNum === arcaNum || xNum.includes(arcaNum.split("-")[1] || "")) {
          found = xRow;
          break;
        }
      }
    }

    // Strategy 2: match by date + amount + tipo
    if (!found) {
      for (const x of erpList) {
        if (matchedErpIds.has(x.id)) continue;
        if (x.fecha === arca.fecha &&
            x.tipo === arca.tipo &&
            Math.abs(Number(x.monto_original) - Number(arca.monto_original)) < 0.01) {
          found = x;
          break;
        }
      }
    }

    if (found) {
      matchedErpIds.add(found.id);
      const difs: string[] = [];

      const montoArca = Number(arca.monto_original);
      const montoErp = Number(found.monto_original);
      if (Math.abs(montoArca - montoErp) >= 0.01) {
        difs.push(`Monto: ARCA ${formatCurrency(montoArca)} vs ${erpName} ${formatCurrency(montoErp)}`);
      }
      if (arca.neto_gravado != null && found.neto_gravado != null &&
          Math.abs(Number(arca.neto_gravado) - Number(found.neto_gravado)) >= 0.01) {
        difs.push(`Neto gravado: ARCA ${formatCurrency(Number(arca.neto_gravado))} vs ${erpName} ${formatCurrency(Number(found.neto_gravado))}`);
      }
      if (arca.total_iva != null && found.total_iva != null &&
          Math.abs(Number(arca.total_iva) - Number(found.total_iva)) >= 0.01) {
        difs.push(`IVA: ARCA ${formatCurrency(Number(arca.total_iva))} vs ${erpName} ${formatCurrency(Number(found.total_iva))}`);
      }

      results.push({
        arca,
        erp: found,
        status: difs.length > 0 ? "diferencia" : "conciliado",
        diferencias: difs.length > 0 ? difs : undefined,
      });
    } else {
      results.push({ arca, erp: null, status: "solo_arca" });
    }
  }

  // ERP sin match en ARCA
  for (const x of erpList) {
    if (!matchedErpIds.has(x.id)) {
      results.push({ arca: null, erp: x, status: "solo_erp" });
    }
  }

  return results;
}

// --- Main handler ---

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { tenantId, fechaDesde, fechaHasta, triggeredBy } = await req.json();

    if (!tenantId) return errorResponse("tenantId es requerido");
    if (!fechaDesde || !fechaHasta) return errorResponse("fechaDesde y fechaHasta son requeridos");

    const supabase = createSupabaseAdmin();

    // Leer el ERP del tenant desde contable_config
    const { data: config } = await supabase
      .from("contable_config")
      .select("erp_type")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const erpType = config?.erp_type || "xubio";
    // En la DB el source de Colppy es "colpy" (sin doble p)
    const erpSource = erpType === "colppy" ? "colpy" : erpType;
    // Nombre legible para los reportes
    const erpNameMap: Record<string, string> = { xubio: "Xubio", colppy: "Colppy", manual: "Manual" };
    const erpName = erpNameMap[erpType] || erpType;

    // Crear sync_run
    const syncRunId = await createSyncRun(supabase, {
      tenantId,
      runType: "conciliar",
      triggeredBy: triggeredBy || "manual",
      fechaDesde,
      fechaHasta,
    });

    const selectFields = "id, tipo, tipo_comprobante, numero_comprobante, fecha, monto_original, neto_gravado, total_iva, cuit_emisor, cuit_receptor, source, descripcion";

    // Traer comprobantes de ARCA en el rango
    const { data: arcaData, error: arcaErr } = await supabase
      .from("contable_comprobantes")
      .select(selectFields)
      .eq("tenant_id", tenantId)
      .eq("source", "arca")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: false });

    if (arcaErr) throw new Error(`Error leyendo comprobantes ARCA: ${arcaErr.message}`);

    // Traer comprobantes del ERP en el rango
    const { data: erpData, error: erpErr } = await supabase
      .from("contable_comprobantes")
      .select(selectFields)
      .eq("tenant_id", tenantId)
      .eq("source", erpSource)
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: false });

    if (erpErr) throw new Error(`Error leyendo comprobantes ${erpName}: ${erpErr.message}`);

    const arcaList = (arcaData || []) as ComprobanteRow[];
    const erpList = (erpData || []) as ComprobanteRow[];

    // Conciliar ambas listas
    const matches = conciliarLists(arcaList, erpList, erpName);

    // Calcular stats
    const stats = {
      conciliados: matches.filter(m => m.status === "conciliado").length,
      diferencias: matches.filter(m => m.status === "diferencia").length,
      solo_arca: matches.filter(m => m.status === "solo_arca").length,
      solo_erp: matches.filter(m => m.status === "solo_erp").length,
      total: matches.length,
      total_arca: arcaList.length,
      total_erp: erpList.length,
      erp_name: erpName,
    };

    // Guardar resultado en sync_run
    await completeSyncRun(supabase, syncRunId, {
      status: "success",
      result_summary: { stats, matches, erpName },
    });

    return jsonResponse({
      success: true,
      syncRunId,
      stats,
      matches,
      erpName,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
