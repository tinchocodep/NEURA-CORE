/**
 * XubioService — Integration engine for Xubio ERP
 *
 * OAuth2 flow:
 *   POST https://xubio.com/API/1.1/TokenEndpoint
 *   Body: { client_id, client_secret }
 *   Returns: { access_token, token_type, expires_in: 3600 }
 *
 * All data endpoints:
 *   Base: https://xubio.com/API/1.1/
 *   Auth header: Authorization: Bearer <access_token>
 */

import { supabase } from '../lib/supabase';

/* ─── Types ────────────────────────────────────────── */

interface XubioTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface XubioConfig {
    id: string;
    tenant_id: string;
    xubio_client_id: string | null;
    xubio_client_secret: string | null;
    xubio_token: string | null;
    xubio_token_expires_at: string | null;
}

export interface XubioCliente {
    ID: number;
    nombre: string;
    apellido: string;
    razonSocial: string;
    tipoDocumento: { ID: number; nombre: string } | null;
    numeroDocumento: string;
    email: string;
    telefono: string;
    direccion: string;
    localidad: string;
    provincia: { ID: number; nombre: string } | null;
    condicionImpositiva: { ID: number; nombre: string } | null;
}

export interface XubioProveedor {
    ID: number;
    nombre: string;
    apellido: string;
    razonSocial: string;
    tipoDocumento: { ID: number; nombre: string } | null;
    numeroDocumento: string;
    email: string;
    telefono: string;
    direccion: string;
    localidad: string;
    provincia: { ID: number; nombre: string } | null;
    condicionImpositiva: { ID: number; nombre: string } | null;
}

export interface XubioFacturaVentaLinea {
    concepto: string;
    cantidad: number;
    precioUnitario: number;
    bonificacion: number;
    alicuotaIVA: { ID: number };
    impuestoInterno: number;
}

export interface XubioFacturaVenta {
    tipoComprobante: { ID: number };
    puntoDeVenta: { ID: number };
    fecha: string;          // yyyy-MM-dd
    cliente: { ID: number };
    moneda: { ID: number }; // 1=ARS, 2=USD
    cotizacion: number;
    renglones: XubioFacturaVentaLinea[];
    observaciones?: string;
}

export interface XubioFacturaCompraLinea {
    concepto: string;
    cantidad: number;
    precioUnitario: number;
    bonificacion: number;
    alicuotaIVA: { ID: number };
}

export interface XubioFacturaCompra {
    tipoComprobante: { ID: number };
    puntoDeVenta: number;
    numeroComprobante: number;
    fecha: string;
    fechaVencimientoPago?: string;
    proveedor: { ID: number };
    moneda: { ID: number };
    cotizacion: number;
    renglones: XubioFacturaCompraLinea[];
    observaciones?: string;
}

/* ─── Constants ────────────────────────────────────── */

const XUBIO_BASE = 'https://xubio.com/API/1.1';
const TOKEN_ENDPOINT = `${XUBIO_BASE}/TokenEndpoint`;

/** Xubio IVA alicuota IDs (standard Argentina) */
export const XUBIO_IVA = {
    0: { ID: 5 },       // 0%
    10.5: { ID: 4 },    // 10.5%
    21: { ID: 6 },      // 21%
    27: { ID: 7 },      // 27%
} as Record<number, { ID: number }>;

/** Xubio moneda IDs */
export const XUBIO_MONEDA = {
    ARS: { ID: 1 },
    USD: { ID: 2 },
} as Record<string, { ID: number }>;

/** Xubio tipo comprobante IDs (most common) */
export const XUBIO_TIPO_COMP = {
    'Factura A': { ID: 1 },
    'Factura B': { ID: 6 },
    'Factura C': { ID: 11 },
    'Nota de Crédito A': { ID: 3 },
    'Nota de Crédito B': { ID: 8 },
    'Nota de Crédito C': { ID: 13 },
    'Nota de Débito A': { ID: 2 },
    'Nota de Débito B': { ID: 7 },
    'Nota de Débito C': { ID: 12 },
    'Recibo': { ID: 15 },
} as Record<string, { ID: number }>;

