import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, Search, ChevronRight, ChevronLeft, Trash2, DollarSign, X, Phone, Mail, Home, Edit2 } from 'lucide-react';

interface Contacto { id: string; nombre: string; apellido: string | null; }
interface Propiedad { id: string; direccion: string; }
interface Prospecto {
    id: string;
    nombre: string;
    etapa: string;
    monto_estimado: number | null;
    probabilidad: number;
    fecha_cierre: string | null;
    contacto_id: string | null;
    notas: string | null;
    telefono: string | null;
    email: string | null;
    fuente: string | null;
    propiedad_interes_id: string | null;
    created_at: string;
    contacto: Contacto | null;
}

const ETAPAS = [
    { id: 'Nuevo', label: 'Nuevo', color: '#6366f1' },
    { id: 'Contactado', label: 'Contactado', color: '#3b82f6' },
    { id: 'Propuesta', label: 'Propuesta', color: '#f59e0b' },
    { id: 'Negociación', label: 'Negociación', color: '#8b5cf6' },
    { id: 'Ganado', label: 'Ganado', color: '#10b981' },
    { id: 'Perdido', label: 'Perdido', color: '#ef4444' },
];

const FUENTES = ['Referido', 'Portal inmobiliario', 'Redes sociales', 'Web', 'Cartel', 'Otro'];

const EMPTY: Partial<Prospecto> = {
    nombre: '', etapa: 'Nuevo', monto_estimado: undefined, probabilidad: 50,
    fecha_cierre: '', contacto_id: null, notas: '', telefono: '', email: '',
    fuente: '', propiedad_interes_id: null,
};

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}

