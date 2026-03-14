// ============================================================
// Colppy API - TypeScript Types
// ============================================================

// --- Auth & Session ---

export interface ColppyConfig {
  /** Usuario de la API (registrado en dev.colppy.com) */
  apiUser: string;
  /** Password de la API en MD5 */
  apiPasswordMD5: string;
  /** Usuario de Colppy (email de login) */
  userEmail: string;
  /** Password del usuario en MD5 */
  userPasswordMD5: string;
  /** URL base de la API. Default: producción */
  baseUrl?: string;
  /** ID de empresa por defecto para todas las operaciones */
  defaultIdEmpresa?: string;
}

export interface ColppySession {
  usuario: string;
  claveSesion: string;
}

export interface ColppyAuth {
  usuario: string;
  password: string;
}

export interface ColppyRequest {
  auth: ColppyAuth;
  service: {
    provision: string;
    operacion: string;
  };
  parameters: Record<string, any>;
}

export interface ColppyResponse<T = any> {
  response: {
    success: boolean;
    message?: string;
    data?: T;
  };
}

// --- Paginación y filtros ---

export interface PaginationParams {
  start?: number;
  limit?: number;
}

export interface FilterParam {
  field: string;
  op: string;
  value: string | number;
}

export interface OrderParam {
  field: string;
  dir: "asc" | "desc";
}

export interface ListParams extends PaginationParams {
  filter?: FilterParam[];
  order?: OrderParam[];
}

// --- Cliente ---

export interface ClienteInfoGeneral {
  idCliente?: string;
  idEmpresa: string;
  NombreFantasia?: string;
  RazonSocial: string;
  CUIT?: string;
  idTipoDocumento?: string;
  NroDocumento?: string;
  idCondicionIva?: string;
  idCondicionVenta?: string;
  Domicilio?: string;
  idProvincia?: string;
  CodigoPostal?: string;
  Localidad?: string;
  Telefono?: string;
  Email?: string;
  idPlanCuenta?: string;
  [key: string]: any;
}

export interface ClienteData {
  info_general: ClienteInfoGeneral;
  [key: string]: any;
}

// --- Proveedor ---

export interface ProveedorInfoGeneral {
  idProveedor?: string;
  idEmpresa: string;
  NombreFantasia?: string;
  RazonSocial: string;
  CUIT?: string;
  idTipoDocumento?: string;
  NroDocumento?: string;
  idCondicionIva?: string;
  idCondicionCompra?: string;
  Domicilio?: string;
  idProvincia?: string;
  CodigoPostal?: string;
  Localidad?: string;
  Telefono?: string;
  Email?: string;
  idPlanCuenta?: string;
  [key: string]: any;
}

export interface ProveedorData {
  info_general: ProveedorInfoGeneral;
  [key: string]: any;
}

// --- Empresa ---

export interface EmpresaData {
  idEmpresa?: string;
  RazonSocial?: string;
  NombreFantasia?: string;
  CUIT?: string;
  [key: string]: any;
}

// --- Items de Factura ---

export interface ItemFactura {
  Descripcion: string;
  Cantidad: number;
  ImporteUnitario: number;
  idPlanCuenta?: string;
  unidadMedida?: string;
  idTipoIva?: string;
  ImporteBonificacion?: number;
  [key: string]: any;
}

// --- Factura de Venta ---

export interface FacturaVentaParams {
  idCliente: string;
  idEmpresa: string;
  idTipoFactura: "A" | "B" | "C" | "E" | "M";
  idEstadoFactura?: string;
  fechaFactura: string;
  idCondicionVenta?: string;
  idTalonario?: string;
  netoGravado?: number;
  netoNoGravado?: number;
  totalIVA?: number;
  percepcionIVA?: number;
  percepcionIIBB?: number;
  importeTotal?: number;
  ItemsFactura: ItemFactura[];
  Comentario?: string;
  [key: string]: any;
}

// --- Factura de Compra ---

export interface FacturaCompraParams {
  idProveedor: string;
  idEmpresa: string;
  idTipoFactura: "A" | "B" | "C" | "M";
  idEstadoFactura?: string;
  fechaFactura: string;
  nroFactura1?: string;
  nroFactura2?: string;
  idCondicionCompra?: string;
  netoGravado?: number;
  netoNoGravado?: number;
  totalIVA?: number;
  percepcionIVA?: number;
  percepcionIIBB?: number;
  importeTotal?: number;
  ItemsFactura: ItemFactura[];
  Comentario?: string;
  [key: string]: any;
}

// --- Contabilidad ---

export interface AsientoManual {
  idEmpresa: string;
  fechaAsiento: string;
  descripcion: string;
  items: AsientoItem[];
  [key: string]: any;
}

export interface AsientoItem {
  idPlanCuenta: string;
  debe: number;
  haber: number;
  descripcion?: string;
  [key: string]: any;
}

export interface CuentaContable {
  idPlanCuenta: string;
  nombre: string;
  tipo: string;
  [key: string]: any;
}

export interface MovimientoDiario {
  idEmpresa: string;
  fromDate?: string;
  toDate?: string;
  [key: string]: any;
}

// --- Tesorería ---

export interface CobroParams {
  idEmpresa: string;
  idCliente: string;
  fechaCobro: string;
  importeTotal: number;
  items: CobroItem[];
  [key: string]: any;
}

export interface CobroItem {
  idFactura: string;
  importeAplicado: number;
  [key: string]: any;
}

export interface PagoParams {
  idEmpresa: string;
  idProveedor: string;
  fechaPago: string;
  importeTotal: number;
  items: PagoItem[];
  [key: string]: any;
}

export interface PagoItem {
  idFactura: string;
  importeAplicado: number;
  [key: string]: any;
}

// --- Talonarios ---

export interface Talonario {
  idTalonario: string;
  nombre: string;
  tipoComprobante: string;
  puntoVenta: string;
  [key: string]: any;
}

// --- Sueldos (Conceptos y Liquidaciones) ---

export interface ConceptoSueldo {
  idConcepto?: string;
  nombre: string;
  tipo: string;
  [key: string]: any;
}

export interface LiquidacionSueldo {
  idEmpresa: string;
  periodo: string;
  empleados: EmpleadoLiquidacion[];
  [key: string]: any;
}

export interface EmpleadoLiquidacion {
  idEmpleado: string;
  conceptos: { idConcepto: string; monto: number }[];
  [key: string]: any;
}
