import { useEffect, useRef, useState } from 'react';
import { Search, FileText, Plus, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CommandItem {
    id: string;
    label: string;
    category: string;
    icon: React.ReactNode;
    action: () => void;
    shortcut?: string;
}

interface CommandBarProps {
    onClose: () => void;
}

export function CommandBar({ onClose }: CommandBarProps) {
    const [query, setQuery] = useState('');
    const [focusedIdx, setFocusedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const staticItems: CommandItem[] = [
        {
            id: 'nav-comprobantes',
            label: 'Ir a Comprobantes',
            category: 'Navegar',
            icon: <FileText size={14} color="var(--color-accent)" />,
            action: () => { navigate('/contable/comprobantes'); onClose(); },
        },
        {
            id: 'nav-proveedores',
            label: 'Ir a Proveedores',
            category: 'Navegar',
            icon: <FileText size={14} color="var(--color-text-secondary)" />,
            action: () => { navigate('/contable/proveedores'); onClose(); },
        },
        {
            id: 'new-factura',
            label: 'Nueva Factura',
            category: 'Crear',
            icon: <Plus size={14} color="var(--color-success)" />,
            action: () => { navigate('/contable/comprobantes?tab=crear'); onClose(); },
            shortcut: '⌘N',
        },
        {
            id: 'upload-pdf',
            label: 'Subir PDF de comprobante',
            category: 'Crear',
            icon: <Upload size={14} color="var(--color-warning)" />,
            action: () => { navigate('/contable/comprobantes?tab=upload'); onClose(); },
            shortcut: '⌘U',
        },
    ];

    const filtered = query
        ? staticItems.filter(i =>
            i.label.toLowerCase().includes(query.toLowerCase()) ||
            i.category.toLowerCase().includes(query.toLowerCase())
        )
        : staticItems;

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        setFocusedIdx(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIdx(i => Math.min(i + 1, filtered.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIdx(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                if (filtered[focusedIdx]) filtered[focusedIdx].action();
                break;
            case 'Escape':
                onClose();
                break;
        }
    };

    // Group items by category
    const grouped = filtered.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, CommandItem[]>);

    let globalIdx = 0;

    return (
        <div className="command-overlay" onClick={onClose}>
            <div className="command-bar" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
                <div className="command-input-row">
                    <Search size={16} color="var(--color-text-muted)" />
                    <input
                        ref={inputRef}
                        className="command-input"
                        placeholder="Buscar acción, módulo o entidad..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <X size={14} />
                    </button>
                </div>

                <div className="command-results">
                    {filtered.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                            Sin resultados para "{query}"
                        </div>
                    ) : (
                        Object.entries(grouped).map(([category, items]) => (
                            <div key={category}>
                                <div style={{
                                    padding: '0.375rem 1rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: 'var(--color-text-muted)',
                                }}>
                                    {category}
                                </div>
                                {items.map(item => {
                                    const idx = globalIdx++;
                                    return (
                                        <div
                                            key={item.id}
                                            className={`command-item${focusedIdx === idx ? ' focused' : ''}`}
                                            onClick={item.action}
                                            onMouseEnter={() => setFocusedIdx(idx)}
                                        >
                                            <div className="command-item-icon">{item.icon}</div>
                                            <span className="command-item-label">{item.label}</span>
                                            {item.shortcut && <kbd>{item.shortcut}</kbd>}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                <div className="command-footer">
                    <span><kbd>↑↓</kbd> navegar</span>
                    <span><kbd>Enter</kbd> ejecutar</span>
                    <span><kbd>Esc</kbd> cerrar</span>
                </div>
            </div>
        </div>
    );
}

/* ─── Global hook for Cmd+K ─── */

export function useCommandBar() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            }
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return { open, setOpen };
}
