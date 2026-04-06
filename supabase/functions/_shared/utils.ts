// ============================================================
// Shared utilities for NeuraCore Edge Functions
// ============================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Supabase client (service role, bypasses RLS) ---

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

// --- CORS headers ---

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function corsResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

// --- JSON response helper ---

export function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

// --- AFIP types & constants ---

export const TIPOS_COMPROBANTE_AFIP: Record<string, string> = {
  "1": "Factura A",
  "2": "Nota de Débito A",
  "3": "Nota de Crédito A",
  "6": "Factura B",
  "7": "Nota de Débito B",
  "8": "Nota de Crédito B",
  "11": "Factura C",
  "12": "Nota de Débito C",
  "13": "Nota de Crédito C",
  "51": "Factura M",
  "201": "Factura de Crédito Electrónica A",
};

/** Parse AFIP-style numbers: "1.234,56" → 1234.56 */
export function parseAFIPNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

/** Convert DD/MM/YYYY → YYYY-MM-DD. Passes through YYYY-MM-DD unchanged. */
export function formatDate(d: string): string {
  if (!d) return "";
  if (d.includes("-")) return d;
  const [dd, mm, yyyy] = d.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert YYYY-MM-DD → DD/MM/YYYY (for AFIP SDK filters) */
export function toAfipDate(d: string): string {
  if (!d) return "";
  const [yyyy, mm, dd] = d.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/** Format number as ARS currency */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(n);
}

/** Normalize numero_comprobante: pad punto_venta (5) and numero (8) */
export function normalizeNumeroComprobante(pv: string, num: string): string {
  return `${pv.padStart(5, "0")}-${num.padStart(8, "0")}`;
}

// --- Sync run helpers ---

export interface SyncRunInput {
  tenantId: string;
  runType: string;
  triggeredBy?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export async function createSyncRun(
  supabase: SupabaseClient,
  input: SyncRunInput
): Promise<string> {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      tenant_id: input.tenantId,
      run_type: input.runType,
      status: "running",
      triggered_by: input.triggeredBy || "manual",
      fecha_desde: input.fechaDesde || null,
      fecha_hasta: input.fechaHasta || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create sync_run: ${error.message}`);
  return data.id;
}

export async function completeSyncRun(
  supabase: SupabaseClient,
  runId: string,
  result: {
    status: "success" | "error" | "partial";
    records_imported?: number;
    records_updated?: number;
    records_skipped?: number;
    records_failed?: number;
    error_messages?: string[];
    result_summary?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase
    .from("sync_runs")
    .update({
      status: result.status,
      records_imported: result.records_imported ?? 0,
      records_updated: result.records_updated ?? 0,
      records_skipped: result.records_skipped ?? 0,
      records_failed: result.records_failed ?? 0,
      error_messages: result.error_messages ?? [],
      result_summary: result.result_summary ?? {},
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}
