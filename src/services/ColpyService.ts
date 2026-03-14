/**
 * ColpyService — Integration engine for Colpy ERP
 *
 * Auth flow:
 *   Colpy uses a single transactional endpoint for everything. 
 *   There are no tokens to manage over time; instead, the username,
 *   password, and company ID must be sent with EVERY POST request.
 *
 * Endpoint:
 *   https://login.colppy.com/lib/frontera2/service.php
 */

import { supabase } from '../lib/supabase';
import md5 from 'md5';

/* ─── Types ────────────────────────────────────────── */

interface ColpyConfig {
    id: string;
    tenant_id: string;
    colpy_username: string | null;
    colpy_password: string | null;
    colpy_empresa_id: string | null;
}

export interface ColpyCliente {
    id: string; // Colpy usually returns string or number identifiers
    nombre: string;
    cuit: string;
    email: string;
    telefono: string;
    direccion: string;
}

export interface ColpyProveedor {
    id: string;
    nombre: string;
    cuit: string;
    email: string;
    telefono: string;
    direccion: string;
}

/* ─── Constants ────────────────────────────────────── */

const COLPY_ENDPOINT = 'https://login.colppy.com/lib/frontera2/service.php';

/* ─── Service Class ────────────────────────────────── */

export class ColpyService {
    private config: ColpyConfig | null = null;
    private tenantId: string;
    private claveSesion: string | null = null;

    constructor(tenantId: string) {
        this.tenantId = tenantId;
    }

    /* ── Config & Auth State ────────────────────────── */

    /** Load config from contable_config table */
    async loadConfig(): Promise<boolean> {
        const { data } = await supabase
            .from('contable_config')
            .select('id, tenant_id, colpy_username, colpy_password, colpy_empresa_id')
            .eq('tenant_id', this.tenantId)
            .single();

        if (!data) return false;
        this.config = data as ColpyConfig;

        return true;
    }

    /** Check if credentials are configured in the DB */
    get isConfigured(): boolean {
        return !!(this.config?.colpy_username && this.config?.colpy_password);
    }

    /* ── Generic API Call ────────────────────── */

