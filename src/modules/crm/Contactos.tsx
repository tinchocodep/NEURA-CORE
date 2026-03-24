import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, Search, Edit2, Trash2, User, Building2, Mail, Phone, X, Wrench } from 'lucide-react';

interface Entidad { id: string; razon_social: string; }
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
    proveedor_id: string | null;
    cliente: Entidad | null;
    proveedor: Entidad | null;
}

type VinculoTipo = 'ninguno' | 'cliente' | 'proveedor';

const EMPTY: Partial<Contacto> & { vinculo_tipo: VinculoTipo } = {
    nombre: '', apellido: '', email: '', telefono: '', empresa: '', cargo: '', notas: '', activo: true,
    cliente_id: null, proveedor_id: null, vinculo_tipo: 'ninguno',
};

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}

export default function CRMContactos() {
    const { tenant } = useTenant();
    const loc = useLocation();
    const isMobile = useIsMobile();
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [clientes, setClientes] = useState<Entidad[]>([]);
    const [proveedores, setProveedores] = useState<Entidad[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState<'todos' | 'clientes' | 'proveedores' | 'sin_vincular'>('todos');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Contacto> & { vinculo_tipo: VinculoTipo }>(EMPTY);
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
        const [cRes, clRes, pRes] = await Promise.all([
            supabase.from('crm_contactos')
                .select('*, cliente:contable_clientes(id, razon_social), proveedor:contable_proveedores(id, razon_social)')
                .eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
            supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_proveedores').select('id, razon_social').eq('tenant_id', tenant!.id).eq('activo', true).order('razon_social'),
        ]);
        if (cRes.data) setContactos(cRes.data as any);
        if (clRes.data) setClientes(clRes.data);
        if (pRes.data) setProveedores(pRes.data);
        setLoading(false);
    };

    const filtered = contactos.filter(c => {
        if (search && !`${c.nombre} ${c.apellido} ${c.empresa} ${c.email}`.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterTipo === 'clientes' && !c.cliente_id) return false;
        if (filterTipo === 'proveedores' && !c.proveedor_id) return false;
        if (filterTipo === 'sin_vincular' && (c.cliente_id || c.proveedor_id)) return false;
        return true;
    });

    const openCreate = () => { setEditing({ ...EMPTY }); setShowModal(true); };
    const openEdit = (c: Contacto) => {
        const vinculo_tipo: VinculoTipo = c.cliente_id ? 'cliente' : c.proveedor_id ? 'proveedor' : 'ninguno';
        setEditing({ ...c, vinculo_tipo });
        setShowModal(true);
    };

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
            cliente_id: editing.vinculo_tipo === 'cliente' ? (editing.cliente_id || null) : null,
            proveedor_id: editing.vinculo_tipo === 'proveedor' ? (editing.proveedor_id || null) : null,
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

    const clienteCount = contactos.filter(c => c.cliente_id).length;
    const proveedorCount = contactos.filter(c => c.proveedor_id).length;
    const sinVincular = contactos.filter(c => !c.cliente_id && !c.proveedor_id).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Header */}
            {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Contactos</h1>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{contactos.length} activos</span>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: '0.8rem', borderRadius: 10 }}>
                        <Plus size={16} /> Nuevo contacto
                    </button>
                </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: isMobile ? undefined : 300 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input className="form-input" placeholder="Buscar nombre, empresa, email..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, height: 36, fontSize: '0.8rem' }} />
                </div>
                {[
                    { key: 'todos' as const, label: 'Todos', count: contactos.length },
                    { key: 'clientes' as const, label: 'Clientes', count: clienteCount },
                    { key: 'proveedores' as const, label: 'Proveedores', count: proveedorCount },
                    { key: 'sin_vincular' as const, label: 'Sin vincular', count: sinVincular },
                ].map(f => (
                    <button key={f.key} onClick={() => setFilterTipo(f.key)}
                        style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterTipo === f.key ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: filterTipo === f.key ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: filterTipo === f.key ? '#fff' : 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                        {f.label} {f.count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{f.count}</span>}
                    </button>
                ))}
                {isMobile && (
                    <button onClick={openCreate} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus size={18} />
                    </button>
                )}
            </div>

            {/* Grid */}
            {loading ? (
                <div style={{ color: 'var(--color-text-muted)', padding: '2rem' }}>Cargando...</div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    <User size={36} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
                    <div>No hay contactos{search ? ' que coincidan' : '. Creá el primero.'}</div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '300px'}, 1fr))`, gap: '0.75rem' }}>
                    {filtered.map(c => {
                        const isCliente = !!c.cliente_id;
                        const isProveedor = !!c.proveedor_id;
                        const entidadName = isCliente ? (c.cliente as any)?.razon_social : isProveedor ? (c.proveedor as any)?.razon_social : null;
                        return (
                            <div key={c.id} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: isProveedor ? '#0d948815' : 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700, color: isProveedor ? '#0d9488' : 'var(--color-accent)', flexShrink: 0 }}>
                                            {c.nombre.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.nombre} {c.apellido || ''}</div>
                                            {c.cargo && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{c.cargo}</div>}
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
                                    {entidadName && (
                                        <span style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, background: isProveedor ? '#0d948815' : 'var(--color-accent-dim)', color: isProveedor ? '#0d9488' : 'var(--color-accent)', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600, width: 'fit-content' }}>
                                            {isProveedor ? <Wrench size={10} /> : <Building2 size={10} />}
                                            {entidadName}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{
                        width: '100%', maxWidth: isMobile ? undefined : 500, padding: 0, overflow: 'hidden',
                        borderRadius: isMobile ? '20px 20px 0 0' : 'var(--radius-xl)',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)',
                    }}>
                        {/* Header */}
                        <div style={{ padding: isMobile ? '16px 16px 0' : '1.25rem 1.5rem', borderBottom: isMobile ? 'none' : '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {isMobile && <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />}
                            <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>{editing.id ? 'Editar contacto' : 'Nuevo contacto'}</h3>
                            {!isMobile && <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-icon"><X size={16} /></button>}
                        </div>

                        {/* Body */}
                        <div style={{ padding: isMobile ? '16px' : '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: isMobile ? '60vh' : '65vh', overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Nombre *</label>
                                    <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Apellido</label>
                                    <input className="form-input" value={editing.apellido || ''} onChange={e => setEditing(p => ({ ...p, apellido: e.target.value }))} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Teléfono</label>
                                    <input className="form-input" value={editing.telefono || ''} onChange={e => setEditing(p => ({ ...p, telefono: e.target.value }))} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Empresa</label>
                                    <input className="form-input" value={editing.empresa || ''} onChange={e => setEditing(p => ({ ...p, empresa: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Cargo</label>
                                    <input className="form-input" value={editing.cargo || ''} onChange={e => setEditing(p => ({ ...p, cargo: e.target.value }))} />
                                </div>
                            </div>

                            {/* Vincular a */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Vincular a</label>
                                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                    {[
                                        { key: 'ninguno' as VinculoTipo, label: 'Sin vincular' },
                                        { key: 'cliente' as VinculoTipo, label: 'Cliente' },
                                        { key: 'proveedor' as VinculoTipo, label: 'Proveedor' },
                                    ].map(opt => (
                                        <button key={opt.key} onClick={() => setEditing(p => ({ ...p, vinculo_tipo: opt.key, cliente_id: null, proveedor_id: null }))}
                                            style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: editing.vinculo_tipo === opt.key ? 'none' : '1px solid var(--color-border-subtle)', background: editing.vinculo_tipo === opt.key ? (opt.key === 'proveedor' ? '#0d9488' : opt.key === 'cliente' ? 'var(--color-cta, #2563EB)' : 'var(--color-text-primary)') : 'var(--color-bg-surface)', color: editing.vinculo_tipo === opt.key ? '#fff' : 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {editing.vinculo_tipo === 'cliente' && (
                                    <select className="form-input" value={editing.cliente_id || ''} onChange={e => setEditing(p => ({ ...p, cliente_id: e.target.value || null }))}>
                                        <option value="">Seleccionar cliente...</option>
                                        {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.razon_social}</option>)}
                                    </select>
                                )}
                                {editing.vinculo_tipo === 'proveedor' && (
                                    <select className="form-input" value={editing.proveedor_id || ''} onChange={e => setEditing(p => ({ ...p, proveedor_id: e.target.value || null }))}>
                                        <option value="">Seleccionar proveedor...</option>
                                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                                    </select>
                                )}
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Notas</label>
                                <textarea className="form-input" rows={2} value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} style={{ resize: 'vertical' }} />
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: isMobile ? '12px 16px 80px' : '1rem 1.5rem', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', gap: 8, justifyContent: isMobile ? 'stretch' : 'flex-end', background: isMobile ? undefined : 'var(--color-bg-subtle, #f8fafc)' }}>
                            <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: isMobile ? 1 : undefined }}>Cancelar</button>
                            <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ flex: isMobile ? 1 : undefined }}>
                                {saving ? 'Guardando...' : editing.id ? 'Guardar cambios' : 'Crear contacto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
