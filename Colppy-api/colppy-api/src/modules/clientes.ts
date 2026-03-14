// ============================================================
// Módulo: Clientes
// ============================================================

import type { ColppyClient } from "../client";
import type { ClienteData, ClienteInfoGeneral, ListParams } from "../types";

export class ClientesModule {
  constructor(private client: ColppyClient) {}

  /**
   * Lista clientes de una empresa con paginación y filtros.
   *
   * @example
   * const clientes = await colppy.clientes.listar({
   *   start: 0,
   *   limit: 50,
   *   filter: [{ field: "RazonSocial", op: "like", value: "Acme" }],
   *   order: [{ field: "RazonSocial", dir: "asc" }]
   * });
   */
  async listar(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("Cliente", "listar_cliente", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /**
   * Lee los datos de un cliente específico.
   *
   * @example
   * const cliente = await colppy.clientes.leer("12345");
   */
  async leer(idCliente: string, idEmpresa?: string) {
    return this.client.execute("Cliente", "leer_cliente", {
      idCliente,
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  /**
   * Da de alta un nuevo cliente.
   *
   * @example
   * const nuevo = await colppy.clientes.crear({
   *   info_general: {
   *     idEmpresa: "98",
   *     RazonSocial: "Acme S.A.",
   *     NombreFantasia: "Acme",
   *     CUIT: "30-12345678-9",
   *     Email: "contacto@acme.com",
   *     idCondicionIva: "1",
   *   }
   * });
   */
  async crear(data: ClienteData) {
    const idEmpresa = data.info_general.idEmpresa ?? this.client.defaultIdEmpresa;
    return this.client.execute("Cliente", "alta_cliente", {
      idEmpresa,
      info_general: {
        ...data.info_general,
        idEmpresa,
      },
      ...data,
    });
  }

  /**
   * Edita un cliente existente.
   *
   * @example
   * await colppy.clientes.editar("12345", {
   *   info_general: {
   *     idEmpresa: "98",
   *     RazonSocial: "Acme Corp S.A.",
   *     Email: "nuevo@acme.com",
   *   }
   * });
   */
  async editar(idCliente: string, data: Partial<ClienteData>) {
    const idEmpresa =
      data.info_general?.idEmpresa ?? this.client.defaultIdEmpresa;
    return this.client.execute("Cliente", "editar_cliente", {
      idCliente,
      idEmpresa,
      ...data,
    });
  }

  /**
   * Busca clientes por razón social (helper de conveniencia).
   */
  async buscarPorRazonSocial(
    razonSocial: string,
    idEmpresa?: string,
    limit = 20
  ) {
    return this.listar({
      idEmpresa,
      limit,
      filter: [{ field: "RazonSocial", op: "like", value: razonSocial }],
    });
  }

  /**
   * Busca cliente por CUIT.
   */
  async buscarPorCUIT(cuit: string, idEmpresa?: string) {
    return this.listar({
      idEmpresa,
      limit: 1,
      filter: [{ field: "CUIT", op: "=", value: cuit }],
    });
  }
}
