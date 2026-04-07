# Módulo Obras — AFG Constructora (rubro: constructora)

**Fecha:** 2026-04-07
**Tenant target:** AFG Constructora (rubro: `constructora`)
**Módulo:** `obras` (nuevo, independiente de `liquidaciones`)
**Disponibilidad:** Cualquier tenant de rubro `constructora`, submódulos habilitables individualmente

---

## Resumen

Módulo de gestión integral de obras para constructoras. Centraliza fichas de obra, equipo, presupuesto, certificados de avance, contratistas, cartas oferta, documentación, partes diarios, materiales, vencimientos, F931 y reportes de rentabilidad.

Se integra con el módulo `liquidaciones` existente para cruzar costos de mano de obra (fichajes × valor hora + cargas sociales) contra presupuesto y certificación.

---

## Estructura de submódulos

```
obras                        → rubro: constructora
├── obras.fichas             → Ficha de obra + equipo + roles + asignación de empleados
├── obras.presupuesto        → Presupuesto inicial + certificados de avance (parser Excel/PDF)
├── obras.contratistas       → CRUD contratistas + cartas oferta branded PDF
├── obras.documentacion      → Repositorio documental por obra (categorizado, versionado)
├── obras.partes-diarios     → Diario de obra digital (clima, tareas, personal, incidentes)
├── obras.materiales         → Pedidos y compras por obra con seguimiento de entregas
├── obras.vencimientos       → Alertas de vencimiento (ART, seguros, habilitaciones, permisos)
├── obras.f931               → Carga y visualización DDJJ F931 AFIP
└── obras.reportes           → Comparativo presupuesto vs real, rentabilidad por obra
```

Cada submódulo se habilita/deshabilita por tenant en `enabled_modules`. Un tenant puede tener solo `obras.fichas` + `obras.presupuesto` sin el resto.

---

## 1. Fichas de Obra (`obras.fichas`)

### Datos de la obra

| Campo | Tipo | Requerido | Notas |
|-------|------|-----------|-------|
| nombre | text | sí | |
| direccion | text | no | |
| localidad | text | no | |
| estado | enum | sí | `activa`, `pausada`, `finalizada`, `en_licitacion` |
| tipo_obra | FK a config | no | Configurable por tenant (vivienda, comercial, industrial, infraestructura, reforma, etc.) |
| comitente | text | no | Cliente/dueño de la obra |
| fecha_inicio | date | no | |
| fecha_estimada_fin | date | no | |
| superficie_m2 | numeric | no | |
| notas | text | no | |

### Equipo de obra

**Roles jerárquicos** (director de obra, jefe de obra, sobrestante, capataz, roles custom):
- Persona: nombre libre O referencia a `liq_empleados`
- Rol: configurable por tenant
- Período: desde/hasta (historial si cambia)

**Empleados asignados:**
- Referencia a `liq_empleados`
- Período de asignación: desde/hasta
- Un empleado puede estar en múltiples obras simultáneamente

### Costo de mano de obra

Se calcula automáticamente cruzando:
- Empleados asignados × fichajes en esa obra × valor hora de su categoría = **costo sueldo**
- **Cargas sociales:** conceptos configurables por tenant (aportes patronales, ART, seguro, etc.), cada uno con un % sobre costo sueldo
- Total mano de obra = costo sueldo + cargas sociales
- Alimenta el módulo de reportes (comparativo presupuesto vs real)

### Migración desde `liq_obras`

La tabla `liq_obras` existente se amplía o migra a `obras_fichas`. La tabla nueva pasa a ser la fuente de verdad. `liquidaciones` referencia a `obras_fichas` en vez de `liq_obras`.

### UI

- **Lista de obras:** tabla con filtros (estado, tipo), búsqueda por nombre
- **Ficha de obra:** vista con tabs: General | Equipo | Presupuesto | Certificados | Documentación | Partes Diarios | Costos
- Los tabs solo aparecen si el submódulo correspondiente está habilitado

---

## 2. Presupuesto + Certificados de Avance (`obras.presupuesto`)

### Presupuesto inicial

| Campo | Tipo | Notas |
|-------|------|-------|
| obra_id | FK | |
| version | int | Historial de versiones |
| fecha | date | Fecha de esta versión |
| notas | text | Motivo del ajuste si es revisión |

**Ítems del presupuesto:**

| Campo | Tipo | Notas |
|-------|------|-------|
| presupuesto_id | FK | |
| rubro | FK a config | Rubros configurables por tenant (Estructura, Albañilería, Inst. Eléctrica, etc.) |
| descripcion | text | |
| unidad | text | m², ml, gl, m³, kg, un, etc. |
| cantidad | numeric | |
| precio_unitario | numeric | |
| subtotal | numeric | Calculado |

