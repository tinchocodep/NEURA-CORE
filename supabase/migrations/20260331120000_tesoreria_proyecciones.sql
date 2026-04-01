-- Proyecciones de flujo de caja para tesorería
create table if not exists tesoreria_proyecciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tipo text not null check (tipo in ('cobranza', 'pago')),
  concepto text not null,
  monto numeric(14,2) not null default 0,
  fecha_prevista date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'realizado', 'vencido', 'cancelado')),
  contacto text,
  categoria text,
  cuenta_destino_id uuid references treasury_accounts(id),
  notas text,
  proyecto_nombre text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_tesoreria_proyecciones_tenant on tesoreria_proyecciones(tenant_id);
create index idx_tesoreria_proyecciones_fecha on tesoreria_proyecciones(tenant_id, fecha_prevista);

alter table tesoreria_proyecciones enable row level security;

create policy "Tenant isolation" on tesoreria_proyecciones
  for all using (tenant_id = (current_setting('app.current_tenant', true))::uuid);
