import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowDownLeft, ArrowUpRight, CheckCircle, XCircle, Send,
    Eye, Upload as UploadIcon, Trash2, ExternalLink, Copy,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { DataGrid } from '../../../design-system/components/DataGrid/DataGrid';
import type { ColumnDef } from '../../../design-system/components/DataGrid/DataGrid';
import type { Comprobante } from './useComprobantes';
import TagPicker from './TagPicker';

const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    pendiente: { bg: 'var(--color-warning-dim)', color: 'var(--color-warning)', label: 'Pendiente' },
    clasificado: { bg: 'var(--color-info-dim)', color: 'var(--color-info)', label: 'Clasificado' },
    aprobado: { bg: 'var(--color-info-dim)', color: 'var(--color-info)', label: 'Aprobado' },
    error: { bg: 'var(--color-danger-dim)', color: 'var(--color-danger)', label: 'Error' },
    rechazado: { bg: 'var(--color-danger-dim)', color: 'var(--color-danger)', label: 'Rechazado' },
    vencido: { bg: 'var(--color-danger-dim)', color: 'var(--color-danger)', label: 'Vencido' },
    pagado: { bg: 'var(--color-success-dim)', color: 'var(--color-success)', label: 'Pagado' },
};

interface Props {
    data: Comprobante[];
    totalCount: number;
    isLoading: boolean;
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onAction: (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => void;
    onDocPreview: (url: string) => void;
    selectedIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;
    onSort?: (colId: string, dir: 'asc' | 'desc') => void;
    sortCol?: string | null;
    sortDir?: 'asc' | 'desc';
    onAttachInvoice?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    hasErp?: boolean;
    // Constructora-only: editar centro de costos (proyecto) y categoría desde la card expandida
    esConstructora?: boolean;
    proyectoOpts?: { id: string; name: string }[];
    categoriaOpts?: { id: string; nombre: string; color: string }[];
    onUpdateClasificacion?: (id: string, changes: { proyecto_id?: string | null; categoria_id?: string | null }) => Promise<boolean>;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ComprobantesGrid({
    data, totalCount, isLoading, hasMore, currentPage, totalPages, pageSize,
    onPageChange, onPageSizeChange, onAction, onDocPreview,
    selectedIds, onSelectionChange, onSort, sortCol, sortDir, onAttachInvoice, onDuplicate, hasErp,
    esConstructora = false, proyectoOpts = [], categoriaOpts = [], onUpdateClasificacion
}: Props) {
    const navigate = useNavigate();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleRowActivate = useCallback((row: Comprobante) => {
        setExpandedId(prev => prev === row.id ? null : row.id);
    }, []);

    const allSelected = data.length > 0 && data.every(c => selectedIds.has(c.id));
    const someSelected = data.some(c => selectedIds.has(c.id)) && !allSelected;

    const toggleAll = () => {
        if (allSelected) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(data.map(c => c.id)));
        }
    };

