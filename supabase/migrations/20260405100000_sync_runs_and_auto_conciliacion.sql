-- ============================================================
-- Migración: sync_runs + campos de auto-conciliación
-- ============================================================
-- Tabla de logs para sincronizaciones automáticas y manuales.
-- Campos nuevos en contable_config para el interruptor on/off
-- y configuración de la automatización.
-- ============================================================

-- 1. Tabla sync_runs (historial de ejecuciones)
create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_type text not null check (run_type in (
    'sync-arca', 'sync-xubio', 'conciliar', 'generar-reporte', 'full-pipeline'
  )),
  status text not null default 'running' check (status in (
    'running', 'success', 'error', 'partial'
  )),
  fecha_desde date,
  fecha_hasta date,
  records_imported int default 0,
  records_updated int default 0,
  records_skipped int default 0,
  records_failed int default 0,
  error_messages jsonb default '[]'::jsonb,
  result_summary jsonb default '{}'::jsonb,
  triggered_by text default 'manual' check (triggered_by in ('manual', 'n8n', 'cron')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index idx_sync_runs_tenant on sync_runs(tenant_id);
create index idx_sync_runs_type on sync_runs(tenant_id, run_type);
create index idx_sync_runs_status on sync_runs(status);
create index idx_sync_runs_created on sync_runs(tenant_id, created_at desc);

alter table sync_runs enable row level security;

-- Los usuarios solo ven runs de su tenant
create policy "sync_runs_tenant_select" on sync_runs
  for select using (
    tenant_id in (select tenant_id from users where id = auth.uid())
  );

-- Las Edge Functions usan service_role key, que bypasea RLS

-- 2. Campos de auto-conciliación en contable_config
alter table contable_config
  add column if not exists auto_conciliacion_enabled boolean default false,
  add column if not exists auto_conciliacion_emails text,
  add column if not exists auto_conciliacion_frequency text default 'weekly'
    check (auto_conciliacion_frequency in ('daily', 'weekly', 'monthly'));
