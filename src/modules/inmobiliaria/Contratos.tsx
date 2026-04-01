import { useEffect, useState } from 'react';
import { Search, Plus, X, FileText, Grid3X3, List, Upload, Paperclip, TrendingUp, Trash2, Check, ChevronRight, ChevronLeft, Receipt, Wrench, Wallet, Eye, MoreVertical } from 'lucide-react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import CustomSelect from '../../shared/components/CustomSelect';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import StyledSelect from '../../shared/components/StyledSelect';

interface Documento { nombre: string; url: string; tipo: string; fecha: string; }
interface Ajuste { fecha: string; monto_anterior: number; monto_nuevo: number; indice: string; porcentaje: number; }
interface Contrato {
  id: string; propiedad_id: string; inquilino_id: string; propietario_id: string;
  tipo: string; fecha_inicio: string; fecha_fin: string; monto_mensual: number;
  moneda: string; indice_ajuste: string; periodo_ajuste_meses: number | null;
  deposito: number | null; comision_porcentaje: number | null; estado: string; notas: string | null;
  fecha_firma: string | null; escribania: string | null;
  documentos: Documento[]; monto_original: number | null; ultimo_ajuste: string | null; historial_ajustes: Ajuste[];
}
interface Propiedad { id: string; direccion: string; }
interface Cliente { id: string; razon_social: string; }

const ESTADOS = ['vigente', 'vencido', 'rescindido', 'borrador'];
const TIPOS = ['alquiler', 'venta', 'temporal'];
const INDICES = ['ICL', 'IPC', 'libre'];
const MONEDAS = ['ARS', 'USD'];

const ESTADO_COLOR: Record<string, string> = {
  vigente: '#10B981', vencido: '#EF4444', rescindido: '#6B7280', borrador: '#F59E0B',
};

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

const emptyContrato = {
  propiedad_id: '', inquilino_id: '', propietario_id: '', tipo: 'alquiler',
  fecha_inicio: '', fecha_fin: '', monto_mensual: 0, moneda: 'ARS',
  indice_ajuste: 'ICL', periodo_ajuste_meses: 12 as number | null, deposito: null as number | null,
  comision_porcentaje: null as number | null, estado: 'borrador', notas: null as string | null,
  fecha_firma: null as string | null, escribania: null as string | null,
};

