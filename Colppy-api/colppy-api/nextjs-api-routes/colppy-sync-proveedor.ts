// ============================================================
// API Route: POST /api/colppy/sync-proveedor
// ============================================================
// Inyecta un proveedor de tu sistema en Colppy.
// Si ya existe (por CUIT), lo actualiza.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getColppy } from "@/lib/colppy-api/src/config";

interface ProveedorSyncPayload {
  razonSocial: string;
  nombreFantasia?: string;
  cuit?: string;
  idTipoDocumento?: string;
  nroDocumento?: string;
  idCondicionIva?: string;
  idCondicionCompra?: string;
  domicilio?: string;
  idProvincia?: string;
  codigoPostal?: string;
  localidad?: string;
  telefono?: string;
  email?: string;
  idPlanCuenta?: string;
  idEmpresa?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: ProveedorSyncPayload = await request.json();
    const colppy = getColppy();

    // Verificar si ya existe por CUIT
    let existingProveedor = null;
    if (payload.cuit) {
      try {
        const search = await colppy.proveedores.buscarPorCUIT(
          payload.cuit,
          payload.idEmpresa
        );
        if (search && Array.isArray(search) && search.length > 0) {
          existingProveedor = search[0];
        }
      } catch {
        // No existe
      }
    }

    const proveedorData = {
      info_general: {
        idEmpresa: payload.idEmpresa ?? "",
        RazonSocial: payload.razonSocial,
        NombreFantasia: payload.nombreFantasia,
        CUIT: payload.cuit,
        idTipoDocumento: payload.idTipoDocumento,
        NroDocumento: payload.nroDocumento,
        idCondicionIva: payload.idCondicionIva,
        idCondicionCompra: payload.idCondicionCompra,
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

    if (existingProveedor?.idProveedor) {
      result = await colppy.proveedores.editar(
        existingProveedor.idProveedor,
        proveedorData
      );
      action = "actualizado";
    } else {
      result = await colppy.proveedores.crear(proveedorData);
      action = "creado";
    }

    return NextResponse.json({
      success: true,
      action,
      data: result,
      message: `Proveedor ${action} exitosamente en Colppy`,
    });
  } catch (error: any) {
    console.error("[colppy/sync-proveedor] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? "Error sincronizando proveedor con Colppy",
        code: error.code,
      },
      { status: 500 }
    );
  }
}
