# Contexto de trabajo — Rubro AGRO (SAILO)

## Tenant
- **Nombre**: SAILO
- **ID**: `9444a5fb-e8ed-4702-ba89-539bee71f4c2`
- **Rubro**: `agro`
- **Módulos**: tesoreria, contable, crm, administracion, logistica, bank_import, erp_colppy, erp_xubio

## Estado actual de la sesión

### Archivos creados/modificados (NO pusheados)
1. `src/modules/agro/FacturarAgro.tsx` — **NUEVO** — Componente de facturación propio para rubro agro
   - Búsqueda de clientes con autocomplete
   - Al seleccionar cliente: autocompleta CUIT, condición fiscal, tipo factura, líneas desde última factura
   - Selección de productos de `contable_productos_servicio`
   - Múltiples líneas con cantidad, precio, IVA por línea
   - Panel de resumen a la derecha (subtotal, IVA, total)
   - KPIs de facturas recientes
   - Lista de facturas emitidas
   - **PENDIENTE**: integrar envío al webhook de ARCA para emitir factura electrónica

2. `src/App.tsx` — **MODIFICADO**
   - Agregado import de `FacturarAgro`
   - Creado `FacturarRouter` que renderiza `FacturarAgro` para rubro agro y `FacturarMobile` para inmobiliaria
   - Ruta `/contable/comprobantes` usa `FacturarRouter`

3. `src/shared/components/Layout.tsx` — **MODIFICADO**
   - Agregado `import { resolveIcon } from '../utils/iconMap'`
   - Fix: subtabs de sidebar dinámico ahora incluyen `icon` (antes era undefined y crasheaba)
   - Solo afecta tenants con `sidebar_config` (actualmente solo SAILO)

4. `src/modules/agro/PROMPT_ANTIGRAVITY.md` — **EXISTENTE** — Especificación completa del webhook de ARCA/AFIP

### Cambios en Supabase (ya aplicados)
- `contable_clientes`: agregadas columnas `condicion_fiscal`, `telefono`, `email`, `direccion`
- `tenants`: agregadas columnas `punto_venta` (int, default 1), `webhook_facturacion` (text)
- `tenants.sidebar_config` de SAILO actualizado: Contable (Comprobantes, Facturar, Clientes, Proveedores, OP, Plan de Cuentas, Conciliación Bancaria), Impuestos (IVA, IIBB, Retenciones), Tesorería (Cajas, Bancos, Movimientos, Monitor)
- `tenants.rubro` de SAILO cambiado de `general` a `agro`

### Webhook de facturación ARCA
- **URL test**: `https://n8n.neuracall.net/webhook-test/NeuraUSUARIOPRUEBA`
- **Método**: POST JSON
- **Respuesta**: PDF binario + headers (x-cae, x-invoice-number, x-invoice-id)
- **Payload completo documentado en**: `src/modules/agro/PROMPT_ANTIGRAVITY.md`
- **Campos del emisor están en tabla `tenants`**: razon_social, cuit, direccion, condicion_iva, ingresos_brutos, inicio_actividades, punto_venta

### Tareas pendientes
1. **Integrar webhook ARCA en FacturarAgro** — armar payload según PROMPT_ANTIGRAVITY.md, enviar, recibir PDF + CAE, guardar en comprobante
2. **Home SAILO: botones acciones rápidas** — deben llevar a `/contable/comprobantes` no a `/inmobiliaria/facturar`
3. **Comprobantes: botón Facturar** — no debe ir a `/inmobiliaria/facturar`
4. **Arreglar conexión Xubio** — sync clientes/proveedores/productos via proxy n8n (proveedorBean da 500)
5. **Verificar Clientes y Proveedores** — que funcionen desde rutas de Contable
6. **Cargar datos fiscales de SAILO** — CUIT, condición IVA, dirección, IIBB, inicio actividades (todo null ahora)
7. **Cargar CUITs de clientes de SAILO** — actualmente todos null
8. **Testing completo SAILO** — navegar, facturar, sync ERP

### Reglas de trabajo
- **NO tocar código de inmobiliaria** (`src/modules/inmobiliaria/*`)
- **NO tocar código de constructora** (`src/modules/tesoreria/ConciliacionBancaria.tsx`)
- Solo se modifican archivos compartidos para **agregar** condiciones, nunca modificar existentes
- El `sidebar_config` de SAILO se modifica solo desde la DB, no desde código
- Proxy Xubio via n8n: `https://n8n.neuracall.net/webhook/xubio-proxy`
