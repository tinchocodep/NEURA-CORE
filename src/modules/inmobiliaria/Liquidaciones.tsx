import { useEffect, useState } from 'react';
import { Plus, X, Check, Trash2, Search, ChevronRight, ChevronLeft, Eye, FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import CustomSelect from '../../shared/components/CustomSelect';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import StyledSelect from '../../shared/components/StyledSelect';

interface Liquidacion {
  id: string; contrato_id: string; propietario_id: string; periodo: string;
  ingreso_alquiler: number; deducciones_json: Deduccion[]; neto_propietario: number;
  estado: string; fecha_pago: string | null; categoria: string;
}
interface Deduccion { concepto: string; monto: number; }
interface Contrato {
  id: string; monto_mensual: number; moneda: string; comision_porcentaje: number | null;
  propietario_id: string;
  propiedad: { direccion: string } | null;
  propietario: { razon_social: string } | null;
}

const ESTADO_COLOR: Record<string, string> = { borrador: '#F59E0B', aprobada: '#3B82F6', pagada: '#10B981' };
const CATEGORIAS = ['alquiler', 'mantenimiento', 'impuestos', 'servicios', 'consorcio', 'otro'];
const CAT_LABEL: Record<string, string> = {
  alquiler: 'Alquiler', mantenimiento: 'Mantenimiento', impuestos: 'Impuestos',
  servicios: 'Servicios', consorcio: 'Consorcio', otro: 'Otro',
};
const CAT_COLOR: Record<string, string> = {
  alquiler: '#3B82F6', mantenimiento: '#F97316', impuestos: '#8B5CF6',
  servicios: '#0D9488', consorcio: '#EC4899', otro: '#6B7280',
};

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

interface LiquidacionesProps {
  wizardOnly?: boolean;
  onClose?: () => void;
}

export default function Liquidaciones({ wizardOnly, onClose }: LiquidacionesProps = {}) {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromHome = searchParams.get('from') === 'home';
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Liquidacion[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [searchText, setSearchText] = useState('');
  const [wizardStep, setWizardStep] = useState(0);

  // Form state
  const [selContrato, setSelContrato] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [ingreso, setIngreso] = useState(0);
  const [deducciones, setDeducciones] = useState<Deduccion[]>([]);
  const [formCategoria, setFormCategoria] = useState('alquiler');
  const [editing, setEditing] = useState<Liquidacion | null>(null);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [lRes, cRes] = await Promise.all([
      supabase.from('inmobiliaria_liquidaciones').select('*').eq('tenant_id', tenant!.id).order('periodo', { ascending: false }),
      supabase.from('inmobiliaria_contratos')
        .select('id, monto_mensual, moneda, comision_porcentaje, propietario_id, propiedad:inmobiliaria_propiedades(direccion), propietario:contable_clientes!propietario_id(razon_social)')
        .eq('tenant_id', tenant!.id).eq('estado', 'vigente'),
    ]);
    if (lRes.data) setItems(lRes.data as any);
    if (cRes.data) setContratos(cRes.data as any);
    setLoading(false);
  };

  const contratoLabel = (id: string) => {
    const c = contratos.find(ct => ct.id === id);
    return (c?.propiedad as any)?.direccion || '—';
  };
  const contratoPropietario = (id: string) => {
    const c = contratos.find(ct => ct.id === id);
    return (c?.propietario as any)?.razon_social || '—';
  };

  // Auto-open wizard if navigated with ?action=crear
  useEffect(() => {
    if (searchParams.get('action') === 'crear' && !loading) {
      openNew();
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, loading]);

  useEffect(() => {
    if (wizardOnly && !loading) openNew();
  }, [wizardOnly, loading]);

  const closeWizard = () => {
    setShowModal(false);
    if (wizardOnly && onClose) {
      onClose();
    } else if (fromHome) {
      navigate('/', { replace: true });
    }
  };

  const openNew = (categoria?: string) => {
    setEditing(null); setSelContrato(''); setPeriodo(new Date().toISOString().slice(0, 7));
    setIngreso(0); setDeducciones([]); setFormCategoria(categoria || 'alquiler');
    setWizardStep(0); setShowModal(true);
  };
  const openEdit = (l: Liquidacion) => {
    setEditing(l); setSelContrato(l.contrato_id); setPeriodo(l.periodo);
    setIngreso(l.ingreso_alquiler); setDeducciones(l.deducciones_json || []);
    setFormCategoria(l.categoria || 'alquiler'); setWizardStep(0); setShowModal(true);
  };

  const onSelectContrato = (id: string) => {
    setSelContrato(id);
    const c = contratos.find(ct => ct.id === id);
    if (c && formCategoria === 'alquiler') {
      setIngreso(c.monto_mensual);
      const comision = c.comision_porcentaje ? c.monto_mensual * c.comision_porcentaje / 100 : 0;
      setDeducciones(comision > 0 ? [{ concepto: 'Comisión administración', monto: Math.round(comision) }] : []);
    }
  };

  const addDeduccion = () => setDeducciones(d => [...d, { concepto: '', monto: 0 }]);
  const removeDeduccion = (i: number) => setDeducciones(d => d.filter((_, idx) => idx !== i));
  const updateDeduccion = (i: number, field: keyof Deduccion, val: string | number) => {
    setDeducciones(d => d.map((dd, idx) => idx === i ? { ...dd, [field]: val } : dd));
  };

  const totalDeducciones = deducciones.reduce((s, d) => s + (d.monto || 0), 0);
  const neto = ingreso - totalDeducciones;

  const save = async () => {
    if (!selContrato || !periodo) return;
    const c = contratos.find(ct => ct.id === selContrato);
    const payload = {
      contrato_id: selContrato, propietario_id: c?.propietario_id || '', periodo,
      ingreso_alquiler: ingreso, deducciones_json: deducciones, neto_propietario: neto,
      estado: 'borrador', categoria: formCategoria,
    };
    if (editing) {
      const { error } = await supabase.from('inmobiliaria_liquidaciones').update(payload).eq('id', editing.id);
      if (!error) setItems(prev => prev.map(l => l.id === editing.id ? { ...l, ...payload } as Liquidacion : l));
    } else {
      const { data, error } = await supabase.from('inmobiliaria_liquidaciones').insert({ ...payload, tenant_id: tenant!.id }).select().single();
      if (!error && data) setItems(prev => [data as any, ...prev]);
    }
    closeWizard();
  };

  const remove = (l: Liquidacion) => {
    requestDelete('Esta acción eliminará la liquidación y no se puede deshacer.', async () => {
      await supabase.from('inmobiliaria_liquidaciones').delete().eq('id', l.id);
      setItems(prev => prev.filter(x => x.id !== l.id));
    });
  };

  const updateEstado = async (id: string, estado: string) => {
    const updates: Record<string, unknown> = { estado };
    if (estado === 'pagada') updates.fecha_pago = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('inmobiliaria_liquidaciones').update(updates).eq('id', id);
    if (!error) setItems(prev => prev.map(l => l.id === id ? { ...l, ...updates } as Liquidacion : l));
  };

  const getConcepto = (l: Liquidacion) => {
    if (l.categoria === 'alquiler') return `Alquiler ${l.periodo}`;
    const first = l.deducciones_json?.[0];
    return first?.concepto || CAT_LABEL[l.categoria] || l.categoria;
  };
  const getMonto = (l: Liquidacion) => {
    if (l.categoria === 'alquiler') return l.neto_propietario;
    return l.deducciones_json?.reduce((s: number, d: Deduccion) => s + d.monto, 0) || 0;
  };

  const filtered = items.filter(l => {
    if (filterEstado && l.estado !== filterEstado) return false;
    if (filterCategoria && l.categoria !== filterCategoria) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!contratoLabel(l.contrato_id).toLowerCase().includes(q) && !getConcepto(l).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading && !wizardOnly) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando liquidaciones...</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {!wizardOnly && (<>
      {/* Desktop header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Liquidaciones</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar propiedad o concepto..." value={searchText} onChange={e => setSearchText(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <StyledSelect value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="aprobada">Aprobada</option>
          <option value="pagada">Pagada</option>
        </StyledSelect>
        <StyledSelect value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
        </StyledSelect>
        <button onClick={() => openNew()} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {/* Mobile header */}
      {isMobile && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar..." value={searchText} onChange={e => setSearchText(e.target.value)}
              className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
          </div>
          <button onClick={() => openNew()} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
        {[{ key: '', label: 'Todos' }, { key: 'borrador', label: 'Borrador' }, { key: 'aprobada', label: 'Aprobada' }, { key: 'pagada', label: 'Pagada' }].map(f => (
          <button key={f.key} onClick={() => setFilterEstado(filterEstado === f.key ? '' : f.key)}
            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterEstado === f.key ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: filterEstado === f.key ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: filterEstado === f.key ? '#fff' : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {f.label}
          </button>
        ))}
        <div style={{ width: 1, background: 'var(--color-border-subtle)', margin: '0 2px' }} />
        {CATEGORIAS.map(c => (
          <button key={c} onClick={() => setFilterCategoria(filterCategoria === c ? '' : c)}
            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterCategoria === c ? (CAT_COLOR[c]) : 'var(--color-border-subtle)'}`, background: filterCategoria === c ? `${CAT_COLOR[c]}15` : 'var(--color-bg-surface)', color: filterCategoria === c ? CAT_COLOR[c] : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>

      {/* ─── GRID TABLE (desktop) ─── */}
      {!isMobile && (
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 80px 130px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
          <span>Propiedad</span><span>Categoría</span><span>Periodo</span><span>Neto</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {/* Rows */}
        {filtered.map(l => {
          const cat = l.categoria || 'alquiler';
          const monto = getMonto(l);
          return (
            <div key={l.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 80px 130px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              {/* Propiedad + propietario + concepto */}
              <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openEdit(l)}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contratoLabel(l.contrato_id)}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contratoPropietario(l.contrato_id)} · {getConcepto(l)}
                </div>
              </div>
              {/* Categoría */}
              <div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${CAT_COLOR[cat]}15`, color: CAT_COLOR[cat], textTransform: 'uppercase' }}>{CAT_LABEL[cat]}</span>
              </div>
              {/* Periodo */}
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{l.periodo}</div>
              {/* Neto */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: l.neto_propietario >= 0 ? '#10B981' : 'var(--color-text-primary)' }}>
                ${Math.abs(monto).toLocaleString('es-AR')}
              </div>
              {/* Estado */}
              <div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${ESTADO_COLOR[l.estado]}15`, color: ESTADO_COLOR[l.estado], textTransform: 'capitalize' }}>{l.estado}</span>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {l.estado === 'borrador' && (
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); updateEstado(l.id, 'aprobada'); }}
                      style={{ ...iconBtn, color: '#3B82F6', borderColor: '#3B82F630' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#3B82F610'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#3B82F630'; }}>
                      <Check size={14} />
                    </button>
                    <span className="row-action-tooltip">Aprobar</span>
                  </div>
                )}
                {l.estado === 'aprobada' && (
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); updateEstado(l.id, 'pagada'); }}
                      style={{ ...iconBtn, color: '#10B981', borderColor: '#10B98130' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#10B98110'; e.currentTarget.style.borderColor = '#10B981'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#10B98130'; }}>
                      <Check size={14} />
                    </button>
                    <span className="row-action-tooltip">Marcar pagada</span>
                  </div>
                )}
                {/* Link to OP */}
                <div className="row-action-wrap">
                  <button onClick={e => { e.stopPropagation(); navigate('/tesoreria/ordenes-pago'); }}
                    style={{ ...iconBtn, color: '#8B5CF6', borderColor: '#8B5CF630' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF610'; e.currentTarget.style.borderColor = '#8B5CF6'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#8B5CF630'; }}>
                    <FileText size={14} />
                  </button>
                  <span className="row-action-tooltip">Ver orden de pago</span>
                </div>
                {/* View */}
                <div className="row-action-wrap">
                  <button onClick={e => { e.stopPropagation(); openEdit(l); }}
                    style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                    <Eye size={14} />
                  </button>
                  <span className="row-action-tooltip">Ver detalles</span>
                </div>
                {/* Delete */}
                <div className="row-action-wrap">
                  <button onClick={e => { e.stopPropagation(); remove(l); }}
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
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin liquidaciones</div>}
      </div>
      )}

      {/* Mobile cards */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(l => {
            const cat = l.categoria || 'alquiler';
            const monto = getMonto(l);
            return (
              <div key={l.id} onClick={() => openEdit(l)} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{contratoLabel(l.contrato_id)}</div>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${ESTADO_COLOR[l.estado]}15`, color: ESTADO_COLOR[l.estado], textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
                    {l.estado}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${CAT_COLOR[cat]}15`, color: CAT_COLOR[cat], textTransform: 'uppercase' }}>{CAT_LABEL[cat]}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{getConcepto(l)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: l.neto_propietario >= 0 ? '#10B981' : 'var(--color-text-primary)' }}>
                    ${Math.abs(monto).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{l.periodo}</span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin liquidaciones</div>}
        </div>
      )}

      </>)}

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = formCategoria === 'alquiler'
          ? [{ label: 'Tipo' }, { label: 'Propiedad' }, { label: 'Deducciones' }]
          : [{ label: 'Tipo' }, { label: 'Propiedad' }, { label: 'Gastos' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 1 ? !!selContrato : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={() => closeWizard()}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>{editing ? 'Editar liquidación' : 'Nueva liquidación'}</h3>
              <button className="wizard-close" onClick={() => closeWizard()}><X size={18} /></button>
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
              {/* Step 0: Categoría + Periodo */}
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Categoría</div>
                  <div className="wizard-card-options" style={{ marginTop: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {CATEGORIAS.map(c => (
                      <div key={c} className={`wizard-card-option${formCategoria === c ? ' selected' : ''}`}
                        onClick={() => setFormCategoria(c)}
                        style={formCategoria === c ? { borderColor: CAT_COLOR[c], background: `${CAT_COLOR[c]}08` } : {}}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLOR[c], margin: '0 auto 4px' }} />
                        <div className="card-label" style={{ fontSize: '0.75rem' }}>{CAT_LABEL[c]}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Periodo</label>
                  <input type="month" className="form-input" value={periodo} onChange={e => setPeriodo(e.target.value)} />
                </div>
              </>)}

              {/* Step 1: Propiedad + Ingreso */}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <label className="form-label">Propiedad (contrato vigente) *</label>
                  <CustomSelect
                    value={selContrato}
                    onChange={v => onSelectContrato(v)}
                    placeholder="Seleccionar propiedad..."
                    options={contratos.map(c => ({
                      value: c.id,
                      label: (c.propiedad as any)?.direccion || '—',
                      sub: (c.propietario as any)?.razon_social || '',
                    }))}
                  />
                </div>
                {formCategoria === 'alquiler' && (
                  <div className="wizard-field">
                    <label className="form-label">Ingreso alquiler</label>
                    <input type="number" className="form-input" value={ingreso || ''} onChange={e => setIngreso(Number(e.target.value))} placeholder="Se autocompleta del contrato" />
                  </div>
                )}
              </>)}

              {/* Step 2: Deducciones/Gastos + Resumen */}
              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="wizard-section-title" style={{ border: 'none' }}>{formCategoria === 'alquiler' ? 'Deducciones' : 'Detalle de gastos'}</div>
                    <button onClick={addDeduccion} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 99, border: '1.5px solid var(--color-cta, #2563EB)', background: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', fontFamily: 'var(--font-sans)' }}>
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                  {deducciones.length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                      Sin {formCategoria === 'alquiler' ? 'deducciones' : 'gastos'}. Presioná "Agregar" para sumar.
                    </div>
                  )}
                  {deducciones.map((d, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <input className="form-input" placeholder="Concepto" value={d.concepto} onChange={e => updateDeduccion(i, 'concepto', e.target.value)} style={{ flex: 2 }} />
                      <input type="number" className="form-input" placeholder="$0" value={d.monto || ''} onChange={e => updateDeduccion(i, 'monto', Number(e.target.value))} style={{ flex: 1 }} />
                      <button onClick={() => removeDeduccion(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                {/* Totales */}
                <div style={{ background: 'var(--color-bg-surface-2)', borderRadius: 12, padding: '1rem' }}>
                  {formCategoria === 'alquiler' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 6 }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Ingreso</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${ingreso.toLocaleString('es-AR')}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: formCategoria === 'alquiler' ? '#EF4444' : 'var(--color-text-primary)', marginBottom: 6 }}>
                    <span>{formCategoria === 'alquiler' ? 'Deducciones' : 'Total gasto'}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formCategoria === 'alquiler' ? '-' : ''}${totalDeducciones.toLocaleString('es-AR')}</span>
                  </div>
                  {formCategoria === 'alquiler' && (
                    <div style={{ borderTop: '2px solid var(--color-border-subtle)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 700 }}>
                      <span>Neto propietario</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#10B981' }}>${neto.toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing && <button className="wizard-btn-danger" onClick={() => { remove(editing); closeWizard(); }}>Eliminar</button>}
              </div>
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={save} disabled={!selContrato}>
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
