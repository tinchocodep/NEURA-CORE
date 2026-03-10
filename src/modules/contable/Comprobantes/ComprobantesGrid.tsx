import { useCallback, useState } from 'react';
import {
    ArrowDownLeft, ArrowUpRight, CheckCircle, XCircle, Send,
    Eye, Upload as UploadIcon, Trash2
} from 'lucide-react';
import { DataGrid } from '../../../design-system/components/DataGrid/DataGrid';
import type { ColumnDef } from '../../../design-system/components/DataGrid/DataGrid';
import type { Comprobante, ComprobanteEstado } from './useComprobantes';
import TagPicker from './TagPicker';

const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const ESTADO_BADGE: Record<ComprobanteEstado, { bg: string; color: string; label: string }> = {
    pendiente: { bg: 'var(--color-warning-dim)', color: 'var(--color-warning)', label: 'Pendiente' },
    clasificado: { bg: 'var(--color-info-dim)', color: 'var(--color-info)', label: 'Clasificado' },
    aprobado: { bg: 'var(--color-success-dim)', color: 'var(--color-success)', label: 'Aprobado' },
    inyectado: { bg: 'var(--color-success-dim)', color: 'var(--color-success)', label: 'Inyectado' },
    error: { bg: 'var(--color-danger-dim)', color: 'var(--color-danger)', label: 'Error' },
    rechazado: { bg: 'var(--color-danger-dim)', color: 'var(--color-danger)', label: 'Rechazado' },
};

interface Props {
    data: Comprobante[];
    totalCount: number;
    isLoading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    onAction: (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => void;
    onDocPreview: (url: string) => void;
    selectedIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;
    onSort?: (colId: string, dir: 'asc' | 'desc') => void;
    sortCol?: string | null;
    sortDir?: 'asc' | 'desc';
    onAttachInvoice?: (id: string) => void;
}

export default function ComprobantesGrid({
    data, totalCount, isLoading, hasMore, onLoadMore, onAction, onDocPreview,
    selectedIds, onSelectionChange, onSort, sortCol, sortDir, onAttachInvoice
}: Props) {
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
            width: 36,
            accessor: (c) => c.tipo === 'compra'
                ? <ArrowDownLeft size={14} color="var(--color-danger)" />
                : <ArrowUpRight size={14} color="var(--color-success)" />,
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
                const name = c.tipo === 'compra'
                    ? (c.proveedor as any)?.razon_social
                    : (c.cliente as any)?.razon_social;
                return name || <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
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
                const cfg = ESTADO_BADGE[c.estado];
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
                    {c.estado === 'aprobado' && (
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
                { label: 'CUIT Emisor', value: c.cuit_emisor, mono: true },
                { label: 'CUIT Receptor', value: c.cuit_receptor, mono: true },
                { label: 'Fuente', value: c.source },
                { label: 'Fecha de Carga', value: new Date(c.created_at).toLocaleString('es-AR') },
            ].filter(f => f.value).map(f => (
                <div key={f.label}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
                    <div style={{
                        fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                        fontFamily: f.mono ? 'var(--font-mono)' : undefined,
                    }}>{f.value}</div>
                </div>
            ))}
            {/* Tags — flows after data fields, next to Fecha de Carga */}
            <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Etiquetas</div>
                <TagPicker comprobanteId={c.id} />
            </div>
            {c.pdf_url && (
                <div style={{ gridColumn: '1/-1' }}>
                    <button
                        onClick={() => onDocPreview(c.pdf_url!.trim())}
                        className="btn btn-ghost btn-sm"
                        style={{ gap: 6 }}
                    >
                        <Eye size={13} /> Ver documento adjunto
                    </button>
                </div>
            )}
        </div>
    );

    const emptyState = (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <UploadIcon size={36} style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Sin comprobantes</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Creá una factura o subí un PDF para empezar</p>
        </div>
    );

    return (
        <DataGrid
            columns={columns}
            data={data}
            totalCount={totalCount}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={onLoadMore}
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
                i: (row) => onAction(row.id, 'inyectar'),
            }}
        />
    );
}
