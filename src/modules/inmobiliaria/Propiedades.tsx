import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, X, Grid3X3, List, MapPin, FileSignature, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Propiedad {
  id: string; direccion: string; tipo: string; superficie_m2: number | null;
  ambientes: number | null; piso: string | null; unidad: string | null;
  localidad: string | null; provincia: string | null; estado: string;
  precio_alquiler: number | null; precio_venta: number | null; moneda: string;
  propietario_id: string | null; descripcion: string | null; imagen_url: string | null;
}

const TIPOS = ['departamento', 'casa', 'local', 'oficina', 'terreno', 'cochera', 'deposito'];
const ESTADOS = ['disponible', 'alquilada', 'en_venta', 'reservada', 'en_refaccion'];
const MONEDAS = ['ARS', 'USD'];

const ESTADO_COLOR: Record<string, string> = {
  disponible: '#10B981', alquilada: '#3B82F6', en_venta: '#F59E0B',
  reservada: '#8B5CF6', en_refaccion: '#6B7280',
};
const TIPO_COLOR: Record<string, string> = {
  departamento: '#3B82F6', casa: '#10B981', local: '#F97316',
  oficina: '#8B5CF6', terreno: '#F59E0B', cochera: '#6B7280', deposito: '#0D9488',
};

const emptyProp: Omit<Propiedad, 'id'> = {
  direccion: '', tipo: 'departamento', superficie_m2: null, ambientes: null,
  piso: null, unidad: null, localidad: null, provincia: null, estado: 'disponible',
  precio_alquiler: null, precio_venta: null, moneda: 'ARS',
  propietario_id: null, descripcion: null, imagen_url: null,
};

