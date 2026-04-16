# Inmobiliaria — Plan de nuevas features

> Plan de trabajo para sumar **Facturación ARCA multi-razón social** y **Portal de acceso** al módulo inmobiliaria existente. Base para retomar cuando arranquemos.
>
> Fecha de la charla: 2026-04-16

---

## Contexto real (importante leer antes de codear)

**NO es un cliente nuevo.** El rubro `inmobiliaria` ya existe en el enum `tenant_rubro` y hay al menos un tenant activo usándolo (**Antigravity Gestora**).

**El módulo inmobiliaria ya está muy avanzado.** Ver `INMOBILIARIA_ALCANCE.md` en la raíz para el detalle completo (fecha: 2026-03-23). Resumen de lo que ya funciona:

- `src/modules/inmobiliaria/`: Dashboard, Propiedades, Contratos, Liquidaciones, Cuentas Corrientes, Agenda, Proveedores, Órdenes de Trabajo, Expensas, Servicios, Proyecciones, Mapa, FacturarMobile
- 7 tablas en Supabase con RLS por `tenant_id`: `inmobiliaria_propiedades`, `inmobiliaria_contratos`, `inmobiliaria_liquidaciones`, `inmobiliaria_cuentas_corrientes`, `inmobiliaria_servicios`, `inmobiliaria_ordenes_trabajo`, + una séptima
- CRUD completo de todo lo anterior, mobile + desktop
- Ajustes de alquiler **manuales** (tipo ICL/IPC/libre en contrato, se aplica % a mano, historial completo)
- Botón "Facturar" en Contratos **existe pero onclick vacío** — es el punto de enchufe natural para el nuevo flujo
- Liquidaciones con workflow borrador→aprobada→pagada

**Lo que hoy está marcado como "fuera de alcance" en INMOBILIARIA_ALCANCE.md y es exactamente lo que vamos a sumar:**
- Facturación ARCA (multi-razón social)
- Portal Propietario
- Portal Inquilino
- Ajustes automáticos de alquiler (ICL/IPC con API)

---

## Feature 1 — Facturación ARCA multi-razón social

### Requisitos (de la charla)

1. **Multi-razón social**: la inmo opera con 3 CUITs. Cada factura elige cuál usar.
2. **Facturación automática mensual**: el sistema detecta cada mes a qué clientes hay que facturarle.
3. **Múltiples facturas por inquilino**: un mismo inquilino puede tener N facturas independientes (alquiler, expensas, cochera) a CUITs distintos y conceptos distintos. Son facturas completas, no partidas.
4. **Bandeja "Para facturar"**: tras la primera emisión manual, los meses siguientes el contrato aparece en bandeja con monto ya calculado. Multi-select, emisión en lote.
5. **Plantillas por tipo de contrato**: al alta se elige plantilla ("Alquiler residencial = alquiler + expensas + ABL") y se autocompletan los items facturables.

### Cómo se integra con lo existente

- **Punto de entrada de la UI**: el botón "Facturar" de Contratos que hoy está vacío. Primera factura del contrato = se abre modal de emisión manual. Después el contrato queda marcado como "ciclo activo" y aparece en la bandeja los meses siguientes.
- **Nueva pantalla**: bandeja mensual (nueva sección en el módulo, tipo `Facturacion.tsx` o subtab de Contratos).
- **Se reusa**: tablas `inmobiliaria_contratos`, `inmobiliaria_propiedades`, sus inquilinos/propietarios. No duplicar.

### Tablas nuevas

- `razones_sociales` — N por tenant. `id`, `tenant_id`, `cuit`, `razon_social`, `punto_venta`, `condicion_iva`, `cert_ref`
- `inmobiliaria_contrato_items` — items facturables recurrentes de cada contrato. `id`, `contrato_id` (FK a `inmobiliaria_contratos`), `concepto`, `monto_base`, `destinatario_cuit`, `destinatario_razon_social`, `razon_social_emisora_id`, `formula_ajuste`, `periodicidad`
- `inmobiliaria_plantillas_contrato` — plantillas de items por tipo de contrato
- `facturas_emitidas` — `id`, `tenant_id`, `contrato_item_id`, `periodo` (YYYY-MM), `cae`, `numero_comprobante`, `fecha_emision`, `monto`, `pdf_url`, `estado`, `error_msg`. **Unique key** en `(contrato_item_id, periodo)` para idempotencia.
- `facturacion_lotes` — opcional, agrupa emisiones de un mismo run para ver progreso y reintentos

### Flujo técnico

```
NeuraCore UI
  → POST /facturacion/lote { items: [...] }
  → Loop secuencial server-side:
      → fetch webhook n8n facturación (reusa el de SAILO)
      → await respond_to_webhook (CAE o error)
      → guardar en facturas_emitidas
      → emitir realtime al frontend (progreso)
  → resumen final { ok: 27, failed: 3 }
```

