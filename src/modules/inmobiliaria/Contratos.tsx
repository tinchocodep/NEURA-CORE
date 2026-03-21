import { useEffect, useState } from 'react';
import { Search, Plus, X, FileText } from 'lucide-react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Contrato {
  id: string; propiedad_id: string; inquilino_id: string; propietario_id: string;
  tipo: string; fecha_inicio: string; fecha_fin: string; monto_mensual: number;
  moneda: string; indice_ajuste: string; periodo_ajuste_meses: number | null;
  deposito: number | null; comision_porcentaje: number | null; estado: string; notas: string | null;
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

  const filtered = items.filter(c => {
    if (filterEstado && c.estado !== filterEstado) return false;
    if (search) {
      const dir = propDir(c.propiedad_id).toLowerCase();
      const inq = cliName(c.inquilino_id).toLowerCase();
      if (!dir.includes(search.toLowerCase()) && !inq.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando contratos...</div>;

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
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
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              {['Propiedad', 'Inquilino', 'Propietario', 'Tipo', 'Monto', 'Inicio', 'Fin', 'Dias', 'Estado'].map(h => (
                <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const dias = daysUntil(c.fecha_fin);
              return (
                <tr key={c.id} onClick={() => openEdit(c)} style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <FileText size={13} color="var(--color-text-muted)" />
                      {propDir(c.propiedad_id)}
                    </div>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{cliName(c.inquilino_id)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)' }}>{cliName(c.propietario_id)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize' }}>{c.tipo}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {c.moneda === 'USD' ? 'US$' : '$'}{c.monto_mensual.toLocaleString('es-AR')}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>{new Date(c.fecha_fin).toLocaleDateString('es-AR')}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: c.estado === 'vigente' && dias <= 30 ? '#EF4444' : 'var(--color-text-muted)' }}>
                    {c.estado === 'vigente' ? (dias > 0 ? `${dias}d` : 'Vencido') : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[c.estado]}20`, color: ESTADO_COLOR[c.estado], textTransform: 'capitalize' }}>{c.estado}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin contratos</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