    const toggleOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        onSelectionChange(next);
    };

    const columns: ColumnDef<Comprobante>[] = [
        {
            id: 'select',
            header: (
                <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', accentColor: 'var(--brand)' }}
                />
            ) as any,
            width: 36,
            accessor: (c) => (
                <div onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--brand)' }}
                    />
                </div>
            ),
        },
        {
            id: 'tipo',
            header: '',
            width: 72,
            accessor: (c) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {c.tipo === 'compra'
                        ? <ArrowDownLeft size={14} color="var(--color-danger)" />
                        : <ArrowUpRight size={14} color="var(--color-success)" />}
                    <span style={{
                        fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                        padding: '1px 5px', borderRadius: 4, letterSpacing: '0.03em',
                        background: c.tipo === 'compra' ? 'var(--color-danger-dim)' : 'var(--color-success-dim)',
                        color: c.tipo === 'compra' ? 'var(--color-danger)' : 'var(--color-success)',
                    }}>{c.tipo === 'compra' ? 'Compra' : 'Venta'}</span>
                </div>
            ),
        },
        {
            id: 'fecha',
            header: 'Fecha',
            width: 90,
            pinned: 'left',
            sortable: true,
            accessor: (c) => (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {new Date(c.fecha).toLocaleDateString('es-AR')}
                </span>
            ),
        },
        {
            id: 'numero',
            header: 'Comprobante',
            width: 160,
            accessor: (c) => {
                const isSinFactura = c.tipo_comprobante === 'Sin Factura';
                return (
                    <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>
                            {c.numero_comprobante || (isSinFactura ? (
                                <span style={{
                                    background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb',
                                    padding: '0.15rem 0.4rem', borderRadius: 4,
                                    fontSize: '0.65rem', fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '0.05em'
                                }}>
                                    Sin Factura
                                </span>
                            ) : '—')}
                        </div>
                        {c.tipo_comprobante && !isSinFactura && (
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                                {c.tipo_comprobante}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            id: 'entidad',
            header: 'Entidad',
            minWidth: 160,
            className: 'cell-primary',
            accessor: (c) => {
                let name = c.tipo === 'compra'
                    ? (c.proveedor as any)?.razon_social
                    : (c.cliente as any)?.razon_social;

                // Si viene de colpy y no matcheó un UUID, intentamos rescatarlo del string guardado
                if (!name && c.source === 'colpy' && c.descripcion) {
                    const match = c.descripcion.match(/Entidad:\s*(.+)/i);
                    if (match && match[1]) {
                        name = match[1].trim();
                     }
                }

                const entityId = c.tipo === 'compra' ? c.proveedor_id : c.cliente_id;
                const hasEntity = !!entityId;
                const entityRoute = c.tipo === 'compra' ? '/contable/proveedores' : '/contable/clientes';
                const entityParam = c.tipo === 'compra' ? `?id=${entityId}` : `?cliente_id=${entityId}`;

                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            title={name || undefined}
                        >
                            {name || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </div>
                        {hasEntity && name && (
                            <button
                                onClick={(e) => { e.stopPropagation(); navigate(entityRoute + entityParam); }}
                                className="btn btn-ghost btn-icon"
                                style={{ padding: 2, flexShrink: 0 }}
                                title={c.tipo === 'compra' ? 'Ver Proveedor' : 'Ver Cliente'}
                            >
                                <ExternalLink size={12} color="var(--color-accent)" />
                            </button>
                        )}
                    </div>
                );
            },
        },
        {
            id: 'producto',
            header: 'Producto/Servicio',
            minWidth: 140,
            accessor: (c) => {
                const name = (c.producto_servicio as any)?.nombre;
                const cat = (c.categoria as any);

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {name ? (
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>{name}</span>
                        ) : (
                            (c.proveedor as any)?.producto_servicio_default_id ? (
                                <span style={{ color: 'var(--color-warning)', fontSize: '0.75rem', fontStyle: 'italic' }}>Pendiente vincular</span>
                            ) : (
                                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin clasificar</span>
                            )
                        )}
                        {cat && (
                            <span style={{
                                backgroundColor: `${cat.color}20`,
                                color: cat.color,
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                width: 'fit-content',
                                whiteSpace: 'nowrap'
                            }}>
                                {cat.nombre}
                            </span>
                        )}
                    </div>
                );
            },
        },
        ...(esConstructora ? [{
            id: 'clasificacion',
            header: 'Clasificación',
            minWidth: 160,
            accessor: (c: Comprobante) => {
                const proy = (c as any).proyecto;
                const cat = c.categoria as any;
                if (!proy && !cat) return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>—</span>;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {proy && (
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>{proy.name}</span>
                        )}
                        {cat && (
                            <span style={{
                                backgroundColor: `${cat.color}20`,
                                color: cat.color,
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                width: 'fit-content',
                                whiteSpace: 'nowrap',
                            }}>{cat.nombre}</span>
                        )}
                    </div>
                );
            },
        } as ColumnDef<Comprobante>] : []),
        {
            id: 'monto',
            header: 'Monto',
            width: 130,
            align: 'right',
            accessor: (c) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>
                        {fmt(c.monto_ars || c.monto_original)}
                    </div>
                    {c.moneda === 'USD' && c.tipo_cambio && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                            USD {c.monto_original.toLocaleString('es-AR')} · TC {c.tipo_cambio}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: 'score',
            header: 'Score',
            width: 60,
            align: 'center',
            accessor: (c) => {
                if (!c.clasificacion_score) return null;
                const color = c.clasificacion_score >= 80
                    ? 'var(--color-success)'
                    : c.clasificacion_score >= 50
                        ? 'var(--color-warning)'
                        : 'var(--color-danger)';
                const bg = c.clasificacion_score >= 80
                    ? 'var(--color-success-dim)'
                    : c.clasificacion_score >= 50
                        ? 'var(--color-warning-dim)'
                        : 'var(--color-danger-dim)';
                return (
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.6875rem', fontWeight: 700,
                        background: bg, color, margin: '0 auto',
                    }}>
                        {c.clasificacion_score}
                    </div>
                );
            },
        },
        {
            id: 'estado',
            header: 'Estado',
            width: 110,
            accessor: (c) => {
                const cfg = ESTADO_BADGE[c.estado] || { bg: 'var(--color-warning-dim)', color: 'var(--color-warning)', label: c.estado || 'Desconocido' };
                return (
                    <span className="badge" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                    </span>
                );
            },
        },
        {
            id: 'actions',
            header: '',
            width: 140,
            accessor: (c) => (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {c.tipo === 'venta' && onDuplicate && (
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => onDuplicate(c.id)}
                            title="Duplicar (emitir una nueva con estos datos)"
                        >
                            <Copy size={13} color="var(--color-accent)" />
                        </button>
                    )}
                    {c.pdf_url && (
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => onDocPreview(c.pdf_url!.trim())}
                            title="Ver documento"
                        >
                            <Eye size={13} color="var(--color-info)" />
                        </button>
                    )}
                    {!c.pdf_url && (c.tipo_comprobante === 'Sin Factura' || !c.numero_comprobante) && onAttachInvoice && (
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => onAttachInvoice(c.id)}
                            title="Adjuntar PDF/Comprobante"
                        >
                            <UploadIcon size={13} color="var(--color-text-secondary)" />
                        </button>
                    )}
                    {(c.estado === 'clasificado' || c.estado === 'pendiente') && (
                        <>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => onAction(c.id, 'aprobar')}
                                title="Aprobar [A]"
                            >
                                <CheckCircle size={13} color="var(--color-success)" />
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => onAction(c.id, 'rechazar')}
                                title="Rechazar [R]"
                            >
                                <XCircle size={13} color="var(--color-danger)" />
                            </button>
                        </>
                    )}
                    {c.estado === 'aprobado' && c.source !== 'colpy' && c.source !== 'xubio' && hasErp && (
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={() => onAction(c.id, 'inyectar')}
                            title="Inyectar [I]"
                            style={{ gap: 4, padding: '0.2rem 0.5rem' }}
                        >
                            <Send size={11} /> Inyectar
                        </button>
                    )}
                    {c.estado === 'rechazado' && (
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => onAction(c.id, 'eliminar')}
                            title="Eliminar"
                        >
                            <Trash2 size={13} color="var(--color-danger)" />
                        </button>
                    )}
                </div>
            ),
        },
    ];

    const renderExpanded = (c: Comprobante) => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '0.75rem 1.5rem',
            padding: '1rem 1.5rem',
            borderBottom: '2px solid var(--color-accent-border)',
        }}>
            {c.descripcion && (
                <div style={{ gridColumn: '1/-1' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Descripción</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{c.descripcion}</div>
                </div>
            )}
            {[
                { label: 'Monto Original', value: `${c.moneda} ${Number(c.monto_original).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` },
                { label: 'Monto ARS', value: `$${Number(c.monto_ars || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` },
                { label: 'Neto Gravado', value: c.neto_gravado ? `$${Number(c.neto_gravado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null },
                { label: 'Neto No Gravado', value: c.neto_no_gravado ? `$${Number(c.neto_no_gravado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null },
                { label: 'Total IVA', value: c.total_iva ? `$${Number(c.total_iva).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null },
                { label: 'Percep. IIBB', value: c.percepciones_iibb ? `$${Number(c.percepciones_iibb).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null },
                { label: 'Percep. IVA', value: c.percepciones_iva ? `$${Number(c.percepciones_iva).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null },
                { label: 'Fecha Vencimiento', value: c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString('es-AR') : null },
                { label: 'CUIT Emisor', value: c.cuit_emisor, mono: true },
                { label: 'CUIT Receptor', value: c.cuit_receptor, mono: true },
                { label: 'Fuente', value: c.source },
                { label: 'Sincronizado/Carga', value: new Date(c.colpy_synced_at || c.created_at).toLocaleString('es-AR') },
            ].filter(f => f.value).map(f => (
                <div key={f.label}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
                    <div style={{
                        fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                        fontFamily: f.mono ? 'var(--font-mono)' : undefined,
                    }}>{f.value}</div>
                </div>
            ))}
            {/* Constructora-only: editar centro de costos (proyecto) y categoría */}
            {esConstructora && onUpdateClasificacion && (
                <>
                    <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Centro de Costos</div>
                        <select
                            value={(c as any).proyecto_id || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onUpdateClasificacion(c.id, { proyecto_id: e.target.value || null })}
                            style={{
                                width: '100%', padding: '4px 8px', fontSize: '0.8125rem',
                                background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                                border: '1px solid var(--color-border-subtle)', borderRadius: 6, cursor: 'pointer',
                            }}
                        >
                            <option value="">— sin asignar —</option>
                            {proyectoOpts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Clasificación</div>
                        <select
                            value={(c as any).categoria_id || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onUpdateClasificacion(c.id, { categoria_id: e.target.value || null })}
                            style={{
                                width: '100%', padding: '4px 8px', fontSize: '0.8125rem',
                                background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                                border: '1px solid var(--color-border-subtle)', borderRadius: 6, cursor: 'pointer',
                            }}
                        >
                            <option value="">— sin asignar —</option>
                            {categoriaOpts.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                        </select>
                    </div>
                </>
            )}
            {/* Tags — flows after data fields, next to Fecha de Carga */}
            <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Etiquetas</div>
                <TagPicker comprobanteId={c.id} />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {c.tipo === 'compra' && c.proveedor_id && (c.proveedor as any)?.razon_social && (
                    <button
                        onClick={() => navigate(`/contable/proveedores?id=${c.proveedor_id}`)}
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                    >
                        <ExternalLink size={13} /> Ver Proveedor: {(c.proveedor as any).razon_social}
                    </button>
                )}
                {c.tipo === 'venta' && c.cliente_id && (c.cliente as any)?.razon_social && (
                    <button
                        onClick={() => navigate(`/contable/clientes?cliente_id=${c.cliente_id}`)}
                        className="btn btn-secondary btn-sm"
                        style={{ gap: 6 }}
                    >
                        <ExternalLink size={13} /> Ver Cliente: {(c.cliente as any).razon_social}
                    </button>
                )}
                {c.pdf_url && (
                    <button
                        onClick={() => onDocPreview(c.pdf_url!.trim())}
                        className="btn btn-ghost btn-sm"
                        style={{ gap: 6 }}
                    >
                        <Eye size={13} /> Ver documento adjunto
                    </button>
                )}
            </div>
        </div>
    );

    const emptyState = (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <UploadIcon size={36} style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Sin comprobantes</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Creá una factura o subí un PDF para empezar</p>
        </div>
    );

    const fromItem = totalCount === 0 ? 0 : currentPage * pageSize + 1;
    const toItem = Math.min((currentPage + 1) * pageSize, totalCount);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <DataGrid
                columns={columns}
                data={data}
                totalCount={totalCount}
                isLoading={isLoading}
                hasMore={false}
                onLoadMore={() => {}}
                onRowActivate={handleRowActivate}
                expandedRowId={expandedId}
                renderExpanded={renderExpanded}
                emptyState={emptyState}
                onSort={onSort}
                sortCol={sortCol}
                sortDir={sortDir}
                keyboardShortcuts={{
                    a: (row) => onAction(row.id, 'aprobar'),
                    r: (row) => onAction(row.id, 'rechazar'),
                    ...(hasErp ? { i: (row: any) => onAction(row.id, 'inyectar') } : {}),
                }}
            />

            {/* Pagination footer */}
            {totalCount > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderTop: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-bg-surface)',
                    borderRadius: '0 0 12px 12px',
                    fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
                    flexWrap: 'wrap', gap: '0.5rem',
                }}>
                    {/* Left: page size selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Mostrar</span>
                        <select
                            value={pageSize}
                            onChange={e => onPageSizeChange(Number(e.target.value))}
                            style={{
                                padding: '4px 8px', borderRadius: 6,
                                border: '1px solid var(--color-border-subtle)',
                                background: 'var(--color-bg)', color: 'var(--color-text-primary)',
                                fontSize: '0.8125rem', cursor: 'pointer',
                            }}
                        >
                            {PAGE_SIZE_OPTIONS.map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                        <span>por página</span>
                    </div>

                    {/* Center: showing X-Y of Z */}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fromItem}–{toItem} de {totalCount}
                    </span>

                    {/* Right: page navigation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                            onClick={() => onPageChange(0)}
                            disabled={currentPage === 0}
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Primera página"
                            style={{ opacity: currentPage === 0 ? 0.3 : 1 }}
                        >
                            <ChevronsLeft size={16} />
                        </button>
                        <button
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 0}
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Página anterior"
                            style={{ opacity: currentPage === 0 ? 0.3 : 1 }}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ padding: '0 8px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {currentPage + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={!hasMore}
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Página siguiente"
                            style={{ opacity: !hasMore ? 0.3 : 1 }}
                        >
                            <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={() => onPageChange(totalPages - 1)}
                            disabled={!hasMore}
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Última página"
                            style={{ opacity: !hasMore ? 0.3 : 1 }}
                        >
                            <ChevronsRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
