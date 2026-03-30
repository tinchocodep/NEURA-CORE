# Instrucciones para Antigravity - Envío de datos al webhook de facturación AFIP

## Contexto

El sistema de facturación usa un workflow en n8n que recibe datos via webhook POST y genera facturas/notas de crédito con AFIP automáticamente. Necesitamos que Antigravity envíe los datos en el formato exacto que se describe abajo.

## URL del webhook

```
POST https://n8n.neuracall.net/webhook/{PATH_DEL_NEGOCIO}
Content-Type: application/json
```

## Estructura del payload

El body del POST debe ser un JSON con esta estructura exacta:

```json
{
  "emisor": {
    "razonSocial": "NOMBRE DE LA EMPRESA SRL",
    "cuit": 30712345678,
    "domicilio": "CALLE 123 PISO 4",
    "condicionIva": "Responsable Inscripto",
    "iibb": "30712345678",
    "inicioActividades": "01/01/2020",
    "puntoVenta": 1
  },
  "type": "A",
  "creditnote": false,
  "client": {
    "id": "uuid-del-cliente-en-tu-sistema",
    "name": "RAZON SOCIAL DEL CLIENTE",
    "cuit": "20123456789",
    "address": "DIRECCION DEL CLIENTE",
    "tax_condition": "Responsable Inscripto",
    "jurisdiction": "BUENOS AIRES",
    "email": "cliente@email.com"
  },
  "items": [
    {
      "productId": "uuid-del-producto",
      "productName": "Nombre del producto o servicio",
      "quantity": 10,
      "unitPrice": 1500.00,
      "vatRate": 0,
      "sku": "PROD-001",
      "subtotal": 15000.00,
      "dispatchNumber": "192510L",
      "origin": "CHINA"
    }
  ],
  "totals": {
    "subtotal": 15000.00,
    "discountPercentage": 0,
    "discountAmount": 0,
    "netTaxable": 15000.00,
    "vatTotal": 3150.00,
    "total": 18150.00
  },
  "date": "2026-03-27",
  "originalInvoiceNumber": null,
  "originalInvoiceCAE": null
}
```

## Detalle de cada campo

### Objeto `emisor` (OBLIGATORIO)
Datos de la empresa que emite la factura. Estos datos se muestran en el PDF de la factura.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| razonSocial | string | SÍ | Razón social exacta como está en AFIP |
| cuit | number | SÍ | CUIT del emisor (11 dígitos, sin guiones) |
| domicilio | string | SÍ | Domicilio fiscal del emisor |
| condicionIva | string | SÍ | "Responsable Inscripto", "Monotributo", etc. |
| iibb | string | SÍ | Número de Ingresos Brutos |
| inicioActividades | string | SÍ | Fecha de inicio de actividades formato DD/MM/YYYY |
| puntoVenta | number | SÍ | Número de punto de venta habilitado en AFIP (ej: 1, 2, 4, 5) |

**Importante:** Los datos del emisor deben estar configurados en el sistema por cada empresa/negocio. Se deben guardar en la base de datos y enviar en cada request.

### Campo `type` (OBLIGATORIO)
Tipo de comprobante. Valores posibles:
- `"A"` → Factura A (emisor RI → receptor RI)
- `"B"` → Factura B (emisor RI → receptor CF/Monotributo/Exento)
- `"C"` → Factura C (emisor Monotributo → cualquier receptor)

### Campo `creditnote` (OBLIGATORIO)
- `false` → Es una Factura
- `true` → Es una Nota de Crédito

### Objeto `client` (OBLIGATORIO)
Datos del receptor de la factura.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| name | string | SÍ | Razón social o nombre completo del cliente |
| cuit | string | SÍ* | CUIT del cliente (11 dígitos como string, sin guiones). *Para Consumidor Final en Factura C enviar "0" |
| address | string | SÍ | Domicilio del cliente |
| tax_condition | string | SÍ | "Responsable Inscripto", "Monotributo", "Exento", "Consumidor Final" |
| email | string | NO | Email del cliente |
| jurisdiction | string | NO | Provincia del cliente |
| id | string | NO | UUID del cliente en tu sistema (no se usa en AFIP, es para referencia interna) |

### Array `items` (OBLIGATORIO)
Lista de productos o servicios. Cada item tiene:

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| productName | string | SÍ | Nombre/descripción del producto o servicio |
| quantity | number | SÍ | Cantidad (entero o decimal) |
| unitPrice | number | SÍ | Precio unitario NETO (sin IVA) |
| vatRate | number | SÍ | Tasa de IVA. Enviar `0` siempre — el IVA se calcula en n8n según el tipo de factura |
| subtotal | number | SÍ | `quantity × unitPrice` (calcularlo en el frontend) |
| sku | string | NO | Código de producto/SKU |
| productId | string | NO | UUID del producto en tu sistema |
| dispatchNumber | string | NO | Número de despacho de aduana (solo para importadoras) |
| origin | string | NO | País de origen de la mercadería (solo para importadoras) |

