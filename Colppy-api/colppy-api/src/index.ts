// ============================================================
// Colppy API - Módulo Principal
// ============================================================
// SDK para INYECTAR datos en Colppy desde tu aplicación Next.js.
// Permite: crear facturas, cargar clientes/proveedores, registrar
// sueldos, crear asientos contables, y más.
//
// USO:
//   import { createColppy } from "./colppy-api/src";
//   const colppy = createColppy({ ... });
//   await colppy.facturacion.crearVenta({ ... });
// ============================================================

import { ColppyClient, ColppyError } from "./client";
import { ClientesModule } from "./modules/clientes";
import { ProveedoresModule } from "./modules/proveedores";
import { FacturacionModule } from "./modules/facturacion";
import { ContabilidadModule } from "./modules/contabilidad";
import { EmpresaModule } from "./modules/empresa";
import { TesoreriaModule } from "./modules/tesoreria";
import type { ColppyConfig } from "./types";

export class Colppy {
  /** Cliente HTTP base con manejo de sesión */
  readonly raw: ColppyClient;

  /** Crear y gestionar clientes en Colppy */
  readonly clientes: ClientesModule;

  /** Crear y gestionar proveedores en Colppy */
  readonly proveedores: ProveedoresModule;

  /** Crear facturas de venta y compra en Colppy */
  readonly facturacion: FacturacionModule;

  /** Crear asientos, consultar plan de cuentas */
  readonly contabilidad: ContabilidadModule;

  /** Gestionar datos de empresa */
  readonly empresa: EmpresaModule;

  /** Registrar cobros y pagos */
  readonly tesoreria: TesoreriaModule;

  constructor(config: ColppyConfig) {
    this.raw = new ColppyClient(config);
    this.clientes = new ClientesModule(this.raw);
    this.proveedores = new ProveedoresModule(this.raw);
    this.facturacion = new FacturacionModule(this.raw);
    this.contabilidad = new ContabilidadModule(this.raw);
    this.empresa = new EmpresaModule(this.raw);
    this.tesoreria = new TesoreriaModule(this.raw);
  }

  /** Inicia sesión manualmente (se hace automáticamente en cada llamada) */
  async login() {
    return this.raw.login();
  }

  /** Cierra la sesión */
  async logout() {
    return this.raw.logout();
  }

  /**
   * Ejecuta una operación custom directamente.
   * Útil para provisiones/operaciones no cubiertas por los módulos.
   *
   * @example
   * await colppy.execute("MiProvision", "mi_operacion", { dato: "valor" });
   */
  async execute<T = any>(
    provision: string,
    operacion: string,
    params?: Record<string, any>
  ) {
    return this.raw.execute<T>(provision, operacion, params);
  }
}

/**
 * Factory function — forma recomendada de crear la instancia.
 *
 * @example
 * import { createColppy } from "@/lib/colppy-api";
 *
 * const colppy = createColppy({
 *   apiUser: "MiAppColppy",
 *   apiPasswordMD5: "md5delpasswordapi",
 *   userEmail: "usuario@empresa.com",
 *   userPasswordMD5: "md5delpasswordUsuario",
 *   defaultIdEmpresa: "98",
 * });
 */
export function createColppy(config: ColppyConfig): Colppy {
  return new Colppy(config);
}

// Re-exports
export { ColppyClient, ColppyError } from "./client";
export { ClientesModule } from "./modules/clientes";
export { ProveedoresModule } from "./modules/proveedores";
export { FacturacionModule } from "./modules/facturacion";
export { ContabilidadModule } from "./modules/contabilidad";
export { EmpresaModule } from "./modules/empresa";
export { TesoreriaModule } from "./modules/tesoreria";
export type * from "./types";
