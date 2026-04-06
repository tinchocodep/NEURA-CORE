// ============================================================
// Edge Function: conciliar
// ============================================================
// Compara comprobantes de ARCA vs Xubio en la base de datos
// y clasifica cada uno como: conciliado, diferencia,
// solo_arca, o solo_xubio.
//
// Lógica extraída de src/modules/agro/ConciliacionComprobantes.tsx
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
  status: "conciliado" | "diferencia" | "solo_arca" | "solo_xubio";
  arca: ComprobanteRow | null;
  xubio: ComprobanteRow | null;
  diferencias?: string[];
}

// --- Matching logic (from ConciliacionComprobantes.tsx) ---

function normalizeNumero(n: string | null): string {
  if (!n) return "";
  return n.replace(/\s/g, "").replace(/[^0-9-]/g, "");
}

function conciliarLists(
  arcaList: ComprobanteRow[],
  xubioList: ComprobanteRow[]
): MatchResult[] {
  const results: MatchResult[] = [];

  // Index xubio by numero_comprobante
  const xubioMap = new Map<string, ComprobanteRow>();
  for (const x of xubioList) {
    if (x.numero_comprobante) {
      xubioMap.set(normalizeNumero(x.numero_comprobante), x);
    }
  }

  const matchedXubioIds = new Set<string>();

  for (const arca of arcaList) {
    let found: ComprobanteRow | undefined;

    // Strategy 1: exact match on numero_comprobante
    const arcaNum = normalizeNumero(arca.numero_comprobante);
    if (arcaNum) {
      for (const [xNum, xRow] of xubioMap) {
        if (matchedXubioIds.has(xRow.id)) continue;
        // Exact match or partial (xubio might include the number)
        if (xNum === arcaNum || xNum.includes(arcaNum.split("-")[1] || "")) {
          found = xRow;
          break;
        }
      }
    }

    // Strategy 2: match by date + amount + tipo
    if (!found) {
      for (const x of xubioList) {
        if (matchedXubioIds.has(x.id)) continue;
        if (x.fecha === arca.fecha &&
            x.tipo === arca.tipo &&
            Math.abs(Number(x.monto_original) - Number(arca.monto_original)) < 0.01) {
          found = x;
          break;
        }
      }
    }

    if (found) {
      matchedXubioIds.add(found.id);
      const difs: string[] = [];

      const montoArca = Number(arca.monto_original);
      const montoXubio = Number(found.monto_original);
      if (Math.abs(montoArca - montoXubio) >= 0.01) {
        difs.push(`Monto: ARCA ${formatCurrency(montoArca)} vs Xubio ${formatCurrency(montoXubio)}`);
      }
      if (arca.neto_gravado != null && found.neto_gravado != null &&
          Math.abs(Number(arca.neto_gravado) - Number(found.neto_gravado)) >= 0.01) {
        difs.push(`Neto gravado: ARCA ${formatCurrency(Number(arca.neto_gravado))} vs Xubio ${formatCurrency(Number(found.neto_gravado))}`);
      }
      if (arca.total_iva != null && found.total_iva != null &&
          Math.abs(Number(arca.total_iva) - Number(found.total_iva)) >= 0.01) {
        difs.push(`IVA: ARCA ${formatCurrency(Number(arca.total_iva))} vs Xubio ${formatCurrency(Number(found.total_iva))}`);
      }

      results.push({
        arca,
        xubio: found,
        status: difs.length > 0 ? "diferencia" : "conciliado",
        diferencias: difs.length > 0 ? difs : undefined,
      });
    } else {
      results.push({ arca, xubio: null, status: "solo_arca" });
    }
  }

  // Xubio sin match en ARCA
  for (const x of xubioList) {
    if (!matchedXubioIds.has(x.id)) {
      results.push({ arca: null, xubio: x, status: "solo_xubio" });
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

    // Traer comprobantes de Xubio en el rango
    const { data: xubioData, error: xubioErr } = await supabase
      .from("contable_comprobantes")
      .select(selectFields)
      .eq("tenant_id", tenantId)
      .eq("source", "xubio")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: false });

    if (xubioErr) throw new Error(`Error leyendo comprobantes Xubio: ${xubioErr.message}`);

    const arcaList = (arcaData || []) as ComprobanteRow[];
    const xubioList = (xubioData || []) as ComprobanteRow[];

    // Conciliar ambas listas
    const matches = conciliarLists(arcaList, xubioList);

    // Calcular stats
    const stats = {
      conciliados: matches.filter(m => m.status === "conciliado").length,
      diferencias: matches.filter(m => m.status === "diferencia").length,
      solo_arca: matches.filter(m => m.status === "solo_arca").length,
      solo_xubio: matches.filter(m => m.status === "solo_xubio").length,
      total: matches.length,
      total_arca: arcaList.length,
      total_xubio: xubioList.length,
    };

    // Guardar resultado en sync_run
    await completeSyncRun(supabase, syncRunId, {
      status: "success",
      result_summary: { stats, matches },
    });

    return jsonResponse({
      success: true,
      syncRunId,
      stats,
      matches,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
