-- Paso F del plan anti-duplicados:
-- Unique constraint final sobre la clave natural de un comprobante.
--
-- Precondición: no debe haber duplicados en la tabla (caso contrario la migration aborta).
-- Se aplica DESPUES de:
--   - Activar upsertComprobante / logica de sources[] en los syncs ARCA y Xubio (hecho).
--   - Consolidar/limpiar duplicados existentes (Bautista hizo DELETE masivo).
--
-- Con este constraint, la DB rechaza cualquier INSERT que intente meter un duplicado
-- cross-source. Las syncs ya usan upsert, pero este es el cinturon de seguridad.
--
-- Clave: (tenant_id, tipo, tipo_comprobante, numero_comprobante, cuit_emisor, cuit_receptor)
-- NULLS NOT DISTINCT: trata dos filas con cuit_emisor=NULL como duplicadas entre si.
-- Requiere PostgreSQL 15+.
--
-- REVERT: drop constraint uq_comprobantes_natural_key;

alter table contable_comprobantes
  add constraint uq_comprobantes_natural_key
  unique nulls not distinct
  (tenant_id, tipo, tipo_comprobante, numero_comprobante, cuit_emisor, cuit_receptor);

comment on constraint uq_comprobantes_natural_key on contable_comprobantes is
  'Impide duplicados cross-source (ARCA + Xubio + manual). Paso F del plan anti-duplicados.';
