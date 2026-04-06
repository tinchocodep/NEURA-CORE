// ============================================================
// AFIP SDK communication helpers
// ============================================================
// Extracted from src/modules/contable/Comprobantes/index.tsx
// and src/modules/agro/ConciliacionComprobantes.tsx
//
// In Edge Functions, we only CREATE the automation and return
// the automationId. The polling is done by n8n (because AFIP
// can take up to 5 minutes and Edge Functions have short timeouts).
// ============================================================

const AFIPSDK_BASE_URL = "https://app.afipsdk.com/api/v1/automations";

function getApiKey(): string {
  const key = Deno.env.get("AFIPSDK_API_KEY");
  if (!key) throw new Error("AFIPSDK_API_KEY not configured in Supabase secrets");
  return key;
}

export interface AfipAutomationParams {
  cuit: string;
  username: string;
  password: string;
  filters: {
    t: "E" | "R";
    fechaEmision: string;
    puntosVenta?: string[];
  };
}

export interface AfipAutomationResult {
  automationId: string;
}

/**
 * Creates an AFIP SDK automation for "mis-comprobantes".
 * Returns the automationId for polling.
 * Does NOT poll — that's n8n's job.
 */
export async function createAfipAutomation(
  params: AfipAutomationParams
): Promise<AfipAutomationResult> {
  const apiKey = getApiKey();

  const res = await fetch(AFIPSDK_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      automation: "mis-comprobantes",
      params,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AFIP SDK error creating automation: ${err}`);
  }

  const created = await res.json();
  const automationId = created.id;
  if (!automationId) {
    throw new Error("AFIP SDK no devolvió ID de automatización");
  }

  return { automationId };
}

/**
 * Polls an AFIP SDK automation to check if it's complete.
 * Returns { status, data } — n8n uses this in a loop.
 */
export async function pollAfipAutomation(
  automationId: string
): Promise<{ status: string; data?: unknown[]; message?: string }> {
  const apiKey = getApiKey();

  const res = await fetch(`${AFIPSDK_BASE_URL}/${automationId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    return { status: "error", message: `HTTP ${res.status}` };
  }

  const result = await res.json();
  return {
    status: result.status,
    data: result.data,
    message: result.message,
  };
}