export default function Propiedades() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Propiedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Propiedad | null>(null);
  const [form, setForm] = useState(emptyProp);
  const [wizardStep, setWizardStep] = useState(0);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  // Auto-open form if navigated with ?action=crear
  useEffect(() => {
    if (searchParams.get('action') === 'crear') {
      openNew();
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_propiedades').select('*').eq('tenant_id', tenant!.id).order('direccion');
    if (data) setItems(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyProp); setWizardStep(0); setShowModal(true); };
  const openEdit = (p: Propiedad) => { setEditing(p); setForm(p); setWizardStep(0); setShowModal(true); };

  const save = async () => {
    if (!form.direccion.trim()) return;
    if (editing) {
      const { error } = await supabase.from('inmobiliaria_propiedades').update(form).eq('id', editing.id);
      if (!error) setItems(prev => prev.map(p => p.id === editing.id ? { ...p, ...form } : p));
    } else {
      const { data, error } = await supabase.from('inmobiliaria_propiedades').insert({ ...form, tenant_id: tenant!.id }).select().single();
      if (!error && data) setItems(prev => [...prev, data]);
    }
    setShowModal(false);
  };

  const remove = async () => {
    if (!editing || !confirm('Eliminar esta propiedad?')) return;
    const { error } = await supabase.from('inmobiliaria_propiedades').delete().eq('id', editing.id);
    if (!error) { setItems(prev => prev.filter(p => p.id !== editing.id)); setShowModal(false); }
  };

  const filtered = items.filter(p => {
    if (search && !p.direccion.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEstado && p.estado !== filterEstado) return false;
    if (filterTipo && p.tipo !== filterTipo) return false;
    return true;
  });

  const fmtPrice = (n: number | null, mon: string) => n ? `${mon === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR')}` : '—';

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando propiedades...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Desktop header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Propiedades</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar direccion..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button onClick={() => setViewMode('grid')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'grid' ? '#fff' : 'var(--color-text-muted)' }}><Grid3X3 size={14} /></button>
          <button onClick={() => setViewMode('list')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--color-text-muted)' }}><List size={14} /></button>
        </div>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {/* Mobile header: compact */}
      <div className="module-header-mobile" style={{ gap: '0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ paddingLeft: 34, height: 38, fontSize: '0.875rem' }} />
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 38, fontSize: '0.875rem', width: 'auto' }}>
            <option value="">Estado</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
          </select>
          <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {filtered.map(p => (
            <div key={p.id} onClick={() => openEdit(p)} style={{
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)', padding: '1rem', cursor: 'pointer', transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{p.tipo}</span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--color-text-faint)' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado] || '#6B7280'}15`, color: ESTADO_COLOR[p.estado] || '#6B7280', textTransform: 'capitalize' }}>{p.estado.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <MapPin size={14} color="var(--color-text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.direccion}</span>
              </div>
              {p.localidad && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{p.localidad}{p.provincia ? `, ${p.provincia}` : ''}</div>}
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                {p.superficie_m2 && <span>{p.superficie_m2} m2</span>}
                {p.ambientes && <span>{p.ambientes} amb.</span>}
                {p.piso && <span>Piso {p.piso}</span>}
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, marginBottom: p.estado === 'disponible' ? 8 : 0 }}>
                {p.precio_alquiler && <span>Alq: {fmtPrice(p.precio_alquiler, p.moneda)}</span>}
                {p.precio_venta && <span>Vta: {fmtPrice(p.precio_venta, p.moneda)}</span>}
              </div>
              {p.estado === 'disponible' && (
                <button onClick={e => { e.stopPropagation(); navigate(`/inmobiliaria/contratos?propiedad=${p.id}`); }}
                  style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: '1px solid var(--color-cta, #2563EB)', background: 'transparent', color: 'var(--color-cta, #2563EB)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <FileSignature size={12} /> Crear contrato
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin propiedades</div>}
        </div>
      ) : (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 80px 60px 110px 110px 40px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Propiedad</span><span>Estado</span><span>Superficie</span><span>Amb.</span><span>Alquiler</span><span>Venta</span><span></span>
          </div>
          {/* Rows */}
          {filtered.map(p => (
            <div key={p.id} onClick={() => openEdit(p)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 100px 80px 60px 110px 110px 40px', padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', alignItems: 'center', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              {/* Propiedad: nombre + subtexto */}
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.direccion}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: `${TIPO_COLOR[p.tipo] || '#6B7280'}12`, color: TIPO_COLOR[p.tipo] || '#6B7280', textTransform: 'capitalize' }}>{p.tipo}</span>
                  {p.localidad && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{p.localidad}</span>}
                </div>
              </div>
              {/* Estado badge */}
              <div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado] || '#6B7280'}15`, color: ESTADO_COLOR[p.estado] || '#6B7280', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {p.estado.replace(/_/g, ' ')}
                </span>
              </div>
              {/* Superficie */}
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{p.superficie_m2 ? `${p.superficie_m2} m2` : '—'}</div>
              {/* Ambientes */}
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{p.ambientes || '—'}</div>
              {/* Alquiler */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{fmtPrice(p.precio_alquiler, p.moneda)}</div>
              {/* Venta */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600, color: p.precio_venta ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{fmtPrice(p.precio_venta, p.moneda)}</div>
              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={e => { e.stopPropagation(); openEdit(p); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>⋮</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin propiedades</div>}
        </div>
      )}

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = [{ label: 'Ubicación' }, { label: 'Características' }, { label: 'Precios' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!form.direccion.trim() : true;
        const isLast = wizardStep === totalSteps - 1;

        const TIPO_EMOJI: Record<string, string> = {
          departamento: '🏢', casa: '🏠', local: '🏪', oficina: '💼', terreno: '🌳', cochera: '🚗', deposito: '📦',
        };

        return (
          <div className="wizard-overlay" onClick={() => setShowModal(false)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="wizard-header">
              <h3>{editing ? 'Editar propiedad' : 'Nueva propiedad'}</h3>
              <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            {/* Step indicator */}
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

            {/* Body */}
            <div className="wizard-body">
              {/* ── STEP 0: Ubicación ── */}
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <label className="form-label">Dirección *</label>
                  <input className="form-input" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Ej: Av. Corrientes 1234, 5° A" />
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Localidad</label>
                    <input className="form-input" value={form.localidad || ''} onChange={e => setForm(f => ({ ...f, localidad: e.target.value || null }))} placeholder="Ej: CABA" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Provincia</label>
                    <input className="form-input" value={form.provincia || ''} onChange={e => setForm(f => ({ ...f, provincia: e.target.value || null }))} placeholder="Ej: Buenos Aires" />
                  </div>
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Piso</label>
                    <input className="form-input" value={form.piso || ''} onChange={e => setForm(f => ({ ...f, piso: e.target.value || null }))} placeholder="Ej: 5" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Unidad</label>
                    <input className="form-input" value={form.unidad || ''} onChange={e => setForm(f => ({ ...f, unidad: e.target.value || null }))} placeholder="Ej: A" />
                  </div>
                </div>
              </>)}

              {/* ── STEP 1: Características ── */}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Tipo de propiedad</div>
                  <div className="wizard-card-options" style={{ marginTop: 8 }}>
                    {TIPOS.map(t => (
                      <div key={t} className={`wizard-card-option${form.tipo === t ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, tipo: t }))}>
                        <div className="card-icon">{TIPO_EMOJI[t] || '🏠'}</div>
                        <div className="card-label">{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Estado</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {ESTADOS.map(e => (
                      <button key={e} className={`wizard-pill${form.estado === e ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, estado: e }))}
                        style={form.estado === e ? { background: ESTADO_COLOR[e], borderColor: ESTADO_COLOR[e] } : {}}>
                        {e.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Superficie m²</label>
                    <input type="number" className="form-input" value={form.superficie_m2 || ''} onChange={e => setForm(f => ({ ...f, superficie_m2: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Ambientes</label>
                    <input type="number" className="form-input" value={form.ambientes || ''} onChange={e => setForm(f => ({ ...f, ambientes: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                  </div>
                </div>
              </>)}

              {/* ── STEP 2: Precios ── */}
              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Moneda</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {MONEDAS.map(m => (
                      <button key={m} className={`wizard-pill${form.moneda === m ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, moneda: m }))}>{m === 'ARS' ? '$ Pesos' : 'US$ Dólares'}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Precio alquiler</label>
                    <input type="number" className="form-input" value={form.precio_alquiler || ''} onChange={e => setForm(f => ({ ...f, precio_alquiler: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Precio venta</label>
                    <input type="number" className="form-input" value={form.precio_venta || ''} onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Descripción</label>
                  <textarea className="form-input" rows={3} value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))} placeholder="Detalles adicionales de la propiedad..." />
                </div>
              </>)}
            </div>

            {/* Footer */}
            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing && <button className="wizard-btn-danger" onClick={remove}>Eliminar</button>}
              </div>
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={save}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Guardar</span>
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
