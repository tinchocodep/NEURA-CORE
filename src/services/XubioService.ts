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
const XUBIO_PROXY = 'https://n8n.neuracall.net/webhook/xubio-proxy';

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
            const response = await fetch(XUBIO_PROXY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method: 'POST',
                    url: TOKEN_ENDPOINT,
                    data: {
                        grant_type: 'client_credentials',
                        client_id: this.config.xubio_client_id,
                        client_secret: this.config.xubio_client_secret,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, error: `Proxy/Xubio respondió ${response.status}: ${errorText}` };
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

        const response = await fetch(XUBIO_PROXY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method,
                url,
                token: this.accessToken,
                data: body || undefined,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Xubio API error ${response.status} on ${method} ${endpoint}: ${errorText}`);
        }

        const json = await response.json();
        console.log(`[Xubio] ${method} ${endpoint}:`, JSON.stringify(json).slice(0, 500));
        // n8n proxy wraps array responses in {items: [...]}
        if (json && typeof json === 'object' && Array.isArray(json.items)) {
            // Check if n8n returned an error inside items
            if (json.items.length === 1 && json.items[0]?.error) {
                const err = json.items[0].error;
                throw new Error(`Xubio API error: ${err.message || err.status || 'Unknown error'}`);
            }
            return json.items;
        }
        return json;
    }

    /* ── Clientes ────────────────────────────── */

    /** Fetch all clientes from Xubio (list) */
    async getClientes(): Promise<XubioCliente[]> {
        return this.apiRequest<XubioCliente[]>('clienteBean');
    }

    /** Fetch a single cliente detail from Xubio */
    async getClienteDetail(clienteId: number): Promise<Record<string, any> | null> {
        try {
            const result = await this.apiRequest<any>(`clienteBean/${clienteId}`);
            // apiRequest already extracts items array; for single detail it returns [obj]
            const detail = Array.isArray(result) ? result[0] : result;
            return detail || null;
        } catch {
            return null;
        }
    }

    /** Create a cliente in Xubio */
    async createCliente(cliente: Partial<XubioCliente>): Promise<XubioCliente> {
        return this.apiRequest<XubioCliente>('clienteBean', 'POST', cliente);
    }

    /** Sync clientes from Xubio → Supabase contable_clientes */
    async syncClientesFromXubio(onProgress?: (current: number, total: number) => void): Promise<{ imported: number; updated: number; errors: string[] }> {
        const raw = await this.getClientes();
        const xubioClientes = Array.isArray(raw) ? raw : [];
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        for (let i = 0; i < xubioClientes.length; i++) {
            const xc = xubioClientes[i];
            const xubioId = (xc as any).ID || (xc as any).cliente_id;
            const nombreBasico = xc.razonSocial || (xc as any).nombre || `${xc.nombre || ''} ${xc.apellido || ''}`.trim();

            if (!xubioId || !nombreBasico) continue;

            onProgress?.(i + 1, xubioClientes.length);

            try {
                // Fetch full detail for each client
                const detail = await this.getClienteDetail(xubioId);

                const razonSocial = detail?.razonSocial || detail?.nombre || nombreBasico;
                const cuit = detail?.CUIT || detail?.cuit || null;

                // Check by xubio_id first, then by razon_social (avoids PostgREST comma issues)
                let existing: { id: string; xubio_id: number | null } | null = null;
                const { data: byXubioId } = await supabase
                    .from('contable_clientes')
                    .select('id, xubio_id')
                    .eq('tenant_id', this.tenantId)
                    .eq('xubio_id', xubioId)
                    .maybeSingle();
                existing = byXubioId;
                if (!existing && cuit) {
                    const { data: byCuit } = await supabase
                        .from('contable_clientes')
                        .select('id, xubio_id')
                        .eq('tenant_id', this.tenantId)
                        .eq('cuit', cuit)
                        .maybeSingle();
                    existing = byCuit;
                }

                const clienteData: Record<string, unknown> = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    xubio_id: xubioId,
                };
                if (cuit) clienteData.cuit = cuit;
                if (detail?.email) clienteData.email = detail.email.trim();
                if (detail?.telefono) clienteData.telefono = detail.telefono.trim();
                if (detail?.direccion) clienteData.direccion = detail.direccion.trim();
                if (detail?.categoriaFiscal?.nombre) clienteData.condicion_fiscal = detail.categoriaFiscal.nombre;
                if (detail?.provincia?.nombre) clienteData.provincia = detail.provincia.nombre;
                if (detail?.localidad?.nombre) clienteData.localidad = detail.localidad.nombre;
                if (detail?.descripcion) clienteData.observaciones = detail.descripcion.trim();

                if (existing) {
                    await supabase.from('contable_clientes').update(clienteData).eq('id', existing.id);
                    updated++;
                } else {
                    await supabase.from('contable_clientes').insert(clienteData);
                    imported++;
                }
            } catch (err) {
                errors.push(`Cliente "${nombreBasico}": ${(err as Error).message}`);
            }
        }

        return { imported, updated, errors };
    }

    /* ── Proveedores ────────────────────────── */

    /** Fetch all proveedores from Xubio */
    async getProveedores(): Promise<XubioProveedor[]> {
        return this.apiRequest<XubioProveedor[]>('ProveedorBean');
    }

    /** Create a proveedor in Xubio */
    async createProveedor(proveedor: Partial<XubioProveedor>): Promise<XubioProveedor> {
        return this.apiRequest<XubioProveedor>('ProveedorBean', 'POST', proveedor);
    }

    /** Fetch a single proveedor detail from Xubio */
    async getProveedorDetail(proveedorId: number): Promise<Record<string, any> | null> {
        try {
            const result = await this.apiRequest<any>(`ProveedorBean/${proveedorId}`);
            const detail = Array.isArray(result) ? result[0] : result;
            return detail || null;
        } catch {
            return null;
        }
    }

    /** Sync proveedores from Xubio → Supabase contable_proveedores */
    async syncProveedoresFromXubio(onProgress?: (current: number, total: number) => void): Promise<{ imported: number; updated: number; errors: string[] }> {
        let xubioProvs: any[];
        try {
            const result = await this.getProveedores();
            xubioProvs = Array.isArray(result) ? result : [];
            if (xubioProvs.length === 0) {
                return { imported: 0, updated: 0, errors: ['Xubio no devolvió proveedores.'] };
            }
        } catch (err: any) {
            return { imported: 0, updated: 0, errors: [`Error obteniendo proveedores de Xubio: ${err.message}`] };
        }
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        for (let i = 0; i < xubioProvs.length; i++) {
            const xp = xubioProvs[i];
            const xubioId = xp.ID || xp.proveedorid;
            const nombreBasico = xp.razonSocial || xp.nombre || '';

            if (!xubioId || !nombreBasico) continue;

            onProgress?.(i + 1, xubioProvs.length);

            try {
                const detail = await this.getProveedorDetail(xubioId);

                const razonSocial = detail?.razonSocial || detail?.nombre || nombreBasico;
                const cuit = detail?.CUIT || detail?.cuit || null;

                // Check by xubio_id first, then by razon_social (avoids PostgREST comma issues)
                let existing: { id: string; xubio_id: number | null } | null = null;
                const { data: byXubioId } = await supabase
                    .from('contable_proveedores')
                    .select('id, xubio_id')
                    .eq('tenant_id', this.tenantId)
                    .eq('xubio_id', xubioId)
                    .maybeSingle();
                existing = byXubioId;
                if (!existing) {
                    const { data: byName } = await supabase
                        .from('contable_proveedores')
                        .select('id, xubio_id')
                        .eq('tenant_id', this.tenantId)
                        .eq('razon_social', razonSocial)
                        .maybeSingle();
                    existing = byName;
                }

                const provData: Record<string, unknown> = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    xubio_id: xubioId,
                };
                if (cuit) provData.cuit = cuit;
                if (detail?.email) provData.email = detail.email.trim();
                if (detail?.telefono) provData.telefono = detail.telefono.trim();
                if (detail?.direccion) provData.direccion = detail.direccion.trim();
                if (detail?.categoriaFiscal?.nombre) provData.condicion_fiscal = detail.categoriaFiscal.nombre;
                if (detail?.observaciones) provData.observaciones = detail.observaciones.trim();

                if (existing) {
                    await supabase.from('contable_proveedores').update(provData).eq('id', existing.id);
                    updated++;
                } else {
                    await supabase.from('contable_proveedores').insert(provData);
                    imported++;
                }
            } catch (err) {
                errors.push(`Proveedor "${nombreBasico}": ${(err as Error).message}`);
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

                const result = await this.apiRequest<{ ID: number }>('comprobanteVentaBean', 'POST', factura);
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

                const result = await this.apiRequest<{ ID: number }>('comprobanteCompraBean', 'POST', factura);
                return { success: true, xubioId: result.ID };
            }
        } catch (err) {
            return { success: false, error: (err as Error).message };
        }
    }

    /* ── Sync Comprobantes from Xubio ────────── */

    /** Fetch comprobantes de venta from Xubio */
    async getComprobantesVenta(fechaDesde?: string, fechaHasta?: string): Promise<any[]> {
        let endpoint = 'comprobanteVentaBean';
        const params: string[] = [];
        if (fechaDesde) params.push(`fechaDesde=${fechaDesde}`);
        if (fechaHasta) params.push(`fechaHasta=${fechaHasta}`);
        if (params.length) endpoint += `?${params.join('&')}`;
        return this.apiRequest<any[]>(endpoint);
    }

    /** Fetch comprobantes de compra from Xubio */
    async getComprobantesCompra(fechaDesde?: string, fechaHasta?: string): Promise<any[]> {
        let endpoint = 'comprobanteCompraBean';
        const params: string[] = [];
        if (fechaDesde) params.push(`fechaDesde=${fechaDesde}`);
        if (fechaHasta) params.push(`fechaHasta=${fechaHasta}`);
        if (params.length) endpoint += `?${params.join('&')}`;
        return this.apiRequest<any[]>(endpoint);
    }

    /** Map Xubio tipo int to our tipo_comprobante string */
    private mapTipoComprobante(tipo: number, esVenta: boolean): string {
        if (esVenta) {
            const map: Record<number, string> = { 1: 'Factura', 2: 'Nota de Débito', 3: 'Nota de Crédito', 4: 'Informe Z', 6: 'Recibo' };
            return map[tipo] || `Tipo ${tipo}`;
        }
        const map: Record<number, string> = { 1: 'Factura', 2: 'Nota de Débito', 3: 'Nota de Crédito', 6: 'Recibo', 99: 'Otros' };
        return map[tipo] || `Tipo ${tipo}`;
    }

    /** Sync comprobantes (venta + compra) from Xubio → contable_comprobantes */
    async syncComprobantes(
        fechaDesde?: string,
        fechaHasta?: string,
        onProgress?: (msg: string) => void,
    ): Promise<{ imported: number; updated: number; errors: string[] }> {
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        // Build lookup maps: xubio_id → our uuid for clientes and proveedores
        const { data: clientes } = await supabase
            .from('contable_clientes')
            .select('id, xubio_id')
            .eq('tenant_id', this.tenantId)
            .not('xubio_id', 'is', null);
        const clienteMap = new Map<string, string>();
        clientes?.forEach((c: any) => clienteMap.set(String(c.xubio_id), c.id));

        const { data: proveedores } = await supabase
            .from('contable_proveedores')
            .select('id, xubio_id')
            .eq('tenant_id', this.tenantId)
            .not('xubio_id', 'is', null);
        const proveedorMap = new Map<string, string>();
        proveedores?.forEach((p: any) => proveedorMap.set(String(p.xubio_id), p.id));

        // 1. Comprobantes de Venta
        onProgress?.('Descargando comprobantes de venta...');
        try {
            const ventaRaw = await this.getComprobantesVenta(fechaDesde, fechaHasta);
            const ventas = Array.isArray(ventaRaw) ? ventaRaw : [];
            onProgress?.(`${ventas.length} comprobantes de venta encontrados`);

            for (let i = 0; i < ventas.length; i++) {
                const cv = ventas[i];
                onProgress?.(`Venta ${i + 1}/${ventas.length}`);
                if (i === 0) console.log('[Xubio] First venta keys:', Object.keys(cv));
                const xubioId = String(cv.transaccionid || cv.comprobante || cv.numeroDocumento || '');
                if (!xubioId) continue;

                try {
                    // Check if already synced
                    const { data: existing } = await supabase
                        .from('contable_comprobantes')
                        .select('id')
                        .eq('tenant_id', this.tenantId)
                        .eq('xubio_id', xubioId)
                        .maybeSingle();

                    const tipoNombre = this.mapTipoComprobante(cv.tipo, true);
                    const letra = cv.nombre?.match(/[ABC]/)?.[0] || '';
                    const tipoComprobante = letra ? `${tipoNombre} ${letra}` : tipoNombre;

                    const clienteXubioId = cv.cliente?.ID || cv.cliente?.id;
                    const clienteUuid = clienteXubioId ? clienteMap.get(String(clienteXubioId)) : null;

                    const compData: Record<string, unknown> = {
                        tenant_id: this.tenantId,
                        tipo: 'venta',
                        tipo_comprobante: tipoComprobante,
                        fecha: cv.fecha,
                        numero_comprobante: cv.numeroDocumento || null,
                        cliente_id: clienteUuid || null,
                        moneda: 'ARS',
                        monto_original: cv.importetotal || 0,
                        monto_ars: cv.importetotal || 0,
                        neto_gravado: cv.importeGravado || 0,
                        total_iva: cv.importeImpuestos || 0,
                        estado: 'aprobado',
                        source: 'xubio',
                        xubio_id: xubioId,
                        xubio_synced_at: new Date().toISOString(),
                        descripcion: cv.descripcion || null,
                    };
                    if (cv.fechaVto) compData.fecha_vencimiento = cv.fechaVto;
                    if (cv.cotizacion && cv.cotizacion !== 1) {
                        compData.tipo_cambio = cv.cotizacion;
                    }

                    if (existing) {
                        await supabase.from('contable_comprobantes').update(compData).eq('id', existing.id);
                        updated++;
                    } else {
                        await supabase.from('contable_comprobantes').insert(compData);
                        imported++;
                    }
                } catch (err) {
                    errors.push(`Venta ${cv.numeroDocumento || xubioId}: ${(err as Error).message}`);
                }
            }
        } catch (err) {
            errors.push(`Error descargando ventas: ${(err as Error).message}`);
        }

        // 2. Comprobantes de Compra
        onProgress?.('Descargando comprobantes de compra...');
        try {
            const compraRaw = await this.getComprobantesCompra(fechaDesde, fechaHasta);
            const compras = Array.isArray(compraRaw) ? compraRaw : [];
            onProgress?.(`${compras.length} comprobantes de compra encontrados`);

            for (let i = 0; i < compras.length; i++) {
                const cc = compras[i];
                onProgress?.(`Compra ${i + 1}/${compras.length}`);
                if (i === 0) console.log('[Xubio] First compra keys:', Object.keys(cc));
                const xubioId = String(cc.transaccionid || cc.comprobante || cc.numeroDocumento || '');
                if (!xubioId) continue;

                try {
                    const { data: existing } = await supabase
                        .from('contable_comprobantes')
                        .select('id')
                        .eq('tenant_id', this.tenantId)
                        .eq('xubio_id', xubioId)
                        .maybeSingle();

                    const tipoNombre = this.mapTipoComprobante(cc.tipo, false);
                    const letra = cc.nombre?.match(/[ABC]/)?.[0] || '';
                    const tipoComprobante = letra ? `${tipoNombre} ${letra}` : tipoNombre;

                    const provXubioId = cc.proveedor?.ID || cc.proveedor?.id;
                    const provUuid = provXubioId ? proveedorMap.get(String(provXubioId)) : null;

                    const compData: Record<string, unknown> = {
                        tenant_id: this.tenantId,
                        tipo: 'compra',
                        tipo_comprobante: tipoComprobante,
                        fecha: cc.fecha,
                        numero_comprobante: cc.numeroDocumento || null,
                        proveedor_id: provUuid || null,
                        moneda: 'ARS',
                        monto_original: cc.importetotal || 0,
                        monto_ars: cc.importetotal || 0,
                        neto_gravado: cc.importeGravado || 0,
                        total_iva: cc.importeImpuestos || 0,
                        estado: 'aprobado',
                        source: 'xubio',
                        xubio_id: xubioId,
                        xubio_synced_at: new Date().toISOString(),
                        descripcion: cc.descripcion || null,
                    };
                    if (cc.fechaVto) compData.fecha_vencimiento = cc.fechaVto;
                    if (cc.cotizacion && cc.cotizacion !== 1) {
                        compData.tipo_cambio = cc.cotizacion;
                    }

                    if (existing) {
                        await supabase.from('contable_comprobantes').update(compData).eq('id', existing.id);
                        updated++;
                    } else {
                        await supabase.from('contable_comprobantes').insert(compData);
                        imported++;
                    }
                } catch (err) {
                    errors.push(`Compra ${cc.numeroDocumento || xubioId}: ${(err as Error).message}`);
                }
            }
        } catch (err) {
            errors.push(`Error descargando compras: ${(err as Error).message}`);
        }

        return { imported, updated, errors };
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
            const clientes = await this.getClientes();
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
