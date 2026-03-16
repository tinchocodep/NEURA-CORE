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
    tenant_id: string;
    colpy_username: string | null;
    colpy_password: string | null;
    colpy_empresa_id: string | null;
}

export interface ColpyCliente {
    id?: string;
    idCliente?: string;
    idcliente?: string;
    nombre?: string;
    RazonSocial?: string;
    cuit?: string;
    CUIT?: string;
    email?: string;
    Email?: string;
    telefono?: string;
    Telefono?: string;
    direccion?: string;
    DirPostal?: string;
}

export interface ColpyProveedor {
    id?: string;
    idProveedor?: string;
    idproveedor?: string;
    nombre?: string;
    RazonSocial?: string;
    cuit?: string;
    CUIT?: string;
    email?: string;
    Email?: string;
    telefono?: string;
    Telefono?: string;
    direccion?: string;
    DirPostal?: string;
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
        const { data, error } = await supabase
            .from('contable_config')
            .select('tenant_id, colpy_username, colpy_password, colpy_empresa_id')
            .eq('tenant_id', this.tenantId)
            .single();

        if (error) {
           console.error("Colpy loadConfig Error: ", error);
        }

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
        parametros: Record<string, any> = {},
        rootProps: Record<string, any> = {}
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

        const devUser = "bautistadiaz93@gmail.com";
        const devPass = "BautistaDiaz2004";

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
            "parameters": requestParameters,
            ...rootProps
        };

        let response;
        try {
            response = await fetch(COLPY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error: any) {
            console.error("Colpy fetch network/CORS error:", error);
            throw new Error(`Error de Red/CORS conectando. ¿Instalaste la Edge Function?: ${error.message}`);
        }

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
        try {
            const resp = await this.apiRequest<any>('Cliente', 'listar_cliente', {
                idEmpresa: this.config?.colpy_empresa_id || "",
                start: 0,
                limit: 500,
                filter: [],
                order: [{ field: "RazonSocial", dir: "asc" }]
            });
            return resp.data || resp.clientes || [];
        } catch (e) {
            console.error("Colpy getClientes error: ", e);
            throw e;
        }
    }

    async getProveedores(): Promise<ColpyProveedor[]> {
        try {
            const resp = await this.apiRequest<any>('Proveedor', 'listar_proveedor', {
                idEmpresa: this.config?.colpy_empresa_id || "",
                start: 0,
                limit: 500,
                filter: [],
                order: [{ field: "RazonSocial", dir: "asc" }]
            });
            return resp.data || resp.proveedores || [];
        } catch (e) {
            console.error("Colpy getProveedores error: ", e);
            throw e;
        }
    }

    async getEmpresas(): Promise<{ idEmpresa: string, RazonSocial: string }[]> {
        try {
            const rootProps = {
                filter: [{ field: "IdEmpresa", op: "<>", value: "1" }],
                order: { field: ["IdEmpresa"], order: "asc" }
            };
            const resp = await this.apiRequest<any>('Empresa', 'listar_empresa', { start: 0, limit: 100 }, rootProps);
            console.log("Colppy getEmpresas crudo:", resp);
            return resp.data || [];
        } catch (e) {
            console.error("Colpy getEmpresas error: ", e);
            throw e;
        }
    }

    /**
     * Trae el arbol de cuentas contables de Colppy (necesarias para inyectar comprobantes)
     */
    async getArbolContable() {
        if (!this.config?.colpy_username || !this.config?.colpy_password || !this.config?.colpy_empresa_id) {
            throw new Error("Colppy credentials missing. Call loadConfig() and ensure they are set in DB.");
        }

        try {
            const props = {
                idEmpresa: this.config.colpy_empresa_id
            };
            
            // Utilizamos la operación oficial de Colppy para obtener el árbol de cuentas
            const resp = await this.apiRequest<any>('Contabilidad', 'leer_arbol_contabilidad', props);
            console.log("Colppy getArbolContable crudo:", resp);
            return resp.data || resp.Arbol || resp; 
        } catch (e) {
            console.error("Colpy getArbolContable error: ", e);
            throw e;
        }
    }

    // === MÉTODOS DE SINCRONIZACIÓN Y MUTACIÓN ===
    async syncClientesFromColpy(): Promise<{ imported: number; updated: number; errors: string[] }> {
        console.log("Iniciando descarga de clientes desde Colppy...");
        const colpyClientes = await this.getClientes();
        console.log(`¡Colppy respondió! Se encontraron ${colpyClientes.length} clientes en total.`);
        
        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        // Obtener todos los clientes existentes en 1 consulta
        const { data: existingClients, error: fetchErr } = await supabase
            .from('contable_clientes')
            .select('id, colpy_id, razon_social, cuit')
            .eq('tenant_id', this.tenantId);
            
        if (fetchErr) {
            throw new Error(`Error obteniendo clientes previos: ${fetchErr.message}`);
        }

        const existingByColpyId = new Map(existingClients?.filter(c => c.colpy_id).map(c => [c.colpy_id, c]));
        const existingByRazonSocial = new Map(existingClients?.filter(c => c.razon_social).map(c => [c.razon_social.toLowerCase(), c]));
        const existingByCuit = new Map(existingClients?.filter(c => c.cuit).map(c => [c.cuit, c]));

        console.log("Comenzando el proceso de guardado y actualización de clientes en base de datos...");
        let processed = 0;

        for (const cc of colpyClientes) {
            processed++;
            if (processed % 50 === 0) {
                console.log(`Progreso: Procesados ${processed} de ${colpyClientes.length} clientes... (Importados: ${imported}, Actualizados: ${updated})`);
            }

            const idColppy = cc.id || cc.idCliente || cc.idcliente;
            let razonSocial = cc.RazonSocial || cc.nombre || `Sin Nombre (ID: ${idColppy})`;
            razonSocial = razonSocial.replace(/"/g, '').replace(/'/g, '').trim();
            const cuit = cc.CUIT || cc.cuit || null;

            if (!idColppy) continue;

            try {
                const clienteData = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    cuit,
                    colpy_id: idColppy.toString(),
                };

                let existing = existingByColpyId.get(clienteData.colpy_id) || 
                               existingByRazonSocial.get(razonSocial.toLowerCase()) || 
                               (cuit ? existingByCuit.get(cuit) : undefined);

                if (existing) {
                    const { error } = await supabase.from('contable_clientes').update(clienteData).eq('id', existing.id);
                    if (error) throw new Error(error.message);
                    updated++;
                } else {
                    const { data: inserted, error } = await supabase.from('contable_clientes').insert(clienteData).select('id').single();
                    if (error) throw new Error(error.message);
                    
                    if (inserted) {
                        const newEntry = { id: inserted.id, colpy_id: clienteData.colpy_id, razon_social: razonSocial, cuit };
                        existingByColpyId.set(clienteData.colpy_id, newEntry);
                        existingByRazonSocial.set(razonSocial.toLowerCase(), newEntry);
                        if (cuit) existingByCuit.set(cuit, newEntry);
                    }
                    imported++;
                }
            } catch (err) {
                console.error("Error importando cliente colppy: ", cc, err);
                errors.push(`Cliente "${razonSocial}": ${(err as Error).message}`);
            }
        }

        return { imported, updated, errors };
    }

    /* ── Proveedores ────────────────────────────── */

    async syncProveedoresFromColpy(): Promise<{ imported: number; updated: number; errors: string[] }> {
        console.log("Iniciando descarga de proveedores desde Colppy...");
        const colpyProveedores = await this.getProveedores();
        console.log(`¡Colppy respondió! Se encontraron ${colpyProveedores.length} proveedores en total.`);

        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        // Obtener todos los proveedores existentes en 1 consulta
        const { data: existingProvs, error: fetchErr } = await supabase
            .from('contable_proveedores')
            .select('id, colpy_id, razon_social, cuit')
            .eq('tenant_id', this.tenantId);
            
        if (fetchErr) {
            throw new Error(`Error obteniendo proveedores previos: ${fetchErr.message}`);
        }

        const existingByColpyId = new Map(existingProvs?.filter(p => p.colpy_id).map(p => [p.colpy_id, p]));
        const existingByRazonSocial = new Map(existingProvs?.filter(p => p.razon_social).map(p => [p.razon_social.toLowerCase(), p]));
        const existingByCuit = new Map(existingProvs?.filter(p => p.cuit).map(p => [p.cuit, p]));

        console.log("Comenzando el proceso de guardado y actualización de proveedores en base de datos...");
        let processed = 0;

        for (const cp of colpyProveedores) {
            processed++;
            if (processed % 50 === 0) {
                console.log(`Progreso: Procesados ${processed} de ${colpyProveedores.length} proveedores... (Importados: ${imported}, Actualizados: ${updated})`);
            }

            const idColppy = cp.id || cp.idProveedor || cp.idproveedor;
            let razonSocial = cp.RazonSocial || cp.nombre || `Sin Nombre (ID: ${idColppy})`;
            razonSocial = razonSocial.replace(/"/g, '').replace(/'/g, '').trim();
            const cuit = cp.CUIT || cp.cuit || null;

            if (!idColppy) continue;

            try {
                const provData = {
                    tenant_id: this.tenantId,
                    razon_social: razonSocial,
                    cuit,
                    colpy_id: idColppy.toString(),
                };

                let existing = existingByColpyId.get(provData.colpy_id) || 
                               existingByRazonSocial.get(razonSocial.toLowerCase()) || 
                               (cuit ? existingByCuit.get(cuit) : undefined);

                if (existing) {
                    const { error } = await supabase.from('contable_proveedores').update(provData).eq('id', existing.id);
                    if (error) throw new Error(error.message);
                    updated++;
                } else {
                    const { data: inserted, error } = await supabase.from('contable_proveedores').insert(provData).select('id').single();
                    if (error) throw new Error(error.message);
                    
                    if (inserted) {
                        const newEntry = { id: inserted.id, colpy_id: provData.colpy_id, razon_social: razonSocial, cuit };
                        existingByColpyId.set(provData.colpy_id, newEntry);
                        existingByRazonSocial.set(razonSocial.toLowerCase(), newEntry);
                        if (cuit) existingByCuit.set(cuit, newEntry);
                    }
                    imported++;
                }
            } catch (err) {
                console.error("Error importando proveedor colppy: ", cp, err);
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
            colpy_cuenta_id?: string;
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
                        porcentajeIva: l.iva_porcentaje,
                        idPlanCuenta: l.colpy_cuenta_id || ""
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
                        porcentajeIva: l.iva_porcentaje,
                        idPlanCuenta: l.colpy_cuenta_id || ""
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
