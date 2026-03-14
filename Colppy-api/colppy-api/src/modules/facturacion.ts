// ============================================================
// Módulo: Facturación (Ventas y Compras)
// ============================================================

import type { ColppyClient } from "../client";
import type {
  FacturaVentaParams,
  FacturaCompraParams,
  ListParams,
} from "../types";

export class FacturacionModule {
  constructor(private client: ColppyClient) {}

  // ===========================================================
  // FACTURAS DE VENTA
  // ===========================================================

  /**
   * Lista facturas de venta con paginación y filtros.
   *
   * @example
   * const facturas = await colppy.facturacion.listarVentas({
   *   filter: [{ field: "fechaFactura", op: ">=", value: "2025-01-01" }],
   *   order: [{ field: "fechaFactura", dir: "desc" }],
   *   limit: 100,
   * });
   */
  async listarVentas(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("FacturaVenta", "listar_facturasventa", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /** Lee una factura de venta por ID */
  async leerVenta(idFactura: string, idEmpresa?: string) {
    return this.client.execute("FacturaVenta", "leer_facturaventa", {
      idFactura,
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  /**
   * Crea una nueva factura de venta.
   *
   * Importante: el total debe cumplir:
   *   importeTotal = netoGravado + netoNoGravado + totalIVA + percepcionIVA + percepcionIIBB
   *
   * @example
   * await colppy.facturacion.crearVenta({
   *   idCliente: "123",
   *   idEmpresa: "98",
   *   idTipoFactura: "B",
   *   fechaFactura: "2025-06-15",
   *   ItemsFactura: [
   *     {
   *       Descripcion: "Servicio de consultoría",
   *       Cantidad: 1,
   *       ImporteUnitario: 50000,
   *       idPlanCuenta: "401",
   *     }
   *   ],
   * });
   */
  async crearVenta(data: FacturaVentaParams) {
    return this.client.execute("FacturaVenta", "alta_facturaventa", {
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }

  /** Edita una factura de venta existente */
  async editarVenta(
    idFactura: string,
    data: Partial<FacturaVentaParams> & { idEmpresa?: string }
  ) {
    return this.client.execute("FacturaVenta", "editar_facturaventa", {
      idFactura,
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }

  /** Lee datos adicionales de una factura de venta */
  async leerDatosAdicionalesVenta(idFactura: string, idEmpresa?: string) {
    return this.client.execute("FacturaVenta", "leer_factura_datosadicionales", {
      idFactura,
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  // ===========================================================
  // FACTURAS DE COMPRA
  // ===========================================================

  /**
   * Lista facturas de compra.
   *
   * @example
   * const compras = await colppy.facturacion.listarCompras({ limit: 50 });
   */
  async listarCompras(params?: ListParams & { idEmpresa?: string }) {
    return this.client.execute("FacturaCompra", "listar_facturascompra", {
      idEmpresa: params?.idEmpresa ?? this.client.defaultIdEmpresa,
      start: params?.start ?? 0,
      limit: params?.limit ?? 50,
      filter: params?.filter ?? [],
      order: params?.order ?? [],
    });
  }

  /** Lee una factura de compra por ID */
  async leerCompra(idFactura: string, idEmpresa?: string) {
    return this.client.execute("FacturaCompra", "leer_facturacompra", {
      idFactura,
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  /**
   * Crea una nueva factura de compra.
   *
   * @example
   * await colppy.facturacion.crearCompra({
   *   idProveedor: "456",
   *   idEmpresa: "98",
   *   idTipoFactura: "A",
   *   fechaFactura: "2025-06-10",
   *   nroFactura1: "0001",
   *   nroFactura2: "00000123",
   *   ItemsFactura: [
   *     {
   *       Descripcion: "Materiales de oficina",
   *       Cantidad: 10,
   *       ImporteUnitario: 1500,
   *       idPlanCuenta: "501",
   *     }
   *   ],
   * });
   */
  async crearCompra(data: FacturaCompraParams) {
    return this.client.execute("FacturaCompra", "alta_facturacompra", {
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }

  /** Edita una factura de compra existente */
  async editarCompra(
    idFactura: string,
    data: Partial<FacturaCompraParams> & { idEmpresa?: string }
  ) {
    return this.client.execute("FacturaCompra", "editar_facturacompra", {
      idFactura,
      idEmpresa: data.idEmpresa ?? this.client.defaultIdEmpresa,
      ...data,
    });
  }

  /** Lee datos adicionales de una factura de compra */
  async leerDatosAdicionalesCompra(idFactura: string, idEmpresa?: string) {
    return this.client.execute(
      "FacturaCompra",
      "leer_factura_datosadicionales",
      {
        idFactura,
        idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
      }
    );
  }

  // ===========================================================
  // TALONARIOS
  // ===========================================================

  /** Lista los talonarios disponibles para una empresa */
  async listarTalonarios(idEmpresa?: string) {
    return this.client.execute("Talonario", "listar_talonarios", {
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  /** Lee un talonario específico */
  async leerTalonario(idTalonario: string, idEmpresa?: string) {
    return this.client.execute("Talonario", "leer_talonario", {
      idTalonario,
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }

  // ===========================================================
  // IVA
  // ===========================================================

  /** Lista los tipos de IVA disponibles */
  async listarTiposIva(idEmpresa?: string) {
    return this.client.execute("TipoIva", "listar_tiposiva", {
      idEmpresa: idEmpresa ?? this.client.defaultIdEmpresa,
    });
  }
}
