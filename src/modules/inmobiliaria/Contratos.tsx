import { useEffect, useState } from 'react';
import { Search, Plus, X, FileText, Grid3X3, List, Upload, Paperclip, TrendingUp, Trash2, MoreVertical } from 'lucide-react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Documento { nombre: string; url: string; tipo: string; fecha: string; }
interface Ajuste { fecha: string; monto_anterior: number; monto_nuevo: number; indice: string; porcentaje: number; }
interface Contrato {
  id: string; propiedad_id: string; inquilino_id: string; propietario_id: string;
  tipo: string; fecha_inicio: string; fecha_fin: string; monto_mensual: number;
  moneda: string; indice_ajuste: string; periodo_ajuste_meses: number | null;
  deposito: number | null; comision_porcentaje: number | null; estado: string; notas: string | null;
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

const emptyContrato = {
  propiedad_id: '', inquilino_id: '', propietario_id: '', tipo: 'alquiler',
  fecha_inicio: '', fecha_fin: '', monto_mensual: 0, moneda: 'ARS',
  indice_ajuste: 'ICL', periodo_ajuste_meses: 12 as number | null, deposito: null as number | null,
  comision_porcentaje: null as number | null, estado: 'borrador', notas: null as string | null,
};

export default function Contratos() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loc = useLocation();
  const [items, setItems] = useState<Contrato[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Contrato | null>(null);
  const [form, setForm] = useState(emptyContrato);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [showNewCliente, setShowNewCliente] = useState<'inquilino' | 'propietario' | null>(null);
  const [newClienteNombre, setNewClienteNombre] = useState('');
  const [newClienteCuit, setNewClienteCuit] = useState('');

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

  const openNew = () => { setEditing(null); setForm(emptyContrato); setShowModal(true); };
  const openEdit = (c: Contrato) => { setEditing(c); setForm(c); setShowModal(true); };

  const save = async () => {
    if (!form.propiedad_id || !form.fecha_inicio) return;
    if (editing) {
      const { error } = await supabase.from('inmobiliaria_contratos').update(form).eq('id', editing.id);
      if (!error) setItems(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } as Contrato : c));
    } else {
      const { data, error } = await supabase.from('inmobiliaria_contratos').insert({ ...form, tenant_id: tenant!.id }).select().single();
      if (!error && data) setItems(prev => [data, ...prev]);
    }
    setShowModal(false);
  };

  const remove = async () => {
    if (!editing || !confirm('Eliminar este contrato?')) return;
    const { error } = await supabase.from('inmobiliaria_contratos').delete().eq('id', editing.id);
    if (!error) { setItems(prev => prev.filter(c => c.id !== editing.id)); setShowModal(false); }
  };

  const now = new Date();
  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  // KPI metrics
  const vigentes = items.filter(c => c.estado === 'vigente');
  const ingresoMensual = vigentes.reduce((sum, c) => sum + (c.moneda === 'ARS' ? c.monto_mensual : 0), 0);
  const porVencer30 = vigentes.filter(c => daysUntil(c.fecha_fin) <= 30 && daysUntil(c.fecha_fin) > 0).length;
  const vencidos = items.filter(c => c.estado === 'vencido' || (c.estado === 'vigente' && daysUntil(c.fecha_fin) <= 0)).length;

  const fmtMoney = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString('es-AR')}`;
  };

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

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando contratos...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Desktop header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Contratos</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar propiedad o inquilino..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button onClick={() => setViewMode('grid')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'grid' ? '#fff' : 'var(--color-text-muted)' }}><Grid3X3 size={14} /></button>
          <button onClick={() => setViewMode('list')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--color-text-muted)' }}><List size={14} /></button>
        </div>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {/* Mobile header */}
      <div className="module-header-mobile" style={{ gap: '0.375rem' }}>
        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, padding: '8px 6px', borderRadius: 8, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{fmtMoney(ingresoMensual)}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>Ingreso mensual</div>
          </div>
          <div style={{ flex: 1, padding: '8px 6px', borderRadius: 8, background: porVencer30 > 0 ? '#F59E0B08' : 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: porVencer30 > 0 ? '#F59E0B' : 'var(--color-text-primary)' }}>{porVencer30}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>Vencen 30d</div>
          </div>
          <div style={{ flex: 1, padding: '8px 6px', borderRadius: 8, background: vencidos > 0 ? '#EF444408' : 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: vencidos > 0 ? '#EF4444' : 'var(--color-text-primary)' }}>{vencidos}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>Vencidos</div>
          </div>
        </div>
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
          {filtered.length} contrato{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ─── LIST VIEW (mobile-optimized rows) ─── */}
      {viewMode === 'list' ? (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Column header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span style={{ flex: 1 }}>Propiedad</span>
            <span style={{ width: 80, textAlign: 'right' }}>Monto</span>
            <span style={{ width: 44 }}></span>
          </div>
          {filtered.map(c => {
            const dias = daysUntil(c.fecha_fin);
            const isUrgent = c.estado === 'vigente' && dias <= 30 && dias > 0;
            const isOverdue = c.estado === 'vigente' && dias <= 0;
            return (
              <div key={c.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)', background: isOverdue ? '#EF444406' : isUrgent ? '#F59E0B04' : 'transparent' }}>
                {/* Row 1: address + price */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>{propDir(c.propiedad_id)}</div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', fontWeight: 700 }}>
                      {c.moneda === 'USD' ? 'US$' : '$'}{c.monto_mensual.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{c.tipo}</div>
                  </div>
                </div>
                {/* Row 2: inquilino */}
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  {cliName(c.inquilino_id)}
                </div>
                {/* Row 3: status badge */}
                {isUrgent && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#F59E0B18', color: '#D97706' }}>
                      Vence en {dias}d
                    </span>
                  </div>
                )}
                {isOverdue && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#EF444418', color: '#DC2626' }}>
                      Moroso - {Math.abs(dias)} días
                    </span>
                  </div>
                )}
                {!isUrgent && !isOverdue && c.estado === 'vigente' && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#10B98118', color: '#16A34A' }}>
                      Activo
                    </span>
                  </div>
                )}
                {/* Row 4: Facturar + ⋮ menú */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                  <button onClick={() => {}} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Facturar</button>
                  {isOverdue && (
                    <button onClick={() => {}} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #DC2626', background: 'transparent', color: '#DC2626', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Reclamar</button>
                  )}
                  <button onClick={() => setActionMenuId(actionMenuId === c.id ? null : c.id)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                    <MoreVertical size={16} />
                  </button>
                  {actionMenuId === c.id && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setActionMenuId(null)} />
                      <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 4, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 170 }}>
                        <button onClick={() => { openEdit(c); setActionMenuId(null); }}
                          style={{ width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                          Ver detalle
                        </button>
                        <button onClick={() => { navigate('/inmobiliaria/liquidaciones'); setActionMenuId(null); }}
                          style={{ width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                          Liquidar
                        </button>
                        <button onClick={() => { navigate(`/inmobiliaria/ordenes?propiedad=${c.propiedad_id}`); setActionMenuId(null); }}
                          style={{ width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#8B5CF6', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                          Enviar proveedor
                        </button>
                        {isUrgent && (
                          <button onClick={() => { setActionMenuId(null); }}
                            style={{ width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                            Renovar contrato
                          </button>
                        )}
                        <button onClick={() => { setEditing(c); remove(); setActionMenuId(null); }}
                          style={{ width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#EF4444', fontFamily: 'var(--font-sans)' }}>
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
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
      )}

      {/* Modal */}
      {showModal && (
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', borderRadius: 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editing ? 'Editar contrato' : 'Nuevo contrato'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label className="form-label">Propiedad *</label>
              <select className="form-input" value={form.propiedad_id} onChange={e => setForm(f => ({ ...f, propiedad_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {propiedades.map(p => <option key={p.id} value={p.id}>{p.direccion}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label">Inquilino</label>
                    <button type="button" onClick={() => { setShowNewCliente('inquilino'); setNewClienteNombre(''); setNewClienteCuit(''); }}
                      style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Crear nuevo</button>
                  </div>
                  <select className="form-input" value={form.inquilino_id} onChange={e => setForm(f => ({ ...f, inquilino_id: e.target.value }))}><option value="">Seleccionar...</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label">Propietario</label>
                    <button type="button" onClick={() => { setShowNewCliente('propietario'); setNewClienteNombre(''); setNewClienteCuit(''); }}
                      style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Crear nuevo</button>
                  </div>
                  <select className="form-input" value={form.propietario_id} onChange={e => setForm(f => ({ ...f, propietario_id: e.target.value }))}><option value="">Seleccionar...</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select>
                </div>
              </div>
              {/* Inline crear cliente */}
              {showNewCliente && (
                <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}><label className="form-label">Nombre / Razón Social *</label><input className="form-input" value={newClienteNombre} onChange={e => setNewClienteNombre(e.target.value)} placeholder={showNewCliente === 'inquilino' ? 'Ej: Juan Pérez' : 'Ej: María López'} /></div>
                  <div style={{ flex: 1 }}><label className="form-label">CUIT (opcional)</label><input className="form-input" value={newClienteCuit} onChange={e => setNewClienteCuit(e.target.value)} placeholder="20-12345678-9" /></div>
                  <button onClick={crearCliente} className="btn btn-primary" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }} disabled={!newClienteNombre.trim()}>Crear {showNewCliente}</button>
                  <button onClick={() => setShowNewCliente(null)} className="btn btn-ghost btn-icon"><X size={14} /></button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Tipo</label><select className="form-input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ flex: 1 }}><label className="form-label">Estado</label><select className="form-input" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Fecha inicio *</label><input type="date" className="form-input" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Fecha fin</label><input type="date" className="form-input" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Moneda</label><select className="form-input" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>{MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div style={{ flex: 1 }}><label className="form-label">Monto mensual</label><input type="number" className="form-input" value={form.monto_mensual || ''} onChange={e => setForm(f => ({ ...f, monto_mensual: Number(e.target.value) }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Indice ajuste</label><select className="form-input" value={form.indice_ajuste} onChange={e => setForm(f => ({ ...f, indice_ajuste: e.target.value }))}>{INDICES.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                <div style={{ flex: 1 }}><label className="form-label">Periodo ajuste (meses)</label><input type="number" className="form-input" value={form.periodo_ajuste_meses || ''} onChange={e => setForm(f => ({ ...f, periodo_ajuste_meses: e.target.value ? Number(e.target.value) : null }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Deposito</label><input type="number" className="form-input" value={form.deposito || ''} onChange={e => setForm(f => ({ ...f, deposito: e.target.value ? Number(e.target.value) : null }))} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Comision %</label><input type="number" className="form-input" value={form.comision_porcentaje || ''} onChange={e => setForm(f => ({ ...f, comision_porcentaje: e.target.value ? Number(e.target.value) : null }))} /></div>
              </div>
              <label className="form-label">Notas</label>
              <textarea className="form-input" rows={2} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value || null }))} />

              {/* ── DOCUMENTOS (solo en edición) ── */}
              {editing && (
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 14, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><Paperclip size={14} /> Documentos</label>
                    <label style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-cta, #2563EB)', color: 'var(--color-cta, #2563EB)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Upload size={12} /> Subir
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>Sin documentos adjuntos. Subí contrato firmado, garantía, DNI, etc.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(editing.documentos || []).map((doc, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                          <FileText size={14} style={{ color: doc.tipo === 'PDF' ? '#EF4444' : '#3B82F6', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-cta, #2563EB)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{doc.nombre}</a>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{doc.tipo} · {doc.fecha}</div>
                          </div>
                          <button onClick={async () => {
                            const docs = (editing.documentos || []).filter((_, idx) => idx !== i);
                            await supabase.from('inmobiliaria_contratos').update({ documentos: docs }).eq('id', editing.id);
                            setItems(prev => prev.map(c => c.id === editing.id ? { ...c, documentos: docs } : c));
                            setEditing({ ...editing, documentos: docs });
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── AJUSTES DE ALQUILER (solo en edición, tipo alquiler) ── */}
              {editing && editing.tipo === 'alquiler' && (
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 14, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><TrendingUp size={14} /> Ajustes de Alquiler</label>
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
                    }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-cta, #2563EB)', color: 'var(--color-cta, #2563EB)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-sans)' }}>
                      <TrendingUp size={12} /> Aplicar ajuste
                    </button>
                  </div>
                  {/* Current info */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: '0.8125rem' }}>
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Original:</span> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(editing.monto_original || editing.monto_mensual).toLocaleString('es-AR')}</span></div>
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Actual:</span> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10B981' }}>${editing.monto_mensual.toLocaleString('es-AR')}</span></div>
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Índice:</span> <span style={{ fontWeight: 600 }}>{editing.indice_ajuste}</span></div>
                  </div>
                  {/* Historial */}
                  {(editing.historial_ajustes || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(editing.historial_ajustes || []).slice().reverse().map((aj, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--color-bg-surface-2)', fontSize: '0.75rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', width: 72, flexShrink: 0 }}>{aj.fecha}</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>${aj.monto_anterior.toLocaleString('es-AR')}</span>
                          <span style={{ color: '#10B981' }}>→</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${aj.monto_nuevo.toLocaleString('es-AR')}</span>
                          <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#10B98115', color: '#10B981', marginLeft: 'auto' }}>+{aj.porcentaje}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(editing.historial_ajustes || []).length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin ajustes aplicados. El próximo ajuste es cada {editing.periodo_ajuste_meses || 12} meses por {editing.indice_ajuste}.</div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {editing && <button onClick={remove} style={{ marginRight: 'auto', padding: '0.4rem 1rem', borderRadius: 6, border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: '0.85rem' }}>Eliminar</button>}
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancelar</button>
              <button onClick={save} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Guardar</button>
            </div>
          </div>
          </div>
      )}
    </div>
  );
}
