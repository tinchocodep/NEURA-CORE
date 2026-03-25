import { useEffect, useState } from 'react';
import { Search, Plus, X, Phone, Mail, Trash2, Eye, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';

interface Proveedor {
  id: string; nombre: string; rubro: string; contacto_nombre: string | null;
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

const emptyProv = { nombre: '', rubro: 'general', contacto_nombre: '', telefono: '', email: '', cuit: '', direccion: '', notas: '', activo: true };

export default function ProveedoresInmob() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRubro, setFilterRubro] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form, setForm] = useState(emptyProv);
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_proveedores').select('*').eq('tenant_id', tenant!.id).order('nombre');
    if (data) setItems(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyProv); setWizardStep(0); setShowModal(true); };
  const openEdit = (p: Proveedor) => { setEditing(p); setForm(p as any); setWizardStep(0); setShowModal(true); };

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
    if (filterRubro && p.rubro !== filterRubro) return false;
    if (search && !p.nombre.toLowerCase().includes(search.toLowerCase()) && !(p.contacto_nombre || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Count by rubro
  const rubroCounts = RUBROS.reduce((acc, r) => { acc[r] = items.filter(p => p.rubro === r).length; return acc; }, {} as Record<string, number>);

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

      {/* ─── GRID TABLE ─── */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 120px 100px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
          <span>Proveedor</span><span>Rubro</span><span>Teléfono</span><span>Email</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {filtered.map(p => {
          const color = RUBRO_COLOR[p.rubro] || '#6B7280';
          return (
            <div key={p.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 120px 100px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
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
              {/* Rubro */}
              <div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${color}15`, color, textTransform: 'capitalize' }}>
                  {RUBRO_LABEL[p.rubro] || p.rubro}
                </span>
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
                  <div className="wizard-section-title">Rubro</div>
                  <div className="wizard-card-options" style={{ marginTop: 8, gridTemplateColumns: 'repeat(5, 1fr)' }}>
                    {RUBROS.map(r => (
                      <div key={r} className={`wizard-card-option${form.rubro === r ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, rubro: r }))}
                        style={form.rubro === r ? { borderColor: RUBRO_COLOR[r], background: `${RUBRO_COLOR[r]}08` } : {}}>
                        <div className="card-icon">{RUBRO_EMOJI[r] || '📦'}</div>
                        <div className="card-label" style={{ fontSize: '0.6875rem' }}>{RUBRO_LABEL[r]}</div>
                      </div>
                    ))}
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
    </div>
  );
}