**Por qué secuencial y no paralelo:**
- Numeración AFIP correlativa sin saltos
- Detectás cuál falló
- No saturás AFIP
- Mostrás progreso real (reusa sync progress global hecho en SAILO)

### Workflow n8n

- **Uno solo multi-tenant**. Recibe `tenant_id` + `razon_social_id` + datos. Se adapta el actual de SAILO.
- Payload estándar:
  ```json
  {
    "tenant_id": "uuid",
    "razon_social_id": "uuid",
    "tipo_comprobante": "FC_A" | "FC_B" | "FC_C",
    "destinatario": {"cuit": "...", "razon_social": "...", "condicion_iva": "..."},
    "items": [{"descripcion": "...", "cantidad": 1, "precio_unit": 500000, "alicuota_iva": 21}],
    "periodo": "2026-05"
  }
  ```
- Respuesta: `{ok: true, cae, vencimiento_cae, numero_comprobante, pdf_url}` o `{ok: false, error_code, error_msg}`

### Certificados AFIP — DECISIÓN REVISADA (2026-04-16): afipsdk.com + tabla multi-tenant

**Contexto nuevo descubierto al abrir el workflow:** `n8n-workflows/WORKFLOW GENERICO FACTURACION AFIP.json` ya usa **afipsdk.com** (SaaS de terceros) para hablar con AFIP, no conexión directa. Hoy los credenciales (bearer, cert, key, cuit) están **hardcodeados** en el primer nodo "Config Credenciales1".

**Plan: dejar afipsdk.com** (funciona, tiene toda la lógica compleja de A/B/C, notas de crédito, PDFs) y hacerlo **multi-tenant** leyendo credenciales desde Supabase.

**Ventajas vs micro propio:**
- Cero infraestructura nueva
- Reusa toda la lógica del workflow existente (cientos de líneas de código n8n que ya anda)
- Cambio mínimo: 1 nodo del workflow + 1 tabla nueva
- Rápido a producción

**Desventajas conocidas:**
- Dependencia de afipsdk.com (si cae, no facturás)
- Certs viven en Supabase (deuda técnica: cifrar antes de prod real con datos sensibles)
- Costo de subscripción afipsdk.com

**Implementación:**
1. **Migración creada**: `supabase/migrations/20260416120000_facturacion_emisores.sql` — tabla `facturacion_emisores` multi-rubro (cualquier tenant puede tener N emisores). Campos: cuit, razon_social, alias, punto_venta, condicion_iva, environment, cert_pem, key_pem, is_default, activo. RLS por tenant, unique (tenant_id, cuit).
   - **Cert y key**: las trae cada empresa (cada CUIT genera las suyas en AFIP con clave fiscal)
   - **Bearer afipsdk.com**: NO vive en la tabla. Lo provee NeuraCore y queda hardcoded en los nodos n8n. Uno solo compartido por todos los tenants. NeuraCore se lo factura al cliente por fuera.
2. **Falta**: correr la migración en Supabase
3. **Falta**: seed inicial — para cada tenant con `arca_enabled=true`, crear fila default con credenciales actuales
4. **Falta**: modificar nodo "Config Credenciales1" del workflow para recibir `razon_social_id` por webhook y consultar Supabase
5. **Falta**: UI en NeuraCore (Configuración/Admin) para CRUD de razones sociales del tenant
6. **Pendiente futuro (no bloqueante)**: cifrar cert_pem/key_pem/bearer_token con Supabase Vault o pgcrypto


### Ajuste automático de alquiler

Hoy el ajuste es manual. Para la bandeja automática tiene que ser automático, si no la inmo va a tener que editar las 47 facturas cada vez que toca ajuste = no le resolvemos nada.

- **ICL/IPC**: integrar con API BCRA o fuente oficial, traer el índice del periodo, recalcular monto del item antes de generar borrador
- **Libre**: respeta el monto actual del contrato (no recalcula)
- Usa el campo `formula_ajuste` y `periodo_ajuste` que ya existen en `inmobiliaria_contratos`

---

## Feature 2 — Portal de acceso (inquilinos + propietarios)

### Regla de acceso (confirmada)

Ambos (inquilino + propietario) acceden por defecto, cada uno ve lo suyo. **El propietario puede desactivar el acceso del inquilino** — en ese caso solo él entra. Campo `acceso_inquilino_habilitado` en `inmobiliaria_contratos` (default `true`).

### Multi-tenancy en capas (3 niveles)

```
Nivel 1 — Rubro (inmobiliaria, construcción, agro) [ya resuelto con enum tenant_rubro]
   ↓
Nivel 2 — Tenant / empresa (Antigravity Gestora, otra inmo X) [ya resuelto con tenant_id + RLS]
   ↓
Nivel 3 — Sub-usuario dentro del tenant (inquilinos, propietarios) [NUEVO, lo que armamos]
```