/* ─── Service Class ────────────────────────────────── */

export class XubioService {
    private config: XubioConfig | null = null;
    private accessToken: string | null = null;
    private tokenExpiresAt: Date | null = null;
    private tenantId: string;

    constructor(tenantId: string) {
        this.tenantId = tenantId;
    }

    /* ── Auth ────────────────────────────────── */

    /** Load config from contable_config table */
    async loadConfig(): Promise<boolean> {
        const { data } = await supabase
            .from('contable_config')
            .select('id, tenant_id, xubio_client_id, xubio_client_secret, xubio_token, xubio_token_expires_at')
            .eq('tenant_id', this.tenantId)
            .single();

        if (!data) return false;
        this.config = data as XubioConfig;

        // Restore cached token if still valid
        if (this.config.xubio_token && this.config.xubio_token_expires_at) {
            const expiresAt = new Date(this.config.xubio_token_expires_at);
            if (expiresAt > new Date()) {
                this.accessToken = this.config.xubio_token;
                this.tokenExpiresAt = expiresAt;
            }
        }

        return true;
    }

    /** Check if credentials are configured */
    get isConfigured(): boolean {
        return !!(this.config?.xubio_client_id && this.config?.xubio_client_secret);
    }

    /** Check if we have a valid (non-expired) token */
    get isAuthenticated(): boolean {
        return !!(this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date());
    }

    /**
     * Authenticate with Xubio OAuth2 — obtains access_token
     * Stores token in DB for persistence across sessions
     */
    async authenticate(): Promise<{ success: boolean; error?: string }> {
        if (!this.config?.xubio_client_id || !this.config?.xubio_client_secret) {
            return { success: false, error: 'Credenciales Xubio no configuradas' };
        }

        try {
            const response = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.config.xubio_client_id,
                    client_secret: this.config.xubio_client_secret,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, error: `Xubio respondió ${response.status}: ${errorText}` };
            }

