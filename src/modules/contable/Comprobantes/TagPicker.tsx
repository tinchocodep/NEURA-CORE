import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Tag, Plus, X } from 'lucide-react';

interface TagItem {
    id: string;
    nombre: string;
    color: string;
}

interface Props {
    comprobanteId: string;
}

const PRESET_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];

export default function TagPicker({ comprobanteId }: Props) {
    const { tenant } = useTenant();
    const [allTags, setAllTags] = useState<TagItem[]>([]);
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
    const [showDropdown, setShowDropdown] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
    const [creating, setCreating] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!tenant) return;
        loadTags();
    }, [tenant, comprobanteId]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    async function loadTags() {
        if (!tenant) return;
        const [tagsRes, assignedRes] = await Promise.all([
            supabase.from('contable_tags').select('id, nombre, color').eq('tenant_id', tenant.id).order('nombre'),
            supabase.from('contable_comprobante_tags').select('tag_id').eq('comprobante_id', comprobanteId),
        ]);
        setAllTags((tagsRes.data || []) as TagItem[]);
        setAssignedIds(new Set((assignedRes.data || []).map((r: any) => r.tag_id)));
    }

    async function toggleTag(tagId: string) {
        if (assignedIds.has(tagId)) {
            // Remove
            await supabase.from('contable_comprobante_tags')
                .delete()
                .eq('comprobante_id', comprobanteId)
                .eq('tag_id', tagId);
            setAssignedIds(prev => { const n = new Set(prev); n.delete(tagId); return n; });
        } else {
            // Add
            await supabase.from('contable_comprobante_tags')
                .insert({ comprobante_id: comprobanteId, tag_id: tagId });
            setAssignedIds(prev => new Set([...prev, tagId]));
        }
    }

    async function handleCreateTag() {
        if (!tenant || !newTagName.trim()) return;
        setCreating(true);
        const { data } = await supabase.from('contable_tags')
            .insert({ tenant_id: tenant.id, nombre: newTagName.trim(), color: newTagColor })
            .select('id, nombre, color')
            .single();
        if (data) {
            setAllTags(prev => [...prev, data as TagItem]);
            // Auto-assign to current comprobante
            await supabase.from('contable_comprobante_tags')
                .insert({ comprobante_id: comprobanteId, tag_id: data.id });
            setAssignedIds(prev => new Set([...prev, data.id]));
            setNewTagName('');
        }
        setCreating(false);
    }

    const assignedTags = allTags.filter(t => assignedIds.has(t.id));

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {assignedTags.map(t => (
                    <span
                        key={t.id}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                            background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30`,
                            cursor: 'pointer', transition: 'opacity 0.15s',
                        }}
                        onClick={() => toggleTag(t.id)}
                        title="Click para quitar"
                    >
                        {t.nombre}
                        <X size={10} />
                    </span>
                ))}
                <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 600,
                        background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
                    }}
                >
                    <Tag size={10} /> <Plus size={10} />
                </button>
            </div>

            {showDropdown && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: 0, zIndex: 50,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)',
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', width: 240,
                    padding: '0.5rem', marginBottom: 4,
                }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, padding: '0 4px' }}>
                        Etiquetas
                    </div>

                    {/* Existing tags */}
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {allTags.map(t => (
                            <div
                                key={t.id}
                                onClick={() => toggleTag(t.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                                    borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem',
                                    background: assignedIds.has(t.id) ? `${t.color}12` : 'transparent',
                                }}
                            >
                                <span style={{
                                    width: 10, height: 10, borderRadius: '50%', background: t.color,
                                    flexShrink: 0,
                                }} />
                                <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>{t.nombre}</span>
                                {assignedIds.has(t.id) && <span style={{ fontSize: '0.65rem', color: t.color }}>✓</span>}
                            </div>
                        ))}
                        {allTags.length === 0 && (
                            <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Sin etiquetas aún</div>
                        )}
                    </div>

                    {/* Create new tag */}
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 6, paddingTop: 6 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                                value={newTagName}
                                onChange={e => setNewTagName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); }}
                                placeholder="Nueva etiqueta..."
                                style={{
                                    flex: 1, padding: '4px 8px', fontSize: '0.75rem',
                                    border: '1px solid var(--color-border-subtle)', borderRadius: 6,
                                    background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)',
                                    outline: 'none',
                                }}
                            />
                            <button
                                onClick={handleCreateTag}
                                disabled={creating || !newTagName.trim()}
                                style={{
                                    padding: '4px 8px', borderRadius: 6, border: 'none',
                                    background: newTagColor, color: '#fff', fontSize: '0.7rem',
                                    fontWeight: 700, cursor: 'pointer', opacity: newTagName.trim() ? 1 : 0.4,
                                }}
                            >
                                +
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setNewTagColor(c)}
                                    style={{
                                        width: 16, height: 16, borderRadius: '50%', background: c,
                                        border: c === newTagColor ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                                        cursor: 'pointer', padding: 0,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