**Decisiones tomadas sobre el nivel 3:**

- **Un propietario con propiedades en 2 inmobiliarias** (caso raro): **dos cuentas separadas**, una por tenant. No se resuelve "un solo login multi-inmo" en v1. Si el caso aparece seguido, se migra.
- **Ciclo de vida de cuenta**: cuando termina el contrato, la cuenta queda **archivada** (no se borra, mantiene histórico para consulta). Si el inquilino vuelve con otra inmo, es cuenta nueva.
- **Datos del inquilino visibles al propietario**: **todos** (nombre, DNI, mail, teléfono). **Requiere cláusula de consentimiento en el contrato tipo de la inmobiliaria** para cumplir Ley 25.326 de protección de datos personales. Avisar a Antigravity Gestora al momento del onboarding para que sumen la cláusula al contrato que firman sus inquilinos.

### Requisitos

**Vista inquilino** (solo si el propietario habilitó el acceso):
- Su contrato (PDF + fecha inicio/fin + días restantes)
- Sus facturas históricas (descargables con CAE)
- Lo que debe ahora (factura del mes pendiente)
- Datos de su propiedad (dirección)
- Contacto con la inmo (WhatsApp directo o formulario)

**Vista propietario**:
- Sus propiedades alquiladas
- Inquilinos de cada una (datos básicos, contacto)
- Estado de pagos (cobrado, pendiente)
- Liquidaciones mensuales (reusa tabla `inmobiliaria_liquidaciones` que ya existe)
- Contratos vigentes y vencimientos próximos

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Plataforma | Web responsive (PWA), no app nativa |
| Auth | Supabase Auth con magic link + clave opcional |
| Pagos online | **NO** en v1. v2 eventual con MercadoPago |
| Multi-tenant branding | Subdomain: `inquilinos.inmoX.neuracore.com` / `propietarios.inmoX.neuracore.com`. Dominio propio cuando alguien lo pida |
| Seguridad | RLS estricto en Supabase, inquilino solo ve lo suyo, propietario solo lo suyo |
| Tickets/reclamos | **Afuera** del v1 ("veremos") |

### Tablas nuevas / extensiones

- `portal_usuarios` — vincula `user_id` Supabase Auth con inquilino o propietario. Campos: `id`, `tenant_id`, `user_id`, `rol` (inquilino/propietario), `entidad_id`, `activo`, `ultimo_login`
- Extender entidades de inquilinos/propietarios con `email_portal` y `telefono_portal` si no están
- Nuevo campo en `inmobiliaria_contratos`: `acceso_inquilino_habilitado` (bool, default `true`)

### UI para desactivar acceso inquilino

Recomendación:
- Checkbox visible al alta del contrato: "Permitir acceso del inquilino al portal" (tildado por defecto)
- Toggle en el detalle del contrato para cambiarlo después
- Cuando está en `false`: no se manda magic link, si el inquilino intenta loguearse rebota con mensaje claro

---

## Orden de implementación propuesto

El módulo inmobiliaria base ya está, arrancamos directo con lo nuevo:

1. **Razones sociales multi-tenant** — tabla + CRUD en panel admin del tenant. Sin AFIP todavía, solo datos.
2. **Items facturables + plantillas de contrato** — extender alta de contrato para cargar items con destinatario y razón social emisora.
3. **Facturación manual (primera factura del contrato)** — conectar el botón "Facturar" vacío. Decidir B vs C para certificados acá. Reusar webhook n8n de SAILO adaptado.
4. **Ajuste automático ICL/IPC** — integración con API BCRA, aplicar antes de generar monto facturable del mes.
5. **Bandeja "Para facturar" mensual** — scheduler, multi-select, lote secuencial con progreso, reintentos.
6. **Portal de acceso — vista propietario** (la primera porque es la que Bautista mencionó primero).
7. **Portal de acceso — vista inquilino** con la regla de acceso desactivable.

Cada paso deployable solo. No arrancar el siguiente sin el anterior en prod.

---

## Pendientes a cerrar con Bautista antes de codear

- [ ] Día exacto de aparición en bandeja de facturación
- [ ] Cómo manejan ajustes de alquiler hoy en Antigravity Gestora (Excel, a ojo, ya usan el manual del sistema)
- [ ] Confirmar que la inmo tiene datos de contacto digitalizados de inquilinos/propietarios
- [ ] Validar que la tabla de liquidaciones existente sirve para la vista propietario o hay que ampliarla
- [ ] Factura partida sí/no en v1 (el modelo de datos lo banca, es laburo extra de UI)
- [ ] Confirmar que el tenant objetivo es Antigravity Gestora o si hay más inmobiliarias onboarded
- [ ] Coordinar con la inmo para sumar cláusula de consentimiento de datos al contrato tipo (Ley 25.326)
