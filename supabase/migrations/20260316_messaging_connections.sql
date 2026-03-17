-- ============================================================
-- Migración: Conexiones de mensajería por tenant
-- Soporta múltiples conexiones por plataforma por tenant.
-- Telegram hoy, WhatsApp/Slack en el futuro.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS messaging_connections (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Plataforma: 'telegram', 'whatsapp', 'slack', etc.
    provider         TEXT NOT NULL CHECK (provider IN ('telegram', 'whatsapp', 'slack')),

    -- Nombre que le da el admin a esta conexión ("Facturación", "Gerencia")
    name             TEXT NOT NULL DEFAULT 'Sin nombre',

    -- ID externo del sender: chat_id para Telegram, número para WhatsApp
    -- NULL mientras está en estado 'pending' (esperando vinculación)
    external_id      TEXT,

    -- Nombre visible del usuario externo (@username o nombre en Telegram)
    external_name    TEXT,

    -- Estado del ciclo de vida
    status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'active', 'inactive')),

    -- Código temporal generado para la vinculación (ej: "ANTI-4X7K")
    -- Solo presente mientras status='pending'. Se limpia al activar.
    connection_code  TEXT UNIQUE,
    code_expires_at  TIMESTAMPTZ,

    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_messaging_connections_tenant
    ON messaging_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_messaging_connections_provider
    ON messaging_connections(tenant_id, provider);

-- Buscar conexión por código (lo usa n8n para vincular)
CREATE INDEX IF NOT EXISTS idx_messaging_connections_code
    ON messaging_connections(connection_code)
    WHERE connection_code IS NOT NULL;

-- Buscar por external_id (lo usa n8n para identificar el tenant en cada mensaje)
CREATE INDEX IF NOT EXISTS idx_messaging_connections_external
    ON messaging_connections(provider, external_id)
    WHERE external_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_messaging_connections_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messaging_connections_updated ON messaging_connections;
CREATE TRIGGER trg_messaging_connections_updated
    BEFORE UPDATE ON messaging_connections
    FOR EACH ROW EXECUTE FUNCTION update_messaging_connections_timestamp();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE messaging_connections ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario del tenant
CREATE POLICY "mc_select" ON messaging_connections
    FOR SELECT USING (
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

-- Insertar: solo admin/superadmin
CREATE POLICY "mc_insert" ON messaging_connections
    FOR INSERT WITH CHECK (
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
        AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'superadmin')
    );

-- Actualizar: solo admin/superadmin (la app) o SECURITY DEFINER function (n8n via Edge Function)
CREATE POLICY "mc_update" ON messaging_connections
    FOR UPDATE USING (
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
        AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'superadmin')
    );

-- Eliminar: solo admin/superadmin
CREATE POLICY "mc_delete" ON messaging_connections
    FOR DELETE USING (
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
        AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'superadmin')
    );

-- ── Función para que n8n active la conexión sin pasar por RLS ────────────────
-- n8n llama esta función via Supabase service_role (no anon key).
-- Recibe el código y el chat_id del usuario que envió /vincular.
CREATE OR REPLACE FUNCTION activate_messaging_connection(
    p_code        TEXT,
    p_external_id TEXT,
    p_external_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row messaging_connections;
BEGIN
    -- Buscar la conexión pendiente con ese código (no expirada)
    SELECT * INTO v_row
    FROM messaging_connections
    WHERE connection_code = p_code
      AND status = 'pending'
      AND code_expires_at > NOW();

    IF v_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código inválido o expirado');
    END IF;

    -- Activar la conexión
    UPDATE messaging_connections
    SET
        status          = 'active',
        external_id     = p_external_id,
        external_name   = p_external_name,
        connection_code = NULL,       -- limpiar el código usado
        code_expires_at = NULL
    WHERE id = v_row.id;

    RETURN jsonb_build_object(
        'success',     true,
        'tenant_id',   v_row.tenant_id,
        'connection_id', v_row.id,
        'name',        v_row.name
    );
END;
$$;
