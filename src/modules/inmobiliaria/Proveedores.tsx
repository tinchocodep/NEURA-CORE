import { useEffect, useState } from 'react';
import { Search, Plus, X, Phone, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Proveedor {
  id: string; nombre: string; rubro: string; contacto_nombre: string | null;
  telefono: string | null; email: string | null; cuit: string | null;
  direccion: string | null; notas: string | null; activo: boolean;
}

const RUBROS = ['plomeria', 'electricidad', 'gas', 'pintura', 'limpieza', 'cerrajeria', 'fumigacion', 'albañileria', 'mudanza', 'general'];
const RUBRO_LABEL: Record<string, string> = {
  plomeria: 'Plomería', electricidad: 'Electricidad', gas: 'Gas', pintura: 'Pintura',
  limpieza: 'Limpieza', cerrajeria: 'Cerrajería', fumigacion: 'Fumigación',
  'albañileria': 'Albañilería', mudanza: 'Mudanza', general: 'General',
};
const RUBRO_COLOR: Record<string, string> = {
  plomeria: '#3B82F6', electricidad: '#F59E0B', gas: '#EF4444', pintura: '#8B5CF6',
  limpieza: '#10B981', cerrajeria: '#6B7280', fumigacion: '#0D9488',
  'albañileria': '#F97316', mudanza: '#EC4899', general: '#6366F1',
};

const emptyProv = { nombre: '', rubro: 'general', contacto_nombre: '', telefono: '', email: '', cuit: '', direccion: '', notas: '', activo: true };

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

export default function ProveedoresInmob() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRubro, setFilterRubro] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form, setForm] = useState(emptyProv);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_proveedores').select('*').eq('tenant_id', tenant!.id).order('nombre');
    if (data) setItems(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyProv); setShowModal(true); };
  const openEdit = (p: Proveedor) => { setEditing(p); setForm(p as any); setShowModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return;
    const payload = { ...form, tenant_id: tenant!.id };
    if (editing) {
      await supabase.from('inmobiliaria_proveedores').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('inmobiliaria_proveedores').insert(payload);
    }
    setShowModal(false);
    loadData();
  };

  const filtered = items.filter(p => {
    if (filterRubro && p.rubro !== filterRubro) return false;
    if (search && !p.nombre.toLowerCase().includes(search.toLowerCase()) && !(p.contacto_nombre || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando proveedores...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
        </div>
        <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={18} />
        </button>
      </div>

      {/* Rubro filter chips */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
        <button onClick={() => setFilterRubro('')} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: !filterRubro ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: !filterRubro ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>Todos ({items.length})</button>
        {RUBROS.filter(r => items.some(p => p.rubro === r)).map(r => (
          <button key={r} onClick={() => setFilterRubro(filterRubro === r ? '' : r)}
            style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${filterRubro === r ? (RUBRO_COLOR[r] || '#6B7280') : 'var(--color-border-subtle)'}`, background: filterRubro === r ? `${RUBRO_COLOR[r]}15` : 'var(--color-bg-surface)', color: filterRubro === r ? RUBRO_COLOR[r] : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {RUBRO_LABEL[r] || r}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(p => {
          const color = RUBRO_COLOR[p.rubro] || '#6B7280';
          return (
            <div key={p.id} onClick={() => openEdit(p)} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{p.nombre}</div>
                  {p.contacto_nombre && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{p.contacto_nombre}</div>}
                </div>
                <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${color}15`, color, textTransform: 'capitalize', flexShrink: 0 }}>
                  {RUBRO_LABEL[p.rubro] || p.rubro}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                {p.telefono && (
                  <a href={`tel:${p.telefono}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-cta, #2563EB)', textDecoration: 'none' }}>
                    <Phone size={12} /> {p.telefono}
                  </a>
                )}
                {p.email && (
                  <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                    <Mail size={12} /> {p.email}
                  </a>
                )}
              </div>
              {p.notas && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4, fontStyle: 'italic' }}>{p.notas}</div>}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin proveedores</div>}
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', borderRadius: isMobile ? '20px 20px 0 0' : 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }}>
            {isMobile && <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 12px' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">Nombre / Empresa *</label><input className="form-input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Rubro</label><select className="form-input" value={form.rubro} onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))}>{RUBROS.map(r => <option key={r} value={r}>{RUBRO_LABEL[r] || r}</option>)}</select></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Contacto</label><input className="form-input" value={form.contacto_nombre || ''} onChange={e => setForm(f => ({ ...f, contacto_nombre: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Teléfono</label><input className="form-input" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Email</label><input className="form-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">CUIT</label><input className="form-input" value={form.cuit || ''} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Notas</label><textarea className="form-input" rows={2} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={save} className="btn btn-primary" disabled={!form.nombre.trim()}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
