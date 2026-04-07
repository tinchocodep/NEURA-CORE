// ============================================================
// Edge Function: exportar-csv
// ============================================================
// Genera un CSV de comprobantes, proveedores, clientes u OPs
// filtrado por los parámetros que recibe.
// Sube el archivo a Storage y devuelve la URL firmada.
//
// Deploy: supabase functions deploy exportar-csv
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createSupabaseAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/utils.ts";

function toCsvRow(values: string[]): string {
  return values.map(v => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(",");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const body = await req.json();
    const { tenantId, tipo, fechaDesde, fechaHasta, estado, proveedor, cliente } = body;

    if (!tenantId) return errorResponse("tenantId es requerido");
    if (!tipo) return errorResponse("tipo es requerido (comprobantes, proveedores, clientes, ordenes_pago)");

    const supabase = createSupabaseAdmin();
    let csvContent = "";
    let filename = "";

    // Normalizar tipo: aceptar sinónimos
    const tipoMap: Record<string, string> = {
      comprobantes: "comprobantes", facturas: "comprobantes", comprobante: "comprobantes", factura: "comprobantes",
      proveedores: "proveedores", proveedor: "proveedores",
      clientes: "clientes", cliente: "clientes",
      ordenes_pago: "ordenes_pago", ordenes: "ordenes_pago", ops: "ordenes_pago", op: "ordenes_pago",
    };
    const tipoNorm = tipoMap[tipo.toLowerCase()] || tipo.toLowerCase();

    if (tipoNorm === "comprobantes") {
      let query = supabase
        .from("contable_comprobantes")
        .select("tipo, tipo_comprobante, numero_comprobante, fecha, monto_original, monto_ars, moneda, estado, descripcion, source, contable_proveedores(razon_social), contable_clientes(razon_social)")
        .eq("tenant_id", tenantId)
        .order("fecha", { ascending: false })
        .limit(500);

      if (fechaDesde) query = query.gte("fecha", fechaDesde);
      if (fechaHasta) query = query.lte("fecha", fechaHasta);
      if (estado) query = query.eq("estado", estado);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const headers = ["Tipo", "Tipo Comprobante", "Número", "Fecha", "Monto Original", "Monto ARS", "Moneda", "Estado", "Descripción", "Source", "Proveedor", "Cliente"];
      const rows = (data || []).map((r: any) => [
        r.tipo,
        r.tipo_comprobante,
        r.numero_comprobante,
        r.fecha,
        r.monto_original,
        r.monto_ars,
        r.moneda,
        r.estado,
        r.descripcion,
        r.source,
        r.contable_proveedores?.razon_social || "",
        r.contable_clientes?.razon_social || "",
      ]);

      csvContent = toCsvRow(headers) + "\n" + rows.map(r => toCsvRow(r)).join("\n");
      filename = `comprobantes_${fechaDesde || "todos"}_${fechaHasta || "todos"}.csv`;

    } else if (tipoNorm === "proveedores") {
      const { data, error } = await supabase
        .from("contable_proveedores")
        .select("razon_social, cuit, email, telefono, direccion, condicion_fiscal, activo")
        .eq("tenant_id", tenantId)
        .order("razon_social");

      if (error) throw new Error(error.message);

      const headers = ["Razón Social", "CUIT", "Email", "Teléfono", "Dirección", "Condición Fiscal", "Activo"];
      const rows = (data || []).map((r: any) => [
        r.razon_social, r.cuit, r.email, r.telefono, r.direccion, r.condicion_fiscal, r.activo ? "Sí" : "No",
      ]);

      csvContent = toCsvRow(headers) + "\n" + rows.map(r => toCsvRow(r)).join("\n");
      filename = "proveedores.csv";

    } else if (tipoNorm === "clientes") {
      const { data, error } = await supabase
        .from("contable_clientes")
        .select("razon_social, cuit, email, telefono, direccion, condicion_fiscal, activo")
        .eq("tenant_id", tenantId)
        .order("razon_social");

      if (error) throw new Error(error.message);

      const headers = ["Razón Social", "CUIT", "Email", "Teléfono", "Dirección", "Condición Fiscal", "Activo"];
      const rows = (data || []).map((r: any) => [
        r.razon_social, r.cuit, r.email, r.telefono, r.direccion, r.condicion_fiscal, r.activo ? "Sí" : "No",
      ]);

      csvContent = toCsvRow(headers) + "\n" + rows.map(r => toCsvRow(r)).join("\n");
      filename = "clientes.csv";

    } else if (tipoNorm === "ordenes_pago") {
      const { data, error } = await supabase
        .from("contable_ordenes_pago")
        .select("numero, fecha, monto_total, estado, forma_pago, observaciones, contable_proveedores(razon_social)")
        .eq("tenant_id", tenantId)
        .order("fecha", { ascending: false })
        .limit(500);

      if (error) throw new Error(error.message);

      const headers = ["Número", "Fecha", "Monto Total", "Estado", "Forma de Pago", "Observaciones", "Proveedor"];
      const rows = (data || []).map((r: any) => [
        r.numero, r.fecha, r.monto_total, r.estado, r.forma_pago, r.observaciones, r.contable_proveedores?.razon_social || "",
      ]);

      csvContent = toCsvRow(headers) + "\n" + rows.map(r => toCsvRow(r)).join("\n");
      filename = "ordenes_pago.csv";

    } else {
      return errorResponse("tipo inválido. Opciones: comprobantes, proveedores, clientes, ordenes_pago");
    }

    const rows_count = csvContent.split("\n").length - 1;

    // Devolver el CSV como archivo descargable (con BOM para UTF-8 en Excel)
    const bom = "\uFEFF";
    return new Response(bom + csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
        "X-Rows": String(rows_count),
        "X-Filename": filename,
      },
    });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return errorResponse(message, 500);
  }
});
