import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Wrench, Upload, Phone, FileText, CheckCircle, AlertTriangle, X, Check, ChevronRight, ChevronLeft, Eye, Trash2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import CustomSelect from '../../shared/components/CustomSelect';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';

interface OrdenTrabajo {
  id: string; propiedad_id: string; contrato_id: string | null; proveedor_id: string | null;
  titulo: string; descripcion: string | null; prioridad: string; estado: string;
  fecha_reporte: string; fecha_asignacion: string | null; fecha_completado: string | null;
  monto_presupuesto: number | null; monto_final: number | null; moneda: string;
  comprobante_url: string | null; notificado_inquilino: boolean; notas_cierre: string | null;
}
interface Propiedad { id: string; direccion: string; }
interface Proveedor { id: string; nombre: string; rubro: string; telefono: string | null; }

const ESTADO_CFG: Record<string, { label: string; color: string; short: string }> = {
  reportado: { label: 'Reportado', short: 'REP', color: '#EF4444' },
  asignado: { label: 'Asignado', short: 'ASG', color: '#F59E0B' },
  en_curso: { label: 'En curso', short: 'CUR', color: '#3B82F6' },
  completado: { label: 'Completado', short: 'OK', color: '#10B981' },
  facturado: { label: 'Facturado', short: 'FAC', color: '#8B5CF6' },
  liquidado: { label: 'Liquidado', short: 'LIQ', color: '#6B7280' },
  cancelado: { label: 'Cancelado', short: 'CAN', color: '#9CA3AF' },
};
const PRIORIDAD_CFG: Record<string, { label: string; color: string }> = {
  baja: { label: 'Baja', color: '#6B7280' },
  media: { label: 'Media', color: '#3B82F6' },
  alta: { label: 'Alta', color: '#F59E0B' },
  urgente: { label: 'Urgente', color: '#EF4444' },
};
const ESTADOS_LIST = ['reportado', 'asignado', 'en_curso', 'completado', 'facturado', 'liquidado'];

const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

