// ============================================================
// Módulo: Empresa
// ============================================================

import type { ColppyClient } from "../client";
import type { EmpresaData, ListParams } from "../types";

export class EmpresaModule {
  constructor(private client: ColppyClient) {}

  /**
   * Lista las empresas asociadas al usuario.
   *
   * @example
   * const empresas = await colppy.empresa.listar();
   */
  async listar(params?: ListParams) {
    return this.client.execute("Empresa", "listar_empresa", {
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /** Lee los datos de una empresa */
  async leer(idEmpresa?: string) {
    return this.client.execute("Empresa", "leer_empresa", {
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  /** Edita los datos de una empresa */
  async editar(data: Partial<EmpresaData>) {
    const idEmpresa = data.idEmpresa ?? this.client.defaultIdEmpresa;
    return this.client.execute("Empresa", "editar_empresa", {
      idEmpresa,
      ...data,
    });
  }
}
