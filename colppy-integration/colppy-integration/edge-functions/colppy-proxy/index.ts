// ============================================================
// Supabase Edge Function: colppy-proxy
// ============================================================
// Proxy seguro que conecta NeuraCore con la API de Colppy.
// Las credenciales NUNCA tocan el frontend — se leen desde
// Supabase (encriptadas) y se usan server-side.
//
// Deploy: supabase functions deploy colppy-proxy
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// --- Constantes ---

const COLPPY_PRODUCTION_URL =
  "https://login.colppy.com/lib/frontera2/service.php";
const COLPPY_STAGING_URL =
  "https://staging.colppy.com/lib/frontera2/service.php";

// Las credenciales de la APP de NeuraCore en dev.colppy.com
// Se guardan como secrets de Supabase Edge Functions:
//   supabase secrets set COLPPY_API_USER=TuAppNeuraCore
//   supabase secrets set COLPPY_API_PASSWORD_MD5=md5hash
const COLPPY_API_USER = Deno.env.get("COLPPY_API_USER") ?? "";
const COLPPY_API_PASSWORD_MD5 = Deno.env.get("COLPPY_API_PASSWORD_MD5") ?? "";

// --- Tipos ---

interface RequestBody {
  tenantId: string;
  action: string;
  payload: Record<string, any>;
}

interface ColppySession {
  usuario: string;
  claveSesion: string;
}

// Cache de sesiones por tenant (en memoria del edge function)
const sessionCache = new Map<
  string,
  { session: ColppySession; expiresAt: number }
>();

// --- Handler principal ---

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { tenantId, action, payload } = body;

    // Crear cliente Supabase con service role (para leer credenciales)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Leer credenciales del tenant (desencriptadas via función PL/pgSQL)
    const { data: credentials, error: credError } = await supabase.rpc(
      "get_integration_credentials",
      {
        p_tenant_id: tenantId,
        p_provider: "colppy",
      }
    );

    if (credError || !credentials) {
      return jsonResponse(
        {
          success: false,
          error: "Integración con Colppy no configurada para este tenant",
        },
        401
      );
    }

    // Leer config del tenant
    const { data: integrationData } = await supabase
      .from("tenant_integrations")
      .select("id, config")
      .eq("tenant_id", tenantId)
      .eq("provider", "colppy")
      .single();

    const config = integrationData?.config ?? {};
    const integrationId = integrationData?.id;
    const baseUrl =
      config.environment === "staging"
        ? COLPPY_STAGING_URL
        : COLPPY_PRODUCTION_URL;

    // Obtener o renovar sesión de Colppy
    const session = await getSession(tenantId, credentials, baseUrl);

    // Ejecutar la acción solicitada
    let result;

    switch (action) {
      case "test-connection":
        result = await testConnection(session, credentials, baseUrl);
        break;

      case "sync-cliente":
        result = await syncCliente(session, credentials, payload, baseUrl);
        break;

      case "sync-proveedor":
        result = await syncProveedor(session, credentials, payload, baseUrl);
        break;

      case "sync-comprobante":
        result = await syncComprobante(session, credentials, payload, baseUrl);
        break;

      case "sync-asiento":
        result = await syncAsiento(session, credentials, payload, baseUrl);
        break;

      case "sync-sueldos":
        result = await syncSueldos(session, credentials, payload, baseUrl);
        break;

      case "sync-tesoreria":
        result = await syncTesoreria(session, credentials, payload, baseUrl);
        break;

      case "sync-batch":
        result = await syncBatch(session, credentials, payload, baseUrl);
        break;

      case "listar":
        result = await listar(session, credentials, payload, baseUrl);
        break;

      default:
        return jsonResponse(
          { success: false, error: `Acción no soportada: ${action}` },
          400
        );
    }

    // Log de sincronización
    if (integrationId && action.startsWith("sync")) {
      await supabase.from("integration_sync_log").insert({
        integration_id: integrationId,
        operation: action,
        status: result.success ? "success" : "error",
        records_processed: result.success ? 1 : 0,
        records_failed: result.success ? 0 : 1,
        error_details: result.error ? { message: result.error } : null,
        completed_at: new Date().toISOString(),
      });

      // Actualizar último sync del tenant
      await supabase
        .from("tenant_integrations")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: result.success ? "success" : "error",
          last_sync_error: result.error ?? null,
        })
        .eq("id", integrationId);
    }

    return jsonResponse(result);
  } catch (err: any) {
    console.error("[colppy-proxy] Error:", err);
    return jsonResponse(
      { success: false, error: err.message ?? "Error interno" },
      500
    );
  }
});

// ===========================================================
// SESIÓN DE COLPPY
// ===========================================================

