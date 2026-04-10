# NEURA-CORE / NeuraOrkesta — Documentación Completa

> Generado: 2026-04-10 | Última actualización basada en commit `ccb404a`

---

### 1. PROJECT OVERVIEW

**Project Name:** NeuraOrkesta / NEURA-CORE  
**Type:** Multi-tenant SaaS web application  
**Purpose:** Enterprise financial management, treasury, accounting, CRM, real estate management, construction project management, and HR/liquidation system

**Tech Stack:**
- **Frontend:** React 19.2.0, TypeScript 5.9, Vite 7.3, TailwindCSS 4.2, Framer Motion 12.34
- **Backend:** Supabase (PostgreSQL), Auth via Supabase Auth, Row-Level Security (RLS)
- **External Services:**
  - ARCA (AFIP) - Electronic invoice integration via n8n
  - Xubio ERP - Accounting sync
  - Colppy ERP - Accounting sync
  - dolarapi.com - Real-time USD/ARS exchange rates
  - n8n (https://n8n.neuracall.net) - Workflow automation, webhooks, ERP injection
  - Google Maps API, Leaflet (maps)
  - Excel export (xlsx library)
  - PDF generation (jsPDF)
- **Deployment:** Vite build for static hosting, Supabase Edge Functions for server-side logic
- **Node Modules:** 46 production dependencies

**Key Features:**
- Multi-tenant with tenant customization (colors, UI density, sidebar config)
- Role-based access control (superadmin, admin, user, basic)
- Module-based feature flags (enable/disable functionalities per tenant)
- Real-time updates via Supabase subscriptions
- Responsive design (desktop + mobile nav)
- Dark/light/system theme support
- Wizard patterns for complex flows (invoicing, payroll)
- Advanced search with GlobalSearch component
- Chatbot integration via n8n

---

### 2. MULTI-TENANT ARCHITECTURE

#### 2.1 Tenant Model

Table: `tenants`  
Key columns:
- `id` (UUID, PK) — unique identifier
- `name` (text) — display name (e.g., "AFG Constructora", "SAILO Gestora")
- `rubro` (text) — business category: `constructora`, `inmobiliaria`, `automotriz`, `general`, `gestora`, `comercio`, `servicios`
- `enabled_modules` (JSONB array) — list of active module flags (see section 3.1)
- `sidebar_config` (JSONB) — custom navigation structure (overrides default layout per rubro)
- `primary_color`, `secondary_color` (text) — brand colors (hex), applied via CSS custom properties
- `ui_font_size` (text) — `small`, `medium`, `large` (maps to --font-size-base CSS var)
- `ui_density` (text) — `compact`, `normal`, `comfortable` (maps to --density-scale)
- `razon_social`, `cuit`, `direccion`, `email` — legal/contact info
- `erp_provider` (text) — `colppy`, `xubio`, `both`, or null
- `arca_enabled` (boolean), `arca_config` (JSONB) — electronic invoicing setup

#### 2.2 User-Tenant Association

Table: `users`  
Key columns:
- `id` (UUID, PK) — Supabase Auth UID
- `tenant_id` (UUID FK) — which tenant this user belongs to
- `role` (text) — `superadmin`, `admin`, `user`, `basic`
- `enabled_modules` (JSONB array) — user's module access (subset of tenant's modules)
- `display_name` (text) — full name or first name
- `email` (text) — contact email

#### 2.3 How Tenants Work

1. **Authentication:** User logs in via `/login` with email/password. Supabase Auth returns a session + JWT.
2. **Tenant Load:** `TenantContext` fetches the user's assigned tenant from `users.tenant_id`.
3. **Permissions:** Layout uses `hasModuleAccess()` to check if user (and tenant) have module enabled.
4. **Styling:** Tenant's colors, fonts, density applied to DOM root via CSS custom properties.
5. **RLS:** All tables use RLS policies that check `auth.uid()` → `tenant_id`.

#### 2.4 Adding a New Tenant

```sql
INSERT INTO tenants (name, rubro, enabled_modules, primary_color, secondary_color)
VALUES (
  'New Company S.A.',
  'general',
  '["tesoreria", "contable", "crm"]'::jsonb,
  '#2563EB',
  '#10B981'
);

-- Then create admin user for that tenant:
INSERT INTO users (id, tenant_id, role, email, enabled_modules)
VALUES (
  '<user_uuid_from_auth>',
  '<tenant_id>',
  'admin',
  'admin@newcompany.com',
  '["tesoreria", "contable", "crm"]'::jsonb
);
```

#### 2.5 Current Tenants

| Tenant | Rubro | Enabled Modules | Key Features |
|--------|-------|-----------------|--------------|
| **AFG Constructora S.R.L.** | constructora | tesoreria, contable, crm, administracion, logistica, bank_import, erp_colppy, erp_xubio | Liquidaciones, Obras, Centro de Costos Construcción |
| **Antigravity Gestora** | inmobiliaria | inmobiliaria, contable, crm, tesoreria (full) | Propiedades, Contratos, Expensas, Servicios, Cuentas Corrientes |
| **Automotores Alcorta** | automotriz | comercial, crm (full) | Pipeline, Catálogo Autos, Contactos, Prospectos |
| **SAILO Gestora** | general | tesoreria, contable, crm, administracion, bank_import, erp_colppy, erp_xubio | Treasury, Accounting, Payments, Invoicing |
| **Neuracall Admin** (superadmin) | general | all modules | Full access for testing/development |

---

### 3. MODULE ARCHITECTURE

#### 3.1 Module List & Features

Modules are defined in `enabled_modules` array in `tenants` table. They control what the frontend renders.

##### **TESORERÍA** (Treasury Management)
**Path:** `/tesoreria/*`  
**Purpose:** Cash flow, bank accounts, invoices, payment orders  
**Supabase Tables:**
- `treasury_accounts` — bank accounts, cash boxes, credit cards
- `treasury_transactions` — movements (income/expense)
- `treasury_categories` — expense/income categories (hierarchical)
- `treasury_projects` — cost centers
- `cash_settlements` — weekly cash reconciliation
- `tesoreria_proyecciones` — cash flow forecasts
- `contable_comprobantes` — invoices (shared with Contable)
- `ordenes_pago` — payment orders
- `conciliacion_bancaria` — bank reconciliation tracking
- `caja_chica_asignaciones` — petty cash assignments

**Pages/Components:**
- `Dashboard.tsx` — KPIs, cash flow timeline, pending transactions
- `Movimientos.tsx` — transaction list, create/edit transaction form
- `Comprobantes.tsx` — invoice management
- `Cajas.tsx` — cash boxes list + `CajaDetalle.tsx` (single box detail)
- `Bancos.tsx` — bank accounts management
- `ConciliacionBancaria.tsx` — bank statement reconciliation
- `OrdenesPago/` — payment order management (wizard pattern)
  - `index.tsx` — list & navigation
  - `NuevaOrdenPago.tsx` — create/edit order
  - `OrdenesPagoList.tsx` — orders table
  - `PaymentModal.tsx` — confirm payment