export default function Contratos({ wizardOnly, onClose }: { wizardOnly?: boolean; onClose?: () => void } = {}) {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromHome = searchParams.get('from') === 'home';
  const loc = useLocation();
  const [items, setItems] = useState<Contrato[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Contrato | null>(null);
  const [mobileMenuId, setMobileMenuId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyContrato);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showNewCliente, setShowNewCliente] = useState<'inquilino' | 'propietario' | null>(null);
  const [newClienteNombre, setNewClienteNombre] = useState('');
  const [newClienteCuit, setNewClienteCuit] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  // Auto-open form if navigated with ?action=crear
  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    if (params.get('action') === 'crear') {
      setEditing(null);
      setForm(emptyContrato);
      setShowModal(true);
      window.history.replaceState({}, '', loc.pathname);
    }
  }, [loc.search]);

  // Auto-open form if navigated from Propiedades with ?propiedad=id
  useEffect(() => {
    const propId = searchParams.get('propiedad');
    if (propId && propiedades.length > 0 && !showModal) {
      setEditing(null);
      setForm({ ...emptyContrato, propiedad_id: propId });
      setShowModal(true);
      setSearchParams({});
    }
  }, [searchParams, propiedades]);

  // Auto-open wizard when used in wizardOnly mode
  useEffect(() => {
    if (wizardOnly && !loading) {
      setEditing(null);
      setForm(emptyContrato);
      setShowModal(true);
    }
  }, [wizardOnly, loading]);

  const loadData = async () => {
    setLoading(true);
    const [cRes, pRes, clRes] = await Promise.all([
      supabase.from('inmobiliaria_contratos').select('*').eq('tenant_id', tenant!.id).order('fecha_inicio', { ascending: false }),
      supabase.from('inmobiliaria_propiedades').select('id, direccion').eq('tenant_id', tenant!.id),
      supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id),
    ]);
    if (cRes.data) setItems(cRes.data);
    if (pRes.data) setPropiedades(pRes.data);
    if (clRes.data) setClientes(clRes.data);
    setLoading(false);
  };

  const propDir = (id: string) => propiedades.find(p => p.id === id)?.direccion || '—';
  const cliName = (id: string) => clientes.find(c => c.id === id)?.razon_social || '—';

  const crearCliente = async () => {
    if (!newClienteNombre.trim()) return;
    const { data } = await supabase.from('contable_clientes')
      .insert({ tenant_id: tenant!.id, razon_social: newClienteNombre.trim(), cuit: newClienteCuit || null, segmento: showNewCliente === 'propietario' ? 'Propietario' : 'Inquilino', activo: true })
      .select('id, razon_social').single();
    if (data) {
      setClientes(prev => [...prev, data]);
      if (showNewCliente === 'inquilino') setForm(f => ({ ...f, inquilino_id: data.id }));
      else setForm(f => ({ ...f, propietario_id: data.id }));
    }
    setShowNewCliente(null);
    setNewClienteNombre('');
    setNewClienteCuit('');
  };

  const openNew = () => { setEditing(null); setForm(emptyContrato); setWizardStep(0); setShowModal(true); };
  const openEdit = (c: Contrato) => { setEditing(c); setForm(c); setWizardStep(0); setShowModal(true); };

  const save = async () => {
    if (!form.propiedad_id || !form.fecha_inicio) return;
    if (editing) {
      const { error } = await supabase.from('inmobiliaria_contratos').update(form).eq('id', editing.id);
      if (!error) setItems(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } as Contrato : c));
    } else {
      const { data, error } = await supabase.from('inmobiliaria_contratos').insert({ ...form, tenant_id: tenant!.id }).select().single();
      if (!error && data) setItems(prev => [data, ...prev]);
    }
    closeWizard();
  };

  const closeWizard = () => {
    setShowModal(false);
    setWizardStep(0);
    if (wizardOnly && onClose) {
      onClose();
    } else if (fromHome) {
      navigate('/', { replace: true });
    }
  };

  const remove = () => {
    if (!editing) return;
    requestDelete('Esta acción eliminará el contrato y no se puede deshacer.', async () => {
      const { error } = await supabase.from('inmobiliaria_contratos').delete().eq('id', editing.id);
      if (!error) { setItems(prev => prev.filter(c => c.id !== editing.id)); closeWizard(); }
    });
  };

  const now = new Date();
  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  // Filter metrics (used in filter tabs)
  const vigentes = items.filter(c => c.estado === 'vigente');
  const porVencer30 = vigentes.filter(c => daysUntil(c.fecha_fin) <= 30 && daysUntil(c.fecha_fin) > 0).length;
  const vencidos = items.filter(c => c.estado === 'vencido' || (c.estado === 'vigente' && daysUntil(c.fecha_fin) <= 0)).length;

  const filtered = items.filter(c => {
    if (filterEstado === 'vence_pronto') {
      const d = daysUntil(c.fecha_fin);
      if (!(c.estado === 'vigente' && d > 0 && d <= 30)) return false;
    } else if (filterEstado === 'moroso') {
      if (!(c.estado === 'vigente' && daysUntil(c.fecha_fin) <= 0)) return false;
    } else if (filterEstado && c.estado !== filterEstado) {
      return false;
    }
    if (search) {
      const dir = propDir(c.propiedad_id).toLowerCase();
      const inq = cliName(c.inquilino_id).toLowerCase();
      if (!dir.includes(search.toLowerCase()) && !inq.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  if (loading && !wizardOnly) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando contratos...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {!wizardOnly && (<>
      {/* Desktop header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Contratos</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar propiedad o inquilino..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <StyledSelect value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </StyledSelect>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button onClick={() => setViewMode('grid')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'grid' ? '#fff' : 'var(--color-text-muted)' }}><Grid3X3 size={14} /></button>
          <button onClick={() => setViewMode('list')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--color-text-muted)' }}><List size={14} /></button>
        </div>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>
      {/* Inline KPI counter (desktop) */}
      <div className="module-header-desktop" style={{ border: 'none', padding: 0, minHeight: 0 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {filtered.length} contrato{filtered.length !== 1 ? 's' : ''} · {vencidos} vencido{vencidos !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Mobile header */}
      <div className="module-header-mobile">
        {/* Search + new */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar propiedad o inquilino..." value={search} onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
          </div>
          <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} />
          </button>
        </div>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { id: '', label: `Todos (${items.length})` },
            { id: 'vigente', label: `Activos (${vigentes.length})` },
            { id: 'vence_pronto', label: `Vencen pronto (${porVencer30})` },
            { id: 'moroso', label: `Morosos (${vencidos})` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setFilterEstado(tab.id)}
              style={{ padding: '5px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: filterEstado === tab.id ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: filterEstado === tab.id ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
              {tab.label}
            </button>
          ))}
        </div>
        {/* Result count */}
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '2px 0' }}>
          {filtered.length} contrato{filtered.length !== 1 ? 's' : ''} · {vencidos} vencido{vencidos !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ─── LIST VIEW (desktop) ─── */}
      {!isMobile && (viewMode === 'list' ? (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 95px 90px 90px 120px 160px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
            <span>Propiedad</span><span>Estado</span><span>Monto</span><span>Vence</span><span>Firma</span><span>Escribanía</span><span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {/* Rows */}
          {filtered.map(c => {
            const dias = daysUntil(c.fecha_fin);
            const isUrgent = c.estado === 'vigente' && dias <= 30 && dias > 0;
            const isOverdue = c.estado === 'vigente' && dias <= 0;
            const estadoLabel = isOverdue ? 'Moroso' : isUrgent ? `${dias}d` : c.estado;
            const estadoColor = isOverdue ? '#EF4444' : isUrgent ? '#F59E0B' : (ESTADO_COLOR[c.estado] || '#6B7280');
            const iconBtn: React.CSSProperties = {
              width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
            };
            return (
              <div key={c.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 95px 90px 90px 120px 160px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                {/* Propiedad + inquilino + tipo badge */}
                <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openEdit(c)}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{propDir(c.propiedad_id)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliName(c.inquilino_id)}</span>
                    <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'rgba(99,102,241,0.08)', color: '#6366F1', textTransform: 'capitalize', flexShrink: 0 }}>{c.tipo}</span>
                  </div>
                </div>
                {/* Estado */}
                <div>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${estadoColor}15`, color: estadoColor, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                    {estadoLabel}
                  </span>
                </div>
                {/* Monto */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {c.moneda === 'USD' ? 'US$' : '$'}{c.monto_mensual.toLocaleString('es-AR')}
                </div>
                {/* Fecha fin */}
                <div style={{ fontSize: '0.6875rem', color: isOverdue ? '#EF4444' : 'var(--color-text-muted)' }}>
                  {new Date(c.fecha_fin + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                </div>
                {/* Fecha firma */}
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                  {c.fecha_firma ? new Date(c.fecha_firma + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                </div>
                {/* Escribanía */}
                <div style={{ fontSize: '0.6875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.escribania ? (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.escribania)}`} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--color-cta, #2563EB)', textDecoration: 'none', fontWeight: 500 }}
                      title="Ver en Google Maps"
                      onClick={e => e.stopPropagation()}>
                      {c.escribania}
                    </a>
                  ) : '—'}
                </div>
                {/* Action icon buttons */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {[
                    { icon: Receipt, label: 'Facturar', color: '#3B82F6', onClick: () => navigate('/inmobiliaria/facturar') },
                    { icon: Wallet, label: 'Liquidar', color: '#10B981', onClick: () => navigate('/inmobiliaria/liquidaciones') },
                    { icon: Wrench, label: 'Problema', color: '#8B5CF6', onClick: () => navigate(`/inmobiliaria/ordenes?propiedad=${c.propiedad_id}`) },
                    { icon: Eye, label: 'Ver detalles', color: 'var(--color-text-muted)', onClick: () => openEdit(c) },
                    { icon: Trash2, label: 'Eliminar', color: '#EF4444', onClick: () => { setEditing(c); remove(); } },
                  ].map(btn => (
                    <div key={btn.label} className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); btn.onClick(); }}
                        className="row-action-btn"
                        style={{ ...iconBtn, color: btn.color, borderColor: `${btn.color}30` }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${btn.color}10`; e.currentTarget.style.borderColor = btn.color; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = `${btn.color}30`; }}>
                        <btn.icon size={14} />
                      </button>
                      <span className="row-action-tooltip">{btn.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin contratos</div>
          )}
        </div>
      ) : (
      /* ─── CARD VIEW ─── */
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
        {filtered.map(c => {
          const dias = daysUntil(c.fecha_fin);
          return (
            <div key={c.id} onClick={() => openEdit(c)} style={{
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 12, padding: '0.875rem', cursor: 'pointer', transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[c.estado]}20`, color: ESTADO_COLOR[c.estado], textTransform: 'capitalize' }}>{c.estado}</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', color: '#6366F1', textTransform: 'capitalize' }}>{c.tipo}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                <FileText size={14} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{propDir(c.propiedad_id)}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                {cliName(c.inquilino_id)} → {cliName(c.propietario_id)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700 }}>
                  {c.moneda === 'USD' ? 'US$' : '$'}{c.monto_mensual.toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.7rem', color: c.estado === 'vigente' && dias <= 30 ? '#EF4444' : 'var(--color-text-muted)' }}>
                  {c.estado === 'vigente' ? (dias > 0 ? `${dias} días` : 'Vencido') : `${new Date(c.fecha_inicio).toLocaleDateString('es-AR')} — ${new Date(c.fecha_fin).toLocaleDateString('es-AR')}`}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin contratos</div>}
      </div>
      ))}

      {/* Mobile cards */}
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(c => {
            const dias = daysUntil(c.fecha_fin);
            const isUrgent = c.estado === 'vigente' && dias <= 30 && dias > 0;
            const isOverdue = c.estado === 'vigente' && dias <= 0;
            const estadoLabel = isOverdue ? 'Moroso' : isUrgent ? `${dias}d` : c.estado;
            const estadoColor = isOverdue ? '#EF4444' : isUrgent ? '#F59E0B' : (ESTADO_COLOR[c.estado] || '#6B7280');
            return (
              <div key={c.id} onClick={() => openEdit(c)} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{propDir(c.propiedad_id)}</div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${estadoColor}15`, color: estadoColor, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
                    {estadoLabel}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{cliName(c.inquilino_id)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem' }}>
                    {c.moneda === 'USD' ? 'US$' : '$'}{c.monto_mensual.toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: isOverdue ? '#EF4444' : 'var(--color-text-muted)' }}>
                    {new Date(c.fecha_fin + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <button onClick={e => { e.stopPropagation(); navigate('/inmobiliaria/facturar'); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #3B82F6', background: 'transparent', color: '#3B82F6', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Facturar</button>
                  <div style={{ position: 'relative', marginLeft: 'auto' }}>
                    <button onClick={e => { e.stopPropagation(); setMobileMenuId(mobileMenuId === c.id ? null : c.id); }}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MoreVertical size={14} color="var(--color-text-muted)" />
                    </button>
                    {mobileMenuId === c.id && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={e => { e.stopPropagation(); setMobileMenuId(null); }} />
                        <div style={{ position: 'absolute', right: 0, bottom: '100%', marginBottom: 4, zIndex: 999, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 140 }}>
                          {[
                            { label: 'Liquidar', color: '#10B981', onClick: () => navigate('/inmobiliaria/liquidaciones') },
                            { label: 'Problema', color: '#8B5CF6', onClick: () => navigate(`/inmobiliaria/ordenes?propiedad=${c.propiedad_id}`) },
                            { label: 'Ver detalles', color: 'var(--color-text-primary)', onClick: () => openEdit(c) },
                          ].map(a => (
                            <button key={a.label} onClick={e => { e.stopPropagation(); setMobileMenuId(null); a.onClick(); }}
                              style={{ display: 'block', width: '100%', padding: '8px 14px', fontSize: '0.75rem', fontWeight: 600, color: a.color, background: 'none', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin contratos</div>}
        </div>
      )}
      </>)}

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = editing
          ? [{ label: 'Tipo' }, { label: 'Partes' }, { label: 'Condiciones' }, { label: 'Adicional' }, { label: 'Docs' }]
          : [{ label: 'Tipo' }, { label: 'Partes' }, { label: 'Condiciones' }, { label: 'Adicional' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!form.propiedad_id
          : wizardStep === 2 ? !!form.fecha_inicio
          : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={() => closeWizard()}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="wizard-header">
              <h3>{editing ? 'Editar contrato' : 'Nuevo contrato'}</h3>
              <button className="wizard-close" onClick={() => closeWizard()}><X size={18} /></button>
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
              {/* ── STEP 0: Tipo y Propiedad ── */}
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Tipo de contrato</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {TIPOS.map(t => (
                      <button key={t} className={`wizard-pill${form.tipo === t ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, tipo: t }))}>{t}</button>
                    ))}
                  </div>
                </div>
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
                  <div className="wizard-section-title">Estado</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {ESTADOS.map(e => (
                      <button key={e} className={`wizard-pill${form.estado === e ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, estado: e }))}>{e}</button>
                    ))}
                  </div>
                </div>
              </>)}

              {/* ── STEP 1: Partes ── */}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label">Inquilino</label>
                    <button type="button" onClick={() => { setShowNewCliente('inquilino'); setNewClienteNombre(''); setNewClienteCuit(''); }}
                      style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Crear nuevo</button>
                  </div>
                  <CustomSelect
                    value={form.inquilino_id}
                    onChange={v => setForm(f => ({ ...f, inquilino_id: v }))}
                    placeholder="Buscar inquilino..."
                    options={clientes.map(c => ({ value: c.id, label: c.razon_social }))}
                  />
                </div>
                <div className="wizard-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label">Propietario</label>
                    <button type="button" onClick={() => { setShowNewCliente('propietario'); setNewClienteNombre(''); setNewClienteCuit(''); }}
                      style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Crear nuevo</button>
                  </div>
                  <CustomSelect
                    value={form.propietario_id}
                    onChange={v => setForm(f => ({ ...f, propietario_id: v }))}
                    placeholder="Buscar propietario..."
                    options={clientes.map(c => ({ value: c.id, label: c.razon_social }))}
                  />
                </div>
                {/* Inline crear cliente */}
                {showNewCliente && (
                  <div style={{ padding: 14, borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Nuevo {showNewCliente}</div>
                    <div className="wizard-row">
                      <div className="wizard-field">
                        <label className="form-label">Nombre / Razón Social *</label>
                        <input className="form-input" value={newClienteNombre} onChange={e => setNewClienteNombre(e.target.value)} placeholder={showNewCliente === 'inquilino' ? 'Ej: Juan Pérez' : 'Ej: María López'} />
                      </div>
                      <div className="wizard-field">
                        <label className="form-label">CUIT (opcional)</label>
                        <input className="form-input" value={newClienteCuit} onChange={e => setNewClienteCuit(e.target.value)} placeholder="20-12345678-9" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowNewCliente(null)} className="wizard-btn-back" style={{ padding: '6px 14px', fontSize: '0.8125rem' }}>Cancelar</button>
                      <button onClick={crearCliente} className="wizard-btn-next" style={{ padding: '6px 14px', fontSize: '0.8125rem' }} disabled={!newClienteNombre.trim()}>Crear</button>
                    </div>
                  </div>
                )}
              </>)}

              {/* ── STEP 2: Condiciones ── */}
              {wizardStep === 2 && (<>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Fecha inicio *</label>
                    <input type="date" className="form-input" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Fecha fin</label>
                    <input type="date" className="form-input" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} />
                  </div>
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Moneda</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {MONEDAS.map(m => (
                      <button key={m} className={`wizard-pill${form.moneda === m ? ' selected' : ''}`}
                        onClick={() => setForm(f => ({ ...f, moneda: m }))}>{m === 'ARS' ? '$ Pesos' : 'US$ Dólares'}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Monto mensual</label>
                  <input type="number" className="form-input" value={form.monto_mensual || ''} onChange={e => setForm(f => ({ ...f, monto_mensual: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Índice de ajuste</label>
                    <div className="wizard-pills">
                      {INDICES.map(i => (
                        <button key={i} className={`wizard-pill${form.indice_ajuste === i ? ' selected' : ''}`}
                          onClick={() => setForm(f => ({ ...f, indice_ajuste: i }))}>{i}</button>
                      ))}
                    </div>
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Período ajuste (meses)</label>
                    <input type="number" className="form-input" value={form.periodo_ajuste_meses || ''} onChange={e => setForm(f => ({ ...f, periodo_ajuste_meses: e.target.value ? Number(e.target.value) : null }))} placeholder="12" />
                  </div>
                </div>
              </>)}

              {/* ── STEP 3: Adicional ── */}
              {wizardStep === 3 && (<>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Depósito</label>
                    <input type="number" className="form-input" value={form.deposito || ''} onChange={e => setForm(f => ({ ...f, deposito: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Comisión %</label>
                    <input type="number" className="form-input" value={form.comision_porcentaje || ''} onChange={e => setForm(f => ({ ...f, comision_porcentaje: e.target.value ? Number(e.target.value) : null }))} placeholder="0" />
                  </div>
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Fecha de firma</label>
                    <input type="date" className="form-input" value={form.fecha_firma || ''} onChange={e => setForm(f => ({ ...f, fecha_firma: e.target.value || null }))} />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Escribanía</label>
                    <input type="text" className="form-input" value={form.escribania || ''} onChange={e => setForm(f => ({ ...f, escribania: e.target.value || null }))} placeholder="Nombre de la escribanía" />
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Notas</label>
                  <textarea className="form-input" rows={3} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value || null }))} placeholder="Observaciones adicionales..." />
                </div>
              </>)}

              {/* ── STEP 4: Documentos & Ajustes (solo en edición) ── */}
              {wizardStep === 4 && editing && (<>
                {/* Documentos */}
                <div className="wizard-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="wizard-section-title" style={{ border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={14} /> Documentos</div>
                    <label style={{ padding: '6px 14px', borderRadius: 10, border: '1.5px solid var(--color-cta, #2563EB)', color: 'var(--color-cta, #2563EB)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Upload size={13} /> Subir
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !editing) return;
                        const path = `contratos/${editing.id}/${Date.now()}_${file.name}`;
                        const { error } = await supabase.storage.from('documentos').upload(path, file);
                        if (error) { alert('Error al subir: ' + error.message); return; }
                        const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path);
                        const newDoc: Documento = { nombre: file.name, url: urlData.publicUrl, tipo: file.type.includes('pdf') ? 'PDF' : 'Imagen', fecha: new Date().toISOString().slice(0, 10) };
                        const docs = [...(editing.documentos || []), newDoc];
                        await supabase.from('inmobiliaria_contratos').update({ documentos: docs }).eq('id', editing.id);
                        setItems(prev => prev.map(c => c.id === editing.id ? { ...c, documentos: docs } : c));
                        setEditing({ ...editing, documentos: docs });
                      }} />
                    </label>
                  </div>
                  {(editing.documentos || []).length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Sin documentos adjuntos. Subí contrato firmado, garantía, DNI, etc.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(editing.documentos || []).map((doc, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                          <FileText size={16} style={{ color: doc.tipo === 'PDF' ? '#EF4444' : '#3B82F6', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-cta, #2563EB)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{doc.nombre}</a>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{doc.tipo} · {doc.fecha}</div>
                          </div>
                          <button onClick={async () => {
                            const docs = (editing.documentos || []).filter((_, idx) => idx !== i);
                            await supabase.from('inmobiliaria_contratos').update({ documentos: docs }).eq('id', editing.id);
                            setItems(prev => prev.map(c => c.id === editing.id ? { ...c, documentos: docs } : c));
                            setEditing({ ...editing, documentos: docs });
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ajustes de Alquiler */}
                {editing.tipo === 'alquiler' && (
                  <div className="wizard-field" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="wizard-section-title" style={{ border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={14} /> Ajustes de Alquiler</div>
                      <button onClick={async () => {
                        if (!editing) return;
                        const porcentaje = prompt('Porcentaje de ajuste (ej: 25.5):');
                        if (!porcentaje || isNaN(Number(porcentaje))) return;
                        const pct = Number(porcentaje);
                        const montoAnterior = editing.monto_mensual;
                        const montoNuevo = Math.round(montoAnterior * (1 + pct / 100));
                        const nuevoAjuste: Ajuste = { fecha: new Date().toISOString().slice(0, 10), monto_anterior: montoAnterior, monto_nuevo: montoNuevo, indice: editing.indice_ajuste, porcentaje: pct };
                        const historial = [...(editing.historial_ajustes || []), nuevoAjuste];
                        await supabase.from('inmobiliaria_contratos').update({ monto_mensual: montoNuevo, ultimo_ajuste: nuevoAjuste.fecha, historial_ajustes: historial }).eq('id', editing.id);
                        setItems(prev => prev.map(c => c.id === editing.id ? { ...c, monto_mensual: montoNuevo, ultimo_ajuste: nuevoAjuste.fecha, historial_ajustes: historial } : c));
                        setEditing({ ...editing, monto_mensual: montoNuevo, ultimo_ajuste: nuevoAjuste.fecha, historial_ajustes: historial });
                      }} style={{ padding: '6px 14px', borderRadius: 10, border: '1.5px solid var(--color-cta, #2563EB)', color: 'var(--color-cta, #2563EB)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                        <TrendingUp size={13} /> Aplicar ajuste
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 16, padding: '8px 0', fontSize: '0.8125rem' }}>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Original:</span> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(editing.monto_original || editing.monto_mensual).toLocaleString('es-AR')}</span></div>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Actual:</span> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10B981' }}>${editing.monto_mensual.toLocaleString('es-AR')}</span></div>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Índice:</span> <span style={{ fontWeight: 600 }}>{editing.indice_ajuste}</span></div>
                    </div>
                    {(editing.historial_ajustes || []).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(editing.historial_ajustes || []).slice().reverse().map((aj, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--color-bg-surface-2)', fontSize: '0.8125rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', width: 76, flexShrink: 0 }}>{aj.fecha}</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>${aj.monto_anterior.toLocaleString('es-AR')}</span>
                            <span style={{ color: '#10B981' }}>→</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${aj.monto_nuevo.toLocaleString('es-AR')}</span>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#10B98115', color: '#10B981', marginLeft: 'auto' }}>+{aj.porcentaje}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin ajustes aplicados. El próximo ajuste es cada {editing.periodo_ajuste_meses || 12} meses por {editing.indice_ajuste}.</div>
                    )}
                  </div>
                )}
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
      {ConfirmModal}
    </div>
  );
}
