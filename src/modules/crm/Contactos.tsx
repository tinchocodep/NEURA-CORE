import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, Search, Trash2, Building2, Mail, Phone, X, Wrench, Eye, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import CustomSelect from '../../shared/components/CustomSelect';

interface Entidad { id: string; razon_social: string; }
interface Contacto {
    id: string; nombre: string; apellido: string | null; email: string | null;
    telefono: string | null; empresa: string | null; cargo: string | null;
    notas: string | null; activo: boolean; cliente_id: string | null; proveedor_id: string | null;
    cliente: Entidad | null; proveedor: Entidad | null;
}
type VinculoTipo = 'ninguno' | 'cliente' | 'proveedor';

const EMPTY: Partial<Contacto> & { vinculo_tipo: VinculoTipo } = {
    nombre: '', apellido: '', email: '', telefono: '', empresa: '', cargo: '', notas: '', activo: true,
    cliente_id: null, proveedor_id: null, vinculo_tipo: 'ninguno',
};

export default function CRMContactos() {
    const { tenant } = useTenant();
    const loc = useLocation();
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [clientes, setClientes] = useState<Entidad[]>([]);
    const [proveedores, setProveedores] = useState<Entidad[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Contacto> & { vinculo_tipo: VinculoTipo }>(EMPTY);
    const [wizardStep, setWizardStep] = useState(0);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (tenant) loadData(); }, [tenant]);
    useEffect(() => {
        const params = new URLSearchParams(loc.search);
        if (params.get('action') === 'crear') { openCreate(); window.history.replaceState({}, '', loc.pathname); }
    }, [loc.search]);

    const loadData = async () => {
        setLoading(true);
        const [cRes, clRes, pRes] = await Promise.all([
            supabase.from('crm_contactos').select('*, cliente:contable_clientes(id, razon_social), proveedor:contable_proveedores(id, razon_social)')
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

    const openCreate = () => { setEditing({ ...EMPTY }); setWizardStep(0); setShowModal(true); };
    const openEdit = (c: Contacto) => {
        const vinculo_tipo: VinculoTipo = c.cliente_id ? 'cliente' : c.proveedor_id ? 'proveedor' : 'ninguno';
        setEditing({ ...c, vinculo_tipo }); setWizardStep(0); setShowModal(true);
    };

    const handleSave = async () => {
        if (!editing.nombre?.trim()) return;
        setSaving(true);
        const payload = {
            nombre: editing.nombre!.trim(), apellido: editing.apellido || null,
            email: editing.email || null, telefono: editing.telefono || null,
            empresa: editing.empresa || null, cargo: editing.cargo || null,
            notas: editing.notas || null, activo: true,
            cliente_id: editing.vinculo_tipo === 'cliente' ? (editing.cliente_id || null) : null,
            proveedor_id: editing.vinculo_tipo === 'proveedor' ? (editing.proveedor_id || null) : null,
            tenant_id: tenant!.id,
        };
        if (editing.id) await supabase.from('crm_contactos').update(payload).eq('id', editing.id);
        else await supabase.from('crm_contactos').insert(payload);
        setSaving(false); setShowModal(false); loadData();
    };

    const handleDelete = async (c: Contacto) => {
        if (!confirm('¿Eliminar contacto?')) return;
        await supabase.from('crm_contactos').update({ activo: false }).eq('id', c.id);
        setContactos(prev => prev.filter(x => x.id !== c.id));
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando contactos...</div>;

    const iconBtn: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Contactos</h1>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar nombre, empresa..." value={search} onChange={e => setSearch(e.target.value)}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="">Todos los tipos</option>
                    <option value="clientes">Clientes</option>
                    <option value="proveedores">Proveedores</option>
                    <option value="sin_vincular">Sin vincular</option>
                </select>
                <button onClick={openCreate} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                    <Plus size={14} /> Nuevo
                </button>
            </div>

            {/* Grid table */}
            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 130px 120px 100px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
                    <span>Contacto</span><span>Empresa</span><span>Email</span><span>Teléfono</span><span style={{ textAlign: 'right' }}>Acciones</span>
                </div>
                {filtered.map(c => {
                    const isCliente = !!c.cliente_id;
                    const isProveedor = !!c.proveedor_id;
                    const entidadName = isCliente ? (c.cliente as any)?.razon_social : isProveedor ? (c.proveedor as any)?.razon_social : null;
                    return (
                        <div key={c.id}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 120px 130px 120px 100px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            {/* Nombre + cargo + vínculo */}
                            <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openEdit(c)}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.nombre} {c.apellido || ''}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    {c.cargo && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{c.cargo}</span>}
                                    {entidadName && (
                                        <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: isProveedor ? '#0d948815' : 'var(--color-accent-dim)', color: isProveedor ? '#0d9488' : 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                            {isProveedor ? <Wrench size={8} /> : <Building2 size={8} />}{entidadName}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Empresa */}
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.empresa || '—'}</div>
                            {/* Email */}
                            <div>{c.email ? <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Mail size={12} style={{ flexShrink: 0 }} />{c.email}</a> : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>—</span>}</div>
                            {/* Teléfono */}
                            <div>{c.telefono ? <a href={`tel:${c.telefono}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.75rem', color: 'var(--color-cta, #2563EB)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={12} />{c.telefono}</a> : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>—</span>}</div>
                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                <div className="row-action-wrap">
                                    <button onClick={e => { e.stopPropagation(); openEdit(c); }} style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                                        <Eye size={14} />
                                    </button>
                                    <span className="row-action-tooltip">Editar</span>
                                </div>
                                {c.telefono && (
                                    <div className="row-action-wrap">
                                        <a href={`tel:${c.telefono}`} onClick={e => e.stopPropagation()} style={{ ...iconBtn, color: 'var(--color-cta, #2563EB)', textDecoration: 'none' }}><Phone size={14} /></a>
                                        <span className="row-action-tooltip">Llamar</span>
                                    </div>
                                )}
                                <div className="row-action-wrap">
                                    <button onClick={e => { e.stopPropagation(); handleDelete(c); }}
                                        style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                                        <Trash2 size={14} />
                                    </button>
                                    <span className="row-action-tooltip">Eliminar</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin contactos</div>}
            </div>

            {/* ─── WIZARD MODAL ─── */}
            {showModal && (() => {
                const STEPS = [{ label: 'Datos' }, { label: 'Contacto' }, { label: 'Vínculo' }];
                const totalSteps = STEPS.length;
                const canNext = wizardStep === 0 ? !!(editing.nombre?.trim()) : true;
                const isLast = wizardStep === totalSteps - 1;

                return (
                    <div className="wizard-overlay" onClick={() => setShowModal(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()}>
                        <div className="wizard-header">
                            <h3>{editing.id ? 'Editar contacto' : 'Nuevo contacto'}</h3>
                            <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-steps">
                            {STEPS.map((s, i) => (
                                <div key={i} className="wizard-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        {i > 0 && <div className={`wizard-step-line${i <= wizardStep ? ' done' : ''}`} />}
                                        <div className={`wizard-step-dot${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ' pending'}`}
                                            onClick={() => i < wizardStep && setWizardStep(i)} style={{ cursor: i < wizardStep ? 'pointer' : 'default' }}>
                                            {i < wizardStep ? <Check size={14} /> : i + 1}
                                        </div>
                                    </div>
                                    <div className={`wizard-step-label${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ''}`}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="wizard-body">
                            {wizardStep === 0 && (<>
                                <div className="wizard-row">
                                    <div className="wizard-field">
                                        <label className="form-label">Nombre *</label>
                                        <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Juan" />
                                    </div>
                                    <div className="wizard-field">
                                        <label className="form-label">Apellido</label>
                                        <input className="form-input" value={editing.apellido || ''} onChange={e => setEditing(p => ({ ...p, apellido: e.target.value }))} placeholder="Ej: Pérez" />
                                    </div>
                                </div>
                                <div className="wizard-row">
                                    <div className="wizard-field">
                                        <label className="form-label">Empresa</label>
                                        <input className="form-input" value={editing.empresa || ''} onChange={e => setEditing(p => ({ ...p, empresa: e.target.value }))} />
                                    </div>
                                    <div className="wizard-field">
                                        <label className="form-label">Cargo</label>
                                        <input className="form-input" value={editing.cargo || ''} onChange={e => setEditing(p => ({ ...p, cargo: e.target.value }))} />
                                    </div>
                                </div>
                            </>)}
                            {wizardStep === 1 && (<>
                                <div className="wizard-field">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} placeholder="email@ejemplo.com" />
                                </div>
                                <div className="wizard-field">
                                    <label className="form-label">Teléfono</label>
                                    <input className="form-input" value={editing.telefono || ''} onChange={e => setEditing(p => ({ ...p, telefono: e.target.value }))} placeholder="11-4567-8901" />
                                </div>
                                <div className="wizard-field">
                                    <label className="form-label">Notas</label>
                                    <textarea className="form-input" rows={2} value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} placeholder="Observaciones..." />
                                </div>
                            </>)}
                            {wizardStep === 2 && (<>
                                <div className="wizard-field">
                                    <div className="wizard-section-title">Vincular a</div>
                                    <div className="wizard-pills" style={{ marginTop: 8 }}>
                                        {[
                                            { key: 'ninguno' as VinculoTipo, label: 'Sin vincular' },
                                            { key: 'cliente' as VinculoTipo, label: 'Cliente' },
                                            { key: 'proveedor' as VinculoTipo, label: 'Proveedor' },
                                        ].map(opt => (
                                            <button key={opt.key} className={`wizard-pill${editing.vinculo_tipo === opt.key ? ' selected' : ''}`}
                                                onClick={() => setEditing(p => ({ ...p, vinculo_tipo: opt.key, cliente_id: null, proveedor_id: null }))}
                                                style={editing.vinculo_tipo === opt.key && opt.key === 'proveedor' ? { background: '#0d9488', borderColor: '#0d9488' } : {}}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {editing.vinculo_tipo === 'cliente' && (
                                    <div className="wizard-field">
                                        <label className="form-label">Cliente</label>
                                        <CustomSelect
                                            value={editing.cliente_id || ''}
                                            onChange={v => setEditing(p => ({ ...p, cliente_id: v || null }))}
                                            placeholder="Buscar cliente..."
                                            options={clientes.map(cl => ({ value: cl.id, label: cl.razon_social }))}
                                        />
                                    </div>
                                )}
                                {editing.vinculo_tipo === 'proveedor' && (
                                    <div className="wizard-field">
                                        <label className="form-label">Proveedor</label>
                                        <CustomSelect
                                            value={editing.proveedor_id || ''}
                                            onChange={v => setEditing(p => ({ ...p, proveedor_id: v || null }))}
                                            placeholder="Buscar proveedor..."
                                            options={proveedores.map(p => ({ value: p.id, label: p.razon_social }))}
                                        />
                                    </div>
                                )}
                            </>)}
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left">
                                {editing.id && <button className="wizard-btn-danger" onClick={() => { handleDelete(editing as Contacto); setShowModal(false); }}>Eliminar</button>}
                            </div>
                            <div className="wizard-footer-right">
                                {wizardStep > 0 && (
                                    <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                                    </button>
                                )}
                                {isLast ? (
                                    <button className="wizard-btn-next" onClick={handleSave} disabled={saving || !editing.nombre?.trim()}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {saving ? 'Guardando...' : editing.id ? 'Guardar' : 'Crear'}</span>
                                    </button>
                                ) : (
                                    <button className="wizard-btn-next" onClick={() => setWizardStep(s => s + 1)} disabled={!canNext}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Siguiente <ChevronRight size={16} /></span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                );
            })()}
        </div>
    );
}
