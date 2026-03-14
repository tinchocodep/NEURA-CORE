// ============================================================
// API Route: POST /api/colppy/sync-cliente
// ============================================================
// Recibe datos de un cliente de tu sistema y lo inyecta
// en Colppy. Si ya existe (por CUIT), lo actualiza.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getColppy } from "@/lib/colppy-api/src/config";

interface ClienteSyncPayload {
  /** Razón social */
  razonSocial: string;
  /** Nombre de fantasía */
  nombreFantasia?: string;
  /** CUIT (formato: XX-XXXXXXXX-X) */
  cuit?: string;
  /** Tipo de documento */
  idTipoDocumento?: string;
  /** Número de documento */
  nroDocumento?: string;
  /** Condición de IVA (1=Resp.Inscripto, 4=Exento, 5=Consumidor Final, etc.) */
  idCondicionIva?: string;
  /** Condición de venta */
  idCondicionVenta?: string;
  /** Domicilio */
  domicilio?: string;
  /** Provincia */
  idProvincia?: string;
  /** Código postal */
  codigoPostal?: string;
  /** Localidad */
  localidad?: string;
  /** Teléfono */
  telefono?: string;
  /** Email */
  email?: string;
  /** Cuenta contable asignada */
  idPlanCuenta?: string;
  /** ID de empresa en Colppy */
  idEmpresa?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: ClienteSyncPayload = await request.json();
    const colppy = getColppy();

    // Si tiene CUIT, verificar si ya existe para actualizar en vez de duplicar
    let existingCliente = null;
    if (payload.cuit) {
      try {
        const search = await colppy.clientes.buscarPorCUIT(
          payload.cuit,
          payload.idEmpresa
        );
        if (search && Array.isArray(search) && search.length > 0) {
          existingCliente = search[0];
        }
      } catch {
        // No existe, se crea nuevo
      }
    }

    const clienteData = {
      info_general: {
        idEmpresa: payload.idEmpresa ?? "",
        RazonSocial: payload.razonSocial,
        NombreFantasia: payload.nombreFantasia,
        CUIT: payload.cuit,
        idTipoDocumento: payload.idTipoDocumento,
        NroDocumento: payload.nroDocumento,
        idCondicionIva: payload.idCondicionIva,
        idCondicionVenta: payload.idCondicionVenta,
        Domicilio: payload.domicilio,
        idProvincia: payload.idProvincia,
        CodigoPostal: payload.codigoPostal,
        Localidad: payload.localidad,
        Telefono: payload.telefono,
        Email: payload.email,
        idPlanCuenta: payload.idPlanCuenta,
      },
    };

    let result;
    let action: "creado" | "actualizado";

    if (existingCliente?.idCliente) {
      result = await colppy.clientes.editar(
        existingCliente.idCliente,
        clienteData
      );
      action = "actualizado";
    } else {
      result = await colppy.clientes.crear(clienteData);
      action = "creado";
    }

    return NextResponse.json({
      success: true,
      action,
      data: result,
      message: `Cliente ${action} exitosamente en Colppy`,
    });
  } catch (error: any) {
    console.error("[colppy/sync-cliente] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? "Error sincronizando cliente con Colppy",
        code: error.code,
      },
      { status: 500 }
    );
  }
}
