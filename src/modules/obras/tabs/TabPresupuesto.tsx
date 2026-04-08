import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Plus, Trash2, FileText, Upload, ChevronDown, ChevronRight, Check } from 'lucide-react';
import StyledSelect from '../../../shared/components/StyledSelect';
import type { Presupuesto, PresupuestoItem, Certificado, CertificadoDetalle } from '../types';
import { ESTADO_CERTIFICADO_COLOR, ESTADO_CERTIFICADO_LABEL } from '../types';
import type { EstadoCertificado } from '../types';

export default function TabPresupuesto({ obraId }: { obraId: string }) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [items, setItems] = useState<PresupuestoItem[]>([]);
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [expandedCert, setExpandedCert] = useState<string | null>(null);
  const [certDetalle, setCertDetalle] = useState<CertificadoDetalle[]>([]);

  // New item form
  const [newItem, setNewItem] = useState({ descripcion: '', unidad: '', cantidad: 0, precio_unitario: 0 });
  // New cert form
  const [showNewCert, setShowNewCert] = useState(false);
  const [newCert, setNewCert] = useState({ fecha: new Date().toISOString().slice(0, 10), periodo: '', notas: '' });

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    // Get latest presupuesto version
    const { data: presData } = await supabase.from('obras_presupuestos').select('*').eq('obra_id', obraId).eq('tenant_id', tenant!.id).order('version', { ascending: false }).limit(1);
    const pres = presData && presData.length > 0 ? presData[0] : null;
    setPresupuesto(pres);

    if (pres) {
      const { data: itemsData } = await supabase.from('obras_presupuesto_items').select('*').eq('presupuesto_id', pres.id).order('orden');
      setItems(itemsData || []);
    } else {
      setItems([]);
    }

    const { data: certData } = await supabase.from('obras_certificados').select('*').eq('obra_id', obraId).eq('tenant_id', tenant!.id).order('numero', { ascending: false });
    setCertificados(certData || []);
    setLoading(false);
  };

  const ensurePresupuesto = async (): Promise<string> => {
    if (presupuesto) return presupuesto.id;
    const { data } = await supabase.from('obras_presupuestos').insert({
      tenant_id: tenant!.id, obra_id: obraId, version: 1, fecha: new Date().toISOString().slice(0, 10),
    }).select().single();
    setPresupuesto(data);
    return data!.id;
  };

  const addItem = async () => {
    if (!newItem.descripcion.trim()) return;
    const presId = await ensurePresupuesto();
    const subtotal = newItem.cantidad * newItem.precio_unitario;
    await supabase.from('obras_presupuesto_items').insert({
      tenant_id: tenant!.id, presupuesto_id: presId,
      descripcion: newItem.descripcion, unidad: newItem.unidad || null,
      cantidad: newItem.cantidad, precio_unitario: newItem.precio_unitario,
      subtotal, orden: items.length,
    });
    setNewItem({ descripcion: '', unidad: '', cantidad: 0, precio_unitario: 0 });
    loadData();
  };

  const removeItem = async (id: string) => {
    await supabase.from('obras_presupuesto_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const addCertificado = async () => {
    const numero = certificados.length > 0 ? Math.max(...certificados.map(c => c.numero)) + 1 : 1;
    await supabase.from('obras_certificados').insert({
      tenant_id: tenant!.id, obra_id: obraId, numero,
      fecha: newCert.fecha, periodo: newCert.periodo || null,
      estado: 'borrador', notas: newCert.notas || null,
    });
    setShowNewCert(false);
    setNewCert({ fecha: new Date().toISOString().slice(0, 10), periodo: '', notas: '' });
    loadData();
  };

  const toggleCert = async (id: string) => {
    if (expandedCert === id) { setExpandedCert(null); return; }
    const { data } = await supabase.from('obras_certificado_detalle').select('*').eq('certificado_id', id).order('created_at');
    setCertDetalle(data || []);
    setExpandedCert(id);
  };

  const updateCertEstado = async (certId: string, estado: EstadoCertificado) => {
    await supabase.from('obras_certificados').update({ estado }).eq('id', certId);
    setCertificados(prev => prev.map(c => c.id === certId ? { ...c, estado } : c));
  };

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando presupuesto...</div>;

  const totalPres = items.reduce((s, i) => s + i.subtotal, 0);
  // Avance global from last cert
  const lastCert = certificados.find(c => c.estado !== 'borrador') || certificados[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Presupuesto */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: '#3b82f6' }} />
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Presupuesto</span>
            {presupuesto && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>v{presupuesto.version}</span>}
          </div>
          <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>$ {fmt(totalPres)}</span>
        </div>

        {items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Descripción', 'Unidad', 'Cantidad', 'P. Unitario', 'Subtotal', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Descripción' || h === 'Unidad' ? 'left' : 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.625rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{i.descripcion}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)' }}>{i.unidad || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{i.cantidad}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>$ {fmt(i.precio_unitario)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>$ {fmt(i.subtotal)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button onClick={() => removeItem(i.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="form-label">Descripción</label>
            <input className="form-input" value={newItem.descripcion} onChange={e => setNewItem(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ítem del presupuesto" />
          </div>
          <div>
            <label className="form-label">Unidad</label>
            <input className="form-input" value={newItem.unidad} onChange={e => setNewItem(p => ({ ...p, unidad: e.target.value }))} placeholder="m², kg" />
          </div>
          <div>
            <label className="form-label">Cantidad</label>
            <input className="form-input" type="number" value={newItem.cantidad || ''} onChange={e => setNewItem(p => ({ ...p, cantidad: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="form-label">P. Unitario</label>
            <input className="form-input" type="number" value={newItem.precio_unitario || ''} onChange={e => setNewItem(p => ({ ...p, precio_unitario: Number(e.target.value) }))} />
          </div>
          <button onClick={addItem} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> Agregar
          </button>
        </div>
      </div>

      {/* Certificados */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={16} style={{ color: '#10b981' }} />
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Certificados de Avance</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>({certificados.length})</span>
          </div>
          <button onClick={() => setShowNewCert(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>
            <Plus size={14} /> Nuevo Certificado
          </button>
        </div>

        {showNewCert && (
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Fecha</label>
              <input className="form-input" type="date" value={newCert.fecha} onChange={e => setNewCert(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Período</label>
              <input className="form-input" value={newCert.periodo} onChange={e => setNewCert(p => ({ ...p, periodo: e.target.value }))} placeholder="Ej: Marzo 2026" />
            </div>
            <div style={{ flex: 2 }}>
              <label className="form-label">Notas</label>
              <input className="form-input" value={newCert.notas} onChange={e => setNewCert(p => ({ ...p, notas: e.target.value }))} />
            </div>
            <button onClick={addCertificado} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>
              <Check size={14} />
            </button>
          </div>
        )}

        {certificados.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>No hay certificados cargados</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {certificados.map(c => {
              const color = ESTADO_CERTIFICADO_COLOR[c.estado];
              return (
                <div key={c.id} style={{ borderRadius: 8, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                  <div onClick={() => toggleCert(c.id)} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'var(--color-bg-surface-2)' }}>
                    {expandedCert === c.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>Certificado #{c.numero}</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{c.fecha}</span>
                    {c.periodo && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>— {c.periodo}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>{ESTADO_CERTIFICADO_LABEL[c.estado]}</span>
                    <StyledSelect value={c.estado} onChange={e => updateCertEstado(c.id, e.target.value as EstadoCertificado)}
                      onClick={(e: any) => e.stopPropagation()} style={{ width: 120, fontSize: '0.6875rem' }}>
                      {(Object.keys(ESTADO_CERTIFICADO_LABEL) as EstadoCertificado[]).map(e => <option key={e} value={e}>{ESTADO_CERTIFICADO_LABEL[e]}</option>)}
                    </StyledSelect>
                  </div>
                  {expandedCert === c.id && (
                    <div style={{ padding: 14, borderTop: '1px solid var(--color-border-subtle)' }}>
                      {certDetalle.length === 0 ? (
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center' }}>Sin detalle por ítem cargado</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                              {['Cant. Período', 'Cant. Acumulada', '% Avance', 'Monto Período', 'Monto Acumulado'].map(h => (
                                <th key={h} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.625rem', textTransform: 'uppercase' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {certDetalle.map(d => (
                              <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.cantidad_periodo}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.cantidad_acumulada}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{d.porcentaje_avance}%</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>$ {fmt(d.monto_periodo)}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>$ {fmt(d.monto_acumulado)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
