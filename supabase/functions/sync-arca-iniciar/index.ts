// ============================================================
// Edge Function: sync-arca-iniciar
// ============================================================
// Paso 1 del sync con ARCA: crea la automatización en AFIP SDK
// y devuelve el automationId para que n8n haga el polling.
//
// Deploy: supabase functions deploy sync-arca-iniciar
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createSupabaseAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
  toAfipDate,
  createSyncRun,
} from "../_shared/utils.ts";
import { createAfipAutomation } from "../_shared/afip-sdk.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { tenantId, fechaDesde, fechaHasta, triggeredBy } = await req.json();

    if (!tenantId) return errorResponse("tenantId es requerido");

    const supabase = createSupabaseAdmin();

    // Leer credenciales ARCA del tenant
    const { data: config, error: cfgErr } = await supabase
      .from("contable_config")
      .select("arca_cuit, arca_username, arca_password, punto_venta")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (cfgErr || !config) {
      return errorResponse("No se encontró configuración ARCA para este tenant", 404);
    }
    if (!config.arca_cuit || !config.arca_username || !config.arca_password) {
      return errorResponse("Credenciales ARCA incompletas. Configurá CUIT, usuario y contraseña.");
    }

    // Calcular rango de fechas
    const now = new Date();
    const defaultDesde = new Date(now);
    defaultDesde.setDate(defaultDesde.getDate() - 30);

    const desde = fechaDesde || defaultDesde.toISOString().split("T")[0];
    const hasta = fechaHasta || now.toISOString().split("T")[0];

    const fromDate = toAfipDate(desde);
    const toDate = toAfipDate(hasta);

    // Crear sync_run para tracking
    const syncRunId = await createSyncRun(supabase, {
      tenantId,
      runType: "sync-arca",
      triggeredBy: triggeredBy || "manual",
      fechaDesde: desde,
      fechaHasta: hasta,
    });

    // Crear automatizaciones en AFIP SDK para Emitidos (E) y Recibidos (R)
    const automationIds: { tipo: string; automationId: string }[] = [];

    for (const tipoConsulta of ["E", "R"] as const) {
      const result = await createAfipAutomation({
        cuit: config.arca_cuit.replace(/-/g, ""),
        username: config.arca_username.replace(/-/g, ""),
        password: config.arca_password,
        filters: {
          t: tipoConsulta,
          fechaEmision: `${fromDate} - ${toDate}`,
          ...(config.punto_venta && tipoConsulta === "E"
            ? { puntosVenta: [String(config.punto_venta)] }
            : {}),
        },
      });

      automationIds.push({
        tipo: tipoConsulta,
        automationId: result.automationId,
      });
    }

    return jsonResponse({
      success: true,
      syncRunId,
      automationIds,
      fechaDesde: desde,
      fechaHasta: hasta,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
