# NEURA CORE — Módulo Inmobiliaria
## Alcance funcional detallado (v1.0)
### Fecha: 23/03/2026

---

## HECHO Y FUNCIONANDO

### 1. Dashboard General
- 5 KPIs: Total propiedades, % Ocupación, Contratos vigentes, Morosidad acumulada, Valor portfolio
- Mapa interactivo con pines por propiedad (color según estado)
- Próximos vencimientos (15 items, color por tipo)
- Contratos por vencer en 30 días con countdown
- Distribución de propiedades por estado
- Responsive: mobile 2 columnas, desktop auto-fit

### 2. Propiedades (CRUD completo)
- Alta, edición y eliminación de propiedades
- Vista grilla (cards) y lista (tabla)
- Búsqueda por dirección
- Filtros por estado (disponible/alquilada/en_venta/reservada/en_refacción) y tipo (depto/casa/local/oficina/terreno/cochera/depósito)
- Campos: dirección, tipo, estado, superficie m2, ambientes, piso, unidad, localidad, provincia, moneda, precio alquiler, precio venta, descripción
- Botón "Crear contrato" en propiedades disponibles
- Geolocalización (lat/lng) para el mapa

### 3. Contratos (CRUD completo + workflow)
- Alta, edición y eliminación de contratos
- Vista lista mobile con cards y vista grilla desktop
- Búsqueda por propiedad o inquilino
- Filtros tabs: Todos, Activos, Vencen pronto (30d), Morosos
- KPIs mobile: Ingreso mensual, Vencen en 30d, Vencidos
- Badges de estado: Activo (verde), Vence en Xd (amarillo), Moroso X días (rojo)
- Botón Facturar visible + menú ⋮ con: Ver detalle, Liquidar, Enviar proveedor, Renovar, Eliminar
- Creación inline de inquilino/propietario sin salir del formulario
- Auto-apertura desde Propiedades con propiedad preseleccionada
- Campos: propiedad, inquilino, propietario, tipo (alquiler/venta/temporal), fechas, monto, moneda, índice ajuste (ICL/IPC/libre), período ajuste, depósito, comisión %, notas
- **Documentos adjuntos**: subir PDF/imagen a Supabase Storage, lista con nombre/tipo/fecha, eliminar
- **Ajustes de alquiler**: aplicar % de ajuste, historial completo (fecha, monto anterior → nuevo, %), monto original vs actual

### 4. Liquidaciones (CRUD + workflow)
- Alta, edición de liquidaciones mensuales
- Workflow: borrador → aprobada → pagada
- Categorías: alquiler, mantenimiento, impuestos, servicios, consorcio
- Auto-cálculo: ingreso - deducciones = neto propietario
- Deducciones dinámicas (agregar/eliminar filas)
- Comisión automática desde el contrato
- Filtros por estado y categoría
- Búsqueda por propiedad o concepto
- KPIs mobile: Pendientes, Por pagar, Pagado mes
- Vista mobile lista compacta, desktop tabla completa

### 5. Cuentas Corrientes
- Selector de cliente (dropdown custom en mobile, panel lateral en desktop)
- Saldo actual en tiempo real (verde/rojo)
- Movimientos con ícono dirección (↑ ingreso / ↓ egreso)
- Filtro por tipo (inquilino/propietario)
- Buscador de clientes

### 6. Agenda / Vencimientos
- **4 vistas desktop**: Mes (calendario), Semana (7 cards), Día (lista), Tabla (con rango de fechas)
- **Vista mobile estilo Google Calendar**: mini calendario colapsable + lista schedule por día
- 5 tipos de vencimiento: Vto. Contrato, Pago pendiente, Ajuste alquiler, Habilitación, Otro
- Color-coded por tipo
- Checkbox para marcar completado
- Filtros por tipo (chips clickeables)
- Toggle mostrar completados
- Crear nuevo vencimiento con formulario
- Indicador días atrasado / días faltante

### 7. Proveedores de Servicios (CRUD completo)
- Alta, edición de proveedores
- 10 rubros: plomería, electricidad, gas, pintura, limpieza, cerrajería, fumigación, albañilería, mudanza, general
- Filtros por rubro (chips)
- Búsqueda por nombre o contacto
- Click para llamar (tel:) o enviar email (mailto:)
- Campos: nombre/empresa, rubro, contacto, teléfono, email, CUIT, notas

### 8. Órdenes de Trabajo (workflow completo)
- Flujo: reportado → asignado → en_curso → completado → facturado → liquidado
- Reportar problema con título, propiedad, proveedor opcional, prioridad (baja/media/alta/urgente), descripción
- Botones de avance de estado (Asignar, Iniciar, Completar)
- Subir factura del proveedor (imagen/PDF) con OCR automático via n8n
- Extracción automática de monto final desde factura
- Comparación presupuesto vs facturado (alerta si excede)
- Botón llamar al proveedor asignado
- KPIs: Reportados, En curso, Resueltos
- Filtros por estado
- Badge de prioridad y notificación al inquilino