            const tokenData: XubioTokenResponse = await response.json();
            this.accessToken = tokenData.access_token;
            this.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000) - 60_000); // 1 min safety margin

            // Persist to DB
            await supabase.from('contable_config').update({
                xubio_token: this.accessToken,
                xubio_token_expires_at: this.tokenExpiresAt.toISOString(),
            }).eq('id', this.config.id);

            return { success: true };
        } catch (err) {
            return { success: false, error: `Error de conexión: ${(err as Error).message}` };
        }
    }

    /** Ensure we have a valid token, refreshing if needed */
    private async ensureAuth(): Promise<void> {
        if (!this.isAuthenticated) {
            const result = await this.authenticate();
            if (!result.success) {
                throw new Error(result.error || 'No se pudo autenticar con Xubio');
            }
        }
    }

    /* ── Generic API Call ────────────────────── */

    /** Make an authenticated request to Xubio API */
    private async apiRequest<T>(
        endpoint: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
        body?: unknown,
    ): Promise<T> {
        await this.ensureAuth();

        const url = `${XUBIO_BASE}/${endpoint}`;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Xubio API error ${response.status} on ${method} ${endpoint}: ${errorText}`);
        }

        return response.json();
    }

    /* ── Clientes ────────────────────────────── */

    /** Fetch all clientes from Xubio */
    async getClientes(): Promise<XubioCliente[]> {
        return this.apiRequest<XubioCliente[]>('clienteBean');
    }

    /** Create a cliente in Xubio */
    async createCliente(cliente: Partial<XubioCliente>): Promise<XubioCliente> {
        return this.apiRequest<XubioCliente>('clienteBean', 'POST', cliente);
    }

    /** Sync clientes from Xubio → Supabase contable_clientes */
    async syncClientesFromXubio(): Promise<{ imported: number; updated: number; errors: string[] }> {
        const xubioClientes = await this.getClientes();
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const xc of xubioClientes) {
            const razonSocial = xc.razonSocial || `${xc.nombre} ${xc.apellido}`.trim();
            const cuit = xc.numeroDocumento || null;

            try {
                // Check if exists by CUIT or razon_social
                const { data: existing } = await supabase
                    .from('contable_clientes')
                    .select('id, xubio_id')
                    .eq('tenant_id', this.tenantId)
                    .or(`xubio_id.eq.${xc.ID},cuit.eq.${cuit}`)
                    .maybeSingle();

                const clienteData = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    cuit,
                    email: xc.email || null,
                    telefono: xc.telefono || null,
                    direccion: xc.direccion || null,
                    localidad: xc.localidad || null,
                    provincia: xc.provincia?.nombre || null,
                    condicion_impositiva: xc.condicionImpositiva?.nombre || null,
                    xubio_id: xc.ID,
                };

                if (existing) {
                    await supabase.from('contable_clientes').update(clienteData).eq('id', existing.id);
                    updated++;
                } else {
                    await supabase.from('contable_clientes').insert(clienteData);
                    imported++;
                }
            } catch (err) {
                errors.push(`Cliente "${razonSocial}": ${(err as Error).message}`);
            }
        }

        return { imported, updated, errors };
    }

    /* ── Proveedores ────────────────────────── */

    /** Fetch all proveedores from Xubio */
    async getProveedores(): Promise<XubioProveedor[]> {
        return this.apiRequest<XubioProveedor[]>('proveedorBean');
    }

    /** Create a proveedor in Xubio */
    async createProveedor(proveedor: Partial<XubioProveedor>): Promise<XubioProveedor> {
        return this.apiRequest<XubioProveedor>('proveedorBean', 'POST', proveedor);
    }

    /** Sync proveedores from Xubio → Supabase contable_proveedores */
    async syncProveedoresFromXubio(): Promise<{ imported: number; updated: number; errors: string[] }> {
        const xubioProvs = await this.getProveedores();
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const xp of xubioProvs) {
            const razonSocial = xp.razonSocial || `${xp.nombre} ${xp.apellido}`.trim();
            const cuit = xp.numeroDocumento || null;

            try {
                const { data: existing } = await supabase
                    .from('contable_proveedores')
                    .select('id, xubio_id')
                    .eq('tenant_id', this.tenantId)
                    .or(`xubio_id.eq.${xp.ID},cuit.eq.${cuit}`)
                    .maybeSingle();

                const provData = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    cuit,
                    email: xp.email || null,
                    telefono: xp.telefono || null,
                    direccion: xp.direccion || null,
                    localidad: xp.localidad || null,
                    provincia: xp.provincia?.nombre || null,
                    condicion_impositiva: xp.condicionImpositiva?.nombre || null,
                    xubio_id: xp.ID,
                };

                if (existing) {
                    await supabase.from('contable_proveedores').update(provData).eq('id', existing.id);
                    updated++;
                } else {
                    await supabase.from('contable_proveedores').insert(provData);
                    imported++;
                }
            } catch (err) {
                errors.push(`Proveedor "${razonSocial}": ${(err as Error).message}`);
            }
        }

        return { imported, updated, errors };
    }

    /* ── Comprobantes (Inyección a Xubio) ───── */

    /**
     * Inject an approved comprobante from NeuraCore into Xubio
     * Maps our internal comprobante format to Xubio's API format
     */
    async injectComprobante(comprobante: {
        tipo: 'compra' | 'venta';
        tipo_comprobante: string;
        fecha: string;
        numero_comprobante?: string;
        moneda: string;
        tipo_cambio?: number;
        observaciones?: string;
        proveedor_xubio_id?: number;
        cliente_xubio_id?: number;
        lineas: Array<{
            descripcion: string;
            cantidad: number;
            precio_unitario: number;
            iva_porcentaje: number;
        }>;
    }): Promise<{ success: boolean; xubioId?: number; error?: string }> {
        try {
            const tipoComp = XUBIO_TIPO_COMP[comprobante.tipo_comprobante];
            if (!tipoComp) {
                return { success: false, error: `Tipo de comprobante "${comprobante.tipo_comprobante}" no mapeado a Xubio` };
            }

            const moneda = XUBIO_MONEDA[comprobante.moneda] || XUBIO_MONEDA.ARS;

            if (comprobante.tipo === 'venta') {
                if (!comprobante.cliente_xubio_id) {
                    return { success: false, error: 'Cliente no tiene xubio_id. Sincronice clientes primero.' };
                }

                const factura: XubioFacturaVenta = {
                    tipoComprobante: tipoComp,
                    puntoDeVenta: { ID: 1 }, // Default PdV — may need config
                    fecha: comprobante.fecha,
                    cliente: { ID: comprobante.cliente_xubio_id },
                    moneda,
                    cotizacion: comprobante.tipo_cambio || 1,
                    renglones: comprobante.lineas.map(l => ({
                        concepto: l.descripcion,
                        cantidad: l.cantidad,
                        precioUnitario: l.precio_unitario,
                        bonificacion: 0,
                        alicuotaIVA: XUBIO_IVA[l.iva_porcentaje] || XUBIO_IVA[21],
                        impuestoInterno: 0,
                    })),
                    observaciones: comprobante.observaciones,
                };

                const result = await this.apiRequest<{ ID: number }>('facturaDeVentaBean', 'POST', factura);
                return { success: true, xubioId: result.ID };

            } else {
                // Factura de compra
                if (!comprobante.proveedor_xubio_id) {
                    return { success: false, error: 'Proveedor no tiene xubio_id. Sincronice proveedores primero.' };
                }

                // Parse punto de venta and numero from numero_comprobante (format: "0001-00001234")
                let pdv = 1;
                let nroComp = 0;
                if (comprobante.numero_comprobante) {
                    const parts = comprobante.numero_comprobante.replace(/[^\d-]/g, '').split('-');
                    if (parts.length === 2) {
                        pdv = parseInt(parts[0]) || 1;
                        nroComp = parseInt(parts[1]) || 0;
                    }
                }

                const factura: XubioFacturaCompra = {
                    tipoComprobante: tipoComp,
                    puntoDeVenta: pdv,
                    numeroComprobante: nroComp,
                    fecha: comprobante.fecha,
                    proveedor: { ID: comprobante.proveedor_xubio_id },
                    moneda,
                    cotizacion: comprobante.tipo_cambio || 1,
                    renglones: comprobante.lineas.map(l => ({
                        concepto: l.descripcion,
                        cantidad: l.cantidad,
                        precioUnitario: l.precio_unitario,
                        bonificacion: 0,
                        alicuotaIVA: XUBIO_IVA[l.iva_porcentaje] || XUBIO_IVA[21],
                    })),
                    observaciones: comprobante.observaciones,
                };

                const result = await this.apiRequest<{ ID: number }>('facturaDeCompraBean', 'POST', factura);
                return { success: true, xubioId: result.ID };
            }
        } catch (err) {
            return { success: false, error: (err as Error).message };
        }
    }

    /* ── Test Connection ────────────────────── */

    /** Test the connection by authenticating and fetching a small resource */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        const authResult = await this.authenticate();
        if (!authResult.success) {
            return { success: false, message: authResult.error || 'Autenticación fallida' };
        }

        try {
            // Quick test: fetch clientes (just to verify API access works)
            const clientes = await this.apiRequest<unknown[]>('clienteBean');
            return {
                success: true,
                message: `Conectado ✓ — ${Array.isArray(clientes) ? clientes.length : 0} clientes encontrados`,
            };
        } catch (err) {
            return { success: false, message: `Token OK pero error en API: ${(err as Error).message}` };
        }
    }
}

/* ─── Singleton factory ────────────────────────────── */

const instances = new Map<string, XubioService>();

/** Get or create XubioService for a tenant */
export function getXubioService(tenantId: string): XubioService {
    if (!instances.has(tenantId)) {
        instances.set(tenantId, new XubioService(tenantId));
    }
    return instances.get(tenantId)!;
}
