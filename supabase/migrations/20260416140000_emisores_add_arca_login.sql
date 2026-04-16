-- Agrega columnas arca_username y arca_password a facturacion_emisores.
-- Estas credenciales se usan para pullear "Mis Comprobantes" de AFIP (comprobantes recibidos).
-- Son distintas del cert/key (que es para emitir facturas propias).
-- Asi cada razon social tiene TODO lo de AFIP junto: emision + recepcion.
--
-- Se guardan en plano como el resto de credenciales (deuda tecnica a saldar antes de prod real).

alter table facturacion_emisores
  add column if not exists arca_username text,
  add column if not exists arca_password text;

-- Seed: para cada emisor que ya existe, copiar el username/password del contable_config del tenant
-- (ese era el lugar viejo donde se guardaban). Solo se copia si el emisor no tiene credenciales ya cargadas.
update facturacion_emisores e
set
  arca_username = cc.arca_username,
  arca_password = cc.arca_password
from contable_config cc
where cc.tenant_id = e.tenant_id
  and e.arca_username is null
  and e.arca_password is null
  and cc.arca_username is not null
  and cc.arca_password is not null;
