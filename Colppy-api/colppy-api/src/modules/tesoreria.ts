// ============================================================
// Módulo: Tesorería (Cobros y Pagos)
// ============================================================

import type { ColppyClient } from "../client";
import type { CobroParams, PagoParams, ListParams } from "../types";

export class TesoreriaModule {
  constructor(private client: ColppyClient) {}

  // ===========================================================
  // COBROS (a clientes)
  // ===========================================================

  /** Lista cobros realizados */
  async listarCobros(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("Tesoreria", "listar_cobros", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /** Registra un nuevo cobro */
  async crearCobro(data: CobroParams) {
    return this.client.execute("Tesoreria", "alta_cobro", {
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }

  // ===========================================================
  // PAGOS (a proveedores)
  // ===========================================================

  /** Lista pagos realizados */
  async listarPagos(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("Tesoreria", "listar_pagos", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /** Registra un nuevo pago */
  async crearPago(data: PagoParams) {
    return this.client.execute("Tesoreria", "alta_pago", {
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }
}
