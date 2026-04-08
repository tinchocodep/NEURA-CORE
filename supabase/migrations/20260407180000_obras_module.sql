-- ============================================================================
-- MÓDULO OBRAS (constructora)
-- ============================================================================

-- 1. Fichas de Obra (amplía liq_obras)
create table if not exists obras_fichas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  direccion text,
  localidad text,
  estado text not null default 'activa' check (estado in ('activa','pausada','finalizada','en_licitacion')),
  tipo_obra text,
  comitente text,
  fecha_inicio date,
  fecha_estimada_fin date,
  superficie_m2 numeric(12,2),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_obras_fichas_tenant on obras_fichas(tenant_id);
alter table obras_fichas enable row level security;
create policy "tenant_access" on obras_fichas for all using (true) with check (true);

-- 2. Config: tipos de obra por tenant
create table if not exists obras_config_tipos_obra (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_config_tipos_tenant on obras_config_tipos_obra(tenant_id);
alter table obras_config_tipos_obra enable row level security;
create policy "tenant_access" on obras_config_tipos_obra for all using (true) with check (true);

-- 3. Config: roles de obra por tenant
create table if not exists obras_config_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_config_roles_tenant on obras_config_roles(tenant_id);
alter table obras_config_roles enable row level security;
create policy "tenant_access" on obras_config_roles for all using (true) with check (true);

-- 4. Roles jerárquicos asignados a obra
create table if not exists obras_fichas_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  rol_id uuid references obras_config_roles(id),
  persona_nombre text,
  empleado_id uuid,
  desde date,
  hasta date,
  created_at timestamptz not null default now()
);
create index idx_obras_fichas_roles_obra on obras_fichas_roles(obra_id);
alter table obras_fichas_roles enable row level security;
create policy "tenant_access" on obras_fichas_roles for all using (true) with check (true);

-- 5. Empleados asignados a obra
create table if not exists obras_fichas_empleados (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  empleado_id uuid not null,
  desde date,
  hasta date,
  created_at timestamptz not null default now()
);
create index idx_obras_fichas_empleados_obra on obras_fichas_empleados(obra_id);
alter table obras_fichas_empleados enable row level security;
create policy "tenant_access" on obras_fichas_empleados for all using (true) with check (true);

-- 6. Config: conceptos de costo (cargas sociales) por tenant
create table if not exists obras_config_conceptos_costo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  porcentaje numeric(6,2) not null default 0,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_config_costos_tenant on obras_config_conceptos_costo(tenant_id);
alter table obras_config_conceptos_costo enable row level security;
create policy "tenant_access" on obras_config_conceptos_costo for all using (true) with check (true);

-- 7. Config: rubros de presupuesto por tenant
create table if not exists obras_config_rubros_presupuesto (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_config_rubros_pres_tenant on obras_config_rubros_presupuesto(tenant_id);
alter table obras_config_rubros_presupuesto enable row level security;
create policy "tenant_access" on obras_config_rubros_presupuesto for all using (true) with check (true);

-- 8. Presupuestos (versionado por obra)
create table if not exists obras_presupuestos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  version int not null default 1,
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  unique (obra_id, version)
);
create index idx_obras_presupuestos_obra on obras_presupuestos(obra_id);
alter table obras_presupuestos enable row level security;
create policy "tenant_access" on obras_presupuestos for all using (true) with check (true);

-- 9. Items del presupuesto
create table if not exists obras_presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  presupuesto_id uuid not null references obras_presupuestos(id) on delete cascade,
  rubro_id uuid references obras_config_rubros_presupuesto(id),
  descripcion text not null,
  unidad text,
  cantidad numeric(14,4) not null default 0,
  precio_unitario numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_pres_items_pres on obras_presupuesto_items(presupuesto_id);
alter table obras_presupuesto_items enable row level security;
create policy "tenant_access" on obras_presupuesto_items for all using (true) with check (true);

-- 10. Certificados de avance
create table if not exists obras_certificados (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  numero int not null,
  fecha date not null,
  periodo text,
  archivo_url text,
  estado text not null default 'borrador' check (estado in ('borrador','aprobado','facturado','cobrado')),
  notas text,
  created_at timestamptz not null default now(),
  unique (obra_id, numero)
);
create index idx_obras_certificados_obra on obras_certificados(obra_id);
alter table obras_certificados enable row level security;
create policy "tenant_access" on obras_certificados for all using (true) with check (true);

