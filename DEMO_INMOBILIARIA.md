# GUÍA DE DEMO — Módulo Inmobiliaria
### Flujos principales para mostrar al cliente

---

## DEMO 1: Visión General (2 min)

**Ruta**: Inicio → Dashboard Inmobiliaria

1. Mostrar los 5 KPIs arriba (propiedades, ocupación, contratos, morosidad, portfolio)
2. Señalar el mapa con los pines de colores (cada color = estado de la propiedad)
3. Mostrar la lista de vencimientos próximos
4. Mostrar contratos que están por vencer en 30 días

**Punto clave**: "De un vistazo sabés cómo está tu cartera"

---

## DEMO 2: Alta de propiedad → contrato → inquilino (5 min)

**Ruta**: Operaciones → Propiedades

1. Mostrar la lista de propiedades con filtros (tipo, estado)
2. Crear una propiedad nueva (llenar dirección, tipo, precio)
3. En la card de la propiedad nueva → tocar "Crear contrato"
4. Se abre el formulario de contrato con la propiedad preseleccionada
5. Mostrar el botón "+ Crear nuevo" para crear inquilino inline
6. Guardar el contrato

**Punto clave**: "Desde la propiedad llegás al contrato sin navegar 5 pantallas"

---

## DEMO 3: Documentos del contrato (2 min)

**Ruta**: Operaciones → Contratos → Ver detalle

1. Abrir un contrato existente
2. Scrollear hasta "Documentos"
3. Subir un PDF (contrato firmado, garantía, DNI)
4. Mostrar que queda listado con nombre, tipo, fecha
5. Click para abrir/descargar

**Punto clave**: "Todo en un solo lugar, no más carpetas de Google Drive"

---

## DEMO 4: Ajuste de alquiler (2 min)

**Ruta**: Operaciones → Contratos → Ver detalle (contrato tipo alquiler)

1. Abrir un contrato de alquiler
2. Scrollear hasta "Ajustes de Alquiler"
3. Mostrar monto original vs actual
4. Tocar "Aplicar ajuste" → ingresar porcentaje (ej: 25.5%)
5. Mostrar que se actualizó el monto y quedó en el historial

**Punto clave**: "Ajuste en 3 toques, con historial completo para auditoría"

---

## DEMO 5: Orden de trabajo completa (5 min)

**Ruta**: Operaciones → Contratos → card de un contrato

1. En un contrato, tocar ⋮ → "Enviar proveedor"
2. Se abre Órdenes de trabajo
3. Crear orden: "Pérdida de agua en baño", prioridad Urgente
4. Asignar proveedor (Sanitarios Rápido)
5. Mostrar botón "Llamar" al proveedor
6. Avanzar estado: Asignado → En curso → Completado
7. Subir factura del proveedor (foto/PDF)
8. Mostrar que se extrajo el monto automáticamente (OCR)
9. Mostrar comparación presupuesto vs facturado

**Punto clave**: "Del problema a la factura sin salir de la app"

---

## DEMO 6: Liquidación mensual (3 min)

**Ruta**: Gestión → Liquidaciones

1. Crear nueva liquidación
2. Seleccionar contrato → se autocompleta el monto del alquiler
3. Agregar deducciones: comisión (auto), IIBB, reparación del caño
4. Mostrar el resumen: Ingreso - Deducciones = Neto propietario
5. Guardar como borrador → Aprobar → Marcar como pagada

**Punto clave**: "La liquidación se arma sola, vos solo aprobás"

---

## DEMO 7: Cuentas corrientes (2 min)

**Ruta**: Gestión → Cuentas

1. Seleccionar un inquilino del dropdown
2. Mostrar saldo actual (rojo si debe)
3. Mostrar movimientos con flechas verde/rojo
4. Cambiar a un propietario → mostrar liquidaciones acreditadas

**Punto clave**: "Estado de cuenta de cada persona en tiempo real"

---

## DEMO 8: Agenda (2 min)

**Ruta**: Gestión → Agenda

1. Mostrar vista calendario con eventos por día
2. Expandir el mini calendario (mobile)
3. Mostrar filtros por tipo (pago pendiente, vencimiento contrato, etc.)
4. Marcar un vencimiento como completado (checkbox)
5. Crear un nuevo vencimiento

**Punto clave**: "No se te pasa ninguna fecha"

---

## DEMO 9: Mobile — Flujo rápido (3 min)

**Desde el celular o DevTools mobile**

1. Mostrar el Home con "Hola, [nombre]" + KPIs + cotizaciones USD
2. Tocar botón + → mostrar acciones rápidas por módulo
3. Ir a Operaciones → subtabs (Propiedades, Contratos, Proveedores, Órdenes)
4. Ir a Gestión → subtabs (Dashboard, Liquidaciones, Cuentas, Agenda)
5. Tocar Más → mostrar menú completo con secciones

**Punto clave**: "Es una app, no una web adaptada"

---

## DEMO 10: Multi-tenant + SuperAdmin (2 min)

**Solo si el cliente es una empresa que gestiona varias inmobiliarias**

1. Entrar como SuperAdmin
2. Mostrar lista de tenants con badge de rubro
3. Activar/desactivar módulos por tenant
4. Mostrar que cada empresa tiene datos aislados

**Punto clave**: "Cada cliente ve solo lo suyo, vos controlás todo"

---

## DATOS DEMO DISPONIBLES

| Dato | Cantidad |
|------|----------|
| Propiedades | 10 (CABA, con coordenadas reales) |
| Contratos | 6 vigentes |
| Liquidaciones | 4 (borrador, aprobada, pagada) |
| Vencimientos | 8 (distintos tipos y fechas) |
| Proveedores | 6 (plomería, electricidad, gas, pintura, limpieza, cerrajería) |
| Órdenes de trabajo | 5 (en distintos estados del flujo) |
| Propietarios | 4 |
| Inquilinos | 6 |
| Movimientos CC | 11 |

**Acceso demo**: `inmobiliaria@demo.com` / `inmo123`

---

## TIPS PARA LA DEMO

1. **Empezá por el Dashboard** — primera impresión visual fuerte
2. **Mostrá el flujo completo** propiedad → contrato → orden → factura → liquidación
3. **Usá el celular** para mostrar que funciona mobile-first
4. **Mencioná lo que NO está** como "Fase 2" para generar expectativa
5. **El mapa vende** — mostralo con las 10 propiedades reales de CABA
6. **El OCR de facturas impresiona** — subí una foto de factura y que extraiga el monto solo
