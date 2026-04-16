import { useState, useEffect, useRef } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { Search, RefreshCw, X, Upload, CheckCircle, Send, Download, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { useComprobantes } from '../contable/Comprobantes/useComprobantes';
import ComprobantesGrid from '../contable/Comprobantes/ComprobantesGrid';
import { getColpyService } from '../../services/ColpyService';

export default function Comprobantes() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortCol, setSortCol] = useState<string | null>('fecha');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [hasErp, setHasErp] = useState(false);
    const [hasColppy, setHasColppy] = useState(false);
    const [hasXubio, setHasXubio] = useState(false);
    const [hasArca, setHasArca] = useState(false);
    const [arcaConfig, setArcaConfig] = useState<{ arca_cuit: string; arca_username: string; arca_password: string; punto_venta: number | null } | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncDesde, setSyncDesde] = useState('');
    const [syncHasta, setSyncHasta] = useState('');
    const [syncSource, setSyncSource] = useState<'colppy' | 'xubio' | 'arca' | ''>('');
    const [showErpPicker, setShowErpPicker] = useState<'sync' | 'inject' | ''>('');
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [empresaCuit, setEmpresaCuit] = useState<string | null>(null);
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load empresa CUIT
    useEffect(() => {
        if (!tenant?.id) return;
        const cuit = (tenant as any).cuit;
        if (cuit) { setEmpresaCuit(cuit); return; }
        supabase.from('contable_config').select('arca_cuit').eq('tenant_id', tenant.id).maybeSingle()
            .then(({ data }) => { if (data?.arca_cuit) setEmpresaCuit(data.arca_cuit); });
    }, [tenant?.id]);

    const handleUploadFiles = async (files: File[]) => {
        if (files.length === 0 || !tenant?.id) return;
        setUploading(true);
        const N8N_WEBHOOK = '/api/n8n-comprobantes';
        let ok = 0, fail = 0;
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('data', file);
                formData.append('filename', file.name);
                formData.append('tenant_id', tenant.id);
                if (empresaCuit) formData.append('cuit_empresa', empresaCuit);
                const resp = await fetch(N8N_WEBHOOK, { method: 'POST', body: formData });
                if (resp.ok) { ok++; } else { fail++; }
            } catch { fail++; }
        }
        setUploading(false);
        if (ok > 0) {
            addToast('success', 'Cargados', `${ok} comprobante(s) enviados al OCR`);
            setTimeout(() => reset(), 3000);
        }
        if (fail > 0) addToast('error', 'Error', `${fail} archivo(s) fallaron`);
    };

    // Check ERP + ARCA config
    useEffect(() => {
        if (!tenant?.id) return;
        supabase.from('contable_config')
            .select('colpy_username, colpy_password, colpy_empresa_id, xubio_client_id, xubio_client_secret, arca_cuit, arca_username, arca_password, punto_venta, erp_type')
            .eq('tenant_id', tenant.id).maybeSingle()
            .then(({ data }) => {
                if (!data) { setHasErp(false); return; }
                const modules = (tenant.enabled_modules as string[]) || [];
                const erpType = (data as any).erp_type || null;
                const hasColpyCreds = !!(data.colpy_username && data.colpy_password && data.colpy_empresa_id);
                const hasXubioCreds = !!(data.xubio_client_id && data.xubio_client_secret);
                // Solo habilitamos el ERP que coincide con erp_type del tenant.
                // Fallback: si no hay erp_type seteado, usamos el module + credenciales.
                const colppyOk = modules.includes('erp_colppy') && hasColpyCreds && (!erpType || erpType === 'colppy');
                const xubioOk = modules.includes('erp_xubio') && hasXubioCreds && (!erpType || erpType === 'xubio');
                const arcaOk = !!(data.arca_cuit && data.arca_username && data.arca_password);
                setHasColppy(colppyOk);
                setHasXubio(xubioOk);
                setHasArca(arcaOk);
                if (arcaOk) setArcaConfig({ arca_cuit: data.arca_cuit!, arca_username: data.arca_username!, arca_password: data.arca_password!, punto_venta: data.punto_venta ?? null });
                setHasErp(colppyOk || xubioOk || arcaOk);
            });
    }, [tenant?.id]);

    const [pageSize, setPageSize] = useState(25);

    const {
        data: comprobantes,
        isLoading: loading,
        totalCount,
        hasMore,
        currentPage,
        totalPages,
        goToPage,
        updateEstado,
        eliminarComprobante,
        reset
    } = useComprobantes({
        tipo: tipoFilter,
        estado: statusFilter,
        busqueda: searchTerm,
        fechaDesde: '',
        fechaHasta: '',
        sortCol,
        sortDir,
        pageSize
    });

    useEffect(() => {
        reset();
        setSelectedIds(new Set());
    }, [tenant?.id, statusFilter, searchTerm, tipoFilter, pageSize, sortCol, sortDir]);

    // ── Sync from Xubio ──
    const handleSyncXubio = async () => {
        if (!tenant) return;
        setShowSyncModal(false);
        setSyncing(true);
        addToast('info', 'Sincronización', `Conectando con Xubio (${syncDesde || 'Histórico'} - ${syncHasta || 'Hoy'})...`);
        try {
            const { getXubioService } = await import('../../services/XubioService');
            const xubio = getXubioService(tenant.id);
            await xubio.loadConfig();
            if (!xubio.isConfigured) {
                addToast('error', 'Error', 'Xubio no está configurado. Ve a Configuración.');
                setSyncing(false);
                return;
            }
            const result = await xubio.syncComprobantes(syncDesde || undefined, syncHasta || undefined, (msg) => console.log('[Xubio sync]', msg));
            if (result.imported === 0 && result.updated === 0) {
                addToast('info', 'Al Día', 'No se encontraron comprobantes nuevos en Xubio.');
            } else {
                addToast('success', 'Completado', `Xubio: ${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} errores` : ''}`);
            }
            reset();
        } catch (e: any) {
            addToast('error', 'Error Xubio', e.message);
        } finally {
            setSyncing(false);
        }
    };

    // ── Sync from Colppy ──
    const handleSync = async () => {
        if (!tenant) return;
        setShowSyncModal(false);
        setSyncing(true);
        addToast('info', 'Sincronización', 'Conectando con Colppy...');

        try {
            const colpy = getColpyService(tenant.id);
            colpy.resetAbort();
            await colpy.loadConfig();
            if (!colpy.isConfigured) {
                addToast('error', 'Error', 'Colppy no está configurado. Ve a Configuración.');
                setSyncing(false);
                return;
            }

            let effectiveDesde = syncDesde;
            if (!effectiveDesde) {
                const { data: lastInvoice } = await supabase
                    .from('contable_comprobantes').select('fecha')
                    .eq('tenant_id', tenant.id).eq('source', 'colpy')
                    .order('fecha', { ascending: false }).limit(1).maybeSingle();
                if (lastInvoice?.fecha) {
                    const d = new Date(lastInvoice.fecha + 'T12:00:00Z');
                    d.setDate(d.getDate() - 15);
                    effectiveDesde = d.toISOString().split('T')[0];
                } else {
                    effectiveDesde = '2023-01-01';
                }
            }

            const ventas = await colpy.getFacturasVenta(effectiveDesde, syncHasta);
            const compras = await colpy.getFacturasCompra(effectiveDesde, syncHasta);
            const todos = [...ventas.map((v: any) => ({ ...v, _tipo: 'venta' })), ...compras.map((c: any) => ({ ...c, _tipo: 'compra' }))];

            const { data: clientes } = await supabase.from('contable_clientes').select('id, colpy_id').eq('tenant_id', tenant.id).not('colpy_id', 'is', null);
            const { data: proveedores } = await supabase.from('contable_proveedores').select('id, colpy_id').eq('tenant_id', tenant.id).not('colpy_id', 'is', null);
            const mapClientes = new Map(clientes?.map((c: any) => [c.colpy_id, c.id]));
            const mapProveedores = new Map(proveedores?.map((p: any) => [p.colpy_id, p.id]));

            let importados = 0;
            for (const c of todos) {
                const nroFull = `${c.nroFactura1 || ''}-${c.nroFactura2 || ''}`;
                const { data: exists } = await supabase.from('contable_comprobantes')
                    .select('id').eq('tenant_id', tenant.id).eq('numero_comprobante', nroFull).eq('source', 'colpy').limit(1);
                if (exists && exists.length > 0) continue;

                const tipoComp = (c as any)._tipo;
                const record: any = {
                    tenant_id: tenant.id,
                    tipo: tipoComp,
                    fecha: c.fechaFactura ? c.fechaFactura.split(' ')[0] : null,
                    numero_comprobante: nroFull,
                    tipo_comprobante: `Factura ${c.idTipoFactura || 'A'}`,
                    moneda: 'ARS',
                    monto_original: parseFloat(c.totalFactura || '0'),
                    monto_ars: parseFloat(c.totalFactura || '0'),
                    estado: 'clasificado',
                    source: 'colpy',
                    colpy_id: c.idFactura,
                    descripcion: c.descripcion || '',
                    neto_gravado: parseFloat(c.netoGravado || '0'),
                    total_iva: parseFloat(c.totalIVA || '0'),
                };
                if (tipoComp === 'venta' && c.idCliente) record.cliente_id = mapClientes.get(String(c.idCliente)) || null;
                if (tipoComp === 'compra' && c.idProveedor) record.proveedor_id = mapProveedores.get(String(c.idProveedor)) || null;

                await supabase.from('contable_comprobantes').insert(record);
                importados++;
            }

            addToast('success', 'Sincronización completada', `${importados} comprobantes importados de Colppy`);
            reset();
        } catch (err: any) {
            addToast('error', 'Error de sincronización', err.message || 'Error desconocido');
        }
        setSyncing(false);
    };

    const AFIPSDK_API_KEY = '3zZiVxOJP4zPQbK5mEc6FXQOa34hOPAPTSu3bl2S51LewxPc15xUb63Dm43s4BiL';
    const TIPOS_COMPROBANTE_AFIP: Record<string, string> = {
        '1': 'Factura A', '2': 'Nota de Débito A', '3': 'Nota de Crédito A',
        '6': 'Factura B', '7': 'Nota de Débito B', '8': 'Nota de Crédito B',
        '11': 'Factura C', '12': 'Nota de Débito C', '13': 'Nota de Crédito C',
        '51': 'Factura M', '201': 'Factura de Crédito Electrónica A',
    };
    function parseAFIPNumber(s: string): number {
        return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }

    async function executeAfipAutomation(params: Record<string, any>): Promise<any[]> {
        // Step 1: Create automation
        const createRes = await fetch('/api/afipsdk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFIPSDK_API_KEY}` },
            body: JSON.stringify({ automation: 'mis-comprobantes', params }),
        });
        if (!createRes.ok) {
            const err = await createRes.text();
            throw new Error(`AFIP SDK error: ${err}`);
        }
        const created = await createRes.json();
        const automationId = created.id;
        if (!automationId) throw new Error('AFIP SDK no devolvió ID de automatización');

        // Step 2: Poll until complete
        for (let i = 0; i < 60; i++) { // max 5 min
            await new Promise(r => setTimeout(r, 5000));
            const pollRes = await fetch(`/api/afipsdk/${automationId}`, {
                headers: { 'Authorization': `Bearer ${AFIPSDK_API_KEY}` },
            });
            if (!pollRes.ok) continue;
            const result = await pollRes.json();
            if (result.status === 'in_process') continue;
            if (result.status === 'complete' && Array.isArray(result.data)) return result.data;
            if (result.status === 'error') throw new Error(result.message || 'Error en automatización AFIP');
            return result.data || [];
        }
        throw new Error('Timeout esperando respuesta de AFIP SDK');
    }

    const handleSyncArca = async () => {
        if (!tenant || !arcaConfig) return;
        setShowSyncModal(false);
        setSyncing(true);
        addToast('info', 'Sincronización', 'Conectando con ARCA (AFIP SDK)... esto puede tardar unos minutos.');

        try {
            const fechaDesdeStr = syncDesde || (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; })();
            const fechaHastaStr = syncHasta || new Date().toISOString().split('T')[0];
            const fromDate = fechaDesdeStr.split('-').reverse().join('/');
            const toDate = fechaHastaStr.split('-').reverse().join('/');

            const cuitEmpresa = arcaConfig.arca_cuit.replace(/-/g, '');

            // Pre-cargar proveedores y clientes del tenant para matchear por CUIT
            const cleanCuit = (s: string | null | undefined) => (s || '').replace(/[-\s]/g, '').trim();
            const [{ data: provsData }, { data: clisData }] = await Promise.all([
                supabase.from('contable_proveedores')
                    .select('id, cuit, categoria_default_id, centro_costo_default_id')
                    .eq('tenant_id', tenant.id),
                supabase.from('contable_clientes')
                    .select('id, cuit')
                    .eq('tenant_id', tenant.id),
            ]);
            const proveedoresMap = new Map<string, { id: string; categoria_default_id: string | null; centro_costo_default_id: string | null }>();
            for (const p of (provsData || []) as any[]) {
                const c = cleanCuit(p.cuit);
                if (c) proveedoresMap.set(c, { id: p.id, categoria_default_id: p.categoria_default_id, centro_costo_default_id: p.centro_costo_default_id });
            }
            const clientesMap = new Map<string, { id: string }>();
            for (const c of (clisData || []) as any[]) {
                const cu = cleanCuit(c.cuit);
                if (cu) clientesMap.set(cu, { id: c.id });
            }

            let importados = 0;
            let proveedoresCreados = 0;
            let clientesCreados = 0;

            for (const tipoConsulta of ['E', 'R'] as const) {
                const data = await executeAfipAutomation({
                    cuit: cuitEmpresa,
                    username: arcaConfig.arca_username.replace(/-/g, ''),
                    password: arcaConfig.arca_password,
                    filters: {
                        t: tipoConsulta,
                        fechaEmision: `${fromDate} - ${toDate}`,
                    },
                });

                if (!Array.isArray(data) || data.length === 0) continue;

                const isVenta = tipoConsulta === 'E';

                for (const r of data) {
                    const pv = (r['Punto de Venta'] || '').padStart(5, '0');
                    const numDesde = (r['Número Desde'] || '').padStart(8, '0');
                    const nroComprobante = `${pv}-${numDesde}`;
                    const tipoComp = r['Tipo de Comprobante'] || '';
                    const tipoNombre = TIPOS_COMPROBANTE_AFIP[tipoComp] || `Tipo ${tipoComp}`;
                    const fechaRaw = r['Fecha de Emisión'] || '';
                    let fecha = fechaRaw;
                    if (fechaRaw.includes('/')) {
                        const [dd, mm, yyyy] = fechaRaw.split('/');
                        fecha = `${yyyy}-${mm}-${dd}`;
                    }

                    const total = parseAFIPNumber(r['Imp. Total'] || '0');
                    // AFIP SDK puede devolver "Imp. Neto Gravado" o "Imp. Neto Gravado Total" (cuando hay alícuotas múltiples)
                    const netoGravado = parseAFIPNumber(r['Imp. Neto Gravado Total'] || r['Imp. Neto Gravado'] || '0');
                    const netoNoGravado = parseAFIPNumber(r['Imp. Neto No Gravado'] || '0');
                    // AFIP SDK puede devolver "IVA" o "Total IVA" (cuando hay alícuotas múltiples)
                    const iva = parseAFIPNumber(r['Total IVA'] || r['IVA'] || '0');
                    const otrosTributos = parseAFIPNumber(r['Otros Tributos'] || '0');
                    const codAutorizacion = r['Cód. Autorización'] || '';
                    const monedaRaw = r['Moneda'] || 'PES';
                    const moneda = (monedaRaw === 'PES' || monedaRaw === '$') ? 'ARS' : monedaRaw === 'DOL' ? 'USD' : monedaRaw;

                    // ── Datos del receptor (siempre vienen) ──
                    const nroDocReceptor = r['Nro. Doc. Receptor'] || '';
                    const denomReceptor = r['Denominación Receptor'] || '';
                    // ── Datos del emisor (vienen en compras, NO en ventas) ──
                    const nroDocEmisor = r['Nro. Doc. Emisor'] || '';
                    const denomEmisor = r['Denominación Emisor'] || '';

                    // En ventas: emisor = AFG, receptor = cliente
                    // En compras: emisor = proveedor, receptor = AFG
                    const cuitContraparte = isVenta ? nroDocReceptor : nroDocEmisor;
                    const denomContraparte = isVenta ? denomReceptor : denomEmisor;
                    const cuitContraparteClean = cleanCuit(cuitContraparte);

                    const { data: existe } = await supabase
                        .from('contable_comprobantes')
                        .select('id')
                        .eq('tenant_id', tenant.id)
                        .eq('numero_comprobante', nroComprobante)
                        .eq('tipo_comprobante', tipoNombre)
                        .eq('tipo', isVenta ? 'venta' : 'compra')
                        .maybeSingle();

                    if (!existe) {
                        // ── Resolver/crear proveedor o cliente y aplicar defaults ──
                        let proveedorId: string | null = null;
                        let clienteId: string | null = null;
                        let categoriaIdDefault: string | null = null;
                        let proyectoIdDefault: string | null = null;

                        if (cuitContraparteClean && denomContraparte) {
                            if (isVenta) {
                                let cli = clientesMap.get(cuitContraparteClean);
                                if (!cli) {
                                    const { data: nuevo } = await supabase
                                        .from('contable_clientes')
                                        .upsert({
                                            tenant_id: tenant.id,
                                            razon_social: denomContraparte,
                                            cuit: cuitContraparteClean,
                                            activo: true,
                                        }, { onConflict: 'tenant_id,cuit' })
                                        .select('id')
                                        .single();
                                    if (nuevo) {
                                        cli = { id: nuevo.id };
                                        clientesMap.set(cuitContraparteClean, cli);
                                        clientesCreados++;
                                    }
                                }
                                if (cli) clienteId = cli.id;
                            } else {
                                let prov = proveedoresMap.get(cuitContraparteClean);
                                if (!prov) {
                                    const { data: nuevo } = await supabase
                                        .from('contable_proveedores')
                                        .upsert({
                                            tenant_id: tenant.id,
                                            razon_social: denomContraparte,
                                            cuit: cuitContraparteClean,
                                            activo: true,
                                            es_caso_rojo: false,
                                            es_favorito: false,
                                        }, { onConflict: 'tenant_id,cuit' })
                                        .select('id, categoria_default_id, centro_costo_default_id')
                                        .single();
                                    if (nuevo) {
                                        prov = {
                                            id: nuevo.id,
                                            categoria_default_id: nuevo.categoria_default_id,
                                            centro_costo_default_id: nuevo.centro_costo_default_id,
                                        };
                                        proveedoresMap.set(cuitContraparteClean, prov);
                                        proveedoresCreados++;
                                    }
                                }
                                if (prov) {
                                    proveedorId = prov.id;
                                    categoriaIdDefault = prov.categoria_default_id;
                                    proyectoIdDefault = prov.centro_costo_default_id;
                                }
                            }
                        }

                        const { error } = await supabase.from('contable_comprobantes').insert({
                            tenant_id: tenant.id,
                            tipo: isVenta ? 'venta' : 'compra',
                            tipo_comprobante: tipoNombre,
                            numero_comprobante: nroComprobante,
                            fecha,
                            monto_original: total,
                            monto_ars: total,
                            moneda,
                            neto_gravado: netoGravado,
                            neto_no_gravado: netoNoGravado,
                            total_iva: iva,
                            estado: 'aprobado',
                            source: 'arca',
                            origen: 'arca',
                            // En ventas: receptor = cliente real (de AFIP), emisor = AFG
                            // En compras: receptor = AFG, emisor = proveedor real (de AFIP)
                            cuit_receptor: isVenta ? nroDocReceptor : cuitEmpresa,
                            cuit_emisor: isVenta ? cuitEmpresa : nroDocEmisor,
                            descripcion: `${denomContraparte}${codAutorizacion ? ` | CAE: ${codAutorizacion}` : ''}${otrosTributos ? ` | Otros tributos: ${otrosTributos}` : ''}`,
                            // Vinculación + defaults
                            proveedor_id: proveedorId,
                            cliente_id: clienteId,
                            categoria_id: categoriaIdDefault,
                            proyecto_id: proyectoIdDefault,
                        });
                        if (error) console.error('[ARCA sync] Insert error:', error);
                        else importados++;
                    }
                }
            }

            if (importados === 0) {
                addToast('info', 'Al Día', 'No se encontraron comprobantes nuevos en ARCA.');
            } else {
                const extras: string[] = [];
                if (proveedoresCreados > 0) extras.push(`${proveedoresCreados} proveedor(es) nuevo(s)`);
                if (clientesCreados > 0) extras.push(`${clientesCreados} cliente(s) nuevo(s)`);
                const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
                addToast('success', 'Completado', `Importados ${importados} comprobantes desde ARCA${suffix}.`);
            }
            reset();
        } catch (e: any) {
            addToast('error', 'Error ARCA', e.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleAction = async (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => {
        console.log('[Comprobantes] handleAction called:', action, id, 'hasErp:', hasErp);
        try {
            if (action === 'aprobar') {
                await updateEstado(id, 'aprobado');
            } else if (action === 'rechazar') {
                await updateEstado(id, 'rechazado');
            } else if (action === 'eliminar') {
                await eliminarComprobante(id);
            } else if (action === 'inyectar') {
                if (!hasErp) {
                    addToast('error', 'Sin ERP', 'No hay ERP configurado. Activalo en Configuración.');
                    return;
                }
                if (hasColppy && hasXubio) {
                    console.log('[Comprobantes] Both ERPs detected, showing prompt');
                    const choice = window.prompt('¿A qué ERP inyectar?\n\nEscribí "colppy" o "xubio":', 'colppy');
                    console.log('[Comprobantes] User chose:', choice);
                    if (!choice) return;
                    const src = choice.toLowerCase().includes('xubio') ? 'xubio' : 'colppy';
                    console.log('[Comprobantes] Injecting to:', src, 'id:', id);
                    await executeErpInjection(id, src as 'colppy' | 'xubio');
                    return;
                }
                console.log('[Comprobantes] Single ERP, injecting to:', hasColppy ? 'colppy' : 'xubio');
                await executeErpInjection(id, hasColppy ? 'colppy' : 'xubio');
            }
        } catch (error) {
            console.error('Error in action:', error);
        }
    };

    const executeErpInjection = async (id: string, source: 'colppy' | 'xubio' = 'colppy') => {
        console.log('[ERP] executeErpInjection called:', id, source);
        const comp = comprobantes.find((c: any) => c.id === id);
        if (!comp) { console.log('[ERP] comp not found!'); return; }
        console.log('[ERP] comp:', comp.numero_comprobante, 'proveedor xubio_id:', comp.proveedor?.xubio_id);

        try {
            if (source === 'xubio') {
                console.log('[ERP] Loading XubioService...');
                const { getXubioService } = await import('../../services/XubioService');
                const xubio = getXubioService(tenant!.id);
                await xubio.loadConfig();
                console.log('[ERP] Xubio loaded, isConfigured:', xubio.isConfigured);
                if (!xubio.isConfigured) { addToast('error', 'Error', 'Xubio no está configurado.'); return; }

                console.log('[ERP] Calling xubio.injectComprobante...');
                const result = await xubio.injectComprobante({
                    tipo: comp.tipo,
                    tipo_comprobante: comp.tipo_comprobante || 'Factura A',
                    fecha: comp.fecha,
                    numero_comprobante: comp.numero_comprobante,
                    moneda: comp.moneda || 'ARS',
                    tipo_cambio: comp.tipo_cambio || undefined,
                    proveedor_xubio_id: comp.proveedor?.xubio_id ? Number(comp.proveedor.xubio_id) : undefined,
                    cliente_xubio_id: (comp.cliente as any)?.xubio_id ? Number((comp.cliente as any).xubio_id) : undefined,
                    lineas: [{
                        descripcion: `Comprobante ${comp.numero_comprobante || ''}`.trim(),
                        cantidad: 1,
                        precio_unitario: Number(comp.neto_gravado || (comp.monto_original || comp.monto_ars || 0) / 1.21),
                        iva_porcentaje: 21,
                    }],
                });
                console.log('[ERP] Xubio inject result:', result);
                if (result.success) {
                    await supabase.from('contable_comprobantes').update({
                        estado: 'inyectado', xubio_id: String(result.xubioId), xubio_synced_at: new Date().toISOString(),
                    }).eq('id', id);
                    addToast('success', 'Inyectado', `Comprobante inyectado a Xubio (ID: ${result.xubioId})`);
                    reset();
                } else {
                    addToast('error', 'Error Xubio', result.error || 'Error al inyectar');
                }
                return;
            }

            // Colppy
            const colpy = getColpyService(tenant!.id);
            try {
                await colpy.loadConfig();
                if (!colpy.isConfigured) { addToast('error', 'Error', 'Colppy no está configurado.'); return; }
            } catch (initErr: any) {
                addToast('error', 'Error Colppy', initErr.message || 'No se pudo conectar');
                return;
            }

            console.log('[Comprobantes] Calling injectComprobante with:', {
                tipo: comp.tipo, tipo_comprobante: comp.tipo_comprobante,
                fecha: comp.fecha, numero_comprobante: comp.numero_comprobante,
                proveedor_colpy_id: comp.proveedor?.colpy_id,
                monto: comp.monto_original || comp.monto_ars,
            });
            const result = await colpy.injectComprobante({
                tipo: comp.tipo,
                tipo_comprobante: comp.tipo_comprobante || 'Factura A',
                fecha: comp.fecha,
                numero_comprobante: comp.numero_comprobante,
                moneda: comp.moneda || 'ARS',
                tipo_cambio: comp.tipo_cambio || undefined,
                proveedor_colpy_id: comp.proveedor?.colpy_id || undefined,
                cliente_colpy_id: (comp.cliente as any)?.colpy_id || undefined,
                monto: comp.monto_original || comp.monto_ars || undefined,
                neto_gravado: comp.neto_gravado || undefined,
                neto_no_gravado: comp.neto_no_gravado || undefined,
                total_iva: comp.total_iva || undefined,
                percepciones_iibb: comp.percepciones_iibb || undefined,
                percepciones_iva: comp.percepciones_iva || undefined,
                fecha_vencimiento: comp.fecha_vencimiento || undefined,
                lineas: [{
                    descripcion: `Comprobante ${comp.numero_comprobante || ''}`.trim(),
                    cantidad: 1,
                    precio_unitario: Number(comp.neto_gravado || (comp.monto_original || comp.monto_ars || 0) / 1.21),
                    iva_porcentaje: 21,
                    colpy_cuenta_id: 'Gastos Varios'
                }],
            });

            console.log('[Comprobantes] injectComprobante result:', result);
            if (result.success) {
                await supabase.from('contable_comprobantes').update({
                    estado: 'inyectado',
                    colpy_id: result.colpyId,
                    colpy_synced_at: new Date().toISOString(),
                }).eq('id', id);
                addToast('success', 'Inyectado', `Comprobante inyectado a Colppy (ID: ${result.colpyId})`);
                reset();
            } else {
                addToast('error', 'Error', result.error || 'Error al inyectar');
            }
        } catch (err: any) {
            addToast('error', 'Error', err.message || 'Error al inyectar');
        }
    };

    return (
        <div>
            {previewUrl && (
                <div className="wizard-overlay" onClick={() => setPreviewUrl(null)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: 900, height: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="wizard-header">
                            <h3>Visualizando Comprobante</h3>
                            <button className="wizard-close" onClick={() => setPreviewUrl(null)}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--color-bg-surface-2)' }}>
                            <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }} title="documento" />
                        </div>
                    </div>
                </div>
            )}

            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Comprobantes</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                    <label className="btn btn-primary" style={{ fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Upload size={14} /> {uploading ? 'Subiendo...' : 'Cargar factura'}
                        <input type="file" accept="image/*,.pdf" multiple hidden ref={fileInputRef}
                            onChange={e => { if (e.target.files) handleUploadFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                    </label>
                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}
                        onClick={async () => {
                            if (!tenant?.id) return;
                            const ok = window.confirm('¿Eliminar TODOS los comprobantes? Esta acción no se puede deshacer.');
                            if (!ok) return;
                            const ok2 = window.confirm('¿Estás seguro? Se borrarán TODOS los comprobantes del tenant.');
                            if (!ok2) return;
                            const { error } = await supabase.from('contable_comprobantes').delete().eq('tenant_id', tenant.id);
                            if (error) addToast('error', 'Error', error.message);
                            else { addToast('success', 'Eliminados', 'Todos los comprobantes fueron eliminados'); reset(); }
                        }}>
                        Eliminar todos
                    </button>
                    {hasErp && (
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-ghost" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={() => {
                                    const sources = [hasArca && 'arca', hasColppy && 'colppy', hasXubio && 'xubio'].filter(Boolean) as string[];
                                    if (sources.length === 1) { setSyncSource(sources[0] as any); setShowSyncModal(true); }
                                    else setShowErpPicker(showErpPicker === 'sync' ? '' : 'sync');
                                }} disabled={syncing}>
                                <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                                {syncing ? 'Sincronizando...' : 'Sincronizar'}
                            </button>
                            {showErpPicker === 'sync' && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
                                    {hasArca && <button onClick={() => { setShowErpPicker(''); setSyncSource('arca'); setShowSyncModal(true); }}
                                        style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde ARCA (AFIP)
                                    </button>}
                                    {hasColppy && <button onClick={() => { setShowErpPicker(''); setSyncSource('colppy'); setShowSyncModal(true); }}
                                        style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Colppy
                                    </button>}
                                    {hasXubio && <button onClick={() => { setShowErpPicker(''); setSyncSource('xubio'); setShowSyncModal(true); }}
                                        style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Xubio
                                    </button>}
                                </div>
                            )}
                        </div>
                    )}
                    <select
                        className="form-input"
                        value={tipoFilter}
                        onChange={(e) => setTipoFilter(e.target.value)}
                        style={{ height: 34, fontSize: '0.8rem', minWidth: 100 }}
                    >
                        <option value="">Compra y Venta</option>
                        <option value="compra">Compra</option>
                        <option value="venta">Venta</option>
                    </select>
                    <select
                        className="form-input"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ height: 34, fontSize: '0.8rem' }}
                    >
                        <option value="">Todos</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="clasificado">Clasificado</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="inyectado">Inyectado</option>
                    </select>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="form-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: 30, height: 34, fontSize: '0.8rem', minWidth: 200 }}
                        />
                    </div>
                </div>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUploadFiles(Array.from(e.dataTransfer.files)); }}
                style={{ border: `2px dashed ${dragOver ? 'var(--brand)' : 'transparent'}`, borderRadius: 12, padding: dragOver ? 24 : 0, marginBottom: 8, textAlign: 'center', transition: 'all 0.2s', background: dragOver ? 'var(--color-accent-subtle)' : 'transparent' }}
            >
                {dragOver && <p style={{ color: 'var(--brand)', fontWeight: 600, margin: 0 }}>Soltá los archivos acá para cargarlos</p>}
            </div>

            {hasErp && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, background: '#6366F110', borderRadius: 8, border: '1px solid #6366F130', fontSize: '0.75rem' }}>
                    <span style={{ color: '#6366F1', fontWeight: 600 }}>ERP conectado</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>— Los comprobantes aprobados se pueden inyectar</span>
                </div>
            )}

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 1rem', marginBottom: '0.75rem',
                    background: 'var(--color-accent-subtle)', border: '1px solid var(--brand)',
                    borderRadius: 'var(--radius-lg)',
                    animation: 'fadeIn 0.15s ease',
                }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--brand)' }}>
                        {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                        className="btn btn-sm"
                        style={{ background: 'var(--color-success)', color: '#fff', gap: 4 }}
                        disabled={bulkProcessing}
                        onClick={async () => {
                            setBulkProcessing(true);
                            for (const id of selectedIds) await handleAction(id, 'aprobar');
                            setSelectedIds(new Set());
                            setBulkProcessing(false);
                            reset();
                        }}
                    >
                        <CheckCircle size={13} /> Aprobar
                    </button>
                    {hasErp && (
                        <button
                            className="btn btn-sm btn-primary"
                            style={{ gap: 4 }}
                            disabled={bulkProcessing}
                            onClick={async () => {
                                const selected = comprobantes.filter(c => selectedIds.has(c.id));
                                const injectable = selected.filter(c => c.estado === 'aprobado' && c.source !== 'colpy' && c.source !== 'xubio');
                                if (injectable.length === 0) {
                                    addToast('error', 'Sin comprobantes', 'Solo se pueden inyectar comprobantes aprobados y cargados desde NeuraCore');
                                    return;
                                }
                                setBulkProcessing(true);
                                for (const c of injectable) await handleAction(c.id, 'inyectar');
                                setSelectedIds(new Set());
                                setBulkProcessing(false);
                                reset();
                            }}
                        >
                            <Send size={13} /> Inyectar ({(() => { const n = comprobantes.filter(c => selectedIds.has(c.id) && c.estado === 'aprobado' && c.source !== 'colpy' && c.source !== 'xubio').length; return n; })()})
                        </button>
                    )}
                    <button
                        className="btn btn-sm"
                        style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', gap: 4 }}
                        disabled={bulkProcessing}
                        onClick={() => {
                            const selected = comprobantes.filter(c => selectedIds.has(c.id));
                            if (selected.length === 0) return;
                            const headers = ['Fecha', 'Tipo', 'N° Comprobante', 'Entidad', 'CUIT', 'Moneda', 'Monto', 'Estado'];
                            const rows = selected.map(c => [
                                c.fecha,
                                c.tipo_comprobante || c.tipo,
                                c.numero_comprobante || '',
                                (c.proveedor as any)?.razon_social || (c.cliente as any)?.razon_social || '',
                                c.cuit_emisor || '',
                                c.moneda || 'ARS',
                                Number(c.monto_ars || c.monto_original || 0),
                                c.estado,
                            ]);
                            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                            ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 7 }, { wch: 16 }, { wch: 12 }];
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, 'Seleccionados');
                            XLSX.writeFile(wb, `Comprobantes_seleccionados_${new Date().toISOString().split('T')[0]}.xlsx`);
                        }}
                    >
                        <Download size={13} /> Exportar
                    </button>
                    <button
                        className="btn btn-sm"
                        style={{ background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', gap: 4 }}
                        disabled={bulkProcessing}
                        onClick={async () => {
                            if (!confirm(`¿Eliminar ${selectedIds.size} comprobante(s)? Esta acción no se puede deshacer.`)) return;
                            setBulkProcessing(true);
                            for (const id of selectedIds) await eliminarComprobante(id);
                            setSelectedIds(new Set());
                            setBulkProcessing(false);
                            reset();
                        }}
                    >
                        <Trash2 size={13} /> Eliminar
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedIds(new Set())}
                    >
                        <X size={13} />
                    </button>
                </div>
            )}

            <div style={{ background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                {loading && comprobantes.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando documentos...</div>
                ) : (
                    <ComprobantesGrid
                        data={comprobantes}
                        totalCount={totalCount}
                        isLoading={loading}
                        hasMore={hasMore}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        onPageChange={(page) => { goToPage(page); setSelectedIds(new Set()); }}
                        onPageSizeChange={(size) => { setPageSize(size); setSelectedIds(new Set()); }}
                        onAction={handleAction}
                        onDocPreview={(url) => setPreviewUrl(url)}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        hasErp={hasErp}
                        onSort={(col, dir) => { setSortCol(col); setSortDir(dir); }}
                        sortCol={sortCol}
                        sortDir={sortDir}
                    />
                )}
            </div>

            {/* Sync Modal */}
            {showSyncModal && (
                <div className="wizard-overlay" onClick={() => setShowSyncModal(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="wizard-header">
                            <h3>Sincronizar con {syncSource === 'arca' ? 'ARCA (AFIP)' : syncSource === 'xubio' ? 'Xubio' : 'Colppy'}</h3>
                            <button className="wizard-close" onClick={() => setShowSyncModal(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-body">
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
                                {syncSource === 'arca'
                                    ? 'Descarga comprobantes emitidos y recibidos desde ARCA. Si dejás "Desde" vacío, descarga el último mes.'
                                    : 'Descarga comprobantes de venta y compra. Si dejás "Desde" vacío, se busca desde la última sincronización.'}
                            </p>
                            <div className="wizard-field">
                                <label className="form-label">Desde (opcional)</label>
                                <input type="date" className="form-input" value={syncDesde} onChange={e => setSyncDesde(e.target.value)} />
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Hasta (opcional)</label>
                                <input type="date" className="form-input" value={syncHasta} onChange={e => setSyncHasta(e.target.value)} />
                            </div>
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left" />
                            <div className="wizard-footer-right">
                                <button className="wizard-btn-next" onClick={() => {
                                    console.log('[Sync] Source elegido:', syncSource);
                                    if (syncSource === 'arca') handleSyncArca();
                                    else if (syncSource === 'xubio') handleSyncXubio();
                                    else if (syncSource === 'colppy') handleSync();
                                    else addToast('error', 'Error', `Fuente inválida (${syncSource}). Reabrí el menú y elegí de nuevo.`);
                                }}>
                                    <RefreshCw size={16} /> Sincronizar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