-- 11. Detalle del certificado por item
create table if not exists obras_certificado_detalle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  certificado_id uuid not null references obras_certificados(id) on delete cascade,
  presupuesto_item_id uuid references obras_presupuesto_items(id),
  cantidad_periodo numeric(14,4) default 0,
  cantidad_acumulada numeric(14,4) default 0,
  porcentaje_avance numeric(6,2) default 0,
  monto_periodo numeric(14,2) default 0,
  monto_acumulado numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_cert_detalle_cert on obras_certificado_detalle(certificado_id);
alter table obras_certificado_detalle enable row level security;
create policy "tenant_access" on obras_certificado_detalle for all using (true) with check (true);

-- 12. Config: rubros de contratistas por tenant
create table if not exists obras_config_rubros_contratista (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_config_rubros_cont_tenant on obras_config_rubros_contratista(tenant_id);
alter table obras_config_rubros_contratista enable row level security;
create policy "tenant_access" on obras_config_rubros_contratista for all using (true) with check (true);

-- 13. Contratistas
create table if not exists obras_contratistas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  razon_social text not null,
  cuit text,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  rubro_id uuid references obras_config_rubros_contratista(id),
  condicion_iva text,
  cbu text,
  estado text not null default 'activo' check (estado in ('activo','inactivo','suspendido')),
  calificacion int check (calificacion between 1 and 5),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_obras_contratistas_tenant on obras_contratistas(tenant_id);
alter table obras_contratistas enable row level security;
create policy "tenant_access" on obras_contratistas for all using (true) with check (true);

-- 14. Documentacion de contratistas
create table if not exists obras_contratista_docs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contratista_id uuid not null references obras_contratistas(id) on delete cascade,
  tipo text not null check (tipo in ('art','seguro_vida','habilitacion','otro')),
  descripcion text,
  archivo_url text,
  fecha_emision date,
  fecha_vencimiento date,
  created_at timestamptz not null default now()
);
create index idx_obras_cont_docs_cont on obras_contratista_docs(contratista_id);
alter table obras_contratista_docs enable row level security;
create policy "tenant_access" on obras_contratista_docs for all using (true) with check (true);

-- 15. Cartas oferta
create table if not exists obras_cartas_oferta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  contratista_id uuid not null references obras_contratistas(id),
  numero int not null,
  version int not null default 1,
  fecha date not null default current_date,
  alcance text,
  plazo_ejecucion text,
  condiciones_pago text,
  penalidades text,
  observaciones text,
  estado text not null default 'borrador' check (estado in ('borrador','enviada','aceptada','rechazada','vencida')),
  monto_total numeric(14,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_obras_cartas_oferta_obra on obras_cartas_oferta(obra_id);
create index idx_obras_cartas_oferta_cont on obras_cartas_oferta(contratista_id);
alter table obras_cartas_oferta enable row level security;
create policy "tenant_access" on obras_cartas_oferta for all using (true) with check (true);

-- 16. Items de carta oferta
create table if not exists obras_carta_oferta_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  carta_oferta_id uuid not null references obras_cartas_oferta(id) on delete cascade,
  descripcion text not null,
  unidad text,
  cantidad numeric(14,4) default 0,
  precio_unitario numeric(14,2) default 0,
  subtotal numeric(14,2) default 0,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_carta_items_carta on obras_carta_oferta_items(carta_oferta_id);
alter table obras_carta_oferta_items enable row level security;
create policy "tenant_access" on obras_carta_oferta_items for all using (true) with check (true);

-- 17. Template de carta oferta por tenant
create table if not exists obras_carta_oferta_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  encabezado text,
  clausulas text,
  pie text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);
alter table obras_carta_oferta_template enable row level security;
create policy "tenant_access" on obras_carta_oferta_template for all using (true) with check (true);

