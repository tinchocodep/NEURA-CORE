// ============================================================
// API Route: POST /api/colppy/sync-factura
// ============================================================
// Recibe una factura ya procesada en tu sistema y la inyecta
// en Colppy como factura de venta o compra.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getColppy } from "@/lib/colppy-api/src/config";
import { validarTotalFactura } from "@/lib/colppy-api/src/helpers";

interface FacturaSyncPayload {
  /** "venta" o "compra" */
  tipo: "venta" | "compra";

  /** ID del cliente (para venta) o proveedor (para compra) en Colppy */
  idClienteOProveedor: string;

  /** Tipo de comprobante: A, B, C, E, M */
  tipoFactura: "A" | "B" | "C" | "E" | "M";

  /** Fecha de la factura YYYY-MM-DD */
  fecha: string;

  /** Número de factura (parte 1, punto de venta) — requerido para compras */
  nroFactura1?: string;

  /** Número de factura (parte 2, número) — requerido para compras */
  nroFactura2?: string;

  /** ID de talonario en Colppy (para ventas) */
  idTalonario?: string;

  /** Condición de venta/compra */
  idCondicion?: string;

  /** Neto gravado */
  netoGravado: number;

  /** Neto no gravado */
  netoNoGravado?: number;

  /** Total IVA */
  totalIVA: number;

  /** Percepción IVA */
  percepcionIVA?: number;

  /** Percepción IIBB */
  percepcionIIBB?: number;

  /** Importe total de la factura */
  importeTotal: number;

  /** Items/líneas de la factura */
  items: {
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    idPlanCuenta?: string;
    unidadMedida?: string;
    idTipoIva?: string;
  }[];

  /** Comentario u observación */
  comentario?: string;

  /** ID de empresa en Colppy (opcional si hay default) */
  idEmpresa?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: FacturaSyncPayload = await request.json();

    // Validar que el total cuadre
    const check = validarTotalFactura({
      netoGravado: payload.netoGravado,
      netoNoGravado: payload.netoNoGravado,
      totalIVA: payload.totalIVA,
      percepcionIVA: payload.percepcionIVA,
      percepcionIIBB: payload.percepcionIIBB,
      importeTotal: payload.importeTotal,
    });

    if (!check.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `El total no cuadra. Esperado: ${check.expected}, recibido: ${check.actual}`,
        },
        { status: 400 }
      );
    }

    const colppy = getColppy();

    // Convertir items al formato Colppy
    const ItemsFactura = payload.items.map((item) => ({
      Descripcion: item.descripcion,
      Cantidad: item.cantidad,
      ImporteUnitario: item.precioUnitario,
      idPlanCuenta: item.idPlanCuenta ?? "",
      unidadMedida: item.unidadMedida ?? "unidades",
      idTipoIva: item.idTipoIva,
    }));

    let result;

    if (payload.tipo === "venta") {
      result = await colppy.facturacion.crearVenta({
        idCliente: payload.idClienteOProveedor,
        idEmpresa: payload.idEmpresa ?? "",
        idTipoFactura: payload.tipoFactura,
        fechaFactura: payload.fecha,
        idTalonario: payload.idTalonario,
        idCondicionVenta: payload.idCondicion,
        netoGravado: payload.netoGravado,
        netoNoGravado: payload.netoNoGravado ?? 0,
        totalIVA: payload.totalIVA,
        percepcionIVA: payload.percepcionIVA ?? 0,
        percepcionIIBB: payload.percepcionIIBB ?? 0,
        importeTotal: payload.importeTotal,
        ItemsFactura,
        Comentario: payload.comentario,
      });
    } else {
      result = await colppy.facturacion.crearCompra({
        idProveedor: payload.idClienteOProveedor,
        idEmpresa: payload.idEmpresa ?? "",
        idTipoFactura: payload.tipoFactura as "A" | "B" | "C" | "M",
        fechaFactura: payload.fecha,
        nroFactura1: payload.nroFactura1,
        nroFactura2: payload.nroFactura2,
        idCondicionCompra: payload.idCondicion,
        netoGravado: payload.netoGravado,
        netoNoGravado: payload.netoNoGravado ?? 0,
        totalIVA: payload.totalIVA,
        percepcionIVA: payload.percepcionIVA ?? 0,
        percepcionIIBB: payload.percepcionIIBB ?? 0,
        importeTotal: payload.importeTotal,
        ItemsFactura,
        Comentario: payload.comentario,
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Factura de ${payload.tipo} inyectada exitosamente en Colppy`,
    });
  } catch (error: any) {
    console.error("[colppy/sync-factura] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? "Error inyectando factura en Colppy",
        code: error.code,
      },
      { status: 500 }
    );
  }
}