- Total presupuestado = suma de subtotales
- Carga manual o importación desde Excel
- Si se modifica, se crea nueva versión (queda historial)

### Certificados de avance

| Campo | Tipo | Notas |
|-------|------|-------|
| obra_id | FK | |
| numero | int | Nro de certificado correlativo |
| fecha | date | |
| periodo | text | Descripción del período |
| archivo_url | text | Archivo original subido |
| estado | enum | `borrador`, `aprobado`, `facturado`, `cobrado` |
| notas | text | |

**Detalle del certificado (por ítem):**

| Campo | Tipo | Notas |
|-------|------|-------|
| certificado_id | FK | |
| presupuesto_item_id | FK | Referencia al ítem del presupuesto |
| cantidad_periodo | numeric | Avance de este período |
| cantidad_acumulada | numeric | Acumulado hasta este certificado |
| porcentaje_avance | numeric | % avance del ítem |
| monto_periodo | numeric | Monto certificado este período |
| monto_acumulado | numeric | Monto acumulado |

### Parser de certificados

1. **Excel:** Lee estructura tabular, matchea ítems contra presupuesto cargado por descripción/rubro
2. **PDF:** Extracción tabular básica, fallback a carga manual
3. **Preview:** Siempre muestra lo que leyó para que el usuario valide antes de confirmar

### UI

- Barra de progreso global de la obra (% avance ponderado por monto)
- Tabla de ítems: presupuestado | certificado acumulado | % avance
- Timeline de certificados cargados con estado
- Alerta visual si ítem supera 100% o desvío significativo

---

## 3. Contratistas + Cartas Oferta (`obras.contratistas`)

### Registro de contratistas

| Campo | Tipo | Notas |
|-------|------|-------|
| razon_social | text | Requerido |
| cuit | text | |
| contacto_nombre | text | |
| contacto_telefono | text | |
| contacto_email | text | |
| rubro_especialidad | FK a config | Configurable: electricidad, plomería, gas, pintura, herrería, etc. |
| condicion_iva | text | |
| cbu | text | |
| estado | enum | `activo`, `inactivo`, `suspendido` |
| calificacion | int | 1-5 opcional, referencia interna |
| notas | text | |

**Documentación del contratista:**

| Campo | Tipo | Notas |
|-------|------|-------|
| contratista_id | FK | |
| tipo | enum | `art`, `seguro_vida`, `habilitacion`, `otro` |
| descripcion | text | |
| archivo_url | text | |
| fecha_emision | date | |
| fecha_vencimiento | date | Alimenta módulo vencimientos |

**Historial de obras:** Se arma automáticamente desde cartas oferta aceptadas.

### Cartas Oferta

| Campo | Tipo | Notas |
|-------|------|-------|
| obra_id | FK | |
| contratista_id | FK | |
| numero | int | Correlativo |
| version | int | Si se renegocia |
| fecha | date | |
| alcance | text | Descripción del trabajo |
| plazo_ejecucion | text | |
| condiciones_pago | text | |
| penalidades | text | |
| observaciones | text | |
| estado | enum | `borrador`, `enviada`, `aceptada`, `rechazada`, `vencida` |
| monto_total | numeric | Suma de ítems |

**Ítems de la carta oferta:**

| Campo | Tipo | Notas |
|-------|------|-------|
| carta_oferta_id | FK | |
| descripcion | text | |
| unidad | text | |
| cantidad | numeric | |
| precio_unitario | numeric | |
| subtotal | numeric | |

### Template de carta oferta

- **Branded:** Logo, colores y datos fiscales del tenant (de la tabla `tenants`: `razon_social`, `cuit`, `direccion`, `logo_url`, `primary_color`)
- **Texto configurable:** El tenant define encabezado, cláusulas estándar y pie
- **Campos variables:** Se insertan automáticamente (contratista, obra, ítems, montos, plazos)
- **Preview en pantalla** antes de generar PDF
- **Generación PDF** para descarga/envío

---

## 4. Documentación de Obra (`obras.documentacion`)

### Estructura

| Campo | Tipo | Notas |
|-------|------|-------|
| obra_id | FK | |
| categoria | FK a config | Planos, Permisos Municipales, Pólizas, Actas, Contratos, Fotos de Avance, Otros |
| descripcion | text | |
| archivo_url | text | |
| version | int | Versionado: archivo nuevo reemplaza al anterior, anterior queda como versión vieja |
| fecha | date | |
| subido_por | text | Usuario que lo cargó |
| fecha_vencimiento | date | Opcional, alimenta módulo vencimientos si tiene |

### UI

- Grilla por categoría con contador de documentos
- Expandible: lista de archivos por categoría
- Búsqueda por nombre/descripción
- Upload drag & drop

---

## 5. Partes Diarios (`obras.partes-diarios`)

### Registro diario

