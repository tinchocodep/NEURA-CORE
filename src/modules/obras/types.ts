// ── Fichas de Obra ──────────────────────────────────────────────────────────

export interface ObraFicha {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: string | null;
  localidad: string | null;
  estado: EstadoObra;
  tipo_obra: string | null;
  comitente: string | null;
  fecha_inicio: string | null;
  fecha_estimada_fin: string | null;
  superficie_m2: number | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoObra = 'activa' | 'pausada' | 'finalizada' | 'en_licitacion';

export const ESTADO_OBRA_COLOR: Record<EstadoObra, string> = {
  activa: '#10b981',
  pausada: '#f59e0b',
  finalizada: '#6b7280',
  en_licitacion: '#8b5cf6',
};

export const ESTADO_OBRA_LABEL: Record<EstadoObra, string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  finalizada: 'Finalizada',
  en_licitacion: 'En Licitación',
};

// ── Roles de Obra ───────────────────────────────────────────────────────────

export interface ObraRol {
  id: string;
  tenant_id: string;
  obra_id: string;
  rol_id: string | null;
  persona_nombre: string | null;
  empleado_id: string | null;
  desde: string | null;
  hasta: string | null;
  created_at: string;
  config_rol?: ConfigRol;
}

export interface ConfigRol {
  id: string;
  tenant_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

// ── Empleados asignados ─────────────────────────────────────────────────────

export interface ObraEmpleado {
  id: string;
  tenant_id: string;
  obra_id: string;
  empleado_id: string;
  desde: string | null;
  hasta: string | null;
  created_at: string;
  empleado?: { id: string; nombre: string; apellido: string; dni: string | null; categoria_id: string | null };
}

// ── Config ──────────────────────────────────────────────────────────────────

export interface ConfigTipoObra {
  id: string;
  tenant_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

export interface ConfigConceptoCosto {
  id: string;
  tenant_id: string;
  nombre: string;
  porcentaje: number;
  orden: number;
  created_at: string;
}

export interface ConfigRubroPresupuesto {
  id: string;
  tenant_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

export interface ConfigCategoriaDoc {
  id: string;
  tenant_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

export interface ConfigRubroContratista {
  id: string;
  tenant_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

// ── Presupuesto ─────────────────────────────────────────────────────────────

export interface Presupuesto {
  id: string;
  tenant_id: string;
  obra_id: string;
  version: number;
  fecha: string;
  notas: string | null;
  created_at: string;
  items?: PresupuestoItem[];
}

export interface PresupuestoItem {
  id: string;
  tenant_id: string;
  presupuesto_id: string;
  rubro_id: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  orden: number;
  created_at: string;
  rubro?: ConfigRubroPresupuesto;
}

// ── Certificados ────────────────────────────────────────────────────────────

export type EstadoCertificado = 'borrador' | 'aprobado' | 'facturado' | 'cobrado';

export interface Certificado {
  id: string;
  tenant_id: string;
  obra_id: string;
  numero: number;
  fecha: string;
  periodo: string | null;
  archivo_url: string | null;
  estado: EstadoCertificado;
  notas: string | null;
  created_at: string;
  detalle?: CertificadoDetalle[];
}

export const ESTADO_CERTIFICADO_COLOR: Record<EstadoCertificado, string> = {
  borrador: '#f59e0b',
  aprobado: '#3b82f6',
  facturado: '#8b5cf6',
  cobrado: '#10b981',
};

export const ESTADO_CERTIFICADO_LABEL: Record<EstadoCertificado, string> = {
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  facturado: 'Facturado',
  cobrado: 'Cobrado',
};

export interface CertificadoDetalle {
  id: string;
  tenant_id: string;
  certificado_id: string;
  presupuesto_item_id: string | null;
  cantidad_periodo: number;
  cantidad_acumulada: number;
  porcentaje_avance: number;
  monto_periodo: number;
  monto_acumulado: number;
  created_at: string;
}

// ── Contratistas ────────────────────────────────────────────────────────────

export type EstadoContratista = 'activo' | 'inactivo' | 'suspendido';

export interface Contratista {
  id: string;
  tenant_id: string;
  razon_social: string;
  cuit: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  rubro_id: string | null;
  condicion_iva: string | null;
  cbu: string | null;
  estado: EstadoContratista;
  calificacion: number | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  rubro?: ConfigRubroContratista;
}

export const ESTADO_CONTRATISTA_COLOR: Record<EstadoContratista, string> = {
  activo: '#10b981',
  inactivo: '#6b7280',
  suspendido: '#ef4444',
};

export const ESTADO_CONTRATISTA_LABEL: Record<EstadoContratista, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  suspendido: 'Suspendido',
};

export interface ContratistaDocs {
  id: string;
  tenant_id: string;
  contratista_id: string;
  tipo: 'art' | 'seguro_vida' | 'habilitacion' | 'otro';
  descripcion: string | null;
  archivo_url: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  created_at: string;
}

// ── Cartas Oferta ───────────────────────────────────────────────────────────

export type EstadoCartaOferta = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida';

export interface CartaOferta {
  id: string;
  tenant_id: string;
  obra_id: string;
  contratista_id: string;
  numero: number;
  version: number;
  fecha: string;
  alcance: string | null;
  plazo_ejecucion: string | null;
  condiciones_pago: string | null;
  penalidades: string | null;
  observaciones: string | null;
  estado: EstadoCartaOferta;
  monto_total: number;
  created_at: string;
  updated_at: string;
  contratista?: Contratista;
  obra?: ObraFicha;
}

export const ESTADO_CARTA_COLOR: Record<EstadoCartaOferta, string> = {
  borrador: '#f59e0b',
  enviada: '#3b82f6',
  aceptada: '#10b981',
  rechazada: '#ef4444',
  vencida: '#6b7280',
};

export const ESTADO_CARTA_LABEL: Record<EstadoCartaOferta, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
};

export interface CartaOfertaItem {
  id: string;
  tenant_id: string;
  carta_oferta_id: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  orden: number;
  created_at: string;
}

export interface CartaOfertaTemplate {
  id: string;
  tenant_id: string;
  encabezado: string | null;
  clausulas: string | null;
  pie: string | null;
  created_at: string;
  updated_at: string;
}

// ── Documentacion ───────────────────────────────────────────────────────────

export interface ObraDocumento {
  id: string;
  tenant_id: string;
  obra_id: string;
  categoria_id: string | null;
  descripcion: string | null;
  archivo_url: string | null;
  archivo_nombre: string | null;
  version: number;
  fecha: string | null;
  subido_por: string | null;
  fecha_vencimiento: string | null;
  created_at: string;
  categoria?: ConfigCategoriaDoc;
}

// ── Partes Diarios ──────────────────────────────────────────────────────────

export type Clima = 'soleado' | 'nublado' | 'lluvia' | 'lluvia_intensa';
export type SeTrabajo = 'si' | 'no' | 'parcial';

export interface ParteDiario {
  id: string;
  tenant_id: string;
  obra_id: string;
  fecha: string;
  autor: string | null;
  clima: Clima | null;
  se_trabajo: SeTrabajo;
  motivo_no_trabajo: string | null;
  personal_presente: number | null;
  tareas_realizadas: string | null;
  incidentes: string | null;
  observaciones: string | null;
  created_at: string;
}

export const CLIMA_LABEL: Record<Clima, string> = {
  soleado: 'Soleado',
  nublado: 'Nublado',
  lluvia: 'Lluvia',
  lluvia_intensa: 'Lluvia Intensa',
};

export const CLIMA_ICON: Record<Clima, string> = {
  soleado: '☀️',
  nublado: '⛅',
  lluvia: '🌧️',
  lluvia_intensa: '⛈️',
};

export const SE_TRABAJO_LABEL: Record<SeTrabajo, string> = {
  si: 'Sí',
  no: 'No',
  parcial: 'Parcial',
};

export const SE_TRABAJO_COLOR: Record<SeTrabajo, string> = {
  si: '#10b981',
  no: '#ef4444',
  parcial: '#f59e0b',
};

// ── Materiales / Pedidos ────────────────────────────────────────────────────

export type EstadoPedido = 'pedido' | 'en_camino' | 'recibido_parcial' | 'recibido' | 'cancelado';

export interface MaterialPedido {
  id: string;
  tenant_id: string;
  obra_id: string;
  proveedor: string | null;
  fecha_pedido: string;
  fecha_estimada_entrega: string | null;
  fecha_real_entrega: string | null;
  estado: EstadoPedido;
  remito_url: string | null;
  notas: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  obra?: ObraFicha;
  items?: MaterialPedidoItem[];
}

export const ESTADO_PEDIDO_COLOR: Record<EstadoPedido, string> = {
  pedido: '#f59e0b',
  en_camino: '#3b82f6',
  recibido_parcial: '#8b5cf6',
  recibido: '#10b981',
  cancelado: '#6b7280',
};

export const ESTADO_PEDIDO_LABEL: Record<EstadoPedido, string> = {
  pedido: 'Pedido',
  en_camino: 'En Camino',
  recibido_parcial: 'Recibido Parcial',
  recibido: 'Recibido',
  cancelado: 'Cancelado',
};

export interface MaterialPedidoItem {
  id: string;
  tenant_id: string;
  pedido_id: string;
  material: string;
  cantidad: number;
  unidad: string | null;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}

// ── Vencimientos ────────────────────────────────────────────────────────────

export type EntidadTipo = 'contratista' | 'empleado' | 'obra';

export interface Vencimiento {
  id: string;
  tenant_id: string;
  entidad_tipo: EntidadTipo;
  entidad_id: string;
  tipo: string;
  descripcion: string | null;
  fecha_vencimiento: string;
  dias_anticipacion: number;
  created_at: string;
}

// ── F931 ────────────────────────────────────────────────────────────────────

export interface F931 {
  id: string;
  tenant_id: string;
  periodo: string;
  archivo_url: string | null;
  notas: string | null;
  created_at: string;
  detalle?: F931Detalle[];
}

export interface F931Detalle {
  id: string;
  tenant_id: string;
  f931_id: string;
  empleado_nombre: string | null;
  empleado_cuil: string | null;
  remuneracion_imponible: number;
  aportes_personales: number;
  contribuciones_patronales: number;
  obra_social: number;
  sindicato: number;
  created_at: string;
}
