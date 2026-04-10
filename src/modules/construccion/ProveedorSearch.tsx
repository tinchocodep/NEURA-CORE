import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, X } from 'lucide-react';

/**
 * Buscador de proveedores con auto-llenado de defaults.
 *
 * Acepta input libre: si el contador escribe un nombre que no está en la lista,
 * queda como texto puro y onSelect recibe `null` como proveedor.
 * Si elige uno de la lista, recibe el proveedor completo (incluyendo defaults).
 */

export interface ProveedorBasic {
    id: string;
    razon_social: string;
    cuit: string | null;
    categoria_default_id: string | null;
    centro_costo_default_id: string | null;
}

interface Props {
    proveedores: ProveedorBasic[];
    /** Texto actual del campo (puede ser un proveedor seleccionado o texto libre) */
    value: string;
    /**
     * Callback cuando cambia el valor.
     * @param texto el texto actual del input
     * @param prov el proveedor seleccionado de la lista (o null si es texto libre)
     */
    onChange: (texto: string, prov: ProveedorBasic | null) => void;
    placeholder?: string;
    height?: number;
    fontSize?: string;
}

export default function ProveedorSearch({
    proveedores,
    value,
    onChange,
    placeholder = 'Buscar proveedor o escribir nombre...',
    height = 38,
    fontSize = '0.8125rem',
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);

    // Sync interno con el value externo (cuando el form se resetea)
    useEffect(() => { setQuery(value); }, [value]);

    // Filtrar
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return proveedores.slice(0, 30);
        return proveedores
            .filter(p =>
                p.razon_social.toLowerCase().includes(q) ||
                (p.cuit || '').toLowerCase().includes(q)
            )
            .slice(0, 30);
    }, [proveedores, query]);

    // Posición del dropdown
    useEffect(() => {
        if (!open || !ref.current) return;
        const update = () => {
            if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                setPos({
                    top: rect.bottom + 4,
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

    // Cerrar al hacer click afuera
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (ref.current && ref.current.contains(target)) return;
            if (target.closest('[data-prov-search-dropdown]')) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleSelect = (p: ProveedorBasic) => {
        setQuery(p.razon_social);
        onChange(p.razon_social, p);
        setOpen(false);
    };

    const handleType = (txt: string) => {
        setQuery(txt);
        // Si lo que escribió coincide exacto con un proveedor, lo emitimos como seleccionado
        const exact = proveedores.find(p => p.razon_social.toLowerCase().trim() === txt.toLowerCase().trim());
        onChange(txt, exact || null);
        setOpen(true);
    };

    const handleClear = () => {
        setQuery('');
        onChange('', null);
    };

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div
                className="form-input"
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'text',
                    paddingLeft: 10,
                    paddingRight: 30,
                    background: 'var(--color-bg-surface)',
                    position: 'relative',
                }}
                onClick={() => setOpen(true)}
            >
                <Search size={13} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                <input
                    type="text"
                    value={query}
                    onChange={e => handleType(e.target.value)}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    style={{
                        border: 'none', outline: 'none', background: 'transparent',
                        flex: 1, fontSize, fontFamily: 'inherit',
                        color: 'var(--color-text-primary)',
                        minWidth: 0,
                    }}
                />
                {query && (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleClear(); }}
                        style={{
                            position: 'absolute', right: 8, top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-muted)', padding: 2,
                            display: 'flex', alignItems: 'center',
                        }}
                        title="Limpiar"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {open && (
                <div
                    data-prov-search-dropdown
                    style={{
                        position: 'fixed', top: pos.top, left: pos.left,
                        width: Math.max(pos.width, 280), zIndex: 9999,
                        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        maxHeight: 280, overflowY: 'auto',
                        padding: '4px 0',
                    }}
                >
                    {filtered.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize }}>
                            {query.trim()
                                ? <>Sin coincidencias. Se va a guardar como texto libre: <strong>"{query.trim()}"</strong></>
                                : 'Sin proveedores cargados'}
                        </div>
                    ) : (
                        filtered.map(p => {
                            const tieneDefaults = !!(p.categoria_default_id || p.centro_costo_default_id);
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => handleSelect(p)}
                                    style={{
                                        padding: '7px 10px',
                                        margin: '0 4px',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.razon_social}
                                        </div>
                                        {p.cuit && (
                                            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                                {p.cuit}
                                            </div>
                                        )}
                                    </div>
                                    {tieneDefaults && (
                                        <span title="Tiene categoría/centro de costos default — se autocompletan" style={{
                                            fontSize: '0.55rem', fontWeight: 700, padding: '2px 6px',
                                            borderRadius: 99, background: 'rgba(16,185,129,0.12)',
                                            color: '#10b981', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', gap: 3,
                                        }}>
                                            <Check size={9} /> AUTO
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
