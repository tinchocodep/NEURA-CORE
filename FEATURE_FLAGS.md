# Feature Flags — NeuraCore

## Concepto

Cada tenant tiene un array `enabled_modules` en la tabla `tenants`. Este array controla qué funcionalidades ve y cuáles no. El mismo código sirve para todos — lo que cambia es qué está prendido.

## Flags existentes

| Flag | Qué habilita | Dónde se usa |
|------|-------------|-------------|
| `tesoreria` | Módulo Tesorería (Movimientos, Bancos, Cajas, Monitor, Equipo) | Layout sidebar + rutas |
| `contable` | Módulo Contable (Comprobantes, Proveedores, Clientes, Catálogos) | Layout sidebar + rutas |
| `crm` | Módulo CRM (Contactos, Prospectos) | Layout sidebar + rutas |
| `comercial` | Módulo Comercial (Pipeline, Presupuestos) | Layout sidebar + rutas |
| `inmobiliaria` | Módulo Inmobiliaria completo (Propiedades, Contratos, Órdenes, etc.) | Layout sidebar + rutas propias `/inmobiliaria/*` |
| `logistica` | Módulo Logística | Layout sidebar |
| `administracion` | Módulo Administración | Layout sidebar |
| `erp_colppy` | Conexión con Colppy ERP — inyectar comprobantes, sincronizar proveedores/clientes | Comprobantes (botón Inyectar), Proveedores (botón Sync), Configuración (tab Integraciones) |
| `erp_xubio` | Conexión con Xubio ERP — inyectar comprobantes, sincronizar | Comprobantes (botón Inyectar), Proveedores (botón Sync), Configuración (tab Integraciones) |
| `bank_import` | Importación de extractos bancarios + conciliación | Bancos (tab Conciliación) |

## Flags propuestos (futuro)

| Flag | Qué habilitaría | Notas |
|------|-----------------|-------|
| `facturacion_electronica` | Emisión de facturas vía ARCA/AFIP | Requiere certificado digital |
| `telegram_bot` | Recepción de facturas por Telegram | Requiere configurar bot en Mensajería |
| `whatsapp_bot` | Recepción de facturas por WhatsApp | Próximamente |
| `ocr_avanzado` | OCR con Gemini para extracción de datos de facturas | Ya funciona, falta flag para activar/desactivar |
| `reportes` | Reportes avanzados y exportación | Dashboard con gráficos, export Excel/PDF |
| `multi_moneda` | Soporte para USD, EUR además de ARS | Cotizaciones, tipo de cambio automático |
| `centro_costos` | Clasificación por centro de costos | Ya existe en Catálogos |
| `agenda_calendario` | Agenda con vista calendario semanal/mensual | Ya implementado para inmobiliaria |
| `notificaciones_email` | Alertas por email (vencimientos, morosidad, etc.) | Requiere configurar SMTP o servicio |
| `api_publica` | API REST para integración con terceros | Para clientes que quieran conectar sus sistemas |

## Cómo funciona

### 1. Activación
El SuperAdmin activa/desactiva flags desde el panel de SuperAdmin → Tenants → toggle de módulos.

### 2. Detección en frontend
```typescript
// Opción actual (dispersa por el código):
const modules = (tenant?.enabled_modules as string[]) || [];
const hasColppy = modules.includes('erp_colppy');

// Opción propuesta (centralizada):
const { hasFeature } = useTenant();
if (hasFeature('erp_colppy')) { ... }
```

### 3. Renderizado condicional
```tsx
// Un botón que solo se muestra si el tenant tiene el flag:
{hasFeature('erp_colppy') && (
  <button onClick={inyectar}>Inyectar a Colppy</button>
)}
```

### 4. Configuración
Cuando un flag se activa, el tenant puede necesitar configurar credenciales o datos adicionales. Eso se hace en Configuración → Integraciones (para ERPs) o en la sección correspondiente.

## Problema actual: ¿Cómo se muestra?

Cada empresa puede querer ver la misma funcionalidad de manera diferente:

### Ejemplo: Comprobantes
- **Inmobiliaria**: accede desde Gestión, ve comprobantes vinculados a propiedades/contratos
- **Constructora**: accede desde Finanzas, ve comprobantes con centro de costos de obra
- **Agro**: accede desde Tesorería, ve comprobantes con campaña agrícola

### Opciones de arquitectura

**A) Componente único con variantes (actual)**
- Un solo `Comprobantes.tsx` que adapta la UI según el rubro
- Pros: menos código, un lugar para mantener
- Contras: se llena de condicionales, difícil de mantener

**B) Componente por rubro**
- `inmobiliaria/Comprobantes.tsx`, `constructora/Comprobantes.tsx`, `agro/Comprobantes.tsx`
- Cada uno importa componentes base de `core/` (tabla, filtros, modal)
- Pros: cada rubro es independiente, no se pisan
- Contras: duplicación de lógica base

**C) Componente base + plugin de rubro (recomendado)**
- Un `core/ComprobantesBase.tsx` con la lógica común (CRUD, tabla, filtros)
- Cada rubro define un "plugin" que agrega columnas, filtros, acciones propias
- Pros: lógica base compartida, personalización por rubro sin tocar otros
- Contras: requiere diseñar la API de plugins

```typescript
// Ejemplo conceptual de plugin:
const inmobiliariaPlugin = {
  extraColumns: [{ key: 'propiedad', label: 'Propiedad' }],
  extraFilters: [{ key: 'contrato', label: 'Por contrato' }],
  extraActions: [{ key: 'vincular_contrato', label: 'Vincular a contrato' }],
  sidebar: 'gestion', // dónde aparece en el sidebar
};

const constructoraPlugin = {
  extraColumns: [{ key: 'obra', label: 'Obra' }],
  extraFilters: [{ key: 'centro_costo', label: 'Centro de costo' }],
  extraActions: [{ key: 'asignar_obra', label: 'Asignar a obra' }],
  sidebar: 'finanzas',
};
```

## Reglas para el equipo

1. **¿Funcionalidad nueva que es para todos?** → va en `shared/` o `core/`
2. **¿Funcionalidad que solo un rubro necesita?** → va en la carpeta del rubro
3. **¿Feature que se prende/apaga?** → agregar flag a esta lista y usar `hasFeature()`
4. **¿Modificar Layout.tsx o App.tsx?** → avisar al equipo, solo agregar, no modificar existente
5. **¿Nuevo rubro con UI completamente diferente?** → crear carpeta en `src/rubros/` con rutas propias

## Tenants actuales

| Tenant | Rubro | Módulos |
|--------|-------|---------|
| Demo Inmobiliaria | inmobiliaria | inmobiliaria, contable, tesoreria, crm |
| AFG Constructora | constructora | tesoreria, contable, crm, administracion, logistica, bank_import, erp_colppy, erp_xubio |
| SAILO | general | tesoreria, contable, crm, administracion, logistica, bank_import, erp_colppy, erp_xubio |