**Nota sobre vatRate:** Enviarlo siempre en `0`. El workflow de n8n determina automáticamente si corresponde aplicar IVA 21% basándose en el `type` de factura (A y B llevan IVA, C no).

### Objeto `totals` (OBLIGATORIO)
Totales de la factura.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| subtotal | number | SÍ | Suma de todos los `subtotal` de los items |
| discountPercentage | number | SÍ | Porcentaje de descuento global (0 si no hay) |
| discountAmount | number | SÍ | Monto fijo de descuento en pesos (0 si no hay) |
| netTaxable | number | SÍ | Base imponible neta: `subtotal - discountAmount` |
| vatTotal | number | SÍ | Total de IVA. Para Factura A/B: `netTaxable × 0.21`. Para Factura C: `0` |
| total | number | SÍ | Total final: `netTaxable + vatTotal` |

### Campo `date` (OBLIGATORIO)
Fecha de emisión del comprobante en formato `YYYY-MM-DD` (ej: `"2026-03-27"`).

### Campos para Nota de Crédito (solo si `creditnote: true`)

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| originalInvoiceNumber | number | Solo NC | Número del comprobante original que se está anulando |
| originalInvoiceCAE | string | Solo NC | CAE del comprobante original |

Cuando `creditnote` es `false`, estos campos pueden ser `null` o no enviarse.

## Respuesta del webhook

El webhook responde con:
- **Status 200** + PDF binario de la factura generada
- **Headers importantes:**
  - `x-cae`: CAE asignado por AFIP
  - `x-invoice-number`: Número de comprobante asignado
  - `x-invoice-id`: ID del comprobante

El frontend debe leer estos headers para guardar el CAE y número de factura en la base de datos.

## Ejemplos completos

### Factura A - Empresa a Empresa (Responsable Inscripto)
```json
{
  "emisor": {
    "razonSocial": "MI CONSULTORA SRL",
    "cuit": 30712345678,
    "domicilio": "AV CORRIENTES 1234 PISO 5",
    "condicionIva": "Responsable Inscripto",
    "iibb": "30712345678",
    "inicioActividades": "15/03/2018",
    "puntoVenta": 1
  },
  "type": "A",
  "creditnote": false,
  "client": {
    "name": "ACME SOLUCIONES SA",
    "cuit": "30709876543",
    "address": "LIBERTAD 567",
    "tax_condition": "Responsable Inscripto",
    "email": "admin@acme.com"
  },
  "items": [
    {
      "productName": "Servicio de consultoría - Marzo 2026",
      "quantity": 1,
      "unitPrice": 800000.00,
      "vatRate": 0,
      "sku": "CONS-MAR-26",
      "subtotal": 800000.00
    }
  ],
  "totals": {
    "subtotal": 800000.00,
    "discountPercentage": 0,
    "discountAmount": 0,
    "netTaxable": 800000.00,
    "vatTotal": 168000.00,
    "total": 968000.00
  },
  "date": "2026-03-27"
}
```

### Factura B - Empresa a Consumidor Final
```json
{
  "emisor": {
    "razonSocial": "TIENDA ONLINE SRL",
    "cuit": 30711111111,
    "domicilio": "CALLE FALSA 123",
    "condicionIva": "Responsable Inscripto",
    "iibb": "30711111111",
    "inicioActividades": "01/06/2020",
    "puntoVenta": 2
  },
  "type": "B",
  "creditnote": false,
  "client": {
    "name": "JUAN PEREZ",
    "cuit": "23345678901",
    "address": "MITRE 456",
    "tax_condition": "Consumidor Final",
    "email": "juan@gmail.com"
  },
  "items": [
    {
      "productName": "Remera estampada talle M",
      "quantity": 2,
      "unitPrice": 25000.00,
      "vatRate": 0,
      "sku": "REM-M-001",
      "subtotal": 50000.00
    },
    {
      "productName": "Jean slim fit talle 42",
      "quantity": 1,
      "unitPrice": 65000.00,
      "vatRate": 0,
      "sku": "JEA-42-001",
      "subtotal": 65000.00
    }
  ],
  "totals": {
    "subtotal": 115000.00,
    "discountPercentage": 10,
    "discountAmount": 11500.00,
    "netTaxable": 103500.00,
    "vatTotal": 21735.00,
    "total": 125235.00
  },
  "date": "2026-03-27"
}
```

