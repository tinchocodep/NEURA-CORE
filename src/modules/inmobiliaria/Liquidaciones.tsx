import { useEffect, useState } from 'react';
import { Plus, X, Check, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Liquidacion {
  id: string; contrato_id: string; propietario_id: string; periodo: string;
  ingreso_alquiler: number; deducciones_json: Deduccion[]; neto_propietario: number;
  estado: string; fecha_pago: string | null;
}
interface Deduccion { concepto: string; monto: number; }
interface Contrato {
  id: string; monto_mensual: number; moneda: string; comision_porcentaje: number | null;
  propietario_id: string;
  propiedad: { direccion: string } | null;
  propietario: { razon_social: string } | null;
}

const ESTADO_COLOR: Record<string, string> = { borrador: '#F59E0B', aprobada: '#3B82F6', pagada: '#10B981' };

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

  // Form state
  const [selContrato, setSelContrato] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [ingreso, setIngreso] = useState(0);
  const [deducciones, setDeducciones] = useState<Deduccion[]>([]);
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
    return `${(c.propiedad as any)?.direccion || '—'} — ${(c.propietario as any)?.razon_social || '—'}`;
  };

  const openNew = () => {
    setEditing(null);
    setSelContrato('');
    setPeriodo(new Date().toISOString().slice(0, 7));
    setIngreso(0);
    setDeducciones([]);
    setShowModal(true);
  };

  const openEdit = (l: Liquidacion) => {
    setEditing(l);
    setSelContrato(l.contrato_id);
    setPeriodo(l.periodo);
    setIngreso(l.ingreso_alquiler);
    setDeducciones(l.deducciones_json || []);
    setShowModal(true);
  };

  const onSelectContrato = (id: string) => {
    setSelContrato(id);
    const c = contratos.find(ct => ct.id === id);
    if (c) {
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
      contrato_id: selContrato,
      propietario_id: c?.propietario_id || '',
      periodo,
      ingreso_alquiler: ingreso,
      deducciones_json: deducciones,
      neto_propietario: neto,
      estado: 'borrador',
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

  const filtered = items.filter(l => !filterEstado || l.estado === filterEstado);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando liquidaciones...</div>;

  return (
    <div style={{ padding: isMobile ? '0.75rem' : '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Liquidaciones</h1>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos</option>
          <option value="borrador">Borrador</option>
          <option value="aprobada">Aprobada</option>
          <option value="pagada">Pagada</option>
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {isMobile ? (
        /* ── MOBILE: Cards ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(l => {
            const totalDed = (l.deducciones_json || []).reduce((s: number, d: Deduccion) => s + d.monto, 0);
            return (
              <div key={l.id} onClick={() => openEdit(l)} style={{
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)', padding: '0.75rem', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{l.periodo}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[l.estado]}20`, color: ESTADO_COLOR[l.estado], textTransform: 'capitalize' }}>{l.estado}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contratoLabel(l.contrato_id)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>${l.ingreso_alquiler.toLocaleString('es-AR')}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#EF4444' }}>-${totalDed.toLocaleString('es-AR')}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: '#10B981' }}>${l.neto_propietario.toLocaleString('es-AR')}</span>
                </div>
                {(l.estado === 'borrador' || l.estado === 'aprobada') && (
                  <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem' }}>
                    {l.estado === 'borrador' && (
                      <button onClick={e => { e.stopPropagation(); updateEstado(l.id, 'aprobada'); }} style={{ padding: '0.25rem 0.6rem', borderRadius: 6, border: '1px solid #3B82F6', background: 'transparent', color: '#3B82F6', cursor: 'pointer', fontSize: '0.7rem' }}>Aprobar</button>
                    )}
                    {l.estado === 'aprobada' && (
                      <button onClick={e => { e.stopPropagation(); updateEstado(l.id, 'pagada'); }} style={{ padding: '0.25rem 0.6rem', borderRadius: 6, border: '1px solid #10B981', background: 'transparent', color: '#10B981', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Check size={12} /> Pagada
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin liquidaciones</div>
          )}
        </div>
      ) : (
        /* ── DESKTOP: Table ── */
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                {['Periodo', 'Propiedad / Propietario', 'Ingreso', 'Deducciones', 'Neto', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const totalDed = (l.deducciones_json || []).reduce((s: number, d: Deduccion) => s + d.monto, 0);
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{l.periodo}</td>
                    <td style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }} onClick={() => openEdit(l)}>{contratoLabel(l.contrato_id)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)' }}>${l.ingreso_alquiler.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#EF4444' }}>-${totalDed.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${l.neto_propietario.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[l.estado]}20`, color: ESTADO_COLOR[l.estado], textTransform: 'capitalize' }}>{l.estado}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {l.estado === 'borrador' && (
                          <button onClick={() => updateEstado(l.id, 'aprobada')} title="Aprobar" style={{ padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid #3B82F6', background: 'transparent', color: '#3B82F6', cursor: 'pointer', fontSize: '0.7rem' }}>Aprobar</button>
                        )}
                        {l.estado === 'aprobada' && (
                          <button onClick={() => updateEstado(l.id, 'pagada')} title="Marcar pagada" style={{ padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px solid #10B981', background: 'transparent', color: '#10B981', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Check size={12} /> Pagada
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin liquidaciones</td></tr>
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
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editing ? 'Editar liquidacion' : 'Nueva liquidacion'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label className="form-label">Contrato *</label>
              <select className="form-input" value={selContrato} onChange={e => onSelectContrato(e.target.value)}>
                <option value="">Seleccionar contrato...</option>
                {contratos.map(c => <option key={c.id} value={c.id}>{(c.propiedad as any)?.direccion} — {(c.propietario as any)?.razon_social}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Periodo (YYYY-MM)</label><input type="month" className="form-input" value={periodo} onChange={e => setPeriodo(e.target.value)} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Ingreso alquiler</label><input type="number" className="form-input" value={ingreso || ''} onChange={e => setIngreso(Number(e.target.value))} /></div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Deducciones</label>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                  <span>Ingreso</span><span style={{ fontFamily: 'var(--font-mono)' }}>${ingreso.toLocaleString('es-AR')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#EF4444', marginBottom: '0.3rem' }}>
                  <span>Deducciones</span><span style={{ fontFamily: 'var(--font-mono)' }}>-${totalDeducciones.toLocaleString('es-AR')}</span>
                </div>
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '0.3rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700 }}>
                  <span>Neto propietario</span><span style={{ fontFamily: 'var(--font-mono)', color: '#10B981' }}>${neto.toLocaleString('es-AR')}</span>
                </div>
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
