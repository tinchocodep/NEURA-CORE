// ============================================================
// EJEMPLOS DE USO - Inyectar datos a Colppy desde tu web
// ============================================================
// Estos ejemplos muestran cómo usar el módulo desde tu código
// Next.js para empujar datos procesados hacia Colppy.
// ============================================================

import { createColppy } from "./src";
import { toMD5 } from "./src/helpers";

// ─────────────────────────────────────────────────────────────
// 1. CONFIGURACIÓN INICIAL
// ─────────────────────────────────────────────────────────────

// Opción A: Con passwords en texto plano (se convierten a MD5)
const colppy = createColppy({
  apiUser: "MiAppColppy",
  apiPasswordMD5: toMD5("passwordDeLaApp"),
  userEmail: "tu-email@empresa.com",
  userPasswordMD5: toMD5("tuPasswordDeColppy"),
  defaultIdEmpresa: "98", // Tu ID de empresa en Colppy
});

// Opción B: Con variables de entorno (ver config.ts)
// import { getColppy } from "./src/config";
// const colppy = getColppy();

// ─────────────────────────────────────────────────────────────
// 2. INYECTAR UN CLIENTE
// ─────────────────────────────────────────────────────────────

async function inyectarCliente() {
  const resultado = await colppy.clientes.crear({
    info_general: {
      idEmpresa: "98",
      RazonSocial: "Acme Argentina S.A.",
      NombreFantasia: "Acme",
      CUIT: "30-12345678-9",
      idCondicionIva: "1", // Responsable Inscripto
      Email: "facturacion@acme.com.ar",
      Telefono: "011-4567-8900",
      Domicilio: "Av. Corrientes 1234",
      Localidad: "CABA",
      idProvincia: "1",
      CodigoPostal: "C1043",
    },
  });

  console.log("Cliente inyectado:", resultado);
}

// ─────────────────────────────────────────────────────────────
// 3. INYECTAR UNA FACTURA DE VENTA YA PROCESADA
// ─────────────────────────────────────────────────────────────

async function inyectarFacturaVenta() {
  // Datos que ya tenés procesados en tu sistema
  const facturaLocal = {
    clienteId: "123", // ID del cliente en Colppy
    tipo: "B" as const,
    fecha: "2025-06-15",
    items: [
      { desc: "Servicio de consultoría - Junio 2025", cant: 1, precio: 50000 },
      { desc: "Horas extras desarrollo", cant: 10, precio: 3500 },
    ],
  };

  // Calcular totales
  const netoGravado = facturaLocal.items.reduce(
    (sum, i) => sum + i.cant * i.precio,
    0
  );
  const totalIVA = netoGravado * 0.21;

  const resultado = await colppy.facturacion.crearVenta({
    idCliente: facturaLocal.clienteId,
    idEmpresa: "98",
    idTipoFactura: facturaLocal.tipo,
    fechaFactura: facturaLocal.fecha,
    netoGravado,
    netoNoGravado: 0,
    totalIVA,
    percepcionIVA: 0,
    percepcionIIBB: 0,
    importeTotal: netoGravado + totalIVA,
    ItemsFactura: facturaLocal.items.map((i) => ({
      Descripcion: i.desc,
      Cantidad: i.cant,
      ImporteUnitario: i.precio,
    })),
  });

  console.log("Factura inyectada en Colppy:", resultado);
}

// ─────────────────────────────────────────────────────────────
// 4. INYECTAR FACTURA DE COMPRA (proveedor)
// ─────────────────────────────────────────────────────────────

async function inyectarFacturaCompra() {
  const resultado = await colppy.facturacion.crearCompra({
    idProveedor: "456",
    idEmpresa: "98",
    idTipoFactura: "A",
    fechaFactura: "2025-06-10",
    nroFactura1: "0001", // Punto de venta del proveedor
    nroFactura2: "00005432", // Número de factura
    netoGravado: 100000,
    netoNoGravado: 0,
    totalIVA: 21000,
    percepcionIVA: 0,
    percepcionIIBB: 0,
    importeTotal: 121000,
    ItemsFactura: [
      {
        Descripcion: "Hosting anual servidor dedicado",
        Cantidad: 1,
        ImporteUnitario: 100000,
      },
    ],
    Comentario: "Factura importada desde sistema interno",
  });

  console.log("Factura de compra inyectada:", resultado);
}

// ─────────────────────────────────────────────────────────────
// 5. INYECTAR LIQUIDACIÓN DE SUELDOS COMO ASIENTO
// ─────────────────────────────────────────────────────────────