| Campo | Tipo | Notas |
|-------|------|-------|
| obra_id | FK | |
| fecha | date | |
| autor | text | Quién carga el parte |
| clima | enum | `soleado`, `nublado`, `lluvia`, `lluvia_intensa` |
| se_trabajo | enum | `si`, `no`, `parcial` |
| motivo_no_trabajo | text | Si no se trabajó: lluvia, paro, falta materiales, etc. |
| personal_presente | int | Cantidad de personas (o detalle cruzando fichajes) |
| tareas_realizadas | text | Texto libre o referencia a rubros del presupuesto |
| incidentes | text | Accidentes, inspecciones, problemas |
| observaciones | text | |

**Fotos del día:** Se guardan como documentos en `obras.documentacion` con categoría "Fotos de Avance", linkeados al parte diario.

### UI

- Timeline cronológico tipo feed por obra
- Filtros: fecha, clima, se trabajó
- Resumen mensual: días trabajados vs no trabajados, motivos de parada
- Carga rápida (formulario simple, no modal pesado)

---

## 6. Materiales/Compras (`obras.materiales`)

### Pedidos

| Campo | Tipo | Notas |
|-------|------|-------|
| obra_id | FK | |
| proveedor | text | Texto libre o referencia a contratista |
| fecha_pedido | date | |
| fecha_estimada_entrega | date | |
| fecha_real_entrega | date | |
| estado | enum | `pedido`, `en_camino`, `recibido_parcial`, `recibido`, `cancelado` |
| remito_url | text | Archivo remito/factura |
| notas | text | |
| total | numeric | Suma de ítems |

**Ítems del pedido:**

| Campo | Tipo | Notas |
|-------|------|-------|
| pedido_id | FK | |
| material | text | |
| cantidad | numeric | |
| unidad | text | |
| precio_unitario | numeric | |
| subtotal | numeric | |

### UI

**Vista por obra (tab Materiales en la ficha):**
- Lista de pedidos con estado
- Total gastado en materiales
- vs presupuestado (si el rubro matchea con ítems del presupuesto)

**Vista general (sección Materiales en sidebar):**
- Todos los pedidos del tenant, filtros por obra, proveedor, estado
- Pedidos pendientes destacados

---

## 7. Vencimientos y Alertas (`obras.vencimientos`)

### Fuentes automáticas

Los vencimientos se crean automáticamente cuando se cargan documentos con `fecha_vencimiento` en:
- Contratistas (ART, seguro, habilitaciones)
- Empleados (si se les agrega documentación con vencimiento)
- Obras (permisos municipales, pólizas)
- Documentación general

### Estructura

| Campo | Tipo | Notas |
|-------|------|-------|
| entidad_tipo | enum | `contratista`, `empleado`, `obra` |
| entidad_id | uuid | FK polimórfica |
| tipo | text | ART, seguro, habilitación, permiso, póliza, etc. |
| descripcion | text | |
| fecha_vencimiento | date | |
| dias_anticipacion | int | Default 30, configurable |
| estado | computed | `vigente`, `por_vencer`, `vencido` (calculado) |

### UI

- **Dashboard semáforo:**
  - Verde: vigentes
  - Amarillo: por vencer en los próximos X días
  - Rojo: vencidos
- Lista filtrable por tipo, entidad, estado
- Contadores en el dashboard principal del módulo

---

## 8. F931 — DDJJ AFIP (`obras.f931`)

### Carga

| Campo | Tipo | Notas |
|-------|------|-------|
| periodo | text | YYYY-MM (mes/año) |
| archivo_url | text | Archivo original |
| fecha_carga | timestamp | |
| notas | text | |

**Detalle por empleado:**

| Campo | Tipo | Notas |
|-------|------|-------|
| f931_id | FK | |
| empleado_nombre | text | Nombre tal como figura en el F931 |
| empleado_cuil | text | Para matchear con `liq_empleados` en el futuro |
| remuneracion_imponible | numeric | |
| aportes_personales | numeric | |
| contribuciones_patronales | numeric | |
| obra_social | numeric | |
| sindicato | numeric | |

### Parser

- **Excel:** Estructura estándar del F931, extracción directa de columnas
- **PDF:** Extracción tabular, fallback manual
- **Preview** antes de confirmar importación

### UI

- Lista de períodos cargados con totales
- Expandir período → tabla detalle por empleado
- Archivo original descargable
- Futuro: botón "Conciliar con liquidaciones" (no implementar ahora)

---

## 9. Reportes (`obras.reportes`)

### Comparativo Presupuesto vs Real por Obra

