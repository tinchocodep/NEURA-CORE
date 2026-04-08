import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { Plus, Search, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';
import type { MaterialPedido, EstadoPedido, ObraFicha, MaterialPedidoItem } from './types';
import { ESTADO_PEDIDO_COLOR, ESTADO_PEDIDO_LABEL } from './types';

const EMPTY: Partial<MaterialPedido> = {
  obra_id: '', proveedor: '', fecha_pedido: new Date().toISOString().slice(0, 10),
  fecha_estimada_entrega: '', estado: 'pedido', notas: '', total: 0,
};

const EMPTY_ITEM: Partial<MaterialPedidoItem> = { material: '', cantidad: 0, unidad: '', precio_unitario: 0, subtotal: 0 };

export default function ObrasMateriales() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<MaterialPedido[]>([]);
  const [obras, setObras] = useState<Pick<ObraFicha, 'id' | 'nombre'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<MaterialPedido>>(EMPTY);
  const [pedidoItems, setPedidoItems] = useState<Partial<MaterialPedidoItem>[]>([{ ...EMPTY_ITEM }]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroObra, setFiltroObra] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  const closeWizard = () => { setShowModal(false); setEditing(EMPTY); setPedidoItems([{ ...EMPTY_ITEM }]); setWizardStep(0); };

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [pedRes, obrasRes] = await Promise.all([
      supabase.from('obras_materiales_pedidos').select('*, obra:obras_fichas(id, nombre)').eq('tenant_id', tenant!.id).order('fecha_pedido', { ascending: false }),
      supabase.from('obras_fichas').select('id, nombre').eq('tenant_id', tenant!.id).eq('estado', 'activa').order('nombre'),
    ]);
    setItems(pedRes.data || []);
    setObras((obrasRes.data || []) as any);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.obra_id) return;
    const total = pedidoItems.reduce((s, i) => s + (i.subtotal || 0), 0);
    const payload = {
      obra_id: editing.obra_id,
      proveedor: editing.proveedor || null,
      fecha_pedido: editing.fecha_pedido || new Date().toISOString().slice(0, 10),
      fecha_estimada_entrega: editing.fecha_estimada_entrega || null,
      fecha_real_entrega: (editing as any).fecha_real_entrega || null,
      estado: editing.estado || 'pedido',
      notas: editing.notas || null,
      total,
      updated_at: new Date().toISOString(),
    };

    let pedidoId = editing.id;
    if (pedidoId) {
      await supabase.from('obras_materiales_pedidos').update(payload).eq('id', pedidoId);
      await supabase.from('obras_materiales_pedido_items').delete().eq('pedido_id', pedidoId);
    } else {
      const { data } = await supabase.from('obras_materiales_pedidos').insert({ ...payload, tenant_id: tenant!.id }).select().single();
      pedidoId = data?.id;
    }

    if (pedidoId) {
      const validItems = pedidoItems.filter(i => i.material?.trim());
      if (validItems.length > 0) {
        await supabase.from('obras_materiales_pedido_items').insert(
          validItems.map(i => ({ tenant_id: tenant!.id, pedido_id: pedidoId, material: i.material, cantidad: i.cantidad || 0, unidad: i.unidad || null, precio_unitario: i.precio_unitario || 0, subtotal: i.subtotal || 0 }))
        );
      }
    }

    closeWizard();
    loadData();
  };

  const handleDelete = (item: MaterialPedido) => {
    requestDelete(`¿Eliminar pedido a "${item.proveedor || 'sin proveedor'}"?`, async () => {
      await supabase.from('obras_materiales_pedido_items').delete().eq('pedido_id', item.id);
      await supabase.from('obras_materiales_pedidos').delete().eq('id', item.id);
      setItems(prev => prev.filter(e => e.id !== item.id));
    });
  };

  const handleEditPedido = async (p: MaterialPedido) => {
    const { data: its } = await supabase.from('obras_materiales_pedido_items').select('*').eq('pedido_id', p.id).order('created_at');
    setEditing(p);
    setPedidoItems(its && its.length > 0 ? its : [{ ...EMPTY_ITEM }]);
    setWizardStep(0);
    setShowModal(true);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setPedidoItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'cantidad' || field === 'precio_unitario') {
        next[idx].subtotal = (next[idx].cantidad || 0) * (next[idx].precio_unitario || 0);
      }
      return next;
    });
  };

  const filtered = items.filter(p => {
    if (filtroEstado && p.estado !== filtroEstado) return false;
    if (filtroObra && p.obra_id !== filtroObra) return false;
    if (search) {
      const s = search.toLowerCase();
      return (p.proveedor || '').toLowerCase().includes(s) || ((p as any).obra?.nombre || '').toLowerCase().includes(s);
    }
    return true;
  });

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Materiales / Compras</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Pedidos de materiales por obra</p>
        </div>
        <button onClick={() => { setEditing(EMPTY); setShowModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' }}>
          <Plus size={16} /> Nuevo Pedido
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input placeholder="Buscar proveedor u obra..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8125rem' }} />
        </div>
        <StyledSelect value={filtroObra} onChange={e => setFiltroObra(e.target.value)} style={{ width: 180 }}>
          <option value="">Todas las obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </StyledSelect>
        <StyledSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_PEDIDO_LABEL) as EstadoPedido[]).map(e => <option key={e} value={e}>{ESTADO_PEDIDO_LABEL[e]}</option>)}
        </StyledSelect>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Obra', 'Proveedor', 'Fecha Pedido', 'Estado', 'Total', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Total' ? 'right' : h === 'Acciones' ? 'right' : 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No hay pedidos</td></tr>
            ) : filtered.map(p => {
              const color = ESTADO_PEDIDO_COLOR[p.estado];
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{(p as any).obra?.nombre || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{p.proveedor || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{p.fecha_pedido}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>{ESTADO_PEDIDO_LABEL[p.estado]}</span>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>$ {fmt(p.total)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button onClick={() => handleEditPedido(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Wizard */}
      {showModal && (() => {
        const STEPS = [{ label: 'Pedido' }, { label: 'Ítems' }, { label: 'Notas' }];
        const canNext = wizardStep === 0 ? !!editing.obra_id : true;
        const isLast = wizardStep === STEPS.length - 1;
        const total = pedidoItems.reduce((s, i) => s + (i.subtotal || 0), 0);

        return (
          <div className="wizard-overlay" onClick={closeWizard}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="wizard-header">
              <h3>{editing.id ? 'Editar Pedido' : 'Nuevo Pedido'}</h3>
              <button className="wizard-close" onClick={closeWizard}><X size={18} /></button>
            </div>

            <div className="wizard-steps">
              {STEPS.map((s, i) => (
                <div key={i} className="wizard-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && <div className={`wizard-step-line${i <= wizardStep ? ' done' : ''}`} />}
                    <div className={`wizard-step-dot${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ' pending'}`}
                      onClick={() => i < wizardStep && setWizardStep(i)} style={{ cursor: i < wizardStep ? 'pointer' : 'default' }}>
                      {i < wizardStep ? <Check size={14} /> : i + 1}
                    </div>
                  </div>
                  <div className={`wizard-step-label${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ''}`}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="wizard-body">
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <label className="form-label">Obra *</label>
                  <StyledSelect value={editing.obra_id || ''} onChange={e => setEditing(p => ({ ...p, obra_id: e.target.value }))} style={{ width: '100%' }}>
                    <option value="">Seleccionar obra...</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </StyledSelect>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Proveedor</label>
                  <input className="form-input" value={editing.proveedor || ''} onChange={e => setEditing(p => ({ ...p, proveedor: e.target.value }))} placeholder="Nombre del proveedor" />
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Fecha Pedido</label>
                    <input className="form-input" type="date" value={editing.fecha_pedido || ''} onChange={e => setEditing(p => ({ ...p, fecha_pedido: e.target.value }))} />
                  </div>
                  <div className="wizard-field">
                    <label className="form-label">Entrega Estimada</label>
                    <input className="form-input" type="date" value={editing.fecha_estimada_entrega || ''} onChange={e => setEditing(p => ({ ...p, fecha_estimada_entrega: e.target.value }))} />
                  </div>
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Estado</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {(Object.keys(ESTADO_PEDIDO_LABEL) as EstadoPedido[]).map(e => (
                      <button key={e} className={`wizard-pill${editing.estado === e ? ' selected' : ''}`}
                        onClick={() => setEditing(p => ({ ...p, estado: e }))}>{ESTADO_PEDIDO_LABEL[e]}</button>
                    ))}
                  </div>
                </div>
              </>)}

              {wizardStep === 1 && (<>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pedidoItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 32px', gap: 8, alignItems: 'end' }}>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Material</label>}
                        <input className="form-input" value={item.material || ''} onChange={e => updateItem(idx, 'material', e.target.value)} placeholder="Descripción" />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Cant.</label>}
                        <input className="form-input" type="number" value={item.cantidad || ''} onChange={e => updateItem(idx, 'cantidad', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Unidad</label>}
                        <input className="form-input" value={item.unidad || ''} onChange={e => updateItem(idx, 'unidad', e.target.value)} placeholder="kg, m², un" />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">P. Unit.</label>}
                        <input className="form-input" type="number" value={item.precio_unitario || ''} onChange={e => updateItem(idx, 'precio_unitario', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Subtotal</label>}
                        <input className="form-input" value={fmt(item.subtotal || 0)} readOnly style={{ background: 'var(--color-bg-surface-2)', fontWeight: 600 }} />
                      </div>
                      <button onClick={() => setPedidoItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, marginBottom: 2 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setPedidoItems(prev => [...prev, { ...EMPTY_ITEM }])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--color-border)', background: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 600, marginTop: 8 }}>
                  <Plus size={14} /> Agregar ítem
                </button>
                <div style={{ textAlign: 'right', marginTop: 12, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                  Total: $ {fmt(total)}
                </div>
              </>)}

              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <label className="form-label">Notas</label>
                  <textarea className="form-input" rows={4} value={editing.notas || ''} onChange={e => setEditing(p => ({ ...p, notas: e.target.value }))} placeholder="Observaciones del pedido..." style={{ resize: 'vertical' }} />
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing.id && <button className="wizard-btn-danger" onClick={() => { handleDelete(editing as MaterialPedido); closeWizard(); }}>Eliminar</button>}
              </div>
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={handleSave}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Guardar</span>
                  </button>
                ) : (
                  <button className="wizard-btn-next" onClick={() => setWizardStep(s => s + 1)} disabled={!canNext}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Siguiente <ChevronRight size={16} /></span>
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        );
      })()}
      {ConfirmModal}
    </div>
  );
}
