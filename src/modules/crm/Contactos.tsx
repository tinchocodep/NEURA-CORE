import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, Search, Edit2, Trash2, User, Building2, Mail, Phone } from 'lucide-react';

interface Cliente { id: string; razon_social: string; }
interface Contacto {
    id: string;
    nombre: string;
    apellido: string | null;
    email: string | null;
    telefono: string | null;
    empresa: string | null;
    cargo: string | null;
    notas: string | null;
    activo: boolean;
    cliente_id: string | null;
    cliente: Cliente | null;
}

const EMPTY: Partial<Contacto> = { nombre: '', apellido: '', email: '', telefono: '', empresa: '', cargo: '', notas: '', activo: true, cliente_id: null };

export default function CRMContactos() {
    const { tenant } = useTenant();
    const loc = useLocation();
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Contacto>>(EMPTY);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (tenant) loadData(); }, [tenant]);

    // Auto-open form if navigated with ?action=crear
    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        if (params.get('action') === 'crear') {
            openCreate();
            window.history.replaceState({}, '', loc.pathname);
        }
    }, [loc.search]);

    const loadData = async () => {
        setLoading(true);
        const [cRes, clRes] = await Promise.all([
            supabase.from('crm_contactos').select('*, cliente:contable_clientes(id, razon_social)').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
            supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id).eq('activo', true).order('razon_social'),
        ]);
        if (cRes.data) setContactos(cRes.data as any);
        if (clRes.data) setClientes(clRes.data);
        setLoading(false);
    };

    const filtered = contactos.filter(c =>
        `${c.nombre} ${c.apellido} ${c.empresa} ${c.email}`.toLowerCase().includes(search.toLowerCase())
    );

    const openCreate = () => { setEditing({ ...EMPTY }); setShowModal(true); };
    const openEdit = (c: Contacto) => { setEditing({ ...c }); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.nombre?.trim()) return;
        setSaving(true);
        const payload = {
            nombre: editing.nombre!.trim(),
            apellido: editing.apellido || null,
            email: editing.email || null,
            telefono: editing.telefono || null,
            empresa: editing.empresa || null,
            cargo: editing.cargo || null,
            notas: editing.notas || null,
            activo: true,
            cliente_id: editing.cliente_id || null,
            tenant_id: tenant!.id,
        };
        if (editing.id) {
            await supabase.from('crm_contactos').update(payload).eq('id', editing.id);
        } else {
            await supabase.from('crm_contactos').insert(payload);
        }
        setSaving(false);
        setShowModal(false);
        loadData();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar contacto?')) return;
        await supabase.from('crm_contactos').update({ activo: false }).eq('id', id);
        setContactos(prev => prev.filter(c => c.id !== id));
    };

    return (
        <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 2 }}>Contactos</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{contactos.length} contactos activos</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={16} /> Nuevo Contacto
                </button>
            </div>

            <div style={{ marginBottom: '1rem', position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input className="form-input" placeholder="Buscar por nombre, empresa o email..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
            </div>

            {loading ? (
                <div style={{ color: 'var(--color-text-muted)' }}>Cargando...</div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    <User size={36} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
                    <div>No hay contactos{search ? ' que coincidan' : '. Creá el primero.'}</div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                    {filtered.map(c => (
                        <div key={c.id} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0 }}>
                                        {c.nombre.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.nombre} {c.apellido || ''}</div>
                                        {c.cargo && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{c.cargo}</div>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button className="btn btn-ghost btn-icon" onClick={() => openEdit(c)} title="Editar"><Edit2 size={13} /></button>
                                    <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(c.id)} title="Eliminar" style={{ color: 'var(--color-danger)' }}><Trash2 size={13} /></button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                {c.empresa && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={12} /> {c.empresa}</span>}
                                {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {c.email}</span>}
                                {c.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {c.telefono}</span>}
                                {c.cliente && (
                                    <span style={{ marginTop: 4, background: 'var(--color-accent-dim)', color: 'var(--color-accent)', padding: '1px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600, width: 'fit-content' }}>
                                        {(c.cliente as any).razon_social}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>{editing.id ? 'Editar Contacto' : 'Nuevo Contacto'}</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="form-group">
                                <label className="form-label">Nombre *</label>
                                <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Apellido</label>
                                <input className="form-input" value={editing.apellido || ''} onChange={e => setEditing(p => ({ ...p, apellido: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input className="form-input" type="email" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Teléfono</label>
                                <input className="form-input" value={editing.telefono || ''} onChange={e => setEditing(p => ({ ...p, telefono: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Empresa</label>
                                <input className="form-input" value={editing.empresa || ''} onChange={e => setEditing(p => ({ ...p, empresa: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Cargo</label>
                                <input className="form-input" value={editing.cargo || ''} onChange={e => setEditing(p => ({ ...p, cargo: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Vincular a Cliente</label>
                                <select className="form-input" value={editing.cliente_id || ''} onChange={e => setEditing(p => ({ ...p, cliente_id: e.target.value || null }))}>
                                    <option value="">Sin vincular</option>
                                    {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.razon_social}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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