### Factura C - Monotributo
```json
{
  "emisor": {
    "razonSocial": "MARIA GARCIA",
    "cuit": 27234567890,
    "domicilio": "SAN MARTIN 890",
    "condicionIva": "Monotributo",
    "iibb": "27234567890",
    "inicioActividades": "01/01/2022",
    "puntoVenta": 1
  },
  "type": "C",
  "creditnote": false,
  "client": {
    "name": "CONSUMIDOR FINAL",
    "cuit": "0",
    "address": "-",
    "tax_condition": "Consumidor Final"
  },
  "items": [
    {
      "productName": "Clase particular de inglés (2hs)",
      "quantity": 8,
      "unitPrice": 12000.00,
      "vatRate": 0,
      "subtotal": 96000.00
    }
  ],
  "totals": {
    "subtotal": 96000.00,
    "discountPercentage": 0,
    "discountAmount": 0,
    "netTaxable": 96000.00,
    "vatTotal": 0,
    "total": 96000.00
  },
  "date": "2026-03-27"
}
```

### Nota de Crédito A - Anulación
```json
{
  "emisor": {
    "razonSocial": "MI CONSULTORA SRL",
    "cuit": 30712345678,
    "domicilio": "AV CORRIENTES 1234 PISO 5",
    "condicionIva": "Responsable Inscripto",
    "iibb": "30712345678",
    "inicioActividades": "15/03/2018",
    "puntoVenta": 1
  },
  "type": "A",
  "creditnote": true,
  "originalInvoiceNumber": 45,
  "originalInvoiceCAE": "74123456789012",
  "client": {
    "name": "ACME SOLUCIONES SA",
    "cuit": "30709876543",
    "address": "LIBERTAD 567",
    "tax_condition": "Responsable Inscripto"
  },
  "items": [
    {
      "productName": "Servicio de consultoría - Marzo 2026",
      "quantity": 1,
      "unitPrice": 800000.00,
      "vatRate": 0,
      "subtotal": 800000.00
    }
  ],
  "totals": {
    "subtotal": 800000.00,
    "discountPercentage": 0,
    "discountAmount": 0,
    "netTaxable": 800000.00,
    "vatTotal": 168000.00,
    "total": 968000.00
  },
  "date": "2026-03-27"
}
```

### Factura A - Importadora (con despacho y origen)
```json
{
  "emisor": {
    "razonSocial": "IMPORTADORA DEL SUR SA",
    "cuit": 30715008234,
    "domicilio": "PUERTO MADERO DOCK 3",
    "condicionIva": "Responsable Inscripto",
    "iibb": "30715008234",
    "inicioActividades": "01/09/2015",
    "puntoVenta": 4
  },
  "type": "A",
  "creditnote": false,
  "client": {
    "name": "MUEBLES RODRIGUEZ SRL",
    "cuit": "30709499382",
    "address": "CROVARA 3228",
    "tax_condition": "Responsable Inscripto"
  },
  "items": [
    {
      "productName": "SILLA GERENCIAL",
      "quantity": 61,
      "unitPrice": 33768.76,
      "vatRate": 0,
      "sku": "OC-01",
      "subtotal": 2059894.36,
      "dispatchNumber": "192510L",
      "origin": "CHINA"
    },
    {
      "productName": "SILLA DE OFICINA",
      "quantity": 72,
      "unitPrice": 84501.63,
      "vatRate": 0,
      "sku": "OC-02",
      "subtotal": 6084117.36,
      "dispatchNumber": "192510L",
      "origin": "CHINA"
    }
  ],
  "totals": {
    "subtotal": 8144011.72,
    "discountPercentage": 0,
    "discountAmount": 0,
    "netTaxable": 8144011.72,
    "vatTotal": 1710242.46,
    "total": 9854254.18
  },
  "date": "2026-03-16"
}
```

## Reglas importantes

1. **vatRate siempre en 0** — El IVA se calcula en n8n, no en el frontend
2. **subtotal de cada item = quantity × unitPrice** — Calcularlo en el frontend
3. **totals.subtotal = suma de todos los item.subtotal**
4. **Los campos opcionales se pueden omitir** — No es necesario enviar `dispatchNumber`, `origin`, `productId`, `sku` si no aplican
5. **El CUIT del client siempre como string** — Incluso si es "0" para Consumidor Final
6. **El CUIT del emisor siempre como number** — Sin comillas
7. **La fecha siempre en formato YYYY-MM-DD**
8. **No enviar credenciales de AFIP en el webhook** — El certificado, clave privada y tokens se configuran directamente en n8n
