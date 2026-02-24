import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../contexts/ToastContext';

export default function ProjectSearch({ value, onChange, tenant }: {
    value: string;
    onChange: (name: string) => void;
    tenant: any;
}) {
    const [projects, setProjects] = useState<string[]>([]);
    const [query, setQuery] = useState(value);
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();

    // Sync query when value changes externally (e.g. form opens pre-filled)
    useEffect(() => { setQuery(value); }, [value]);

    // Load projects from DB
    useEffect(() => {
        if (!tenant) return;
        supabase.from('treasury_projects')
            .select('name')
            .eq('tenant_id', tenant.id)
            .order('name')
            .then(({ data }) => {
                if (data) setProjects(data.map(p => p.name));
            });
    }, [tenant]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = query.trim()
        ? projects.filter(p => p.toLowerCase().includes(query.toLowerCase()))
        : projects;
    const exactMatch = projects.some(p => p.toLowerCase() === query.toLowerCase().trim());

    const handleSelect = (name: string) => {
        setQuery(name);
        onChange(name);
        setOpen(false);
    };

    const openDropdown = () => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width });
        }
        setOpen(true);
    };

    // Recalculate position when open (handles scroll/resize drift)
    useEffect(() => {
        if (!open) return;
        const update = () => {
            if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
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


    const handleCreate = async () => {
        if (!tenant || !query.trim() || creating) return;
        const normalized = query.trim();
        setCreating(true);
        const { error } = await supabase.from('treasury_projects').insert({
            tenant_id: tenant.id,
            name: normalized,
        });
        setCreating(false);
        if (error && !error.message.includes('duplicate')) {
            addToast('error', 'Error', error.message);
            return;
        }
        setProjects(prev => [...prev, normalized].sort());
        handleSelect(normalized);
        addToast('success', 'Obra guardada', `"${normalized}" agregada al catálogo.`);
    };

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div className="form-input"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', cursor: 'text' }}
                onClick={openDropdown}>
                <Search size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <input
                    type="text"
                    placeholder="Buscar o crear obra..."
                    value={query}
                    onChange={e => { setQuery(e.target.value); onChange(e.target.value); openDropdown(); }}
                    onFocus={openDropdown}
                    style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-main)' }}
                />
                {query && (
                    <button type="button" onClick={() => { setQuery(''); onChange(''); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                        ×
                    </button>
                )}
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        style={{
                            position: 'fixed', zIndex: 9999,
                            top: dropPos.top, left: dropPos.left, width: dropPos.width,
                            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: '220px', overflowY: 'auto'
                        }}>
                        {filtered.map(p => (
                            <div key={p} onMouseDown={() => handleSelect(p)}
                                style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                {p}
                            </div>
                        ))}
                        {!exactMatch && query.trim() && (
                            <div onMouseDown={handleCreate}
                                style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.875rem', borderTop: filtered.length > 0 ? '1px solid var(--border)' : undefined, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Plus size={13} />
                                {creating ? 'Guardando...' : `Crear obra "${query.trim()}"`}
                            </div>
                        )}
                        {projects.length === 0 && !query.trim() && (
                            <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Todavía no hay obras. Escribí para crear una.</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
