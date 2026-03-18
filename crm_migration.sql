-- ============================================================
-- CRM MODULE - Migration
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Contactos
CREATE TABLE IF NOT EXISTS crm_contactos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    apellido TEXT,
    email TEXT,
    telefono TEXT,
    empresa TEXT,
    cargo TEXT,
    cliente_id UUID REFERENCES contable_clientes(id) ON DELETE SET NULL,
    notas TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Prospectos (pipeline de ventas)
CREATE TABLE IF NOT EXISTS crm_prospectos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    etapa TEXT NOT NULL DEFAULT 'nuevo',
    -- etapas: nuevo | contactado | propuesta | negociacion | ganado | perdido
    monto_estimado NUMERIC,
    probabilidad INTEGER DEFAULT 50,
    fecha_cierre DATE,
    contacto_id UUID REFERENCES crm_contactos(id) ON DELETE SET NULL,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Obras (industria construcción)
CREATE TABLE IF NOT EXISTS crm_obras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT NOT NULL DEFAULT 'activa',
    -- estados: activa | pausada | terminada | cancelada
    avance INTEGER DEFAULT 0 CHECK (avance >= 0 AND avance <= 100),
    fecha_inicio DATE,
    fecha_fin_estimada DATE,
    fecha_fin_real DATE,
    cliente_id UUID REFERENCES contable_clientes(id) ON DELETE SET NULL,
    contacto_id UUID REFERENCES crm_contactos(id) ON DELETE SET NULL,
    latitud NUMERIC,
    longitud NUMERIC,
    direccion TEXT,
    monto_contrato NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Archivos por obra (presupuestos, planos, contratos)
CREATE TABLE IF NOT EXISTS crm_obras_archivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id UUID NOT NULL REFERENCES crm_obras(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT DEFAULT 'presupuesto',
    -- tipos: presupuesto | plano | contrato | certificado | otro
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE crm_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prospectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_obras_archivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_contactos" ON crm_contactos
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_isolation_prospectos" ON crm_prospectos
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_isolation_obras" ON crm_obras
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_isolation_obras_archivos" ON crm_obras_archivos
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Storage bucket para archivos de obras
INSERT INTO storage.buckets (id, name, public) VALUES ('crm-archivos', 'crm-archivos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "crm_archivos_upload" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'crm-archivos');
CREATE POLICY "crm_archivos_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'crm-archivos');
CREATE POLICY "crm_archivos_delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'crm-archivos');
