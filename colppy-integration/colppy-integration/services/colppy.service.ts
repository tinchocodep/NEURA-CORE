// ============================================================
// ColppyService — Servicio de integración con Colppy
// ============================================================
// Se integra en NeuraCore como servicio multi-tenant.
// Las credenciales se leen de Supabase (encriptadas) y las
// llamadas a Colppy se hacen via Edge Function (proxy seguro).
//
// Arquitectura:
//   Frontend → ColppyService → Supabase Edge Function → Colppy API
//
// Esto evita exponer credenciales en el frontend.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

// --- Tipos ---

export interface ColppyCredentials {
  /** Email del usuario de Colppy */
  userEmail: string;
  /** Password del usuario (se convierte a MD5 antes de guardar) */
  userPasswordMD5: string;
  /** ID de empresa en Colppy */
  idEmpresa: string;
  /** Usuario de API dev (registrado en dev.colppy.com) — compartido o por tenant */
  apiUser?: string;
  /** Password de API dev en MD5 */
  apiPasswordMD5?: string;
}

export interface ColppyIntegrationConfig {
  /** Ambiente: production o staging */
  environment: "production" | "staging";
  /** Mapeo de cuentas contables de NeuraCore → Colppy */
  accountMapping?: Record<string, string>;
  /** Mapeo de condiciones IVA */
  ivaMapping?: Record<string, string>;
}

export interface SyncResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  colppyId?: string;
}

export interface SyncBatchResult {
  total: number;
  exitosos: number;
  fallidos: number;
  resultados: SyncResult[];
}

// --- Servicio ---

export class ColppyService {
  private supabase: SupabaseClient;
  private tenantId: string;

  constructor(supabase: SupabaseClient, tenantId: string) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  // ===========================================================
  // CONFIGURACIÓN
  // ===========================================================

