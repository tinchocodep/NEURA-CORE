import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { Plus, Search, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';
import jsPDF from 'jspdf';
import type { CartaOferta, CartaOfertaItem, EstadoCartaOferta, ObraFicha, Contratista } from './types';
import { ESTADO_CARTA_COLOR, ESTADO_CARTA_LABEL } from './types';

const EMPTY: Partial<CartaOferta> = {
  obra_id: '', contratista_id: '', fecha: new Date().toISOString().slice(0, 10),
  alcance: '', plazo_ejecucion: '', condiciones_pago: '', penalidades: '',
  observaciones: '', estado: 'borrador', monto_total: 0,
};

const EMPTY_ITEM: Partial<CartaOfertaItem> = { descripcion: '', unidad: '', cantidad: 0, precio_unitario: 0, subtotal: 0 };

export default function ObrasCartasOferta() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<CartaOferta[]>([]);
  const [obras, setObras] = useState<Pick<ObraFicha, 'id' | 'nombre'>[]>([]);
  const [contratistas, setContratistas] = useState<Pick<Contratista, 'id' | 'razon_social'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<CartaOferta>>(EMPTY);
  const [ofertaItems, setOfertaItems] = useState<Partial<CartaOfertaItem>[]>([{ ...EMPTY_ITEM }]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  const closeWizard = () => { setShowModal(false); setEditing(EMPTY); setOfertaItems([{ ...EMPTY_ITEM }]); setWizardStep(0); };

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [cartasRes, obrasRes, contRes] = await Promise.all([
      supabase.from('obras_cartas_oferta').select('*, obra:obras_fichas(id, nombre), contratista:obras_contratistas(id, razon_social)').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
      supabase.from('obras_fichas').select('id, nombre').eq('tenant_id', tenant!.id).order('nombre'),
      supabase.from('obras_contratistas').select('id, razon_social').eq('tenant_id', tenant!.id).eq('estado', 'activo').order('razon_social'),
    ]);
    setItems(cartasRes.data || []);
    setObras((obrasRes.data || []) as any);
    setContratistas((contRes.data || []) as any);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.obra_id || !editing.contratista_id) return;
    const total = ofertaItems.reduce((s, i) => s + (i.subtotal || 0), 0);

    const payload = {
      obra_id: editing.obra_id, contratista_id: editing.contratista_id,
      fecha: editing.fecha || new Date().toISOString().slice(0, 10),
      alcance: editing.alcance || null, plazo_ejecucion: editing.plazo_ejecucion || null,
      condiciones_pago: editing.condiciones_pago || null, penalidades: editing.penalidades || null,
      observaciones: editing.observaciones || null, estado: editing.estado || 'borrador',
      monto_total: total, updated_at: new Date().toISOString(),
    };

    let cartaId = editing.id;
    if (cartaId) {
      await supabase.from('obras_cartas_oferta').update(payload).eq('id', cartaId);
      await supabase.from('obras_carta_oferta_items').delete().eq('carta_oferta_id', cartaId);
    } else {
      // Get next numero
      const { data: maxRes } = await supabase.from('obras_cartas_oferta').select('numero').eq('tenant_id', tenant!.id).order('numero', { ascending: false }).limit(1);
      const numero = (maxRes && maxRes.length > 0) ? maxRes[0].numero + 1 : 1;
      const { data } = await supabase.from('obras_cartas_oferta').insert({ ...payload, tenant_id: tenant!.id, numero, version: 1 }).select().single();
      cartaId = data?.id;
    }

    if (cartaId) {
      const validItems = ofertaItems.filter(i => i.descripcion?.trim());
      if (validItems.length > 0) {
        await supabase.from('obras_carta_oferta_items').insert(
          validItems.map((i, idx) => ({
            tenant_id: tenant!.id, carta_oferta_id: cartaId,
            descripcion: i.descripcion, unidad: i.unidad || null,
            cantidad: i.cantidad || 0, precio_unitario: i.precio_unitario || 0,
            subtotal: i.subtotal || 0, orden: idx,
          }))
        );
      }
    }

    closeWizard();
    loadData();
  };

  const handleEdit = async (c: CartaOferta) => {
    const { data: its } = await supabase.from('obras_carta_oferta_items').select('*').eq('carta_oferta_id', c.id).order('orden');
    setEditing(c);
    setOfertaItems(its && its.length > 0 ? its : [{ ...EMPTY_ITEM }]);
    setWizardStep(0);
    setShowModal(true);
  };

  const handleDelete = (c: CartaOferta) => {
    requestDelete(`¿Eliminar carta oferta #${c.numero}?`, async () => {
      await supabase.from('obras_carta_oferta_items').delete().eq('carta_oferta_id', c.id);
      await supabase.from('obras_cartas_oferta').delete().eq('id', c.id);
      setItems(prev => prev.filter(e => e.id !== c.id));
    });
  };

  const generatePDF = async (carta: CartaOferta) => {
    const { data: its } = await supabase.from('obras_carta_oferta_items').select('*').eq('carta_oferta_id', carta.id).order('orden');
    const cartaItems = its || [];

    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header with tenant branding
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 33, 33);
    doc.text(tenant?.name || 'Empresa', 20, y);
    y += 8;

    if ((tenant as any)?.razon_social) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text((tenant as any).razon_social, 20, y);
      y += 5;
    }
    if ((tenant as any)?.cuit) {
      doc.text(`CUIT: ${(tenant as any).cuit}`, 20, y);
      y += 5;
    }
    if ((tenant as any)?.direccion) {
      doc.text((tenant as any).direccion, 20, y);
      y += 5;
    }

    // Line separator
    y += 3;
    doc.setDrawColor(200, 200, 200);
    doc.line(20, y, w - 20, y);
    y += 10;

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 33, 33);
    doc.text(`CARTA OFERTA N° ${carta.numero}`, 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Fecha: ${carta.fecha}`, 20, y);
    y += 5;
    doc.text(`Obra: ${(carta as any).obra?.nombre || ''}`, 20, y);
    y += 5;
    doc.text(`Contratista: ${(carta as any).contratista?.razon_social || ''}`, 20, y);
    y += 10;

    // Alcance
    if (carta.alcance) {
      doc.setFont('helvetica', 'bold');
      doc.text('Alcance del trabajo:', 20, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(carta.alcance, w - 40);
      doc.text(lines, 20, y);
      y += lines.length * 4.5 + 5;
    }

    // Items table
    if (cartaItems.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle:', 20, y);
      y += 6;

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(20, y - 3, w - 40, 7, 'F');
      doc.setFontSize(8);
      doc.text('Descripción', 22, y + 1);
      doc.text('Unidad', 100, y + 1);
      doc.text('Cant.', 120, y + 1, { align: 'right' });
      doc.text('P.Unit.', 145, y + 1, { align: 'right' });
      doc.text('Subtotal', w - 22, y + 1, { align: 'right' });
      y += 7;

      doc.setFont('helvetica', 'normal');
      cartaItems.forEach(item => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(String(item.descripcion || '').substring(0, 40), 22, y);
        doc.text(item.unidad || '', 100, y);
        doc.text(String(item.cantidad || 0), 120, y, { align: 'right' });
        doc.text(`$ ${(item.precio_unitario || 0).toLocaleString('es-AR')}`, 145, y, { align: 'right' });
        doc.text(`$ ${(item.subtotal || 0).toLocaleString('es-AR')}`, w - 22, y, { align: 'right' });
        y += 5;
      });

      // Total
      y += 2;
      doc.line(120, y, w - 20, y);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('TOTAL:', 130, y);
      doc.text(`$ ${carta.monto_total.toLocaleString('es-AR')}`, w - 22, y, { align: 'right' });
      y += 10;
    }

    // Conditions
    doc.setFontSize(9);
    if (carta.plazo_ejecucion) {
      doc.setFont('helvetica', 'bold');
      doc.text('Plazo de ejecución:', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(carta.plazo_ejecucion, 70, y);
      y += 6;
    }
    if (carta.condiciones_pago) {
      doc.setFont('helvetica', 'bold');
      doc.text('Condiciones de pago:', 20, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(carta.condiciones_pago, w - 40);
      doc.text(lines, 20, y);
      y += lines.length * 4.5 + 3;
    }
    if (carta.penalidades) {
      doc.setFont('helvetica', 'bold');
      doc.text('Penalidades:', 20, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(carta.penalidades, w - 40);
      doc.text(lines, 20, y);
      y += lines.length * 4.5 + 3;
    }
    if (carta.observaciones) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones:', 20, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(carta.observaciones, w - 40);
      doc.text(lines, 20, y);
      y += lines.length * 4.5 + 3;
    }

    // Footer signature lines
    y = Math.max(y + 20, 250);
    if (y > 270) { doc.addPage(); y = 200; }
    doc.line(20, y, 80, y);
    doc.line(w - 80, y, w - 20, y);
    y += 5;
    doc.setFontSize(8);
    doc.text('Firma Empresa', 50, y, { align: 'center' });
    doc.text('Firma Contratista', w - 50, y, { align: 'center' });

    doc.save(`carta-oferta-${carta.numero}.pdf`);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setOfertaItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'cantidad' || field === 'precio_unitario') {
        next[idx].subtotal = (next[idx].cantidad || 0) * (next[idx].precio_unitario || 0);
      }
      return next;
    });
  };

  const filtered = items.filter(c => {
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (search) {
      const s = search.toLowerCase();
      return ((c as any).obra?.nombre || '').toLowerCase().includes(s) || ((c as any).contratista?.razon_social || '').toLowerCase().includes(s);
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
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Cartas Oferta</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Ofertas a contratistas con generación de PDF</p>
        </div>
        <button onClick={() => { setEditing(EMPTY); setShowModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' }}>
          <Plus size={16} /> Nueva Carta
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input placeholder="Buscar obra o contratista..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8125rem' }} />
        </div>
        <StyledSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos</option>
          {(Object.keys(ESTADO_CARTA_LABEL) as EstadoCartaOferta[]).map(e => <option key={e} value={e}>{ESTADO_CARTA_LABEL[e]}</option>)}
        </StyledSelect>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['#', 'Obra', 'Contratista', 'Fecha', 'Monto', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Monto' ? 'right' : h === 'Acciones' ? 'right' : 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No hay cartas oferta</td></tr>
            ) : filtered.map(c => {
              const color = ESTADO_CARTA_COLOR[c.estado];
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>#{c.numero}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{(c as any).obra?.nombre || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{(c as any).contratista?.razon_social || '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{c.fecha}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>$ {fmt(c.monto_total)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>{ESTADO_CARTA_LABEL[c.estado]}</span>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button onClick={() => generatePDF(c)} title="Descargar PDF" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-accent)' }}><Download size={14} /></button>
                    <button onClick={() => handleEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Wizard */}
      {showModal && (() => {
        const STEPS = [{ label: 'Partes' }, { label: 'Ítems' }, { label: 'Condiciones' }, { label: 'Notas' }];
        const canNext = wizardStep === 0 ? !!(editing.obra_id && editing.contratista_id) : true;
        const isLast = wizardStep === STEPS.length - 1;
        const total = ofertaItems.reduce((s, i) => s + (i.subtotal || 0), 0);

        return (
          <div className="wizard-overlay" onClick={closeWizard}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="wizard-header">
              <h3>{editing.id ? 'Editar Carta Oferta' : 'Nueva Carta Oferta'}</h3>
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
                  <label className="form-label">Contratista *</label>
                  <StyledSelect value={editing.contratista_id || ''} onChange={e => setEditing(p => ({ ...p, contratista_id: e.target.value }))} style={{ width: '100%' }}>
                    <option value="">Seleccionar contratista...</option>
                    {contratistas.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                  </StyledSelect>
                </div>
                <div className="wizard-row">
                  <div className="wizard-field">
                    <label className="form-label">Fecha</label>
                    <input className="form-input" type="date" value={editing.fecha || ''} onChange={e => setEditing(p => ({ ...p, fecha: e.target.value }))} />
                  </div>
                  <div className="wizard-field">
                    <div className="wizard-section-title">Estado</div>
                    <div className="wizard-pills" style={{ marginTop: 8 }}>
                      {(Object.keys(ESTADO_CARTA_LABEL) as EstadoCartaOferta[]).map(e => (
                        <button key={e} className={`wizard-pill${editing.estado === e ? ' selected' : ''}`}
                          onClick={() => setEditing(p => ({ ...p, estado: e }))}>{ESTADO_CARTA_LABEL[e]}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Alcance del trabajo</label>
                  <textarea className="form-input" rows={3} value={editing.alcance || ''} onChange={e => setEditing(p => ({ ...p, alcance: e.target.value }))} placeholder="Descripción del trabajo a realizar..." style={{ resize: 'vertical' }} />
                </div>
              </>)}

              {wizardStep === 1 && (<>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ofertaItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 32px', gap: 8, alignItems: 'end' }}>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Descripción</label>}
                        <input className="form-input" value={item.descripcion || ''} onChange={e => updateItem(idx, 'descripcion', e.target.value)} placeholder="Ítem" />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Cant.</label>}
                        <input className="form-input" type="number" value={item.cantidad || ''} onChange={e => updateItem(idx, 'cantidad', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Unidad</label>}
                        <input className="form-input" value={item.unidad || ''} onChange={e => updateItem(idx, 'unidad', e.target.value)} placeholder="gl, m²" />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">P. Unit.</label>}
                        <input className="form-input" type="number" value={item.precio_unitario || ''} onChange={e => updateItem(idx, 'precio_unitario', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Subtotal</label>}
                        <input className="form-input" value={fmt(item.subtotal || 0)} readOnly style={{ background: 'var(--color-bg-surface-2)', fontWeight: 600 }} />
                      </div>
                      <button onClick={() => setOfertaItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, marginBottom: 2 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setOfertaItems(prev => [...prev, { ...EMPTY_ITEM }])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--color-border)', background: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 600, marginTop: 8 }}>
                  <Plus size={14} /> Agregar ítem
                </button>
                <div style={{ textAlign: 'right', marginTop: 12, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                  Total: $ {fmt(total)}
                </div>
              </>)}

              {wizardStep === 2 && (<>
                <div className="wizard-field">
                  <label className="form-label">Plazo de ejecución</label>
                  <input className="form-input" value={editing.plazo_ejecucion || ''} onChange={e => setEditing(p => ({ ...p, plazo_ejecucion: e.target.value }))} placeholder="Ej: 30 días corridos" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Condiciones de pago</label>
                  <textarea className="form-input" rows={3} value={editing.condiciones_pago || ''} onChange={e => setEditing(p => ({ ...p, condiciones_pago: e.target.value }))} placeholder="Ej: 50% anticipo, 50% contra certificado..." style={{ resize: 'vertical' }} />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Penalidades</label>
                  <textarea className="form-input" rows={2} value={editing.penalidades || ''} onChange={e => setEditing(p => ({ ...p, penalidades: e.target.value }))} placeholder="Penalidades por incumplimiento..." style={{ resize: 'vertical' }} />
                </div>
              </>)}

              {wizardStep === 3 && (<>
                <div className="wizard-field">
                  <label className="form-label">Observaciones</label>
                  <textarea className="form-input" rows={5} value={editing.observaciones || ''} onChange={e => setEditing(p => ({ ...p, observaciones: e.target.value }))} placeholder="Notas adicionales..." style={{ resize: 'vertical' }} />
                </div>
              </>)}
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                {editing.id && <button className="wizard-btn-danger" onClick={() => { handleDelete(editing as CartaOferta); closeWizard(); }}>Eliminar</button>}
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
