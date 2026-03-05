import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */

export interface ColumnDef<T> {
    id: string;
    header: string;
    accessor: (row: T) => React.ReactNode;
    width?: number;        // px, optional
    minWidth?: number;
    className?: string;
    headerClassName?: string;
    pinned?: 'left';
    sortable?: boolean;
    align?: 'left' | 'right' | 'center';
}

export interface BulkAction<T> {
    label: string;
    icon?: React.ReactNode;
    onClick: (rows: T[]) => void;
    variant?: 'default' | 'danger';
}

interface DataGridProps<T extends { id: string }> {
    columns: ColumnDef<T>[];
    data: T[];
    totalCount?: number;
    isLoading?: boolean;
    hasMore?: boolean;
    onLoadMore?: () => void;
    onRowActivate?: (row: T) => void;         // Enter key or row click
    onRowSelect?: (ids: Set<string>) => void;
    bulkActions?: BulkAction<T>[];
    expandedRowId?: string | null;
    renderExpanded?: (row: T) => React.ReactNode;
    emptyState?: React.ReactNode;
    keyboardShortcuts?: Record<string, (row: T) => void>; // e.g. { 'a': approve, 'r': reject }
}

/* ─── Component ─────────────────────────────────────── */

export function DataGrid<T extends { id: string }>({
    columns,
    data,
    totalCount,
    isLoading,
    hasMore,
    onLoadMore,
    onRowActivate,
    onRowSelect,
    bulkActions,
    expandedRowId,
    renderExpanded,
    emptyState,
    keyboardShortcuts,
}: DataGridProps<T>) {
    const [focusedIdx, setFocusedIdx] = useState<number>(-1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const tbodyRef = useRef<HTMLTableSectionElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Intersection Observer for infinite scroll
    useEffect(() => {
        if (!onLoadMore || !hasMore || !loadMoreRef.current) return;
        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) onLoadMore(); },
            { threshold: 0.1 }
        );
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [onLoadMore, hasMore, data.length]);

    // Notify parent of selection changes
    useEffect(() => {
        onRowSelect?.(selectedIds);
    }, [selectedIds]);

    const toggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const handleSort = (colId: string) => {
        if (sortCol === colId) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(colId);
            setSortDir('desc');
        }
    };

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (data.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIdx(i => Math.min(i + 1, data.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIdx(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                if (focusedIdx >= 0 && focusedIdx < data.length) {
                    onRowActivate?.(data[focusedIdx]);
                }
                break;
            case ' ':
                e.preventDefault();
                if (focusedIdx >= 0 && focusedIdx < data.length) {
                    toggleSelect(data[focusedIdx].id);
                }
                break;
            default:
                // Custom shortcuts (a, r, i, etc.)
                if (keyboardShortcuts && focusedIdx >= 0 && data[focusedIdx]) {
                    const handler = keyboardShortcuts[e.key.toLowerCase()];
                    if (handler) {
                        e.preventDefault();
                        handler(data[focusedIdx]);
                    }
                }
        }
    }, [data, focusedIdx, onRowActivate, keyboardShortcuts, toggleSelect]);

    // Focus selected row in DOM
    useEffect(() => {
        if (focusedIdx < 0 || !tbodyRef.current) return;
        const rows = tbodyRef.current.querySelectorAll('tr[data-grid-row]');
        const el = rows[focusedIdx] as HTMLElement;
        el?.focus({ preventScroll: false });
    }, [focusedIdx]);

    // Bulk action bar
    const selectedRows = data.filter(r => selectedIds.has(r.id));

    return (
        <div className="data-grid-wrapper" onKeyDown={handleKeyDown} tabIndex={-1}>
            {/* Bulk action bar */}
            {selectedIds.size > 0 && bulkActions && bulkActions.length > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.625rem 1rem',
                    background: 'var(--color-accent-dim)',
                    borderBottom: '1px solid var(--color-accent-border)',
                }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
                        {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {bulkActions.map((action, i) => (
                            <button
                                key={i}
                                className={`btn btn-sm ${action.variant === 'danger' ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => action.onClick(selectedRows)}
                            >
                                {action.icon}{action.label}
                            </button>
                        ))}
                    </div>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedIds(new Set())}
                        style={{ marginLeft: 'auto' }}
                    >
                        Limpiar
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="data-grid-scroll">
                <table className="data-grid">
                    <thead>
                        <tr>
                            {/* Select all */}
                            {bulkActions && (
                                <th style={{ width: 40 }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === data.length && data.length > 0}
                                        onChange={e => {
                                            if (e.target.checked) setSelectedIds(new Set(data.map(r => r.id)));
                                            else setSelectedIds(new Set());
                                        }}
                                        style={{ accentColor: 'var(--color-accent)' }}
                                    />
                                </th>
                            )}
                            {columns.map(col => (
                                <th
                                    key={col.id}
                                    className={[
                                        col.sortable ? 'sortable' : '',
                                        col.pinned === 'left' ? 'pinned-left' : '',
                                        col.headerClassName || '',
                                    ].join(' ')}
                                    style={{ width: col.width, minWidth: col.minWidth, textAlign: col.align }}
                                    onClick={col.sortable ? () => handleSort(col.id) : undefined}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {col.header}
                                        {col.sortable && sortCol === col.id && (
                                            sortDir === 'asc'
                                                ? <ArrowUp size={10} color="var(--color-accent)" />
                                                : <ArrowDown size={10} color="var(--color-accent)" />
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody ref={tbodyRef}>
                        {isLoading && data.length === 0 ? (
                            <>
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={`skel-${i}`} style={{ height: 'var(--grid-row-height, 44px)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                                        <td colSpan={columns.length + (bulkActions ? 1 : 0)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0 0.875rem', animationDelay: `${i * 0.08}s` }}>
                                                <div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                                                <div className="skeleton skeleton-text" style={{ width: 70, animationDelay: `${i * 0.08 + 0.05}s` }} />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div className="skeleton skeleton-text" style={{ width: 120, animationDelay: `${i * 0.08 + 0.1}s` }} />
                                                    <div className="skeleton skeleton-text" style={{ width: 80, height: 9, animationDelay: `${i * 0.08 + 0.15}s` }} />
                                                </div>
                                                <div className="skeleton skeleton-text-lg" style={{ width: 140, flex: 1, maxWidth: 160, animationDelay: `${i * 0.08 + 0.2}s` }} />
                                                <div className="skeleton skeleton-text" style={{ width: 90, animationDelay: `${i * 0.08 + 0.25}s` }} />
                                                <div className="skeleton skeleton-circle" style={{ width: 28, height: 28, flexShrink: 0, animationDelay: `${i * 0.08 + 0.3}s` }} />
                                                <div className="skeleton skeleton-badge" style={{ animationDelay: `${i * 0.08 + 0.35}s` }} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (bulkActions ? 1 : 0)} style={{ padding: 0, border: 'none' }}>
                                    {emptyState || (
                                        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                            Sin resultados
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ) : (
                            data.map((row, idx) => {
                                const isSelected = selectedIds.has(row.id);
                                const isExpanded = expandedRowId === row.id;
                                return (
                                    <React.Fragment key={row.id}>
                                        <tr
                                            data-grid-row={idx}
                                            tabIndex={0}
                                            className={isSelected ? 'selected' : ''}
                                            style={{ outline: 'none' }}
                                            onClick={() => {
                                                setFocusedIdx(idx);
                                                onRowActivate?.(row);
                                            }}
                                            onFocus={() => setFocusedIdx(idx)}
                                        >
                                            {bulkActions && (
                                                <td style={{ width: 40 }} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelect(row.id)}
                                                        style={{ accentColor: 'var(--color-accent)' }}
                                                    />
                                                </td>
                                            )}
                                            {columns.map(col => (
                                                <td
                                                    key={col.id}
                                                    className={[
                                                        col.pinned === 'left' ? 'pinned-left' : '',
                                                        col.className || '',
                                                    ].join(' ')}
                                                    style={{ textAlign: col.align, maxWidth: col.width }}
                                                >
                                                    {col.accessor(row)}
                                                </td>
                                            ))}
                                        </tr>

                                        {/* Expanded detail row */}
                                        {isExpanded && renderExpanded && (
                                            <tr className="expanded-row">
                                                <td colSpan={columns.length + (bulkActions ? 1 : 0)}>
                                                    {renderExpanded(row)}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Load more sentinel */}
            {hasMore && (
                <div ref={loadMoreRef} className="data-grid-load-row">
                    {isLoading ? (
                        <><div className="spinner" /> Cargando más...</>
                    ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                            Mostrando {data.length}{totalCount ? ` de ${totalCount.toLocaleString('es-AR')}` : ''} registros
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
