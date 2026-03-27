# NEURA-CORE: Especificación Tenant "SAILO Gestora" (Romina)
## Para implementar en Antigravity (Project IDX) con Opus 4.6
### Demo: Lunes 30/03/2026

---

## 1. CONTEXTO

NEURA-CORE es un SaaS multi-tenant (React 19 + TypeScript + Vite + Supabase + Tailwind 4.2).
El sistema modulariza la UX según el campo `enabled_modules` (jsonb) y `rubro` (text) de la tabla `tenants` en Supabase.

**Romina es gestora/contadora.** Su tenant se llama "SAILO" y ya existe en la base de datos. Necesitamos:
1. Mejorar la tabla `tenants` para soportar mejor la modularización SaaS
2. Configurar el tenant SAILO con los módulos correctos para una gestora
3. Reorganizar el sidebar/UX para que Romina vea: **Home → Ventas → Compras → Contable → Impuestos**

---

## 2. ESTADO ACTUAL DE LA TABLA `tenants`

### Columnas actuales:
```
id              uuid        PK
name            text        NOT NULL
logo_url        text        nullable
primary_color   text        nullable
secondary_color text        nullable
enabled_modules jsonb       NOT NULL (array de strings)
created_at      timestamptz DEFAULT now()
monthly_fee     numeric     nullable
installation_fee numeric    nullable
razon_social    text        nullable
cuit            text        nullable
direccion       text        nullable
email           text        nullable
ui_font_size    text        nullable  (valores: "small", "medium", "large")
ui_density      text        nullable  (valores: "compact", "normal", "comfortable")
rubro           text        nullable  (valores actuales: "constructora", "inmobiliaria", "automotriz", "general")
```

### Tenants actuales y sus módulos:

**1. AFG Constructora S.R.L.** (rubro: constructora)
```json
["administracion", "bank_import", "contable", "crm", "logistica", "tesoreria"]
```

**2. Antigravity Gestora** (rubro: inmobiliaria)
```json
["contable", "crm", "crm.contactos", "crm.prospectos", "inmobiliaria", "inmobiliaria.agenda", "inmobiliaria.contratos", "inmobiliaria.cuentas", "inmobiliaria.liquidaciones", "inmobiliaria.propiedades", "tesoreria"]
```

**3. Automotores Alcorta** (rubro: automotriz)
```json
["comercial", "comercial.config", "comercial.contactos", "comercial.pipeline", "comercial.reportes", "crm", "crm.catalogo", "crm.contactos", "crm.prospectos"]
```

**4. Empresa Demo S.A.** (rubro: general)
```json
["tesoreria"]
```

**5. Neuracall Admin** (rubro: general)
```json
["administracion", "comercial", "contable", "crm", "crm.catalogo", "crm.contactos", "crm.obras", "crm.prospectos", "inmobiliaria", "logistica", "tesoreria"]
```

**6. SAILO** (rubro: general) — ESTE ES EL DE ROMINA
```json
["administracion", "bank_import", "contable", "crm", "erp_colppy", "erp_xubio", "logistica", "tesoreria", "tesoreria.bancos", "tesoreria.cajas", "tesoreria.comprobantes", "tesoreria.equipo", "tesoreria.monitor", "tesoreria.movimientos", "tesoreria.ordenes-pago"]
```

---

## 3. MEJORAS PROPUESTAS A LA TABLA `tenants`

### 3.1 Migración SQL — Nuevas columnas

