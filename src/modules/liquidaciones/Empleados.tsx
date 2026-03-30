import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, X, Search, Trash2, Shield } from 'lucide-react';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import type { Empleado, Categoria } from './types';

const EMPTY: Partial<Empleado> = { nombre: '', apellido: '', dni: '', cuil: '', categoria_id: null, es_revestimiento: false, revestimiento_porcentaje: 20, estado: 'activo', notas: '' };

export default function LiqEmpleados() {
  const { tenant } = useTenant();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Empleado>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [empRes, catRes] = await Promise.all([
      supabase.from('liq_empleados').select('*, categoria:liq_categorias(id, nombre)').eq('tenant_id', tenant!.id).order('apellido'),
      supabase.from('liq_categorias').select('*').eq('tenant_id', tenant!.id).order('orden'),
    ]);
    setEmpleados(empRes.data || []);
    setCategorias(catRes.data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.nombre?.trim() || !editing.apellido?.trim()) return;
    setSaving(true);
    const payload = {
      nombre: editing.nombre!.trim(),
      apellido: editing.apellido!.trim(),
      dni: editing.dni || null,
      cuil: editing.cuil || null,
      categoria_id: editing.categoria_id || null,
      es_revestimiento: editing.es_revestimiento || false,
      revestimiento_porcentaje: editing.es_revestimiento ? (editing.revestimiento_porcentaje || 20) : 20,
      fecha_ingreso: editing.fecha_ingreso || null,
      estado: editing.estado || 'activo',
      notas: editing.notas || null,
    };
    if (editing.id) {
      await supabase.from('liq_empleados').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
    } else {
      await supabase.from('liq_empleados').insert({ ...payload, tenant_id: tenant!.id });
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const handleDelete = (emp: Empleado) => {
    requestDelete(`¿Eliminar a ${emp.apellido}, ${emp.nombre}?`, async () => {
      await supabase.from('liq_empleados').delete().eq('id', emp.id);
      setEmpleados(prev => prev.filter(e => e.id !== emp.id));
    });
  };

  const filtered = empleados.filter(e => {
    if (filtroEstado && e.estado !== filtroEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.nombre.toLowerCase().includes(q) && !e.apellido.toLowerCase().includes(q) && !(e.dni || '').includes(q)) return false;
    }
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
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Empleados</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>{empleados.filter(e => e.estado === 'activo').length} activos · {empleados.length} total</p>
          </div>
          <button onClick={() => { setEditing({ ...EMPTY }); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
            <Plus size={15} /> Nuevo Empleado
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
          </div>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
            <option value="">Todos</option>
          </select>
        </div>

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Empleado', 'DNI', 'Categoría', 'Rev.', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin empleados</td></tr>
              ) : filtered.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }} onClick={() => { setEditing({ ...emp, categoria_id: emp.categoria_id || null }); setShowModal(true); }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {emp.nombre[0]}{emp.apellido[0]}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{emp.apellido}, {emp.nombre}</span>
                        {emp.estado === 'inactivo' && <span style={{ marginLeft: 6, fontSize: '0.5625rem', fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#ef444418', color: '#ef4444' }}>INACTIVO</span>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{emp.dni || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{(emp.categoria as any)?.nombre || '—'}</span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {emp.es_revestimiento && (
                      <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: '#8b5cf618', color: '#8b5cf6' }}>
                        REV +{emp.revestimiento_porcentaje}%
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button onClick={e => { e.stopPropagation(); handleDelete(emp); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ width: 520, maxHeight: '85vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>{editing.id ? 'Editar Empleado' : 'Nuevo Empleado'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Nombre *</label>
                  <input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Apellido *</label>
                  <input value={editing.apellido || ''} onChange={e => setEditing({ ...editing, apellido: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>DNI</label>
                  <input value={editing.dni || ''} onChange={e => setEditing({ ...editing, dni: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>CUIL</label>
                  <input value={editing.cuil || ''} onChange={e => setEditing({ ...editing, cuil: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Categoría</label>
                  <select value={editing.categoria_id || ''} onChange={e => setEditing({ ...editing, categoria_id: e.target.value || null })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                    <option value="">Sin categoría</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Fecha Ingreso</label>
                  <input type="date" value={editing.fecha_ingreso || ''} onChange={e => setEditing({ ...editing, fecha_ingreso: e.target.value || null })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
              </div>

              {/* Revestimiento */}
              <div className="card" style={{ padding: 14, background: 'var(--color-bg-surface-2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.es_revestimiento || false} onChange={e => setEditing({ ...editing, es_revestimiento: e.target.checked })} />
                  <Shield size={14} style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Empleado de Revestimiento</span>
                </label>
                {editing.es_revestimiento && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Porcentaje extra (%)</label>
                    <input type="number" value={editing.revestimiento_porcentaje || 20} onChange={e => setEditing({ ...editing, revestimiento_porcentaje: parseFloat(e.target.value) || 20 })} min={0} max={100} step={1} style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Estado</label>
                <select value={editing.estado || 'activo'} onChange={e => setEditing({ ...editing, estado: e.target.value as any })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Notas</label>
                <textarea value={editing.notas || ''} onChange={e => setEditing({ ...editing, notas: e.target.value })} rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !editing.nombre?.trim() || !editing.apellido?.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
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
