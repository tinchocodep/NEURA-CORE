-- Tabla facturacion_emisores: entidades autorizadas a emitir comprobantes AFIP por cada tenant.
-- Un tenant con N razones sociales (ej: inmobiliaria con 3 CUITs) tiene N filas aca.
-- La fila con is_default = true se usa cuando no se especifica emisor_id al facturar.
-- Es multi-rubro: cualquier tenant (constructora, gestora, inmo, etc) puede tener sus emisores.
--
-- El cert y la key son de cada empresa (cada una las genera en AFIP con su clave fiscal).
-- El bearer de afipsdk.com NO vive aca: lo provee NeuraCore y se hardcodea en los nodos
-- n8n que lo necesitan (es compartido por todos los tenants).
--
-- Credenciales (cert_pem, key_pem) se guardan en plano en esta version inicial.
-- Deuda tecnica a saldar antes de produccion real: migrar a Supabase Vault o pgcrypto.

create table if not exists facturacion_emisores (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,

  cuit            text not null,
  razon_social    text not null,
  alias           text,

  punto_venta     integer not null,
  condicion_iva   text,
  environment     text not null default 'prod',

  cert_pem        text not null,
  key_pem         text not null,

  is_default      boolean not null default false,
  activo          boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (tenant_id, cuit)
);

create index if not exists idx_facturacion_emisores_tenant on facturacion_emisores(tenant_id);
create index if not exists idx_facturacion_emisores_tenant_default on facturacion_emisores(tenant_id) where is_default = true;

alter table facturacion_emisores enable row level security;

create policy "tenant_access" on facturacion_emisores
  for all
  using (tenant_id = (select tenant_id from users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from users where id = auth.uid()));

create policy "service_role_full_access" on facturacion_emisores
  for all
  to service_role
  using (true)
  with check (true);