```sql
-- Migración: Mejorar tabla tenants para SaaS modularizado
-- Fecha: 2026-03-27

-- A) Configuración de ERP (Colppy/Xubio)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS erp_provider text DEFAULT null;
-- Valores: 'colppy', 'xubio', 'both', null
COMMENT ON COLUMN tenants.erp_provider IS 'ERP conectado: colppy, xubio, both, o null si no tiene';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS erp_config jsonb DEFAULT '{}';
-- Ejemplo: {"colppy": {"company_id": "xxx", "api_key": "xxx"}, "xubio": {"token": "xxx"}}
COMMENT ON COLUMN tenants.erp_config IS 'Configuración de conexión al ERP (credenciales encriptadas)';

-- B) Configuración de ARCA (facturación electrónica)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS arca_enabled boolean DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS arca_config jsonb DEFAULT '{}';
-- Ejemplo: {"cuit": "20-xxxxx-x", "cert_path": "/certs/xxx.pem", "env": "production"}
COMMENT ON COLUMN tenants.arca_config IS 'Config de ARCA (ex-AFIP) para facturación electrónica';

-- C) Configuración de sidebar/navegación personalizada
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sidebar_config jsonb DEFAULT null;
-- Ejemplo detallado más abajo en sección 4
COMMENT ON COLUMN tenants.sidebar_config IS 'Configuración de sidebar personalizada. Si null, usa default por rubro';

-- D) Feature flags granulares
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_flags jsonb DEFAULT '{}';
-- Ejemplo: {"ocr_telegram": true, "conciliacion_arca": true, "dolar_widget": true, "bank_import": true}
COMMENT ON COLUMN tenants.feature_flags IS 'Feature flags para funcionalidades específicas';

-- E) Configuración de n8n (workflows)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS n8n_config jsonb DEFAULT '{}';
-- Ejemplo: {"webhook_url": "https://n8n.xxx/webhook/abc", "enabled_flows": ["factura_to_erp", "bank_sync"]}
COMMENT ON COLUMN tenants.n8n_config IS 'Config de n8n para inyección ERP y workflows';

-- F) Rubro mejorado con enum
-- Primero crear el tipo si no existe
DO $$ BEGIN
  CREATE TYPE tenant_rubro AS ENUM ('general', 'gestora', 'inmobiliaria', 'constructora', 'automotriz', 'comercio', 'servicios');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Agregar el nuevo rubro "gestora" (para Romina)
-- NOTA: No cambiar la columna existente a enum todavía, solo agregar el valor "gestora" como válido
-- La migración de tipo se hace en una segunda fase

-- G) Datos fiscales mejorados
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS condicion_iva text DEFAULT null;
-- Valores: 'responsable_inscripto', 'monotributista', 'exento', 'consumidor_final'
COMMENT ON COLUMN tenants.condicion_iva IS 'Condición frente a IVA';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ingresos_brutos text DEFAULT null;
COMMENT ON COLUMN tenants.ingresos_brutos IS 'Número de Ingresos Brutos';

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inicio_actividades date DEFAULT null;
COMMENT ON COLUMN tenants.inicio_actividades IS 'Fecha de inicio de actividades';
```

### 3.2 Estructura de `enabled_modules` — Convención mejorada

**Convención de 3 niveles:**
```
módulo                     → habilita acceso al módulo completo
módulo.submódulo           → habilita submódulo específico del sidebar
módulo.submódulo.feature   → habilita feature específica dentro del submódulo
```

