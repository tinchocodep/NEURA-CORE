// ============================================================
// Módulo: Contabilidad (Plan de Cuentas, Asientos, Diario)
// ============================================================

import type { ColppyClient } from "../client";
import type { AsientoManual, ListParams } from "../types";

export class ContabilidadModule {
  constructor(private client: ColppyClient) {}

  // ===========================================================
  // PLAN DE CUENTAS
  // ===========================================================

  /**
   * Lista las cuentas del plan de cuentas de una empresa.
   *
   * @example
   * const cuentas = await colppy.contabilidad.listarCuentas();
   */
  async listarCuentas(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("PlanCuenta", "listar_cuentas", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 200,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /**
   * Lista las cuentas asentables (que se pueden usar en asientos).
   */
  async listarCuentasAsentables(idEmpresa?: string) {
    return this.client.execute("PlanCuenta", "listar_cuentasAsentables", {
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  // ===========================================================
  // ASIENTOS MANUALES
  // ===========================================================

  /**
   * Lista asientos manuales.
   *
   * @example
   * const asientos = await colppy.contabilidad.listarAsientos({
   *   filter: [{ field: "fechaAsiento", op: ">=", value: "2025-01-01" }],
   * });
   */
  async listarAsientos(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute(
      "AsientoManual",
      "listar_asientosmanuales",
      {
        idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
        start: params?.start ?? 0,
        limit: params?.limit ?? 50,
        filter: params?.filter ?? [],
        order: params?.order ?? [],
      }
    );
  }

  /**
   * Crea un asiento manual.
   *
   * @example
   * await colppy.contabilidad.crearAsiento({
   *   idEmpresa: "98",
   *   fechaAsiento: "2025-06-15",
   *   descripcion: "Ajuste contable",
   *   items: [
   *     { idPlanCuenta: "100", debe: 10000, haber: 0 },
   *     { idPlanCuenta: "200", debe: 0, haber: 10000 },
   *   ],
   * });
   */
  async crearAsiento(data: AsientoManual) {
    return this.client.execute("AsientoManual", "alta_asientomanual", {
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }

  // ===========================================================
  // MOVIMIENTOS DEL DIARIO
  // ===========================================================

  /**
   * Lista movimientos del libro diario con filtro de fechas.
   *
   * @example
   * const movimientos = await colppy.contabilidad.listarMovimientosDiario({
   *   fromDate: "2025-01-01",
   *   toDate: "2025-06-30",
   * });
   */
  async listarMovimientosDiario(params?: {
    idEmpresa?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    return this.client.execute(
      "MovimientoDiario",
      "listar_movimientosdiario",
      {
        idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
        fromDate: params?.fromDate,
        toDate: params?.toDate,
      }
    );
  }

  /**
   * Lista las cuentas del diario.
   */
  async listarCuentasDiario(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("CuentaDiario", "listar_cuentasdiario", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 200,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }
}
