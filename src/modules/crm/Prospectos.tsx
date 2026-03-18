import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, ChevronRight, ChevronLeft, Trash2, DollarSign } from 'lucide-react';

interface Contacto { id: string; nombre: string; apellido: string | null; }
interface Prospecto {
    id: string;
    nombre: string;
    etapa: string;
    monto_estimado: number | null;
    probabilidad: number;
    fecha_cierre: string | null;
    contacto_id: string | null;
    notas: string | null;
    created_at: string;
    contacto: Contacto | null;
}

const ETAPAS = [
    { id: 'nuevo', label: 'Nuevo', color: '#6366f1' },
    { id: 'contactado', label: 'Contactado', color: '#3b82f6' },
    { id: 'propuesta', label: 'Propuesta', color: '#f59e0b' },
    { id: 'negociacion', label: 'Negociación', color: '#8b5cf6' },
    { id: 'ganado', label: 'Ganado', color: '#10b981' },
    { id: 'perdido', label: 'Perdido', color: '#ef4444' },
];

const EMPTY_PROSPECTO: Partial<Prospecto> = { nombre: '', etapa: 'nuevo', monto_estimado: undefined, probabilidad: 50, fecha_cierre: '', contacto_id: null, notas: '' };

export default function CRMProspectos() {
    const { tenant } = useTenant();
    const [prospectos, setProspectos] = useState<Prospecto[]>([]);
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Prospecto>>(EMPTY_PROSPECTO);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (tenant) loadData(); }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [pRes, cRes] = await Promise.all([
            supabase.from('crm_prospectos').select('*, contacto:crm_contactos(id, nombre, apellido)').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
            supabase.from('crm_contactos').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
        ]);
        if (pRes.data) setProspectos(pRes.data as any);
        if (cRes.data) setContactos(cRes.data);
        setLoading(false);
    };

    const moverEtapa = async (prospecto: Prospecto, direccion: 'adelante' | 'atras') => {
        const idx = ETAPAS.findIndex(e => e.id === prospecto.etapa);
        const newIdx = direccion === 'adelante' ? idx + 1 : idx - 1;
        if (newIdx < 0 || newIdx >= ETAPAS.length) return;
        const nuevaEtapa = ETAPAS[newIdx].id;
        await supabase.from('crm_prospectos').update({ etapa: nuevaEtapa, updated_at: new Date().toISOString() }).eq('id', prospecto.id);
        setProspectos(prev => prev.map(p => p.id === prospecto.id ? { ...p, etapa: nuevaEtapa } : p));
    };

    const eliminar = async (id: string) => {
        if (!confirm('¿Eliminar prospecto?')) return;
        await supabase.from('crm_prospectos').delete().eq('id', id);
        setProspectos(prev => prev.filter(p => p.id !== id));
    };

    const abrirEdicion = (p?: Prospecto) => {
        setEditing(p ? { ...p } : { ...EMPTY_PROSPECTO });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.nombre?.trim()) return;
        setSaving(true);
        const payload = {
            nombre: editing.nombre!.trim(),
            etapa: editing.etapa || 'nuevo',
            monto_estimado: editing.monto_estimado || null,
            probabilidad: editing.probabilidad ?? 50,
            fecha_cierre: editing.fecha_cierre || null,
            contacto_id: editing.contacto_id || null,
            notas: editing.notas || null,
            tenant_id: tenant!.id,
            updated_at: new Date().toISOString(),
        };
        if (editing.id) {
            await supabase.from('crm_prospectos').update(payload).eq('id', editing.id);
        } else {
            await supabase.from('crm_prospectos').insert(payload);
        }
        setSaving(false);
        setShowModal(false);
        loadData();
    };

    // Calcular monto total por etapa
    const montoEtapa = (etapaId: string) =>
        prospectos.filter(p => p.etapa === etapaId).reduce((sum, p) => sum + (p.monto_estimado || 0), 0);

    if (loading) return <div style={{ padding: '1.5rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    return (
        <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 2 }}>Pipeline de Prospectos</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{prospectos.filter(p => p.etapa !== 'ganado' && p.etapa !== 'perdido').length} activos</p>
                </div>
                <button className="btn btn-primary" onClick={() => abrirEdicion()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={16} /> Nuevo Prospecto
                </button>
            </div>

            {/* Kanban */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(220px, 1fr))`, gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {ETAPAS.map((etapa, etapaIdx) => {
                    const cards = prospectos.filter(p => p.etapa === etapa.id);
                    const total = montoEtapa(etapa.id);
                    return (
                        <div key={etapa.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 220 }}>
                            {/* Column header */}
                            <div style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', background: `${etapa.color}15`, border: `1px solid ${etapa.color}30` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: etapa.color }}>{etapa.label}</span>
                                    <span style={{ background: etapa.color, color: 'white', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px' }}>{cards.length}</span>
                                </div>
                                {total > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                        ${total.toLocaleString('es-AR')}
                                    </div>
                                )}
                            </div>

                            {/* Cards */}
                            {cards.map(p => (
                                <div key={p.id} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', cursor: 'pointer' }} onClick={() => abrirEdicion(p)}>
                                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>{p.nombre}</div>
                                    {p.contacto && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                                            {p.contacto.nombre} {p.contacto.apellido || ''}
                                        </div>
                                    )}
                                    {p.monto_estimado && (
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: etapa.color, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <DollarSign size={12} />${p.monto_estimado.toLocaleString('es-AR')}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                            <button
                                                title="Retroceder etapa"
                                                disabled={etapaIdx === 0}
                                                onClick={() => moverEtapa(p, 'atras')}
                                                style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: etapaIdx === 0 ? 'not-allowed' : 'pointer', padding: '2px 4px', opacity: etapaIdx === 0 ? 0.3 : 1 }}
                                            ><ChevronLeft size={12} /></button>
                                            <button
                                                title="Avanzar etapa"
                                                disabled={etapaIdx === ETAPAS.length - 1}
                                                onClick={() => moverEtapa(p, 'adelante')}
                                                style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: etapaIdx === ETAPAS.length - 1 ? 'not-allowed' : 'pointer', padding: '2px 4px', opacity: etapaIdx === ETAPAS.length - 1 ? 0.3 : 1 }}
                                            ><ChevronRight size={12} /></button>
                                        </div>
                                        <button
                                            title="Eliminar"
                                            onClick={e => { e.stopPropagation(); eliminar(p.id); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px 4px' }}
                                        ><Trash2 size={12} /></button>
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={() => { setEditing({ ...EMPTY_PROSPECTO, etapa: etapa.id }); setShowModal(true); }}
                                style={{ border: '1px dashed var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                            >
                                <Plus size={12} /> Agregar
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>{editing.id ? 'Editar Prospecto' : 'Nuevo Prospecto'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="form-group">
                                <label className="form-label">Nombre *</label>
                                <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Etapa</label>
                                    <select className="form-input" value={editing.etapa || 'nuevo'} onChange={e => setEditing(p => ({ ...p, etapa: e.target.value }))}>
                                        {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Probabilidad (%)</label>
                                    <input className="form-input" type="number" min={0} max={100} value={editing.probabilidad ?? 50} onChange={e => setEditing(p => ({ ...p, probabilidad: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Monto Estimado ($)</label>
                                    <input className="form-input" type="number" value={editing.monto_estimado || ''} onChange={e => setEditing(p => ({ ...p, monto_estimado: parseFloat(e.target.value) || undefined }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha de Cierre</label>
                                    <input className="form-input" type="date" value={editing.fecha_cierre || ''} onChange={e => setEditing(p => ({ ...p, fecha_cierre: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Contacto</label>
                                <select className="form-input" value={editing.contacto_id || ''} onChange={e => setEditing(p => ({ ...p, contacto_id: e.target.value || null }))}>
                                    <option value="">Sin contacto</option>
                                    {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notas</label>
                                <textarea className="form-input" rows={3} value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} style={{ resize: 'vertical' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
