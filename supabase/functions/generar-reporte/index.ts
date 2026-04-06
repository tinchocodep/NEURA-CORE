// ============================================================
// Edge Function: generar-reporte
// ============================================================
// Toma el resultado de una conciliación (sync_runs) y genera
// un HTML listo para enviar por mail.
//
// Deploy: supabase functions deploy generar-reporte
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createSupabaseAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
  formatCurrency,
} from "../_shared/utils.ts";

// --- HTML template ---

function generateHtmlReport(
  stats: {
    conciliados: number;
    diferencias: number;
    solo_arca: number;
    solo_xubio: number;
    total: number;
    total_arca: number;
    total_xubio: number;
  },
  matches: Array<{
    status: string;
    arca: { numero_comprobante: string; tipo_comprobante: string; fecha: string; monto_original: number; descripcion?: string } | null;
    xubio: { numero_comprobante: string; tipo_comprobante: string; fecha: string; monto_original: number; descripcion?: string } | null;
    diferencias?: string[];
  }>,
  fechaDesde: string,
  fechaHasta: string,
  tenantName: string
): string {
  const problemMatches = matches.filter(
    m => m.status === "diferencia" || m.status === "solo_arca" || m.status === "solo_xubio"
  );

  const statusColors: Record<string, string> = {
    diferencia: "#f59e0b",
    solo_arca: "#ef4444",
    solo_xubio: "#3b82f6",
  };

  const statusLabels: Record<string, string> = {
    diferencia: "Diferencia",
    solo_arca: "Solo en ARCA",
    solo_xubio: "Solo en Xubio",
  };

  const problemRows = problemMatches
    .map((m) => {
      const comp = m.arca || m.xubio;
      const numero = comp?.numero_comprobante || "-";
      const tipo = comp?.tipo_comprobante || "-";
      const fecha = comp?.fecha || "-";
      const montoArca = m.arca ? formatCurrency(Number(m.arca.monto_original)) : "-";
      const montoXubio = m.xubio ? formatCurrency(Number(m.xubio.monto_original)) : "-";
      const color = statusColors[m.status] || "#6b7280";
      const label = statusLabels[m.status] || m.status;
      const difDetail = m.diferencias ? m.diferencias.join("<br>") : "";

      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${label}</span>
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${fecha}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${tipo}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${numero}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${montoArca}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${montoXubio}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${difDetail}</td>
        </tr>`;
    })
    .join("");

  const noProblems = problemMatches.length === 0;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; margin: 0;">
  <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: #1e293b; color: white; padding: 24px;">
      <h1 style="margin: 0; font-size: 20px;">Reporte de Conciliación</h1>
      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">
        ${tenantName} &mdash; ${fechaDesde} al ${fechaHasta}
      </p>
      <p style="margin: 4px 0 0; color: #64748b; font-size: 12px;">
        Generado: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
      </p>
    </div>

    <!-- KPI Cards -->
    <div style="display: flex; padding: 20px; gap: 12px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 120px; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${stats.conciliados}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Conciliados</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #fffbeb; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: #d97706;">${stats.diferencias}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Diferencias</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: #dc2626;">${stats.solo_arca}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Solo ARCA</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${stats.solo_xubio}</div>
        <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Solo Xubio</div>
      </div>
    </div>

    <!-- Summary -->
    <div style="padding: 0 20px 12px; font-size: 13px; color: #6b7280;">
      Total ARCA: ${stats.total_arca} comprobantes &mdash; Total Xubio: ${stats.total_xubio} comprobantes
    </div>

    ${noProblems ? `
    <!-- All good -->
    <div style="padding: 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#10003;</div>
      <p style="color: #16a34a; font-size: 16px; font-weight: 600;">Todo conciliado correctamente</p>
      <p style="color: #6b7280; font-size: 13px;">No se encontraron diferencias ni faltantes.</p>
    </div>
    ` : `
    <!-- Problem table -->
    <div style="padding: 0 20px 20px;">
      <h2 style="font-size: 15px; color: #374151; margin-bottom: 12px;">
        Items que requieren atención (${problemMatches.length})
      </h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Estado</th>
            <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Fecha</th>
            <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Tipo</th>
            <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Número</th>
            <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">ARCA</th>
            <th style="padding: 8px 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Xubio</th>
            <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${problemRows}
        </tbody>
      </table>
    </div>
    `}

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 16px 20px; text-align: center; font-size: 11px; color: #9ca3af;">
      Generado automáticamente por NeuraCore
    </div>
  </div>
</body>
</html>`;
}

// --- Main handler ---

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { tenantId, syncRunId, format } = await req.json();

    if (!tenantId) return errorResponse("tenantId es requerido");
    if (!syncRunId) return errorResponse("syncRunId es requerido");

    const supabase = createSupabaseAdmin();

    // Leer el sync_run de la conciliación
    const { data: run, error: runErr } = await supabase
      .from("sync_runs")
      .select("*")
      .eq("id", syncRunId)
      .eq("tenant_id", tenantId)
      .single();

    if (runErr || !run) {
      return errorResponse("No se encontró el sync_run", 404);
    }

    const summary = run.result_summary || {};
    const stats = summary.stats || {
      conciliados: 0, diferencias: 0, solo_arca: 0, solo_xubio: 0,
      total: 0, total_arca: 0, total_xubio: 0,
    };
    const matches = summary.matches || [];

    // Si piden JSON, devolver crudo
    if (format === "json") {
      return jsonResponse({ success: true, stats, matches });
    }

    // Leer nombre del tenant + emails de la config
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    const tenantName = tenant?.name || "Tenant";

    const { data: configData } = await supabase
      .from("contable_config")
      .select("auto_conciliacion_emails")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const destinatario = configData?.auto_conciliacion_emails || "";

    // Generar HTML
    const html = generateHtmlReport(
      stats,
      matches,
      run.fecha_desde || "?",
      run.fecha_hasta || "?",
      tenantName
    );

    const problemCount = stats.diferencias + stats.solo_arca + stats.solo_xubio;
    const subject = problemCount > 0
      ? `Conciliación ${tenantName} — ${problemCount} items requieren atención (${run.fecha_desde} al ${run.fecha_hasta})`
      : `Conciliación ${tenantName} — Todo OK (${run.fecha_desde} al ${run.fecha_hasta})`;

    return jsonResponse({
      success: true,
      html,
      subject,
      stats,
      destinatario,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
