// ============================================================
// API Route: POST /api/colppy/sync-sueldos
// ============================================================
// Inyecta una liquidación de sueldos como asiento contable
// en Colppy. Recibe los datos ya procesados de tu sistema
// de liquidación y los convierte en asientos.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getColppy } from "@/lib/colppy-api/src/config";

interface SueldoEmpleado {
  nombre: string;
  /** Sueldo bruto */
  bruto: number;
  /** Aportes del empleado (jubilación, obra social, etc.) */
  aportesEmpleado: number;
  /** Contribuciones patronales */
  contribucionesPatronales: number;
  /** Sueldo neto a pagar */
  neto: number;
}

interface SueldosSyncPayload {
  /** Período de liquidación (ej: "2025-06") */
  periodo: string;
  /** Fecha del asiento contable YYYY-MM-DD */
  fechaAsiento: string;
  /** Empleados liquidados */
  empleados: SueldoEmpleado[];

  // Cuentas contables de Colppy para el asiento
  cuentas: {
    /** Cuenta de gasto de sueldos (ej: "5.1.01") */
    gastoSueldos: string;
    /** Cuenta de cargas sociales patronales */
    cargasSociales: string;
    /** Cuenta de sueldos a pagar (pasivo) */
    sueldosAPagar: string;
    /** Cuenta de retenciones y aportes a depositar */
    retencionesADepositar: string;
    /** Cuenta de contribuciones a depositar */
    contribucionesADepositar: string;
  };

  idEmpresa?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: SueldosSyncPayload = await request.json();
    const colppy = getColppy();

    // Calcular totales
    const totalBruto = payload.empleados.reduce((s, e) => s + e.bruto, 0);
    const totalAportes = payload.empleados.reduce(
      (s, e) => s + e.aportesEmpleado,
      0
    );
    const totalContribuciones = payload.empleados.reduce(
      (s, e) => s + e.contribucionesPatronales,
      0
    );
    const totalNeto = payload.empleados.reduce((s, e) => s + e.neto, 0);

    const nombresEmpleados = payload.empleados
      .map((e) => e.nombre)
      .join(", ");

    // Crear asiento contable de sueldos
    // DEBE: Gasto Sueldos (bruto) + Cargas Sociales (contribuciones patronales)
    // HABER: Sueldos a Pagar (neto) + Retenciones a Depositar (aportes) + Contribuciones a Depositar
    const items = [
      {
        idPlanCuenta: payload.cuentas.gastoSueldos,
        debe: totalBruto,
        haber: 0,
        descripcion: `Sueldos ${payload.periodo} - ${nombresEmpleados}`,
      },
      {
        idPlanCuenta: payload.cuentas.cargasSociales,
        debe: totalContribuciones,
        haber: 0,
        descripcion: `Cargas sociales patronales ${payload.periodo}`,
      },
      {
        idPlanCuenta: payload.cuentas.sueldosAPagar,
        debe: 0,
        haber: totalNeto,
        descripcion: `Sueldos netos a pagar ${payload.periodo}`,
      },
      {
        idPlanCuenta: payload.cuentas.retencionesADepositar,
        debe: 0,
        haber: totalAportes,
        descripcion: `Aportes empleados a depositar ${payload.periodo}`,
      },
      {
        idPlanCuenta: payload.cuentas.contribucionesADepositar,
        debe: 0,
        haber: totalContribuciones,
        descripcion: `Contribuciones patronales a depositar ${payload.periodo}`,
      },
    ];

    // Validar que cuadre
    const totalDebe = items.reduce((s, i) => s + i.debe, 0);
    const totalHaber = items.reduce((s, i) => s + i.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `El asiento de sueldos no cuadra. Debe: ${totalDebe}, Haber: ${totalHaber}. Revisá los montos.`,
        },
        { status: 400 }
      );
    }

    const result = await colppy.contabilidad.crearAsiento({
      idEmpresa: payload.idEmpresa ?? "",
      fechaAsiento: payload.fechaAsiento,
      descripcion: `Liquidación de sueldos ${payload.periodo} (${payload.empleados.length} empleados)`,
      items,
    });

    return NextResponse.json({
      success: true,
      data: result,
      resumen: {
        periodo: payload.periodo,
        empleados: payload.empleados.length,
        totalBruto,
        totalAportes,
        totalContribuciones,
        totalNeto,
      },
      message: `Liquidación de sueldos de ${payload.periodo} inyectada exitosamente en Colppy`,
    });
  } catch (error: any) {
    console.error("[colppy/sync-sueldos] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? "Error inyectando sueldos en Colppy",
        code: error.code,
      },
      { status: 500 }
    );
  }
}
