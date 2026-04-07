-- ============================================================
-- Migración: chatbot_memory
-- ============================================================
-- Historial de conversaciones del chatbot Neura por usuario.
-- Permite que Neura recuerde contexto de conversaciones previas.
-- ============================================================

CREATE TABLE IF NOT EXISTS chatbot_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chatbot_memory_lookup
  ON chatbot_memory(tenant_id, chat_id, created_at DESC);

-- RLS: usuarios solo ven mensajes de su tenant
ALTER TABLE chatbot_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatbot_memory_tenant_select" ON chatbot_memory
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Auto-limpieza: borrar mensajes de más de 30 días
-- (ejecutar como cron en Supabase o n8n)
-- DELETE FROM chatbot_memory WHERE created_at < now() - interval '30 days';
