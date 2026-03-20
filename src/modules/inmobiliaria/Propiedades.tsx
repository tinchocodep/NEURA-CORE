import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, X, Grid3X3, List, MapPin, FileSignature } from 'lucide-react';
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
  const [items, setItems] = useState<Propiedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Propiedad | null>(null);
  const [form, setForm] = useState(emptyProp);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_propiedades').select('*').eq('tenant_id', tenant!.id).order('direccion');
    if (data) setItems(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyProp); setShowModal(true); };
  const openEdit = (p: Propiedad) => { setEditing(p); setForm(p); setShowModal(true); };

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
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
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
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${TIPO_COLOR[p.tipo] || '#6B7280'}20`, color: TIPO_COLOR[p.tipo] || '#6B7280', textTransform: 'capitalize' }}>{p.tipo}</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado] || '#6B7280'}20`, color: ESTADO_COLOR[p.estado] || '#6B7280', textTransform: 'capitalize' }}>{p.estado.replace(/_/g, ' ')}</span>
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
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                {['Direccion', 'Tipo', 'Estado', 'Superficie', 'Amb.', 'Alquiler', 'Venta'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => openEdit(p)} style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{p.direccion}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize' }}>{p.tipo}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado]}20`, color: ESTADO_COLOR[p.estado], textTransform: 'capitalize' }}>{p.estado.replace(/_/g, ' ')}</span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{p.superficie_m2 ? `${p.superficie_m2} m2` : '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{p.ambientes || '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)' }}>{fmtPrice(p.precio_alquiler, p.moneda)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)' }}>{fmtPrice(p.precio_venta, p.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', borderRadius: 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editing ? 'Editar propiedad' : 'Nueva propiedad'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label className="form-label">Direccion *</label>
              <input className="form-input" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Tipo</label><select className="form-input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ flex: 1 }}><label className="form-label">Estado</label><select className="form-input" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>{ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}</select></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Superficie m2</label><input type="number" className="form-input" value={form.superficie_m2 || ''} onChange={e => setForm(f => ({ ...f, superficie_m2: e.target.value ? Number(e.target.value) : null }))} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Ambientes</label><input type="number" className="form-input" value={form.ambientes || ''} onChange={e => setForm(f => ({ ...f, ambientes: e.target.value ? Number(e.target.value) : null }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Piso</label><input className="form-input" value={form.piso || ''} onChange={e => setForm(f => ({ ...f, piso: e.target.value || null }))} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Unidad</label><input className="form-input" value={form.unidad || ''} onChange={e => setForm(f => ({ ...f, unidad: e.target.value || null }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Localidad</label><input className="form-input" value={form.localidad || ''} onChange={e => setForm(f => ({ ...f, localidad: e.target.value || null }))} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Provincia</label><input className="form-input" value={form.provincia || ''} onChange={e => setForm(f => ({ ...f, provincia: e.target.value || null }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}><label className="form-label">Moneda</label><select className="form-input" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>{MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div style={{ flex: 1 }}><label className="form-label">Precio alquiler</label><input type="number" className="form-input" value={form.precio_alquiler || ''} onChange={e => setForm(f => ({ ...f, precio_alquiler: e.target.value ? Number(e.target.value) : null }))} /></div>
                <div style={{ flex: 1 }}><label className="form-label">Precio venta</label><input type="number" className="form-input" value={form.precio_venta || ''} onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value ? Number(e.target.value) : null }))} /></div>
              </div>
              <label className="form-label">Descripcion</label>
              <textarea className="form-input" rows={3} value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value || null }))} />
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