-- 18. Config: categorias de documentacion por tenant
create table if not exists obras_config_categorias_doc (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  orden int default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_config_cat_doc_tenant on obras_config_categorias_doc(tenant_id);
alter table obras_config_categorias_doc enable row level security;
create policy "tenant_access" on obras_config_categorias_doc for all using (true) with check (true);

-- 19. Documentos de obra
create table if not exists obras_documentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  categoria_id uuid references obras_config_categorias_doc(id),
  descripcion text,
  archivo_url text,
  archivo_nombre text,
  version int default 1,
  fecha date,
  subido_por text,
  fecha_vencimiento date,
  created_at timestamptz not null default now()
);
create index idx_obras_documentos_obra on obras_documentos(obra_id);
alter table obras_documentos enable row level security;
create policy "tenant_access" on obras_documentos for all using (true) with check (true);

-- 20. Partes diarios
create table if not exists obras_partes_diarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  fecha date not null,
  autor text,
  clima text check (clima in ('soleado','nublado','lluvia','lluvia_intensa')),
  se_trabajo text not null default 'si' check (se_trabajo in ('si','no','parcial')),
  motivo_no_trabajo text,
  personal_presente int,
  tareas_realizadas text,
  incidentes text,
  observaciones text,
  created_at timestamptz not null default now()
);
create index idx_obras_partes_diarios_obra on obras_partes_diarios(obra_id);
create index idx_obras_partes_diarios_fecha on obras_partes_diarios(obra_id, fecha);
alter table obras_partes_diarios enable row level security;
create policy "tenant_access" on obras_partes_diarios for all using (true) with check (true);

-- 21. Pedidos de materiales
create table if not exists obras_materiales_pedidos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  obra_id uuid not null references obras_fichas(id) on delete cascade,
  proveedor text,
  fecha_pedido date not null default current_date,
  fecha_estimada_entrega date,
  fecha_real_entrega date,
  estado text not null default 'pedido' check (estado in ('pedido','en_camino','recibido_parcial','recibido','cancelado')),
  remito_url text,
  notas text,
  total numeric(14,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_obras_mat_pedidos_obra on obras_materiales_pedidos(obra_id);
alter table obras_materiales_pedidos enable row level security;
create policy "tenant_access" on obras_materiales_pedidos for all using (true) with check (true);

-- 22. Items del pedido
create table if not exists obras_materiales_pedido_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pedido_id uuid not null references obras_materiales_pedidos(id) on delete cascade,
  material text not null,
  cantidad numeric(14,4) default 0,
  unidad text,
  precio_unitario numeric(14,2) default 0,
  subtotal numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_mat_items_pedido on obras_materiales_pedido_items(pedido_id);
alter table obras_materiales_pedido_items enable row level security;
create policy "tenant_access" on obras_materiales_pedido_items for all using (true) with check (true);

-- 23. Vencimientos (generados automaticamente)
create table if not exists obras_vencimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entidad_tipo text not null check (entidad_tipo in ('contratista','empleado','obra')),
  entidad_id uuid not null,
  tipo text not null,
  descripcion text,
  fecha_vencimiento date not null,
  dias_anticipacion int not null default 30,
  created_at timestamptz not null default now()
);
create index idx_obras_vencimientos_tenant on obras_vencimientos(tenant_id);
create index idx_obras_vencimientos_fecha on obras_vencimientos(tenant_id, fecha_vencimiento);
alter table obras_vencimientos enable row level security;
create policy "tenant_access" on obras_vencimientos for all using (true) with check (true);

-- 24. F931 encabezado
create table if not exists obras_f931 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  periodo text not null,
  archivo_url text,
  notas text,
  created_at timestamptz not null default now(),
  unique (tenant_id, periodo)
);
create index idx_obras_f931_tenant on obras_f931(tenant_id);
alter table obras_f931 enable row level security;
create policy "tenant_access" on obras_f931 for all using (true) with check (true);

-- 25. F931 detalle por empleado
create table if not exists obras_f931_detalle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  f931_id uuid not null references obras_f931(id) on delete cascade,
  empleado_nombre text,
  empleado_cuil text,
  remuneracion_imponible numeric(14,2) default 0,
  aportes_personales numeric(14,2) default 0,
  contribuciones_patronales numeric(14,2) default 0,
  obra_social numeric(14,2) default 0,
  sindicato numeric(14,2) default 0,
  created_at timestamptz not null default now()
);
create index idx_obras_f931_detalle_f931 on obras_f931_detalle(f931_id);
alter table obras_f931_detalle enable row level security;
create policy "tenant_access" on obras_f931_detalle for all using (true) with check (true);
