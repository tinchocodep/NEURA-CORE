import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, X, Search, HardHat, Trash2 } from 'lucide-react';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import type { Obra } from './types';
import { ESTADO_OBRA_COLOR } from './types';

const EMPTY: Partial<Obra> = { nombre: '', direccion: '', estado: 'activa', notas: '' };

export default function LiqObras() {
  const { tenant } = useTenant();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Obra>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('liq_obras').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: false });
    setObras(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.nombre?.trim()) return;
    setSaving(true);
    const payload = { nombre: editing.nombre!.trim(), direccion: editing.direccion || null, estado: editing.estado || 'activa', notas: editing.notas || null };
    if (editing.id) {
      await supabase.from('liq_obras').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
    } else {
      await supabase.from('liq_obras').insert({ ...payload, tenant_id: tenant!.id });
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const handleDelete = (obra: Obra) => {
    requestDelete(`¿Eliminar la obra "${obra.nombre}"?`, async () => {
      await supabase.from('liq_obras').delete().eq('id', obra.id);
      setObras(prev => prev.filter(o => o.id !== obra.id));
    });
  };

  const filtered = obras.filter(o => {
    if (filtroEstado && o.estado !== filtroEstado) return false;
    if (search && !o.nombre.toLowerCase().includes(search.toLowerCase()) && !(o.direccion || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Obras</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>{obras.length} obras registradas</p>
          </div>
          <button onClick={() => { setEditing({ ...EMPTY }); setShowModal(true); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
            <Plus size={15} /> Nueva Obra
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar obra..." style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
          </div>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
            <option value="">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="pausada">Pausada</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </div>

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Obra', 'Dirección', 'Estado', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin obras</td></tr>
              ) : filtered.map(obra => {
                const color = ESTADO_OBRA_COLOR[obra.estado] || '#6b7280';
                return (
                  <tr key={obra.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }} onClick={() => { setEditing({ ...obra }); setShowModal(true); }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <HardHat size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{obra.nombre}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{obra.direccion || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>{obra.estado}</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); handleDelete(obra); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ width: 480, maxHeight: '80vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>{editing.id ? 'Editar Obra' : 'Nueva Obra'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Nombre *</label>
                <input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Dirección</label>
                <input value={editing.direccion || ''} onChange={e => setEditing({ ...editing, direccion: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Estado</label>
                <select value={editing.estado || 'activa'} onChange={e => setEditing({ ...editing, estado: e.target.value as any })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  <option value="activa">Activa</option>
                  <option value="pausada">Pausada</option>
                  <option value="finalizada">Finalizada</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Notas</label>
                <textarea value={editing.notas || ''} onChange={e => setEditing({ ...editing, notas: e.target.value })} rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !editing.nombre?.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ConfirmModal}
    </>
  );
}
