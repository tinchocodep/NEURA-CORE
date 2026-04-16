-- contable_comprobantes: dedup a nivel sistema
-- Un mismo comprobante puede estar reportado por multiples fuentes (ARCA, Xubio, sistema manual).
-- En vez de crear una fila por fuente, tenemos UNA fila por comprobante y una columna 'sources'
-- que lista todas las fuentes que lo confirmaron.
--
-- Ademas agregamos unique constraint para que la base garantice que no haya duplicados a futuro.
-- NULLS NOT DISTINCT = Postgres trata NULL como valor unico (dos filas con cuit_emisor NULL
-- NO se consideran distintas, por lo que no se permiten duplicados aunque algun CUIT sea NULL).

-- 1. Columna sources
alter table contable_comprobantes
  add column if not exists sources text[] not null default '{}';

-- 2. Backfill: si la columna source tiene un valor, arrancamos sources con ese valor unico
update contable_comprobantes
set sources = array[coalesce(source, 'sistema')]
where cardinality(sources) = 0;

-- 3. Unique constraint con NULLS NOT DISTINCT (Postgres 15+)
-- Si el constraint ya existe por alguna corrida previa, lo ignoramos con un do block
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contable_comprobantes_unique_key'
      and conrelid = 'contable_comprobantes'::regclass
  ) then
    alter table contable_comprobantes
      add constraint contable_comprobantes_unique_key
      unique nulls not distinct (
        tenant_id,
        tipo,
        tipo_comprobante,
        numero_comprobante,
        cuit_emisor,
        cuit_receptor
      );
  end if;
end $$;

-- 4. Indice para lookups rapidos por la clave del upsert
create index if not exists idx_comprobantes_match_key
  on contable_comprobantes (tenant_id, tipo, tipo_comprobante, numero_comprobante);
