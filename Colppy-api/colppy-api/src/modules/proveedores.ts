// ============================================================
// Módulo: Proveedores
// ============================================================

import type { ColppyClient } from "../client";
import type { ProveedorData, ListParams } from "../types";

export class ProveedoresModule {
  constructor(private client: ColppyClient) {}

  /**
   * Lista proveedores de una empresa.
   *
   * @example
   * const proveedores = await colppy.proveedores.listar({ limit: 100 });
   */
  async listar(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("Proveedor", "listar_proveedor", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /** Lee un proveedor específico por ID */
  async leer(idProveedor: string, idEmpresa?: string) {
    return this.client.execute("Proveedor", "leer_proveedor", {
      idProveedor,
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  /**
   * Da de alta un nuevo proveedor.
   *
   * @example
   * await colppy.proveedores.crear({
   *   info_general: {
   *     idEmpresa: "98",
   *     RazonSocial: "Proveedor SRL",
   *     CUIT: "30-87654321-0",
   *     idCondicionIva: "1",
   *   }
   * });
   */
  async crear(data: ProveedorData) {
    const idEmpresa = data.info_general.idEmpresa ?? this.client.defaultIdEmpresa;
    return this.client.execute("Proveedor", "alta_proveedor", {
      idEmpresa,
      info_general: {
        ...data.info_general,
        idEmpresa,
      },
      ...data,
    });
  }

  /** Edita un proveedor existente */
  async editar(idProveedor: string, data: Partial<ProveedorData>) {
    const idEmpresa =
      data.info_general?.idEmpresa ?? this.client.defaultIdEmpresa;
    return this.client.execute("Proveedor", "editar_proveedor", {
      idProveedor,
      idEmpresa,
      ...data,
    });
  }

  /** Busca proveedores por razón social */
  async buscarPorRazonSocial(razonSocial: string, idEmpresa?: string, limit = 20) {
    return this.listar({
      idEmpresa,
      limit,
      filter: [{ field: "RazonSocial", op: "like", value: razonSocial }],
    });
  }

  /** Busca proveedor por CUIT */
  async buscarPorCUIT(cuit: string, idEmpresa?: string) {
    return this.listar({
      idEmpresa,
      limit: 1,
      filter: [{ field: "CUIT", op: "=", value: cuit }],
    });
  }
}
