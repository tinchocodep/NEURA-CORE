import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Search, Filter, Plus, Upload as UploadIcon, X, Send, FileText, CheckCircle, XCircle, Eye, Calendar, Download, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import ComprobantesGrid from './ComprobantesGrid';
import { useComprobantes } from './useComprobantes';
import type { ComprobanteEstado } from './useComprobantes';
import { CommandBar, useCommandBar } from '../../../design-system/components/CommandBar/CommandBar';
import ComprobanteForm from './ComprobanteForm';
import GastoIngresoForm from './GastoIngresoForm';
import { DocumentViewer } from '../../../shared/components/DocumentViewer';

type TabKey = 'listado' | 'crear' | 'upload' | 'gasto' | 'ingreso';

export default function Comprobantes() {
    const { tenant } = useTenant();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as TabKey) || 'listado';

    const [activeTab, setActiveTab] = useState<TabKey>(tabParam);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [busqueda, setBusqueda] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [docPreview, setDocPreview] = useState<string | null>(null);



    const [exportando, setExportando] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [sortCol, setSortCol] = useState<string | null>('fecha');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Upload state
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploadResults, setUploadResults] = useState<{ name: string; status: 'ok' | 'error'; msg: string; duplicate?: boolean; duplicateCount?: number; data?: { numero_comprobante?: string; tipo?: string; tipo_comprobante?: string; fecha?: string; monto?: number; proveedor_nombre?: string; proveedor_cuit?: string; proveedor_nuevo?: boolean; pdf_url?: string; descripcion?: string } }[]>([]);

    const { open: cmdOpen, setOpen: setCmdOpen } = useCommandBar();

    const { data, totalCount, isLoading, hasMore, loadMore, reset, updateEstado, eliminarComprobante } =
        useComprobantes({ tipo: filtroTipo, estado: filtroEstado, busqueda, fechaDesde, fechaHasta, sortCol, sortDir });

    // Load on mount, when filters change, or when tenant is available
    useEffect(() => { reset(); setSelectedIds(new Set()); }, [tenant?.id, filtroTipo, filtroEstado, busqueda, fechaDesde, fechaHasta, sortCol, sortDir]);

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

    const handleAction = async (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => {
        if (action === 'eliminar') {
            if (confirm('¿Estás seguro de que deseas eliminar permanentemente este comprobante rechazado?')) {
                await eliminarComprobante(id);
            }
            return;
        }

        if (action === 'inyectar') {
            // Attempt real Xubio injection
            try {
                const { getXubioService } = await import('../../../services/XubioService');
                const xubio = getXubioService(tenant!.id);
                await xubio.loadConfig();

                if (!xubio.isConfigured) {
                    // No credentials — just update status without injection
                    await updateEstado(id, 'inyectado');
                    return;
                }

                // Fetch full comprobante with entity xubio_id
                const { data: comp } = await supabase
                    .from('contable_comprobantes')
                    .select('*, proveedor:contable_proveedores(xubio_id), cliente:contable_clientes(xubio_id)')
                    .eq('id', id)
                    .single();

                if (!comp) { await updateEstado(id, 'inyectado'); return; }

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
                    // Mark as inyectado + save xubio_id
                    await supabase.from('contable_comprobantes').update({
                        estado: 'inyectado',
                        xubio_id: result.xubioId,
                        xubio_synced_at: new Date().toISOString(),
                    }).eq('id', id);
                    reset(); // Refresh list
                } else {
                    alert(`Error al inyectar en Xubio: ${result.error}`);
                    // Still allow marking as inyectado if user wants
                    if (confirm('¿Marcar como inyectado de todas formas?')) {
                        await updateEstado(id, 'inyectado');
                    }
                }
            } catch (err) {
                console.error('[Xubio] Injection error:', err);
                alert(`Error: ${(err as Error).message}`);
            }
        } else {
            const map: Record<string, ComprobanteEstado> = {
                aprobar: 'aprobado', rechazar: 'rechazado',
            };
            if (map[action]) {
                await updateEstado(id, map[action]);
            }
        }
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
        { key: 'crear' as TabKey, label: 'Emitir Factura', icon: <Plus size={13} /> },
        { key: 'upload' as TabKey, label: 'Cargar Factura', icon: <UploadIcon size={13} /> },
        { key: 'gasto' as TabKey, label: 'Cargar Gasto', icon: <FileText size={13} /> },
        { key: 'ingreso' as TabKey, label: 'Cargar Ingreso', icon: <FileText size={13} /> },
    ];

    return (
        <>
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

            {/* Page header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                        <h1>Comprobantes</h1>
                        <p>Facturas de compra y venta · {totalCount.toLocaleString('es-AR')} registros</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setCmdOpen(true)}
                            title="Buscar (⌘K)"
                        >
                            <Search size={13} /> Buscar <kbd style={{ marginLeft: 4 }}>⌘K</kbd>
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleTab('crear')}
                            title="Emitir factura (⌘N)"
                        >
                            <Plus size={13} /> Emitir <kbd style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'transparent', color: 'inherit', marginLeft: 4 }}>⌘N</kbd>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
                        onClick={() => handleTab(tab.key)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
                {/* Keyboard hint */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: 2 }}>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                        <kbd>↑↓</kbd> navegar · <kbd>Enter</kbd> detalle · <kbd>A</kbd> aprobar · <kbd>R</kbd> rechazar · <kbd>I</kbd> inyectar
                    </span>
                </div>
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
                        onLoadMore={loadMore}
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
                                                msg: `⚠️ Procesado, pero ya existe${dupes.length > 1 ? 'n' : ''} ${dupes.length} comprobante${dupes.length > 1 ? 's' : ''} con el mismo número (${row.numero_comprobante})`,
                                                duplicate: true, duplicateCount: dupes.length, data,
                                            });
                                            continue; // skip the normal push below
                                        }
                                    }
                                }
                                results.push({ name: file.name, status: 'ok', msg: 'Procesado correctamente', data });
                            } else {
                                const errText = await resp.text().catch(() => resp.statusText);
                                results.push({ name: file.name, status: 'error', msg: `Error ${resp.status}: ${errText}` });
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
                                border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`,
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
                                        border: `1px solid ${r.duplicate ? '#fde68a' : r.status === 'ok' ? '#bbf7d0' : '#fecaca'}`,
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
        </>
    );
}
