import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Check, ChevronRight, ChevronLeft, Eye, Send, Download, Receipt, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import CustomSelect from '../../shared/components/CustomSelect';
import jsPDF from 'jspdf';

interface Comprobante {
  id: string; tipo: string; fecha: string; numero_comprobante: string | null;
  tipo_comprobante: string | null; monto_original: number; monto_ars: number;
  moneda: string; estado: string; descripcion: string | null; pdf_url: string | null;
  cliente_id: string | null; source: string | null;
  lineas: LineaDetalle[] | null;
  cliente: { razon_social: string } | null;
}
interface Contrato {
  id: string; monto_mensual: number; moneda: string;
  inquilino_id: string; propietario_id: string;
  propiedad: { direccion: string } | null;
  inquilino: { razon_social: string } | null;
}
interface LineaDetalle { descripcion: string; cantidad: number; precio_unitario: number; iva_porcentaje: number; subtotal: number; iva: number; total: number; }

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#F59E0B', clasificado: '#3B82F6', aprobado: '#8B5CF6',
  inyectado: '#10B981', pagado: '#10B981', error: '#EF4444', rechazado: '#6B7280',
};
const TIPOS_COMP = ['Factura A', 'Factura B', 'Factura C', 'Nota de Crédito A', 'Nota de Crédito B', 'Recibo X'];

