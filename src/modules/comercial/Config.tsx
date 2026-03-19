import { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical, ToggleLeft, ToggleRight, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Stage { id: string; nombre: string; color: string; orden: number; es_final: boolean; descripcion: string; }
interface Source { id: string; nombre: string; icono: string; activa: boolean; }
interface Template { id: string; nombre: string; contenido: string; }

export default function ComercialConfig() {
    const { tenant } = useTenant();
    const [stages, setStages] = useState<Stage[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('etapas');
    const [saving, setSaving] = useState(false);

    // New stage
    const [newStageName, setNewStageName] = useState('');
    const [newStageColor, setNewStageColor] = useState('#6366F1');

    // New source
    const [newSourceName, setNewSourceName] = useState('');

    // New template
    const [newTplName, setNewTplName] = useState('');
    const [newTplContent, setNewTplContent] = useState('');

    // Editing template
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [stRes, srcRes, tplRes] = await Promise.all([
            supabase.from('comercial_pipeline_stages').select('*').eq('tenant_id', tenant!.id).order('orden'),
            supabase.from('comercial_sources').select('*').eq('tenant_id', tenant!.id).order('created_at'),
            supabase.from('comercial_templates').select('*').eq('tenant_id', tenant!.id).order('created_at'),
        ]);
        if (stRes.data) setStages(stRes.data as any);
        if (srcRes.data) setSources(srcRes.data as any);
        if (tplRes.data) setTemplates(tplRes.data);
        setLoading(false);
    };

    const addStage = async () => {
        if (!newStageName.trim()) return;
        const maxOrden = stages.length > 0 ? Math.max(...stages.map(s => s.orden)) : 0;
        const { data, error } = await supabase.from('comercial_pipeline_stages').insert({
            tenant_id: tenant!.id, nombre: newStageName, color: newStageColor,
            orden: maxOrden + 1, es_final: false, descripcion: '',
        }).select().single();
        if (!error && data) {
            setStages(prev => [...prev, data as any]);
            setNewStageName('');
        }
    };

    const updateStage = async (id: string, updates: Partial<Stage>) => {
        setSaving(true);
        const { error } = await supabase.from('comercial_pipeline_stages').update(updates).eq('id', id);
        if (!error) setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        setTimeout(() => setSaving(false), 500);
    };

    const deleteStage = async (id: string) => {
        if (!confirm('¿Eliminar esta etapa? Los leads en esta etapa quedarán sin etapa asignada.')) return;
        const { error } = await supabase.from('comercial_pipeline_stages').delete().eq('id', id);
        if (!error) setStages(prev => prev.filter(s => s.id !== id));
    };

    const addSource = async () => {
        if (!newSourceName.trim()) return;
        const { data, error } = await supabase.from('comercial_sources').insert({
            tenant_id: tenant!.id, nombre: newSourceName, icono: 'globe', activa: true,
        }).select().single();
        if (!error && data) {
            setSources(prev => [...prev, data as any]);
            setNewSourceName('');
        }
    };

    const toggleSource = async (id: string, activa: boolean) => {
        const { error } = await supabase.from('comercial_sources').update({ activa }).eq('id', id);
        if (!error) setSources(prev => prev.map(s => s.id === id ? { ...s, activa } : s));
    };

    const addTemplate = async () => {
        if (!newTplName.trim() || !newTplContent.trim()) return;
        const { data, error } = await supabase.from('comercial_templates').insert({
            tenant_id: tenant!.id, nombre: newTplName, contenido: newTplContent,
        }).select().single();
        if (!error && data) {
            setTemplates(prev => [...prev, data]);
            setNewTplName('');
            setNewTplContent('');
        }
    };

    const updateTemplate = async (id: string, updates: Partial<Template>) => {
        const { error } = await supabase.from('comercial_templates').update(updates).eq('id', id);
        if (!error) {
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
            setEditingTemplate(null);
        }
    };

    const deleteTemplate = async (id: string) => {
        if (!confirm('¿Eliminar esta plantilla?')) return;
        const { error } = await supabase.from('comercial_templates').delete().eq('id', id);
        if (!error) setTemplates(prev => prev.filter(t => t.id !== id));
    };

    const sections = [
        { key: 'etapas', label: 'Etapas del Pipeline' },
        { key: 'fuentes', label: 'Fuentes de Captación' },
        { key: 'plantillas', label: 'Plantillas de Respuesta' },
    ];

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando configuración...</div>;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Configuración</h1>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem' }}>
                {/* Section nav */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {sections.map(s => (
                        <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
                            padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                            background: activeSection === s.key ? 'var(--color-accent-dim, rgba(99,102,241,0.1))' : 'transparent',
                            color: activeSection === s.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                            fontWeight: activeSection === s.key ? 600 : 400, fontSize: '0.85rem', textAlign: 'left',
                        }}>{s.label}</button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                    
                    {/* ── ETAPAS ── */}
                    {activeSection === 'etapas' && (
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Etapas del Pipeline</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                {stages.map((stage, i) => (
                                    <div key={stage.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem',
                                        border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                                    }}>
                                        <GripVertical size={14} color="var(--color-text-muted)" style={{ cursor: 'grab', flexShrink: 0 }} />
                                        <input type="color" value={stage.color} onChange={e => updateStage(stage.id, { color: e.target.value })}
                                            style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 4, padding: 0, flexShrink: 0 }} />
                                        <input type="text" value={stage.nombre} onChange={e => updateStage(stage.id, { nombre: e.target.value })}
                                            className="form-input" style={{ flex: 1, height: 30, fontSize: '0.85rem' }} />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                            <input type="checkbox" checked={stage.es_final} onChange={e => updateStage(stage.id, { es_final: e.target.checked })} />
                                            Final
                                        </label>
                                        <button onClick={() => deleteStage(stage.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4, flexShrink: 0 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)}
                                    style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4, padding: 0 }} />
                                <input type="text" value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="Nueva etapa..."
                                    className="form-input" style={{ flex: 1, height: 32, fontSize: '0.85rem' }} />
                                <button onClick={addStage} style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── FUENTES ── */}
                    {activeSection === 'fuentes' && (
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Fuentes de Captación</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                {sources.map(src => (
                                    <div key={src.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem',
                                        border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                                        opacity: src.activa ? 1 : 0.5,
                                    }}>
                                        <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{src.nombre}</span>
                                        <button onClick={() => toggleSource(src.id, !src.activa)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: src.activa ? '#10B981' : 'var(--color-text-muted)', display: 'flex' }}>
                                            {src.activa ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="text" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="Nueva fuente..."
                                    className="form-input" style={{ flex: 1, height: 32, fontSize: '0.85rem' }} />
                                <button onClick={addSource} style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── PLANTILLAS ── */}
                    {activeSection === 'plantillas' && (
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Plantillas de Respuesta Rápida</div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                Variables disponibles: {'{nombre}'}, {'{vehiculo}'}, {'{precio}'}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                {templates.map(tpl => (
                                    <div key={tpl.id} style={{
                                        border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                                        padding: '0.75rem',
                                    }}>
                                        {editingTemplate?.id === tpl.id ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <input type="text" value={editingTemplate.nombre}
                                                    onChange={e => setEditingTemplate({ ...editingTemplate, nombre: e.target.value })}
                                                    className="form-input" style={{ fontSize: '0.85rem', height: 30, fontWeight: 600 }} />
                                                <textarea value={editingTemplate.contenido}
                                                    onChange={e => setEditingTemplate({ ...editingTemplate, contenido: e.target.value })}
                                                    className="form-input" style={{ fontSize: '0.8rem', minHeight: 80 }} />
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => setEditingTemplate(null)} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>Cancelar</button>
                                                    <button onClick={() => updateTemplate(tpl.id, { nombre: editingTemplate.nombre, contenido: editingTemplate.contenido })} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Save size={12} /> Guardar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{tpl.nombre}</span>
                                                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <button onClick={() => setEditingTemplate(tpl)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.75rem', fontWeight: 600 }}>Editar</button>
                                                        <button onClick={() => deleteTemplate(tpl.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '0.75rem' }}>Eliminar</button>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{tpl.contenido}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div style={{ border: '1px dashed var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <input type="text" value={newTplName} onChange={e => setNewTplName(e.target.value)} placeholder="Nombre de la plantilla"
                                    className="form-input" style={{ fontSize: '0.85rem', height: 30 }} />
                                <textarea value={newTplContent} onChange={e => setNewTplContent(e.target.value)} placeholder="Contenido de la plantilla..."
                                    className="form-input" style={{ fontSize: '0.8rem', minHeight: 60 }} />
                                <button onClick={addTemplate} disabled={!newTplName || !newTplContent} style={{
                                    padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none',
                                    background: newTplName && newTplContent ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                                    color: '#fff', cursor: newTplName && newTplContent ? 'pointer' : 'default',
                                    fontWeight: 600, fontSize: '0.8rem', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 4,
                                }}><Plus size={14} /> Crear Plantilla</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
