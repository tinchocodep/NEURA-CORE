-- ============================================================================
-- CENTRO DE COSTOS - RUBRO CONSTRUCTORA (AFG)
-- ============================================================================
-- Cambios no destructivos: solo ADD COLUMN NULL y CREATE TABLE.
-- Cero impacto en otros tenants/rubros.
-- ============================================================================

-- 1) contable_categorias: jerarquía 1 → 2 → 3 niveles
alter table contable_categorias
  add column if not exists parent_id uuid null references contable_categorias(id) on delete cascade,
  add column if not exists orden int null default 0;

create index if not exists idx_contable_categorias_parent on contable_categorias(parent_id);
create index if not exists idx_contable_categorias_tenant_parent on contable_categorias(tenant_id, parent_id);

-- 2) contable_comprobantes: nuevo proyecto_id (apunta a treasury_projects, la lista buena)
--    y comprobante_origen_id para devoluciones (hook futuro)
alter table contable_comprobantes
  add column if not exists proyecto_id uuid null references treasury_projects(id) on delete set null,
  add column if not exists comprobante_origen_id uuid null references contable_comprobantes(id) on delete set null;

create index if not exists idx_contable_comprobantes_proyecto on contable_comprobantes(proyecto_id);
create index if not exists idx_contable_comprobantes_tenant_proyecto on contable_comprobantes(tenant_id, proyecto_id);

-- 3) contable_proveedores: defaults para auto-clasificación de gastos
--    (categoria_default_id ya existe; agrego sub-categoria y centro de costos default)
alter table contable_proveedores
  add column if not exists subcategoria_default_id uuid null references contable_categorias(id) on delete set null,
  add column if not exists centro_costo_default_id uuid null references treasury_projects(id) on delete set null;

-- 4) treasury_projects: flag para marcar el centro "global" (AFG CONST)
alter table treasury_projects
  add column if not exists is_global boolean null default false;

-- 5) Tabla pivot para prorrateo de un gasto entre múltiples centros (hook futuro)
--    Convención: si un comprobante NO tiene filas acá, va 100% a su proyecto_id.
--    Si tiene filas, se usa el prorrateo.
create table if not exists contable_comprobante_centros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  comprobante_id uuid not null references contable_comprobantes(id) on delete cascade,
  proyecto_id uuid not null references treasury_projects(id) on delete cascade,
  porcentaje numeric(5,2) null,
  monto numeric(14,2) null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ccc_tenant on contable_comprobante_centros(tenant_id);
create index if not exists idx_ccc_comprobante on contable_comprobante_centros(comprobante_id);
create index if not exists idx_ccc_proyecto on contable_comprobante_centros(proyecto_id);

alter table contable_comprobante_centros enable row level security;
create policy "ccc_tenant_isolation" on contable_comprobante_centros
  for all
  using (tenant_id = (select tenant_id from users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from users where id = auth.uid()));