async function inyectarSueldos() {
  // Datos de tu sistema de liquidación
  const liquidacion = {
    periodo: "2025-06",
    empleados: [
      { nombre: "Juan Pérez", bruto: 800000, aportes: 136000, neto: 664000 },
      { nombre: "María García", bruto: 950000, aportes: 161500, neto: 788500 },
    ],
  };

  const totalBruto = liquidacion.empleados.reduce(
    (s, e) => s + e.bruto,
    0
  );
  const totalAportes = liquidacion.empleados.reduce(
    (s, e) => s + e.aportes,
    0
  );
  const totalNeto = liquidacion.empleados.reduce((s, e) => s + e.neto, 0);
  const contribucionesPatronales = totalBruto * 0.2636; // ~26.36%

  const resultado = await colppy.contabilidad.crearAsiento({
    idEmpresa: "98",
    fechaAsiento: "2025-06-30",
    descripcion: `Liquidación sueldos ${liquidacion.periodo}`,
    items: [
      // DEBE: gastos
      {
        idPlanCuenta: "5.1.01.001", // Sueldos y jornales
        debe: totalBruto,
        haber: 0,
        descripcion: "Sueldos brutos",
      },
      {
        idPlanCuenta: "5.1.01.002", // Cargas sociales
        debe: contribucionesPatronales,
        haber: 0,
        descripcion: "Contribuciones patronales",
      },
      // HABER: deudas
      {
        idPlanCuenta: "2.1.03.001", // Sueldos a pagar
        debe: 0,
        haber: totalNeto,
        descripcion: "Neto a pagar empleados",
      },
      {
        idPlanCuenta: "2.1.03.002", // Retenciones a depositar
        debe: 0,
        haber: totalAportes,
        descripcion: "Aportes empleados a depositar",
      },
      {
        idPlanCuenta: "2.1.03.003", // Contribuciones a depositar
        debe: 0,
        haber: contribucionesPatronales,
        descripcion: "Contribuciones patronales a depositar",
      },
    ],
  });

  console.log("Sueldos inyectados como asiento:", resultado);
}

// ─────────────────────────────────────────────────────────────
// 6. INYECCIÓN MASIVA (BATCH)
// ─────────────────────────────────────────────────────────────

async function inyeccionMasiva() {
  // Ejemplo: inyectar múltiples clientes desde tu base de datos
  const clientesLocales = [
    { razon: "Empresa A SRL", cuit: "30-11111111-1" },
    { razon: "Empresa B SA", cuit: "30-22222222-2" },
    { razon: "Empresa C SAS", cuit: "30-33333333-3" },
  ];

  const resultados = [];

  for (const c of clientesLocales) {
    try {
      const res = await colppy.clientes.crear({
        info_general: {
          idEmpresa: "98",
          RazonSocial: c.razon,
          CUIT: c.cuit,
          idCondicionIva: "1",
        },
      });
      resultados.push({ cuit: c.cuit, ok: true, data: res });
    } catch (error: any) {
      resultados.push({ cuit: c.cuit, ok: false, error: error.message });
    }
  }

  console.log("Resultados batch:", resultados);
}

// ─────────────────────────────────────────────────────────────
// 7. OPERACIÓN CUSTOM (para provisiones no cubiertas)
// ─────────────────────────────────────────────────────────────

async function operacionCustom() {
  // Para cualquier provisión/operación que no esté en los módulos:
  const resultado = await colppy.execute(
    "MiProvision",
    "mi_operacion",
    {
      idEmpresa: "98",
      parametro1: "valor1",
      parametro2: "valor2",
    }
  );

  console.log("Resultado custom:", resultado);
}

// ─────────────────────────────────────────────────────────────
// 8. LLAMADA DESDE EL FRONTEND (fetch a tus API routes)
// ─────────────────────────────────────────────────────────────

// Desde un componente React de tu web:
async function inyectarDesdeElFrontend() {
  // Inyectar factura
  const res = await fetch("/api/colppy/sync-factura", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "venta",
      idClienteOProveedor: "123",
      tipoFactura: "B",
      fecha: "2025-06-15",
      netoGravado: 50000,
      totalIVA: 10500,
      importeTotal: 60500,
      items: [
        {
          descripcion: "Servicio mensual",
          cantidad: 1,
          precioUnitario: 50000,
        },
      ],
    }),
  });

  const data = await res.json();
  if (data.success) {
    console.log("Factura sincronizada con Colppy!");
  } else {
    console.error("Error:", data.error);
  }
}