**Catálogo maestro de módulos disponibles:**
```
HOME
├── home                          → Dashboard principal
├── home.acciones_rapidas         → Widget acciones rápidas
├── home.cotizacion_dolar         → Widget dólar BNA
├── home.flujo_caja              → Widget flujo de caja
├── home.monitor_tesoreria       → Widget monitor tesorería
├── home.actividad_reciente      → Widget actividad reciente
├── home.ranking_entidades       → Widget ranking entidades
├── home.origen_registros        → Widget origen de registros

VENTAS (facturación de venta)
├── ventas                        → Módulo de ventas completo
├── ventas.comprobantes          → ABM comprobantes de venta (facturas A/B/C, notas de crédito/débito)
├── ventas.clientes              → ABM clientes
├── ventas.reportes              → Reportes: IVA Ventas, Libro IVA, análisis
├── ventas.facturacion_arca      → Facturación electrónica via ARCA (CAE)

COMPRAS (facturación de compra)
├── compras                       → Módulo de compras completo
├── compras.comprobantes         → ABM comprobantes de compra
├── compras.proveedores          → ABM proveedores
├── compras.ordenes_pago         → Órdenes de pago
├── compras.reportes             → Reportes: IVA Compras, retenciones

CONTABLE
├── contable                      → Módulo contable completo
├── contable.plan_cuentas        → Plan de cuentas
├── contable.asientos            → Asientos contables
├── contable.conciliacion        → Conciliación ARCA vs sistema
├── contable.conciliacion_bancaria → Conciliación bancaria
├── contable.balance             → Balance / Mayor
├── contable.entity360           → Panel 360° de entidad

IMPUESTOS
├── impuestos                     → Módulo de impuestos completo
├── impuestos.iva                → Liquidación IVA (DJ mensual)
├── impuestos.iibb               → Ingresos Brutos
├── impuestos.ganancias          → Ganancias
├── impuestos.retenciones        → Retenciones y percepciones
├── impuestos.suss               → Cargas sociales (SUSS)

TESORERÍA
├── tesoreria                     → Módulo tesorería completo
├── tesoreria.cajas              → Cajas (efectivo)
├── tesoreria.bancos             → Bancos (cuentas bancarias)
├── tesoreria.movimientos        → Movimientos
├── tesoreria.comprobantes       → Comprobantes de tesorería
├── tesoreria.monitor            → Monitor de tesorería
├── tesoreria.equipo             → Equipo (usuarios asignados)
├── tesoreria.ordenes-pago       → Órdenes de pago
├── tesoreria.bank_import        → Importación bancaria

CRM
├── crm                           → CRM completo
├── crm.contactos                → Contactos
├── crm.prospectos               → Prospectos
├── crm.catalogo                 → Catálogo
├── crm.obras                    → Obras (constructora)

COMERCIAL
├── comercial                     → Módulo comercial completo
├── comercial.pipeline           → Pipeline de ventas
├── comercial.contactos          → Contactos comerciales
├── comercial.reportes           → Reportes comerciales
├── comercial.config             → Configuración comercial

INMOBILIARIA
├── inmobiliaria                  → Módulo inmobiliaria completo
├── inmobiliaria.propiedades     → Propiedades
├── inmobiliaria.contratos       → Contratos
├── inmobiliaria.liquidaciones   → Liquidaciones
├── inmobiliaria.cuentas         → Cuentas corrientes
├── inmobiliaria.agenda          → Agenda

INTEGRACIONES
├── erp_colppy                    → Integración Colppy
├── erp_xubio                    → Integración Xubio
├── bank_import                   → Importación bancaria
├── administracion                → Panel de administración
├── logistica                     → Logística
```

---

## 4. CONFIGURACIÓN DE SIDEBAR — Tenant SAILO (Romina gestora)

### 4.1 Valor de `sidebar_config` para el tenant SAILO:

