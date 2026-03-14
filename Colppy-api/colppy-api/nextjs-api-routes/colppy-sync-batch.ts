// ============================================================
// API Route: POST /api/colppy/sync-batch
// ============================================================
// Inyecta múltiples registros en lote a Colppy.
// Útil para sincronizar masivamente facturas, clientes, etc.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getColppy } from "@/lib/colppy-api/src/config";

interface BatchItem {
  /** Tipo de operación */
  tipo: "factura-venta" | "factura-compra" | "cliente" | "proveedor" | "asiento";
  /** Datos de la operación (según el tipo) */
  datos: Record<string, any>;
  /** ID de referencia en tu sistema (para tracking) */
  refId?: string;
}

interface BatchSyncPayload {
  items: BatchItem[];
  /** Si true, se detiene ante el primer error. Default: false */
  stopOnError?: boolean;
  idEmpresa?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: BatchSyncPayload = await request.json();
    const colppy = getColppy();
    const idEmpresa = payload.idEmpresa;

    const results: {
      refId?: string;
      tipo: string;
      success: boolean;
      data?: any;
      error?: string;
    }[] = [];

    for (const item of payload.items) {
      try {
        let data;

        switch (item.tipo) {
          case "factura-venta":
            data = await colppy.facturacion.crearVenta({
              idEmpresa: idEmpresa ?? "",
              ...item.datos,
            } as any);
            break;

          case "factura-compra":
            data = await colppy.facturacion.crearCompra({
              idEmpresa: idEmpresa ?? "",
              ...item.datos,
            } as any);
            break;

          case "cliente":
            data = await colppy.clientes.crear({
              info_general: {
                idEmpresa: idEmpresa ?? "",
                ...item.datos,
              },
            } as any);
            break;

          case "proveedor":
            data = await colppy.proveedores.crear({
              info_general: {
                idEmpresa: idEmpresa ?? "",
                ...item.datos,
              },
            } as any);
            break;

          case "asiento":
            data = await colppy.contabilidad.crearAsiento({
              idEmpresa: idEmpresa ?? "",
              ...item.datos,
            } as any);
            break;

          default:
            throw new Error(`Tipo de operación no soportado: ${item.tipo}`);
        }

        results.push({
          refId: item.refId,
          tipo: item.tipo,
          success: true,
          data,
        });
      } catch (error: any) {
        results.push({
          refId: item.refId,
          tipo: item.tipo,
          success: false,
          error: error.message,
        });

        if (payload.stopOnError) {
          break;
        }
      }
    }

    const exitosos = results.filter((r) => r.success).length;
    const fallidos = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: fallidos === 0,
      resumen: {
        total: results.length,
        exitosos,
        fallidos,
      },
      results,
      message: `Batch: ${exitosos} exitosos, ${fallidos} fallidos de ${results.length} total`,
    });
  } catch (error: any) {
    console.error("[colppy/sync-batch] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? "Error en sincronización batch con Colppy",
        code: error.code,
      },
      { status: 500 }
    );
  }
}
