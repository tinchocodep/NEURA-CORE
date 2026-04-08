import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { Users, Plus, Search, Pencil, Trash2, Star, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';
import type { Contratista, EstadoContratista } from './types';
import { ESTADO_CONTRATISTA_COLOR, ESTADO_CONTRATISTA_LABEL } from './types';

const EMPTY: Partial<Contratista> = {
  razon_social: '', cuit: '', contacto_nombre: '', contacto_telefono: '',
  contacto_email: '', rubro_id: null, condicion_iva: '', cbu: '',
  estado: 'activo', calificacion: null, notas: '',
};

export default function ObrasContratistas() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<Contratista[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Contratista>>(EMPTY);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  const closeWizard = () => { setShowModal(false); setEditing(EMPTY); setWizardStep(0); };

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('obras_contratistas')
      .select('*, rubro:obras_config_rubros_contratista(*)')
      .eq('tenant_id', tenant!.id)
      .order('razon_social');
    setItems(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.razon_social?.trim()) return;
    const payload = {
      razon_social: editing.razon_social,
      cuit: editing.cuit || null,
      contacto_nombre: editing.contacto_nombre || null,
      contacto_telefono: editing.contacto_telefono || null,
      contacto_email: editing.contacto_email || null,
      rubro_id: editing.rubro_id || null,
      condicion_iva: editing.condicion_iva || null,
      cbu: editing.cbu || null,
      estado: editing.estado || 'activo',
      calificacion: editing.calificacion || null,
      notas: editing.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (editing.id) {
      await supabase.from('obras_contratistas').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('obras_contratistas').insert({ ...payload, tenant_id: tenant!.id });
    }
    setShowModal(false);
    setEditing(EMPTY);
    loadData();
  };

  const handleDelete = (item: Contratista) => {
    requestDelete(`¿Eliminar "${item.razon_social}"?`, async () => {
      await supabase.from('obras_contratistas').delete().eq('id', item.id);
      setItems(prev => prev.filter(e => e.id !== item.id));
    });
  };

  const filtered = items.filter(c => {
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (search) {
      const s = search.toLowerCase();
      return c.razon_social.toLowerCase().includes(s) || (c.cuit || '').includes(s) || (c.contacto_nombre || '').toLowerCase().includes(s);
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
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Contratistas</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Registro de contratistas y subcontratistas</p>
        </div>
        <button
          onClick={() => { setEditing(EMPTY); setShowModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' }}
        >
          <Plus size={16} /> Nuevo Contratista
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input placeholder="Buscar por razón social, CUIT o contacto..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8125rem' }} />
        </div>
        <StyledSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos</option>
          {(Object.keys(ESTADO_CONTRATISTA_LABEL) as EstadoContratista[]).map(e => (
            <option key={e} value={e}>{ESTADO_CONTRATISTA_LABEL[e]}</option>
          ))}
        </StyledSelect>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Razón Social</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CUIT</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contacto</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rubro</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No hay contratistas</td></tr>
            ) : filtered.map(c => {
              const sColor = ESTADO_CONTRATISTA_COLOR[c.estado];
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users size={14} style={{ color: '#3b82f6' }} />
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.razon_social}</span>
                      {c.calificacion && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.625rem', color: '#f59e0b' }}>
                          <Star size={10} fill="#f59e0b" /> {c.calificacion}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}>{c.cuit || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{c.contacto_nombre || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{c.rubro?.nombre || '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${sColor}18`, color: sColor }}>{ESTADO_CONTRATISTA_LABEL[c.estado]}</span>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button onClick={() => { setEditing(c); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Wizard Modal */}
      {showModal && (() => {
        const STEPS = [{ label: 'Empresa' }, { label: 'Contacto' }, { label: 'Fiscal' }, { label: 'Extra' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!editing.razon_social?.trim() : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={closeWizard}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>{editing.id ? 'Editar Contratista' : 'Nuevo Contratista'}</h3>
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
                  <label className="form-label">Razón Social *</label>
                  <input className="form-input" value={editing.razon_social || ''} onChange={e => setEditing(p => ({ ...p, razon_social: e.target.value }))} placeholder="Nombre o razón social" />
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Estado</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {(Object.keys(ESTADO_CONTRATISTA_LABEL) as EstadoContratista[]).map(e => (
                      <button key={e} className={`wizard-pill${editing.estado === e ? ' selected' : ''}`}
                        onClick={() => setEditing(p => ({ ...p, estado: e }))}>{ESTADO_CONTRATISTA_LABEL[e]}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Calificación</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setEditing(p => ({ ...p, calificacion: p.calificacion === n ? null : n }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Star size={20} fill={n <= (editing.calificacion || 0) ? '#f59e0b' : 'transparent'} stroke={n <= (editing.calificacion || 0) ? '#f59e0b' : 'var(--color-text-muted)'} />
                      </button>
                    ))}
                  </div>
                </div>
              </>)}

              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <label className="form-label">Nombre de Contacto</label>
                  <input className="form-input" value={editing.contacto_nombre || ''} onChange={e => setEditing(p => ({ ...p, contacto_nombre: e.target.value }))} placeholder="Nombre del contacto" />
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={editing.contacto_telefono || ''} onChange={e => setEditing(p => ({ ...p, contacto_telefono: e.target.value }))} placeholder="+54 11 ..." />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Email</label>
                    <input className="form-input" value={editing.contacto_email || ''} onChange={e => setEditing(p => ({ ...p, contacto_email: e.target.value }))} placeholder="email@ejemplo.com" />
                  </div>
                </div>
              </>)}

              {wizardStep === 2 && (<>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">CUIT</label>
                    <input className="form-input" value={editing.cuit || ''} onChange={e => setEditing(p => ({ ...p, cuit: e.target.value }))} placeholder="20-12345678-9" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Condición IVA</label>
                    <StyledSelect value={editing.condicion_iva || ''} onChange={e => setEditing(p => ({ ...p, condicion_iva: e.target.value }))} style={{ width: '100%' }}>
                      <option value="">—</option>
                      <option value="Responsable Inscripto">Responsable Inscripto</option>
                      <option value="Monotributo">Monotributo</option>
                      <option value="Exento">Exento</option>
                    </StyledSelect>
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">CBU</label>
                  <input className="form-input" value={editing.cbu || ''} onChange={e => setEditing(p => ({ ...p, cbu: e.target.value }))} placeholder="CBU para transferencias" />
                </div>
              </>)}

              {wizardStep === 3 && (<>
                <div className="wizard-field">
                  <label className="form-label">Notas</label>
                  <textarea className="form-input" rows={5} value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} placeholder="Observaciones, referencias internas..." style={{ resize: 'vertical' }} />
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing.id && <button className="wizard-btn-danger" onClick={() => { handleDelete(editing as Contratista); closeWizard(); }}>Eliminar</button>}
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