- `Equipo.tsx` — team management (admin only)
- `Monitor.tsx` — real-time treasury monitoring
- `Proyecciones.tsx` — cash flow forecasting (alternative: `ProyeccionesInmob` for inmobiliaria)
- `CentroCostos.tsx` — cost center management (constructora: → `CentroCostosCons`)

**Business Logic:**
- Transaction form validates amount, date, method (transferencia, efectivo, cheque, tarjeta)
- Dashboard filters transactions by 7-day rolling periods or custom date range
- Pending transactions auto-reschedule or confirm payment
- Payment methods grouped by account type (bank vs. cash)
- Weekly cash box settlements require all assigned users to submit

**Special Behaviors:**
- Role-based visibility: basic users see only their assigned account; admins see all
- Auto-calculations: balance updates in real-time via Supabase subscriptions
- Sidebar conditional: if tenant has `inmobiliaria` enabled, Dashboard routes to Proyecciones instead

---

##### **CONTABLE** (Accounting / Accounting Module)
**Path:** `/contable/*` or `/ventas/*` or `/compras/*`  
**Purpose:** Invoice management, ledger, vendor/customer master data, accounting reconciliation  
**Supabase Tables:**
- `contable_comprobantes` — invoices (sales/purchases), synced from ERPs
- `contable_clientes` — customer master data
- `contable_proveedores` — vendor master data
- `contable_categorias` — hierarchical cost codes
- `contable_config` — ERP credentials (Colppy, Xubio, ARCA), punto_venta, invoice settings
- `contable_conciliacion_arca` — reconciliation state with ARCA invoices
- `contable_comprobante_centros` — cost allocation across multiple projects (constructora)
- `sync_runs` — history of ERP/ARCA sync operations

**Pages/Components:**
- `Dashboard.tsx` — accounting summary KPIs
- `Comprobantes/index.tsx` — invoice list, filter by type (venta/compra), with grid + mobile views
  - `ComprobanteForm.tsx` — manual invoice entry (date, vendor, amount, categories)
  - `GastoIngresoForm.tsx` — simplified income/expense form
  - `ComprobantesGrid.tsx` — table with inline editing
  - `useComprobantes.ts` — CRUD hook
- `Proveedores.tsx` — vendor management (sync with ERP, default cost code)
- `Clientes.tsx` — customer management
- `Catalogos.tsx` — chart of accounts / cost center config
- `Configuracion.tsx` — global settings, ERP integration (Colppy/Xubio auth, ARCA config)
- `Conciliacion/` — ARCA reconciliation (emitted/received invoices)
  - `index.tsx` — main reconciliation UI
  - `BancoPanel.tsx` — bank invoice list
  - `ArcaPanel.tsx` — ARCA invoice list
  - `MatchSummaryBar.tsx` — match count summary
  - `useConciliacion.ts` — reconciliation logic
- `Entity360Panel.tsx` — vendor/customer 360° view

**Business Logic:**
- Invoice sync from ERPs (Xubio, Colppy) via Edge Functions (`sync-xubio`, `sync-colppy`)
- Manual invoice entry with OCR support (n8n webhook integration)
- ARCA sync (AFIP electronic invoices) via Edge Function `sync-arca-iniciar` + polling
- Reconciliation: match emitted invoices with ARCA records
- Cost allocation: for constructora, invoice can be split across multiple projects via `contable_comprobante_centros`

**Special Behaviors:**
- "Gestora" tenants see split tabs: `/ventas/comprobantes`, `/compras/comprobantes` (different data types)
- ERP injection: button sends invoice to Colppy/Xubio via n8n webhook
- Automatic categorization based on vendor default category

---

##### **CRM** (Customer Relationship Management)
**Path:** `/crm/*`  
**Purpose:** Contact management, sales prospects, opportunities, project leads  
**Supabase Tables:**
- `crm_contactos` — person/company contacts (name, email, phone, tags)
- `crm_prospectos` — sales opportunities (status: lead, qualified, proposal, won, lost)
- `crm_obras` — construction/project prospects
- `crm_catalogo_autos` — vehicle catalog for automotriz rubro
- `crm_interacciones` — history of communications (email, call, meeting)

**Pages/Components:**
- `Dashboard.tsx` — KPI summary (total contacts, open prospects, conversion funnel)
- `Contactos.tsx` — contact list, create/edit contact card
- `Prospectos.tsx` — prospect/opportunity pipeline
- `Obras.tsx` — construction project prospects
- `CatalogoAutos.tsx` — vehicle listing (automotriz rubro only)

**Business Logic:**
- Contact categorization: person vs. company
- Tags for filtering (prospect, client, vendor, partner)
- Opportunity tracking: status flow (lead → qualified → proposal → won/lost)
- Integration: contactos appear in Comercial Pipeline (sales reps), CRM Obras (construction), etc.

---

##### **COMERCIAL** (Commercial / Sales)
**Path:** `/comercial/*`  
**Purpose:** Sales pipeline, proposals, contracts  
**Supabase Tables:**
- `comercial_pipeline` — deals in stages (prospecting, proposal, negotiation, closed)
- `comercial_config` — pipeline stages, sales territories

**Pages/Components:**
- `Dashboard.tsx` — sales funnel, revenue forecast
- `Pipeline.tsx` — Kanban-style pipeline board
- `Contactos.tsx` — sales contact list
- `ContactoDetalle.tsx` — contact detail view with history
- `Reportes.tsx` — sales reports (by rep, by product, by region)
- `Config.tsx` — pipeline customization, territory management

**Business Logic:**
- Drag-drop deals across stages in Pipeline
- Auto-update expected close date based on stage
- Integration with CRM contacts

---

##### **INMOBILIARIA** (Real Estate Management)
**Path:** `/inmobiliaria/*`  
**Purpose:** Property management, tenant contracts, rental collections, maintenance  
**Supabase Tables:**
- `inmobiliaria_propiedades` — properties (address, type, units, owner)
- `inmobiliaria_contratos` — rental/service contracts
- `inmobiliaria_liquidaciones` — rental income collection
- `inmobiliaria_cuentas_corrientes` — tenant account balances
- `inmobiliaria_servicios` — utilities, maintenance, insurance
- `inmobiliaria_expensas` — shared building expenses
- `inmobiliaria_agenda` — appointments, inspections, maintenance
- `inmobiliaria_proyecciones` — cash flow forecast by property
- `inmobiliaria_ordenes_trabajo` — maintenance/repair orders

**Pages/Components:**
- `Dashboard.tsx` — properties overview, pending collections
- `Propiedades.tsx` — property list, create/edit property
- `Contratos.tsx` — contract management
- `Liquidaciones.tsx` — income collection tracking
- `CuentasCorrientes.tsx` — tenant account statements
- `Servicios.tsx` — service tracking (utilities, repairs)
- `Expensas.tsx` — shared expense calculation and billing
- `Agenda.tsx` — calendar-based appointment/inspection scheduling
- `OrdenesTrabajoMobile.tsx` — mobile-optimized maintenance order entry
- `FacturarMobile.tsx` — mobile invoice wizard for properties
- `Proveedores.tsx` — maintenance vendor directory
- `MapaPropiedades.tsx` — Google Maps view of properties
- `Proyecciones.tsx` — rental income forecasting

