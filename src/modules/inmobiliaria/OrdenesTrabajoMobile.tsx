import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Wrench, Upload, Phone, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface OrdenTrabajo {
  id: string; propiedad_id: string; contrato_id: string | null; proveedor_id: string | null;
  titulo: string; descripcion: string | null; prioridad: string; estado: string;
  fecha_reporte: string; fecha_asignacion: string | null; fecha_completado: string | null;
  monto_presupuesto: number | null; monto_final: number | null; moneda: string;
  comprobante_url: string | null; notificado_inquilino: boolean; notas_cierre: string | null;
}
interface Propiedad { id: string; direccion: string; }
interface Proveedor { id: string; nombre: string; rubro: string; telefono: string | null; }

const ESTADO_CFG: Record<string, { label: string; color: string }> = {
  reportado: { label: 'Reportado', color: '#EF4444' },
  asignado: { label: 'Asignado', color: '#F59E0B' },
  en_curso: { label: 'En curso', color: '#3B82F6' },
  completado: { label: 'Completado', color: '#10B981' },
  facturado: { label: 'Facturado', color: '#8B5CF6' },
  liquidado: { label: 'Liquidado', color: '#6B7280' },
  cancelado: { label: 'Cancelado', color: '#9CA3AF' },
};
const PRIORIDAD_CFG: Record<string, { label: string; color: string }> = {
  baja: { label: 'Baja', color: '#6B7280' },
  media: { label: 'Media', color: '#3B82F6' },
  alta: { label: 'Alta', color: '#F59E0B' },
  urgente: { label: 'Urgente', color: '#EF4444' },
};
const ESTADOS_LIST = ['reportado', 'asignado', 'en_curso', 'completado', 'facturado', 'liquidado'];

const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);