    /** 
     * Make an authenticated request to Colpy API.
     * Colpy uses a specific JSON structure wrapping the authentication 
     * and the payload logically.
     */
    private async apiRequest<T>(
        serviceName: string, 
        operacion: string, 
        parametros: Record<string, any> = {}
    ): Promise<T> {
        if (!this.config) {
            await this.loadConfig();
        }

        if (!this.isConfigured) {
            throw new Error('Credenciales Colpy no configuradas');
        }

        // If not logging in, and we don't have a session, log in first
        if (operacion !== 'iniciar_sesion' && !this.claveSesion) {
            await this.login();
        }

        const devUser = import.meta.env.VITE_COLPY_DEV_USER;
        const devPass = import.meta.env.VITE_COLPY_DEV_PASSWORD;

        if (!devUser || !devPass) {
            console.warn('Faltan variables de entorno VITE_COLPY_DEV_USER o VITE_COLPY_DEV_PASSWORD. El request fallará en Colpy.');
        }

        let requestParameters = {};
        if (operacion === 'iniciar_sesion') {
             requestParameters = {
                 "usuario": this.config!.colpy_username,
                 "password": md5(this.config!.colpy_password!)
             };
        } else {
             requestParameters = {
                 "sesion": {
                     "usuario": this.config!.colpy_username,
                     "claveSesion": this.claveSesion
                 },
                 ...parametros
             };
        }

        const payload = {
            "auth": {
                "usuario": devUser || "",
                "password": devPass ? md5(devPass) : ""
            },
            "service": {
                "provision": serviceName,
                "operacion": operacion
            },
            "parameters": requestParameters
        };

        const response = await fetch(COLPY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Colpy API error ${response.status} on ${serviceName}/${operacion}: ${errorText}`);
        }

        const resultJson = await response.json();
        
        const apiResponse = resultJson.response;
        
        // Colpy usually returns a generic structure. If login fails, it says success: false
        if (apiResponse && (apiResponse.success === false || apiResponse.success === 0)) {
            throw new Error(`Colpy Error: ${apiResponse.message || JSON.stringify(apiResponse.errors)}`);
        }

        // Colpy sometimes returns errors inside a "result" object
        if (resultJson.result && resultJson.result.estado && resultJson.result.estado.toString() !== "0" && resultJson.result.estado.toString() !== "200") {
            throw new Error(`${resultJson.result.mensaje || 'Error desconocido'}`);
        }

        // We return the actual apiResponse object which contains data
        return (apiResponse || resultJson) as T;
    }

    private async login(): Promise<void> {
        const resp = await this.apiRequest<any>('Usuario', 'iniciar_sesion');
        if (resp && resp.data && resp.data.claveSesion) {
            this.claveSesion = resp.data.claveSesion;
        } else {
            throw new Error('Login en Colpy no devolvió claveSesion');
        }
    }

    /* ── Test Connection ────────────────────── */

    /** Test the connection by hitting the user validation mechanism */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            await this.login();
            return {
                success: true,
                message: `Conectado a Colpy ✓ — Sesión Iniciada`,
            };
        } catch (err) {
            return { success: false, message: `Error en Autenticación Colpy: ${(err as Error).message}` };
        }
    }

    /* ── Clientes ────────────────────────────── */

    async getClientes(): Promise<ColpyCliente[]> {
        // Example payload for reading clients. This is mock logic for now.
        // E.g., provision service "cliente", operacion "leer_lista"
        try {
            const resp = await this.apiRequest<any>('cliente', 'listar');
            // Assuming response has a list of items inside
            return resp.data || resp.clientes || [];
        } catch (e) {
            console.error("Colpy getClientes error: ", e);
            return [];
        }
    }

    async syncClientesFromColpy(): Promise<{ imported: number; updated: number; errors: string[] }> {
        const colpyClientes = await this.getClientes();
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const cc of colpyClientes) {
            const razonSocial = cc.nombre || `Sin Nombre (ID: ${cc.id})`;
            const cuit = cc.cuit || null;

            try {
                // Check if exists by CUIT or colpy_id
                let orCondition = `colpy_id.eq.${cc.id}`;
                if (cuit) {
                    orCondition += `,cuit.eq.${cuit}`;
                }

                const { data: existing } = await supabase
                    .from('contable_clientes')
                    .select('id, colpy_id')
                    .eq('tenant_id', this.tenantId)
                    .or(orCondition)
                    .maybeSingle();

                const clienteData = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    cuit,
                    email: cc.email || null,
                    telefono: cc.telefono || null,
                    direccion: cc.direccion || null,
                    colpy_id: cc.id,
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

    /* ── Proveedores ────────────────────────────── */

    async getProveedores(): Promise<ColpyProveedor[]> {
        try {
            const resp = await this.apiRequest<any>('proveedor', 'listar');
            return resp.data || resp.proveedores || [];
        } catch (e) {
            console.error("Colpy getProveedores error: ", e);
            return [];
        }
    }

    async syncProveedoresFromColpy(): Promise<{ imported: number; updated: number; errors: string[] }> {
        const colpyProveedores = await this.getProveedores();
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const cp of colpyProveedores) {
            const razonSocial = cp.nombre || `Sin Nombre (ID: ${cp.id})`;
            const cuit = cp.cuit || null;

            try {
                let orCondition = `colpy_id.eq.${cp.id}`;
                if (cuit) {
                    orCondition += `,cuit.eq.${cuit}`;
                }

                const { data: existing } = await supabase
                    .from('contable_proveedores')
                    .select('id, colpy_id')
                    .eq('tenant_id', this.tenantId)
                    .or(orCondition)
                    .maybeSingle();

                const provData = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    cuit,
                    email: cp.email || null,
                    telefono: cp.telefono || null,
                    direccion: cp.direccion || null,
                    colpy_id: cp.id,
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

    /* ── Comprobantes (Inyección a Colpy) ───── */

    async injectComprobante(comprobante: {
        tipo: 'compra' | 'venta';
        tipo_comprobante: string;
        fecha: string;
        numero_comprobante?: string;
        moneda: string;
        tipo_cambio?: number;
        observaciones?: string;
        proveedor_colpy_id?: string;
        cliente_colpy_id?: string;
        lineas: Array<{
            descripcion: string;
            cantidad: number;
            precio_unitario: number;
            iva_porcentaje: number;
        }>;
    }): Promise<{ success: boolean; colpyId?: string; error?: string }> {
        try {
            if (comprobante.tipo === 'venta') {
                if (!comprobante.cliente_colpy_id) {
                    return { success: false, error: 'Cliente no tiene colpy_id. Sincronice clientes primero.' };
                }

                // Factura de Venta payload para Colpy
                const payload = {
                    idCliente: comprobante.cliente_colpy_id,
                    fechaEmision: comprobante.fecha + " 00:00:00",
                    // otros campos mock para Colpy
                    items: comprobante.lineas.map(l => ({
                        nroItem: 1,
                        codigo: "SERVICIO",
                        detalle: l.descripcion,
                        cantidad: l.cantidad,
                        precioUnitario: l.precio_unitario,
                        porcentajeIva: l.iva_porcentaje
                    }))
                };

                const result = await this.apiRequest<any>('facturaVenta', 'crear', payload);
                if (!result || !result.idFactura) {
                     return { success: false, error: 'Error: No se obtuvo ID desde Colpy' };
                }
                return { success: true, colpyId: result.idFactura };

            } else {
                if (!comprobante.proveedor_colpy_id) {
                    return { success: false, error: 'Proveedor no tiene colpy_id. Sincronice proveedores primero.' };
                }

                const payload = {
                    idProveedor: comprobante.proveedor_colpy_id,
                    fechaEmision: comprobante.fecha + " 00:00:00",
                    items: comprobante.lineas.map(l => ({
                        nroItem: 1,
                        codigo: "SERVICIO",
                        detalle: l.descripcion,
                        cantidad: l.cantidad,
                        precioUnitario: l.precio_unitario,
                        porcentajeIva: l.iva_porcentaje
                    }))
                };

                const result = await this.apiRequest<any>('facturaCompra', 'crear', payload);
                if (!result || !result.idFactura) {
                     return { success: false, error: 'Error: No se obtuvo ID desde Colpy' };
                }
                return { success: true, colpyId: result.idFactura };
            }

        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }
}

/* ─── Singleton factory ────────────────────────────── */

const instances = new Map<string, ColpyService>();

/** Get or create ColpyService for a tenant */
export function getColpyService(tenantId: string): ColpyService {
    if (!instances.has(tenantId)) {
        instances.set(tenantId, new ColpyService(tenantId));
    }
    return instances.get(tenantId)!;
}
