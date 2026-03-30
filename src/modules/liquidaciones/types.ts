export interface Obra {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: string | null;
  estado: 'activa' | 'pausada' | 'finalizada';
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Categoria {
  id: string;
  tenant_id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  created_at: string;
}

export interface ValorHora {
  id: string;
  tenant_id: string;
  categoria_id: string;
  valor_hora: number;
  vigencia_desde: string;
  porcentaje_aumento: number | null;
  created_at: string;
  categoria?: Categoria;
}

export interface Empleado {
  id: string;
  tenant_id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  cuil: string | null;
  categoria_id: string | null;
  es_revestimiento: boolean;
  revestimiento_porcentaje: number;
  fecha_ingreso: string | null;
  estado: 'activo' | 'inactivo';
  notas: string | null;
  created_at: string;
  updated_at: string;
  categoria?: Categoria;
}

export interface Quincena {
  id: string;
  tenant_id: string;
  periodo: string; // '2026-03-Q1' o '2026-03-Q2'
  fecha_desde: string;
  fecha_hasta: string;
  estado: 'abierta' | 'calculada' | 'enviada_contador' | 'liquidada' | 'cerrada';
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Fichaje {
  id: string;
  tenant_id: string;
  empleado_id: string;
  obra_id: string;
  quincena_id: string | null;
  fecha: string;
  hora_entrada: string;
  hora_salida: string | null;
  es_feriado: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  empleado?: Empleado;
  obra?: Obra;
}

export type TipoAusencia =
  | 'injustificada'
  | 'visita_medica'
  | 'art'
  | 'vacaciones'
  | 'paro_transporte'
  | 'permiso'
  | 'feriado'
  | 'otro';

export interface Ausencia {
  id: string;
  tenant_id: string;
  empleado_id: string;
  quincena_id: string | null;
  fecha: string;
  tipo: TipoAusencia;
  justificada: boolean;
  notas: string | null;
  created_at: string;
  empleado?: Empleado;
}

export interface LiquidacionDetalle {
  id: string;
  tenant_id: string;
  quincena_id: string;
  empleado_id: string;
  categoria_id: string | null;
  valor_hora: number;
  horas_normales: number;
  horas_extra_50: number;
  horas_extra_100: number;
  minutos_tardanza: number;
  minutos_salida_anticipada: number;
  cant_tardanzas: number;
  dias_ausencia_injustificada: number;
  dias_visita_medica: number;
  dias_art: number;
  dias_vacaciones: number;
  dias_permiso: number;
  tiene_presentismo: boolean;
  motivo_sin_presentismo: string | null;
  monto_presentismo: number;
  plus_revestimiento: number;
  subtotal_normal: number;
  subtotal_extras: number;
  total_bruto: number;
  // Vacaciones
  horas_vacaciones: number;
  dias_vacaciones_calc: number;
  monto_vacaciones: number;
  // Pagos
  pago_total: number;
  monto_suss: number;
  monto_adelanto: number;
  monto_transferencia: number | null;
  monto_efectivo: number | null;
  redondeo: number;
  // Datos del contador (Lili)
  quincena_contador: number | null;
  vacaciones_contador: number | null;
  monto_contador: number | null;
  diferencia_neta: number | null;
  created_at: string;
  updated_at: string;
  empleado?: Empleado;
  categoria?: Categoria;
}

export interface ContadorUpload {
  id: string;
  tenant_id: string;
  quincena_id: string;
  archivo_url: string | null;
  datos_json: any;
  estado: 'pendiente' | 'procesado' | 'error';
  notas: string | null;
  created_at: string;
}

// Constantes
export const ESTADO_QUINCENA_COLOR: Record<string, string> = {
  abierta: '#f59e0b',
  calculada: '#3b82f6',
  enviada_contador: '#8b5cf6',
  liquidada: '#10b981',
  cerrada: '#6b7280',
};

export const ESTADO_QUINCENA_LABEL: Record<string, string> = {
  abierta: 'Abierta',
  calculada: 'Calculada',
  enviada_contador: 'Enviada al Contador',
  liquidada: 'Liquidada',
  cerrada: 'Cerrada',
};

export const TIPO_AUSENCIA_LABEL: Record<TipoAusencia, string> = {
  injustificada: 'Injustificada',
  visita_medica: 'Visita Médica',
  art: 'ART',
  vacaciones: 'Vacaciones',
  paro_transporte: 'Paro de Transporte',
  permiso: 'Permiso',
  feriado: 'Feriado',
  otro: 'Otro',
};

export const ESTADO_OBRA_COLOR: Record<string, string> = {
  activa: '#10b981',
  pausada: '#f59e0b',
  finalizada: '#6b7280',
};
