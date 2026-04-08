import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { HardHat, Plus, Search, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StyledSelect from '../../shared/components/StyledSelect';
import type { ObraFicha, EstadoObra } from './types';
import { ESTADO_OBRA_COLOR, ESTADO_OBRA_LABEL } from './types';

const EMPTY: Partial<ObraFicha> = {
  nombre: '', direccion: '', localidad: '', estado: 'activa',
  tipo_obra: '', comitente: '', fecha_inicio: '', fecha_estimada_fin: '',
  superficie_m2: null, notas: '',
};

export default function ObrasFichas() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [items, setItems] = useState<ObraFicha[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<ObraFicha>>(EMPTY);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  const closeWizard = () => { setShowModal(false); setEditing(EMPTY); setWizardStep(0); };

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('obras_fichas')
      .select('*')
      .eq('tenant_id', tenant!.id)
      .order('nombre');
    setItems(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.nombre?.trim()) return;
    const payload = {
      nombre: editing.nombre,
      direccion: editing.direccion || null,
      localidad: editing.localidad || null,
      estado: editing.estado || 'activa',
      tipo_obra: editing.tipo_obra || null,
      comitente: editing.comitente || null,
      fecha_inicio: editing.fecha_inicio || null,
      fecha_estimada_fin: editing.fecha_estimada_fin || null,
      superficie_m2: editing.superficie_m2 || null,
      notas: editing.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (editing.id) {
      await supabase.from('obras_fichas').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('obras_fichas').insert({ ...payload, tenant_id: tenant!.id });
    }
    setShowModal(false);
    setEditing(EMPTY);
    loadData();
  };

  const handleDelete = (item: ObraFicha) => {
    requestDelete(`¿Eliminar la obra "${item.nombre}"?`, async () => {
      await supabase.from('obras_fichas').delete().eq('id', item.id);
      setItems(prev => prev.filter(e => e.id !== item.id));
    });
  };

  const filtered = items.filter(o => {
    if (filtroEstado && o.estado !== filtroEstado) return false;
    if (search) {
      const s = search.toLowerCase();
      return o.nombre.toLowerCase().includes(s) || (o.direccion || '').toLowerCase().includes(s) || (o.comitente || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Obras</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Fichas de obra con equipo, presupuesto y avance</p>
        </div>
        <button
          onClick={() => { setEditing(EMPTY); setShowModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' }}
        >
          <Plus size={16} /> Nueva Obra
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            placeholder="Buscar por nombre, dirección o comitente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}
          />
        </div>
        <StyledSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_OBRA_LABEL) as EstadoObra[]).map(e => (
            <option key={e} value={e}>{ESTADO_OBRA_LABEL[e]}</option>
          ))}
        </StyledSelect>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Obra</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dirección</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Comitente</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No hay obras</td></tr>
            ) : filtered.map(o => {
              const color = ESTADO_OBRA_COLOR[o.estado];
              return (
                <tr
                  key={o.id}
                  style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                  onClick={() => navigate(`/obras/${o.id}`)}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HardHat size={16} style={{ color: '#d97706' }} />
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{o.nombre}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{o.direccion || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{o.comitente || '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>{ESTADO_OBRA_LABEL[o.estado]}</span>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditing(o); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Wizard Modal */}
      {showModal && (() => {
        const STEPS = [{ label: 'Datos' }, { label: 'Ubicación' }, { label: 'Fechas' }, { label: 'Notas' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!editing.nombre?.trim() : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={closeWizard}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>{editing.id ? 'Editar Obra' : 'Nueva Obra'}</h3>
              <button className="wizard-close" onClick={closeWizard}><X size={18} /></button>
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
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre de la obra" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Comitente</label>
                  <input className="form-input" value={editing.comitente || ''} onChange={e => setEditing(p => ({ ...p, comitente: e.target.value }))} placeholder="Cliente / dueño de la obra" />
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Estado</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {(Object.keys(ESTADO_OBRA_LABEL) as EstadoObra[]).map(e => (
                      <button key={e} className={`wizard-pill${editing.estado === e ? ' selected' : ''}`}
                        onClick={() => setEditing(p => ({ ...p, estado: e }))}>{ESTADO_OBRA_LABEL[e]}</button>
                    ))}
                  </div>
                </div>
              </>)}

              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" value={editing.direccion || ''} onChange={e => setEditing(p => ({ ...p, direccion: e.target.value }))} placeholder="Dirección de la obra" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Localidad</label>
                  <input className="form-input" value={editing.localidad || ''} onChange={e => setEditing(p => ({ ...p, localidad: e.target.value }))} placeholder="Ciudad / localidad" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Superficie (m²)</label>
                  <input className="form-input" type="number" value={editing.superficie_m2 ?? ''} onChange={e => setEditing(p => ({ ...p, superficie_m2: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                </div>
              </>)}

              {wizardStep === 2 && (<>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Fecha Inicio</label>
                    <input className="form-input" type="date" value={editing.fecha_inicio || ''} onChange={e => setEditing(p => ({ ...p, fecha_inicio: e.target.value }))} />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Fecha Estimada Fin</label>
                    <input className="form-input" type="date" value={editing.fecha_estimada_fin || ''} onChange={e => setEditing(p => ({ ...p, fecha_estimada_fin: e.target.value }))} />
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Tipo de Obra</label>
                  <input className="form-input" value={editing.tipo_obra || ''} onChange={e => setEditing(p => ({ ...p, tipo_obra: e.target.value }))} placeholder="Ej: Vivienda, Comercial, Industrial..." />
                </div>
              </>)}

              {wizardStep === 3 && (<>
                <div className="wizard-field">
                  <label className="form-label">Notas</label>
                  <textarea className="form-input" rows={5} value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} placeholder="Observaciones, detalles adicionales..." style={{ resize: 'vertical' }} />
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing.id && <button className="wizard-btn-danger" onClick={() => { handleDelete(editing as ObraFicha); closeWizard(); }}>Eliminar</button>}
              </div>
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={handleSave}>
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
      {ConfirmModal}
    </div>
  );
}