| Concepto | Fuente |
|----------|--------|
| Presupuestado | `obras.presupuesto` — total de ítems |
| Certificado acumulado | `obras.presupuesto` — suma certificados aprobados |
| Costo mano de obra | `liquidaciones` — fichajes × valor hora + cargas sociales config |
| Costo materiales | `obras.materiales` — pedidos recibidos |
| Costo contratistas | `obras.contratistas` — cartas oferta aceptadas |
| **Costo real total** | Mano de obra + materiales + contratistas |
| **Rentabilidad** | Certificado acumulado - costo real total |

**Vista:** Tabla comparativa + gráfico de barras por obra.

### Otros reportes

- **Estado general de obras:** Todas las obras con % avance, estado, alertas activas
- **Contratistas con documentación vencida:** Lista filtrada de vencimientos rojos
- **Productividad:** Resumen de partes diarios (días trabajados vs parados por obra/mes)

---

## Tablas Supabase (prefijo `obras_`)

```
obras_fichas                    — Reemplaza/amplía liq_obras
obras_fichas_roles              — Roles jerárquicos por obra (director, jefe, etc.)
obras_fichas_empleados          — Empleados asignados a obra con período
obras_config_tipos_obra         — Config: tipos de obra por tenant
obras_config_roles              — Config: roles disponibles por tenant
obras_config_rubros_presupuesto — Config: rubros de presupuesto por tenant
obras_config_conceptos_costo    — Config: conceptos de cargas sociales por tenant
obras_config_categorias_doc     — Config: categorías de documentación por tenant
obras_config_rubros_contratista — Config: especialidades de contratistas por tenant
obras_presupuestos              — Presupuesto por obra (versionado)
obras_presupuesto_items         — Ítems del presupuesto
obras_certificados              — Certificados de avance
obras_certificado_detalle       — Detalle por ítem del certificado
obras_contratistas              — Registro de contratistas
obras_contratista_docs          — Documentación del contratista
obras_cartas_oferta             — Cartas oferta
obras_carta_oferta_items        — Ítems de la carta oferta
obras_carta_oferta_template     — Template configurable por tenant
obras_documentos                — Repositorio documental por obra
obras_partes_diarios            — Partes diarios de obra
obras_materiales_pedidos        — Pedidos de materiales
obras_materiales_pedido_items   — Ítems del pedido
obras_vencimientos              — Vencimientos (generados automáticamente)
obras_f931                      — Encabezado F931 por período
obras_f931_detalle              — Detalle por empleado del F931
```

Todas las tablas con `tenant_id`, RLS habilitado, índices por tenant.

---

## Routing

```
/obras                          → Dashboard del módulo
/obras/listado                  → Lista de obras (obras.fichas)
/obras/:obraId                  → Ficha de obra con tabs
/obras/:obraId/equipo           → Tab equipo
/obras/:obraId/presupuesto      → Tab presupuesto + certificados
/obras/:obraId/documentacion    → Tab documentación
/obras/:obraId/partes-diarios   → Tab partes diarios
/obras/:obraId/materiales       → Tab materiales
/obras/:obraId/costos           → Tab costos
/obras/contratistas             → Lista de contratistas
/obras/contratistas/:id         → Ficha contratista
/obras/contratistas/:id/carta-oferta/:id → Carta oferta
/obras/materiales               → Vista general de pedidos (cross-obra)
/obras/vencimientos             → Dashboard de vencimientos
/obras/f931                     → Lista de períodos F931
/obras/reportes                 → Reportes
```

---

## Integración con módulos existentes

| Módulo | Integración |
|--------|-------------|
| `liquidaciones` | `liq_empleados` se referencian en equipo de obra. Fichajes por obra alimentan costo mano de obra. `liq_obras` migra a `obras_fichas`. |
| `tesoreria` | Futuro: pagos a contratistas desde órdenes de pago |
| `contable` | Futuro: facturas de materiales/contratistas como comprobantes |

---

## MODULE_TREE (para superadmin Dashboard)

```typescript
{
  id: 'obras',
  name: 'Obras',
  rubros: ['constructora'],
  children: [
    { id: 'obras.fichas', name: 'Fichas de Obra', rubros: ['constructora'] },
    { id: 'obras.presupuesto', name: 'Presupuesto y Certificados', rubros: ['constructora'] },
    { id: 'obras.contratistas', name: 'Contratistas', rubros: ['constructora'] },
    { id: 'obras.documentacion', name: 'Documentación', rubros: ['constructora'] },
    { id: 'obras.partes-diarios', name: 'Partes Diarios', rubros: ['constructora'] },
    { id: 'obras.materiales', name: 'Materiales/Compras', rubros: ['constructora'] },
    { id: 'obras.vencimientos', name: 'Vencimientos', rubros: ['constructora'] },
    { id: 'obras.f931', name: 'F931', rubros: ['constructora'] },
    { id: 'obras.reportes', name: 'Reportes', rubros: ['constructora'] },
  ]
}
```