**Business Logic:**
- Multi-unit properties: each unit can have separate tenant + contract
- Expensas: shared building costs auto-allocated across units
- Servicios: utilities, insurance linked to properties
- Collections: track pending rent, defaults, payment plans
- Mobile-first Facturar wizard for on-site invoicing

**Special Behaviors:**
- Dashboard shows "Operaciones" and "Gestión" tabs on mobile (condensed layout)
- Sidebar shows custom tabs: Operaciones → Propiedades/Contratos/Órdenes; Gestión → Cuentas/Expensas/Servicios
- MapaPropiedades uses Leaflet + Google Maps

---

##### **LIQUIDACIONES / RRHH** (HR / Payroll Management)
**Path:** `/liquidaciones/*`  
**Purpose:** Employee management, timesheets, bi-weekly payroll calculation  
**Supabase Tables:**
- `liq_obras` — worksites/projects for which employees are assigned
- `liq_categorias` — job categories (obrero, maestro, etc.) with hourly rates
- `liq_valores_hora` — hourly rate by category, versioned by date
- `liq_empleados` — employee master (name, DNI, CUIL, start date, revestimiento flag)
- `liq_empleado_categoria_hist` — employee category history (date-range based)
- `liq_quincenas` — bi-weekly payroll periods
- `liq_fichajes` — daily timesheets (clock in/out, late arrivals, early departures)
- `liq_ausencias` — absences (unjustified, medical visit, ART, vacation, strike, permission, etc.)
- `liq_liquidacion_detalle` — final payroll calculation per employee per period
- `liq_contador_uploads` — accountant's counter-calculations (PDF uploads)

**Pages/Components:**
- `Dashboard.tsx` — KPIs: active employees, active projects, today's timesheets, open payroll period
- `Empleados.tsx` — employee list, create/edit
- `Obras.tsx` — worksite/project management
- `Fichajes.tsx` — timesheet entry (one-by-one)
- `FichajeMasivo.tsx` — bulk timesheet import (Excel)
- `Quincenas.tsx` — payroll period management (create, open, calculate, close)
- `QuincenaDetalle.tsx` — individual payroll calculation detail
- `Categorias.tsx` — job category + hourly rate management

**Business Logic:**
- **Fichaje Calculation:**
  - Base hours: 8 hrs/day
  - Extras: hours > 8 hrs count as 50% extra; hours > 10 hrs count as 100% extra
  - Tardanzas (late arrivals): tracked in minutes, auto-deducted
  - Salida Anticipada (early departures): tracked, deducted
  - Ausencias: counted per type (unjustified, medical, vacation, etc.), affect presentism bonus
  
- **Liquidation Formula:**
  - Subtotal Normal: horas_normales × valor_hora
  - Subtotal Extras: (horas_extra_50 × valor_hora × 1.5) + (horas_extra_100 × valor_hora × 2.0)
  - Revestimiento: if `es_revestimiento`, add 20% bonus (or custom %)
  - Presentism Bonus: if no unjustified absences, add fixed amount
  - **Total Bruto** = Subtotal Normal + Subtotal Extras + Revestimiento + Presentism
  
- **Período Abierto:** employees and managers can enter/edit fichajes
- **Período Calculado:** system calculates liquidación_detalle; can edit antes de enviar contador
- **Período Enviado Contador:** accountant reviews, uploads counter-calculation PDF
- **Período Liquidado:** final payroll locked, ready for payment (transferencia, efectivo, or pending contador)

**Special Behaviors:**
- Revestimiento: flag on employee (applies 20% bonus by default)
- Fechas: quincena has fecha_desde, fecha_hasta; fichajes must be within that range
- Categoria history: employee can switch categories mid-quincena; liquidation uses correct rate per date

---

##### **OBRAS** (Construction Management)
**Path:** `/obras/*`  
**Purpose:** Construction project management, budgets, contractors, progress tracking, documentation  
**Supabase Tables:**
- `obras_fichas` — construction projects (name, address, type, contractor, dates, surface)
- `obras_config_tipos_obra` — project types
- `obras_config_roles` — roles (site manager, supervisor, safety officer)
- `obras_fichas_roles` — personnel assignments by role
- `obras_fichas_empleados` — employee assignments to projects
- `obras_presupuestos` — project budget (versioned)
- `obras_presupuesto_items` — budget line items by category/rubro
- `obras_certificados` — progress certificates (monthly milestones)
- `obras_certificado_detalle` — actual vs. budgeted quantities per item
- `obras_contratistas` — subcontractors (plumbing, electrical, etc.)
- `obras_contratista_docs` — contractor documentation (ART, insurance, licensing)
- `obras_cartas_oferta` — quotes from contractors
- `obras_materiales_pedidos` — material orders
- `obras_partes_diarios` — daily progress reports (weather, workers present, incidents)
- `obras_documentos` — project documentation (plans, permits, certificates)
- `obras_vencimientos` — contractor/employee/insurance expiry alerts
- `obras_f931` — payroll tax form (F931) generation
- `obras_config_*` — customizable lists (rubros de presupuesto, conceptos de costo, etc.)

**Pages/Components:**
- `Dashboard.tsx` — projects overview, KPIs (active projects, budget status, pending tasks)
- `Fichas.tsx` — project list, create/edit project
- `ObraDetalle.tsx` — single project dashboard with tab navigation
  - `tabs/TabEquipo.tsx` — personnel assignments
  - `tabs/TabPresupuesto.tsx` — budget vs. actual tracking
  - `tabs/TabDocumentacion.tsx` — document library
  - `tabs/TabPartesDiarios.tsx` — daily reports
- `Contratistas.tsx` — subcontractor directory
- `CartasOferta.tsx` — contractor quote management
- `Materiales.tsx` — material order tracking
- `Vencimientos.tsx` — alert system for expirations (licenses, insurance, certifications)
- `F931.tsx` — payroll tax form generation
- `Reportes.tsx` — project reports (budget variance, timeline, team productivity)

**Business Logic:**
- **Budget Management:** versioned budgets allow multiple scenarios; track actuals vs. budget
- **Certificates:** monthly progress milestones track physical and financial progress
- **Contractors:** track qualifications, insurance, performance ratings
- **Daily Reports:** track weather, workforce, incidents, productivity
- **F931:** auto-generate payroll tax form from liquidaciones linked to project
- **Vencimientos:** system auto-generates expiry alerts for contractor docs, employee certifications

**Special Behaviors:**
- Budget rubros customizable per tenant
- Auto-calculation of cost burden (cargas sociales) per project
- Mobile-friendly daily report entry (on-site field supervisors)

---