### 9. Navegación Mobile
- Bottom nav: Inicio | Operaciones | + | Gestión | Más
- **Operaciones** (subtabs): Propiedades, Contratos, Proveedores, Órdenes
- **Gestión** (subtabs): Dashboard, Liquidaciones, Cuentas, Agenda, Proyecciones
- **Botón +**: Acciones rápidas por módulo (crear propiedad, contrato, vencimiento, etc.)
- **Menú Más**: Secciones Operaciones/Cuentas/Análisis/Cuenta con ícono+título+subtítulo+badge

### 10. Infraestructura
- 7 tablas en Supabase con RLS (Row Level Security) por tenant
- Datos demo: 10 propiedades, 6 contratos, 4 liquidaciones, 8 vencimientos, 6 proveedores, 5 órdenes de trabajo, 10 clientes
- Sistema de rubros (inmobiliaria categorizada en SuperAdmin)
- Multi-tenant completo

---

## PLACEHOLDERS (botón existe pero no tiene funcionalidad completa)

| Función | Ubicación | Estado |
|---------|-----------|--------|
| Botón "Facturar" en contratos | Contratos.tsx card mobile | Botón visible, onclick vacío — falta definir flujo de facturación |
| Botón "Reclamar" en contratos morosos | Contratos.tsx card mobile | Botón visible, onclick vacío — falta definir flujo de reclamo (WhatsApp/email/notificación) |
| Botón "Renovar" en contratos por vencer | Contratos.tsx menú ⋮ | Botón visible, onclick vacío — falta flujo de renovación (crear nuevo contrato basado en el anterior) |
| Notificación al inquilino | Órdenes de trabajo | Campo `notificado_inquilino` existe pero no envía notificación real |

---

## NO INCLUIDO / FUERA DE ALCANCE (requiere presupuesto adicional)

### Portal del Propietario
- Vista web simplificada para propietarios
- Ver sus propiedades, liquidaciones, pagos
- Descargar recibos PDF
- Sin permisos de edición
- Login propio con rol "propietario"

### Portal del Inquilino
- Vista web para inquilinos
- Ver saldo, descargar recibos
- Reportar problemas (crea orden de trabajo automáticamente)
- Login propio con rol "inquilino"

### Ajustes Automáticos de Alquiler
- Cálculo automático mensual según índice ICL/IPC
- Integración con API de índices (BCRA / fuente oficial)
- Generación automática de alerta al llegar el mes de ajuste
- Actualización automática del contrato
- *Nota: hoy se puede aplicar ajuste manual desde el contrato*

### Alertas por WhatsApp / Email
- Recordatorio automático de pago a inquilinos
- Notificación de liquidación a propietarios
- Aviso de vencimiento de contrato
- Aviso de orden de trabajo completada
- Integración con n8n para envío

### Facturación ARCA
- Emisión de facturas electrónicas integrada con ARCA/AFIP
- Tipos: Factura A/B/C, Nota de Crédito/Débito
- Generación de CAE
- *Nota: requiere certificados digitales y webhook n8n*

### Recibos PDF Auto-generados
- Generación automática de recibo al cobrar alquiler
- Template con datos del contrato, propiedad, inquilino
- Descargable desde la app
- Envío por email automático

### Rentabilidad por Propiedad
- KPI: ingreso alquiler vs gastos (reparaciones, impuestos, comisiones)
- Gráfico de rentabilidad mensual
- ROI por propiedad
- Comparativa entre propiedades

### Seguro de Caución
- Tracking de pólizas por contrato
- Campos: aseguradora, número de póliza, fecha vencimiento, monto
- Alertas de vencimiento de póliza
- Documentos adjuntos de la póliza

### Flujo de Reclamo a Morosos
- Workflow: aviso amigable → reclamo formal → intimación → acción legal
- Templates de mensaje por etapa
- Historial de reclamos por contrato
- Integración con WhatsApp/email

### Flujo de Renovación de Contratos
- Crear nuevo contrato basado en el anterior
- Proponer nuevo monto con ajuste
- Enviar propuesta al inquilino
- Workflow de aceptación/rechazo

### Integración con Mercado Pago / CBU
- Cobro automático de alquileres
- Link de pago por inquilino
- Conciliación automática de pagos
- QR de pago en recibo

### Módulo de Expensas / Consorcio
- Cálculo de expensas por unidad funcional
- Distribución por coeficiente
- ABM de expensas ordinarias/extraordinarias
- Liquidación de expensas mensual

---

## RESUMEN CUANTITATIVO

| Concepto | Cantidad |
|----------|----------|
| Componentes frontend | 8 |
| Tablas Supabase | 7 |
| Campos en formularios | ~60 |
| Vistas responsive (mobile+desktop) | 16 |
| Workflows implementados | 3 (contratos, liquidaciones, órdenes) |
| Integraciones | Supabase Storage (docs), n8n OCR (facturas), Leaflet (mapa) |
| Funciones fuera de alcance | 12 (requieren presupuesto adicional) |
