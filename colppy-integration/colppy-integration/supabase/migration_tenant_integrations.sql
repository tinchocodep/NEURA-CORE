-- ============================================================
-- Migración: Tabla de integraciones ERP por tenant
-- ============================================================
-- Soporta múltiples ERPs (Xubio, Colppy, etc.) por tenant.
-- Las credenciales se guardan encriptadas con pgcrypto.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- Habilitar extensión de encriptación si no está habilitada
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabla principal de integraciones por tenant
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Tipo de ERP: 'colppy', 'xubio', etc.
  provider TEXT NOT NULL,

  -- Estado de la integración
  status TEXT NOT NULL DEFAULT 'pending_setup'
    CHECK (status IN ('pending_setup', 'active', 'error', 'disabled')),

  -- Credenciales encriptadas (JSON encriptado con pgp_sym_encrypt)
  -- Para Colppy: { apiUser, apiPasswordMD5, userEmail, userPasswordMD5, idEmpresa }
  -- Para Xubio: { apiKey, userToken }
  credentials_encrypted BYTEA,

  -- Datos no-sensibles de la integración
  config JSONB DEFAULT '{}'::jsonb,

  -- Última sincronización exitosa
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Un tenant solo puede tener una integración activa por provider
  UNIQUE(tenant_id, provider)
);

-- Índices
CREATE INDEX idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX idx_tenant_integrations_provider ON tenant_integrations(provider);
CREATE INDEX idx_tenant_integrations_status ON tenant_integrations(status);

-- RLS (Row Level Security)
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

-- Solo usuarios del mismo tenant pueden ver/editar sus integraciones
CREATE POLICY "tenant_integrations_select" ON tenant_integrations
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Solo admins del tenant pueden insertar/actualizar
CREATE POLICY "tenant_integrations_insert" ON tenant_integrations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "tenant_integrations_update" ON tenant_integrations
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_tenant_integrations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_integrations_updated
  BEFORE UPDATE ON tenant_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_integrations_timestamp();

-- ============================================================
-- Funciones para encriptar/desencriptar credenciales
-- ============================================================
-- IMPORTANTE: La encryption_key debe estar en una variable de
-- entorno de Supabase, NO hardcodeada. Usamos una función
-- que la lee del vault.
-- ============================================================

-- Función para guardar credenciales encriptadas
CREATE OR REPLACE FUNCTION save_integration_credentials(
  p_tenant_id UUID,
  p_provider TEXT,
  p_credentials JSONB,
  p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_encryption_key TEXT;
  v_id UUID;
BEGIN
  -- Leer la key de encriptación del vault de Supabase
  -- (debés configurar este secret en Supabase Dashboard > Vault)
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'INTEGRATION_ENCRYPTION_KEY'
  LIMIT 1;

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in vault. Add INTEGRATION_ENCRYPTION_KEY to Supabase Vault.';
  END IF;

  INSERT INTO tenant_integrations (tenant_id, provider, credentials_encrypted, config, status)
  VALUES (
    p_tenant_id,
    p_provider,
    pgp_sym_encrypt(p_credentials::text, v_encryption_key),
    p_config,
    'active'
  )
  ON CONFLICT (tenant_id, provider) DO UPDATE SET
    credentials_encrypted = pgp_sym_encrypt(p_credentials::text, v_encryption_key),
    config = COALESCE(p_config, tenant_integrations.config),
    status = 'active',
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para leer credenciales desencriptadas (solo desde Edge Functions)
CREATE OR REPLACE FUNCTION get_integration_credentials(
  p_tenant_id UUID,
  p_provider TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_encryption_key TEXT;
  v_credentials TEXT;
BEGIN
  SELECT decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'INTEGRATION_ENCRYPTION_KEY'
  LIMIT 1;

  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in vault';
  END IF;

  SELECT pgp_sym_decrypt(credentials_encrypted, v_encryption_key)
  INTO v_credentials
  FROM tenant_integrations
  WHERE tenant_id = p_tenant_id
    AND provider = p_provider
    AND status = 'active';

  IF v_credentials IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_credentials::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tabla de log de sincronizaciones (opcional pero útil)
CREATE TABLE IF NOT EXISTS integration_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES tenant_integrations(id) ON DELETE CASCADE,
  operation TEXT NOT NULL, -- 'sync_factura', 'sync_cliente', etc.
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  records_processed INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  error_details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sync_log_integration ON integration_sync_log(integration_id);
CREATE INDEX idx_sync_log_status ON integration_sync_log(status);
