import { useEffect, useState } from 'react';
import { Search, Plus, X, Phone, Mail, Trash2, Eye, Check, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

interface Proveedor {
  id: string; nombre: string; rubro: string; rubros: string[]; contacto_nombre: string | null;
  telefono: string | null; email: string | null; cuit: string | null;
  direccion: string | null; notas: string | null; activo: boolean;
}

const RUBROS = ['plomeria', 'electricidad', 'gas', 'pintura', 'limpieza', 'cerrajeria', 'fumigacion', 'albañileria', 'mudanza', 'general'];
const RUBRO_LABEL: Record<string, string> = {
  plomeria: 'Plomería', electricidad: 'Electricidad', gas: 'Gas', pintura: 'Pintura',
  limpieza: 'Limpieza', cerrajeria: 'Cerrajería', fumigacion: 'Fumigación',
  'albañileria': 'Albañilería', mudanza: 'Mudanza', general: 'General',
};
const RUBRO_COLOR: Record<string, string> = {
  plomeria: '#3B82F6', electricidad: '#F59E0B', gas: '#EF4444', pintura: '#8B5CF6',
  limpieza: '#10B981', cerrajeria: '#6B7280', fumigacion: '#0D9488',
  'albañileria': '#F97316', mudanza: '#EC4899', general: '#6366F1',
};
const RUBRO_EMOJI: Record<string, string> = {
  plomeria: '🔧', electricidad: '⚡', gas: '🔥', pintura: '🎨',
  limpieza: '🧹', cerrajeria: '🔑', fumigacion: '🐛',
  'albañileria': '🧱', mudanza: '🚚', general: '📦',
};

const emptyProv = { nombre: '', rubro: 'general', rubros: ['general'] as string[], contacto_nombre: '', telefono: '', email: '', cuit: '', direccion: '', notas: '', activo: true };

export default function ProveedoresInmob() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRubro, setFilterRubro] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form, setForm] = useState(emptyProv);
  const [wizardStep, setWizardStep] = useState(0);
  const [historialProv, setHistorialProv] = useState<Proveedor | null>(null);
  const [historialOrdenes, setHistorialOrdenes] = useState<any[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_proveedores').select('*').eq('tenant_id', tenant!.id).order('nombre');
    if (data) setItems(data);
    setLoading(false);
  };

  const openHistorial = async (p: Proveedor) => {
    setHistorialProv(p);
    setHistorialLoading(true);
    setHistorialOrdenes([]);
    const { data } = await supabase.from('inmobiliaria_ordenes_trabajo')
      .select('id, titulo, estado, prioridad, fecha_reporte, monto_presupuesto, monto_final, propiedad:inmobiliaria_propiedades!propiedad_id(direccion)')
      .eq('tenant_id', tenant!.id)
      .eq('proveedor_id', p.id)
      .order('fecha_reporte', { ascending: false });
    setHistorialOrdenes(data || []);
    setHistorialLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyProv); setWizardStep(0); setShowModal(true); };
  const openEdit = (p: Proveedor) => { setEditing(p); setForm({ ...p as any, rubros: p.rubros?.length ? p.rubros : [p.rubro] }); setWizardStep(0); setShowModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return;
    const payload = { ...form, tenant_id: tenant!.id };
    if (editing) {
      await supabase.from('inmobiliaria_proveedores').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('inmobiliaria_proveedores').insert(payload);
    }
    setShowModal(false);
    loadData();
  };

  const remove = (p: Proveedor) => {
    requestDelete('Esta acción eliminará el proveedor y no se puede deshacer.', async () => {
      await supabase.from('inmobiliaria_proveedores').delete().eq('id', p.id);
      loadData();
    });
  };

  const filtered = items.filter(p => {
    if (filterRubro && !(p.rubros?.length ? p.rubros : [p.rubro]).includes(filterRubro)) return false;
    if (search && !p.nombre.toLowerCase().includes(search.toLowerCase()) && !(p.contacto_nombre || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Count by rubro
  const rubroCounts = RUBROS.reduce((acc, r) => { acc[r] = items.filter(p => (p.rubros?.length ? p.rubros : [p.rubro]).includes(r)).length; return acc; }, {} as Record<string, number>);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando proveedores...</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Proveedores</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterRubro} onChange={e => setFilterRubro(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los rubros</option>
          {RUBROS.map(r => <option key={r} value={r}>{RUBRO_LABEL[r]}</option>)}
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>
      {isMobile && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
          </div>
          <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* Rubro filter pills */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
        <button onClick={() => setFilterRubro('')}
          style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${!filterRubro ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: !filterRubro ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: !filterRubro ? '#fff' : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
          Todos ({items.length})
        </button>
        {RUBROS.filter(r => rubroCounts[r] > 0).map(r => (
          <button key={r} onClick={() => setFilterRubro(filterRubro === r ? '' : r)}
            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterRubro === r ? (RUBRO_COLOR[r]) : 'var(--color-border-subtle)'}`, background: filterRubro === r ? `${RUBRO_COLOR[r]}15` : 'var(--color-bg-surface)', color: filterRubro === r ? RUBRO_COLOR[r] : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {RUBRO_LABEL[r]} ({rubroCounts[r]})
          </button>
        ))}
      </div>

      {/* ─── GRID TABLE (desktop) ─── */}
      {!isMobile && (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 150px 130px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
            <span>Proveedor</span><span>Rubro</span><span>Teléfono</span><span>Email</span><span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {filtered.map(p => {
            return (
              <div key={p.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 150px 130px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                {/* Nombre + contacto + CUIT */}
                <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openEdit(p)}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {p.contacto_nombre && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{p.contacto_nombre}</span>}
                    {p.cuit && <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)' }}>CUIT {p.cuit}</span>}
                  </div>
                </div>
                {/* Rubros */}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {(p.rubros?.length ? p.rubros : [p.rubro]).map(r => {
                    const rc = RUBRO_COLOR[r] || '#6B7280';
                    return (
                      <span key={r} onClick={e => { e.stopPropagation(); navigate(`/inmobiliaria/ordenes?proveedor=${p.id}`); }}
                        style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${rc}15`, color: rc, textTransform: 'capitalize', cursor: 'pointer' }}
                        title="Ver órdenes de este proveedor">
                        {RUBRO_LABEL[r] || r}
                      </span>
                    );
                  })}
                </div>
                {/* Teléfono */}
                <div>
                  {p.telefono ? (
                    <a href={`tel:${p.telefono}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.75rem', color: 'var(--color-cta, #2563EB)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Phone size={12} /> {p.telefono}
                    </a>
                  ) : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>—</span>}
                </div>
                {/* Email */}
                <div>
                  {p.email ? (
                    <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Mail size={12} style={{ flexShrink: 0 }} /> {p.email}
                    </a>
                  ) : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>—</span>}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); openEdit(p); }}
                      style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                      <Eye size={14} />
                    </button>
                    <span className="row-action-tooltip">Editar</span>
                  </div>
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); openHistorial(p); }}
                      style={{ ...iconBtn, color: '#F59E0B' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                      <ClipboardList size={14} />
                    </button>
                    <span className="row-action-tooltip">Ver órdenes</span>
                  </div>
                  {p.telefono && (
                    <div className="row-action-wrap">
                      <a href={`tel:${p.telefono}`} onClick={e => e.stopPropagation()}
                        style={{ ...iconBtn, color: 'var(--color-cta, #2563EB)', textDecoration: 'none' }}>
                        <Phone size={14} />
                      </a>
                      <span className="row-action-tooltip">Llamar</span>
                    </div>
                  )}
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); remove(p); }}
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
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin proveedores</div>}
        </div>
      )}

      {/* ─── MOBILE CARDS ─── */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(p => {
            return (
              <div key={p.id} onClick={() => openEdit(p)} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.nombre}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flexShrink: 0, marginLeft: 8 }}>
                    {(p.rubros?.length ? p.rubros : [p.rubro]).map(r => {
                      const rc = RUBRO_COLOR[r] || '#6B7280';
                      return (
                        <span key={r} onClick={e => { e.stopPropagation(); navigate(`/inmobiliaria/ordenes?proveedor=${p.id}`); }}
                          style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${rc}15`, color: rc, textTransform: 'capitalize', cursor: 'pointer' }}>
                          {RUBRO_LABEL[r] || r}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {p.contacto_nombre && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>{p.contacto_nombre}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  {p.telefono && (
                    <a href={`tel:${p.telefono}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.75rem', color: 'var(--color-cta, #2563EB)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Phone size={12} /> {p.telefono}
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Mail size={12} style={{ flexShrink: 0 }} /> {p.email}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin proveedores</div>}
        </div>
      )}

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = [{ label: 'Datos' }, { label: 'Contacto' }, { label: 'Detalles' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!form.nombre.trim() : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={() => setShowModal(false)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
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
              {/* Step 0: Nombre + Rubro */}
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <label className="form-label">Nombre / Empresa *</label>
                  <input className="form-input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Sanitarios Rápido SRL" />
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Rubros <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>(podés elegir varios)</span></div>
                  <div className="wizard-card-options" style={{ marginTop: 8, gridTemplateColumns: 'repeat(5, 1fr)' }}>
                    {RUBROS.map(r => {
                      const selected = (form.rubros || []).includes(r);
                      return (
                        <div key={r} className={`wizard-card-option${selected ? ' selected' : ''}`}
                          onClick={() => setForm(f => {
                            const cur = f.rubros || [];
                            const next = selected ? cur.filter(x => x !== r) : [...cur, r];
                            return { ...f, rubros: next.length ? next : [r], rubro: next.length ? next[0] : r };
                          })}
                          style={selected ? { borderColor: RUBRO_COLOR[r], background: `${RUBRO_COLOR[r]}08` } : {}}>
                          <div className="card-icon">{RUBRO_EMOJI[r] || '📦'}</div>
                          <div className="card-label" style={{ fontSize: '0.6875rem' }}>{RUBRO_LABEL[r]}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>)}

              {/* Step 1: Contacto */}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <label className="form-label">Persona de contacto</label>
                  <input className="form-input" value={form.contacto_nombre || ''} onChange={e => setForm(f => ({ ...f, contacto_nombre: e.target.value }))} placeholder="Ej: Juan Pérez" />
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Ej: 11-4567-8901" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Ej: info@empresa.com" />
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">CUIT</label>
                  <input className="form-input" value={form.cuit || ''} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} placeholder="Ej: 30-12345678-9" />
                </div>
              </>)}

              {/* Step 2: Detalles */}
              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Av. Corrientes 1234, CABA" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Notas</label>
                  <textarea className="form-input" rows={3} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones, horarios, especialidades..." />
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing && <button className="wizard-btn-danger" onClick={() => { remove(editing); setShowModal(false); }}>Eliminar</button>}
              </div>
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={save} disabled={!form.nombre.trim()}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {editing ? 'Guardar' : 'Crear'}</span>
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
      {ConfirmModal}

      {/* ─── HISTORIAL ÓRDENES MODAL ─── */}
      {historialProv && (
        <div className="wizard-overlay" onClick={() => setHistorialProv(null)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="wizard-header">
              <h3>Órdenes — {historialProv.nombre}</h3>
              <button className="wizard-close" onClick={() => setHistorialProv(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '1rem 1.25rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {historialLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando...</div>
              ) : historialOrdenes.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin órdenes para este proveedor</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historialOrdenes.map(o => {
                    const estadoColor: Record<string, string> = { reportado: '#EF4444', asignado: '#F59E0B', en_curso: '#3B82F6', completado: '#10B981', facturado: '#8B5CF6', cancelado: '#6B7280' };
                    const prioColor: Record<string, string> = { alta: '#EF4444', media: '#F59E0B', baja: '#10B981' };
                    const monto = o.monto_final || o.monto_presupuesto;
                    return (
                      <div key={o.id} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titulo}</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                              {(o.propiedad as any)?.direccion || '—'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${prioColor[o.prioridad] || '#6B7280'}15`, color: prioColor[o.prioridad] || '#6B7280', textTransform: 'capitalize' }}>
                              {o.prioridad}
                            </span>
                            <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${estadoColor[o.estado] || '#6B7280'}15`, color: estadoColor[o.estado] || '#6B7280', textTransform: 'capitalize' }}>
                              {o.estado.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                            {new Date(o.fecha_reporte + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </span>
                          {monto ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                              ${Number(monto).toLocaleString('es-AR')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