export default function OrdenesTrabajo({ wizardOnly, onClose }: { wizardOnly?: boolean; onClose?: () => void } = {}) {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<OrdenTrabajo[]>([]);
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const fromHome = searchParams.get('from') === 'home';
  const [filterEstado, setFilterEstado] = useState(searchParams.get('filter') || '');
  const [filterProveedor, setFilterProveedor] = useState(searchParams.get('proveedor') || '');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<OrdenTrabajo | null>(null);
  const [form, setForm] = useState({ propiedad_id: '', proveedor_id: '', titulo: '', descripcion: '', prioridad: 'media', monto_presupuesto: '' });
  const [wizardStep, setWizardStep] = useState(0);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingOrdenRef = useRef<OrdenTrabajo | null>(null);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

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

  // Auto-open wizard if navigated with ?action=crear
  useEffect(() => {
    if (searchParams.get('action') === 'crear' && !loading) {
      openNew();
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, loading]);

  useEffect(() => {
    if (wizardOnly && !loading) openNew();
  }, [wizardOnly, loading]);

  const closeWizard = () => {
    if (wizardOnly && onClose) {
      onClose();
      return;
    }
    setShowModal(false);
    if (fromHome) navigate('/', { replace: true });
  };

  const openNew = () => { setEditing(null); setForm({ propiedad_id: '', proveedor_id: '', titulo: '', descripcion: '', prioridad: 'media', monto_presupuesto: '' }); setWizardStep(0); setShowModal(true); };
  const openEdit = (ot: OrdenTrabajo) => {
    setEditing(ot);
    setForm({ propiedad_id: ot.propiedad_id, proveedor_id: ot.proveedor_id || '', titulo: ot.titulo, descripcion: ot.descripcion || '', prioridad: ot.prioridad, monto_presupuesto: ot.monto_presupuesto != null ? String(ot.monto_presupuesto) : '' });
    setWizardStep(0); setShowModal(true);
  };

  const save = async () => {
    if (!form.titulo.trim() || !form.propiedad_id) return;
    const montoPresupuesto = form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null;
    const payload: Record<string, unknown> = {
      tenant_id: tenant!.id, propiedad_id: form.propiedad_id,
      proveedor_id: form.proveedor_id || null, titulo: form.titulo.trim(),
      descripcion: form.descripcion || null, prioridad: form.prioridad,
      estado: form.proveedor_id ? 'asignado' : 'reportado',
    };
    if (montoPresupuesto !== null && !isNaN(montoPresupuesto)) payload.monto_presupuesto = montoPresupuesto;
    if (editing) {
      await supabase.from('inmobiliaria_ordenes_trabajo').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('inmobiliaria_ordenes_trabajo').insert(payload);
    }
    closeWizard();
    loadData();
  };

  const remove = (ot: OrdenTrabajo) => {
    requestDelete('Esta acción eliminará la orden de trabajo y no se puede deshacer.', async () => {
      await supabase.from('inmobiliaria_ordenes_trabajo').delete().eq('id', ot.id);
      setItems(prev => prev.filter(o => o.id !== ot.id));
      closeWizard();
    });
  };

  const avanzarEstado = async (ot: OrdenTrabajo) => {
    const idx = ESTADOS_LIST.indexOf(ot.estado);
    if (idx < 0 || idx >= ESTADOS_LIST.length - 1) return;
    const next = ESTADOS_LIST[idx + 1];
    if (next === 'facturado') return; // facturado se hace por upload
    const updates: Record<string, unknown> = { estado: next, updated_at: new Date().toISOString() };
    if (next === 'asignado') updates.fecha_asignacion = new Date().toISOString().slice(0, 10);
    if (next === 'completado') updates.fecha_completado = new Date().toISOString().slice(0, 10);
    if (next === 'liquidado') {
      // Also update the OP to "pagada"
      const { data: ops } = await supabase.from('tesoreria_ordenes_pago')
        .select('id').eq('tenant_id', tenant!.id).eq('estado', 'aprobada')
        .ilike('observaciones', `%${ot.titulo}%`).limit(1);
      if (ops && ops.length > 0) {
        await supabase.from('tesoreria_ordenes_pago').update({ estado: 'pagada' }).eq('id', ops[0].id);
      }
    }
    await supabase.from('inmobiliaria_ordenes_trabajo').update(updates).eq('id', ot.id);
    setItems(prev => prev.map(o => o.id === ot.id ? { ...o, ...updates } as OrdenTrabajo : o));
  };

  const handleSubirFactura = (ot: OrdenTrabajo) => { pendingOrdenRef.current = ot; fileInputRef.current?.click(); };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ot = pendingOrdenRef.current;
    if (!file || !ot || !tenant) return;
    e.target.value = '';
    setUploadingId(ot.id);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${tenant.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('comprobantes').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(filePath);
      const comprobanteUrl = urlData.publicUrl;
      const formData = new FormData();
      formData.append('data', file); formData.append('filename', file.name); formData.append('tenant_id', tenant.id);
      if ((tenant as any).cuit) formData.append('cuit_empresa', (tenant as any).cuit);
      const resp = await fetch('/api/n8n-comprobantes', { method: 'POST', body: formData });
      let montoFacturado: number | null = null; let comprobanteId: string | null = null;
      try {
        const text = await resp.text();
        if (text) { const parsed = JSON.parse(text); const comp = Array.isArray(parsed) ? parsed[0] : parsed; if (comp) { montoFacturado = Number(comp.monto_original || comp.monto_ars || 0) || null; comprobanteId = comp.id || null; } }
      } catch { /* ok */ }
      if (comprobanteId) await supabase.from('contable_comprobantes').update({ pdf_url: comprobanteUrl }).eq('id', comprobanteId);
      const updates: Record<string, unknown> = { estado: 'facturado', comprobante_url: comprobanteUrl };
      if (montoFacturado && montoFacturado > 0) updates.monto_final = montoFacturado;
      await supabase.from('inmobiliaria_ordenes_trabajo').update(updates).eq('id', ot.id);
      setItems(prev => prev.map(o => o.id === ot.id ? { ...o, ...updates } as OrdenTrabajo : o));

      // ── Auto-generate Orden de Pago ──
      const montoPago = montoFacturado && montoFacturado > 0 ? montoFacturado : (ot.monto_presupuesto || 0);
      if (montoPago > 0) {
        const proveedorId = ot.proveedor_id;
        // Look up proveedor in contable_proveedores (needed for OP)
        let contableProvId: string | null = null;
        if (proveedorId) {
          const prov = proveedores.find(p => p.id === proveedorId);
          if (prov) {
            // Check if a contable proveedor exists with same name
            const { data: cp } = await supabase.from('contable_proveedores')
              .select('id').eq('tenant_id', tenant.id).ilike('razon_social', prov.nombre).limit(1).single();
            if (cp) {
              contableProvId = cp.id;
            } else {
              // Create contable proveedor from inmob proveedor
              const { data: newProv } = await supabase.from('contable_proveedores')
                .insert({ tenant_id: tenant.id, razon_social: prov.nombre, cuit: '', activo: true })
                .select('id').single();
              if (newProv) contableProvId = newProv.id;
            }
          }
        }
        const numeroOP = `OP-${Date.now()}`;
        const { data: opData } = await supabase.from('tesoreria_ordenes_pago').insert({
          tenant_id: tenant.id,
          proveedor_id: contableProvId,
          numero_op: numeroOP,
          fecha: new Date().toISOString().slice(0, 10),
          estado: 'aprobada',
          monto_bruto: montoPago,
          monto_retenciones: 0,
          monto_neto: montoPago,
          observaciones: `Generada automáticamente desde orden de trabajo: ${ot.titulo}`,
        }).select('id').single();

        // Link comprobante to the OP
        if (opData && comprobanteId) {
          await supabase.from('tesoreria_op_comprobantes').insert({
            tenant_id: tenant.id,
            op_id: opData.id,
            comprobante_id: comprobanteId,
            monto_pagado: montoPago,
          });
        }

        // Notify user
        if (opData) {
          const goToOP = confirm(`Factura procesada. Se generó la Orden de Pago ${numeroOP} por $${montoPago.toLocaleString('es-AR')}.\n\n¿Ir a ver la orden de pago?`);
          if (goToOP) navigate('/tesoreria/ordenes-pago');
        }
      }
    } catch (err) { console.error('Error subiendo factura:', err); alert('Error al procesar la factura.'); }
    finally { setUploadingId(null); pendingOrdenRef.current = null; }
  };

  const filtered = items.filter(o => {
    if (filterEstado && o.estado !== filterEstado) return false;
    if (filterProveedor && o.proveedor_id !== filterProveedor) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.titulo.toLowerCase().includes(q) && !propDir(o.propiedad_id).toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const reportados = items.filter(o => o.estado === 'reportado').length;
  const enCurso = items.filter(o => o.estado === 'en_curso' || o.estado === 'asignado').length;
  const completados = items.filter(o => o.estado === 'completado' || o.estado === 'facturado').length;

  if (loading && !wizardOnly) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando órdenes...</div>;

  /* ── Status stepper mini (inline in table row) ── */
  const StatusStepper = ({ estado }: { estado: string }) => {
    const idx = ESTADOS_LIST.indexOf(estado);
    const steps = ESTADOS_LIST.slice(0, 6); // exclude cancelado
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((s, i) => {
          const cfg = ESTADO_CFG[s];
          const isDone = i < idx;
          const isCurrent = i === idx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: 12, height: 2, background: isDone ? cfg.color : 'var(--color-border)', transition: 'background 0.2s' }} />}
              <div title={cfg.label} style={{
                width: isCurrent ? 20 : 8, height: isCurrent ? 20 : 8, borderRadius: 99,
                background: isDone ? ESTADO_CFG[steps[i]].color : isCurrent ? cfg.color : 'var(--color-bg-surface-2)',
                border: isCurrent ? 'none' : isDone ? 'none' : '1.5px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s', flexShrink: 0,
              }}>
                {isCurrent && <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#fff' }}>{cfg.short}</span>}
                {isDone && <Check size={6} color="#fff" />}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Next action label ── */
  const nextActionLabel = (ot: OrdenTrabajo) => {
    if (ot.estado === 'reportado') return 'Asignar';
    if (ot.estado === 'asignado') return 'Iniciar';
    if (ot.estado === 'en_curso') return 'Completar';
    if (ot.estado === 'completado') return 'Subir factura';
    if (ot.estado === 'facturado') return 'Liquidar';
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {!wizardOnly && (<>
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Desktop header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Órdenes de trabajo</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar orden..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS_LIST.map(e => <option key={e} value={e}>{ESTADO_CFG[e]?.label || e}</option>)}
        </select>
        <select value={filterProveedor} onChange={e => setFilterProveedor(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: isMobile ? 6 : 10 }}>
        {[
          { label: 'Reportados', count: reportados, color: reportados > 0 ? '#EF4444' : 'var(--color-text-primary)', filter: 'reportado' },
          { label: 'En curso', count: enCurso, color: '#3B82F6', filter: 'en_curso' },
          { label: 'Resueltos', count: completados, color: '#10B981', filter: 'completado' },
        ].map(kpi => (
          <div key={kpi.label} onClick={() => setFilterEstado(kpi.filter)}
            style={{ flex: 1, padding: isMobile ? '8px 6px' : '12px 10px', borderRadius: isMobile ? 8 : 10, background: kpi.count > 0 && kpi.label === 'Reportados' ? '#EF444408' : 'var(--color-bg-card)', border: `1px solid ${filterEstado === kpi.filter ? kpi.color + '40' : 'var(--color-border-subtle)'}`, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}>
            <div style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: 800, color: kpi.color }}>{kpi.count}</div>
            <div style={{ fontSize: isMobile ? '0.6rem' : '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto' }}>
          <button onClick={() => setFilterEstado('')} style={{ padding: '5px 14px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: !filterEstado ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: !filterEstado ? '#fff' : 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>Todos</button>
          {ESTADOS_LIST.map(e => {
            const cfg = ESTADO_CFG[e];
            return (
              <button key={e} onClick={() => setFilterEstado(filterEstado === e ? '' : e)}
                style={{ padding: '5px 14px', borderRadius: 99, border: `1px solid ${filterEstado === e ? cfg.color : 'var(--color-border-subtle)'}`, background: filterEstado === e ? `${cfg.color}15` : 'var(--color-bg-surface)', color: filterEstado === e ? cfg.color : 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                {cfg.label}
              </button>
            );
          })}
        </div>
        {isMobile && (
          <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} />
          </button>
        )}
      </div>

      {/* ─── DESKTOP TABLE ─── */}
      {!isMobile ? (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflowX: 'auto' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 150px 70px 90px 200px', minWidth: 750, padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
            <span>Orden</span><span>Progreso</span><span>Prioridad</span><span>Presup.</span><span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {/* Rows */}
          {filtered.map(ot => {
            const est = ESTADO_CFG[ot.estado] || ESTADO_CFG.reportado;
            const pri = PRIORIDAD_CFG[ot.prioridad] || PRIORIDAD_CFG.media;
            const tel = provTel(ot.proveedor_id);
            const isUploading = uploadingId === ot.id;
            const nextAction = nextActionLabel(ot);
            const iconBtn: React.CSSProperties = {
              width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
            };
            return (
              <div key={ot.id}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 150px 70px 90px 200px', minWidth: 750, padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                {/* Titulo + propiedad + proveedor */}
                <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openEdit(ot)}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.titulo}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{propDir(ot.propiedad_id)}</span>
                    {ot.proveedor_id && (
                      <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Wrench size={8} />{provName(ot.proveedor_id)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Status stepper */}
                <div><StatusStepper estado={ot.estado} /></div>
                {/* Prioridad */}
                <div>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${pri.color}15`, color: pri.color }}>{pri.label}</span>
                </div>
                {/* Presupuesto */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {ot.monto_presupuesto ? `$${ot.monto_presupuesto.toLocaleString('es-AR')}` : '—'}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {nextAction && ot.estado !== 'completado' && ot.estado !== 'liquidado' && ot.estado !== 'cancelado' && (
                    <div className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); avanzarEstado(ot); }}
                        className="row-action-btn"
                        style={{ ...iconBtn, color: est.color, borderColor: `${est.color}30` }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${est.color}10`; e.currentTarget.style.borderColor = est.color; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = `${est.color}30`; }}>
                        <ChevronRight size={14} />
                      </button>
                      <span className="row-action-tooltip">{nextAction}</span>
                    </div>
                  )}
                  {ot.estado === 'facturado' && (
                    <div className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); navigate('/tesoreria/ordenes-pago'); }}
                        className="row-action-btn"
                        style={{ ...iconBtn, color: '#8B5CF6', borderColor: '#8B5CF630' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF610'; e.currentTarget.style.borderColor = '#8B5CF6'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#8B5CF630'; }}>
                        <FileText size={14} />
                      </button>
                      <span className="row-action-tooltip">Ver orden de pago</span>
                    </div>
                  )}
                  {ot.estado === 'completado' && (
                    <div className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); handleSubirFactura(ot); }} disabled={isUploading}
                        className="row-action-btn"
                        style={{ ...iconBtn, color: '#8B5CF6', borderColor: '#8B5CF630', opacity: isUploading ? 0.5 : 1 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF610'; e.currentTarget.style.borderColor = '#8B5CF6'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#8B5CF630'; }}>
                        <Upload size={14} />
                      </button>
                      <span className="row-action-tooltip">{isUploading ? 'Procesando...' : 'Subir factura'}</span>
                    </div>
                  )}
                  {tel && (
                    <div className="row-action-wrap">
                      <a href={`tel:${tel}`} onClick={e => e.stopPropagation()}
                        style={{ ...iconBtn, color: 'var(--color-cta, #2563EB)', textDecoration: 'none' }}>
                        <Phone size={14} />
                      </a>
                      <span className="row-action-tooltip">Llamar</span>
                    </div>
                  )}
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); openEdit(ot); }}
                      className="row-action-btn" style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                      <Eye size={14} />
                    </button>
                    <span className="row-action-tooltip">Ver detalles</span>
                  </div>
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); remove(ot); }}
                      className="row-action-btn"
                      style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                      <Trash2 size={14} />
                    </button>
                    <span className="row-action-tooltip">Eliminar</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin órdenes de trabajo</div>}
        </div>
      ) : (
        /* ─── MOBILE CARDS ─── */
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{ot.titulo}</div>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${pri.color}15`, color: pri.color, flexShrink: 0, marginLeft: 6 }}>{pri.label}</span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>{propDir(ot.propiedad_id)}</div>
                {/* Stepper mobile */}
                <div style={{ marginBottom: 8 }}><StatusStepper estado={ot.estado} /></div>
                {(hasBudget || hasInvoice) && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    {hasBudget && <span style={{ color: 'var(--color-text-secondary)' }}>Presup: ${ot.monto_presupuesto!.toLocaleString('es-AR')}</span>}
                    {hasInvoice && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: overBudget ? '#F59E0B' : '#10B981' }}>Fact: ${ot.monto_final!.toLocaleString('es-AR')}{overBudget ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}</span>}
                  </div>
                )}
                {ot.comprobante_url && (
                  <div style={{ marginBottom: 8 }}>
                    {isImageUrl(ot.comprobante_url) ? (
                      <a href={ot.comprobante_url} target="_blank" rel="noopener noreferrer"><img src={ot.comprobante_url} alt="Comprobante" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }} /></a>
                    ) : (
                      <a href={ot.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, background: 'var(--color-bg-surface-2)', color: '#8B5CF6', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', border: '1px solid var(--color-border-subtle)' }}><FileText size={14} /> Ver factura</a>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ot.estado !== 'completado' && ot.estado !== 'facturado' && ot.estado !== 'liquidado' && ot.estado !== 'cancelado' && (
                    <button onClick={() => avanzarEstado(ot)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${est.color}`, background: 'transparent', color: est.color, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      {ot.estado === 'reportado' ? 'Asignar' : ot.estado === 'asignado' ? 'Iniciar' : 'Completar'}
                    </button>
                  )}
                  {tel && <a href={`tel:${tel}`} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-cta, #2563EB)', fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={12} /> Llamar</a>}
                  {ot.estado === 'completado' && (
                    <button onClick={() => handleSubirFactura(ot)} disabled={isUploading}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #8B5CF6', background: isUploading ? '#8B5CF615' : 'transparent', color: '#8B5CF6', fontSize: '0.75rem', fontWeight: 600, cursor: isUploading ? 'wait' : 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 3, opacity: isUploading ? 0.7 : 1 }}>
                      <Upload size={12} /> {isUploading ? 'Procesando...' : 'Subir factura'}
                    </button>
                  )}
                  <button onClick={() => openEdit(ot)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Ver detalle</button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin órdenes de trabajo</div>}
        </div>
      )}
      </>)}

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = [{ label: 'Problema' }, { label: 'Asignación' }, { label: 'Detalles' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!(form.titulo.trim() && form.propiedad_id) : true;
        const isLast = wizardStep === totalSteps - 1;

        return (
          <div className="wizard-overlay" onClick={() => closeWizard()}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>{editing ? 'Editar orden' : 'Nueva orden de trabajo'}</h3>
              <button className="wizard-close" onClick={() => closeWizard()}><X size={18} /></button>
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
              {/* Step 0: Problema */}
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <label className="form-label">Título del problema *</label>
                  <input className="form-input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Pérdida de agua en baño" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Propiedad *</label>
                  <CustomSelect
                    value={form.propiedad_id}
                    onChange={v => setForm(f => ({ ...f, propiedad_id: v }))}
                    placeholder="Seleccionar propiedad..."
                    options={propiedades.map(p => ({ value: p.id, label: p.direccion }))}
                  />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Descripción</label>
                  <textarea className="form-input" rows={3} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Detalle del problema..." />
                </div>
              </>)}

              {/* Step 1: Asignación */}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Prioridad</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {(['baja', 'media', 'alta', 'urgente'] as const).map(p => {
                      const cfg = PRIORIDAD_CFG[p];
                      return (
                        <button key={p} className={`wizard-pill${form.prioridad === p ? ' selected' : ''}`}
                          onClick={() => setForm(f => ({ ...f, prioridad: p }))}
                          style={form.prioridad === p ? { background: cfg.color, borderColor: cfg.color } : {}}>
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Proveedor (opcional)</label>
                  <CustomSelect
                    value={form.proveedor_id}
                    onChange={v => setForm(f => ({ ...f, proveedor_id: v }))}
                    placeholder="Buscar proveedor..."
                    emptyLabel="Sin asignar"
                    options={proveedores.map(p => ({ value: p.id, label: p.nombre, group: p.rubro, sub: p.rubro }))}
                  />
                </div>
              </>)}

              {/* Step 2: Detalles */}
              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <label className="form-label">Monto presupuesto</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.monto_presupuesto} onChange={e => setForm(f => ({ ...f, monto_presupuesto: e.target.value }))} placeholder="Ej: 45000" />
                </div>
                {editing && editing.comprobante_url && (
                  <div className="wizard-field">
                    <div className="wizard-section-title" style={{ border: 'none' }}>Factura adjunta</div>
                    {isImageUrl(editing.comprobante_url) ? (
                      <a href={editing.comprobante_url} target="_blank" rel="noopener noreferrer"><img src={editing.comprobante_url} alt="Comprobante" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--color-border-subtle)' }} /></a>
                    ) : (
                      <a href={editing.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'var(--color-bg-surface-2)', color: '#8B5CF6', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'none', border: '1px solid var(--color-border-subtle)' }}><FileText size={16} /> Ver factura</a>
                    )}
                  </div>
                )}
                {editing && editing.monto_final != null && (
                  <div className="wizard-field">
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.8125rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Facturado:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: editing.monto_presupuesto && editing.monto_final > editing.monto_presupuesto ? '#F59E0B' : '#10B981' }}>
                        ${editing.monto_final.toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                )}
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing && <button className="wizard-btn-danger" onClick={() => remove(editing)}>Eliminar</button>}
              </div>
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={save}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {editing ? 'Guardar' : 'Crear orden'}</span>
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
