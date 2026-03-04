import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Search, Filter, Plus, Upload as UploadIcon, X, Send, FileText, CheckCircle, XCircle, Eye } from 'lucide-react';
import ComprobantesGrid from './ComprobantesGrid';
import { useComprobantes } from './useComprobantes';
import type { ComprobanteEstado } from './useComprobantes';
import { CommandBar, useCommandBar } from '../../../design-system/components/CommandBar/CommandBar';
import ComprobanteForm from './ComprobanteForm';

type TabKey = 'listado' | 'crear' | 'upload';

export default function Comprobantes() {
    const { tenant } = useTenant();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as TabKey) || 'listado';

    const [activeTab, setActiveTab] = useState<TabKey>(tabParam);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [busqueda, setBusqueda] = useState('');
    const [pdfPreview, setPdfPreview] = useState<string | null>(null);

    // Upload state
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploadResults, setUploadResults] = useState<{ name: string; status: 'ok' | 'error'; msg: string; data?: { numero_comprobante?: string; tipo?: string; tipo_comprobante?: string; fecha?: string; monto?: number; proveedor_nombre?: string; proveedor_cuit?: string; proveedor_nuevo?: boolean; pdf_url?: string; descripcion?: string } }[]>([]);

    const { open: cmdOpen, setOpen: setCmdOpen } = useCommandBar();

    const { data, totalCount, isLoading, hasMore, loadMore, reset, updateEstado } =
        useComprobantes({ tipo: filtroTipo, estado: filtroEstado, busqueda });

    // Load on mount and when filters change
    useEffect(() => { reset(); }, [filtroTipo, filtroEstado, busqueda]);

    // Sync tab from URL
    useEffect(() => {
        setActiveTab((searchParams.get('tab') as TabKey) || 'listado');
    }, [searchParams]);

    const handleTab = (tab: TabKey) => {
        setActiveTab(tab);
        setSearchParams(tab === 'listado' ? {} : { tab });
    };

    const handleAction = async (id: string, action: 'aprobar' | 'rechazar' | 'inyectar') => {
        const map: Record<string, ComprobanteEstado> = {
            aprobar: 'aprobado', rechazar: 'rechazado', inyectar: 'inyectado',
        };
        await updateEstado(id, map[action]);
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
        { key: 'crear' as TabKey, label: 'Nueva Factura', icon: <Plus size={13} /> },
        { key: 'upload' as TabKey, label: 'Subir PDF', icon: <UploadIcon size={13} /> },
    ];

    return (
        <>
            {/* Command Bar */}
            {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} />}

            {/* PDF Preview Modal */}
            {pdfPreview && (
                <div
                    className="modal-overlay"
                    onClick={() => setPdfPreview(null)}
                >
                    <div
                        style={{ background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', width: '90vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 className="modal-title">Comprobante PDF</h2>
                            <button className="btn btn-ghost btn-icon" onClick={() => setPdfPreview(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <iframe
                            src={pdfPreview}
                            style={{ flex: 1, border: 'none', background: '#fff' }}
                            title="PDF Comprobante"
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
                            title="Nueva factura (⌘N)"
                        >
                            <Plus size={13} /> Nueva <kbd style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'transparent', color: 'inherit', marginLeft: 4 }}>⌘N</kbd>
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
                    </div>

                    <ComprobantesGrid
                        data={data}
                        totalCount={totalCount}
                        isLoading={isLoading}
                        hasMore={hasMore}
                        onLoadMore={loadMore}
                        onAction={handleAction}
                        onPdfPreview={setPdfPreview}
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

                            const resp = await fetch(N8N_WEBHOOK, { method: 'POST', body: formData });

                            if (resp.ok) {
                                let data: typeof uploadResults[0]['data'] | undefined;

                                // n8n returns empty body — query Supabase for the created comprobante
                                if (tenant) {
                                    await new Promise(r => setTimeout(r, 2500));
                                    const { data: rows } = await supabase
                                        .from('contable_comprobantes')
                                        .select('numero_comprobante, tipo, tipo_comprobante, fecha, monto_original, descripcion, pdf_url, cuit_emisor, proveedor_id')
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
                                                .select('razon_social, cuit')
                                                .eq('id', row.proveedor_id)
                                                .single();
                                            if (prov) {
                                                provNombre = prov.razon_social;
                                                provCuit = prov.cuit || provCuit;
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
                    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
                    if (files.length > 0) setUploadFiles(prev => [...prev, ...files]);
                };

                const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const files = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
                    if (files.length > 0) setUploadFiles(prev => [...prev, ...files]);
                    e.target.value = '';
                };

                return (
                    <div className="card" style={{ padding: '2rem', maxWidth: 700, margin: '0 auto' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.25rem' }}>Subir Factura PDF</h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 1.5rem' }}>
                            Arrastrá PDFs de facturas acá. Se envían a n8n para extraer datos automáticamente y crear el comprobante.
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
                                {dragOver ? 'Soltá el archivo acá' : 'Hacé click o arrastrá un PDF'}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Solo archivos .pdf</p>
                            <input
                                id="pdf-file-input"
                                type="file"
                                accept=".pdf,application/pdf"
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
                                        background: r.status === 'ok' ? '#f0fdf4' : '#fef2f2',
                                        border: `1px solid ${r.status === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                                    }}>
                                        {/* Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
                                            {r.status === 'ok' ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                            <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem' }}>{r.name}</span>
                                            <span style={{ fontSize: '0.75rem', color: r.status === 'ok' ? '#16a34a' : '#dc2626' }}>{r.msg}</span>
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
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>📄 Vista previa del comprobante</span>
                                                            <button
                                                                onClick={() => setPdfPreview(r.data!.pdf_url!)}
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
                                                        <iframe
                                                            src={r.data.pdf_url}
                                                            style={{ width: '100%', height: 350, border: 'none', background: '#fff' }}
                                                            title={`Preview ${r.name}`}
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