##### **CONSTRUCCIÓN** (Construction Accounting)
**Path:** `/tesoreria/centro-costos` (for constructora rubro)  
**Purpose:** Cost center management specific to construction companies  
**Key Files:**
- `CentroCostosCons.tsx` — hierarchical cost center builder for construction projects
- `PlanCuentasCons.tsx` — chart of accounts for construction (IIBB, social contributions, equipment)
- `HierarchicalCategorySelect.tsx` — reusable component for nested category selection
- `ProrrateoModal.tsx` — cost allocation wizard (split invoice across multiple projects)
- `ProveedorSearch.tsx` — vendor search with auto-category assignment

**Supabase Tables (shared with Tesorería/Contable):**
- `treasury_projects` — cost centers (with `is_global` flag for "AFG CONST" global center)
- `contable_comprobante_centros` — invoice prorrateo records

**Business Logic:**
- Hierarchical cost structure: Nivel 1 (Proyecto) → Nivel 2 (Sector) → Nivel 3 (Subcategoría)
- Prorrateo: when invoice imported, can split % or amount across multiple projects
- Global center: some costs (e.g., admin) go 100% to global; others split by project

---

##### **AGRO** (Agricultural)
**Path:** `/contable/conciliacion-comprobantes`, `/contable/comprobantes`  
**Purpose:** Agricultural/farm business accounting  
**Key Files:**
- `FacturarAgro.tsx` — desktop invoice form (full-featured)
- `ConciliacionComprobantes.tsx` — invoice reconciliation view
- `OrdenDePagoForm.tsx` — payment order form (reusable)

**Business Logic:**
- Uses standard Contable tables (`contable_comprobantes`, etc.)
- Custom invoice form for agro-specific fields (crop type, harvest date, pesticide costs, etc.)
- Reconciliation highlights potential matches with ARCA records

---

##### **IMPUESTOS** (Taxes - Placeholder)
**Path:** `/impuestos/*`  
**Purpose:** Tax management (IVA, Ingresos Brutos, retenciones)  
**Pages/Components:**
- `Placeholder.tsx` — currently shows "Coming soon" message

**Future Implementation:**
- IVA returns (monthly, summary of sales/purchases)
- Ingresos Brutos (provincial tax on income)
- Retenciones (tax withholdings from suppliers)

---

##### **SUPERADMIN** (SuperAdmin Dashboard)
**Path:** `/superadmin`  
**Purpose:** Tenant management, user management, system-wide monitoring  
**Supabase Tables:**
- `tenants` — read/write
- `users` — read/write
- `sync_runs` — view
- `chatbot_memory` — view

**Pages/Components:**
- `Dashboard.tsx` — list of tenants, create/edit tenant, toggle modules, view activity logs

**Business Logic:**
- Only superadmin role can access
- Create new tenant, assign modules, set colors/fonts, configure integrations
- Bulk import users, assign roles
- Monitor sync runs (ARCA, Xubio, Colppy), view error logs

---

##### **AUTH** (Authentication)
**Path:** `/login`, `/register`, `/set-password`  
**Purpose:** User authentication and account management  
**Pages/Components:**
- `Login.tsx` — email/password login
- `Register.tsx` — new account registration (if enabled)
- `SetPassword.tsx` — password reset flow

**Business Logic:**
- Uses Supabase Auth (email/password OTP)
- On first login, redirect to SetPassword if needed
- Session management via JWT (stored in browser)

---

##### **VISION GENERAL** (Home / Dashboard)
**Path:** `/` (root)  
**Purpose:** Landing page with dashboard widgets  
**Pages/Components:**
- `VisionGeneral.tsx` — main home page
- Widgets in `widgets/`:
  - `ResumenFinancieroWidget.tsx` — total balance, monthly income/expense
  - `FlujoCajaWidget.tsx` — cash flow chart
  - `CotizacionDolarWidget.tsx` — USD/ARS rates
  - `MonitorTesoreriaWidget.tsx` — pending treasury items
  - `AccionesRapidasWidget.tsx` — quick shortcuts (New Invoice, Payroll, etc.)
  - `ActividadRecienteWidget.tsx` — recent transactions timeline
  - `RankingEntidadesWidget.tsx` — top vendors/customers by amount
  - `DirectorioWidget.tsx` — team directory
  - `OrigenRegistrosWidget.tsx` — data origin breakdown

**Business Logic:**
- Widget selection based on tenant `enabled_modules`
- Real-time data fetch from all tables (parallelized)
- Dolar Service integration for exchange rates

---

### 4. SHARED INFRASTRUCTURE

#### 4.1 Layout System

**File:** `src/shared/components/Layout.tsx`

**Core Structure:**
```
<div className="app-shell">
  <Sidebar />           // Desktop only
  <main>
    <TopBar />
    <Outlet />          // Route content
    <MobileNav />       // Mobile only
  </main>
  <ChatbotAsistente />  // Floating chatbot
  <AgentMonitor />      // Optional Cmd+J panel
</div>
```

**Key Features:**
- **Responsive:** sidebar hidden on mobile, topbar becomes mobile nav
- **Dynamic Sidebar:** if `tenant.sidebar_config` is set, render custom sections; else use default layout per rubro
- **Section Tabs:** horizontal tab bar below topbar showing current module's subpages
- **Pending Badges:** display count of pending items (e.g., unsigned cash settlements, pending invoices)
- **Quick Actions:** + button for fast access to most common actions (if inmobiliaria rubro)

**Module Access Logic:**
```typescript
const hasModuleAccess = (moduleId: string) => {
  // Check if tenant has parent module
  // Check if user has module (if not admin)
  // Handle submodule constraints (e.g., 'tesoreria.movimientos')
}
```

#### 4.2 Sidebar Navigation

**Dynamic Sidebar:** `src/shared/components/DynamicSidebar.tsx`  
Renders custom sidebar based on `tenant.sidebar_config`.

**Default Layouts (hardcoded fallback):**
- **Tesorería rubro:** Tesorería, Contable, CRM tabs
- **Inmobiliaria rubro:** Operaciones, Gestión, Finanzas tabs
- **Constructora rubro:** Tesorería, Contable, Liquidaciones, Obras tabs
- **Comercial/Automotriz:** CRM, Comercial tabs

**TopBar:** `src/shared/components/TopBar.tsx`  
Displays:
- Tenant logo + name
- Current user info
- Theme toggle
- Global search icon
- Notifications (pending items count)
- User menu (settings, logout)

**MobileNav:** `src/shared/components/MobileNav.tsx`  
Bottom tab bar for mobile:
- Home
- Finanzas (or module-specific tabs)
- Operaciones (if inmobiliaria)
- Menu (settings)

#### 4.3 Contexts

**AuthContext** (`src/contexts/AuthContext.tsx`)
```typescript
interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: string | null;             // superadmin, admin, user, basic
  displayName: string;             // formatted user name
  userModules: string[] | null;    // user's enabled modules
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
```
- Fetches from `users` table on auth state change
- Manages Supabase session lifecycle

