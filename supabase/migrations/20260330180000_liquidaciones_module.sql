-- =============================================
-- MÓDULO LIQUIDACIONES - AFG Constructora
-- Liquidación quincenal de jornales
-- =============================================

-- 1. Obras (proyectos de construcción)
CREATE TABLE liq_obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text,
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'finalizada')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_obras_tenant ON liq_obras(tenant_id);

-- 2. Categorías de empleados
CREATE TABLE liq_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_categorias_tenant ON liq_categorias(tenant_id);

-- 3. Valores hora por categoría (historial por quincena)
CREATE TABLE liq_valores_hora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES liq_categorias(id) ON DELETE CASCADE,
  valor_hora numeric(12,2) NOT NULL,
  vigencia_desde date NOT NULL,
  porcentaje_aumento numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, categoria_id, vigencia_desde)
);

CREATE INDEX idx_liq_valores_hora_tenant ON liq_valores_hora(tenant_id);
CREATE INDEX idx_liq_valores_hora_vigencia ON liq_valores_hora(categoria_id, vigencia_desde DESC);

-- 4. Empleados
CREATE TABLE liq_empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  apellido text NOT NULL,
  dni text,
  cuil text,
  categoria_id uuid REFERENCES liq_categorias(id),
  es_revestimiento boolean NOT NULL DEFAULT false,
  revestimiento_porcentaje numeric(5,2) NOT NULL DEFAULT 20.00,
  fecha_ingreso date,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_empleados_tenant ON liq_empleados(tenant_id);
CREATE INDEX idx_liq_empleados_categoria ON liq_empleados(categoria_id);

-- 5. Historial de categorías por empleado
CREATE TABLE liq_empleado_categoria_hist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES liq_empleados(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES liq_categorias(id),
  desde date NOT NULL,
  hasta date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_emp_cat_hist_empleado ON liq_empleado_categoria_hist(empleado_id, desde DESC);

-- 6. Quincenas (períodos de liquidación)
CREATE TABLE liq_quincenas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'calculada', 'enviada_contador', 'liquidada', 'cerrada')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, periodo)
);

CREATE INDEX idx_liq_quincenas_tenant ON liq_quincenas(tenant_id);

-- 7. Fichajes diarios
CREATE TABLE liq_fichajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES liq_empleados(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES liq_obras(id) ON DELETE CASCADE,
  quincena_id uuid REFERENCES liq_quincenas(id),
  fecha date NOT NULL,
  hora_entrada time NOT NULL,
  hora_salida time,
  es_feriado boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_fichajes_tenant ON liq_fichajes(tenant_id);
CREATE INDEX idx_liq_fichajes_empleado_fecha ON liq_fichajes(empleado_id, fecha);
CREATE INDEX idx_liq_fichajes_quincena ON liq_fichajes(quincena_id);
CREATE INDEX idx_liq_fichajes_obra ON liq_fichajes(obra_id);

-- 8. Ausencias y justificaciones
CREATE TABLE liq_ausencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES liq_empleados(id) ON DELETE CASCADE,
  quincena_id uuid REFERENCES liq_quincenas(id),
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'injustificada', 'visita_medica', 'art', 'vacaciones',
    'paro_transporte', 'permiso', 'feriado', 'otro'
  )),
  justificada boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_ausencias_empleado ON liq_ausencias(empleado_id, fecha);
CREATE INDEX idx_liq_ausencias_quincena ON liq_ausencias(quincena_id);

-- 9. Detalle de liquidación por empleado por quincena
CREATE TABLE liq_liquidacion_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quincena_id uuid NOT NULL REFERENCES liq_quincenas(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES liq_empleados(id) ON DELETE CASCADE,
  categoria_id uuid REFERENCES liq_categorias(id),
  valor_hora numeric(12,2) NOT NULL,
  horas_normales numeric(8,2) NOT NULL DEFAULT 0,
  horas_extra_50 numeric(8,2) NOT NULL DEFAULT 0,
  horas_extra_100 numeric(8,2) NOT NULL DEFAULT 0,
  minutos_tardanza int NOT NULL DEFAULT 0,
  minutos_salida_anticipada int NOT NULL DEFAULT 0,
  cant_tardanzas int NOT NULL DEFAULT 0,
  dias_ausencia_injustificada int NOT NULL DEFAULT 0,
  dias_visita_medica int NOT NULL DEFAULT 0,
  dias_art int NOT NULL DEFAULT 0,
  dias_vacaciones int NOT NULL DEFAULT 0,
  dias_permiso int NOT NULL DEFAULT 0,
  tiene_presentismo boolean NOT NULL DEFAULT true,
  motivo_sin_presentismo text,
  monto_presentismo numeric(12,2) NOT NULL DEFAULT 0,
  plus_revestimiento numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_normal numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_extras numeric(12,2) NOT NULL DEFAULT 0,
  total_bruto numeric(12,2) NOT NULL DEFAULT 0,
  monto_transferencia numeric(12,2),
  monto_efectivo numeric(12,2),
  monto_contador numeric(12,2),
  diferencia_neta numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quincena_id, empleado_id)
);

CREATE INDEX idx_liq_detalle_quincena ON liq_liquidacion_detalle(quincena_id);
CREATE INDEX idx_liq_detalle_empleado ON liq_liquidacion_detalle(empleado_id);

-- 10. Upload del contador
CREATE TABLE liq_contador_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quincena_id uuid NOT NULL REFERENCES liq_quincenas(id) ON DELETE CASCADE,
  archivo_url text,
  datos_json jsonb,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesado', 'error')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liq_contador_quincena ON liq_contador_uploads(quincena_id);

-- RLS
ALTER TABLE liq_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_valores_hora ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_empleado_categoria_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_quincenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_fichajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_ausencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_liquidacion_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE liq_contador_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access" ON liq_obras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_valores_hora FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_empleados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_empleado_categoria_hist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_quincenas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_fichajes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_ausencias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_liquidacion_detalle FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tenant_access" ON liq_contador_uploads FOR ALL USING (true) WITH CHECK (true);
