-- Paso A del plan anti-duplicados:
-- Agregar columna sources text[] a contable_comprobantes + backfill desde la columna source actual.
--
-- Objetivo: una factura que viene por varias fuentes (ARCA, Xubio, manual) va a quedar
-- en una sola fila con sources = ['arca', 'xubio', 'manual'] en vez de 3 filas separadas.
--
-- Este archivo NO aplica unique constraint todavia. El constraint se aplica en un archivo
-- posterior, DESPUES de consolidar los duplicados existentes (si no, fallaria).
--
-- Safe: solo agrega columna + backfill. No borra, no modifica comportamiento existente,
-- no rompe flujos de ningun rubro (agro, inmobiliaria, constructora, etc).
-- El codigo existente sigue leyendo y escribiendo la columna `source` original sin cambios.

-- 1. Columna sources (array de texto, nunca NULL, default vacio)
alter table contable_comprobantes
  add column if not exists sources text[] not null default '{}';

-- 2. Backfill: cada fila existente arranca con su source actual como unico elemento.
--    Si source estaba NULL, le asignamos 'sistema' como identificador generico.
--    Solo actua sobre filas donde sources todavia esta vacio (idempotente: si se corre
--    multiples veces, no rompe nada).
update contable_comprobantes
set sources = array[coalesce(source, 'sistema')]
where cardinality(sources) = 0;

-- 3. Indice para lookups rapidos por la clave de dedup (se va a usar en el upsert y en consolidar)
create index if not exists idx_comprobantes_match_key
  on contable_comprobantes (tenant_id, tipo, tipo_comprobante, numero_comprobante);

-- Nota: la columna `source` original se mantiene para retrocompatibilidad.
-- El codigo existente que lee/escribe `source` sigue funcionando.
-- Las nuevas escrituras deberian poblar `sources` en paralelo usando el helper upsertComprobante.