**TenantContext** (`src/contexts/TenantContext.tsx`)
```typescript
interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  enabled_modules: string[];
  rubro: string | null;
  sidebar_config: any;
  // ... other fields
}

interface TenantContextType {
  tenant: Tenant | null;
  userProfile: any | null;
  loading: boolean;
  refreshTenant: () => void;
}
```
- Fetches tenant data via user → tenants join
- Applies tenant colors/fonts to DOM root CSS custom properties
- Tracks UI density and font size preferences

**ThemeContext** (`src/contexts/ThemeContext.tsx`)
- Manages light/dark/system theme preference
- Persists in localStorage

**ToastContext** (`src/contexts/ToastContext.tsx`)
- Toast notification system (success, error, warning, info)
- Auto-dismiss after 5 seconds
- Accessible via `useToast()` hook

#### 4.4 Shared Components

**StyledSelect** (`src/shared/components/StyledSelect.tsx`)  
Custom styled `<select>` replacement:
- Parses native `<option>` elements
- Opens dropdown with smart positioning (above/below)
- Keyboard accessible
- Usage: `<StyledSelect value={val} onChange={e => setVal(e.target.value)}><option>...</option></StyledSelect>`

**CustomSelect** (`src/shared/components/CustomSelect.tsx`)  
Advanced dropdown:
- Search/filter options
- Multi-select support
- Async option loading
- Grouping

**ConfirmDelete** (`src/shared/components/ConfirmDelete.tsx`)  
Reusable delete confirmation modal:
```typescript
<ConfirmDelete
  isOpen={isOpen}
  itemName="Invoice #123"
  onConfirm={() => handleDelete()}
  onCancel={() => setIsOpen(false)}
/>
```

**ChatbotAsistente** (`src/shared/components/ChatbotAsistente.tsx`)  
Floating chatbot (integrates with n8n `neuracore-chat` webhook):
- Message input
- Conversation history
- Powered by n8n workflow

**GlobalSearch** (`src/shared/components/GlobalSearch.tsx`)  
Cmd+K searchable index:
- Searches across invoices, contacts, projects, etc.
- Fuzzy matching
- Quick navigation to results

**DocumentViewer** (`src/shared/components/DocumentViewer.tsx`)  
PDF/image viewer for invoices, contracts, etc.

**SkeletonKit** (`src/shared/components/SkeletonKit.tsx`)  
Loading placeholders (shimmer effect)

#### 4.5 Utilities

**iconMap** (`src/shared/utils/iconMap.ts`)  
Maps icon names (strings) to Lucide React components:
```typescript
const resolveIcon = (name: string) => {
  const map = { 'home': Home, 'settings': Settings, ... };
  return map[name] || FileText;
};
```

**DolarService** (`src/services/DolarService.ts`)  
Fetches real-time USD/ARS rates from dolarapi.com:
- `getCotizaciones()` — all rates (oficial, blue, MEP, CCL)
- `getOficialVenta()` — BNA venta rate (most common)
- `convertUsdToArs(amount)` — quick conversion
- 5-minute client-side cache

**bankParsers** (`src/utils/bankParsers.ts`)  
Parsing utility for bank statement imports (CSV, OFX, custom formats)

**XubioService** (`src/services/XubioService.ts`)  
Client-side Xubio ERP integration:
- Authenticate with OAuth
- Fetch invoices, customers, vendors
- Sync data to Supabase (via Edge Function for safety)

**ColpyService** (`src/services/ColpyService.ts`)  
Client-side Colppy ERP integration (similar to Xubio)

#### 4.6 CSS Custom Properties

Applied by TenantContext and ThemeContext:

```css
:root {
  /* Tenant colors */
  --tenant-primary: #2563EB;
  --tenant-secondary: #10B981;
  --color-accent: var(--tenant-primary);
  --color-accent-dim: rgba(37, 99, 235, 0.0941); /* 0.0941 ≈ 10% opacity */

  /* UI Sizing */
  --font-size-base: 15px;  /* small: 13.5px, medium: 15px, large: 16.5px */
  --density-scale: 1;      /* compact: 0.85, normal: 1, comfortable: 1.2 */

  /* Theme colors */
  --color-text-primary: #0f172a;
  --color-text-muted: #64748b;
  --color-text-faint: #94a3b8;
  --color-bg-surface: #ffffff;
  --color-bg-hover: #f8fafc;
  --color-border: #e2e8f0;
  --color-border-subtle: #f1f5f9;
  --color-cta: var(--color-accent);
  
  /* Dark mode (class="dark") */
  --color-text-primary: #f8fafc;
  --color-bg-surface: #1e293b;
  /* ... */
}
```

---

### 5. DATABASE SCHEMA

All tables use `tenant_id` (UUID FK to tenants) for multi-tenant isolation + RLS policies.

#### 5.1 Core Tables (Supabase Auth)

| Table | Purpose |
|-------|---------|
| `auth.users` | Supabase Auth user records |

#### 5.2 Tenants & Users

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant configuration |
| `users` | Application users, role + module access |
| `messaging_connections` | Telegram/WhatsApp webhook credentials |

#### 5.3 Treasury

| Table | Purpose |
|-------|---------|
| `treasury_accounts` | Bank accounts, cash boxes, credit lines |
| `treasury_transactions` | Income/expense movements |
| `treasury_categories` | Hierarchical expense/income categories |
| `treasury_projects` | Cost centers |
| `cash_settlements` | Weekly cash box reconciliation |
| `tesoreria_proyecciones` | Cash flow forecasts |
| `ordenes_pago` | Payment orders |
| `conciliacion_bancaria` | Bank statement matching |

#### 5.4 Accounting

| Table | Purpose |
|-------|---------|
| `contable_comprobantes` | Invoices (sales/purchases), upsertable from ERPs |
| `contable_clientes` | Customers |
| `contable_proveedores` | Vendors |
| `contable_categorias` | Hierarchical chart of accounts |
| `contable_config` | ERP credentials, ARCA config |
| `contable_conciliacion_arca` | ARCA sync state |
| `contable_comprobante_centros` | Invoice cost allocation (constructora) |
| `sync_runs` | History of ERP/ARCA sync operations |

#### 5.5 CRM

| Table | Purpose |
|-------|---------|
| `crm_contactos` | Person/company contacts |
| `crm_prospectos` | Sales opportunities |
| `crm_obras` | Construction project prospects |
| `crm_interacciones` | Communication history |
| `crm_catalogo_autos` | Vehicle catalog (automotriz) |

#### 5.6 Commercial

| Table | Purpose |
|-------|---------|
| `comercial_pipeline` | Sales deals by stage |
| `comercial_config` | Pipeline customization |

#### 5.7 Real Estate

| Table | Purpose |
|-------|---------|
| `inmobiliaria_propiedades` | Properties |
| `inmobiliaria_contratos` | Rental/service contracts |
| `inmobiliaria_liquidaciones` | Rent collection |
| `inmobiliaria_cuentas_corrientes` | Tenant account statements |
| `inmobiliaria_servicios` | Utilities, maintenance |
| `inmobiliaria_expensas` | Shared building expenses |
| `inmobiliaria_agenda` | Appointments, inspections |
| `inmobiliaria_ordenes_trabajo` | Maintenance orders |