async function getSession(
  tenantId: string,
  credentials: any,
  baseUrl: string
): Promise<ColppySession> {
  // Verificar cache
  const cached = sessionCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.session;
  }

  // Login en Colppy
  const response = await colppyRequest(baseUrl, {
    auth: {
      usuario: COLPPY_API_USER,
      password: COLPPY_API_PASSWORD_MD5,
    },
    service: {
      provision: "Usuario",
      operacion: "iniciar_sesion",
    },
    parameters: {
      usuario: credentials.userEmail,
      password: credentials.userPasswordMD5,
    },
  });

  if (!response.response?.success) {
    throw new Error(
      `Login Colppy fallido: ${response.response?.message ?? "credenciales inválidas"}`
    );
  }

  const session: ColppySession = {
    usuario: credentials.userEmail,
    claveSesion: response.response.data.claveSesion,
  };

  // Guardar en cache (55 min, la sesión dura 60)
  sessionCache.set(tenantId, {
    session,
    expiresAt: Date.now() + 55 * 60 * 1000,
  });

  return session;
}

// ===========================================================
// ACCIONES
// ===========================================================

async function testConnection(
  session: ColppySession,
  credentials: any,
  baseUrl: string
) {
  const result = await colppyExecute(
    baseUrl,
    session,
    "Empresa",
    "listar_empresa",
    {}
  );

  return {
    success: true,
    empresas: result,
    message: "Conexión exitosa con Colppy",
  };
}

async function syncCliente(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const result = await colppyExecute(
    baseUrl,
    session,
    "Cliente",
    "alta_cliente",
    {
      idEmpresa: credentials.idEmpresa,
      info_general: {
        idEmpresa: credentials.idEmpresa,
        RazonSocial: payload.razonSocial,
        NombreFantasia: payload.nombreFantasia,
        CUIT: payload.cuit,
        idTipoDocumento: payload.tipoDocumento,
        NroDocumento: payload.nroDocumento,
        idCondicionIva: payload.condicionIva,
        idCondicionVenta: payload.condicionVenta,
        Domicilio: payload.domicilio,
        idProvincia: payload.provincia,
        CodigoPostal: payload.codigoPostal,
        Localidad: payload.localidad,
        Telefono: payload.telefono,
        Email: payload.email,
      },
    }
  );

  return { success: true, data: result, colppyId: result?.idCliente };
}

async function syncProveedor(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const result = await colppyExecute(
    baseUrl,
    session,
    "Proveedor",
    "alta_proveedor",
    {
      idEmpresa: credentials.idEmpresa,
      info_general: {
        idEmpresa: credentials.idEmpresa,
        RazonSocial: payload.razonSocial,
        NombreFantasia: payload.nombreFantasia,
        CUIT: payload.cuit,
        idCondicionIva: payload.condicionIva,
        idCondicionCompra: payload.condicionCompra,
        Domicilio: payload.domicilio,
        idProvincia: payload.provincia,
        CodigoPostal: payload.codigoPostal,
        Localidad: payload.localidad,
        Telefono: payload.telefono,
        Email: payload.email,
      },
    }
  );

  return { success: true, data: result, colppyId: result?.idProveedor };
}

async function syncComprobante(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const isVenta = payload.tipo === "venta";
  const provision = isVenta ? "FacturaVenta" : "FacturaCompra";
  const operacion = isVenta ? "alta_facturaventa" : "alta_facturacompra";

  const params: Record<string, any> = {
    idEmpresa: credentials.idEmpresa,
    [isVenta ? "idCliente" : "idProveedor"]: payload.idEntidadColppy,
    idTipoFactura: payload.tipoComprobante,
    fechaFactura: payload.fecha,
    netoGravado: payload.netoGravado,
    netoNoGravado: payload.netoNoGravado ?? 0,
    totalIVA: payload.totalIVA,
    percepcionIVA: payload.percepcionIVA ?? 0,
    percepcionIIBB: payload.percepcionIIBB ?? 0,
    importeTotal: payload.importeTotal,
    ItemsFactura: payload.items.map((item: any) => ({
      Descripcion: item.descripcion,
      Cantidad: item.cantidad,
      ImporteUnitario: item.precioUnitario,
      idPlanCuenta: item.idPlanCuenta ?? "",
      idTipoIva: item.idTipoIva,
    })),
    Comentario: payload.comentario ?? "",
  };

  if (isVenta && payload.idTalonario) {
    params.idTalonario = payload.idTalonario;
  }
  if (!isVenta) {
    params.nroFactura1 = payload.puntoVenta ?? "";
    params.nroFactura2 = payload.nroComprobante ?? "";
  }

  const result = await colppyExecute(
    baseUrl,
    session,
    provision,
    operacion,
    params
  );

  return { success: true, data: result };
}

