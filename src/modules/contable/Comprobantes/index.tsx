import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useToast } from '../../../contexts/ToastContext';
import { Search, Filter, Plus, Upload as UploadIcon, X, Send, FileText, CheckCircle, XCircle, Eye, Calendar, Download, AlertTriangle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import ComprobantesGrid from './ComprobantesGrid';
import { useComprobantes } from './useComprobantes';

import { CommandBar, useCommandBar } from '../../../design-system/components/CommandBar/CommandBar';
import ComprobanteForm from './ComprobanteForm';
import GastoIngresoForm from './GastoIngresoForm';
import { DocumentViewer } from '../../../shared/components/DocumentViewer';
import ComprobantesMobile from './ComprobantesMobile';

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}

type TabKey = 'listado' | 'crear' | 'upload' | 'gasto' | 'ingreso';

interface ComprobantesIndexProps {
    defaultTipo?: 'venta' | 'compra';
}

export default function ComprobantesIndex({ defaultTipo }: ComprobantesIndexProps) {
    const isMobile = useIsMobile();
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as TabKey) || 'listado';

    // Mobile: render simplified view (Gestión — only view comprobantes + generate OP)
    if (isMobile) return <ComprobantesMobile />;

    const [activeTab, setActiveTab] = useState<TabKey>(tabParam);
    const [filtroTipo, setFiltroTipo] = useState(defaultTipo || 'todos');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [busqueda, setBusqueda] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [docPreview, setDocPreview] = useState<string | null>(null);



    const [exportando, setExportando] = useState(false);
    const [syncingColpy, setSyncingColpy] = useState(false);
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncDesde, setSyncDesde] = useState('');
    const [syncHasta, setSyncHasta] = useState('');
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [sortCol, setSortCol] = useState<string | null>('fecha');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Upload state
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploadResults, setUploadResults] = useState<{ name: string; status: 'ok' | 'error'; msg: string; duplicate?: boolean; duplicateCount?: number; data?: { numero_comprobante?: string; tipo?: string; tipo_comprobante?: string; fecha?: string; monto?: number; proveedor_nombre?: string; proveedor_cuit?: string; proveedor_nuevo?: boolean; pdf_url?: string; descripcion?: string } }[]>([]);

    // CUIT de la empresa + ERP connection status
    const [empresaCuit, setEmpresaCuit] = useState<string | null>(null);
    const [hasErp, setHasErp] = useState(false);
    const [hasColppy, setHasColppy] = useState(false);
    const [hasXubio, setHasXubio] = useState(false);
    const [hasArca, setHasArca] = useState(false);
    const [arcaConfig, setArcaConfig] = useState<{ arca_cuit: string; arca_username: string; arca_password: string; punto_venta: number | null } | null>(null);
    const [syncSource, setSyncSource] = useState<'colppy' | 'xubio' | 'arca' | null>(null);
    const [showSyncSourceMenu, setShowSyncSourceMenu] = useState(false);
    useEffect(() => {
        if (!tenant?.id) return;
        supabase.from('contable_config').select('arca_cuit, arca_username, arca_password, punto_venta, xubio_client_id, xubio_client_secret, colpy_username, colpy_password').eq('tenant_id', tenant.id).maybeSingle()
            .then(({ data }) => {
                if (data?.arca_cuit) setEmpresaCuit(data.arca_cuit);
                const xubio = !!(data?.xubio_client_id && data?.xubio_client_secret);
                const colppy = !!(data?.colpy_username && data?.colpy_password);
                const arca = !!(data?.arca_cuit && data?.arca_username && data?.arca_password);
                setHasXubio(xubio);
                setHasColppy(colppy);
                setHasArca(arca);
                if (arca) setArcaConfig({ arca_cuit: data!.arca_cuit!, arca_username: data!.arca_username!, arca_password: data!.arca_password!, punto_venta: data!.punto_venta ?? null });
                setHasErp(xubio || colppy || arca);
            });
    }, [tenant?.id]);

    // Attach to existing state
    const [attachingToId, setAttachingToId] = useState<string | null>(null);
    const attachFileInputRef = useRef<HTMLInputElement>(null);

    const [erpModalOpen, setErpModalOpen] = useState(false);
    const [erpTargetCompId, setErpTargetCompId] = useState<string | null>(null);
    const [erpSelected, setErpSelected] = useState<'xubio' | 'colppy' | null>(null);
    const [colpyAccounts, setColpyAccounts] = useState<any[]>([]);
    const [selectedColpyAccount, setSelectedColpyAccount] = useState<string>('');
    const [injectingErp, setInjectingErp] = useState(false);

    const { open: cmdOpen, setOpen: setCmdOpen } = useCommandBar();

    const [pageSize, setPageSize] = useState(25);

    const { data, totalCount, isLoading, hasMore, currentPage, totalPages, goToPage, reset, updateEstado, eliminarComprobante } =
        useComprobantes({ tipo: filtroTipo, estado: filtroEstado, busqueda, fechaDesde, fechaHasta, sortCol, sortDir, pageSize });

    // Load on mount, when filters change, or when tenant is available
    useEffect(() => { reset(); setSelectedIds(new Set()); }, [tenant?.id, filtroTipo, filtroEstado, busqueda, fechaDesde, fechaHasta, sortCol, sortDir, pageSize]);

    const handleExportExcel = () => {
        if (data.length === 0) return;
        setExportando(true);
        try {
            const headers = ['Fecha', 'Tipo Comp.', 'N° Comprobante', 'Proveedor/Cliente', 'CUIT', 'Moneda', 'Monto Original', 'Monto ARS', 'Estado', 'Prod/Servicio', 'Centro Costo', 'Descripción'];

            const mapRow = (c: (typeof data)[0]) => ([
                c.fecha,
                c.tipo_comprobante || '',
                c.numero_comprobante || '',
                c.proveedor?.razon_social || c.cliente?.razon_social || '',
                (c as any).cuit_emisor || '',
                c.moneda || 'ARS',
                Number(c.monto_original || 0),
                Number(c.monto_ars || 0),
                c.estado,
                c.producto_servicio?.nombre || '',
                c.centro_costo?.nombre || '',
                c.descripcion || '',
            ]);

            const compras = data.filter(c => c.tipo === 'compra');
            const ventas = data.filter(c => c.tipo === 'venta');

            const buildSheet = (rows: typeof data) => {
                const aoa = [headers, ...rows.map(mapRow)];
                // Totals row
                const totalRow = rows.length + 1; // 0-indexed header + data rows
                aoa.push([
                    'TOTALES', '', '', '', '', '',
                    { t: 'n', f: `SUM(G2:G${totalRow})` } as any,
                    { t: 'n', f: `SUM(H2:H${totalRow})` } as any,
                    '', `${rows.length} comprobantes`, '', '',
                ]);
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                // Column widths
                ws['!cols'] = [
                    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 14 },
                    { wch: 7 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 20 },
                    { wch: 16 }, { wch: 30 },
                ];
                return ws;
            };

            const wb = XLSX.utils.book_new();

            if (compras.length > 0) {
                XLSX.utils.book_append_sheet(wb, buildSheet(compras), 'Compras');
            }
            if (ventas.length > 0) {
                XLSX.utils.book_append_sheet(wb, buildSheet(ventas), 'Ventas');
            }
            // If filters show only one type, also add a combined "Todos" sheet
            if (compras.length > 0 && ventas.length > 0) {
                XLSX.utils.book_append_sheet(wb, buildSheet(data), 'Todos');
            }

            const today = new Date().toISOString().split('T')[0];
            const rangoLabel = fechaDesde && fechaHasta ? `_${fechaDesde}_a_${fechaHasta}` : fechaDesde ? `_desde_${fechaDesde}` : fechaHasta ? `_hasta_${fechaHasta}` : '';
            XLSX.writeFile(wb, `Comprobantes_${today}${rangoLabel}.xlsx`);
        } catch (err) {
            console.error('Export error:', err);
        }
        setExportando(false);
    };

    // Sync tab from URL
    useEffect(() => {
        setActiveTab((searchParams.get('tab') as TabKey) || 'listado');
    }, [searchParams]);

    const handleTab = (tab: TabKey) => {
        setActiveTab(tab);
        setSearchParams(tab === 'listado' ? {} : { tab });
    };

    // --- ERP INJECTION EXECUTION ---
    const executeErpInjection = async () => {
        if (!erpTargetCompId || !erpSelected) return;
        // Cuenta contable es opcional — si el proveedor tiene una asignada en Colppy, se usa esa


        setInjectingErp(true);
        try {
            const { getXubioService } = await import('../../../services/XubioService');
            const { getColpyService } = await import('../../../services/ColpyService');

            const id = erpTargetCompId;
            const targetERP = erpSelected;
            
            const { data: comp } = await supabase
                .from('contable_comprobantes')
                .select('*, proveedor:contable_proveedores(xubio_id, colpy_id), cliente:contable_clientes(xubio_id, colpy_id)')
                .eq('id', id)
                .single();

            if (!comp) {
                await updateEstado(id, 'inyectado');
                setErpModalOpen(false);
                setInjectingErp(false);
                return;
            }

            if (targetERP === 'xubio') {
                const xubio = getXubioService(tenant!.id);
                const result = await xubio.injectComprobante({
                    tipo: comp.tipo,
                    tipo_comprobante: comp.tipo_comprobante || 'Factura A',
                    fecha: comp.fecha,
                    numero_comprobante: comp.numero_comprobante,
                    moneda: comp.moneda || 'ARS',
                    tipo_cambio: comp.tipo_cambio,
                    observaciones: comp.observaciones,
                    proveedor_xubio_id: comp.proveedor?.xubio_id,
                    cliente_xubio_id: comp.cliente?.xubio_id,
                    lineas: (comp.lineas || []).map((l: any) => ({
                        descripcion: l.descripcion || '',
                        cantidad: l.cantidad || 1,
                        precio_unitario: l.precio_unitario || l.subtotal || 0,
                        iva_porcentaje: l.iva_porcentaje || 21,
                    })),
                });

                if (result.success) {
                        await supabase.from('contable_comprobantes').update({
                            estado: 'inyectado',
                            xubio_id: result.xubioId,
                            xubio_synced_at: new Date().toISOString(),
                        }).eq('id', id);
                        reset();
                        addToast('success', 'Éxito', 'Comprobante inyectado en Xubio');
                } else {
                        addToast('error', 'Error Xubio', `Error al inyectar en Xubio: ${result.error}`);
                        if (confirm(`FALLÓ LA INYECCIÓN EN XUBIO:\n${result.error}\n\n¿Desea forzar el estado a 'inyectado' de todas formas?`)) {
                            await updateEstado(id, 'inyectado');
                        }
                }
            } else if (targetERP === 'colppy') {
                const colpy = getColpyService(tenant!.id);
                const result = await colpy.injectComprobante({
                    tipo: comp.tipo,
                    tipo_comprobante: comp.tipo_comprobante || 'Factura A',
                    fecha: comp.fecha,
                    numero_comprobante: comp.numero_comprobante,
                    moneda: comp.moneda || 'ARS',
                    tipo_cambio: comp.tipo_cambio,
                    observaciones: comp.observaciones,
                    proveedor_colpy_id: comp.proveedor?.colpy_id,
                    cliente_colpy_id: comp.cliente?.colpy_id,
                    monto: comp.monto_original || comp.monto_ars,
                    neto_gravado: comp.neto_gravado,
                    neto_no_gravado: comp.neto_no_gravado,
                    total_iva: comp.total_iva,
                    percepciones_iibb: comp.percepciones_iibb,
                    percepciones_iva: comp.percepciones_iva,
                    fecha_vencimiento: comp.fecha_vencimiento,
                    lineas: (comp.lineas && comp.lineas.length > 0) ? comp.lineas.map((l: any) => {
                        const foundPrice = Number(l.precio_unitario) || Number(l.subtotal) || 0;
                        const finalPrice = foundPrice > 0 ? foundPrice : (Number(comp.monto) > 0 ? Number((comp.monto / 1.21).toFixed(2)) : 1);
                        return {
                            descripcion: l.descripcion || 'Servicios',
                            cantidad: l.cantidad || 1,
                            precio_unitario: finalPrice,
                            iva_porcentaje: l.iva_porcentaje || 21,
                            colpy_cuenta_id: selectedColpyAccount
                        };
                    }) : [{
                        descripcion: `Comprobante ${comp.numero_comprobante || ''}`.trim(),
                        cantidad: 1,
                        precio_unitario: Number(comp.neto_gravado || (comp.monto_original || comp.monto_ars || 0) / 1.21).toFixed(2),
                        iva_porcentaje: 21,
                        colpy_cuenta_id: selectedColpyAccount
                    }],
                });

                if (result.success) {
                    await supabase.from('contable_comprobantes').update({
                        estado: 'inyectado',
                        colpy_id: result.colpyId,
                        xubio_synced_at: new Date().toISOString(),
                    }).eq('id', id);
                    reset();
                    addToast('success', 'Éxito', 'Comprobante inyectado en Colppy');
                } else {
                    addToast('error', 'Error Colpy', `Error al inyectar en Colpy: ${result.error}`);
                    if (confirm(`FALLÓ LA INYECCIÓN EN COLPPY:\n${result.error}\n\n¿Desea forzar el estado a 'inyectado' de todas formas?`)) {
                        await updateEstado(id, 'inyectado');
                    }
                }
            }
            setErpModalOpen(false);
        } catch (err) {
            console.error('[Injection] Error:', err);
            addToast('error', 'Error', (err as Error).message);
        } finally {
            setInjectingErp(false);
        }
    };

    const handleAction = async (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => {
        if (action === 'eliminar') {
            if (confirm('¿Estás seguro de que deseas eliminar permanentemente este comprobante rechazado?')) {
                await eliminarComprobante(id);
            }
            return;
        }

        if (action === 'inyectar') {
            if (!hasErp) return; // No ERP configured
            // OPEN MODAL FOR INJECTION
            try {
                const { getXubioService } = await import('../../../services/XubioService');
                const { getColpyService } = await import('../../../services/ColpyService');

                const xubio = getXubioService(tenant!.id);
                await xubio.loadConfig();

                const colpy = getColpyService(tenant!.id);
                await colpy.loadConfig();

                if (!xubio.isConfigured && !colpy.isConfigured) {
                    addToast('error', 'Error', 'No hay ERP configurado');
                    return;
                }

                setErpTargetCompId(id);
                setErpSelected(null);
                
                if (xubio.isConfigured && !colpy.isConfigured) setErpSelected('xubio');
                if (colpy.isConfigured && !xubio.isConfigured) setErpSelected('colppy');

                if (colpy.isConfigured) {
                    try {
                        const arbol = await colpy.getArbolContable();
                        const flattenCuentas = (nodos: any[]): any[] => {
                            let result: any[] = [];
                            if (!Array.isArray(nodos)) return result;
                            
                            for (const n of nodos) {
                                // A veces viene "imputable" o "Imputable", o podemos inferirlo si no tiene hijos
                                const hasChildren = (n.children && n.children.length > 0) || (n.Subcuentas && n.Subcuentas.length > 0) || (n.hijos && n.hijos.length > 0);
                                const isImputable = n.Imputable === true || n.Imputable === "1" || n.Imputable === 1 || n.imputable === true || n.imputable === "1" || n.imputable === 1 || n.AdmiteAsientoManual === "1" || n.AdmiteAsientoManual === true || n.admiteAsientoManual === "1" || n.admiteAsientoManual === true;
                                
                                // Si es imputable explícitamente, o si no lo dice pero no tiene hijos, lo ofrecemos por las dudas
                                if (isImputable || (!hasChildren && (n.idPlanCuenta || n.Id))) {
                                    result.push({
                                        ...n,
                                        idPlanCuenta: n.idPlanCuenta || n.Id
                                    });
                                }
                                
                                const childrenList = n.children || n.Subcuentas || n.hijos || [];
                                if (childrenList.length > 0) {
                                    result = result.concat(flattenCuentas(childrenList));
                                }
                            }
                            return result;
                        };
                        
                        let cuentasMap = flattenCuentas(arbol);
                        
                        if (cuentasMap.length === 0 && arbol.length > 0) {
                            // If flattening failed, just dump the first level nodes so at least something shows or we can debug
                            const keys = Object.keys(arbol[0]).join(', ');
                            cuentasMap = [{ idPlanCuenta: "", Codigo: "DEBUG", Descripcion: `No se hallaron imputables. Nodos raíz tienen: ${keys}` }];
                        } else if (arbol.length === 0) {
                            cuentasMap = [{ idPlanCuenta: "", Codigo: "ERROR", Descripcion: "El árbol devuelto por Colppy está vacío." }];
                        }
                        
                        setColpyAccounts(cuentasMap);
                    } catch (err) {
                        console.error('Failed to load colpy accounts', err);
                        setColpyAccounts([{ idPlanCuenta: "", Codigo: "ERROR", Descripcion: `Fallo API: ${(err as Error).message}` }]);
                    }
                }
                setErpModalOpen(true);
            } catch (err) {
                console.error('[Injection UI] Error:', err);
                addToast('error', 'Error', (err as Error).message);
            }
        } else {
            const map: Record<string, string> = {
                aprobar: 'aprobado', rechazar: 'rechazado',
            };
            if (map[action]) {
                await updateEstado(id, map[action] as any);
            }
        }
    };

    const handleAttachInvoiceClick = (id: string) => {
        setAttachingToId(id);
        attachFileInputRef.current?.click();
    };

    const handleAttachInvoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !attachingToId || !tenant) return;

        try {
            setUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `${tenant.id}/${fileName}`;

            const { error: uploadErr } = await supabase.storage
                .from('comprobantes')
                .upload(filePath, file);

            if (uploadErr) throw uploadErr;

            const { data: publicUrlData } = supabase.storage
                .from('comprobantes')
                .getPublicUrl(filePath);

            const fileUrl = publicUrlData.publicUrl;

            // Actualizamos la url en supabase al instante en el registro original
            const { data: compOriginal } = await supabase.from('contable_comprobantes')
                .update({ pdf_url: fileUrl })
                .eq('id', attachingToId)
                .select('monto_original, cuit_emisor, pdf_url')
                .single();

            // Llamamos a n8n
            const formData = new FormData();
            formData.append('data', file);
            formData.append('filename', file.name);
            formData.append('tenant_id', tenant.id);
            formData.append('comprobante_id', attachingToId);
            formData.append('update_mode', 'true');
            if (empresaCuit) formData.append('cuit_empresa', empresaCuit);

            try {
                const N8N_WEBHOOK = '/api/n8n-comprobantes';
                const resp = await fetch(N8N_WEBHOOK, { method: 'POST', body: formData });
                if (resp.ok) {
                    // Darle tiempo a n8n de procesar el archivo y crear/actualizar
                    setTimeout(async () => {
                        // 1. Buscamos el comprobante modificado por nosotros
                        const { data: compPost } = await supabase.from('contable_comprobantes')
                            .select('monto_original, cuit_emisor, numero_comprobante')
                            .eq('id', attachingToId)
                            .single();

                        // 2. Buscamos proactivamente si N8N clonó/creó un TERCER comprobante ignorando 'update_mode'
                        // Busquemos comprobantes recientes con el MISMO pdf_url que el nuestro O un cuit/monto parecido que no sea este ID
                        // Como N8N quizas recarga el archivo, busquemos el mas reciente del mismo tenant hecho por n8n (o simplemente los de ultimos minutos)
                        const fiveMinsAgo = new Date(Date.now() - 5 * 60000).toISOString();
                        const { data: duplicates } = await supabase.from('contable_comprobantes')
                            .select('id, pdf_url, monto_original, cuit_emisor')
                            .eq('tenant_id', tenant.id)
                            .gt('created_at', fiveMinsAgo)
                            .neq('id', attachingToId)
                            .order('created_at', { ascending: false })
                            .limit(5);

                        // Si hay un duplicado claro originado ahora mismo por upload del CSV
                        // N8n en su webhook inserta basandose en la subida, asumimos que el primer result reciente coincidente es el culpable
                        const culpableDuplicado = duplicates?.find(d =>
                            // Puede que N8N haya usado nuestro fileUrl exacto o uno parecido, o tenga montos parecidos
                            (compPost && Number(d.monto_original) === Number(compPost.monto_original)) ||
                            (compPost && d.cuit_emisor && d.cuit_emisor === compPost.cuit_emisor) ||
                            (d.pdf_url && fileUrl && d.pdf_url.includes(fileName))
                        );

                        if (compOriginal && compPost) {
                            const errs = [];
                            if (Math.abs(Number(compOriginal.monto_original) - Number(compPost.monto_original)) > 1) {
                                errs.push(`El importe original ($${compOriginal.monto_original}) no coincide con el extraído del PDF ($${compPost.monto_original}).`);
                            }
                            if (compOriginal.cuit_emisor && compPost.cuit_emisor && compOriginal.cuit_emisor !== compPost.cuit_emisor) {
                                errs.push(`El CUIT original (${compOriginal.cuit_emisor}) no coincide con la factura (${compPost.cuit_emisor}).`);
                            }

                            if (errs.length > 0) {
                                const confirmar = confirm(`ATENCIÓN - Discrepancias en la factura cargada:\n\n${errs.join('\n')}\n\n¿Desea mantener la factura vinculada a este comprobante de todos modos? (Cancelar desvinculará el PDF)`);

                                if (!confirmar) {
                                    // Rollback: quitamos el pdf_url del comprobante al que se lo adjuntamos
                                    await supabase.from('contable_comprobantes')
                                        .update({ pdf_url: null })
                                        .eq('id', attachingToId);
                                    addToast('warning', 'Cancelado', 'Se ha cancelado la vinculación y el pdf fue retirado.');

                                    // Y si N8N nos traicionó creando uno secundario, lo matamos
                                    if (culpableDuplicado) {
                                        await supabase.from('contable_comprobantes').delete().eq('id', culpableDuplicado.id);
                                    }

                                } else {
                                    // Aceptó las diferencias, pero igual matamos el clon si n8n lo creó
                                    if (culpableDuplicado) {
                                        console.log("Limpiando duplicado residual de n8n", culpableDuplicado.id);
                                        await supabase.from('contable_comprobantes').delete().eq('id', culpableDuplicado.id);
                                    }
                                }
                            } else {
                                // Coinciden, pero si n8n igual nos clonó el comprobante, lo matamos
                                if (culpableDuplicado) {
                                    console.log("Limpiando duplicado residual de n8n", culpableDuplicado.id);
                                    await supabase.from('contable_comprobantes').delete().eq('id', culpableDuplicado.id);
                                }
                                addToast('success', 'Factura procesada', 'El comprobante fue adjuntado correctamente y los datos coinciden.');
                            }
                        } else if (culpableDuplicado) {
                            // Caso raro, limpiamos duplicado por las dudas
                            await supabase.from('contable_comprobantes').delete().eq('id', culpableDuplicado.id);
                        }

                        reset();
                    }, 4000); // 4 secs para darle respiro a n8n
                } else {
                    console.warn("n8n no respondió correctamente al adjuntar factura.");
                    reset();
                }
            } catch (n8nErr) {
                console.error('Error enviando a n8n update:', n8nErr);
                reset(); // Refrescamos pase lo que pase
            }
        } catch (err: any) {
            console.error('Error attaching file:', err);
            addToast('error', 'Error Upload', err.message);
        } finally {
            setUploading(false);
            setAttachingToId(null);
            if (attachFileInputRef.current) attachFileInputRef.current.value = '';
        }
    };

    const handleSyncColpy = async (desde: string, hasta: string) => {
        if (!tenant) return;
        setIsSyncModalOpen(false);
        setSyncingColpy(true);
        addToast('info', 'Sincronización', `Conectando con Colppy (Desde: ${desde || 'Histórico'}, Hasta: ${hasta || 'Hoy'})...`);
        
        try {
            const { getColpyService } = await import('../../../services/ColpyService');
            const colpy = getColpyService(tenant.id);
            colpy.resetAbort(); // Reiniciar estado al inicio
            await colpy.loadConfig();
            
            if (!colpy.isConfigured) {
                addToast('error', 'Error', 'Colppy no está configurado. Ve a Configuración.');
                setSyncingColpy(false);
                return;
            }

            let effectiveDesde = desde;
            
            // Auto-Discovery: Si el usuario dejó "Desde" en blanco, buscamos la últ. factura de Colppy
            if (!effectiveDesde) {
                const { data: lastInvoice } = await supabase
                    .from('contable_comprobantes')
                    .select('fecha')
                    .eq('tenant_id', tenant.id)
                    .eq('source', 'colpy')
                    .order('fecha', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (lastInvoice && lastInvoice.fecha) {
                    const d = new Date(lastInvoice.fecha + "T12:00:00Z"); // Fix de Timezone
                    d.setDate(d.getDate() - 15); // Margen de seguridad (15 días atras)
                    effectiveDesde = d.toISOString().split('T')[0];
                    console.log("[Sync] Auto-detectado inicio desde historial Supabase:", effectiveDesde);
                } else {
                    effectiveDesde = '2023-01-01'; // Fallback base general si la BD está virgen
                }
            }

            let importados = 0;
            const ventas = await colpy.getFacturasVenta(effectiveDesde, hasta);
            const compras = await colpy.getFacturasCompra(effectiveDesde, hasta);

            // Combinar e insertar
            const todos = [...ventas.map(v => ({ ...v, _tipo: 'venta' })), ...compras.map(c => ({ ...c, _tipo: 'compra' }))];

            // Traemos las entidades base para vincular
            const { data: clientes } = await supabase.from('contable_clientes').select('id, colpy_id').eq('tenant_id', tenant.id).not('colpy_id', 'is', null);
            const { data: proveedores } = await supabase.from('contable_proveedores').select('id, colpy_id').eq('tenant_id', tenant.id).not('colpy_id', 'is', null);
            
            // Mapas para busqueda rapida
            const mapClientes = new Map(clientes?.map(c => [c.colpy_id, c.id]));
            const mapProveedores = new Map(proveedores?.map(p => [p.colpy_id, p.id]));

            for (const c of todos) {
                if (colpy.isAborted) {
                    console.log("Cortando inserción de Supabase porque se abortó");
                    break;
                }
                
                try {
                    // Mapeo básico
                    const nro = c.numeroFactura || c.nroFactura || c.nroComprobante || c.idFactura || c.id;
                    const fecha = c.fechaEmision || c.fechaFactura || c.fecha || new Date().toISOString().split('T')[0];
                    const importeTotal = c.totalFactura || c.importeTotal || c.total || c.importe || c.montoTotal || c.netoTotal || 0;
                    const entidadNombre = c.RazonSocial || c.NombreFantasia || c.nombreCliente || c.nombreProveedor || 'Desconocido';
                    
                    const isVenta = c._tipo === 'venta';
                    
                    // Intentamos matchear cliente/proveedor
                    const idEntidadColpy = c.idCliente || c.idProveedor || c.idcliente || c.idproveedor;
                    let uuid_cliente = null;
                    let uuid_proveedor = null;

                    if (idEntidadColpy) {
                        if (isVenta) {
                            uuid_cliente = mapClientes.get(idEntidadColpy.toString());
                        } else {
                            uuid_proveedor = mapProveedores.get(idEntidadColpy.toString());
                        }
                    }

                    // Intentar upsert o ignore si ya existe el colpy_id
                    const colpyIdStr = (c.idFactura || c.id || '').toString();
                    const { data: existe } = await supabase
                        .from('contable_comprobantes')
                        .select('id')
                        .eq('tenant_id', tenant.id)
                        .eq('colpy_id', colpyIdStr)
                        .maybeSingle();

                    // Fecha de vencimiento (Colppy usa fechaPago a veces como vencimiento en ventas o fechaVencimiento explícita)
                    const fechaVencimiento = c.fechaPago || c.fechaVencimiento || fecha.split(' ')[0];

                    if (!existe) {
                        const payload = {
                            tenant_id: tenant.id,
                            tipo: isVenta ? 'venta' : 'compra',
                            tipo_comprobante: c.tipoFactura || 'Factura',
                            numero_comprobante: nro ? nro.toString().padStart(8, '0') : null,
                            fecha: fecha.split(' ')[0],
                            fecha_vencimiento: fechaVencimiento.split(' ')[0],
                            monto_original: Number(importeTotal) || 0,
                            monto_ars: Number(importeTotal) || 0, // Fallback asumiendo ARS
                            moneda: 'ARS',
                            estado: 'aprobado',
                            source: 'colpy',
                            colpy_id: colpyIdStr,
                            colpy_synced_at: new Date().toISOString(),
                            cliente_id: uuid_cliente || null,
                            proveedor_id: uuid_proveedor || null,
                            descripcion: `Sincronizado desde Colppy. Entidad: ${entidadNombre}`,
                            // Advanced tracking: Impositivos y Netos
                            neto_gravado: Number(c.netoGravado) || 0,
                            neto_no_gravado: Number(c.netoNoGravado) || 0,
                            total_iva: Number(c.totalIVA) || 0,
                            percepciones_iibb: (Number(c.percepcionIIBB) || 0) + (Number(c.IIBBLocal) || 0) + (Number(c.IIBBOtro) || 0),
                            percepciones_iva: Number(c.percepcionIVA) || 0,
                        };

                        const { error } = await supabase.from('contable_comprobantes').insert(payload);
                        if (error) {
                            console.error("Supabase insert error for Colppy sync:", error, "Payload:", payload);
                        } else {
                            importados++;
                        }
                    }
                } catch(e) {
                   console.warn("Ignorado comprobante", c, e);
                }
            }

            if (colpy.isAborted) {
                addToast('warning', 'Abortado', `Sincronización detenida. Se insertaron ${importados} antes de parar.`);
            } else if (importados === 0) {
                addToast('info', 'Al Día', 'Sincronización completada. No se encontraron comprobantes nuevos o faltantes en el rango.');
            } else {
                addToast('success', 'Completado', `Sincronizados ${importados} comprobantes nuevos de Colppy.`);
            }
            reset();
        } catch (e: any) {
            if (e.message && e.message.includes('cancelada')) {
                addToast('warning', 'Sincronización Detenida', 'Has frenado la descarga de inmediato.');
            } else {
                addToast('error', 'Error Colppy', e.message);
            }
        } finally {
            setSyncingColpy(false);
        }
    };

    const handleSyncXubio = async (desde: string, hasta: string) => {
        if (!tenant) return;
        setIsSyncModalOpen(false);
        setSyncingColpy(true); // reuse same loading state
        addToast('info', 'Sincronización', `Conectando con Xubio (Desde: ${desde || 'Histórico'}, Hasta: ${hasta || 'Hoy'})...`);
        try {
            const { getXubioService } = await import('../../../services/XubioService');
            const xubio = getXubioService(tenant.id);
            await xubio.loadConfig();
            if (!xubio.isConfigured) {
                addToast('error', 'Error', 'Xubio no está configurado. Ve a Configuración.');
                setSyncingColpy(false);
                return;
            }
            const result = await xubio.syncComprobantes(desde || undefined, hasta || undefined, (msg) => {
                console.log('[Xubio sync]', msg);
            });
            if (result.imported === 0 && result.updated === 0) {
                addToast('info', 'Al Día', 'No se encontraron comprobantes nuevos en Xubio.');
            } else {
                addToast('success', 'Completado', `Xubio: ${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} errores` : ''}`);
            }
            reset();
        } catch (e: any) {
            addToast('error', 'Error Xubio', e.message);
        } finally {
            setSyncingColpy(false);
        }
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

        for (let i = 0; i < 60; i++) {
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

    const handleSyncArca = async (desde: string, hasta: string) => {
        if (!tenant || !arcaConfig) return;
        setIsSyncModalOpen(false);
        setSyncingColpy(true);
        addToast('info', 'Sincronización', 'Conectando con ARCA (AFIP SDK)... esto puede tardar unos minutos.');

        try {
            const fechaDesdeStr = desde || (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; })();
            const fechaHastaStr = hasta || new Date().toISOString().split('T')[0];
            const fromDate = fechaDesdeStr.split('-').reverse().join('/');
            const toDate = fechaHastaStr.split('-').reverse().join('/');

            // Según la doc oficial de AFIP SDK:
            // - cuit:     CUIT de la empresa cuyas facturas querés consultar
            // - username: CUIT del usuario que se loguea en AFIP (puede ser distinto si administrás
            //             otra empresa con tus propios poderes en ARCA).
            // En AFG: cuit = AFG, username = contador con poderes.

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
                        ...(arcaConfig.punto_venta && tipoConsulta === 'E' ? { puntosVenta: [arcaConfig.punto_venta] } : {}),
                    },
                });

                const isVenta = tipoConsulta === 'E';

                if (!Array.isArray(data) || data.length === 0) continue;

                for (const r of data) {
                    const pv = (r['Punto de Venta'] || '').padStart(5, '0');
                    const numDesde = (r['Número Desde'] || '').padStart(8, '0');
                    const nroComprobante = `${pv}-${numDesde}`;
                    const tipoComp = r['Tipo de Comprobante'] || '';
                    const tipoNombre = TIPOS_COMPROBANTE_AFIP[tipoComp] || `Tipo ${tipoComp}`;
                    const fechaRaw = r['Fecha de Emisión'] || '';
                    // Convert DD/MM/YYYY to YYYY-MM-DD
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

                    // Check if already exists by numero_comprobante + tipo + tenant
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
                                        .insert({
                                            tenant_id: tenant.id,
                                            razon_social: denomContraparte,
                                            cuit: cuitContraparteClean,
                                            activo: true,
                                        })
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
                                        .insert({
                                            tenant_id: tenant.id,
                                            razon_social: denomContraparte,
                                            cuit: cuitContraparteClean,
                                            activo: true,
                                            es_caso_rojo: false,
                                            es_favorito: false,
                                        })
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

                        const payload = {
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
                        };

                        const { error } = await supabase.from('contable_comprobantes').insert(payload);
                        if (error) {
                            console.error('[ARCA sync] Insert error:', error, payload);
                        } else {
                            importados++;
                        }
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
            setSyncingColpy(false);
        }
    };

    const handleSync = (desde: string, hasta: string) => {
        if (syncSource === 'xubio') {
            handleSyncXubio(desde, hasta);
        } else if (syncSource === 'arca') {
            handleSyncArca(desde, hasta);
        } else {
            handleSyncColpy(desde, hasta);
        }
    };

    const openSyncModal = (source: 'colppy' | 'xubio' | 'arca') => {
        setSyncSource(source);
        setShowSyncSourceMenu(false);
        setIsSyncModalOpen(true);
    };

    // Hotkeys: Cmd+N → crear, Cmd+U → upload
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); handleTab('crear'); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'u') { e.preventDefault(); handleTab('upload'); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const tabs = [
        { key: 'listado' as TabKey, label: 'Listado', icon: <Search size={13} /> },
        { key: 'upload' as TabKey, label: 'Cargar Factura', icon: <UploadIcon size={13} /> },
    ];

    return (
        <>
            <input
                type="file"
                ref={attachFileInputRef}
                style={{ display: 'none' }}
                accept=".pdf,image/*"
                onChange={handleAttachInvoiceFile}
            />

            {/* Command Bar */}
            {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} />}

            {/* Document Preview Modal */}
            {docPreview && (
                <div
                    className="modal-overlay"
                    onClick={() => setDocPreview(null)}
                >
                    <div
                        style={{ background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', width: '90vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 className="modal-title">Vista previa de documento</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setDocPreview(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <DocumentViewer
                            url={docPreview}
                            style={{ flex: 1, width: '100%', height: '100%', background: '#fff' }}
                        />
                    </div>
                </div>
            )}

            {/* Modal de Rangos para Colppy */}
            {isSyncModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-auto relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => setIsSyncModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition">
                            <X size={20} />
                        </button>
                        
                        <div className="flex items-center gap-3 mb-4 text-indigo-400">
                            <RefreshCw size={24} />
                            <h2 className="text-xl font-semibold text-white">Sincronizar {syncSource === 'xubio' ? 'Xubio' : syncSource === 'arca' ? 'ARCA (AFIP)' : 'Colppy'}</h2>
                        </div>
                        
                        <p className="text-sm text-slate-300 mb-6">
                            Selecciona el rango de fechas para descargar comprobantes. Si dejas los campos en blanco, descargará **TODO** el historial (puede demorar).
                        </p>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Fecha Desde</label>
                                <input 
                                    type="date" 
                                    autoFocus
                                    value={syncDesde} 
                                    onChange={(e) => setSyncDesde(e.target.value)} 
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Fecha Hasta</label>
                                <input 
                                    type="date" 
                                    value={syncHasta} 
                                    onChange={(e) => setSyncHasta(e.target.value)} 
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setIsSyncModalOpen(false)}
                                className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => handleSync(syncDesde, syncHasta)}
                                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg shadow-lg shadow-indigo-500/20 font-medium hover:from-indigo-500 hover:to-blue-500 transition-all flex items-center gap-2"
                            >
                                <RefreshCw size={16} /> Descargar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Page header — standardized */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Comprobantes</h1>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{totalCount.toLocaleString('es-AR')} registros</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {hasErp && (syncingColpy ? (
                        <button
                            className="btn btn-secondary"
                            onClick={async () => {
                                if (!tenant) return;
                                if (syncSource === 'colppy') {
                                    const { getColpyService } = await import('../../../services/ColpyService');
                                    getColpyService(tenant.id).abortSync();
                                }
                                addToast('warning', 'Cancelando', 'Deteniendo sincronización en breve...');
                            }}
                            style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: 10, background: 'var(--color-danger)', color: 'white', borderColor: 'var(--color-danger)' }}
                        >
                            <XCircle size={14} /> Parar sync
                        </button>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    const sources = [hasColppy && 'colppy', hasXubio && 'xubio', hasArca && 'arca'].filter(Boolean) as ('colppy' | 'xubio' | 'arca')[];
                                    if (sources.length === 1) {
                                        openSyncModal(sources[0]);
                                    } else {
                                        setShowSyncSourceMenu(!showSyncSourceMenu);
                                    }
                                }}
                                style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: 10 }}
                            >
                                <RefreshCw size={14} /> Sincronizar
                            </button>
                            {showSyncSourceMenu && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
                                    {hasArca && <button onClick={() => openSyncModal('arca')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde ARCA (AFIP)
                                    </button>}
                                    {hasColppy && <button onClick={() => openSyncModal('colppy')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Colppy
                                    </button>}
                                    {hasXubio && <button onClick={() => openSyncModal('xubio')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Xubio
                                    </button>}
                                </div>
                            )}
                        </div>
                    ))}
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/inmobiliaria/facturar')}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: '0.8rem', borderRadius: 10 }}
                    >
                        <Plus size={16} /> Emitir factura
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`tab - btn${activeTab === tab.key ? ' active' : ''} `}
                        onClick={() => handleTab(tab.key)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: LISTADO ── */}
            {activeTab === 'listado' && (
                <>
                    {/* Filter bar */}
                    <div className="card" style={{ padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                            <Search size={14} color="var(--color-text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <input
                                className="form-input"
                                placeholder="Buscar por N° comprobante..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                style={{ paddingLeft: 32, height: 36 }}
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Filter size={13} color="var(--color-text-muted)" />
                            {!defaultTipo && (
                            <select
                                className="form-input"
                                value={filtroTipo}
                                onChange={e => setFiltroTipo(e.target.value)}
                                style={{ width: 120, height: 36 }}
                            >
                                <option value="todos">Todos</option>
                                <option value="compra">Compras</option>
                                <option value="venta">Ventas</option>
                            </select>
                            )}
                            <select
                                className="form-input"
                                value={filtroEstado}
                                onChange={e => setFiltroEstado(e.target.value)}
                                style={{ width: 140, height: 36 }}
                            >
                                <option value="todos">Todo estado</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="clasificado">Clasificado</option>
                                <option value="aprobado">Aprobado</option>
                                <option value="inyectado">Inyectado</option>
                                <option value="error">Error</option>
                                <option value="rechazado">Rechazado</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                            <Calendar size={13} color="var(--color-text-muted)" />
                            <input
                                type="date"
                                className="form-input"
                                value={fechaDesde}
                                onChange={e => setFechaDesde(e.target.value)}
                                style={{ width: 140, height: 36 }}
                                title="Desde"
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>a</span>
                            <input
                                type="date"
                                className="form-input"
                                value={fechaHasta}
                                onChange={e => setFechaHasta(e.target.value)}
                                style={{ width: 140, height: 36 }}
                                title="Hasta"
                            />
                            {(fechaDesde || fechaHasta) && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                                    title="Limpiar fechas"
                                    style={{ padding: '0.2rem' }}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleExportExcel}
                            disabled={data.length === 0 || exportando}
                            title="Descargar Excel con filtros actuales"
                            style={{ marginLeft: 'auto' }}
                        >
                            <Download size={13} /> {exportando ? 'Exportando...' : 'Descargar Excel'}
                        </button>
                    </div>

                    {/* Keyboard hint */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem', opacity: 0.55 }}>
                        <kbd style={{ fontSize: '0.55rem', padding: '1px 4px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>↑↓</kbd>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>navegar</span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-border-subtle)', margin: '0 2px' }}>·</span>
                        <kbd style={{ fontSize: '0.55rem', padding: '1px 4px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>Enter</kbd>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>detalle</span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-border-subtle)', margin: '0 2px' }}>·</span>
                        <kbd style={{ fontSize: '0.55rem', padding: '1px 4px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>A</kbd>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>aprobar</span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-border-subtle)', margin: '0 2px' }}>·</span>
                        <kbd style={{ fontSize: '0.55rem', padding: '1px 4px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>R</kbd>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>rechazar</span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-border-subtle)', margin: '0 2px' }}>·</span>
                        {hasErp && (<>
                            <kbd style={{ fontSize: '0.55rem', padding: '1px 4px', borderRadius: 3, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-muted)' }}>I</kbd>
                            <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>inyectar</span>
                        </>)}
                    </div>

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
                                <CheckCircle size={13} /> Aprobar todos
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ background: 'var(--color-danger)', color: '#fff', gap: 4 }}
                                disabled={bulkProcessing}
                                onClick={async () => {
                                    setBulkProcessing(true);
                                    for (const id of selectedIds) await handleAction(id, 'rechazar');
                                    setSelectedIds(new Set());
                                    setBulkProcessing(false);
                                    reset();
                                }}
                            >
                                <XCircle size={13} /> Rechazar todos
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', gap: 4 }}
                                disabled={bulkProcessing}
                                onClick={async () => {
                                    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente estos ${selectedIds.size} comprobantes? Esta acción sólo borra los registros locales, no en Colppy.`)) return;
                                    setBulkProcessing(true);
                                    for (const id of selectedIds) {
                                        await eliminarComprobante(id);
                                    }
                                    setSelectedIds(new Set());
                                    setBulkProcessing(false);
                                    reset();
                                }}
                            >
                                <X size={13} /> Eliminar todos
                            </button>
                            {hasErp && (
                                <button
                                    className="btn btn-sm btn-primary"
                                    style={{ gap: 4 }}
                                    disabled={bulkProcessing}
                                    onClick={async () => {
                                        setBulkProcessing(true);
                                        for (const id of selectedIds) await handleAction(id, 'inyectar');
                                        setSelectedIds(new Set());
                                        setBulkProcessing(false);
                                        reset();
                                    }}
                                >
                                    <Send size={13} /> Inyectar todos
                                </button>
                            )}
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setSelectedIds(new Set())}
                                style={{ marginLeft: '0.25rem' }}
                            >
                                <X size={13} /> Deseleccionar
                            </button>
                        </div>
                    )}

                    <ComprobantesGrid
                        data={data}
                        totalCount={totalCount}
                        isLoading={isLoading}
                        hasMore={hasMore}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        onPageChange={(page) => { goToPage(page); setSelectedIds(new Set()); }}
                        onPageSizeChange={(size) => { setPageSize(size); setSelectedIds(new Set()); }}
                        onAction={handleAction}
                        onDocPreview={setDocPreview}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        onSort={(col, dir) => {
                            setSortCol(col);
                            setSortDir(dir);
                        }}
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onAttachInvoice={handleAttachInvoiceClick}
                        hasErp={hasErp}
                    />
                </>
            )}

            {/* ── TAB: CREAR ── */}
            {activeTab === 'crear' && (
                <ComprobanteForm
                    onSuccess={() => {
                        handleTab('listado');
                        reset();
                    }}
                />
            )}

            {/* ── TAB: GASTO ── */}
            {activeTab === 'gasto' && (
                <GastoIngresoForm
                    tipo="compra"
                    onSuccess={() => {
                        handleTab('listado');
                        reset();
                    }}
                />
            )}

            {/* ── TAB: INGRESO ── */}
            {activeTab === 'ingreso' && (
                <GastoIngresoForm
                    tipo="venta"
                    onSuccess={() => {
                        handleTab('listado');
                        reset();
                    }}
                />
            )}

            {/* ── TAB: UPLOAD ── */}
            {activeTab === 'upload' && (() => {
                const N8N_WEBHOOK = '/api/n8n-comprobantes';

                const handleUploadFiles = async () => {
                    if (uploadFiles.length === 0) return;
                    setUploading(true);
                    setUploadResults([]);
                    const results: typeof uploadResults = [];

                    for (const file of uploadFiles) {
                        try {
                            const formData = new FormData();
                            formData.append('data', file);
                            formData.append('filename', file.name);
                            if (tenant) {
                                formData.append('tenant_id', tenant.id);
                                if (empresaCuit) formData.append('cuit_empresa', empresaCuit);
                            }

                            const resp = await fetch(N8N_WEBHOOK, { method: 'POST', body: formData });

                            if (resp.ok) {
                                let data: typeof uploadResults[0]['data'] | undefined;

                                // n8n returns empty body — query Supabase for the created comprobante
                                if (tenant) {
                                    await new Promise(r => setTimeout(r, 2500));
                                    const { data: rows } = await supabase
                                        .from('contable_comprobantes')
                                        .select('id, numero_comprobante, tipo, tipo_comprobante, fecha, monto_original, descripcion, pdf_url, cuit_emisor, proveedor_id')
                                        .eq('tenant_id', tenant.id)
                                        .order('created_at', { ascending: false })
                                        .limit(1);
                                    const row = rows?.[0] as any;
                                    if (row) {
                                        // Fetch provider name using proveedor_id
                                        let provNombre = row.descripcion || '';
                                        let provCuit = row.cuit_emisor || '';
                                        if (row.proveedor_id) {
                                            const { data: prov } = await supabase
                                                .from('contable_proveedores')
                                                .select('razon_social, cuit, producto_servicio_default_id')
                                                .eq('id', row.proveedor_id)
                                                .single();
                                            if (prov) {
                                                provNombre = prov.razon_social;
                                                provCuit = prov.cuit || provCuit;
                                                // Auto-link product from proveedor's default if comprobante has none
                                                if (prov.producto_servicio_default_id && !row.producto_servicio_id) {
                                                    await supabase
                                                        .from('contable_comprobantes')
                                                        .update({ producto_servicio_id: prov.producto_servicio_default_id })
                                                        .eq('id', row.id);
                                                }
                                            }
                                        }
                                        data = {
                                            numero_comprobante: row.numero_comprobante,
                                            tipo: row.tipo,
                                            tipo_comprobante: row.tipo_comprobante,
                                            fecha: row.fecha,
                                            monto: row.monto_original,
                                            proveedor_nombre: provNombre,
                                            proveedor_cuit: provCuit,
                                            proveedor_nuevo: !row.proveedor_id,
                                            pdf_url: row.pdf_url?.trim() || undefined,
                                            descripcion: row.descripcion,
                                        };
                                        console.log('[Upload] Comprobante:', data);
                                    }

                                    // Duplicate detection: check if another comprobante with same numero already existed
                                    if (row && row.numero_comprobante) {
                                        const { data: dupes } = await supabase
                                            .from('contable_comprobantes')
                                            .select('id')
                                            .eq('tenant_id', tenant.id)
                                            .eq('numero_comprobante', row.numero_comprobante)
                                            .neq('id', row.id);

                                        if (dupes && dupes.length > 0) {
                                            results.push({
                                                name: file.name, status: 'ok',
                                                msg: `⚠️ Procesado, pero ya existe${dupes.length > 1 ? 'n' : ''} ${dupes.length} comprobante${dupes.length > 1 ? 's' : ''} con el mismo número(${row.numero_comprobante})`,
                                                duplicate: true, duplicateCount: dupes.length, data,
                                            });
                                            continue; // skip the normal push below
                                        }
                                    }
                                }
                                results.push({ name: file.name, status: 'ok', msg: 'Procesado correctamente', data });
                            } else {
                                const errText = await resp.text().catch(() => resp.statusText);
                                results.push({ name: file.name, status: 'error', msg: `Error ${resp.status}: ${errText} ` });
                            }
                        } catch (err: unknown) {
                            const errMsg = err instanceof Error ? err.message : 'Error de red';
                            results.push({ name: file.name, status: 'error', msg: errMsg });
                        }
                    }

                    setUploadResults(results);
                    setUploading(false);
                    setUploadFiles([]);
                    setTimeout(() => { reset(); }, 2000);
                };

                const handleDrop = (e: React.DragEvent) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
                    if (files.length > 0) setUploadFiles(prev => [...prev, ...files]);
                };

                const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const files = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
                    if (files.length > 0) setUploadFiles(prev => [...prev, ...files]);
                    e.target.value = '';
                };

                return (
                    <div className="card" style={{ padding: '2rem', maxWidth: 700, margin: '0 auto' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.25rem' }}>Cargar Factura o Ticket</h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 1.5rem' }}>
                            Arrastrá PDFs o Fotos (Fotos de tickets/facturas) acá. Se envían a n8n para extraer datos automáticamente y crear el comprobante.
                        </p>

                        {/* Drop zone */}
                        <div
                            onDrop={handleDrop}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onClick={() => document.getElementById('pdf-file-input')?.click()}
                            style={{
                                border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'} `,
                                borderRadius: 12, padding: '2.5rem 2rem', textAlign: 'center',
                                background: dragOver ? '#eff6ff' : '#f8fafc',
                                cursor: 'pointer', transition: 'all 0.2s ease',
                                marginBottom: '1.25rem',
                            }}
                        >
                            <UploadIcon size={40} color={dragOver ? '#3b82f6' : '#94a3b8'} />
                            <p style={{ fontSize: '0.9rem', color: dragOver ? '#3b82f6' : 'var(--color-text-muted)', margin: '0.75rem 0 0.25rem', fontWeight: 600 }}>
                                {dragOver ? 'Soltá el archivo acá' : 'Hacé click o arrastrá un PDF o Foto'}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Archivos .pdf, .jpg, .png</p>
                            <input
                                id="pdf-file-input"
                                type="file"
                                accept=".pdf,application/pdf,image/png,image/jpeg,image/jpg"
                                multiple
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {/* Queued files */}
                        {uploadFiles.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                                    Archivos seleccionados ({uploadFiles.length})
                                </div>
                                {uploadFiles.map((f, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                        background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
                                        marginBottom: 6, fontSize: '0.85rem',
                                    }}>
                                        <FileText size={16} color="#ef4444" />
                                        <span style={{ flex: 1, fontWeight: 500 }}>{f.name}</span>
                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{(f.size / 1024).toFixed(0)} KB</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e', padding: 2 }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={handleUploadFiles}
                                    disabled={uploading}
                                    className="btn btn-primary"
                                    style={{ marginTop: 8, gap: 6, width: '100%', justifyContent: 'center' }}
                                >
                                    {uploading ? (
                                        <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Enviando...</>
                                    ) : (
                                        <><Send size={16} /> Enviar {uploadFiles.length} {uploadFiles.length === 1 ? 'archivo' : 'archivos'} a n8n</>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Results */}
                        {uploadResults.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Resultados</div>
                                {uploadResults.map((r, i) => (
                                    <div key={i} style={{
                                        borderRadius: 10, marginBottom: 12, overflow: 'hidden',
                                        background: r.duplicate ? '#fffbeb' : r.status === 'ok' ? '#f0fdf4' : '#fef2f2',
                                        border: `1px solid ${r.duplicate ? '#fde68a' : r.status === 'ok' ? '#bbf7d0' : '#fecaca'} `,
                                    }}>
                                        {/* Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
                                            {r.duplicate ? <AlertTriangle size={16} color="#f59e0b" /> : r.status === 'ok' ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                            <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{r.name}</span>
                                            <span style={{ fontSize: '0.75rem', color: r.duplicate ? '#b45309' : r.status === 'ok' ? '#16a34a' : '#dc2626' }}>{r.msg}</span>
                                        </div>

                                        {/* Data card + PDF preview for successful results */}
                                        {r.status === 'ok' && r.data && (
                                            <div style={{ padding: '0 16px 16px' }}>
                                                {/* Provider + comprobante info */}
                                                <div style={{
                                                    background: '#fff', borderRadius: 8, padding: '14px 16px',
                                                    border: '1px solid #e2e8f0', marginBottom: r.data.pdf_url ? 12 : 0,
                                                }}>
                                                    {/* Provider row - prominent */}
                                                    {r.data.proveedor_nombre && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <FileText size={16} color="#2563eb" />
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{r.data.proveedor_nombre}</div>
                                                                {r.data.proveedor_cuit && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>CUIT: {r.data.proveedor_cuit}</div>}
                                                            </div>
                                                            {r.data.proveedor_nuevo && (
                                                                <span style={{ background: '#dbeafe', color: '#2563eb', fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>NUEVO</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {/* Details grid */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.8rem' }}>
                                                        {r.data.numero_comprobante && <div><span style={{ color: '#94a3b8' }}>Nº:</span> <strong>{r.data.numero_comprobante}</strong></div>}
                                                        {r.data.tipo_comprobante && <div><span style={{ color: '#94a3b8' }}>Tipo:</span> <strong>{r.data.tipo_comprobante}</strong></div>}
                                                        {r.data.fecha && <div><span style={{ color: '#94a3b8' }}>Fecha:</span> <strong>{r.data.fecha}</strong></div>}
                                                        {r.data.monto != null && <div><span style={{ color: '#94a3b8' }}>Monto:</span> <strong>${Number(r.data.monto).toLocaleString('es-AR')}</strong></div>}
                                                        {r.data.descripcion && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#94a3b8' }}>Descripción:</span> {r.data.descripcion}</div>}
                                                    </div>
                                                </div>

                                                {/* Embedded PDF preview */}
                                                {r.data.pdf_url && (
                                                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>📄 Vista previa del documento</span>
                                                            <button
                                                                onClick={() => setDocPreview(r.data!.pdf_url!)}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                    color: '#2563eb', fontSize: '0.7rem', fontWeight: 600,
                                                                    background: '#eff6ff', borderRadius: 4, border: '1px solid #bfdbfe',
                                                                    padding: '2px 8px', cursor: 'pointer',
                                                                }}
                                                            >
                                                                <Eye size={12} /> Ampliar
                                                            </button>
                                                        </div>
                                                        <DocumentViewer
                                                            url={r.data.pdf_url}
                                                            style={{ width: '100%', height: 350, background: '#fff' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}
            {/* ERP INJECTION MODAL */}
            {erpModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1, transition: 'opacity 0.2s' }}>
                    <div style={{ background: '#fff', borderRadius: 12, width: 400, transform: 'scale(1)', transition: 'transform 0.2s', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>Inyectar a ERP</h3>
                            <button onClick={() => setErpModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Seleccionar ERP Destino</label>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button 
                                        onClick={() => setErpSelected('xubio')}
                                        style={{ flex: 1, padding: '12px', borderRadius: 8, border: `2px solid ${erpSelected === 'xubio' ? '#2563eb' : '#e2e8f0'}`, background: erpSelected === 'xubio' ? '#eff6ff' : '#fff', color: erpSelected === 'xubio' ? '#1d4ed8' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        Xubio
                                    </button>
                                    <button 
                                        onClick={() => setErpSelected('colppy')}
                                        style={{ flex: 1, padding: '12px', borderRadius: 8, border: `2px solid ${erpSelected === 'colppy' ? '#059669' : '#e2e8f0'}`, background: erpSelected === 'colppy' ? '#ecfdf5' : '#fff', color: erpSelected === 'colppy' ? '#047857' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        Colppy
                                    </button>
                                </div>
                            </div>
                            
                            {erpSelected === 'colppy' && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Cuenta Contable (Requerida por Colppy)</label>
                                    <select
                                        value={selectedColpyAccount}
                                        onChange={e => setSelectedColpyAccount(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
                                    >
                                        <option value="">-- Seleccionar Cuenta --</option>
                                        {colpyAccounts.length === 0 && <option disabled>Cargando plan de cuentas...</option>}
                                        {colpyAccounts.map((c, i) => (
                                            <option key={i} value={c.Descripcion}>{c.idPlanCuenta} - {c.Descripcion}</option>
                                        ))}
                                    </select>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 8 }}>Esta cuenta se asignará a todos los ítems de esta factura.</p>
                                </div>
                            )}

                        </div>
                        <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <button
                                onClick={() => setErpModalOpen(false)}
                                style={{ padding: '8px 16px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', color: '#64748b', fontWeight: 500, cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={executeErpInjection}
                                disabled={!erpSelected || injectingErp}
                                style={{ padding: '8px 16px', borderRadius: 6, background: '#2563eb', border: 'none', color: '#fff', fontWeight: 600, cursor: (!erpSelected || injectingErp) ? 'not-allowed' : 'pointer', opacity: (!erpSelected || injectingErp) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                {injectingErp ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                                Inyectar Factura
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
