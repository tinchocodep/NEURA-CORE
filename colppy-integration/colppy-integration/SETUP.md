# Integración Colppy para NeuraCore

## Arquitectura

```
Frontend (React)
    │
    ├── useColppy() hook
    │       │
    │       ▼
    ├── ColppyService (llama Edge Functions)
    │       │
    │       ▼
    ├── Supabase Edge Function "colppy-proxy"
    │       │
    │       ├── Lee credenciales encriptadas de Supabase
    │       │
    │       ▼
    └── API de Colppy (login.colppy.com)
```

Las credenciales del tenant **nunca** tocan el frontend.

## Pasos de instalación

### 1. Registrar app en dev.colppy.com (ya hecho)

Obtener:
- `apiUser` (nombre de tu app)
- `apiPassword` (convertir a MD5)

### 2. Ejecutar migración de Supabase

Ir a Supabase Dashboard > SQL Editor y ejecutar:
`supabase/migration_tenant_integrations.sql`

**Importante:** Crear un secret en Supabase Vault llamado `INTEGRATION_ENCRYPTION_KEY`
con una key aleatoria segura (mínimo 32 chars). Esto encripta las credenciales.

### 3. Deploy de la Edge Function

```bash
# Desde la raíz del proyecto
cp -r edge-functions/colppy-proxy supabase/functions/colppy-proxy

# Configurar secrets
supabase secrets set COLPPY_API_USER=TuAppNeuraCore
supabase secrets set COLPPY_API_PASSWORD_MD5=md5hashDePassword

# Deploy
supabase functions deploy colppy-proxy
```

### 4. Integrar en NeuraCore

```
# Copiar archivos a tu proyecto:
services/colppy.service.ts     → src/services/colppy.service.ts
services/integration.service.ts → src/services/integration.service.ts
hooks/useColppy.ts             → src/hooks/useColppy.ts
components/ColppySetup.tsx     → src/components/integraciones/ColppySetup.tsx
```

### 5. Ajustar el hook

En `hooks/useColppy.ts`, descomentar la línea de `useTenant()` y ajustar
al import real de tu TenantContext.

### 6. Instalar dependencia MD5 para el browser

```bash
npm install md5 @types/md5
```

## Uso desde componentes

```tsx
// En /contable/configuracion
import { ColppySetup } from "@/components/integraciones/ColppySetup";

function ConfigPage() {
  return <ColppySetup onComplete={() => toast.success("Colppy conectado!")} />;
}
```

```tsx
// En cualquier componente que sincronice datos
import { useColppy } from "@/hooks/useColppy";

function ComprobantesPage() {
  const { syncComprobante, loading } = useColppy();

  const handleSync = async (comprobante) => {
    const result = await syncComprobante({
      tipo: "venta",
      idEntidadColppy: comprobante.clienteColppyId,
      tipoComprobante: "B",
      fecha: comprobante.fecha,
      netoGravado: comprobante.neto,
      totalIVA: comprobante.iva,
      importeTotal: comprobante.total,
      items: comprobante.lineas.map(l => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precio,
      })),
      neuraCoreId: comprobante.id,
    });

    if (result.success) {
      toast.success("Sincronizado con Colppy");
    }
  };
}
```

## Variables de entorno necesarias

### En `.env.local` (desarrollo)
No se necesitan — todo pasa por Edge Functions + Vault.

### En Supabase Secrets (Edge Functions)
```
COLPPY_API_USER=TuAppNeuraCore
COLPPY_API_PASSWORD_MD5=hash_md5_del_password
```

### En Supabase Vault
```
INTEGRATION_ENCRYPTION_KEY=una_key_aleatoria_de_32+_chars
```

## Notas sobre Colppy API

- Endpoint único: `POST https://login.colppy.com/lib/frontera2/service.php`
- Todo va como JSON: `{ auth, service, parameters }`
- Sesiones duran 60 min (el proxy las cachea y renueva)
- Los passwords van en MD5
- El staging tarda 24h en habilitarse después de crear cuenta dev
- Documentación: https://apidocs.colppy.com/
