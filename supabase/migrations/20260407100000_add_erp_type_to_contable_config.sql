-- ============================================================
-- Migración: agregar erp_type a contable_config
-- ============================================================
-- Campo que indica qué ERP contable usa cada tenant.
-- Se usa en conciliar y generar-reporte para saber contra
-- qué source comparar los comprobantes de ARCA.
-- ============================================================

-- 1. Agregar campo erp_type
ALTER TABLE contable_config
  ADD COLUMN IF NOT EXISTS erp_type text DEFAULT 'xubio'
    CHECK (erp_type IN ('xubio', 'colppy', 'manual'));

-- 2. Agregar sync-colppy como run_type válido en sync_runs
ALTER TABLE sync_runs DROP CONSTRAINT IF EXISTS sync_runs_run_type_check;
ALTER TABLE sync_runs ADD CONSTRAINT sync_runs_run_type_check
  CHECK (run_type IN ('sync-arca', 'sync-xubio', 'sync-colppy', 'conciliar', 'generar-reporte', 'full-pipeline'));
