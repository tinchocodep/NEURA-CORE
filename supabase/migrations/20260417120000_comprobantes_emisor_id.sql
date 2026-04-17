-- Agrega columna emisor_id a contable_comprobantes para trazar qué razón social emitió
-- cada comprobante. Apunta a facturacion_emisores (tabla multi-tenant con N razones
-- sociales por tenant).
--
-- Se deja nullable: los comprobantes legacy (y los que vienen por sync ARCA/Xubio sin
-- selección manual de emisor) no tienen este dato. Solo se completa cuando el usuario
-- emite desde Facturar y elige emisor.
--
-- on delete set null: si se borra un emisor, los comprobantes que emitió siguen existiendo
-- pero pierden la referencia (el CUIT/razón social ya quedó guardado en el PDF/AFIP).

alter table contable_comprobantes
  add column if not exists emisor_id uuid references facturacion_emisores(id) on delete set null;

create index if not exists idx_comprobantes_emisor_id
  on contable_comprobantes(emisor_id)
  where emisor_id is not null;

comment on column contable_comprobantes.emisor_id is
  'Razón social que emitió el comprobante (FK a facturacion_emisores). Null en comprobantes legacy o sincronizados.';
