import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, ChevronRight, ChevronLeft, Trash2, DollarSign, Car } from 'lucide-react';

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

interface AutoVinculado {
    id: string;
    marca: string;
    modelo: string;
    anio: number;
    version: string | null;
    precio: number | null;
    moneda: string;
    estado: string;
    imagen_url: string | null;
    prospecto_id: string | null;
}

const ETAPAS = [
    { id: 'Nuevo', label: 'Nuevo', color: '#6366f1' },
    { id: 'Contactado', label: 'Contactado', color: '#3b82f6' },
    { id: 'Propuesta', label: 'Propuesta', color: '#f59e0b' },
    { id: 'Negociación', label: 'Negociación', color: '#8b5cf6' },
    { id: 'Ganado', label: 'Ganado', color: '#10b981' },
    { id: 'Perdido', label: 'Perdido', color: '#ef4444' },
];

const EMPTY_PROSPECTO: Partial<Prospecto> = { nombre: '', etapa: 'Nuevo', monto_estimado: undefined, probabilidad: 50, fecha_cierre: '', contacto_id: null, notas: '' };

const ESTADO_COLORS: Record<string, { color: string; bg: string }> = {
    disponible: { color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    reservado: { color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
    vendido: { color: '#0284c7', bg: 'rgba(2,132,199,0.1)' },
};

function fmtPrice(n: number | null, moneda: string) {
    if (!n) return '';
    return (moneda === 'USD' ? 'USD ' : '$ ') + n.toLocaleString('es-AR');
}

export default function CRMProspectos() {
    const { tenant } = useTenant();
    const loc = useLocation();
    const [prospectos, setProspectos] = useState<Prospecto[]>([]);
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [autosMap, setAutosMap] = useState<Record<string, AutoVinculado[]>>({});
    const [allAutos, setAllAutos] = useState<AutoVinculado[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Prospecto>>(EMPTY_PROSPECTO);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (tenant) loadData(); }, [tenant]);

    // Auto-open form if navigated with ?action=crear
    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        if (params.get('action') === 'crear') {
            abrirEdicion();
            window.history.replaceState({}, '', loc.pathname);
        }
    }, [loc.search]);

    const loadData = async () => {
        setLoading(true);
        const [pRes, cRes, aRes] = await Promise.all([
            supabase.from('crm_prospectos').select('*, contacto:crm_contactos(id, nombre, apellido)').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
            supabase.from('crm_contactos').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
            supabase.from('crm_catalogo_autos').select('id, marca, modelo, anio, version, precio, moneda, estado, imagen_url, prospecto_id').eq('tenant_id', tenant!.id),
        ]);
        if (pRes.data) setProspectos(pRes.data as any);
        if (cRes.data) setContactos(cRes.data);

        // Build map: prospecto_id -> autos[]
        const map: Record<string, AutoVinculado[]> = {};
        const autos = (aRes.data || []) as any[];
        for (const a of autos) {
            if (a.prospecto_id) {
                if (!map[a.prospecto_id]) map[a.prospecto_id] = [];
                map[a.prospecto_id].push(a);
            }
        }
        setAutosMap(map);
        setAllAutos(autos);
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
            etapa: editing.etapa || 'Nuevo',
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

    const vincularAuto = async (autoId: string, prospectoId: string | null) => {
        await supabase.from('crm_catalogo_autos').update({ prospecto_id: prospectoId, updated_at: new Date().toISOString() }).eq('id', autoId);
        loadData();
    };

    const montoEtapa = (etapaId: string) =>
        prospectos.filter(p => p.etapa === etapaId).reduce((sum, p) => sum + (p.monto_estimado || 0), 0);

    // Autos no vinculados a ningún prospecto
    const autosDisponibles = allAutos.filter(a => !a.prospecto_id || a.prospecto_id === editing.id);

    if (loading) return <div style={{ padding: '1.5rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    return (
        <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 2 }}>Pipeline de Prospectos</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        {prospectos.filter(p => p.etapa !== 'Ganado' && p.etapa !== 'Perdido').length} activos
                        {' · '}
                        {Object.values(autosMap).flat().length} vehículos vinculados
                    </p>
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
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                                        $ {total.toLocaleString('es-AR')}
                                    </div>
                                )}
                            </div>

                            {/* Cards */}
                            {cards.map(p => {
                                const linkedAutos = autosMap[p.id] || [];
                                return (
                                    <div key={p.id} style={{ background: 'var(--color-bg-card, var(--color-bg-surface))', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                                        onClick={() => abrirEdicion(p)}
                                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--color-text-primary)' }}>{p.nombre}</div>
                                        {p.contacto && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                                                {p.contacto.nombre} {p.contacto.apellido || ''}
                                            </div>
                                        )}
                                        {p.monto_estimado && (
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: etapa.color, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)' }}>
                                                <DollarSign size={12} /> {p.monto_estimado.toLocaleString('es-AR')}
                                            </div>
                                        )}

                                        {/* Vehículos vinculados */}
                                        {linkedAutos.length > 0 && (
                                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                {linkedAutos.map(auto => {
                                                    const ec = ESTADO_COLORS[auto.estado] || ESTADO_COLORS.disponible;
                                                    return (
                                                        <div key={auto.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-surface-2, rgba(0,0,0,0.03))', fontSize: '0.6875rem' }}>
                                                            <Car size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                                                            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {auto.marca} {auto.modelo} {auto.anio}
                                                            </span>
                                                            <span style={{ padding: '0px 4px', borderRadius: 8, fontSize: '0.5625rem', fontWeight: 700, background: ec.bg, color: ec.color, flexShrink: 0 }}>
                                                                {auto.estado}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {p.fecha_cierre && (
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                                                Cierre: {new Date(p.fecha_cierre + 'T00:00:00').toLocaleDateString('es-AR')}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                            <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                                <button title="Retroceder etapa" disabled={etapaIdx === 0}
                                                    onClick={() => moverEtapa(p, 'atras')}
                                                    style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: etapaIdx === 0 ? 'not-allowed' : 'pointer', padding: '2px 4px', opacity: etapaIdx === 0 ? 0.3 : 1 }}>
                                                    <ChevronLeft size={12} />
                                                </button>
                                                <button title="Avanzar etapa" disabled={etapaIdx === ETAPAS.length - 1}
                                                    onClick={() => moverEtapa(p, 'adelante')}
                                                    style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: etapaIdx === ETAPAS.length - 1 ? 'not-allowed' : 'pointer', padding: '2px 4px', opacity: etapaIdx === ETAPAS.length - 1 ? 0.3 : 1 }}>
                                                    <ChevronRight size={12} />
                                                </button>
                                            </div>
                                            <button title="Eliminar"
                                                onClick={e => { e.stopPropagation(); eliminar(p.id); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px 4px' }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            <button
                                onClick={() => { setEditing({ ...EMPTY_PROSPECTO, etapa: etapa.id }); setShowModal(true); }}
                                style={{ border: '1px dashed var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <Plus size={12} /> Agregar
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setShowModal(false)}>
                    <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-xl)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ fontWeight: 700, margin: 0, fontSize: '1.0625rem' }}>{editing.id ? 'Editar Prospecto' : 'Nuevo Prospecto'}</h2>
                        </div>
                        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="form-group">
                                <label className="form-label">Nombre *</label>
                                <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Etapa</label>
                                    <select className="form-input" value={editing.etapa || 'Nuevo'} onChange={e => setEditing(p => ({ ...p, etapa: e.target.value }))}>
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

                            {/* Vehículos vinculados */}
                            {editing.id && (
                                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 16 }}>
                                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                        <Car size={14} /> Vehículos Vinculados
                                    </label>
                                    {/* Already linked */}
                                    {(autosMap[editing.id] || []).map(auto => {
                                        const ec = ESTADO_COLORS[auto.estado] || ESTADO_COLORS.disponible;
                                        return (
                                            <div key={auto.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface-2)', marginBottom: 6, border: '1px solid var(--color-border-subtle)' }}>
                                                <Car size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                                        {auto.marca} {auto.modelo} {auto.anio}
                                                    </div>
                                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                                                        {auto.version || ''} {auto.precio ? `· ${fmtPrice(auto.precio, auto.moneda)}` : ''}
                                                    </div>
                                                </div>
                                                <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: '0.625rem', fontWeight: 700, background: ec.bg, color: ec.color }}>
                                                    {auto.estado}
                                                </span>
                                                <button onClick={() => vincularAuto(auto.id, null)} title="Desvincular"
                                                    style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: '0.6875rem', color: 'var(--color-danger, #dc2626)' }}>
                                                    ✕
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {/* Add new link */}
                                    {(() => {
                                        const sinVincular = autosDisponibles.filter(a => !a.prospecto_id);
                                        if (sinVincular.length === 0) return null;
                                        return (
                                            <div style={{ marginTop: 4 }}>
                                                <select className="form-input" value="" onChange={e => { if (e.target.value) vincularAuto(e.target.value, editing.id!); }}
                                                    style={{ fontSize: '0.8125rem' }}>
                                                    <option value="">+ Vincular vehículo...</option>
                                                    {sinVincular.map(a => (
                                                        <option key={a.id} value={a.id}>
                                                            {a.marca} {a.modelo} {a.anio} {a.version || ''} — {fmtPrice(a.precio, a.moneda)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })()}
                                    {!editing.id && (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                            Guardá el prospecto primero para vincular vehículos.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