  /**
   * Guarda las credenciales de Colppy para este tenant.
   * Se encriptan en Supabase antes de guardarse.
   */
  async saveCredentials(
    credentials: ColppyCredentials,
    config?: Partial<ColppyIntegrationConfig>
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc(
      "save_integration_credentials",
      {
        p_tenant_id: this.tenantId,
        p_provider: "colppy",
        p_credentials: credentials,
        p_config: {
          environment: config?.environment ?? "production",
          accountMapping: config?.accountMapping ?? {},
          ivaMapping: config?.ivaMapping ?? {},
        },
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Verifica si la integración con Colppy está activa para este tenant.
   */
  async isActive(): Promise<boolean> {
    const { data } = await this.supabase
      .from("tenant_integrations")
      .select("status")
      .eq("tenant_id", this.tenantId)
      .eq("provider", "colppy")
      .single();

    return data?.status === "active";
  }

  /**
   * Obtiene la configuración (no las credenciales) de la integración.
   */
  async getConfig(): Promise<ColppyIntegrationConfig | null> {
    const { data } = await this.supabase
      .from("tenant_integrations")
      .select("config, status, last_sync_at, last_sync_status")
      .eq("tenant_id", this.tenantId)
      .eq("provider", "colppy")
      .single();

    return data?.config ?? null;
  }

  /**
   * Desactiva la integración con Colppy.
   */
  async disable(): Promise<void> {
    await this.supabase
      .from("tenant_integrations")
      .update({ status: "disabled" })
      .eq("tenant_id", this.tenantId)
      .eq("provider", "colppy");
  }

  /**
   * Prueba la conexión con Colppy usando las credenciales guardadas.
   */
  async testConnection(): Promise<{
    success: boolean;
    empresas?: any[];
    error?: string;
  }> {
    return this.callEdgeFunction("test-connection", {});
  }

  // ===========================================================
  // SYNC: CLIENTES
  // ===========================================================

  /**
   * Sincroniza un cliente de NeuraCore → Colppy.
   */
  async syncCliente(cliente: {
    razonSocial: string;
    nombreFantasia?: string;
    cuit?: string;
    tipoDocumento?: string;
    nroDocumento?: string;
    condicionIva?: string;
    condicionVenta?: string;
    domicilio?: string;
    provincia?: string;
    codigoPostal?: string;
    localidad?: string;
    telefono?: string;
    email?: string;
    /** ID del cliente en NeuraCore (para tracking) */
    neuraCoreId?: string;
  }): Promise<SyncResult> {
    return this.callEdgeFunction("sync-cliente", cliente);
  }

  /**
   * Sincroniza múltiples clientes en lote.
   */
  async syncClientesBatch(
    clientes: Parameters<typeof this.syncCliente>[0][]
  ): Promise<SyncBatchResult> {
    return this.callEdgeFunction("sync-batch", {
      tipo: "clientes",
      items: clientes,
    });
  }

  // ===========================================================
  // SYNC: PROVEEDORES
  // ===========================================================

  /**
   * Sincroniza un proveedor de NeuraCore → Colppy.
   */
  async syncProveedor(proveedor: {
    razonSocial: string;
    nombreFantasia?: string;
    cuit?: string;
    tipoDocumento?: string;
    nroDocumento?: string;
    condicionIva?: string;
    condicionCompra?: string;
    domicilio?: string;
    provincia?: string;
    codigoPostal?: string;
    localidad?: string;
    telefono?: string;
    email?: string;
    neuraCoreId?: string;
  }): Promise<SyncResult> {
    return this.callEdgeFunction("sync-proveedor", proveedor);
  }

  // ===========================================================
  // SYNC: COMPROBANTES / FACTURAS
  // ===========================================================

  /**
   * Sincroniza un comprobante de NeuraCore → Colppy.
   * Funciona tanto para facturas de venta como de compra.
   */
  async syncComprobante(comprobante: {
    /** "venta" o "compra" */
    tipo: "venta" | "compra";
    /** ID del cliente o proveedor en COLPPY */
    idEntidadColppy: string;
    /** Tipo de comprobante: A, B, C, E, M */
    tipoComprobante: "A" | "B" | "C" | "E" | "M";
    /** Fecha YYYY-MM-DD */
    fecha: string;
    /** Punto de venta (para compras) */
    puntoVenta?: string;
    /** Número de comprobante (para compras) */
    nroComprobante?: string;
    /** ID talonario en Colppy (para ventas) */
    idTalonario?: string;
    /** Neto gravado */
    netoGravado: number;
    /** Neto no gravado */
    netoNoGravado?: number;
    /** Total IVA */
    totalIVA: number;
    /** Percepciones */
    percepcionIVA?: number;
    percepcionIIBB?: number;
    /** Total */
    importeTotal: number;
    /** Líneas de detalle */
    items: {
      descripcion: string;
      cantidad: number;
      precioUnitario: number;
      /** Cuenta contable en Colppy */
      idPlanCuenta?: string;
      idTipoIva?: string;
    }[];
    comentario?: string;
    /** ID en NeuraCore para tracking */
    neuraCoreId?: string;
  }): Promise<SyncResult> {
    return this.callEdgeFunction("sync-comprobante", comprobante);
  }

  /**
   * Sincroniza múltiples comprobantes en lote.
   */
  async syncComprobantesBatch(
    comprobantes: Parameters<typeof this.syncComprobante>[0][]
  ): Promise<SyncBatchResult> {
    return this.callEdgeFunction("sync-batch", {
      tipo: "comprobantes",
      items: comprobantes,
    });
  }

  // ===========================================================
  // SYNC: ASIENTOS CONTABLES (incluye sueldos)
  // ===========================================================

  /**
   * Sincroniza un asiento contable de NeuraCore → Colppy.
   */
  async syncAsiento(asiento: {
    fecha: string;
    descripcion: string;
    lineas: {
      idPlanCuenta: string;
      debe: number;
      haber: number;
      descripcion?: string;
    }[];
    neuraCoreId?: string;
  }): Promise<SyncResult> {
    return this.callEdgeFunction("sync-asiento", asiento);
  }

  /**
   * Sincroniza una liquidación de sueldos como asiento contable.
   * Convierte los datos de liquidación en un asiento con las
   * cuentas contables configuradas.
   */
  async syncSueldos(sueldos: {
    periodo: string;
    fechaAsiento: string;
    empleados: {
      nombre: string;
      bruto: number;
      aportesEmpleado: number;
      contribucionesPatronales: number;
      neto: number;
    }[];
    /** Cuentas contables de Colppy para el asiento */
    cuentas: {
      gastoSueldos: string;
      cargasSociales: string;
      sueldosAPagar: string;
      retencionesADepositar: string;
      contribucionesADepositar: string;
    };
  }): Promise<SyncResult> {
    return this.callEdgeFunction("sync-sueldos", sueldos);
  }

  // ===========================================================
  // SYNC: TESORERÍA
  // ===========================================================

  /**
   * Sincroniza un cobro o pago de tesorería → Colppy.
   */
  async syncMovimientoTesoreria(movimiento: {
    tipo: "cobro" | "pago";
    idEntidadColppy: string;
    fecha: string;
    importeTotal: number;
    items: {
      idFactura: string;
      importeAplicado: number;
    }[];
    neuraCoreId?: string;
  }): Promise<SyncResult> {
    return this.callEdgeFunction("sync-tesoreria", movimiento);
  }

  // ===========================================================
  // LECTURA (helpers para mapeo)
  // ===========================================================

  /** Lista las empresas del usuario en Colppy (para setup inicial) */
  async listarEmpresas(): Promise<SyncResult> {
    return this.callEdgeFunction("listar", {
      provision: "Empresa",
      operacion: "listar_empresa",
    });
  }

  /** Lista talonarios de la empresa (para config de facturación) */
  async listarTalonarios(): Promise<SyncResult> {
    return this.callEdgeFunction("listar", {
      provision: "Talonario",
      operacion: "listar_talonarios",
    });
  }

  /** Lista plan de cuentas (para mapeo contable) */
  async listarCuentas(): Promise<SyncResult> {
    return this.callEdgeFunction("listar", {
      provision: "PlanCuenta",
      operacion: "listar_cuentas",
    });
  }

  /** Lista tipos de IVA (para mapeo) */
  async listarTiposIva(): Promise<SyncResult> {
    return this.callEdgeFunction("listar", {
      provision: "TipoIva",
      operacion: "listar_tiposiva",
    });
  }

  // ===========================================================
  // LOG DE SINCRONIZACIÓN
  // ===========================================================

  /**
   * Obtiene el historial de sincronizaciones.
   */
  async getSyncHistory(limit = 50) {
    const { data: integration } = await this.supabase
      .from("tenant_integrations")
      .select("id")
      .eq("tenant_id", this.tenantId)
      .eq("provider", "colppy")
      .single();

    if (!integration) return [];

    const { data } = await this.supabase
      .from("integration_sync_log")
      .select("*")
      .eq("integration_id", integration.id)
      .order("started_at", { ascending: false })
      .limit(limit);

    return data ?? [];
  }

  // ===========================================================
  // INTERNO: Llamada a Edge Function
  // ===========================================================

  private async callEdgeFunction<T = any>(
    action: string,
    payload: Record<string, any>
  ): Promise<T> {
    const { data, error } = await this.supabase.functions.invoke(
      "colppy-proxy",
      {
        body: {
          tenantId: this.tenantId,
          action,
          payload,
        },
      }
    );

    if (error) {
      throw new Error(`ColppyService error: ${error.message}`);
    }

    return data as T;
  }
}
