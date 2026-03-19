-- ============================================================
-- MÓDULO COMERCIAL (Seguimiento de Leads) — Migration
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Etapas del pipeline (configurables por tenant)
CREATE TABLE IF NOT EXISTS comercial_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    orden INTEGER NOT NULL DEFAULT 0,
    es_final BOOLEAN DEFAULT false,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Fuentes de captación
CREATE TABLE IF NOT EXISTS comercial_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    icono TEXT DEFAULT 'globe',
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Contactos / Leads
CREATE TABLE IF NOT EXISTS comercial_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    apellido TEXT,
    telefono TEXT,
    email TEXT,
    fuente_id UUID REFERENCES comercial_sources(id) ON DELETE SET NULL,
    fuente_detalle TEXT, -- ej: "Publicación Hilux"
    vehiculo_interes TEXT,
    presupuesto_min NUMERIC,
    presupuesto_max NUMERIC,
    etapa_id UUID REFERENCES comercial_pipeline_stages(id) ON DELETE SET NULL,
    prioridad TEXT DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
    vendedor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    monto_cierre NUMERIC,
    motivo_perdida TEXT,
    tags TEXT[],
    notas TEXT,
    fecha_primer_contacto DATE DEFAULT CURRENT_DATE,
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Interacciones (timeline)
CREATE TABLE IF NOT EXISTS comercial_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES comercial_contacts(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('mensaje_entrante','respuesta_enviada','llamada','visita','nota','recordatorio','cambio_etapa')),
    descripcion TEXT,
    registrado_por UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Recordatorios
CREATE TABLE IF NOT EXISTS comercial_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES comercial_contacts(id) ON DELETE CASCADE,
    fecha TIMESTAMPTZ NOT NULL,
    nota TEXT,
    completado BOOLEAN DEFAULT false,
    creado_por UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Plantillas de respuesta rápida
CREATE TABLE IF NOT EXISTS comercial_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    contenido TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════ RLS ═══════════════

ALTER TABLE comercial_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercial_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_iso_comercial_stages" ON comercial_pipeline_stages
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_iso_comercial_sources" ON comercial_sources
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_iso_comercial_contacts" ON comercial_contacts
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_iso_comercial_interactions" ON comercial_interactions
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_iso_comercial_reminders" ON comercial_reminders
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_iso_comercial_templates" ON comercial_templates
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies for INSERT/UPDATE/DELETE (allow all operations for authenticated users in their tenant)
CREATE POLICY "tenant_insert_comercial_stages" ON comercial_pipeline_stages FOR INSERT
    WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_comercial_sources" ON comercial_sources FOR INSERT
    WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_comercial_contacts" ON comercial_contacts FOR INSERT
    WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_comercial_interactions" ON comercial_interactions FOR INSERT
    WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_comercial_reminders" ON comercial_reminders FOR INSERT
    WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_comercial_templates" ON comercial_templates FOR INSERT
    WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_update_comercial_stages" ON comercial_pipeline_stages FOR UPDATE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_comercial_sources" ON comercial_sources FOR UPDATE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_comercial_contacts" ON comercial_contacts FOR UPDATE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_comercial_interactions" ON comercial_interactions FOR UPDATE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_comercial_reminders" ON comercial_reminders FOR UPDATE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_comercial_templates" ON comercial_templates FOR UPDATE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_delete_comercial_contacts" ON comercial_contacts FOR DELETE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_comercial_interactions" ON comercial_interactions FOR DELETE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_comercial_reminders" ON comercial_reminders FOR DELETE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_comercial_templates" ON comercial_templates FOR DELETE
    USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
