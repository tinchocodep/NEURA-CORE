import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Plus, X } from 'lucide-react';

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
    const [showCreate, setShowCreate] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!tenant) return;
        loadTags();
    }, [tenant, comprobanteId]);

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
            await supabase.from('contable_comprobante_tags').delete().eq('comprobante_id', comprobanteId).eq('tag_id', tagId);
            setAssignedIds(prev => { const n = new Set(prev); n.delete(tagId); return n; });
        } else {
            await supabase.from('contable_comprobante_tags').insert({ comprobante_id: comprobanteId, tag_id: tagId });
            setAssignedIds(prev => new Set([...prev, tagId]));
        }
    }

    async function handleCreateTag() {
        if (!tenant || !newTagName.trim()) return;
        setCreating(true);
        const { data } = await supabase.from('contable_tags')
            .insert({ tenant_id: tenant.id, nombre: newTagName.trim(), color: newTagColor })
            .select('id, nombre, color').single();
        if (data) {
            setAllTags(prev => [...prev, data as TagItem]);
            await supabase.from('contable_comprobante_tags').insert({ comprobante_id: comprobanteId, tag_id: data.id });
            setAssignedIds(prev => new Set([...prev, data.id]));
            setNewTagName('');
            setShowCreate(false);
        }
        setCreating(false);
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* All tags — assigned ones are filled, unassigned are outlined */}
            {allTags.map(t => {
                const isOn = assignedIds.has(t.id);
                return (
                    <button
                        key={t.id}
                        onClick={() => toggleTag(t.id)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: isOn ? `${t.color}20` : 'transparent',
                            color: isOn ? t.color : 'var(--color-text-muted)',
                            border: `1.5px solid ${isOn ? t.color : 'var(--color-border-subtle)'}`,
                            opacity: isOn ? 1 : 0.6,
                        }}
                    >
                        {t.nombre}
                        {isOn && <X size={10} />}
                    </button>
                );
            })}

            {/* Create new tag inline */}
            {showCreate ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input
                        autoFocus
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setShowCreate(false); }}
                        onKeyUp={e => e.stopPropagation()}
                        placeholder="Nombre..."
                        style={{
                            width: 100, padding: '3px 8px', fontSize: '0.7rem',
                            border: `1.5px solid ${newTagColor}`, borderRadius: 99,
                            background: 'transparent', color: 'var(--color-text-primary)', outline: 'none',
                        }}
                    />
                    {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => setNewTagColor(c)} style={{
                            width: 14, height: 14, borderRadius: '50%', background: c, padding: 0,
                            border: c === newTagColor ? '2px solid var(--color-text-primary)' : '1px solid transparent',
                            cursor: 'pointer', flexShrink: 0,
                        }} />
                    ))}
                    <button onClick={handleCreateTag} disabled={creating || !newTagName.trim()} style={{
                        padding: '2px 8px', borderRadius: 99, border: 'none',
                        background: newTagColor, color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                        cursor: 'pointer', opacity: newTagName.trim() ? 1 : 0.4,
                    }}>✓</button>
                    <button onClick={() => setShowCreate(false)} style={{
                        padding: '2px 6px', borderRadius: 99, border: '1px solid var(--color-border-subtle)',
                        background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.65rem',
                        cursor: 'pointer',
                    }}>✕</button>
                </div>
            ) : (
                <button
                    onClick={() => setShowCreate(true)}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600,
                        background: 'transparent', color: 'var(--color-text-muted)',
                        border: '1.5px dashed var(--color-border-subtle)', cursor: 'pointer',
                        opacity: 0.7, transition: 'opacity 0.15s',
                    }}
                >
                    <Plus size={11} /> Nueva
                </button>
            )}
        </div>
    );
}