#### 5.8 Payroll

| Table | Purpose |
|-------|---------|
| `liq_obras` | Worksites for liquidaciones |
| `liq_categorias` | Job categories |
| `liq_valores_hora` | Hourly rates (versioned) |
| `liq_empleados` | Employees |
| `liq_empleado_categoria_hist` | Employee category history |
| `liq_quincenas` | Bi-weekly payroll periods |
| `liq_fichajes` | Daily timesheets |
| `liq_ausencias` | Absences/justifications |
| `liq_liquidacion_detalle` | Final payroll calculations |
| `liq_contador_uploads` | Accountant counter-calculations |

#### 5.9 Construction Projects

| Table | Purpose |
|-------|---------|
| `obras_fichas` | Construction projects |
| `obras_presupuestos` | Project budgets (versioned) |
| `obras_presupuesto_items` | Budget line items |
| `obras_certificados` | Progress milestones |
| `obras_certificado_detalle` | Actual vs. budgeted items |
| `obras_contratistas` | Subcontractors |
| `obras_contratista_docs` | Contractor documentation |
| `obras_cartas_oferta` | Contractor quotes |
| `obras_materiales_pedidos` | Material orders |
| `obras_partes_diarios` | Daily progress reports |
| `obras_documentos` | Project documentation |
| `obras_vencimientos` | Expiry alerts |
| `obras_f931` | Payroll tax forms |
| `obras_config_*` | Customizable lists |

#### 5.10 Other

| Table | Purpose |
|-------|---------|
| `chatbot_memory` | Chatbot conversation state (n8n integration) |

---

### 6. SUPABASE EDGE FUNCTIONS

Located: `supabase/functions/`

#### 6.1 sync-arca-iniciar
**Purpose:** Initialize ARCA (AFIP) sync, create automations for Emitted (E) and Received (R) invoices  
**Endpoint:** POST /functions/v1/sync-arca-iniciar  
**Input:**
```typescript
{
  tenantId: UUID,
  fechaDesde?: string (YYYY-MM-DD),
  fechaHasta?: string (YYYY-MM-DD),
  triggeredBy?: string ("manual" | "scheduled")
}
```
**Output:**
```typescript
{
  success: boolean,
  syncRunId: UUID,
  automationIds: [{ tipo: "E" | "R", automationId: string }],
  fechaDesde: string,
  fechaHasta: string
}
```
**Logic:**
1. Read ARCA credentials from `contable_config`
2. Create `sync_run` record for tracking
3. Call AFIP SDK to create automation for both Emitted and Received invoices
4. Return automationIds for n8n polling

---

#### 6.2 sync-arca-guardar
**Purpose:** Save ARCA sync results to database after polling completes  
**Endpoint:** POST /functions/v1/sync-arca-guardar  
**Input:**
```typescript
{
  syncRunId: UUID,
  invoices: [
    {
      numero: string,
      fecha: string,
      monto: number,
      tipo: "E" | "R",
      // ... ARCA fields
    }
  ]
}
```
**Logic:**
1. Upsert invoices into `contable_comprobantes` (xubio_id = ARCA invoice ID)
2. Update `sync_run` with status (success/partial/error)
3. Auto-reconcile matching emitted/received pairs

---

#### 6.3 sync-xubio
**Purpose:** Fetch invoices from Xubio ERP and sync to Supabase  
**Endpoint:** POST /functions/v1/sync-xubio  
**Input:**
```typescript
{
  tenantId: UUID,
  fechaDesde?: string,
  fechaHasta?: string,
  triggeredBy?: string
}
```
**Logic:**
1. Authenticate with Xubio (OAuth token)
2. Fetch `comprobanteVentaBean` (sales invoices)
3. Fetch `comprobanteCompraBean` (purchase invoices)
4. Map Xubio data to `contable_comprobantes` schema
5. Upsert (on conflict xubio_id)
6. Return import stats (imported, updated, failed)

---

#### 6.4 sync-colppy
**Purpose:** Fetch invoices from Colppy ERP and sync to Supabase  
**Similar flow to sync-xubio but for Colppy API**

---

#### 6.5 conciliar
**Purpose:** Reconcile ARCA emitted vs. received invoices  
**Logic:**
1. Fetch all emitted invoices from ARCA
2. Fetch all received invoices from ARCA
3. Match by: proveedor CUIT, invoice number, amount (tolerance ±0.01)
4. Update `contable_conciliacion_arca` with match results

---

#### 6.6 exportar-csv
**Purpose:** Export data (invoices, transactions, payroll) to CSV  
**Input:** table name, filters (JSON), columns  
**Output:** CSV blob

---

#### 6.7 generar-reporte
**Purpose:** Generate PDF reports (invoices, financial summaries, payroll)  
**Input:** report type, date range, filters  
**Output:** PDF blob

---

#### 6.8 Shared Utilities (_shared/)
- `utils.ts` — CORS helpers, error responses, Supabase admin client, sync_run tracking
- `afip-sdk.ts` — AFIP SDK wrapper for automation creation
- Type definitions for sync operations

---

### 7. EXTERNAL INTEGRATIONS

#### 7.1 ARCA / AFIP (Electronic Invoicing)
**Purpose:** Sync emitted and received electronic invoices  
**Flow:**
1. Frontend calls Edge Function `sync-arca-iniciar` with date range
2. Edge Function creates automation in AFIP SDK
3. n8n polls AFIP SDK for results (via webhook)
4. n8n calls `sync-arca-guardar` Edge Function to save results
5. Results appear in Contable → Conciliación

**Configuration:**
- Stored in `contable_config`: `arca_cuit`, `arca_username`, `arca_password`, `punto_venta`
- Requires valid CUIT and AFIP account

---

#### 7.2 Xubio ERP
**Purpose:** Bi-directional invoice sync  
**Features:**
- Fetch sales/purchase invoices
- Fetch customers and vendors
- Sync accounting entries

**Flow:**
1. Frontend: click "Sync from Xubio" in Configuración
2. Backend: Edge Function `sync-xubio` authenticates (OAuth) and fetches data
3. Upsert invoices with `source: "xubio"` and `xubio_id`
4. Sync customers/vendors (if enabled)

**Configuration:**
- `contable_config`: `xubio_client_id`, `xubio_client_secret`, `xubio_token`, `xubio_token_expires_at`

---

#### 7.3 Colppy ERP
**Purpose:** Alternative to Xubio for accounting  
**Features:**
- Fetch invoices (sales/purchases)
- Fetch customers/vendors/chart of accounts
- Inject invoices back to Colppy

**Flow:**
1. Similar to Xubio but uses Colppy API
2. Edge Function `sync-colppy` (placeholder, to be implemented)

**Configuration:**
- `contable_config`: Colppy API credentials

---

#### 7.4 n8n Workflows (https://n8n.neuracall.net)
**Purpose:** Low-code automation, webhooks, integrations  
**Key Workflows:**

