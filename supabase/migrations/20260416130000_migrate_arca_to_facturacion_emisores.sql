-- Migracion de datos: copiar los certs/keys ARCA existentes en contable_config
-- hacia la nueva tabla facturacion_emisores (una fila default por tenant).
--
-- Idempotente: usa ON CONFLICT para no duplicar si se corre mas de una vez.
-- Los campos arca_* de contable_config quedan intactos por ahora (legacy, se borran en otra migracion).

insert into facturacion_emisores (
  tenant_id,
  cuit,
  razon_social,
  alias,
  punto_venta,
  condicion_iva,
  environment,
  cert_pem,
  key_pem,
  is_default,
  activo
)
select
  cc.tenant_id,
  coalesce(cc.arca_cuit, t.cuit, '')                                   as cuit,
  coalesce(t.razon_social, t.name, 'Razon social')                      as razon_social,
  null                                                                  as alias,
  coalesce(cc.punto_venta, 1)                                           as punto_venta,
  null                                                                  as condicion_iva,
  'prod'                                                                as environment,
  cc.arca_certificate                                                   as cert_pem,
  cc.arca_private_key                                                   as key_pem,
  true                                                                  as is_default,
  true                                                                  as activo
from contable_config cc
join tenants t on t.id = cc.tenant_id
where cc.arca_certificate is not null
  and cc.arca_private_key is not null
  and coalesce(cc.arca_cuit, t.cuit, '') <> ''
on conflict (tenant_id, cuit) do nothing;

-- Seed de flag facturacion_afip para los tenants que ya tenian cert ARCA cargado.
-- Se hace en UPDATE que deja el array intacto si ya contenia el flag.
update tenants t
set enabled_modules = (
  case
    when enabled_modules is null then '["facturacion_afip"]'::jsonb
    when not (enabled_modules @> '["facturacion_afip"]'::jsonb) then enabled_modules || '["facturacion_afip"]'::jsonb
    else enabled_modules
  end
)
where exists (
  select 1 from facturacion_emisores e where e.tenant_id = t.id
);
