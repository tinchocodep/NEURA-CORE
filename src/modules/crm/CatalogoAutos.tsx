import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Car, Plus, Search, X, Edit2, Trash2, Gauge, Fuel, Settings2, LayoutGrid, List, ChevronDown, User, TrendingUp } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';

interface Cliente { id: string; razon_social: string; }
interface Contacto { id: string; nombre: string; apellido: string | null; }
interface Prospecto { id: string; nombre: string; etapa: string; contacto_id: string | null; monto_estimado: number | null; }

interface Auto {
  id: string;
  marca: string;
  modelo: string;
  anio: number;
  version: string | null;
  tipo: 'nuevo' | 'usado';
  precio: number | null;
  moneda: string;
  kilometraje: number;
  color: string | null;
  patente: string | null;
  combustible: string | null;
  transmision: string | null;
  estado: 'disponible' | 'reservado' | 'vendido';
  imagen_url: string | null;
  descripcion: string | null;
  contacto_vendedor_id: string | null;
  cliente_comprador_id: string | null;
  prospecto_id: string | null;
  created_at: string;
}

const ESTADOS: { id: string; label: string; color: string; bg: string }[] = [
  { id: 'disponible', label: 'Disponible', color: 'var(--color-success)', bg: 'var(--color-success-dim, rgba(22,163,74,0.1))' },
  { id: 'reservado', label: 'Reservado', color: 'var(--color-warning)', bg: 'var(--color-warning-dim, rgba(217,119,6,0.1))' },
  { id: 'vendido', label: 'Vendido', color: 'var(--color-accent)', bg: 'var(--color-accent-dim, rgba(2,132,199,0.1))' },
];