| Workflow | Purpose | Trigger | Action |
|----------|---------|---------|--------|
| `BuscarPersonas` | ARCA person search API | HTTP webhook | Query ARCA DB by CUIT |
| `CargaDeComprobantes` | Upload invoice PDFs | HTTP webhook | Extract OCR, classify |
| `enviar_por_mail` | Send invoice by email | HTTP webhook | Email via SMTP |
| `neuracore-chat` | Chatbot responses | HTTP webhook (via ChatbotAsistente) | LLM query + DB lookup |
| `ordenes de pago` | Process payment orders | HTTP webhook | Convert to bank transfer instruction |
| `xubio-proxy` | Xubio API proxy (CORS bypass) | HTTP webhook | Relay to Xubio API |

**Vite Proxy:** vite.config.ts routes `/api/*` to n8n.neuracall.net in development

---

#### 7.5 dolarapi.com
**Purpose:** Real-time USD/ARS exchange rates  
**Integration:** DolarService (`src/services/DolarService.ts`)  
**Endpoints:**
- `/v1/dolares` — all rates (oficial, blue, MEP, CCL)
- Cached for 5 minutes client-side

---

#### 7.6 Google Maps & Leaflet
**Purpose:** Property/location visualization  
**Maps Components:**
- `MapaPropiedades.tsx` — Leaflet + Google Maps
- Used in: Inmobiliaria (property locations), CRM (prospect locations)

---

### 8. ROUTING STRUCTURE (Full Route Map)

**Root layout:** Layout.tsx + AuthProvider, TenantProvider, ToastProvider, ThemeProvider

**Public routes:**
```
/login              → Login.tsx
/register           → Register.tsx
/set-password       → SetPassword.tsx
```

**Private routes (under Layout):**
```
/                   → VisionGeneral.tsx (home dashboard)

/tesoreria
  /                 → TesoreriaIndexRoute (Dashboard or Proyecciones)
  /movimientos      → Movimientos.tsx
  /comprobantes     → Comprobantes.tsx
  /cajas            → Cajas.tsx
  /cajas/:id        → CajaDetalle.tsx
  /bancos           → Bancos.tsx
  /conciliacion-bancaria → ConciliacionBancaria.tsx
  /ordenes-pago     → OrdenesPago/index.tsx
  /equipo           → Equipo.tsx (admin only)
  /monitor          → Monitor.tsx
  /proyecciones     → ProyeccionesTesoreria.tsx
  /centro-costos    → CentroCostos.tsx (or CentroCostosCons for constructora)

/contable
  /                 → ContableDashboard.tsx
  /comprobantes     → ContableComprobantesIndex.tsx (desktop form)
  /proveedores      → ContableProveedores.tsx
  /clientes         → ContableClientes.tsx
  /catalogos        → ContableCatalogos.tsx
  /conciliacion-comprobantes → ConciliacionComprobantes.tsx
  /configuracion    → ContableConfiguracion.tsx (global, accessible from /configuracion too)

/ventas
  /comprobantes     → ContableComprobantesIndex.tsx (defaultTipo="venta")
  /clientes         → ContableClientes.tsx

/compras
  /comprobantes     → ContableComprobantesIndex.tsx (defaultTipo="compra")
  /proveedores      → ContableProveedores.tsx
  /ordenes-pago     → OrdenesPago/index.tsx

/crm
  /                 → CRMDashboard.tsx
  /contactos        → CRMContactos.tsx
  /prospectos       → CRMProspectos.tsx
  /obras            → CRMObras.tsx
  /catalogo         → CRMCatalogoAutos.tsx

/comercial
  /                 → ComercialDashboard.tsx
  /dashboard        → ComercialDashboard.tsx (alias)
  /pipeline         → ComercialPipeline.tsx
  /contactos        → ComercialContactos.tsx
  /contactos/:id    → ComercialContactoDetalle.tsx
  /reportes         → ComercialReportes.tsx
  /config           → ComercialConfig.tsx

/inmobiliaria
  /                 → InmoDashboard.tsx
  /propiedades      → InmoPropiedades.tsx
  /contratos        → InmoContratos.tsx
  /liquidaciones    → InmoLiquidaciones.tsx
  /cuentas          → InmoCuentas.tsx
  /agenda           → InmoAgenda.tsx
  /proveedores      → InmoProveedores.tsx
  /mapa             → InmoMapa.tsx
  /ordenes          → InmoOrdenesTrabajo.tsx
  /facturar         → FacturarMobile.tsx (wizard pattern)
  /expensas         → InmoExpensas.tsx
  /servicios        → InmoServicios.tsx

/impuestos
  /iva              → ImpuestoPlaceholder.tsx (tipo="IVA")
  /iibb             → ImpuestoPlaceholder.tsx (tipo="Ingresos Brutos")
  /retenciones      → ImpuestoPlaceholder.tsx (tipo="Retenciones")

/liquidaciones
  /                 → LiqDashboard.tsx
  /empleados        → LiqEmpleados.tsx
  /obras            → LiqObras.tsx
  /fichajes         → LiqFichajes.tsx
  /quincenas        → LiqQuincenas.tsx
  /quincenas/:id    → LiqQuincenaDetalle.tsx
  /fichaje-masivo   → LiqFichajes.tsx (bulk upload)
  /categorias       → LiqCategorias.tsx

/obras
  /                 → ObrasDashboard.tsx
  /listado          → ObrasFichas.tsx
  /:obraId          → ObraDetalle.tsx (with tabs: TabEquipo, TabPresupuesto, TabDocumentacion, TabPartesDiarios)
  /contratistas     → ObrasContratistas.tsx
  /cartas-oferta    → ObrasCartasOferta.tsx
  /materiales       → ObrasMateriales.tsx
  /vencimientos     → ObrasVencimientos.tsx
  /f931             → ObrasF931.tsx
  /reportes         → ObrasReportes.tsx

/configuracion      → ContableConfiguracion.tsx (global settings)

/superadmin         → SuperAdminDashboard.tsx

/* (catch-all)      → Navigate to "/" (home)
```

---

### 9. DESIGN PATTERNS & CONVENTIONS

#### 9.1 Wizard Pattern
**Used for:** Complex multi-step flows (invoice, payment order, payroll creation)  
**Implementation:**
- Modal or full-page component
- Step indicator (1/3, 2/3, 3/3)
- Form state managed in useState
- Validate each step before proceeding
- Examples: `FacturarMobile.tsx`, `NuevaOrdenPago.tsx`, `ComprobanteForm.tsx`

---

#### 9.2 Inline Styles with CSS Custom Properties
**Pattern:** Avoid CSS files; use inline `style={}` objects with theme variables
```typescript
<div style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-surface)' }} />
```
**Variables:**
- `--color-text-primary`, `--color-text-muted`, etc.
- `--color-accent` (tenant primary color)
- `--color-bg-surface`, `--color-bg-hover`
- `--color-border`, `--color-border-subtle`
- `--font-size-base`, `--density-scale`

