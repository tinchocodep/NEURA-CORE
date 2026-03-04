import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Plus, Upload as UploadIcon, X } from 'lucide-react';
import ComprobantesGrid from './ComprobantesGrid';
import { useComprobantes } from './useComprobantes';
import type { ComprobanteEstado } from './useComprobantes';
import { CommandBar, useCommandBar } from '../../../design-system/components/CommandBar/CommandBar';

type TabKey = 'listado' | 'crear' | 'upload';

export default function Comprobantes() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as TabKey) || 'listado';

    const [activeTab, setActiveTab] = useState<TabKey>(tabParam);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [busqueda, setBusqueda] = useState('');
    const [pdfPreview, setPdfPreview] = useState<string | null>(null);

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
                <div className="card" style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Formulario de nueva factura — integrar <code>ComprobanteForm</code> aquí.
                    </p>
                </div>
            )}

            {/* ── TAB: UPLOAD ── */}
            {activeTab === 'upload' && (
                <div className="card" style={{ padding: '2rem', maxWidth: 700, margin: '0 auto' }}>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        Zona de drag & drop PDF — PdfUploadZone aquí.
                    </p>
                </div>
            )}
        </>
    );
}
