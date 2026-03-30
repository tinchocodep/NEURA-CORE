import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, X, Trash2, TrendingUp } from 'lucide-react';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import type { Categoria, ValorHora } from './types';

export default function LiqCategorias() {
  const { tenant } = useTenant();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [valores, setValores] = useState<ValorHora[]>([]);
  const [loading, setLoading] = useState(true);

  // Cat form
  const [showCatModal, setShowCatModal] = useState(false);
  const [catNombre, setCatNombre] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catOrden, setCatOrden] = useState(0);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Valor form
  const [showValorModal, setShowValorModal] = useState(false);
  const [valorCatId, setValorCatId] = useState('');
  const [valorHora, setValorHora] = useState('');
  const [valorDesde, setValorDesde] = useState('');
  const [valorPct, setValorPct] = useState('');

  // Aumento masivo
  const [showAumentoModal, setShowAumentoModal] = useState(false);
  const [aumentoPct, setAumentoPct] = useState('');
  const [aumentoDesde, setAumentoDesde] = useState('');

  const [saving, setSaving] = useState(false);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [catRes, valRes] = await Promise.all([
      supabase.from('liq_categorias').select('*').eq('tenant_id', tenant!.id).order('orden'),
      supabase.from('liq_valores_hora').select('*, categoria:liq_categorias(id, nombre)').eq('tenant_id', tenant!.id).order('vigencia_desde', { ascending: false }),
    ]);
    setCategorias(catRes.data || []);
    setValores(valRes.data || []);
    setLoading(false);
  };

  // --- Categorías ---
  const openNewCat = () => { setEditingCatId(null); setCatNombre(''); setCatDesc(''); setCatOrden(categorias.length); setShowCatModal(true); };
  const openEditCat = (c: Categoria) => { setEditingCatId(c.id); setCatNombre(c.nombre); setCatDesc(c.descripcion || ''); setCatOrden(c.orden); setShowCatModal(true); };

  const handleSaveCat = async () => {
    if (!catNombre.trim()) return;
    setSaving(true);
    const payload = { nombre: catNombre.trim(), descripcion: catDesc || null, orden: catOrden };
    if (editingCatId) {
      await supabase.from('liq_categorias').update(payload).eq('id', editingCatId);
    } else {
      await supabase.from('liq_categorias').insert({ ...payload, tenant_id: tenant!.id });
    }
    setSaving(false);
    setShowCatModal(false);
    loadData();
  };

  const handleDeleteCat = (c: Categoria) => {
    requestDelete(`¿Eliminar categoría "${c.nombre}"?`, async () => {
      await supabase.from('liq_categorias').delete().eq('id', c.id);
      loadData();
    });
  };

  // --- Valores hora ---
  const openNewValor = (catId?: string) => {
    setValorCatId(catId || categorias[0]?.id || '');
    setValorHora('');
    setValorDesde('');
    setValorPct('');
    setShowValorModal(true);
  };

  const handleSaveValor = async () => {
    if (!valorCatId || !valorHora || !valorDesde) return;
    setSaving(true);
    await supabase.from('liq_valores_hora').insert({
      tenant_id: tenant!.id,
      categoria_id: valorCatId,
      valor_hora: parseFloat(valorHora),
      vigencia_desde: valorDesde,
      porcentaje_aumento: valorPct ? parseFloat(valorPct) : null,
    });
    setSaving(false);
    setShowValorModal(false);
    loadData();
  };

  // --- Aumento masivo ---
  const handleAumentoMasivo = async () => {
    if (!aumentoPct || !aumentoDesde) return;
    setSaving(true);
    const pct = parseFloat(aumentoPct);
    // Get latest valor for each categoria
    const latestByCategoria: Record<string, ValorHora> = {};
    valores.forEach(v => {
      if (!latestByCategoria[v.categoria_id] || v.vigencia_desde > latestByCategoria[v.categoria_id].vigencia_desde) {
        latestByCategoria[v.categoria_id] = v;
      }
    });
    const inserts = Object.values(latestByCategoria).map(v => ({
      tenant_id: tenant!.id,
      categoria_id: v.categoria_id,
      valor_hora: Math.round(v.valor_hora * (1 + pct / 100) * 100) / 100,
      vigencia_desde: aumentoDesde,
      porcentaje_aumento: pct,
    }));
    if (inserts.length > 0) {
      await supabase.from('liq_valores_hora').insert(inserts);
    }
    setSaving(false);
    setShowAumentoModal(false);
    loadData();
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Categorías y Valores Hora</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>Gestión de categorías de empleados y valores por hora</p>
        </div>

        {/* Categorías */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Categorías</span>
            <button onClick={openNewCat} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
              <Plus size={14} /> Nueva
            </button>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', 'Categoría', 'Descripción', 'Valor Actual', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categorias.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin categorías</td></tr>
                ) : categorias.map(c => {
                  const latestVal = valores.find(v => v.categoria_id === c.id);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }} onClick={() => openEditCat(c)}>
                      <td style={{ padding: '10px 16px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{c.orden}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{c.nombre}</td>
                      <td style={{ padding: '10px 16px', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{c.descripcion || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        {latestVal ? (
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-accent)' }}>
                            $ {latestVal.valor_hora.toLocaleString('es-AR')}
                            <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginLeft: 4 }}>/h</span>
                          </span>
                        ) : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Sin valor</span>}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <button onClick={e => { e.stopPropagation(); handleDeleteCat(c); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
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

        {/* Valores hora */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Historial de Valores Hora</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setAumentoPct(''); setAumentoDesde(''); setShowAumentoModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.75rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                <TrendingUp size={14} /> Aumento Masivo
              </button>
              <button onClick={() => openNewValor()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                <Plus size={14} /> Nuevo Valor
              </button>
            </div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Categoría', 'Valor/Hora', 'Vigencia Desde', 'Aumento'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valores.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin valores cargados</td></tr>
                ) : valores.slice(0, 30).map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{(v.categoria as any)?.nombre || '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-accent)' }}>
                      $ {v.valor_hora.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{v.vigencia_desde}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {v.porcentaje_aumento != null ? (
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: '#10b98118', color: '#10b981' }}>
                          +{v.porcentaje_aumento}%
                        </span>
                      ) : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Categoría */}
      {showCatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCatModal(false)}>
          <div className="card" style={{ width: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>{editingCatId ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
              <button onClick={() => setShowCatModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Nombre *</label>
                <input value={catNombre} onChange={e => setCatNombre(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Descripción</label>
                <input value={catDesc} onChange={e => setCatDesc(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Orden</label>
                <input type="number" value={catOrden} onChange={e => setCatOrden(parseInt(e.target.value) || 0)} style={{ width: 80, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowCatModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveCat} disabled={saving || !catNombre.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Valor Hora */}
      {showValorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowValorModal(false)}>
          <div className="card" style={{ width: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Nuevo Valor Hora</h2>
              <button onClick={() => setShowValorModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Categoría *</label>
                <select value={valorCatId} onChange={e => setValorCatId(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  <option value="">Seleccionar...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Valor por Hora ($) *</label>
                <input type="number" value={valorHora} onChange={e => setValorHora(e.target.value)} step="0.01" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Vigencia Desde *</label>
                <input type="date" value={valorDesde} onChange={e => setValorDesde(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>% Aumento (opcional)</label>
                <input type="number" value={valorPct} onChange={e => setValorPct(e.target.value)} step="0.1" placeholder="ej: 15" style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowValorModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveValor} disabled={saving || !valorCatId || !valorHora || !valorDesde} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aumento Masivo */}
      {showAumentoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAumentoModal(false)}>
          <div className="card" style={{ width: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Aumento Masivo</h2>
              <button onClick={() => setShowAumentoModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Aplica un aumento porcentual a todas las categorías, creando nuevos valores hora con la vigencia indicada.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Porcentaje de Aumento (%) *</label>
                <input type="number" value={aumentoPct} onChange={e => setAumentoPct(e.target.value)} step="0.1" placeholder="ej: 12.5" style={{ width: 140, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Vigencia Desde *</label>
                <input type="date" value={aumentoDesde} onChange={e => setAumentoDesde(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAumentoModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleAumentoMasivo} disabled={saving || !aumentoPct || !aumentoDesde} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Aplicando...' : 'Aplicar Aumento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ConfirmModal}
    </>
  );
}