```json
{
  "sections": [
    {
      "id": "home",
      "label": "Inicio",
      "icon": "Home",
      "path": "/home",
      "module_required": "home"
    },
    {
      "id": "ventas",
      "label": "Ventas",
      "icon": "TrendingUp",
      "module_required": "ventas",
      "children": [
        {
          "id": "ventas.comprobantes",
          "label": "Comprobantes",
          "path": "/ventas/comprobantes",
          "icon": "FileText",
          "module_required": "ventas.comprobantes"
        },
        {
          "id": "ventas.clientes",
          "label": "Clientes",
          "path": "/ventas/clientes",
          "icon": "Users",
          "module_required": "ventas.clientes"
        },
        {
          "id": "ventas.reportes",
          "label": "Reportes",
          "path": "/ventas/reportes",
          "icon": "BarChart2",
          "module_required": "ventas.reportes"
        }
      ]
    },
    {
      "id": "compras",
      "label": "Compras",
      "icon": "ShoppingCart",
      "module_required": "compras",
      "children": [
        {
          "id": "compras.comprobantes",
          "label": "Comprobantes",
          "path": "/compras/comprobantes",
          "icon": "FileText",
          "module_required": "compras.comprobantes"
        },
        {
          "id": "compras.proveedores",
          "label": "Proveedores",
          "path": "/compras/proveedores",
          "icon": "Truck",
          "module_required": "compras.proveedores"
        },
        {
          "id": "compras.ordenes_pago",
          "label": "Órdenes de Pago",
          "path": "/compras/ordenes-pago",
          "icon": "CreditCard",
          "module_required": "compras.ordenes_pago"
        }
      ]
    },
    {
      "id": "contable",
      "label": "Contable",
      "icon": "BookOpen",
      "module_required": "contable",
      "children": [
        {
          "id": "contable.plan_cuentas",
          "label": "Plan de Cuentas",
          "path": "/contable/catalogos",
          "icon": "List",
          "module_required": "contable.plan_cuentas"
        },
        {
          "id": "contable.conciliacion",
          "label": "Conciliación ARCA",
          "path": "/contable/conciliacion",
          "icon": "CheckSquare",
          "module_required": "contable.conciliacion"
        },
        {
          "id": "contable.conciliacion_bancaria",
          "label": "Conciliación Bancaria",
          "path": "/contable/conciliacion-bancaria",
          "icon": "GitMerge",
          "module_required": "contable.conciliacion_bancaria"
        },
        {
          "id": "contable.entity360",
          "label": "Vista 360°",
          "path": "/contable/entity360",
          "icon": "Eye",
          "module_required": "contable.entity360"
        }
      ]
    },
    {
      "id": "impuestos",
      "label": "Impuestos",
      "icon": "Percent",
      "module_required": "impuestos",
      "children": [
        {
          "id": "impuestos.iva",
          "label": "IVA",
          "path": "/impuestos/iva",
          "icon": "DollarSign",
          "module_required": "impuestos.iva"
        },
        {
          "id": "impuestos.iibb",
          "label": "Ingresos Brutos",
          "path": "/impuestos/iibb",
          "icon": "Map",
          "module_required": "impuestos.iibb"
        },
        {
          "id": "impuestos.retenciones",
          "label": "Retenciones",
          "path": "/impuestos/retenciones",
          "icon": "Scissors",
          "module_required": "impuestos.retenciones"
        }
      ]
    },
    {
      "id": "tesoreria",
      "label": "Tesorería",
      "icon": "Wallet",
      "module_required": "tesoreria",
      "children": [
        {
          "id": "tesoreria.cajas",
          "label": "Cajas",
          "path": "/tesoreria/cajas",
          "icon": "Archive",
          "module_required": "tesoreria.cajas"
        },
        {
          "id": "tesoreria.bancos",
          "label": "Bancos",
          "path": "/tesoreria/bancos",
          "icon": "Building",
          "module_required": "tesoreria.bancos"
        },
        {
          "id": "tesoreria.movimientos",
          "label": "Movimientos",
          "path": "/tesoreria/movimientos",
          "icon": "ArrowLeftRight",
          "module_required": "tesoreria.movimientos"
        },
        {
          "id": "tesoreria.monitor",
          "label": "Monitor",
          "path": "/tesoreria/monitor",
          "icon": "Activity",
          "module_required": "tesoreria.monitor"
        }
      ]
    }
  ]
}
```

### 4.2 Nuevo `enabled_modules` para SAILO (Romina):

```json
[
  "home",
  "home.acciones_rapidas",
  "home.cotizacion_dolar",
  "home.flujo_caja",
  "home.actividad_reciente",

  "ventas",
  "ventas.comprobantes",
  "ventas.clientes",
  "ventas.reportes",
  "ventas.facturacion_arca",

  "compras",
  "compras.comprobantes",
  "compras.proveedores",
  "compras.ordenes_pago",

  "contable",
  "contable.plan_cuentas",
  "contable.conciliacion",
  "contable.conciliacion_bancaria",
  "contable.entity360",

  "impuestos",
  "impuestos.iva",
  "impuestos.iibb",
  "impuestos.retenciones",

  "tesoreria",
  "tesoreria.cajas",
  "tesoreria.bancos",
  "tesoreria.movimientos",
  "tesoreria.monitor",
  "tesoreria.comprobantes",
  "tesoreria.bank_import",

  "erp_colppy",
  "erp_xubio",
  "bank_import"
]
```

---

## 5. SQL PARA ACTUALIZAR EL TENANT SAILO