async function syncAsiento(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  // Validar que cuadre
  const totalDebe = payload.lineas.reduce(
    (s: number, l: any) => s + l.debe,
    0
  );
  const totalHaber = payload.lineas.reduce(
    (s: number, l: any) => s + l.haber,
    0
  );

  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return {
      success: false,
      error: `Asiento descuadrado. Debe: ${totalDebe}, Haber: ${totalHaber}`,
    };
  }

  const result = await colppyExecute(
    baseUrl,
    session,
    "AsientoManual",
    "alta_asientomanual",
    {
      idEmpresa: credentials.idEmpresa,
      fechaAsiento: payload.fecha,
      descripcion: payload.descripcion,
      items: payload.lineas,
    }
  );

  return { success: true, data: result };
}

async function syncSueldos(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const { empleados, cuentas, periodo, fechaAsiento } = payload;

  const totalBruto = empleados.reduce((s: number, e: any) => s + e.bruto, 0);
  const totalAportes = empleados.reduce(
    (s: number, e: any) => s + e.aportesEmpleado,
    0
  );
  const totalContrib = empleados.reduce(
    (s: number, e: any) => s + e.contribucionesPatronales,
    0
  );
  const totalNeto = empleados.reduce((s: number, e: any) => s + e.neto, 0);

  const items = [
    {
      idPlanCuenta: cuentas.gastoSueldos,
      debe: totalBruto,
      haber: 0,
      descripcion: `Sueldos brutos ${periodo}`,
    },
    {
      idPlanCuenta: cuentas.cargasSociales,
      debe: totalContrib,
      haber: 0,
      descripcion: `Cargas sociales ${periodo}`,
    },
    {
      idPlanCuenta: cuentas.sueldosAPagar,
      debe: 0,
      haber: totalNeto,
      descripcion: `Netos a pagar ${periodo}`,
    },
    {
      idPlanCuenta: cuentas.retencionesADepositar,
      debe: 0,
      haber: totalAportes,
      descripcion: `Aportes a depositar ${periodo}`,
    },
    {
      idPlanCuenta: cuentas.contribucionesADepositar,
      debe: 0,
      haber: totalContrib,
      descripcion: `Contribuciones a depositar ${periodo}`,
    },
  ];

  const result = await colppyExecute(
    baseUrl,
    session,
    "AsientoManual",
    "alta_asientomanual",
    {
      idEmpresa: credentials.idEmpresa,
      fechaAsiento,
      descripcion: `Liquidación sueldos ${periodo} (${empleados.length} empleados)`,
      items,
    }
  );

  return {
    success: true,
    data: result,
    resumen: { totalBruto, totalAportes, totalContrib, totalNeto },
  };
}

async function syncTesoreria(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const operacion =
    payload.tipo === "cobro" ? "alta_cobro" : "alta_pago";

  const result = await colppyExecute(
    baseUrl,
    session,
    "Tesoreria",
    operacion,
    {
      idEmpresa: credentials.idEmpresa,
      [payload.tipo === "cobro" ? "idCliente" : "idProveedor"]:
        payload.idEntidadColppy,
      [payload.tipo === "cobro" ? "fechaCobro" : "fechaPago"]: payload.fecha,
      importeTotal: payload.importeTotal,
      items: payload.items,
    }
  );

  return { success: true, data: result };
}

async function syncBatch(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const results = [];
  for (const item of payload.items) {
    try {
      let res;
      switch (payload.tipo) {
        case "clientes":
          res = await syncCliente(session, credentials, item, baseUrl);
          break;
        case "comprobantes":
          res = await syncComprobante(session, credentials, item, baseUrl);
          break;
        default:
          res = { success: false, error: `Tipo batch no soportado: ${payload.tipo}` };
      }
      results.push(res);
    } catch (err: any) {
      results.push({ success: false, error: err.message });
    }
  }

  const exitosos = results.filter((r) => r.success).length;
  return {
    success: true,
    total: results.length,
    exitosos,
    fallidos: results.length - exitosos,
    resultados: results,
  };
}

async function listar(
  session: ColppySession,
  credentials: any,
  payload: any,
  baseUrl: string
) {
  const result = await colppyExecute(
    baseUrl,
    session,
    payload.provision,
    payload.operacion,
    {
      idEmpresa: credentials.idEmpresa,
      start: payload.start ?? 0,
      limit: payload.limit ?? 200,
      filter: payload.filter ?? [],
      order: payload.order ?? [],
    }
  );

  return { success: true, data: result };
}

// ===========================================================
// HELPERS HTTP
// ===========================================================

async function colppyExecute(
  baseUrl: string,
  session: ColppySession,
  provision: string,
  operacion: string,
  params: Record<string, any>
) {
  const response = await colppyRequest(baseUrl, {
    auth: {
      usuario: COLPPY_API_USER,
      password: COLPPY_API_PASSWORD_MD5,
    },
    service: { provision, operacion },
    parameters: {
      sesion: session,
      ...params,
    },
  });

  if (!response.response?.success) {
    throw new Error(
      `Colppy ${provision}.${operacion}: ${response.response?.message ?? "Error desconocido"}`
    );
  }

  return response.response.data;
}

async function colppyRequest(baseUrl: string, body: any) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
