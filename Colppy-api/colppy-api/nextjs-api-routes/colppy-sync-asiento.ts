// ============================================================
// API Route: POST /api/colppy/sync-asiento
// ============================================================
// Inyecta un asiento contable en Colppy (ej: liquidación de
// sueldos, ajustes, etc.)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getColppy } from "@/lib/colppy-api/src/config";

interface AsientoSyncPayload {
  /** Fecha del asiento YYYY-MM-DD */
  fecha: string;
  /** Descripción / concepto */
  descripcion: string;
  /** Líneas del asiento (debe = haber para que cuadre) */
  lineas: {
    idPlanCuenta: string;
    debe: number;
    haber: number;
    descripcion?: string;
  }[];
  /** ID de empresa */
  idEmpresa?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: AsientoSyncPayload = await request.json();

    // Validar que el asiento cuadre (total debe = total haber)
    const totalDebe = payload.lineas.reduce((sum, l) => sum + l.debe, 0);
    const totalHaber = payload.lineas.reduce((sum, l) => sum + l.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `El asiento no cuadra. Debe: ${totalDebe}, Haber: ${totalHaber}`,
        },
        { status: 400 }
      );
    }

    const colppy = getColppy();

    const result = await colppy.contabilidad.crearAsiento({
      idEmpresa: payload.idEmpresa ?? "",
      fechaAsiento: payload.fecha,
      descripcion: payload.descripcion,
      items: payload.lineas,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: "Asiento contable inyectado exitosamente en Colppy",
    });
  } catch (error: any) {
    console.error("[colppy/sync-asiento] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? "Error inyectando asiento en Colppy",
        code: error.code,
      },
      { status: 500 }
    );
  }
}