```sql
-- PASO 1: Aplicar migración de nuevas columnas (sección 3.1)

-- PASO 2: Actualizar tenant SAILO con nueva configuración
UPDATE tenants
SET
  rubro = 'gestora',
  enabled_modules = '[
    "home",
    "home.acciones_rapidas",
    "home.cotizacion_dolar",
    "home.flujo_caja",
    "home.actividad_reciente",
    "ventas",
    "ventas.comprobantes",
    "ventas.clientes",
    "ventas.reportes",
    "ventas.facturacion_arca",
    "compras",
    "compras.comprobantes",
    "compras.proveedores",
    "compras.ordenes_pago",
    "contable",
    "contable.plan_cuentas",
    "contable.conciliacion",
    "contable.conciliacion_bancaria",
    "contable.entity360",
    "impuestos",
    "impuestos.iva",
    "impuestos.iibb",
    "impuestos.retenciones",
    "tesoreria",
    "tesoreria.cajas",
    "tesoreria.bancos",
    "tesoreria.movimientos",
    "tesoreria.monitor",
    "tesoreria.comprobantes",
    "tesoreria.bank_import",
    "erp_colppy",
    "erp_xubio",
    "bank_import"
  ]'::jsonb,
  sidebar_config = '{
    "sections": [
      {"id": "home", "label": "Inicio", "icon": "Home", "path": "/home", "module_required": "home"},
      {"id": "ventas", "label": "Ventas", "icon": "TrendingUp", "module_required": "ventas", "children": [
        {"id": "ventas.comprobantes", "label": "Comprobantes", "path": "/ventas/comprobantes", "icon": "FileText", "module_required": "ventas.comprobantes"},
        {"id": "ventas.clientes", "label": "Clientes", "path": "/ventas/clientes", "icon": "Users", "module_required": "ventas.clientes"},
        {"id": "ventas.reportes", "label": "Reportes", "path": "/ventas/reportes", "icon": "BarChart2", "module_required": "ventas.reportes"}
      ]},
      {"id": "compras", "label": "Compras", "icon": "ShoppingCart", "module_required": "compras", "children": [
        {"id": "compras.comprobantes", "label": "Comprobantes", "path": "/compras/comprobantes", "icon": "FileText", "module_required": "compras.comprobantes"},
        {"id": "compras.proveedores", "label": "Proveedores", "path": "/compras/proveedores", "icon": "Truck", "module_required": "compras.proveedores"},
        {"id": "compras.ordenes_pago", "label": "Órdenes de Pago", "path": "/compras/ordenes-pago", "icon": "CreditCard", "module_required": "compras.ordenes_pago"}
      ]},
      {"id": "contable", "label": "Contable", "icon": "BookOpen", "module_required": "contable", "children": [
        {"id": "contable.plan_cuentas", "label": "Plan de Cuentas", "path": "/contable/catalogos", "icon": "List", "module_required": "contable.plan_cuentas"},
        {"id": "contable.conciliacion", "label": "Conciliación ARCA", "path": "/contable/conciliacion", "icon": "CheckSquare", "module_required": "contable.conciliacion"},
        {"id": "contable.conciliacion_bancaria", "label": "Conciliación Bancaria", "path": "/contable/conciliacion-bancaria", "icon": "GitMerge", "module_required": "contable.conciliacion_bancaria"},
        {"id": "contable.entity360", "label": "Vista 360°", "path": "/contable/entity360", "icon": "Eye", "module_required": "contable.entity360"}
      ]},
      {"id": "impuestos", "label": "Impuestos", "icon": "Percent", "module_required": "impuestos", "children": [
        {"id": "impuestos.iva", "label": "IVA", "path": "/impuestos/iva", "icon": "DollarSign", "module_required": "impuestos.iva"},
        {"id": "impuestos.iibb", "label": "Ingresos Brutos", "path": "/impuestos/iibb", "icon": "Map", "module_required": "impuestos.iibb"},
        {"id": "impuestos.retenciones", "label": "Retenciones", "path": "/impuestos/retenciones", "icon": "Scissors", "module_required": "impuestos.retenciones"}
      ]},
      {"id": "tesoreria", "label": "Tesorería", "icon": "Wallet", "module_required": "tesoreria", "children": [
        {"id": "tesoreria.cajas", "label": "Cajas", "path": "/tesoreria/cajas", "icon": "Archive", "module_required": "tesoreria.cajas"},
        {"id": "tesoreria.bancos", "label": "Bancos", "path": "/tesoreria/bancos", "icon": "Building", "module_required": "tesoreria.bancos"},
        {"id": "tesoreria.movimientos", "label": "Movimientos", "path": "/tesoreria/movimientos", "icon": "ArrowLeftRight", "module_required": "tesoreria.movimientos"},
        {"id": "tesoreria.monitor", "label": "Monitor", "path": "/tesoreria/monitor", "icon": "Activity", "module_required": "tesoreria.monitor"}
      ]}
    ]
  }'::jsonb,
  erp_provider = 'both',
  arca_enabled = true,
  feature_flags = '{
    "ocr_telegram": true,
    "conciliacion_arca": true,
    "dolar_widget": true,
    "bank_import": true,
    "erp_injection_n8n": true
  }'::jsonb,
  condicion_iva = 'responsable_inscripto'
WHERE name = 'SAILO';
```