export default function FacturarMobile() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<Comprobante[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [filterEstado, setFilterEstado] = useState('');
  const [search, setSearch] = useState('');

  // Form
  const [selContrato, setSelContrato] = useState('');
  const [tipoComp, setTipoComp] = useState('Factura A');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [lineas, setLineas] = useState<{ descripcion: string; cantidad: number; precio_unitario: number; iva_porcentaje: number }[]>([]);
  const [observaciones, setObs] = useState('');

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [cRes, ctRes] = await Promise.all([
      supabase.from('contable_comprobantes').select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_original, monto_ars, moneda, estado, descripcion, pdf_url, cliente_id, source, lineas, cliente:contable_clientes!cliente_id(razon_social)')
        .eq('tenant_id', tenant!.id).eq('tipo', 'venta').order('fecha', { ascending: false }).limit(50),
      supabase.from('inmobiliaria_contratos')
        .select('id, monto_mensual, moneda, inquilino_id, propietario_id, propiedad:inmobiliaria_propiedades(direccion), inquilino:contable_clientes!inquilino_id(razon_social)')
        .eq('tenant_id', tenant!.id).eq('estado', 'vigente'),
    ]);
    if (cRes.data) setItems(cRes.data as any);
    if (ctRes.data) setContratos(ctRes.data as any);
    setLoading(false);
  };

  const openNew = () => {
    setSelContrato(''); setTipoComp('Factura A'); setFecha(new Date().toISOString().slice(0, 10));
    setLineas([{ descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
    setObs(''); setWizardStep(0); setShowModal(true);
  };

  const onSelectContrato = (id: string) => {
    setSelContrato(id);
    const c = contratos.find(ct => ct.id === id);
    if (c) {
      const dir = (c.propiedad as any)?.direccion || '';
      setLineas([{ descripcion: `Alquiler ${dir} - ${new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`, cantidad: 1, precio_unitario: c.monto_mensual, iva_porcentaje: 21 }]);
    }
  };

  const addLinea = () => setLineas(l => [...l, { descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
  const removeLinea = (i: number) => setLineas(l => l.filter((_, idx) => idx !== i));
  const updateLinea = (i: number, field: string, val: string | number) => {
    setLineas(l => l.map((ll, idx) => idx === i ? { ...ll, [field]: val } : ll));
  };

  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
  const totalIva = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario * l.iva_porcentaje / 100, 0);
  const totalFinal = subtotal + totalIva;

  const save = async () => {
    if (!selContrato || lineas.length === 0) return;
    const c = contratos.find(ct => ct.id === selContrato);
    const lineasPayload = lineas.map(l => ({
      descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario,
      iva_porcentaje: l.iva_porcentaje, subtotal: l.cantidad * l.precio_unitario,
      iva: l.cantidad * l.precio_unitario * l.iva_porcentaje / 100,
      total: l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100),
    }));
    const { data, error } = await supabase.from('contable_comprobantes').insert({
      tenant_id: tenant!.id,
      tipo: 'venta',
      fecha,
      tipo_comprobante: tipoComp,
      numero_comprobante: 'PENDIENTE-ARCA',
      cliente_id: c?.inquilino_id || null,
      moneda: c?.moneda || 'ARS',
      monto_original: totalFinal,
      monto_ars: totalFinal,
      tipo_cambio: 1,
      lineas: lineasPayload,
      descripcion: lineas.map(l => l.descripcion).join(', '),
      observaciones: observaciones || null,
      estado: 'pendiente',
      clasificacion_score: 100,
      clasificado_por: 'manual',
      source: 'manual',
    }).select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_original, monto_ars, moneda, estado, descripcion, pdf_url, cliente_id, source, lineas').single();
    if (!error && data) {
      // Re-fetch to get client join
      await loadData();
    }
    setShowModal(false);
  };

  const remove = async (comp: Comprobante) => {
    if (!confirm('Eliminar este comprobante?')) return;
    await supabase.from('contable_comprobantes').delete().eq('id', comp.id);
    setItems(prev => prev.filter(c => c.id !== comp.id));
  };

  const generatePdf = (comp: Comprobante) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(comp.tipo_comprobante || 'Comprobante', w / 2, 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${comp.fecha}`, w - 20, 25, { align: 'right' });
    if (comp.numero_comprobante) doc.text(`N°: ${comp.numero_comprobante}`, w - 20, 32, { align: 'right' });
    doc.text(`Cliente: ${comp.cliente?.razon_social || '—'}`, 20, 45);
    doc.text(`Total: $${comp.monto_ars.toLocaleString('es-AR')}`, 20, 52);
    if (comp.descripcion) doc.text(comp.descripcion, 20, 62, { maxWidth: w - 40 });
    doc.save(`comprobante-${comp.fecha}.pdf`);
  };

  // KPIs
  const pendientes = items.filter(c => c.estado === 'pendiente').length;
  const aprobados = items.filter(c => c.estado === 'aprobado' || c.estado === 'inyectado').length;
  const totalMes = items.filter(c => c.fecha.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, c) => s + c.monto_ars, 0);
  const fmtMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toLocaleString('es-AR')}`;

  const filtered = items.filter(c => {
    if (filterEstado && c.estado !== filterEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.descripcion || '').toLowerCase().includes(q) && !(c.cliente?.razon_social || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando comprobantes...</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Comprobantes</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar comprobante..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="inyectado">Enviado ARCA</option>
          <option value="pagado">Pagado</option>
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Pendientes', value: String(pendientes), color: pendientes > 0 ? '#F59E0B' : 'var(--color-text-primary)', filter: 'pendiente' },
          { label: 'Aprobados', value: String(aprobados), color: '#8B5CF6', filter: 'aprobado' },
          { label: 'Facturado mes', value: fmtMoney(totalMes), color: '#10B981', filter: '', mono: true },
        ].map(kpi => (
          <div key={kpi.label} onClick={() => setFilterEstado(filterEstado === kpi.filter ? '' : kpi.filter)}
            style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: `1px solid ${filterEstado === kpi.filter && kpi.filter ? kpi.color + '40' : 'var(--color-border-subtle)'}`, textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: kpi.color, fontFamily: kpi.mono ? 'var(--font-mono)' : undefined }}>{kpi.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {[{ key: '', label: 'Todos' }, { key: 'pendiente', label: 'Pendiente' }, { key: 'aprobado', label: 'Aprobado' }, { key: 'inyectado', label: 'Enviado ARCA' }, { key: 'pagado', label: 'Pagado' }].map(f => (
          <button key={f.key} onClick={() => setFilterEstado(filterEstado === f.key ? '' : f.key)}
            style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterEstado === f.key ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: filterEstado === f.key ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: filterEstado === f.key ? '#fff' : 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ─── GRID TABLE ─── */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 70px 130px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
          <span>Comprobante</span><span>Tipo</span><span>Monto</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {filtered.map(comp => (
          <div key={comp.id}
            style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 70px 130px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            {/* Descripción + cliente + fecha */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {comp.descripcion || comp.tipo_comprobante || 'Comprobante'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{comp.cliente?.razon_social || '—'}</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-faint)' }}>{comp.fecha}</span>
                {comp.numero_comprobante && !comp.numero_comprobante.startsWith('PENDIENTE') && (
                  <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#10B98115', color: '#10B981' }}>N° {comp.numero_comprobante}</span>
                )}
                {(!comp.numero_comprobante || comp.numero_comprobante.startsWith('PENDIENTE')) && (
                  <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#F59E0B15', color: '#F59E0B' }}>Sin N°</span>
                )}
              </div>
            </div>
            {/* Tipo */}
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{comp.tipo_comprobante || '—'}</div>
            {/* Monto */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              ${comp.monto_ars.toLocaleString('es-AR')}
            </div>
            {/* Estado */}
            <div>
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${ESTADO_COLOR[comp.estado] || '#6B7280'}15`, color: ESTADO_COLOR[comp.estado] || '#6B7280', textTransform: 'capitalize' }}>
                {comp.estado === 'inyectado' ? 'ARCA' : comp.estado}
              </span>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              {/* Enviar a ARCA (solo pendiente/aprobado sin número) */}
              {(!comp.numero_comprobante || comp.numero_comprobante.startsWith('PENDIENTE')) && (comp.estado === 'pendiente' || comp.estado === 'aprobado') && (
                <div className="row-action-wrap">
                  <button onClick={e => { e.stopPropagation(); alert('Integración ARCA: se enviará a la API para generar el número de comprobante.'); }}
                    style={{ ...iconBtn, color: '#8B5CF6', borderColor: '#8B5CF630' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#8B5CF610'; e.currentTarget.style.borderColor = '#8B5CF6'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#8B5CF630'; }}>
                    <Send size={14} />
                  </button>
                  <span className="row-action-tooltip">Enviar a ARCA</span>
                </div>
              )}
              {/* Download PDF */}
              <div className="row-action-wrap">
                <button onClick={e => { e.stopPropagation(); if (comp.pdf_url) window.open(comp.pdf_url, '_blank'); else generatePdf(comp); }}
                  style={{ ...iconBtn, color: '#3B82F6', borderColor: '#3B82F630' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#3B82F610'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#3B82F630'; }}>
                  <Download size={14} />
                </button>
                <span className="row-action-tooltip">Descargar PDF</span>
              </div>
              {/* View */}
              <div className="row-action-wrap">
                <button onClick={e => { e.stopPropagation(); /* could open detail view */ }}
                  style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                  <Eye size={14} />
                </button>
                <span className="row-action-tooltip">Ver detalles</span>
              </div>
              {/* Delete */}
              <div className="row-action-wrap">
                <button onClick={e => { e.stopPropagation(); remove(comp); }}
                  style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                  <Trash2 size={14} />
                </button>
                <span className="row-action-tooltip">Eliminar</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin comprobantes</div>}
      </div>

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = [{ label: 'Contrato' }, { label: 'Detalle' }, { label: 'Resumen' }];
        const totalSteps = STEPS.length;
        const canNext = wizardStep === 0 ? !!selContrato : true;
        const isLast = wizardStep === totalSteps - 1;
        const selCt = contratos.find(ct => ct.id === selContrato);

        return (
          <div className="wizard-overlay" onClick={() => setShowModal(false)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>Nuevo comprobante</h3>
              <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
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
              {/* Step 0: Contrato + Tipo */}
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <label className="form-label">Contrato (propiedad) *</label>
                  <CustomSelect
                    value={selContrato}
                    onChange={v => onSelectContrato(v)}
                    placeholder="Seleccionar contrato..."
                    options={contratos.map(c => ({
                      value: c.id,
                      label: (c.propiedad as any)?.direccion || '—',
                      sub: (c.inquilino as any)?.razon_social || '',
                    }))}
                  />
                  {selCt && (
                    <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Inquilino</span>
                        <span style={{ fontWeight: 600 }}>{(selCt.inquilino as any)?.razon_social || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Monto mensual</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${selCt.monto_mensual.toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="wizard-field">
                  <div className="wizard-section-title">Tipo de comprobante</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    {TIPOS_COMP.map(t => (
                      <button key={t} className={`wizard-pill${tipoComp === t ? ' selected' : ''}`}
                        onClick={() => setTipoComp(t)}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Fecha</label>
                  <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
                </div>
              </>)}

              {/* Step 1: Líneas de detalle */}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="wizard-section-title" style={{ border: 'none' }}>Líneas</div>
                    <button onClick={addLinea} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 99, border: '1.5px solid var(--color-cta, #2563EB)', background: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', fontFamily: 'var(--font-sans)' }}>
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                  {lineas.map((l, i) => (
                    <div key={i} style={{ padding: 12, borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', marginBottom: 8 }}>
                      <div className="wizard-field" style={{ marginBottom: 8 }}>
                        <input className="form-input" placeholder="Descripción" value={l.descripcion} onChange={e => updateLinea(i, 'descripcion', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div className="wizard-field" style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: '0.6875rem' }}>Cant.</label>
                          <input type="number" className="form-input" value={l.cantidad} onChange={e => updateLinea(i, 'cantidad', Number(e.target.value))} />
                        </div>
                        <div className="wizard-field" style={{ flex: 2 }}>
                          <label className="form-label" style={{ fontSize: '0.6875rem' }}>Precio unit.</label>
                          <input type="number" className="form-input" value={l.precio_unitario || ''} onChange={e => updateLinea(i, 'precio_unitario', Number(e.target.value))} />
                        </div>
                        <div className="wizard-field" style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: '0.6875rem' }}>IVA %</label>
                          <div className="wizard-pills" style={{ gap: 4 }}>
                            {[21, 10.5, 0].map(v => (
                              <button key={v} className={`wizard-pill${l.iva_porcentaje === v ? ' selected' : ''}`}
                                onClick={() => updateLinea(i, 'iva_porcentaje', v)}
                                style={{ padding: '4px 8px', fontSize: '0.6875rem' }}>{v}%</button>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => removeLinea(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4, alignSelf: 'center' }}><Trash2 size={14} /></button>
                      </div>
                      <div style={{ textAlign: 'right', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600 }}>
                        Subtotal: ${(l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="wizard-field">
                  <label className="form-label">Observaciones</label>
                  <textarea className="form-input" rows={2} value={observaciones} onChange={e => setObs(e.target.value)} placeholder="Notas internas..." />
                </div>
              </>)}

              {/* Step 2: Resumen */}
              {wizardStep === 2 && (<>
                <div style={{ padding: '1rem', borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Tipo</span>
                    <span style={{ fontWeight: 600 }}>{tipoComp}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Propiedad</span>
                    <span style={{ fontWeight: 600 }}>{selCt ? (selCt.propiedad as any)?.direccion : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Inquilino</span>
                    <span style={{ fontWeight: 600 }}>{selCt ? (selCt.inquilino as any)?.razon_social : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Fecha</span>
                    <span style={{ fontWeight: 600 }}>{fecha}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>N° Comprobante</span>
                    <span style={{ fontWeight: 600, color: '#F59E0B' }}>Se genera al enviar a ARCA</span>
                  </div>
                </div>
                <div style={{ padding: '1rem', borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>IVA</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${totalIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ borderTop: '2px solid var(--color-border-subtle)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#10B981' }}>${totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left" />
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={save} disabled={!selContrato || lineas.length === 0}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Receipt size={16} /> Crear comprobante</span>
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
    </div>
  );
}
