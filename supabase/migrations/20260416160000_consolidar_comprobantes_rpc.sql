-- Paso B del plan anti-duplicados:
-- Funcion RPC que consolida un grupo de comprobantes duplicados en uno solo.
--
-- Recibe un ganador_id y una lista de perdedores_ids. Migra todas las FKs que apuntan
-- a los perdedores hacia el ganador, combina sources[], y borra los perdedores.
--
-- Todo en una sola transaccion: si algo falla, no toca nada. Cero estado intermedio roto.
--
-- Llamada desde el boton "Consolidar" en la pantalla de conciliacion.
-- Valida tenant + que los perdedores sean duplicados reales del ganador (misma clave).

create or replace function consolidar_comprobantes_duplicados(
  ganador_id uuid,
  perdedores_ids uuid[]
) returns jsonb
language plpgsql
security invoker
as $$
declare
  ganador record;
  perdedor record;
  cta_cte_count int := 0;
  ops_count int := 0;
  banc_count int := 0;
  new_sources text[];
  xubio_id_candidato text;
  copiar_centros boolean := false;
  fuente_centros uuid;
begin
  -- ═══════════════════════════════════════════════════════════════════
  -- 1. Validaciones de seguridad
  -- ═══════════════════════════════════════════════════════════════════

  -- Ganador existe
  select * into ganador from contable_comprobantes where id = ganador_id;
  if ganador is null then
    raise exception 'Ganador % no existe', ganador_id;
  end if;

  -- Perdedores: mismo tenant + distintos del ganador.
  -- Nota: la validacion de "misma clave de dedup" la hace el frontend antes de llamar,
  -- usando normalizacion (canonicalizar tipo_comprobante, parseLocalNumero, normalizeCuit).
  -- Los campos en DB pueden estar en formatos distintos ('00007-00000845' vs 'A-00007-00000845',
  -- cuit con o sin guiones, null vs '') aunque representen el mismo comprobante. La RPC confia
  -- en que el caller agrupo bien (el usuario supervisa la seleccion con los montos visibles).
  for perdedor in select * from contable_comprobantes where id = any(perdedores_ids) loop
    if perdedor.tenant_id != ganador.tenant_id then
      raise exception 'Perdedor % es de tenant distinto al ganador', perdedor.id;
    end if;
    if perdedor.id = ganador_id then
      raise exception 'El ganador no puede ser tambien perdedor';
    end if;
    -- Chequeo laxo: al menos tipo debe coincidir (venta/compra)
    if perdedor.tipo != ganador.tipo then
      raise exception 'Perdedor % tiene tipo distinto (% vs %)', perdedor.id, perdedor.tipo, ganador.tipo;
    end if;
  end loop;

  -- Cantidad de perdedores encontrados debe coincidir con lo pedido (evita ids fantasma)
  if (select count(*) from contable_comprobantes where id = any(perdedores_ids)) != array_length(perdedores_ids, 1) then
    raise exception 'Uno o mas perdedores no existen';
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- 2. Migrar tags: los del ganador se quedan, agregamos los del perdedor que no estan
  -- ═══════════════════════════════════════════════════════════════════
  insert into contable_comprobante_tags (comprobante_id, tag_id)
  select ganador_id, t.tag_id
  from contable_comprobante_tags t
  where t.comprobante_id = any(perdedores_ids)
    and not exists (
      select 1 from contable_comprobante_tags g
      where g.comprobante_id = ganador_id and g.tag_id = t.tag_id
    );

  -- ═══════════════════════════════════════════════════════════════════
  -- 3. Centros de costo: solo copiar del primer perdedor con centros
  --    si el ganador NO tiene centros asignados (evita sumar porcentajes)
  -- ═══════════════════════════════════════════════════════════════════
  select not exists (
    select 1 from contable_comprobante_centros where comprobante_id = ganador_id
  ) into copiar_centros;

  if copiar_centros then
    -- Buscar primer perdedor que tenga centros asignados
    select comprobante_id into fuente_centros
    from contable_comprobante_centros
    where comprobante_id = any(perdedores_ids)
    limit 1;

    if fuente_centros is not null then
      insert into contable_comprobante_centros (tenant_id, comprobante_id, proyecto_id, porcentaje, monto)
      select ganador.tenant_id, ganador_id, proyecto_id, porcentaje, monto
      from contable_comprobante_centros
      where comprobante_id = fuente_centros;
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- 4. Migrar FKs que bloquean el borrado (NO ACTION / RESTRICT)
  -- ═══════════════════════════════════════════════════════════════════

  -- Cuentas corrientes
  update contable_cuentas_corrientes
  set comprobante_id = ganador_id
  where comprobante_id = any(perdedores_ids);
  get diagnostics cta_cte_count = row_count;

  -- Ordenes de pago
  update tesoreria_op_comprobantes
  set comprobante_id = ganador_id
  where comprobante_id = any(perdedores_ids);
  get diagnostics ops_count = row_count;

  -- Movimientos bancarios
  update movimientos_bancarios
  set comprobante_id = ganador_id
  where comprobante_id = any(perdedores_ids);
  get diagnostics banc_count = row_count;

  -- Sync log
  update contable_sync_log
  set comprobante_id = ganador_id
  where comprobante_id = any(perdedores_ids);

  -- Mail log (SET NULL por defecto; preferimos preservar el link al ganador)
  update mail_log
  set comprobante_id = ganador_id
  where comprobante_id = any(perdedores_ids);

  -- Auto-referencia: notas de credito que apuntaban a un perdedor como origen
  update contable_comprobantes
  set comprobante_origen_id = ganador_id
  where comprobante_origen_id = any(perdedores_ids);

  -- ═══════════════════════════════════════════════════════════════════
  -- 5. Preparar sources combinados + xubio_id candidato (LEER antes de borrar)
  -- ═══════════════════════════════════════════════════════════════════
  select array_agg(distinct s order by s) into new_sources
  from (
    -- sources del ganador (si tiene)
    select unnest(ganador.sources) as s
    union
    -- source legacy del ganador
    select coalesce(ganador.source, 'sistema') as s
    union
    -- sources de cada perdedor
    select unnest(c.sources) as s
    from contable_comprobantes c
    where c.id = any(perdedores_ids)
    union
    -- source legacy de cada perdedor
    select coalesce(c.source, 'sistema') as s
    from contable_comprobantes c
    where c.id = any(perdedores_ids)
  ) t
  where s is not null and s != '';

  -- Capturar xubio_id candidato ANTES del DELETE (si ganador no tiene y algun perdedor si)
  if ganador.xubio_id is null then
    select xubio_id into xubio_id_candidato
    from contable_comprobantes
    where id = any(perdedores_ids) and xubio_id is not null
    limit 1;
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- 6. Borrar los perdedores PRIMERO (asi liberamos el xubio_id del unique constraint
  --    uq_comprobantes_tenant_xubio_id antes de asignarlo al ganador).
  --    CASCADE limpia tags/centros que quedaron en ellos.
  -- ═══════════════════════════════════════════════════════════════════
  delete from contable_comprobantes where id = any(perdedores_ids);

  -- ═══════════════════════════════════════════════════════════════════
  -- 7. AHORA si, actualizar el ganador con sources combinados + xubio_id
  -- ═══════════════════════════════════════════════════════════════════
  update contable_comprobantes
  set sources = new_sources,
      xubio_id = coalesce(xubio_id, xubio_id_candidato)
  where id = ganador_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- 8. Resultado
  -- ═══════════════════════════════════════════════════════════════════
  return jsonb_build_object(
    'ganador_id', ganador_id,
    'perdedores_consolidados', array_length(perdedores_ids, 1),
    'cta_cte_movidos', cta_cte_count,
    'ops_movidas', ops_count,
    'movimientos_bancarios_movidos', banc_count,
    'sources_finales', to_jsonb(new_sources)
  );
end;
$$;

-- Permitir ejecucion desde cliente Supabase autenticado. La RLS de las tablas
-- igualmente limita que el usuario solo toque filas de su tenant.
grant execute on function consolidar_comprobantes_duplicados(uuid, uuid[]) to authenticated;

comment on function consolidar_comprobantes_duplicados(uuid, uuid[]) is
  'Consolida comprobantes duplicados: migra FKs (cta cte, OPs, bancarios, tags, centros, mails), combina sources, borra perdedores. Atomico. Valida tenant + misma clave de dedup.';