---

## 6. CAMBIOS EN EL FRONTEND — Instrucciones para Antigravity/Opus 4.6

### 6.1 Modificar `src/contexts/TenantContext.tsx`

Agregar las nuevas propiedades al interface `Tenant`:

```typescript
export interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  enabled_modules: string[];
  rubro: string | null;
  razon_social: string | null;
  cuit: string | null;
  direccion: string | null;
  email: string | null;
  ui_font_size?: string;
  ui_density?: string;
  // NUEVAS PROPIEDADES:
  erp_provider: 'colppy' | 'xubio' | 'both' | null;
  erp_config: Record<string, any>;
  arca_enabled: boolean;
  arca_config: Record<string, any>;
  sidebar_config: SidebarConfig | null;
  feature_flags: Record<string, boolean>;
  n8n_config: Record<string, any>;
  condicion_iva: string | null;
  ingresos_brutos: string | null;
  inicio_actividades: string | null;
}

export interface SidebarSection {
  id: string;
  label: string;
  icon: string;
  path?: string;
  module_required: string;
  children?: SidebarSection[];
}

export interface SidebarConfig {
  sections: SidebarSection[];
}
```

### 6.2 Crear/Modificar componente Sidebar dinámico

**Archivo: `src/components/layout/DynamicSidebar.tsx`**

El sidebar debe:
1. Leer `tenant.sidebar_config` del contexto
2. Si `sidebar_config` es null, usar un sidebar default basado en `tenant.rubro`
3. Para cada sección, verificar que `module_required` esté en `tenant.enabled_modules`
4. Renderizar con iconos de Lucide React (ya está en el proyecto)
5. Soportar secciones colapsables (parent con children)

**Lógica de visibilidad:**
```typescript
const isModuleEnabled = (moduleId: string): boolean => {
  // Si tiene el módulo padre, habilitar todos los hijos
  const parentModule = moduleId.split('.')[0];
  return tenant.enabled_modules.includes(moduleId) ||
         tenant.enabled_modules.includes(parentModule);
};
```

### 6.3 Mapeo de rutas existentes → nuevas rutas para gestora

| Ruta actual (inmobiliaria) | Nueva ruta (gestora) | Componente existente |
|---|---|---|
| `/contable/comprobantes` | `/ventas/comprobantes` | `src/modules/contable/Comprobantes.tsx` (filtrar tipo=venta) |
| `/contable/clientes` | `/ventas/clientes` | `src/modules/contable/Clientes.tsx` |
| `/contable/comprobantes` | `/compras/comprobantes` | `src/modules/contable/Comprobantes.tsx` (filtrar tipo=compra) |
| `/contable/proveedores` | `/compras/proveedores` | `src/modules/contable/Proveedores.tsx` |
| `/tesoreria/ordenes-pago` | `/compras/ordenes-pago` | `src/modules/tesoreria/OrdenEsPago/` |
| `/contable/catalogos` | `/contable/catalogos` | `src/modules/contable/Catalogos.tsx` |
| `/contable/conciliacion` | `/contable/conciliacion` | `src/modules/contable/Conciliacion/` |
| `/tesoreria/conciliacion` | `/contable/conciliacion-bancaria` | `src/modules/tesoreria/ConciliacionBancaria.tsx` |
| `/contable/entity360` | `/contable/entity360` | `src/modules/contable/Entity360Panel.tsx` |
| N/A (NUEVO) | `/impuestos/iva` | **CREAR** — vista de liquidación IVA |
| N/A (NUEVO) | `/impuestos/iibb` | **CREAR** — vista de IIBB |
| N/A (NUEVO) | `/impuestos/retenciones` | **CREAR** — vista retenciones |
| `/tesoreria/*` | `/tesoreria/*` | Mismos componentes |
| `/vision-general` | `/home` | `src/modules/vision_general/` (adaptar widgets) |

### 6.4 Vistas nuevas necesarias para la demo (mínimo viable)

**A) `/impuestos/iva` — Liquidación IVA**
- Mostrar tabla con: IVA Débito Fiscal (ventas) vs IVA Crédito Fiscal (compras)
- Calcular saldo: Débito - Crédito = Saldo a pagar/a favor
- Filtro por período (mes/año)
- Datos pueden venir de los comprobantes ya cargados en contable
- Para la demo: puede ser una vista read-only con datos de ejemplo

