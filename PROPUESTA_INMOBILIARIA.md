# NEURA CORE — Propuesta de Sistema de Gestión Inmobiliaria
### Versión 1.0 | Marzo 2026

---

## 1. RESUMEN EJECUTIVO

Sistema integral de gestión inmobiliaria diseñado para administradores de propiedades, con foco en dos ejes operativos:

- **Operaciones**: gestionar propiedades, contratos, proveedores y órdenes de trabajo de forma ágil desde cualquier dispositivo
- **Gestión**: controlar liquidaciones, cuentas corrientes, vencimientos y proyecciones financieras

Plataforma web responsive (desktop + mobile), multi-tenant, con integración a ARCA/AFIP y ERPs contables.

---

## 2. FASES DE IMPLEMENTACIÓN

### FASE 1 — Core Inmobiliario ✅ ENTREGADO

| Módulo | Funcionalidades | Estado |
|--------|----------------|--------|
| **Dashboard** | 5 KPIs, mapa interactivo de propiedades, vencimientos próximos, contratos por vencer | ✅ Listo |
| **Propiedades** | CRUD completo, 7 tipos, 5 estados, búsqueda, filtros, vista grilla/lista, geolocalización | ✅ Listo |
| **Contratos** | CRUD, workflow de estados, creación inline de clientes, documentos adjuntos, ajustes de alquiler con historial | ✅ Listo |
| **Liquidaciones** | Generación mensual, 5 categorías, deducciones dinámicas, workflow borrador→aprobada→pagada | ✅ Listo |
| **Cuentas Corrientes** | Saldo por inquilino/propietario, movimientos con dirección, filtros | ✅ Listo |
| **Agenda** | 4 vistas (mes/semana/día/tabla), 5 tipos de vencimiento, mobile estilo Google Calendar | ✅ Listo |
| **Proveedores** | CRUD, 10 rubros, contacto directo (llamar/email), filtros | ✅ Listo |
| **Órdenes de Trabajo** | Flujo 7 estados, asignar proveedor, subir factura con OCR, presupuesto vs real | ✅ Listo |
| **Mobile** | App-like con bottom nav, acciones rápidas, subtabs por sección | ✅ Listo |
| **Infraestructura** | 7 tablas, RLS multi-tenant, Supabase Storage, datos demo | ✅ Listo |

**Entregables**: Sistema funcional con datos demo, diseño responsive, navegación mobile-first.

---

### FASE 2 — Automatización y Notificaciones 🔜

| Módulo | Funcionalidades | Estimación |
|--------|----------------|-----------|
| **Ajustes automáticos de alquiler** | Cálculo mensual según ICL/IPC, integración con API de índices BCRA, alerta automática al llegar el mes de ajuste, actualización del contrato | 2-3 semanas |
| **Alertas WhatsApp/Email** | Recordatorio de pago a inquilinos, notificación de liquidación a propietarios, aviso de vencimiento de contrato, aviso de orden completada. Via n8n | 2 semanas |
| **Flujo de reclamo a morosos** | Workflow: aviso amigable → reclamo formal → intimación. Templates por etapa, historial por contrato | 1-2 semanas |
| **Flujo de renovación** | Crear nuevo contrato basado en el anterior, proponer monto ajustado, workflow aceptación/rechazo | 1 semana |

**Entregables**: Automatización de los procesos repetitivos, reducción de gestión manual.

---

### FASE 3 — Facturación y Cobros 🔜

| Módulo | Funcionalidades | Estimación |
|--------|----------------|-----------|
| **Facturación ARCA/AFIP** | Emisión de facturas electrónicas (A/B/C), notas de crédito/débito, CAE, integración via n8n | 3-4 semanas |
| **Recibos PDF auto-generados** | Template con datos del contrato, descargable, envío por email | 1 semana |
| **Integración Mercado Pago / CBU** | Link de pago por inquilino, QR en recibo, conciliación automática de cobros | 2-3 semanas |

**Entregables**: Circuito completo de facturación y cobro integrado.

---

### FASE 4 — Portales Externos 🔜

| Módulo | Funcionalidades | Estimación |
|--------|----------------|-----------|
| **Portal del Propietario** | Vista simplificada: sus propiedades, liquidaciones, pagos, documentos. Solo lectura. Login propio | 3-4 semanas |
| **Portal del Inquilino** | Ver saldo, descargar recibos, reportar problemas (crea orden de trabajo automática). Login propio | 3-4 semanas |

**Entregables**: Reducción del 80% de consultas telefónicas de propietarios e inquilinos.

---

### FASE 5 — Análisis Avanzado 🔜

| Módulo | Funcionalidades | Estimación |
|--------|----------------|-----------|
| **Rentabilidad por propiedad** | Ingreso vs gastos, ROI, gráfico mensual, comparativa entre propiedades | 1-2 semanas |
| **Seguro de caución** | Tracking de pólizas por contrato, alertas de vencimiento, documentos | 1 semana |
| **Módulo de expensas** | Cálculo por unidad funcional, distribución por coeficiente, liquidación mensual | 2-3 semanas |

**Entregables**: Herramientas de análisis para toma de decisiones y compliance.

---

## 3. STACK TECNOLÓGICO

| Componente | Tecnología |
|-----------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Mobile | Web responsive (PWA-ready) |
| Automatización | n8n (webhooks) |
| Mapas | Leaflet + OpenStreetMap |
| OCR | n8n + Gemini (procesamiento de facturas) |
| Deploy | Vercel |
| ERP | Colppy / Xubio (sync bidireccional) |
| Fiscal | ARCA/AFIP (via n8n) |

---

## 4. MODELO DE LICENCIAMIENTO

| Concepto | Detalle |
|----------|---------|
| Tipo | SaaS multi-tenant |
| Acceso | Web (desktop + mobile) |
| Usuarios | Ilimitados por tenant |
| Soporte | Incluido en abono mensual |
| Actualizaciones | Incluidas |
| Datos | Aislamiento completo por empresa (RLS) |

---

## 5. CONDICIONES

- Cada fase se presupuesta y aprueba por separado
- Las funcionalidades detalladas en "FASE 1 — ENTREGADO" son el alcance actual
- Cualquier funcionalidad fuera de las fases listadas requiere presupuesto adicional
- Los plazos estimados son orientativos y sujetos a confirmación al iniciar cada fase
- El sistema incluye datos demo para capacitación y pruebas

---

*NEURA CORE — Powered by NeuraCall*
