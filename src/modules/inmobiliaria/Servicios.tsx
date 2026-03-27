import { useEffect, useState } from 'react';
import { Search, Plus, X, Check, ChevronRight, ChevronLeft, Trash2, Eye, Upload, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import CustomSelect from '../../shared/components/CustomSelect';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

interface Servicio {
  id: string; propiedad_id: string; tipo: string; empresa: string | null;
  numero_cuenta: string | null; periodo: string; monto: number;
  estado: string; fecha_vencimiento: string | null; fecha_pago: string | null;
  observaciones: string | null;
  comprobante_url: string | null; comprobante_nombre: string | null;
}
interface Propiedad { id: string; direccion: string; }

const TIPOS = ['luz', 'gas', 'agua', 'internet', 'telefono', 'cable', 'seguro', 'municipal', 'otro'];
const TIPO_LABEL: Record<string, string> = {
  luz: 'Luz', gas: 'Gas', agua: 'Agua', internet: 'Internet', telefono: 'Teléfono',
  cable: 'Cable', seguro: 'Seguro', municipal: 'Municipal', otro: 'Otro',
};
const TIPO_EMOJI: Record<string, string> = {
  luz: '⚡', gas: '🔥', agua: '💧', internet: '🌐', telefono: '📞',
  cable: '📺', seguro: '🛡️', municipal: '🏛️', otro: '📦',
};
const TIPO_COLOR: Record<string, string> = {
  luz: '#F59E0B', gas: '#EF4444', agua: '#3B82F6', internet: '#8B5CF6', telefono: '#10B981',
  cable: '#EC4899', seguro: '#0D9488', municipal: '#6366F1', otro: '#6B7280',
};
const ESTADOS = ['pendiente', 'pagado', 'vencido'];
const ESTADO_COLOR: Record<string, string> = { pendiente: '#F59E0B', pagado: '#10B981', vencido: '#EF4444' };

const emptyServicio = {
  propiedad_id: '', tipo: 'luz', empresa: '' as string | null, numero_cuenta: '' as string | null,
  periodo: new Date().toISOString().slice(0, 7), monto: 0, estado: 'pendiente',
  fecha_vencimiento: '' as string | null, fecha_pago: null as string | null,
  observaciones: null as string | null,
  comprobante_url: null as string | null, comprobante_nombre: null as string | null,
};

export default function Servicios() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Servicio[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [form, setForm] = useState(emptyServicio);
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [sRes, pRes] = await Promise.all([
      supabase.from('inmobiliaria_servicios').select('*').eq('tenant_id', tenant!.id).order('periodo', { ascending: false }),
      supabase.from('inmobiliaria_propiedades').select('id, direccion').eq('tenant_id', tenant!.id).order('direccion'),
    ]);
    if (sRes.data) setItems(sRes.data);
    if (pRes.data) setPropiedades(pRes.data);
    setLoading(false);
  };

  const propDir = (id: string) => propiedades.find(p => p.id === id)?.direccion || '—';

  const openNew = () => { setEditing(null); setForm({ ...emptyServicio, periodo: new Date().toISOString().slice(0, 7) }); setWizardStep(0); setShowModal(true); };
  const openEdit = (s: Servicio) => { setEditing(s); setForm(s as any); setWizardStep(0); setShowModal(true); };

  const save = async () => {
    if (!form.propiedad_id || !form.periodo) return;
    const payload = {
      ...form, monto: Number(form.monto),
      empresa: form.empresa || null, numero_cuenta: form.numero_cuenta || null,
      fecha_vencimiento: form.fecha_vencimiento || null, fecha_pago: form.fecha_pago || null,
    };
    if (editing) {
      const { error } = await supabase.from('inmobiliaria_servicios').update(payload).eq('id', editing.id);
      if (!error) setItems(prev => prev.map(s => s.id === editing.id ? { ...s, ...payload } as Servicio : s));
    } else {
      const { data, error } = await supabase.from('inmobiliaria_servicios').insert({ ...payload, tenant_id: tenant!.id }).select().single();
      if (!error && data) setItems(prev => [data, ...prev]);
    }
    setShowModal(false);
  };

  const remove = (srv: Servicio) => {
    requestDelete('Esta acción eliminará el servicio y no se puede deshacer.', async () => {
      const { error } = await supabase.from('inmobiliaria_servicios').delete().eq('id', srv.id);
      if (!error) setItems(prev => prev.filter(s => s.id !== srv.id));
      setShowModal(false);
    });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const path = `servicios/${tenant!.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('documentos').upload(path, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(path);
      setForm(f => ({ ...f, comprobante_url: publicUrl, comprobante_nombre: file.name }));
    }
    setUploading(false);
  };

  const filtered = items.filter(s => {
    if (filterTipo && s.tipo !== filterTipo) return false;
    if (filterEstado && s.estado !== filterEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!propDir(s.propiedad_id).toLowerCase().includes(q) && !(s.empresa || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const fmtMoney = (n: number) => `$${n.toLocaleString('es-AR')}`;

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando servicios...</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Desktop header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Servicios</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar propiedad o empresa..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e} style={{ textTransform: 'capitalize' }}>{e}</option>)}
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {/* Mobile header */}
      <div className="module-header-mobile">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
          </div>
          <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Tipo filter pills */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
        <button onClick={() => setFilterTipo('')}
          style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${!filterTipo ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: !filterTipo ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: !filterTipo ? '#fff' : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
          Todos ({items.length})
        </button>
        {TIPOS.filter(t => items.some(s => s.tipo === t)).map(t => (
          <button key={t} onClick={() => setFilterTipo(filterTipo === t ? '' : t)}
            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterTipo === t ? TIPO_COLOR[t] : 'var(--color-border-subtle)'}`, background: filterTipo === t ? `${TIPO_COLOR[t]}15` : 'var(--color-bg-surface)', color: filterTipo === t ? TIPO_COLOR[t] : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {TIPO_EMOJI[t]} {TIPO_LABEL[t]} ({items.filter(s => s.tipo === t).length})
          </button>
        ))}
      </div>

      {/* Desktop table */}
      {!isMobile && (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 90px minmax(150px, 1fr) 80px 80px 80px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
            <span>Concepto</span><span>Monto</span><span>Propiedad</span><span>Estado</span><span>Fecha</span><span style={{ textAlign: 'right' }}>Acc.</span>
          </div>
          {filtered.map(s => {
            const tColor = TIPO_COLOR[s.tipo] || '#6B7280';
            const eColor = ESTADO_COLOR[s.estado] || '#6B7280';
            return (
              <div key={s.id}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 90px minmax(150px, 1fr) 80px 80px 80px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = '')}>
                {/* Concepto */}
                <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openEdit(s)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${tColor}15`, color: tColor }}>
                      {TIPO_EMOJI[s.tipo]} {TIPO_LABEL[s.tipo]}
                    </span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.empresa || s.periodo}</span>
                  </div>
                  {s.numero_cuenta && <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Cuenta: {s.numero_cuenta}</div>}
                </div>
                {/* Monto */}
                <div style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtMoney(s.monto)}</div>
                {/* Propiedad */}
                <div style={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{propDir(s.propiedad_id)}</div>
                {/* Estado */}
                <div>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${eColor}15`, color: eColor, textTransform: 'capitalize' }}>
                    {s.estado}
                  </span>
                </div>
                {/* Fecha */}
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                  {s.fecha_vencimiento ? new Date(s.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : s.periodo}
                  {s.comprobante_url && <a href={s.comprobante_url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ marginLeft: 4 }}><FileText size={12} color="#3B82F6" /></a>}
                </div>
                {/* Acciones */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(s)} style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'var(--color-bg-surface)')}>
                    <Eye size={14} />
                  </button>
                  <button onClick={() => remove(s)} style={{ ...iconBtn, color: '#EF4444' }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = '#FEF2F2')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'var(--color-bg-surface)')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin servicios</div>}
        </div>
      )}

      {/* Mobile cards */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => {
            const tColor = TIPO_COLOR[s.tipo] || '#6B7280';
            const eColor = ESTADO_COLOR[s.estado] || '#6B7280';
            return (
              <div key={s.id} onClick={() => openEdit(s)} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{propDir(s.propiedad_id)}</div>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${eColor}15`, color: eColor, textTransform: 'capitalize', flexShrink: 0, marginLeft: 8 }}>
                    {s.estado}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${tColor}15`, color: tColor }}>
                      {TIPO_EMOJI[s.tipo]} {TIPO_LABEL[s.tipo]}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.empresa || ''}</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtMoney(s.monto)}</span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin servicios</div>}
        </div>
      )}

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = [{ label: 'Servicio' }, { label: 'Detalle' }, { label: 'Estado' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!form.propiedad_id && !!form.tipo : wizardStep === 1 ? form.monto > 0 : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={() => setShowModal(false)}>
          <div className="wizard-card" onClick={ev => ev.stopPropagation()}>
            <div className="wizard-header">
              <h3>{editing ? 'Editar servicio' : 'Nuevo servicio'}</h3>
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
                <div className="wizard-field">
                  <label className="form-label">Propiedad *</label>
                  <CustomSelect
                    value={form.propiedad_id}
                    onChange={v => setForm(f => ({ ...f, propiedad_id: v }))}
                    placeholder="Seleccionar propiedad..."
                    options={propiedades.map(p => ({ value: p.id, label: p.direccion }))}
                  />
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Tipo de servicio</div>
                  <div className="wizard-card-options" style={{ marginTop: 8, gridTemplateColumns: 'repeat(5, 1fr)' }}>
                    {TIPOS.map(t => (
                      <div key={t} className={`wizard-card-option${form.tipo === t ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, tipo: t }))}
                        style={form.tipo === t ? { borderColor: TIPO_COLOR[t], background: `${TIPO_COLOR[t]}08` } : {}}>
                        <div className="card-icon">{TIPO_EMOJI[t]}</div>
                        <div className="card-label" style={{ fontSize: '0.6875rem' }}>{TIPO_LABEL[t]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>)}
              {wizardStep === 1 && (<>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Empresa</label>
                    <input className="form-input" value={form.empresa || ''} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))} placeholder="Ej: Edesur, Metrogas..." />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Nº de cuenta</label>
                    <input className="form-input" value={form.numero_cuenta || ''} onChange={e => setForm(f => ({ ...f, numero_cuenta: e.target.value }))} placeholder="Nº cliente" />
                  </div>
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Período *</label>
                    <input type="month" className="form-input" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Monto *</label>
                    <input type="number" className="form-input" value={form.monto || ''} onChange={e => setForm(f => ({ ...f, monto: Number(e.target.value) }))} placeholder="0" />
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Fecha de vencimiento</label>
                  <input type="date" className="form-input" value={form.fecha_vencimiento || ''} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value || null }))} />
                </div>
              </>)}
              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Estado</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {ESTADOS.map(e => (
                      <button key={e} className={`wizard-pill${form.estado === e ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, estado: e }))}
                        style={form.estado === e ? { background: ESTADO_COLOR[e], borderColor: ESTADO_COLOR[e] } : {}}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Comprobante</label>
                  {form.comprobante_url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                      <FileText size={16} color="#3B82F6" />
                      <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.comprobante_nombre || 'Comprobante'}</span>
                      <a href={form.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', flexShrink: 0 }}><ExternalLink size={14} /></a>
                      <button type="button" onClick={() => setForm(f => ({ ...f, comprobante_url: null, comprobante_nombre: null }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', flexShrink: 0 }}><X size={14} /></button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1.5px dashed var(--color-border)', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      <Upload size={16} /> {uploading ? 'Subiendo...' : 'Subir comprobante'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} disabled={uploading} />
                    </label>
                  )}
                </div>
                {form.comprobante_url && form.estado === 'pendiente' && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, estado: 'pagado', fecha_pago: new Date().toISOString().slice(0, 10) }))}
                    className="wizard-btn-next" style={{ alignSelf: 'flex-start' }}>
                    <Check size={14} /> Marcar como pagado
                  </button>
                )}
                {form.estado === 'pagado' && (
                  <div className="wizard-field">
                    <label className="form-label">Fecha de pago</label>
                    <input type="date" className="form-input" value={form.fecha_pago || ''} onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value || null }))} />
                  </div>
                )}
                <div className="wizard-field">
                  <label className="form-label">Observaciones</label>
                  <textarea className="form-input" rows={3} value={form.observaciones || ''} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value || null }))} placeholder="Notas adicionales..." />
                </div>
              </>)}
            </div>
            <div className="wizard-footer">
              {wizardStep > 0 && <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}><ChevronLeft size={16} /> Anterior</button>}
              <div style={{ flex: 1 }} />
              {editing && <button className="wizard-btn-danger" onClick={() => remove(editing)} style={{ marginRight: 8 }}>Eliminar</button>}
              {isLast
                ? <button className="wizard-btn-next" onClick={save} disabled={!canNext}><Check size={16} /> Guardar</button>
                : <button className="wizard-btn-next" onClick={() => setWizardStep(s => s + 1)} disabled={!canNext}>Siguiente <ChevronRight size={16} /></button>}
            </div>
          </div>
          </div>
        );
      })()}
      {ConfirmModal}
    </div>
  );
}