**B) `/impuestos/iibb` — Ingresos Brutos**
- Tabla resumen de base imponible por jurisdicción
- Alícuota aplicable
- Monto a pagar
- Para la demo: placeholder con estructura

**C) `/impuestos/retenciones` — Retenciones y Percepciones**
- Listado de retenciones sufridas y practicadas
- Agrupado por impuesto (IVA, Ganancias, IIBB)
- Para la demo: placeholder con estructura

### 6.5 Separar Comprobantes de Venta y Compra

El componente actual `Comprobantes.tsx` en contable maneja ambos tipos. Para la vista de gestora, se necesita:

```typescript
// src/modules/ventas/Comprobantes.tsx
// Wrapper que filtra solo comprobantes de VENTA
import { ComprobantesBase } from '../contable/Comprobantes';

export const ComprobantesVenta = () => (
  <ComprobantesBase tipo="venta" />
);

// src/modules/compras/Comprobantes.tsx
// Wrapper que filtra solo comprobantes de COMPRA
import { ComprobantesBase } from '../contable/Comprobantes';

export const ComprobantesCompra = () => (
  <ComprobantesBase tipo="compra" />
);
```

---

## 7. FLUJO COMPLETO — Cómo funciona para Romina

```
1. Romina se logea → TenantContext carga SAILO
2. SAILO tiene rubro='gestora' y sidebar_config con secciones
3. DynamicSidebar renderiza: Inicio | Ventas | Compras | Contable | Impuestos | Tesorería
4. Romina va a Ventas → Comprobantes → Crea factura de venta
5. Al confirmar factura → ARCA genera CAE (ya implementado)
6. Webhook n8n se dispara → Inyecta a Colppy/Xubio (ya implementado)
7. Romina va a Contable → Conciliación ARCA → Ve matching automático
8. Romina va a Impuestos → IVA → Ve liquidación mensual
```

---

## 8. PRIORIDADES PARA LA DEMO DEL LUNES

### CRÍTICO (debe funcionar):
1. **Sidebar dinámico** con las 6 secciones de Romina
2. **Home/Dashboard** con widgets de gestora (dólar, flujo caja, actividad)
3. **Ventas → Comprobantes** funcionando (reusar componente contable con filtro)
4. **Compras → Comprobantes** funcionando (reusar componente contable con filtro)

### IMPORTANTE (debería verse):
5. **Contable → Conciliación ARCA** (ya existe parcialmente)
6. **Compras → Proveedores** (ya existe en contable)
7. **Ventas → Clientes** (ya existe en contable)

### NICE-TO-HAVE (placeholders):
8. **Impuestos → IVA** (vista mock con datos de ejemplo)
9. **Impuestos → IIBB** (placeholder)
10. **Impuestos → Retenciones** (placeholder)

---

## 9. ARCHIVOS CLAVE A MODIFICAR

```
src/contexts/TenantContext.tsx          → Agregar nuevas propiedades al interface
src/components/layout/DynamicSidebar.tsx → CREAR - sidebar dinámico basado en config
src/App.tsx o router principal          → Agregar nuevas rutas (/ventas/*, /compras/*, /impuestos/*)
src/modules/contable/Comprobantes.tsx   → Refactorizar para aceptar prop "tipo" (venta/compra)
src/modules/ventas/                     → CREAR carpeta con wrappers
src/modules/compras/                    → CREAR carpeta con wrappers
src/modules/impuestos/                  → CREAR carpeta con vistas nuevas
src/modules/vision_general/             → Adaptar para ser Home de gestora
```

---

## 10. NOTAS TÉCNICAS

- **React Router DOM 7.13** — usar `createBrowserRouter` o `<Routes>` según lo que ya exista
- **Iconos** — Lucide React ya está instalado (`lucide-react`)
- **Animaciones** — Framer Motion ya está instalado, usar para transiciones de sidebar
- **Colores del tenant** — Se aplican via CSS variables en TenantContext (ya funciona)
- **Supabase** — Proyecto: `fuytejvnwihghxymyayw`, tabla: `tenants`
- **Deploy** — Vercel (auto-deploy en push a main)