const ETAPA_COLORS: Record<string, { color: string; bg: string }> = {
  'Nuevo': { color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  'Contactado': { color: '#0284c7', bg: 'rgba(2,132,199,0.12)' },
  'Propuesta': { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  'Negociación': { color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  'Ganado': { color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  'Perdido': { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};

const COMBUSTIBLES = ['Nafta', 'Diesel', 'GNC', 'Híbrido', 'Eléctrico'];
const TRANSMISIONES = ['Manual', 'Automática'];

const EMPTY_AUTO: Partial<Auto> = {
  marca: '', modelo: '', anio: new Date().getFullYear(), version: '', tipo: 'usado',
  precio: undefined, moneda: 'ARS', kilometraje: 0, color: '', patente: '',
  combustible: 'Nafta', transmision: 'Manual', estado: 'disponible', descripcion: '',
  contacto_vendedor_id: null, cliente_comprador_id: null, prospecto_id: null,
};

const PICS = [
  "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1503376760367-113aa05e83ec?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1611016186353-9af58c69a533?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1619682817481-e994891cd1f5?auto=format&fit=crop&q=80&w=400"
];

function getFallbackImage(id: string) {
  const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PICS[sum % PICS.length];
}

function fmtPrice(n: number | null, moneda: string) {
  if (!n) return '—';
  return (moneda === 'USD' ? 'USD ' : '$ ') + n.toLocaleString('es-AR');
}

function fmtKm(n: number) {
  return n === 0 ? '0 km' : n.toLocaleString('es-AR') + ' km';
}

export default function CatalogoAutos() {
  const { tenant } = useTenant();
  const [autos, setAutos] = useState<Auto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Auto>>(EMPTY_AUTO);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => { if (tenant) loadAll(); }, [tenant]);

  async function loadAll() {
    setLoading(true);
    const [a, cl, co, pr] = await Promise.all([
      supabase.from('crm_catalogo_autos').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
      supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id).eq('activo', true),
      supabase.from('crm_contactos').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('activo', true),
      supabase.from('crm_prospectos').select('id, nombre, etapa, contacto_id, monto_estimado').eq('tenant_id', tenant!.id),
    ]);
    setAutos(a.data || []);
    setClientes(cl.data || []);
    setContactos(co.data || []);
    setProspectos(pr.data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.marca || !form.modelo) return;
    const payload = {
      tenant_id: tenant!.id, marca: form.marca, modelo: form.modelo, anio: form.anio,
      version: form.version || null, tipo: form.tipo, precio: form.precio || null,
      moneda: form.moneda || 'ARS', kilometraje: form.kilometraje || 0,
      color: form.color || null, patente: form.patente || null,
      combustible: form.combustible || null, transmision: form.transmision || null,
      estado: form.estado, descripcion: form.descripcion || null,
      contacto_vendedor_id: form.contacto_vendedor_id || null,
      cliente_comprador_id: form.cliente_comprador_id || null,
      prospecto_id: form.prospecto_id || null, imagen_url: form.imagen_url || null, updated_at: new Date().toISOString(),
    };
    if (editingId) await supabase.from('crm_catalogo_autos').update(payload).eq('id', editingId);
    else await supabase.from('crm_catalogo_autos').insert(payload);
    closeForm();
    loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este vehículo del catálogo?')) return;
    await supabase.from('crm_catalogo_autos').delete().eq('id', id);
    loadAll();
  }

  function openEdit(auto: Auto) { setForm(auto); setEditingId(auto.id); setShowForm(true); }
  function openNew() { setForm(EMPTY_AUTO); setEditingId(null); setShowForm(true); }
  function closeForm() { setShowForm(false); setForm(EMPTY_AUTO); setEditingId(null); }

  const filtered = autos.filter(a => {
    const q = search.toLowerCase();
    const ms = !q || `${a.marca} ${a.modelo} ${a.version || ''} ${a.patente || ''} ${a.color || ''}`.toLowerCase().includes(q);
    return ms && (filterEstado === 'todos' || a.estado === filterEstado) && (filterTipo === 'todos' || a.tipo === filterTipo);
  });

  const stats = {
    total: autos.length,
    disponibles: autos.filter(a => a.estado === 'disponible').length,
    reservados: autos.filter(a => a.estado === 'reservado').length,
    vendidos: autos.filter(a => a.estado === 'vendido').length,
  };

  const getClienteName = (id: string | null) => clientes.find(c => c.id === id)?.razon_social || '';
  const getProspecto = (id: string | null) => prospectos.find(p => p.id === id) || null;
  const getContactoName = (id: string | null) => { const c = contactos.find(c => c.id === id); return c ? `${c.nombre} ${c.apellido || ''}`.trim() : ''; };
  const getEtapaStyle = (etapa: string) => ETAPA_COLORS[etapa] || { color: 'var(--color-text-muted)', bg: 'var(--color-bg-surface-2)' };
  const getEstado = (id: string) => ESTADOS.find(e => e.id === id) || ESTADOS[0];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <Car size={22} style={{ color: 'var(--color-accent)' }} />
            Catálogo de Vehículos
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {stats.total} vehículos en inventario
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Nuevo Vehículo
        </button>
      </div>

      {/* ─── KPI Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {([
          { label: 'Total', value: stats.total, color: 'var(--color-accent)' },
          { label: 'Disponibles', value: stats.disponibles, color: 'var(--color-success)' },
          { label: 'Reservados', value: stats.reservados, color: 'var(--color-warning)' },
          { label: 'Vendidos', value: stats.vendidos, color: 'var(--color-accent)' },
        ]).map(kpi => (
          <div key={kpi.label} className="card" style={{ padding: '16px 20px', borderTop: `3px solid ${kpi.color}` }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 2, fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Filters ─── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar marca, modelo, patente..."
            style={{ paddingLeft: 34, width: '100%' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <StyledSelect className="form-input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            style={{ paddingRight: 28, appearance: 'none', minWidth: 140 }}>
            <option value="todos">Todos los estados</option>
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </StyledSelect>
          <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <StyledSelect className="form-input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            style={{ paddingRight: 28, appearance: 'none', minWidth: 120 }}>
            <option value="todos">Todos</option>
            <option value="nuevo">0km</option>
            <option value="usado">Usado</option>
          </StyledSelect>
          <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <button onClick={() => setView('grid')} title="Grilla"
            style={{ padding: '6px 10px', background: view === 'grid' ? 'var(--color-accent)' : 'var(--color-bg-surface)', color: view === 'grid' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={15} />
          </button>
          <button onClick={() => setView('list')} title="Lista"
            style={{ padding: '6px 10px', background: view === 'list' ? 'var(--color-accent)' : 'var(--color-bg-surface)', color: view === 'list' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--color-border-subtle)' }}>
            <List size={15} />
          </button>
        </div>
      </div>

      {/* ─── Grid View ─── */}
      {view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(auto => {
            const est = getEstado(auto.estado);
            const displayImg = auto.imagen_url || getFallbackImage(auto.id);
            return (
              <div key={auto.id} className="card" style={{ overflow: 'hidden', transition: 'box-shadow 0.2s', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                {/* Image area */}
                <div style={{ height: 160, background: 'var(--color-bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderBottom: '1px solid var(--color-border-subtle)', backgroundImage: `url(${displayImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  {/* Badges */}
                  <span style={{ position: 'absolute', top: 10, left: 10, padding: '2px 8px', borderRadius: 20, fontSize: '0.6875rem', fontWeight: 700, background: est.bg, color: est.color, backdropFilter: 'blur(4px)' }}>
                    {est.label}
                  </span>
                  <span style={{ position: 'absolute', top: 10, right: 10, padding: '2px 8px', borderRadius: 20, fontSize: '0.6875rem', fontWeight: 600, background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)', backdropFilter: 'blur(4px)' }}>
                    {auto.tipo === 'nuevo' ? '0km' : 'Usado'}
                  </span>
                  {/* Action buttons */}
                  <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon" onClick={() => openEdit(auto)} style={{ background: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)', backdropFilter: 'blur(4px)' }}>
                      <Edit2 size={14} />
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(auto.id)} style={{ background: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)', color: 'var(--color-danger)', backdropFilter: 'blur(4px)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {/* Info */}
                <div style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                    {auto.marca} {auto.modelo}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {auto.version || ''} {auto.version ? '·' : ''} {auto.anio}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-accent)', marginTop: 10 }}>
                    {fmtPrice(auto.precio, auto.moneda)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {auto.kilometraje > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Gauge size={12} /> {fmtKm(auto.kilometraje)}</span>
                    )}
                    {auto.combustible && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Fuel size={12} /> {auto.combustible}</span>
                    )}
                    {auto.transmision && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Settings2 size={12} /> {auto.transmision}</span>
                    )}
                  </div>
                  {auto.patente && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-surface-2)', color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}>
                        {auto.patente}
                      </span>
                    </div>
                  )}
                  {auto.color && (
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Color: {auto.color}
                    </div>
                  )}
                  {/* Prospecto strip */}
                  {auto.prospecto_id && (() => {
                    const p = getProspecto(auto.prospecto_id);
                    if (!p) return null;
                    const es = getEtapaStyle(p.etapa);
                    const contacto = p.contacto_id ? getContactoName(p.contacto_id) : '';
                    return (
                      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <TrendingUp size={12} style={{ color: es.color }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.nombre}
                          </span>
                          <span style={{ padding: '1px 6px', borderRadius: 12, fontSize: '0.625rem', fontWeight: 700, background: es.bg, color: es.color, whiteSpace: 'nowrap' }}>
                            {p.etapa}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                          {contacto && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <User size={10} /> {contacto}
                            </span>
                          )}
                          {p.monto_estimado && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: es.color }}>
                              {fmtPrice(p.monto_estimado, 'ARS')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {auto.cliente_comprador_id && (
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <User size={12} /> Comprador: {getClienteName(auto.cliente_comprador_id)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── List View ─── */}
      {view === 'list' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-container">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Vehículo', 'Tipo', 'Precio', 'Km', 'Estado', 'Prospecto', ''].map(h => (
                    <th key={h} style={{ textAlign: h === '' ? 'right' : 'left', padding: '10px 16px', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(auto => {
                  const est = getEstado(auto.estado);
                  return (
                    <tr key={auto.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{auto.marca} {auto.modelo} {auto.anio}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{auto.version}{auto.color ? ` · ${auto.color}` : ''}{auto.patente ? ` · ${auto.patente}` : ''}</div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                        {auto.tipo === 'nuevo' ? '0km' : 'Usado'}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                        {fmtPrice(auto.precio, auto.moneda)}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                        {fmtKm(auto.kilometraje)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.6875rem', fontWeight: 700, background: est.bg, color: est.color }}>
                          {est.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', maxWidth: 220 }}>
                        {(() => {
                          const p = getProspecto(auto.prospecto_id);
                          if (!p) return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>—</span>;
                          const es = getEtapaStyle(p.etapa);
                          const contacto = p.contacto_id ? getContactoName(p.contacto_id) : '';
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {p.nombre}
                                </span>
                                <span style={{ padding: '0px 5px', borderRadius: 10, fontSize: '0.5625rem', fontWeight: 700, background: es.bg, color: es.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {p.etapa}
                                </span>
                              </div>
                              {contacto && (
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                                  <User size={10} /> {contacto}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => openEdit(auto)}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(auto.id)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No se encontraron vehículos
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && view === 'grid' && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          No se encontraron vehículos con los filtros seleccionados
        </div>
      )}

      {/* ─── Modal Form ─── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={closeForm}>
          <div className="card" style={{ width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-xl)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                {editingId ? 'Editar Vehículo' : 'Nuevo Vehículo'}
              </h2>
              <button className="btn btn-ghost btn-icon" onClick={closeForm}><X size={18} /></button>
            </div>
            {/* Body */}
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Marca / Modelo / Año */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
                <FormField label="Marca *" value={form.marca || ''} onChange={v => setForm({ ...form, marca: v })} placeholder="Toyota" />
                <FormField label="Modelo *" value={form.modelo || ''} onChange={v => setForm({ ...form, modelo: v })} placeholder="Hilux" />
                <FormField label="Año" value={String(form.anio || '')} onChange={v => setForm({ ...form, anio: Number(v) })} type="number" />
              </div>
              {/* Versión / Tipo / Color */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 12 }}>
                <FormField label="Versión" value={form.version || ''} onChange={v => setForm({ ...form, version: v })} placeholder="SRX 4x4" />
                <FormSelect label="Tipo" value={form.tipo || 'usado'} onChange={v => setForm({ ...form, tipo: v as any })} options={[{ value: 'nuevo', label: '0km' }, { value: 'usado', label: 'Usado' }]} />
                <FormField label="Color" value={form.color || ''} onChange={v => setForm({ ...form, color: v })} placeholder="Negro" />
              </div>
              {/* Precio / Moneda / Km */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: 12 }}>
                <FormField label="Precio" value={form.precio ? String(form.precio) : ''} onChange={v => setForm({ ...form, precio: Number(v) || undefined })} type="number" />
                <FormSelect label="Moneda" value={form.moneda || 'ARS'} onChange={v => setForm({ ...form, moneda: v })} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
                <FormField label="Kilometraje" value={String(form.kilometraje || 0)} onChange={v => setForm({ ...form, kilometraje: Number(v) })} type="number" />
              </div>
              {/* Patente / Combustible / Transmisión */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <FormField label="Patente" value={form.patente || ''} onChange={v => setForm({ ...form, patente: v.toUpperCase() })} placeholder="AB 123 CD" mono />
                <FormSelect label="Combustible" value={form.combustible || 'Nafta'} onChange={v => setForm({ ...form, combustible: v })} options={COMBUSTIBLES.map(c => ({ value: c, label: c }))} />
                <FormSelect label="Transmisión" value={form.transmision || 'Manual'} onChange={v => setForm({ ...form, transmision: v })} options={TRANSMISIONES.map(t => ({ value: t, label: t }))} />
              </div>
              {/* Estado */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Estado</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ESTADOS.map(e => (
                    <button key={e.id} onClick={() => setForm({ ...form, estado: e.id as any })}
                      style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', border: form.estado === e.id ? 'none' : '1px solid var(--color-border-subtle)', background: form.estado === e.id ? e.color : 'var(--color-bg-surface)', color: form.estado === e.id ? '#fff' : 'var(--color-text-secondary)' }}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Vínculos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <FormSelect label="Prospecto vinculado" value={form.prospecto_id || ''} onChange={v => setForm({ ...form, prospecto_id: v || null })}
                  options={[{ value: '', label: 'Sin vincular' }, ...prospectos.map(p => ({ value: p.id, label: `${p.nombre} (${p.etapa})` }))]} />
                <FormSelect label="Cliente comprador" value={form.cliente_comprador_id || ''} onChange={v => setForm({ ...form, cliente_comprador_id: v || null })}
                  options={[{ value: '', label: 'Sin comprador' }, ...clientes.map(c => ({ value: c.id, label: c.razon_social }))]} />
                <FormSelect label="Contacto vendedor" value={form.contacto_vendedor_id || ''} onChange={v => setForm({ ...form, contacto_vendedor_id: v || null })}
                  options={[{ value: '', label: 'Sin contacto' }, ...contactos.map(c => ({ value: c.id, label: `${c.nombre} ${c.apellido || ''}` }))]} />
              </div>
              {/* Descripción */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Descripción</label>
                <textarea className="form-input" rows={3} value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />
              </div>
              {/* Imagen */}
              <div>
                <FormField label="URL de Imagen" value={form.imagen_url || ''} onChange={v => setForm({ ...form, imagen_url: v })} placeholder="https://ejemplo.com/auto.jpg" type="url" />
                {form.imagen_url && (
                  <div style={{ marginTop: 10, width: '100%', height: 160, borderRadius: 'var(--radius-md)', background: `url(${form.imagen_url}) center/cover no-repeat`, border: '1px solid var(--color-border-subtle)' }} />
                )}
              </div>
            </div>
            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)' }}>
              <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.marca || !form.modelo}
                style={{ opacity: (!form.marca || !form.modelo) ? 0.5 : 1 }}>
                {editingId ? 'Guardar Cambios' : 'Crear Vehículo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tiny form helpers ─── */
function FormField({ label, value, onChange, placeholder, type, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</label>
      <input className="form-input" type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', ...(mono ? { fontFamily: 'var(--font-mono)' } : {}) }} />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <StyledSelect className="form-input" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', appearance: 'none', paddingRight: 28 }}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </StyledSelect>
        <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
      </div>
    </div>
  );
}
