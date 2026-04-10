import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';

/**
 * Dropdown jerárquico para el plan de cuentas. Muestra un árbol real con
 * chevrons que se abren y cierran. Click en el nombre selecciona el nodo,
 * click en el chevron solo expande/colapsa.
 */

export interface CategoriaJerarquica {
    id: string;
    nombre: string;
    color: string;
    tipo: string;
    parent_id: string | null;
    orden: number | null;
}

interface NodoArbol {
    cat: CategoriaJerarquica;
    children: NodoArbol[];
    nivel: number;
}

interface Props {
    categorias: CategoriaJerarquica[];
    value: string;
    onChange: (id: string) => void;
    tipoFiltro?: 'gasto' | 'ingreso';
    placeholder?: string;
    emptyLabel?: string;
    allowEmpty?: boolean;
    /** Si está, oculta nodos de niveles mayores. Útil para "elegir padre" en quick-create. */
    maxNivel?: number;
    /** ids a excluir (ej: prevenir seleccionarse a sí mismo como padre). */
    excludeIds?: string[];
    height?: number;
    fontSize?: string;
    disabled?: boolean;
}

export default function HierarchicalCategorySelect({
    categorias, value, onChange, tipoFiltro,
    placeholder = 'Seleccionar...',
    emptyLabel = 'Sin categoría',
    allowEmpty = true,
    maxNivel,
    excludeIds,
    height = 38,
    fontSize = '0.8125rem',
    disabled,
}: Props) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);

    // Construir árbol filtrado
    const arbol = useMemo<NodoArbol[]>(() => {
        const byParent = new Map<string | null, CategoriaJerarquica[]>();
        for (const c of categorias) {
            if (tipoFiltro && c.tipo !== tipoFiltro) continue;
            if (excludeIds?.includes(c.id)) continue;
            const k = c.parent_id;
            if (!byParent.has(k)) byParent.set(k, []);
            byParent.get(k)!.push(c);
        }
        function build(parentId: string | null, nivel: number): NodoArbol[] {
            if (maxNivel != null && nivel > maxNivel) return [];
            const hijos = (byParent.get(parentId) || []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
            return hijos.map(cat => ({
                cat,
                children: build(cat.id, nivel + 1),
                nivel,
            }));
        }
        return build(null, 0);
    }, [categorias, tipoFiltro, excludeIds, maxNivel]);

    // Path completo del seleccionado para mostrar en el botón
    const selectedPath = useMemo(() => {
        if (!value) return null;
        const map = new Map(categorias.map(c => [c.id, c]));
        const path: string[] = [];
        let cur: CategoriaJerarquica | undefined = map.get(value);
        while (cur) {
            path.unshift(cur.nombre);
            cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
        }
        return path.join(' › ');
    }, [value, categorias]);

    // Auto-expandir ancestros del seleccionado al abrir
    useEffect(() => {
        if (!open || !value) return;
        const map = new Map(categorias.map(c => [c.id, c]));
        const ancestors = new Set<string>();
        let cur: CategoriaJerarquica | undefined = map.get(value);
        while (cur?.parent_id) {
            ancestors.add(cur.parent_id);
            cur = map.get(cur.parent_id);
        }
        if (ancestors.size > 0) {
            setExpanded(prev => {
                const n = new Set(prev);
                for (const a of ancestors) n.add(a);
                return n;
            });
        }
    }, [open, value, categorias]);

    // Posición del dropdown
    useEffect(() => {
        if (!open || !ref.current) return;
        const update = () => {
            if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const dropHeight = 360;
                const showAbove = spaceBelow < dropHeight && rect.top > dropHeight;
                setPos({
                    top: showAbove ? rect.top - dropHeight - 4 : rect.bottom + 4,
                    left: rect.left,
                    width: rect.width,
                });
            }
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open]);

    // Cerrar al hacer click afuera (incluyendo el portal del dropdown)
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (ref.current && ref.current.contains(target)) return;
            if (target.closest('[data-hcs-dropdown]')) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = (id: string) => {
        setExpanded(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });
    };

    const handleSelect = (id: string) => {
        onChange(id);
        setOpen(false);
    };

    function renderNode(nodo: NodoArbol): React.ReactNode {
        const isOpen = expanded.has(nodo.cat.id);
        const tieneHijos = nodo.children.length > 0;
        const isSelected = value === nodo.cat.id;
        const padding = 6 + nodo.nivel * 18;

        return (
            <div key={nodo.cat.id}>
                <div
                    onClick={() => handleSelect(nodo.cat.id)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: `7px 10px 7px ${padding}px`,
                        background: isSelected ? 'rgba(37,99,235,0.08)' : undefined,
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                        borderRadius: 6,
                        margin: '0 4px',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = ''; }}
                >
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); if (tieneHijos) toggle(nodo.cat.id); }}
                        style={{
                            width: 18, height: 18, padding: 0,
                            border: 'none', background: 'none',
                            cursor: tieneHijos ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: tieneHijos ? 'var(--color-text-muted)' : 'transparent',
                            flexShrink: 0,
                        }}
                    >
                        {tieneHijos && (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                    </button>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: nodo.cat.color, flexShrink: 0 }} />
                    <span style={{
                        flex: 1, fontSize,
                        fontWeight: isSelected ? 600 : (nodo.nivel === 0 ? 600 : 400),
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {nodo.cat.nombre}
                    </span>
                    {tieneHijos && !isSelected && (
                        <span style={{ fontSize: '0.62rem', color: 'var(--color-text-faint)', flexShrink: 0 }}>
                            {nodo.children.length}
                        </span>
                    )}
                    {isSelected && <Check size={13} color="var(--color-cta, #2563EB)" style={{ flexShrink: 0 }} />}
                </div>
                {isOpen && tieneHijos && (
                    <div>{nodo.children.map(renderNode)}</div>
                )}
            </div>
        );
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(!open)}
                className="form-input"
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    paddingRight: 28,
                    background: 'var(--color-bg-surface)',
                    position: 'relative',
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontSize, color: value ? undefined : 'var(--color-text-muted)',
                }}>
                    {selectedPath || placeholder}
                </span>
                <ChevronDown
                    size={13}
                    color="var(--color-text-muted)"
                    style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: `translateY(-50%) ${open ? 'rotate(180deg)' : ''}`,
                        transition: 'transform 0.15s', flexShrink: 0,
                    }}
                />
            </button>

            {open && (
                <div
                    data-hcs-dropdown
                    style={{
                        position: 'fixed', top: pos.top, left: pos.left,
                        width: Math.max(pos.width, 260), zIndex: 9999,
                        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        maxHeight: 360, overflowY: 'auto',
                        padding: '4px 0',
                    }}
                >
                    {allowEmpty && (
                        <div
                            onClick={() => handleSelect('')}
                            style={{
                                padding: '8px 12px', margin: '0 4px',
                                borderRadius: 6, cursor: 'pointer', fontSize,
                                fontStyle: 'italic',
                                color: 'var(--color-text-muted)',
                                background: !value ? 'rgba(37,99,235,0.08)' : undefined,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}
                            onMouseEnter={e => { if (value) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-hover)'; }}
                            onMouseLeave={e => { if (value) (e.currentTarget as HTMLDivElement).style.background = ''; }}
                        >
                            {!value && <Check size={13} color="var(--color-cta, #2563EB)" />}
                            {emptyLabel}
                        </div>
                    )}
                    {arbol.map(renderNode)}
                    {arbol.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize }}>
                            Sin categorías
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
