import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { Plus, Trash2, Send, Check } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';

interface Proveedor { id: string; razon_social: string; cuit: string | null; }
interface Comprobante { id: string; fecha: string; tipo_comprobante: string; numero_comprobante: string | null; monto_ars: number; monto_original: number; estado: string; }
interface Retencion { tipo: string; base_imponible: number; alicuota: number; monto: number; }

const TIPOS_RETENCION = ['Ganancias', 'Ingresos Brutos (IIBB)', 'SUSS', 'IVA'];

export default function OrdenDePagoForm() {
  const { tenant } = useTenant();
  const { addToast } = useToast();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [provSearch, setProvSearch] = useState('');
  const [showProvDrop, setShowProvDrop] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedProv = proveedores.find(p => p.id === proveedorId);

  useEffect(() => {
    if (!tenant) return;
    supabase.from('contable_proveedores').select('id, razon_social, cuit')
      .eq('tenant_id', tenant.id).eq('activo', true).order('razon_social')
      .then(({ data }) => { if (data) setProveedores(data as any); setLoading(false); });
  }, [tenant]);

  // Load comprobantes when proveedor changes
  useEffect(() => {
    if (!tenant || !proveedorId) { setComprobantes([]); setSelected(new Set()); return; }
    supabase.from('contable_comprobantes')
      .select('id, fecha, tipo_comprobante, numero_comprobante, monto_ars, monto_original, estado')
      .eq('tenant_id', tenant.id).eq('proveedor_id', proveedorId).eq('tipo', 'compra')
      .in('estado', ['pendiente', 'clasificado', 'aprobado', 'inyectado'])
      .order('fecha', { ascending: false })
      .then(({ data }) => { if (data) setComprobantes(data as any); });
  }, [tenant, proveedorId]);

  const toggleComp = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const addRetencion = () => setRetenciones(prev => [...prev, { tipo: 'Ganancias', base_imponible: montoBruto, alicuota: 0, monto: 0 }]);
  const removeRetencion = (i: number) => setRetenciones(prev => prev.filter((_, idx) => idx !== i));
  const updateRetencion = (i: number, field: keyof Retencion, value: any) => {
    setRetenciones(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, [field]: value };
      updated.monto = (updated.base_imponible * updated.alicuota) / 100;
      return updated;
    }));
  };

  const selectedComps = comprobantes.filter(c => selected.has(c.id));
  const montoBruto = selectedComps.reduce((s, c) => s + (c.monto_ars || c.monto_original), 0);
  const montoRetenciones = retenciones.reduce((s, r) => s + r.monto, 0);
  const montoNeto = montoBruto - montoRetenciones;

  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);

  const handleSave = async () => {
    if (!tenant || !proveedorId || selected.size === 0) {
      addToast('error', 'Faltan datos', 'Seleccioná un proveedor y al menos un comprobante');
      return;
    }
    setSaving(true);
    try {
      const numeroOp = `OP-${Date.now().toString().slice(-6)}`;
      const { data: op, error: opErr } = await supabase.from('tesoreria_ordenes_pago').insert({
        tenant_id: tenant.id, numero_op: numeroOp, fecha, estado: 'aprobada',
        proveedor_id: proveedorId, monto_bruto: montoBruto,
        monto_retenciones: montoRetenciones, monto_neto: montoNeto,
        observaciones: observaciones.trim() || null,
      }).select('id').single();
      if (opErr || !op) throw opErr || new Error('No se pudo crear la OP');

      // Insert comprobantes
      await supabase.from('tesoreria_op_comprobantes').insert(
        selectedComps.map(c => ({ tenant_id: tenant.id, op_id: op.id, comprobante_id: c.id, monto_pagado: c.monto_ars || c.monto_original }))
      );
      // Insert retenciones
      if (retenciones.length > 0) {
        await supabase.from('tesoreria_op_retenciones').insert(
          retenciones.filter(r => r.monto > 0).map(r => ({ tenant_id: tenant.id, op_id: op.id, tipo_retencion: r.tipo, base_imponible: r.base_imponible, alicuota: r.alicuota, monto_retenido: r.monto }))
        );
      }
      // Mark comprobantes as pagado
      await supabase.from('contable_comprobantes').update({ estado: 'pagado' }).in('id', [...selected]);

      addToast('success', 'Orden de Pago creada', `${numeroOp} por ${fmt(montoNeto)}`);
      // Reset
      setProveedorId(''); setProvSearch(''); setSelected(new Set());
      setRetenciones([]); setObservaciones(''); setComprobantes([]);
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'No se pudo crear la OP');
    }
    setSaving(false);
  };

  const filteredProv = proveedores.filter(p =>
    p.razon_social.toLowerCase().includes(provSearch.toLowerCase()) || (p.cuit || '').includes(provSearch)
  );

  if (loading) return <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>Cargando...</div>;

  const lbl: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', gap: 24, padding: 20, alignItems: 'flex-start' }}>
      {/* ─── LEFT: FORM ─── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Proveedor */}
        <div style={{ position: 'relative' }}>
          <label style={lbl}>Proveedor *</label>
          <input className="form-input" placeholder="Buscar proveedor por nombre o CUIT..." value={provSearch}
            onChange={e => { setProvSearch(e.target.value); setShowProvDrop(true); }}
            onFocus={() => setShowProvDrop(true)} style={{ height: 38 }} />
          {showProvDrop && filteredProv.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
              {filteredProv.map(p => (
                <div key={p.id} onClick={() => { setProveedorId(p.id); setProvSearch(p.razon_social); setShowProvDrop(false); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.8125rem' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div style={{ fontWeight: 600 }}>{p.razon_social}</div>
                  {p.cuit && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>CUIT: {p.cuit}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fecha */}
        <div>
          <label style={lbl}>Fecha de emisión</label>
          <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} style={{ height: 38, maxWidth: 200 }} />
        </div>

        {/* Comprobantes */}
        {proveedorId && (
          <div>
            <label style={lbl}>Comprobantes pendientes</label>
            {comprobantes.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--color-text-muted)', fontSize: '0.8rem', background: 'var(--color-bg-surface)', borderRadius: 8 }}>Sin comprobantes pendientes para este proveedor</div>
            ) : (
              <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                {comprobantes.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', fontSize: '0.8125rem', background: selected.has(c.id) ? 'var(--color-accent-dim, rgba(37,99,235,0.05))' : '' }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleComp(c.id)} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', minWidth: 70 }}>{new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.75rem', padding: '1px 6px', borderRadius: 4, background: '#3B82F610', color: '#3B82F6' }}>{c.tipo_comprobante}</span>
                    <span style={{ flex: 1, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{c.numero_comprobante || '—'}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8125rem' }}>{fmt(c.monto_ars || c.monto_original)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Retenciones */}
        {selected.size > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...lbl, margin: 0 }}>Retenciones impositivas</label>
              <button onClick={addRetencion} style={{ background: 'none', border: '1px dashed var(--color-border-subtle)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> Agregar
              </button>
            </div>
            {retenciones.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 100px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <StyledSelect className="form-input" value={r.tipo} onChange={e => updateRetencion(i, 'tipo', e.target.value)} style={{ height: 32, fontSize: '0.75rem' }}>
                  {TIPOS_RETENCION.map(t => <option key={t} value={t}>{t}</option>)}
                </StyledSelect>
                <input type="number" className="form-input" value={r.base_imponible || ''} onChange={e => updateRetencion(i, 'base_imponible', Number(e.target.value))} placeholder="Base" style={{ height: 32, fontSize: '0.75rem' }} />
                <input type="number" className="form-input" value={r.alicuota || ''} onChange={e => updateRetencion(i, 'alicuota', Number(e.target.value))} placeholder="%" style={{ height: 32, fontSize: '0.75rem' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, textAlign: 'right' }}>{fmt(r.monto)}</div>
                <button onClick={() => removeRetencion(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Observaciones */}
        <div>
          <label style={lbl}>Observaciones</label>
          <textarea className="form-input" rows={2} value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Notas para tesorería..." />
        </div>

        {/* Submit */}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || selected.size === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', alignSelf: 'flex-start' }}>
          <Send size={16} /> {saving ? 'Generando...' : 'Emitir Orden de Pago'}
        </button>
      </div>

      {/* ─── RIGHT: LIVE PDF PREVIEW ─── */}
      <div style={{ width: 340, flexShrink: 0, position: 'sticky', top: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '24px 20px', fontFamily: 'Georgia, serif', color: '#1a1a1a', fontSize: '0.7rem', lineHeight: 1.5, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #1a1a1a', paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: 2 }}>Orden de Pago</div>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{(tenant as any)?.razon_social || tenant?.name || '—'}</div>
            <div style={{ fontSize: '0.6rem', color: '#64748b' }}>CUIT: {(tenant as any)?.cuit || '—'}</div>
          </div>

          {/* OP Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 14 }}>
            <div><span style={{ color: '#64748b' }}>N°:</span> <b>OP-XXXXXX</b></div>
            <div><span style={{ color: '#64748b' }}>Fecha:</span> <b>{new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR')}</b></div>
          </div>

          {/* Proveedor */}
          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 4, marginBottom: 14, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Proveedor</div>
            <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{selectedProv?.razon_social || '—'}</div>
            {selectedProv?.cuit && <div style={{ fontSize: '0.6rem', color: '#64748b' }}>CUIT: {selectedProv.cuit}</div>}
          </div>

          {/* Comprobantes */}
          {selectedComps.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Comprobantes incluidos</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 700, color: '#64748b' }}>Comp.</th>
                    <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 700, color: '#64748b' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedComps.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '3px 0' }}>{c.tipo_comprobante} {c.numero_comprobante || ''}</td>
                      <td style={{ padding: '3px 0', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(c.monto_ars || c.monto_original)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Retenciones */}
          {retenciones.length > 0 && retenciones.some(r => r.monto > 0) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Retenciones</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
                <tbody>
                  {retenciones.filter(r => r.monto > 0).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '3px 0' }}>{r.tipo} ({r.alicuota}%)</td>
                      <td style={{ padding: '3px 0', textAlign: 'right', fontFamily: 'monospace', color: '#EF4444' }}>-{fmt(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ borderTop: '2px solid #1a1a1a', paddingTop: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#64748b' }}>Subtotal</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(montoBruto)}</span>
            </div>
            {montoRetenciones > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: '#64748b' }}>Retenciones</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#EF4444' }}>-{fmt(montoRetenciones)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
              <span>NETO A PAGAR</span>
              <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>{fmt(montoNeto)}</span>
            </div>
          </div>

          {/* Observaciones */}
          {observaciones.trim() && (
            <div style={{ marginTop: 12, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, fontSize: '0.6rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
              <b>Obs:</b> {observaciones}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