---

#### 9.3 CRUD Pattern
**Standard operations:**
1. **List:** Fetch data, render table/grid with filters
2. **Create:** Modal or form page, POST to Supabase
3. **Read:** Click row, open detail view
4. **Update:** Inline edit or modal, PATCH to Supabase
5. **Delete:** Confirm dialog, DELETE from Supabase

**Example Hook:**
```typescript
const [items, setItems] = useState([]);

const fetchItems = async () => {
  const { data } = await supabase.from('table_name').select('*');
  setItems(data || []);
};

const deleteItem = async (id: UUID) => {
  await supabase.from('table_name').delete().eq('id', id);
  fetchItems();
};
```

---

#### 9.4 File Upload Pattern
**Steps:**
1. User selects file (via `<input type="file" />`)
2. Upload to Supabase Storage via Edge Function or direct upload
3. Get public URL
4. Store URL in database record

**Example:**
```typescript
const handleUpload = async (file: File) => {
  const { data, error } = await supabase.storage
    .from('invoices')
    .upload(`${tenantId}/${file.name}`, file);
  
  if (data) {
    const { data: { publicUrl } } = supabase.storage
      .from('invoices')
      .getPublicUrl(data.path);
    
    // Save publicUrl to DB
    await supabase.from('comprobantes').update({ archivo_url: publicUrl }).eq('id', id);
  }
};
```

---

#### 9.5 Real-Time Subscriptions
**Pattern:** Supabase PostgRES changes → auto-update UI
```typescript
useEffect(() => {
  const channel = supabase.channel('my-channel')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'table_name', filter: `tenant_id=eq.${tenant.id}` },
      (payload) => {
        // Update state based on payload.eventType ('INSERT', 'UPDATE', 'DELETE')
        fetchData();
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [tenant?.id]);
```

---

#### 9.6 Error Handling & Toast Notifications
```typescript
const { addToast } = useToast();

try {
  await supabase.from('table').insert([data]);
  addToast('success', 'Creado exitosamente');
} catch (err) {
  addToast('error', 'Error al crear', err.message);
}
```

---

#### 9.7 Loading States & Skeletons
```typescript
if (loading) return <SkeletonKit />;
if (error) return <ErrorAlert message={error} />;
return <DataView data={data} />;
```

---

#### 9.8 TypeScript Interfaces
**Convention:** Define at top of file or in separate `types.ts` file
```typescript
interface Comprobante {
  id: UUID;
  tenant_id: UUID;
  tipo: 'venta' | 'compra';
  fecha: string; // YYYY-MM-DD
  monto_original: number;
  // ...
}
```

---

### 10. DEVELOPMENT SETUP

#### 10.1 Environment Variables
**File:** `.env`
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
```

#### 10.2 Running Locally
```bash
npm install
npm run dev          # Start dev server (Vite)
npm run build        # Build for production
npm run lint         # Run ESLint
```

#### 10.3 Deploying Edge Functions
```bash
supabase functions deploy sync-arca-iniciar
supabase functions deploy sync-arca-guardar
supabase functions deploy sync-xubio
# ... etc
```

---

### 11. KEY FILES & LOCATIONS

**Core:**
- `src/main.tsx` — Entry point, context providers
- `src/App.tsx` — Route definitions
- `src/index.css` — Global Tailwind styles
- `src/lib/supabase.ts` — Supabase client config

**Contexts:**
- `src/contexts/AuthContext.tsx`
- `src/contexts/TenantContext.tsx`
- `src/contexts/ThemeContext.tsx`
- `src/contexts/ToastContext.tsx`

**Layout:**
- `src/shared/components/Layout.tsx`
- `src/shared/components/TopBar.tsx`
- `src/shared/components/MobileNav.tsx`
- `src/shared/components/DynamicSidebar.tsx`

**Shared Components:**
- `src/shared/components/StyledSelect.tsx`
- `src/shared/components/CustomSelect.tsx`
- `src/shared/components/ConfirmDelete.tsx`
- `src/shared/components/ChatbotAsistente.tsx`
- `src/shared/components/GlobalSearch.tsx`

**Services:**
- `src/services/DolarService.ts`
- `src/services/XubioService.ts`
- `src/services/ColpyService.ts`

**Utilities:**
- `src/shared/utils/iconMap.ts`
- `src/utils/bankParsers.ts`

**Modules:** Each module has its own folder under `src/modules/`:
- `src/modules/tesoreria/`
- `src/modules/contable/`
- `src/modules/crm/`
- `src/modules/inmobiliaria/`
- `src/modules/obras/`
- `src/modules/liquidaciones/`
- `src/modules/comercial/`
- `src/modules/construccion/`
- `src/modules/agro/`
- `src/modules/auth/`
- `src/modules/vision_general/`
- `src/modules/superadmin/`

**Database:**
- `supabase/migrations/` — SQL migration files
- `supabase/functions/` — Edge Function source code

---

### 12. COMMON TASKS

#### How to add a new module:
1. Create folder `src/modules/my_module/`
2. Add route in `App.tsx`
3. Add sidebar menu item in `Layout.tsx` (if not using `sidebar_config`)
4. Add feature flag to `enabled_modules` in `tenants`
5. Create pages + components within module folder
6. Use `supabase.from('my_table')` for DB access

#### How to add a new Supabase table:
1. Create migration file: `supabase/migrations/20260410000000_table_name.sql`
2. Define CREATE TABLE, indexes, RLS policies
3. Deploy: `supabase db push`
4. Update TypeScript interfaces in React code

#### How to add a new tenant:
1. Insert into `tenants` table with desired `enabled_modules`
2. Create admin user in `users` table
3. Set colors, rubro, sidebar_config as needed
4. Test access via login

#### How to configure a new ERP integration:
1. Add credentials to `contable_config` table
2. Create Edge Function for sync (e.g., `sync-myerp`)
3. Add UI button/flow in Configuración page
4. Call Edge Function from frontend

---

### 13. COMMON ISSUES & TROUBLESHOOTING

**Issue:** User can't see module X even though `enabled_modules` has it  
**Check:**
- User's `role` is not super-restricted
- `user.enabled_modules` includes the module
- Tenant `enabled_modules` includes the module
- Browser localStorage/cache not stale

**Issue:** Supabase RLS policy denying access  
**Check:**
- RLS policy references correct `tenant_id`
- User's `tenant_id` in `users` table matches the table's `tenant_id`
- Using `auth.uid()` correctly in policy

**Issue:** n8n webhook not receiving payload  
**Check:**
- n8n endpoint URL correct in frontend
- CORS headers allowed (vite.config.ts proxy)
- Webhook active in n8n
- Network tab shows request being sent

**Issue:** Exchange rates not updating  
**Check:**
- dolarapi.com service is online
- DolarService cache not stale (max 5 min)
- Browser console for fetch errors

---

This documentation covers the entire NeuraCore/Tesorería application comprehensively. All modules, integrations, patterns, and infrastructure are documented above.