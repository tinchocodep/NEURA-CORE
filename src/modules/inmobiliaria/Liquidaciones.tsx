import { useEffect, useState } from 'react';
import { Plus, X, Check, Trash2, Search, SlidersHorizontal, MoreVertical } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

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
const CATEGORIAS = ['alquiler', 'mantenimiento', 'impuestos', 'servicios', 'consorcio'];
const CAT_LABEL: Record<string, string> = {
  alquiler: 'Alquiler', mantenimiento: 'Mantenimiento', impuestos: 'Impuestos',
  servicios: 'Servicios', consorcio: 'Consorcio',
};
const CAT_COLOR: Record<string, string> = {
  alquiler: '#3B82F6', mantenimiento: '#F97316', impuestos: '#8B5CF6',
  servicios: '#0D9488', consorcio: '#EC4899',
};

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

export default function Liquidaciones() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Liquidacion[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Form state
  const [selContrato, setSelContrato] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [ingreso, setIngreso] = useState(0);
  const [deducciones, setDeducciones] = useState<Deduccion[]>([]);
  const [formCategoria, setFormCategoria] = useState('alquiler');
  const [editing, setEditing] = useState<Liquidacion | null>(null);

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
    if (!c) return '—';
    return `${(c.propiedad as any)?.direccion || '—'}`;
  };
  const contratoPropietario = (id: string) => {
    const c = contratos.find(ct => ct.id === id);
    return (c?.propietario as any)?.razon_social || '—';
  };

  const openNew = () => {
    setEditing(null); setSelContrato(''); setPeriodo(new Date().toISOString().slice(0, 7));
    setIngreso(0); setDeducciones([]); setFormCategoria('alquiler'); setShowModal(true);
  };

  const openEdit = (l: Liquidacion) => {
    setEditing(l); setSelContrato(l.contrato_id); setPeriodo(l.periodo);
    setIngreso(l.ingreso_alquiler); setDeducciones(l.deducciones_json || []);
    setFormCategoria(l.categoria || 'alquiler'); setShowModal(true);
  };

  const onSelectContrato = (id: string) => {
    setSelContrato(id);
    const c = contratos.find(ct => ct.id === id);
    if (c && formCategoria === 'alquiler') {
      setIngreso(c.monto_mensual);
      const comision = c.comision_porcentaje ? c.monto_mensual * c.comision_porcentaje / 100 : 0;
      setDeducciones(comision > 0 ? [{ concepto: 'Comision administracion', monto: Math.round(comision) }] : []);
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
    setShowModal(false);
  };

  const updateEstado = async (id: string, estado: string) => {
    const updates: Record<string, unknown> = { estado };
    if (estado === 'pagada') updates.fecha_pago = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('inmobiliaria_liquidaciones').update(updates).eq('id', id);
    if (!error) setItems(prev => prev.map(l => l.id === id ? { ...l, ...updates } as Liquidacion : l));
  };

  // KPIs
  const pendientes = items.filter(l => l.estado === 'borrador').length;
  const porPagar = items.filter(l => l.estado === 'aprobada').reduce((s, l) => s + Math.abs(l.neto_propietario), 0);
  const pagadoMes = items.filter(l => l.estado === 'pagada' && l.periodo === new Date().toISOString().slice(0, 7))
    .reduce((s, l) => s + Math.abs(l.neto_propietario), 0);

  const fmtMoney = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString('es-AR')}`;
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
      const label = contratoLabel(l.contrato_id).toLowerCase();
      const concepto = getConcepto(l).toLowerCase();
      if (!label.includes(searchText.toLowerCase()) && !concepto.includes(searchText.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando liquidaciones...</div>;

  return (
    <div style={{ padding: isMobile ? '0.75rem' : '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Desktop header */}
      <div className="module-header-desktop" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Liquidaciones</h1>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos</option>
          <option value="borrador">Borrador</option>
          <option value="aprobada">Aprobada</option>
          <option value="pagada">Pagada</option>
        </select>
        <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {/* Mobile header */}
      <div className="module-header-mobile">
        {/* KPIs */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setFilterEstado('borrador'); setShowFilters(true); }}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: pendientes > 0 ? '#F59E0B10' : 'var(--color-bg-card)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: pendientes > 0 ? '#F59E0B' : 'var(--color-text-primary)' }}>{pendientes}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginTop: 2 }}>Pendientes</div>
          </button>
          <button onClick={() => { setFilterEstado('aprobada'); setShowFilters(true); }}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: porPagar > 0 ? '#3B82F610' : 'var(--color-bg-card)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: porPagar > 0 ? '#3B82F6' : 'var(--color-text-primary)' }}>{fmtMoney(porPagar)}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginTop: 2 }}>Por pagar</div>
          </button>
          <button onClick={() => { setFilterEstado('pagada'); setShowFilters(true); }}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-card)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#10B981' }}>{fmtMoney(pagadoMes)}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginTop: 2 }}>Pagado mes</div>
          </button>
        </div>
        {/* New button */}
        <button onClick={openNew} className="btn btn-primary" style={{ width: '100%', height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.9375rem', fontWeight: 600, borderRadius: 10 }}>
          <Plus size={18} /> Nueva Liquidación
        </button>
        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar..." value={searchText} onChange={e => setSearchText(e.target.value)}
              className="form-input" style={{ paddingLeft: 34, height: 42, fontSize: '0.9rem', borderRadius: 10 }} />
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: showFilters ? 'var(--color-accent)' : 'var(--color-bg-card)', color: showFilters ? '#fff' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <SlidersHorizontal size={18} />
          </button>
        </div>
        {showFilters && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', animation: 'fadeIn 0.15s ease' }}>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 36, fontSize: '0.8rem', width: 'auto', borderRadius: 8 }}>
              <option value="">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="aprobada">Aprobada</option>
              <option value="pagada">Pagada</option>
            </select>
            <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} className="form-input" style={{ height: 36, fontSize: '0.8rem', width: 'auto', borderRadius: 8 }}>
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select>
            {(filterEstado || filterCategoria) && (
              <button onClick={() => { setFilterEstado(''); setFilterCategoria(''); }} style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
                Limpiar
              </button>
            )}
          </div>
        )}
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '2px 0' }}>
          {filtered.length} liquidaci{filtered.length !== 1 ? 'ones' : 'ón'}
        </div>
      </div>

      {isMobile ? (
        /* ── MOBILE: List rows ── */
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span style={{ flex: 1 }}>Concepto</span>
            <span style={{ width: 80, textAlign: 'right' }}>Monto</span>
            <span style={{ width: 36 }}></span>
          </div>
          {filtered.map(l => {
            const monto = getMonto(l);
            const concepto = getConcepto(l);
            const cat = l.categoria || 'alquiler';
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', position: 'relative' }}
                onClick={() => openEdit(l)}>
                {/* Estado dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLOR[l.estado] || '#6B7280', flexShrink: 0, marginRight: 10 }} />
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {concepto}
                    </span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${CAT_COLOR[cat] || '#6B7280'}15`, color: CAT_COLOR[cat] || '#6B7280', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {CAT_LABEL[cat] || cat}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {contratoLabel(l.contrato_id)} · {l.periodo}
                  </div>
                </div>
                {/* Monto */}
                <div style={{ width: 80, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0, color: cat === 'alquiler' ? '#10B981' : 'var(--color-text-primary)' }}>
                  {cat === 'alquiler' ? '' : '-'}${Math.abs(monto).toLocaleString('es-AR')}
                </div>
                {/* Actions */}
                <button onClick={e => { e.stopPropagation(); setActionMenuId(actionMenuId === l.id ? null : l.id); }}
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0, borderRadius: 6 }}>
                  <MoreVertical size={16} />
                </button>
                {actionMenuId === l.id && (
                  <div style={{ position: 'absolute', right: 12, top: '100%', zIndex: 50, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 150 }}>
                    <button onClick={e => { e.stopPropagation(); openEdit(l); setActionMenuId(null); }}
                      style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                      Editar
                    </button>
                    {l.estado === 'borrador' && (
                      <button onClick={e => { e.stopPropagation(); updateEstado(l.id, 'aprobada'); setActionMenuId(null); }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#3B82F6', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border-subtle)' }}>
                        Aprobar
                      </button>
                    )}
                    {l.estado === 'aprobada' && (
                      <button onClick={e => { e.stopPropagation(); updateEstado(l.id, 'pagada'); setActionMenuId(null); }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#10B981', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border-subtle)' }}>
                        Marcar pagada
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin liquidaciones</div>
          )}
        </div>
      ) : (
        /* ── DESKTOP: Table ── */
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                {['Periodo', 'Categoría', 'Propiedad / Propietario', 'Concepto', 'Monto', 'Neto', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const monto = getMonto(l);
                const concepto = getConcepto(l);
                const cat = l.categoria || 'alquiler';
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{l.periodo}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${CAT_COLOR[cat]}15`, color: CAT_COLOR[cat], textTransform: 'capitalize' }}>{CAT_LABEL[cat]}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }} onClick={() => openEdit(l)}>{contratoLabel(l.contrato_id)} — {contratoPropietario(l.contrato_id)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{concepto}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)' }}>${Math.abs(monto).toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: l.neto_propietario >= 0 ? '#10B981' : 'var(--color-text-primary)' }}>${l.neto_propietario.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[l.estado]}20`, color: ESTADO_COLOR[l.estado], textTransform: 'capitalize' }}>{l.estado}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {l.estado === 'borrador' && (
                          <button onClick={() => updateEstado(l.id, 'aprobada')} style={{ padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid #3B82F6', background: 'transparent', color: '#3B82F6', cursor: 'pointer', fontSize: '0.7rem' }}>Aprobar</button>
                        )}
                        {l.estado === 'aprobada' && (
                          <button onClick={() => updateEstado(l.id, 'pagada')} style={{ padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid #10B981', background: 'transparent', color: '#10B981', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Check size={12} /> Pagada
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin liquidaciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', borderRadius: 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editing ? 'Editar liquidación' : 'Nueva liquidación'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Categoría</label>
                  <select className="form-input" value={formCategoria} onChange={e => setFormCategoria(e.target.value)}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Periodo (YYYY-MM)</label>
                  <input type="month" className="form-input" value={periodo} onChange={e => setPeriodo(e.target.value)} />
                </div>
              </div>
              <label className="form-label">Propiedad *</label>
              <select className="form-input" value={selContrato} onChange={e => onSelectContrato(e.target.value)}>
                <option value="">Seleccionar propiedad...</option>
                {contratos.map(c => <option key={c.id} value={c.id}>{(c.propiedad as any)?.direccion} — {(c.propietario as any)?.razon_social}</option>)}
              </select>
              {formCategoria === 'alquiler' && (
                <div style={{ flex: 1 }}>
                  <label className="form-label">Ingreso alquiler</label>
                  <input type="number" className="form-input" value={ingreso || ''} onChange={e => setIngreso(Number(e.target.value))} />
                </div>
              )}

              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>{formCategoria === 'alquiler' ? 'Deducciones' : 'Detalle de gastos'}</label>
                  <button onClick={addDeduccion} style={{ padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                {deducciones.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                    <input className="form-input" placeholder="Concepto" value={d.concepto} onChange={e => updateDeduccion(i, 'concepto', e.target.value)} style={{ flex: 2 }} />
                    <input type="number" className="form-input" placeholder="Monto" value={d.monto || ''} onChange={e => updateDeduccion(i, 'monto', Number(e.target.value))} style={{ flex: 1 }} />
                    <button onClick={() => removeDeduccion(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--color-bg-subtle, rgba(255,255,255,0.02))', borderRadius: 'var(--radius-sm)', padding: '0.75rem', marginTop: '0.5rem' }}>
                {formCategoria === 'alquiler' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                    <span>Ingreso</span><span style={{ fontFamily: 'var(--font-mono)' }}>${ingreso.toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: formCategoria === 'alquiler' ? '#EF4444' : 'var(--color-text-primary)', marginBottom: '0.3rem' }}>
                  <span>{formCategoria === 'alquiler' ? 'Deducciones' : 'Total gasto'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formCategoria === 'alquiler' ? '-' : ''}${totalDeducciones.toLocaleString('es-AR')}</span>
                </div>
                {formCategoria === 'alquiler' && (
                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '0.3rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700 }}>
                    <span>Neto propietario</span><span style={{ fontFamily: 'var(--font-mono)', color: '#10B981' }}>${neto.toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancelar</button>
              <button onClick={save} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Guardar</button>
            </div>
          </div>
          </div>
      )}
    </div>
  );
}