export default function CRMProspectos() {
    const { tenant } = useTenant();
    const loc = useLocation();
    const isMobile = useIsMobile();
    const [prospectos, setProspectos] = useState<Prospecto[]>([]);
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Prospecto>>(EMPTY);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (tenant) loadData(); }, [tenant]);

    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        if (params.get('action') === 'crear') {
            openCreate();
            window.history.replaceState({}, '', loc.pathname);
        }
    }, [loc.search]);

    const loadData = async () => {
        setLoading(true);
        const [pRes, cRes, prRes] = await Promise.all([
            supabase.from('crm_prospectos').select('*, contacto:crm_contactos(id, nombre, apellido)').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
            supabase.from('crm_contactos').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
            supabase.from('inmobiliaria_propiedades').select('id, direccion').eq('tenant_id', tenant!.id).order('direccion'),
        ]);
        if (pRes.data) setProspectos(pRes.data as any);
        if (cRes.data) setContactos(cRes.data);
        if (prRes.data) setPropiedades(prRes.data);
        setLoading(false);
    };

    const openCreate = (etapa?: string) => { setEditing({ ...EMPTY, etapa: etapa || 'Nuevo' }); setShowModal(true); };
    const openEdit = (p: Prospecto) => { setEditing({ ...p }); setShowModal(true); };

    const moverEtapa = async (prospecto: Prospecto, dir: 'adelante' | 'atras') => {
        const idx = ETAPAS.findIndex(e => e.id === prospecto.etapa);
        const newIdx = dir === 'adelante' ? idx + 1 : idx - 1;
        if (newIdx < 0 || newIdx >= ETAPAS.length) return;
        const nuevaEtapa = ETAPAS[newIdx].id;
        await supabase.from('crm_prospectos').update({ etapa: nuevaEtapa }).eq('id', prospecto.id);
        setProspectos(prev => prev.map(p => p.id === prospecto.id ? { ...p, etapa: nuevaEtapa } : p));
    };

    const eliminar = async (id: string) => {
        if (!confirm('¿Eliminar prospecto?')) return;
        await supabase.from('crm_prospectos').delete().eq('id', id);
        setProspectos(prev => prev.filter(p => p.id !== id));
    };

    const handleSave = async () => {
        if (!editing.nombre?.trim()) return;
        setSaving(true);
        const payload = {
            nombre: editing.nombre!.trim(),
            etapa: editing.etapa || 'Nuevo',
            monto_estimado: editing.monto_estimado || null,
            probabilidad: editing.probabilidad ?? 50,
            fecha_cierre: editing.fecha_cierre || null,
            contacto_id: editing.contacto_id || null,
            notas: editing.notas || null,
            telefono: editing.telefono || null,
            email: editing.email || null,
            fuente: editing.fuente || null,
            propiedad_interes_id: editing.propiedad_interes_id || null,
            tenant_id: tenant!.id,
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

    const montoEtapa = (etapaId: string) =>
        prospectos.filter(p => p.etapa === etapaId).reduce((sum, p) => sum + (p.monto_estimado || 0), 0);

    const activos = prospectos.filter(p => p.etapa !== 'Ganado' && p.etapa !== 'Perdido').length;

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Header */}
            {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Prospectos</h1>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{activos} activos</span>
                    <div style={{ flex: 1 }} />
                    <div style={{ position: 'relative', width: 220 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input className="form-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, height: 36, fontSize: '0.8rem' }} />
                    </div>
                    <button className="btn btn-primary" onClick={() => openCreate()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: '0.8rem', borderRadius: 10 }}>
                        <Plus size={16} /> Nuevo prospecto
                    </button>
                </div>
            )}
            {isMobile && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input className="form-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, height: 38, fontSize: '0.8rem', borderRadius: 10 }} />
                    </div>
                    <button onClick={() => openCreate()} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={18} />
                    </button>
                </div>
            )}

            {/* Kanban */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(200px, 1fr))`, gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {ETAPAS.map((etapa, etapaIdx) => {
                    const cards = prospectos.filter(p => p.etapa === etapa.id && (!search || p.nombre.toLowerCase().includes(search.toLowerCase())));
                    const total = montoEtapa(etapa.id);
                    return (
                        <div key={etapa.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 200 }}>
                            {/* Column header */}
                            <div style={{ padding: '0.6rem 0.75rem', borderRadius: 10, background: `${etapa.color}10`, border: `1px solid ${etapa.color}25` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: etapa.color }}>{etapa.label}</span>
                                    <span style={{ background: etapa.color, color: 'white', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px' }}>{cards.length}</span>
                                </div>
                                {total > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                                        $ {total.toLocaleString('es-AR')}
                                    </div>
                                )}
                            </div>

                            {/* Cards */}
                            {cards.map(p => (
                                <div key={p.id} onClick={() => openEdit(p)}
                                    style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: '0.75rem', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>{p.nombre}</div>
                                        <button onClick={e => { e.stopPropagation(); eliminar(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    {p.contacto && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                                            {p.contacto.nombre} {p.contacto.apellido || ''}
                                        </div>
                                    )}
                                    {(p as any).telefono && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Phone size={10} /> {(p as any).telefono}
                                        </div>
                                    )}
                                    {p.monto_estimado && (
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: etapa.color, marginTop: 4, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)' }}>
                                            <DollarSign size={12} /> {p.monto_estimado.toLocaleString('es-AR')}
                                        </div>
                                    )}
                                    {(p as any).fuente && (
                                        <div style={{ marginTop: 4 }}>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>{(p as any).fuente}</span>
                                        </div>
                                    )}
                                    {p.fecha_cierre && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                            Cierre: {new Date(p.fecha_cierre + 'T00:00:00').toLocaleDateString('es-AR')}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            <button title="Retroceder" disabled={etapaIdx === 0} onClick={() => moverEtapa(p, 'atras')}
                                                style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: etapaIdx === 0 ? 'not-allowed' : 'pointer', padding: '2px 4px', opacity: etapaIdx === 0 ? 0.3 : 1 }}>
                                                <ChevronLeft size={12} />
                                            </button>
                                            <button title="Avanzar" disabled={etapaIdx === ETAPAS.length - 1} onClick={() => moverEtapa(p, 'adelante')}
                                                style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: etapaIdx === ETAPAS.length - 1 ? 'not-allowed' : 'pointer', padding: '2px 4px', opacity: etapaIdx === ETAPAS.length - 1 ? 0.3 : 1 }}>
                                                <ChevronRight size={12} />
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{p.probabilidad}%</div>
                                    </div>
                                </div>
                            ))}

                            <button onClick={() => openCreate(etapa.id)}
                                style={{ border: '1px dashed var(--color-border-subtle)', borderRadius: 10, padding: '0.5rem', background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <Plus size={12} /> Agregar
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{
                        width: '100%', maxWidth: isMobile ? undefined : 520, padding: 0, overflow: 'hidden',
                        borderRadius: isMobile ? '20px 20px 0 0' : 'var(--radius-xl)',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)',
                    }}>
                        {/* Header */}
                        <div style={{ padding: isMobile ? '16px 16px 0' : '1.25rem 1.5rem', borderBottom: isMobile ? 'none' : '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {isMobile && <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />}
                            <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>{editing.id ? 'Editar prospecto' : 'Nuevo prospecto'}</h3>
                            {!isMobile && <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-icon"><X size={16} /></button>}
                        </div>

                        {/* Body */}
                        <div style={{ padding: isMobile ? '16px' : '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: isMobile ? '60vh' : '65vh', overflowY: 'auto' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Nombre del prospecto *</label>
                                <input className="form-input" placeholder="Ej: Juan Pérez - Depto 3 ambientes" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Teléfono</label>
                                    <input className="form-input" placeholder="+54 11 1234-5678" value={editing.telefono || ''} onChange={e => setEditing(p => ({ ...p, telefono: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" placeholder="email@ejemplo.com" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Etapa</label>
                                    <select className="form-input" value={editing.etapa || 'Nuevo'} onChange={e => setEditing(p => ({ ...p, etapa: e.target.value }))}>
                                        {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Fuente</label>
                                    <select className="form-input" value={editing.fuente || ''} onChange={e => setEditing(p => ({ ...p, fuente: e.target.value || null }))}>
                                        <option value="">Sin especificar</option>
                                        {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Monto estimado ($)</label>
                                    <input className="form-input" type="number" value={editing.monto_estimado || ''} onChange={e => setEditing(p => ({ ...p, monto_estimado: parseFloat(e.target.value) || undefined }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Probabilidad (%)</label>
                                    <input className="form-input" type="number" min={0} max={100} value={editing.probabilidad ?? 50} onChange={e => setEditing(p => ({ ...p, probabilidad: parseInt(e.target.value) || 0 }))} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Fecha de cierre</label>
                                    <input className="form-input" type="date" value={editing.fecha_cierre || ''} onChange={e => setEditing(p => ({ ...p, fecha_cierre: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Contacto vinculado</label>
                                    <select className="form-input" value={editing.contacto_id || ''} onChange={e => setEditing(p => ({ ...p, contacto_id: e.target.value || null }))}>
                                        <option value="">Sin contacto</option>
                                        {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>)}
                                    </select>
                                </div>
                            </div>

                            {propiedades.length > 0 && (
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Propiedad de interés</label>
                                    <select className="form-input" value={editing.propiedad_interes_id || ''} onChange={e => setEditing(p => ({ ...p, propiedad_interes_id: e.target.value || null }))}>
                                        <option value="">Sin especificar</option>
                                        {propiedades.map(p => <option key={p.id} value={p.id}>{p.direccion}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Notas</label>
                                <textarea className="form-input" rows={2} placeholder="Observaciones..." value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} style={{ resize: 'vertical' }} />
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: isMobile ? '12px 16px 80px' : '1rem 1.5rem', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', gap: 8, justifyContent: isMobile ? 'stretch' : 'flex-end', background: isMobile ? undefined : 'var(--color-bg-subtle, #f8fafc)' }}>
                            <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: isMobile ? 1 : undefined }}>Cancelar</button>
                            <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ flex: isMobile ? 1 : undefined }}>
                                {saving ? 'Guardando...' : editing.id ? 'Guardar cambios' : 'Crear prospecto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
