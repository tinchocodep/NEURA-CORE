-- ============================================================================
-- contable_proveedores: agregar columna provincia
-- ============================================================================
-- Para guardar la jurisdicción fiscal traída de ARCA o cargada manualmente.
-- Cero impacto en otros tenants (columna nullable).
-- ============================================================================

alter table contable_proveedores
  add column if not exists provincia text null;