export default function OrdenesTrabajo() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<OrdenTrabajo[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [filterEstado, setFilterEstado] = useState(searchParams.get('filter') || '');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<OrdenTrabajo | null>(null);
  const [form, setForm] = useState({ propiedad_id: '', proveedor_id: '', titulo: '', descripcion: '', prioridad: 'media', monto_presupuesto: '' });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingOrdenRef = useRef<OrdenTrabajo | null>(null);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [oRes, pRes, prRes] = await Promise.all([
      supabase.from('inmobiliaria_ordenes_trabajo').select('*').eq('tenant_id', tenant!.id).order('fecha_reporte', { ascending: false }),
      supabase.from('inmobiliaria_propiedades').select('id, direccion').eq('tenant_id', tenant!.id),
      supabase.from('inmobiliaria_proveedores').select('id, nombre, rubro, telefono').eq('tenant_id', tenant!.id).eq('activo', true),
    ]);
    if (oRes.data) setItems(oRes.data);
    if (pRes.data) setPropiedades(pRes.data);
    if (prRes.data) setProveedores(prRes.data);
    setLoading(false);
  };

  const propDir = (id: string) => propiedades.find(p => p.id === id)?.direccion || '—';
  const provName = (id: string | null) => id ? proveedores.find(p => p.id === id)?.nombre || '—' : 'Sin asignar';
  const provTel = (id: string | null) => id ? proveedores.find(p => p.id === id)?.telefono || null : null;

  const openNew = () => { setEditing(null); setForm({ propiedad_id: '', proveedor_id: '', titulo: '', descripcion: '', prioridad: 'media', monto_presupuesto: '' }); setShowModal(true); };

  const save = async () => {
    if (!form.titulo.trim() || !form.propiedad_id) return;
    const montoPresupuesto = form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null;
    const payload: Record<string, unknown> = {
      tenant_id: tenant!.id, propiedad_id: form.propiedad_id,
      proveedor_id: form.proveedor_id || null, titulo: form.titulo.trim(),
      descripcion: form.descripcion || null, prioridad: form.prioridad,
      estado: form.proveedor_id ? 'asignado' : 'reportado',
    };
    if (montoPresupuesto !== null && !isNaN(montoPresupuesto)) {
      payload.monto_presupuesto = montoPresupuesto;
    }
    if (editing) {
      await supabase.from('inmobiliaria_ordenes_trabajo').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('inmobiliaria_ordenes_trabajo').insert(payload);
    }
    setShowModal(false);
    loadData();
  };

  const avanzarEstado = async (ot: OrdenTrabajo) => {
    const idx = ESTADOS_LIST.indexOf(ot.estado);
    if (idx < 0 || idx >= ESTADOS_LIST.length - 1) return;
    const next = ESTADOS_LIST[idx + 1];
    if (next === 'facturado') return; // facturado is handled by upload flow
    const updates: Record<string, unknown> = { estado: next, updated_at: new Date().toISOString() };
    if (next === 'asignado') updates.fecha_asignacion = new Date().toISOString().slice(0, 10);
    if (next === 'completado') updates.fecha_completado = new Date().toISOString().slice(0, 10);
    await supabase.from('inmobiliaria_ordenes_trabajo').update(updates).eq('id', ot.id);
    setItems(prev => prev.map(o => o.id === ot.id ? { ...o, ...updates } as OrdenTrabajo : o));
  };

  const handleSubirFactura = (ot: OrdenTrabajo) => {
    pendingOrdenRef.current = ot;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ot = pendingOrdenRef.current;
    if (!file || !ot || !tenant) return;

    // Reset file input so the same file can be re-selected
    e.target.value = '';
    setUploadingId(ot.id);

    try {
      // 1. Upload file to Supabase storage — sanitize filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${tenant.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('comprobantes')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw uploadError;
      }

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from('comprobantes')
        .getPublicUrl(filePath);
      const comprobanteUrl = urlData.publicUrl;

      // 3. Send to OCR webhook — returns array with created comprobante data
      const formData = new FormData();
      formData.append('data', file);
      formData.append('filename', file.name);
      formData.append('tenant_id', tenant.id);
      if ((tenant as any).cuit) formData.append('cuit_empresa', (tenant as any).cuit);
      const resp = await fetch('/api/n8n-comprobantes', { method: 'POST', body: formData });

      // 4. Parse webhook response — returns [{id, monto_original, ...}]
      let montoFacturado: number | null = null;
      let comprobanteId: string | null = null;
      try {
        const text = await resp.text();
        if (text) {
          const parsed = JSON.parse(text);
          const comp = Array.isArray(parsed) ? parsed[0] : parsed;
          if (comp) {
            montoFacturado = Number(comp.monto_original || comp.monto_ars || 0) || null;
            comprobanteId = comp.id || null;
          }
        }
      } catch { /* webhook response not parseable — continue */ }

      // 5. Fix pdf_url on the comprobante n8n created — n8n saves original filename, we need our sanitized URL
      if (comprobanteId) {
        await supabase.from('contable_comprobantes')
          .update({ pdf_url: comprobanteUrl })
          .eq('id', comprobanteId);
      }

      // 6. Update the orden with facturado state, comprobante URL, and monto from OCR
      const updates: Record<string, unknown> = {
        estado: 'facturado',
        comprobante_url: comprobanteUrl,
      };
      if (montoFacturado && montoFacturado > 0) {
        updates.monto_final = montoFacturado;
      }
      await supabase.from('inmobiliaria_ordenes_trabajo').update(updates).eq('id', ot.id);
      setItems(prev => prev.map(o => o.id === ot.id ? { ...o, ...updates } as OrdenTrabajo : o));
    } catch (err) {
      console.error('Error subiendo factura:', err);
      alert('Error al procesar la factura. Intente nuevamente.');
    } finally {
      setUploadingId(null);
      pendingOrdenRef.current = null;
    }
  };

  const filtered = items.filter(o => !filterEstado || o.estado === filterEstado);

  // Counts
  const reportados = items.filter(o => o.estado === 'reportado').length;
  const enCurso = items.filter(o => o.estado === 'en_curso' || o.estado === 'asignado').length;
  const completados = items.filter(o => o.estado === 'completado' || o.estado === 'facturado').length;

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando órdenes...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Hidden file input for invoice upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div onClick={() => setFilterEstado('reportado')} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, background: reportados > 0 ? '#EF444408' : 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: reportados > 0 ? '#EF4444' : 'var(--color-text-primary)' }}>{reportados}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>Reportados</div>
        </div>
        <div onClick={() => setFilterEstado('en_curso')} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#3B82F6' }}>{enCurso}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>En curso</div>
        </div>
        <div onClick={() => setFilterEstado('completado')} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10B981' }}>{completados}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>Resueltos</div>
        </div>
      </div>

      {/* New + filter */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto' }}>
          <button onClick={() => setFilterEstado('')} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: !filterEstado ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: !filterEstado ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>Todos</button>
          {ESTADOS_LIST.map(e => {
            const cfg = ESTADO_CFG[e];
            return (
              <button key={e} onClick={() => setFilterEstado(filterEstado === e ? '' : e)}
                style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${filterEstado === e ? cfg.color : 'var(--color-border-subtle)'}`, background: filterEstado === e ? `${cfg.color}15` : 'var(--color-bg-surface)', color: filterEstado === e ? cfg.color : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                {cfg.label}
              </button>
            );
          })}
        </div>
        <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={18} />
        </button>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(ot => {
          const est = ESTADO_CFG[ot.estado] || ESTADO_CFG.reportado;
          const pri = PRIORIDAD_CFG[ot.prioridad] || PRIORIDAD_CFG.media;
          const tel = provTel(ot.proveedor_id);
          const isUploading = uploadingId === ot.id;
          const hasBudget = ot.monto_presupuesto != null;
          const hasInvoice = ot.monto_final != null;
          const overBudget = hasBudget && hasInvoice && ot.monto_final! > ot.monto_presupuesto!;
          return (
            <div key={ot.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderLeft: `4px solid ${est.color}` }}>
              {/* Row 1: title + priority */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{ot.titulo}</div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${pri.color}15`, color: pri.color, flexShrink: 0, marginLeft: 6 }}>{pri.label}</span>
              </div>
              {/* Row 2: propiedad */}
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{propDir(ot.propiedad_id)}</div>
              {/* Row 2.5: budget/invoice comparison */}
              {(hasBudget || hasInvoice) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {hasBudget && (
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      Presupuesto: ${ot.monto_presupuesto!.toLocaleString('es-AR')}
                    </span>
                  )}
                  {hasInvoice && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: overBudget ? '#F59E0B' : '#10B981' }}>
                      Facturado: ${ot.monto_final!.toLocaleString('es-AR')}
                      {overBudget
                        ? <AlertTriangle size={12} />
                        : <CheckCircle size={12} />
                      }
                    </span>
                  )}
                </div>
              )}
              {/* Row 3: badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${est.color}15`, color: est.color }}>{est.label}</span>
                {ot.proveedor_id && (
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-secondary)' }}>
                    <Wrench size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />{provName(ot.proveedor_id)}
                  </span>
                )}
                {ot.notificado_inquilino && (
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#10B98115', color: '#10B981' }}>Notificado</span>
                )}
              </div>
              {/* Row 3.5: invoice preview */}
              {ot.comprobante_url && (
                <div style={{ marginBottom: 8 }}>
                  {isImageUrl(ot.comprobante_url) ? (
                    <a href={ot.comprobante_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={ot.comprobante_url}
                        alt="Comprobante"
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }}
                      />
                    </a>
                  ) : (
                    <a href={ot.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, background: 'var(--color-bg-surface-2)', color: '#8B5CF6', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', border: '1px solid var(--color-border-subtle)' }}>
                      <FileText size={14} /> Ver factura
                    </a>
                  )}
                </div>
              )}
              {/* Row 4: actions */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ot.estado !== 'completado' && ot.estado !== 'facturado' && ot.estado !== 'liquidado' && ot.estado !== 'cancelado' && (
                  <button onClick={() => avanzarEstado(ot)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${est.color}`, background: 'transparent', color: est.color, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    {ot.estado === 'reportado' ? 'Asignar' : ot.estado === 'asignado' ? 'Iniciar' : 'Completar'}
                  </button>
                )}
                {tel && (
                  <a href={`tel:${tel}`} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-cta, #2563EB)', fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Phone size={12} /> Llamar
                  </a>
                )}
                {ot.estado === 'completado' && (
                  <button
                    onClick={() => handleSubirFactura(ot)}
                    disabled={isUploading}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #8B5CF6', background: isUploading ? '#8B5CF615' : 'transparent', color: '#8B5CF6', fontSize: '0.75rem', fontWeight: 600, cursor: isUploading ? 'wait' : 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 3, opacity: isUploading ? 0.7 : 1 }}
                  >
                    <Upload size={12} /> {isUploading ? 'Procesando factura...' : 'Subir factura'}
                  </button>
                )}
                <button onClick={() => { setEditing(ot); setForm({ propiedad_id: ot.propiedad_id, proveedor_id: ot.proveedor_id || '', titulo: ot.titulo, descripcion: ot.descripcion || '', prioridad: ot.prioridad, monto_presupuesto: ot.monto_presupuesto != null ? String(ot.monto_presupuesto) : '' }); setShowModal(true); }}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  Ver detalle
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin órdenes de trabajo</div>}
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }} />
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg-base)', borderRadius: '20px 20px 0 0', padding: '20px 16px 80px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />
            <h3 style={{ fontWeight: 700, fontSize: '1.0625rem', margin: '0 0 16px' }}>{editing ? 'Editar orden' : 'Reportar problema'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">Título *</label><input className="form-input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Pérdida de agua en baño" style={{ height: 42, borderRadius: 10 }} /></div>
              <div className="form-group"><label className="form-label">Propiedad *</label>
                <select className="form-input" value={form.propiedad_id} onChange={e => setForm(f => ({ ...f, propiedad_id: e.target.value }))} style={{ height: 42, borderRadius: 10 }}>
                  <option value="">Seleccionar...</option>
                  {propiedades.map(p => <option key={p.id} value={p.id}>{p.direccion}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Proveedor (opcional)</label>
                <select className="form-input" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))} style={{ height: 42, borderRadius: 10 }}>
                  <option value="">Sin asignar</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.rubro})</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Prioridad</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['baja', 'media', 'alta', 'urgente'] as const).map(p => {
                    const cfg = PRIORIDAD_CFG[p];
                    return (
                      <button key={p} onClick={() => setForm(f => ({ ...f, prioridad: p }))}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: form.prioridad === p ? 'none' : '1px solid var(--color-border-subtle)', background: form.prioridad === p ? cfg.color : 'var(--color-bg-surface)', color: form.prioridad === p ? '#fff' : 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-group"><label className="form-label">Monto presupuesto</label>
                <input className="form-input" type="number" min="0" step="0.01" value={form.monto_presupuesto} onChange={e => setForm(f => ({ ...f, monto_presupuesto: e.target.value }))} placeholder="Ej: 45000" style={{ height: 42, borderRadius: 10 }} />
              </div>
              <div className="form-group"><label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Detalle del problema..." style={{ borderRadius: 10, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1, height: 42, borderRadius: 10 }}>Cancelar</button>
              <button onClick={save} className="btn btn-primary" disabled={!form.titulo.trim() || !form.propiedad_id} style={{ flex: 1, height: 42, borderRadius: 10 }}>
                {editing ? 'Guardar' : 'Reportar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
