// ============================================================
// IntegrationService — Servicio genérico de integraciones
// ============================================================
// Abstrae la lógica común para cualquier ERP (Colppy, Xubio, etc.)
// Cada tenant elige qué ERP usa y el servicio correcto se instancia.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { ColppyService } from "./colppy.service";

export type ERPProvider = "colppy" | "xubio" | "none";

export interface IntegrationStatus {
  provider: ERPProvider;
  active: boolean;
  lastSync?: string;
  lastSyncStatus?: string;
  config?: Record<string, any>;
}

export class IntegrationService {
  private supabase: SupabaseClient;
  private tenantId: string;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /**
   * Obtiene qué ERP tiene configurado este tenant.
   */
  async getActiveProvider(): Promise<IntegrationStatus | null> {
    const { data } = await this.supabase
      .from("tenant_integrations")
      .select("provider, status, last_sync_at, last_sync_status, config")
      .eq("tenant_id", this.tenantId)
      .eq("status", "active")
      .single();

    if (!data) return null;

    return {
      provider: data.provider as ERPProvider,
      active: data.status === "active",
      lastSync: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
      config: data.config,
    };
  }

  /**
   * Devuelve el servicio del ERP correcto para este tenant.
   * Null si no tiene ninguno configurado.
   */
  async getERPService(): Promise<ColppyService | null> {
    const status = await this.getActiveProvider();
    if (!status?.active) return null;

    switch (status.provider) {
      case "colppy":
        return new ColppyService(this.supabase, this.tenantId);
      // case "xubio":
      //   return new XubioService(this.supabase, this.tenantId);
      default:
        return null;
    }
  }

  /**
   * Obtiene el ColppyService directamente (para cuando sabés que es Colppy).
   */
  getColppy(): ColppyService {
    return new ColppyService(this.supabase, this.tenantId);
  }

  /**
   * Lista todas las integraciones del tenant (activas e inactivas).
   */
  async listIntegrations() {
    const { data } = await this.supabase
      .from("tenant_integrations")
      .select("provider, status, last_sync_at, last_sync_status, config, created_at")
      .eq("tenant_id", this.tenantId)
      .order("created_at", { ascending: false });

    return data ?? [];
  }
}
