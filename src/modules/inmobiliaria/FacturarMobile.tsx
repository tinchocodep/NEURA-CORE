import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, CheckCircle, ChevronLeft, FileText, Receipt, ClipboardList, Eye, EyeOff, Download, Send, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import jsPDF from 'jspdf';
import ComprobanteForm from '../contable/Comprobantes/ComprobanteForm';

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}

interface Cliente { id: string; razon_social: string; cuit: string | null; }
interface LineaDetalle { id: string; descripcion: string; cantidad: number; precio_unitario: number; iva_porcentaje: number; }

const IVA_OPTIONS = [{ value: 21, label: '21%' }, { value: 10.5, label: '10.5%' }, { value: 27, label: '27%' }, { value: 0, label: 'Exento' }];

function newId() { return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2); }

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);

type Mode = 'select' | 'factura' | 'remito' | 'recibo';

export default function FacturarMobile() {
    const isMobile = useIsMobile();
    const { tenant } = useTenant();

    // Desktop: use the full ComprobanteForm with 2-column preview, forced to venta
    if (!isMobile) return <ComprobanteForm forceVenta />;

    const [mode, setMode] = useState<Mode>('select');

    // Shared
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [clienteId, setClienteId] = useState('');
    const [clienteSearch, setClienteSearch] = useState('');
    const [showClienteDrop, setShowClienteDrop] = useState(false);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [descripcion, setDescripcion] = useState('');
    const [observaciones, setObs] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // Factura
    const [tipoComp, setTipoComp] = useState('Factura A');
    const [lineas, setLineas] = useState<LineaDetalle[]>([
        { id: newId(), descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 },
    ]);

    // Remito
    const [remDireccion, setRemDireccion] = useState('');
    const [remItems, setRemItems] = useState([{ id: newId(), descripcion: '', cantidad: 1, unidad: 'UN' }]);

    // Recibo
    const [recFormaPago, setRecFormaPago] = useState('Efectivo');
    const [recItems, setRecItems] = useState([{ id: newId(), concepto: '', monto: 0 }]);

    // PDF / Email
    const [emailTo, setEmailTo] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (!tenant) return;
        supabase.from('contable_clientes').select('id, razon_social, cuit').eq('tenant_id', tenant.id).eq('activo', true).order('razon_social')
            .then(({ data }) => setClientes((data || []) as Cliente[]));
    }, [tenant]);

    const selectedCliente = clientes.find(c => c.id === clienteId);
    const filteredClientes = clienteSearch
        ? clientes.filter(c => c.razon_social.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.cuit || '').includes(clienteSearch))
        : clientes;

    // Factura totals
    const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const totalIva = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario * l.iva_porcentaje / 100, 0);
    const totalFinal = subtotal + totalIva;

    const recTotal = recItems.reduce((s, i) => s + i.monto, 0);

    const generateRemitoPdf = () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const w = doc.internal.pageSize.getWidth();
        const half = (w - 30) / 2 - 3;
        const tenantName = tenant?.razon_social || tenant?.name || '';
        const tenantCuit = tenant?.cuit || '';
        const tenantDir = tenant?.direccion || '';
        const clienteName = selectedCliente?.razon_social || '—';
        const clienteCuit = selectedCliente?.cuit || '';

        doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        doc.text('REMITO', w / 2, 25, { align: 'center' });
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Fecha: ${fecha}`, w - 20, 25, { align: 'right' });

        doc.setDrawColor(200);
        doc.rect(15, 40, half, 28);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('REMITENTE', 20, 47);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(tenantName, 20, 54);
        if (tenantCuit) doc.text(`CUIT: ${tenantCuit}`, 20, 60);
        if (tenantDir) doc.text(tenantDir, 20, 66, { maxWidth: half - 10 });

        const rightX = 15 + half + 6;
        doc.rect(rightX, 40, half, 28);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('DESTINATARIO', rightX + 5, 47);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(clienteName, rightX + 5, 54);
        if (clienteCuit) doc.text(`CUIT: ${clienteCuit}`, rightX + 5, 60);
        if (remDireccion) doc.text(remDireccion, rightX + 5, 66, { maxWidth: half - 10 });

        const tableTop = 80;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setFillColor(240, 240, 240);
        doc.rect(15, tableTop, w - 30, 8, 'F');
        doc.text('CANT.', 20, tableTop + 6);
        doc.text('UNIDAD', 45, tableTop + 6);
        doc.text('DESCRIPCION', 75, tableTop + 6);

        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        let y = tableTop + 14;
        remItems.forEach(item => {
            if (item.descripcion || item.cantidad) {
                doc.text(String(item.cantidad), 20, y);
                doc.text(item.unidad, 45, y);
                doc.text(item.descripcion, 75, y);
                y += 7;
            }
        });

        doc.setDrawColor(200); doc.line(15, y + 2, w - 15, y + 2);
        if (observaciones) {
            y += 10; doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text('OBSERVACIONES:', 20, y);
            doc.setFont('helvetica', 'normal');
            doc.text(observaciones, 20, y + 6, { maxWidth: w - 40 });
        }

        const sigY = Math.max(y + 30, 240);
        doc.line(25, sigY, 90, sigY);
        doc.line(w - 90, sigY, w - 25, sigY);
        doc.setFontSize(8);
        doc.text('Firma y aclaracion (entrego)', 30, sigY + 5);
        doc.text('Firma y aclaracion (recibio)', w - 88, sigY + 5);
        return doc;
    };

    const generateReciboPdf = () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const w = doc.internal.pageSize.getWidth();
        const half = (w - 30) / 2 - 3;
        const tenantName = tenant?.razon_social || tenant?.name || '';
        const tenantCuit = tenant?.cuit || '';
        const tenantDir = tenant?.direccion || '';
        const clienteName = selectedCliente?.razon_social || '—';
        const clienteCuit = selectedCliente?.cuit || '';

        doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        doc.text('RECIBO', w / 2, 25, { align: 'center' });
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(`Fecha: ${fecha}`, w - 20, 25, { align: 'right' });

        doc.setDrawColor(200);
        doc.rect(15, 40, half, 28);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('EMISOR', 20, 47);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(tenantName, 20, 54);
        if (tenantCuit) doc.text(`CUIT: ${tenantCuit}`, 20, 60);
        if (tenantDir) doc.text(tenantDir, 20, 66, { maxWidth: half - 10 });

        const rightX = 15 + half + 6;
        doc.rect(rightX, 40, half, 28);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('RECIBI DE', rightX + 5, 47);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(clienteName, rightX + 5, 54);
        if (clienteCuit) doc.text(`CUIT: ${clienteCuit}`, rightX + 5, 60);

        doc.rect(15, 73, w - 30, 12);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('FORMA DE PAGO', 20, 80);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(recFormaPago, 60, 80);

        const tableTop = 95;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setFillColor(240, 240, 240);
        doc.rect(15, tableTop, w - 30, 8, 'F');
        doc.text('CONCEPTO', 20, tableTop + 6);
        doc.text('MONTO', w - 20, tableTop + 6, { align: 'right' });

        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        let y = tableTop + 14;
        recItems.forEach(item => {
            if (item.concepto || item.monto) {
                doc.text(item.concepto || '—', 20, y);
                doc.text(fmt(item.monto), w - 20, y, { align: 'right' });
                y += 7;
            }
        });

        doc.setDrawColor(100); doc.line(15, y + 2, w - 15, y + 2);
        y += 10;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text('TOTAL:', w - 70, y);
        doc.text(fmt(recTotal), w - 20, y, { align: 'right' });

        if (observaciones) {
            y += 12; doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text('OBSERVACIONES:', 20, y);
            doc.setFont('helvetica', 'normal');
            doc.text(observaciones, 20, y + 6, { maxWidth: w - 40 });
        }

        const sigY = Math.max(y + 30, 240);
        doc.line(25, sigY, 90, sigY);
        doc.line(w - 90, sigY, w - 25, sigY);
        doc.setFontSize(8);
        doc.text('Firma emisor', 40, sigY + 5);
        doc.text('Firma receptor', w - 75, sigY + 5);
        return doc;
    };

    const handleDownloadPdf = () => {
        const doc = mode === 'remito' ? generateRemitoPdf() : generateReciboPdf();
        const label = mode === 'remito' ? 'Remito' : 'Recibo';
        doc.save(`${label}_${fecha}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!emailTo) return;
        setSending(true);
        try {
            const doc = mode === 'remito' ? generateRemitoPdf() : generateReciboPdf();
            const pdfBase64 = doc.output('datauristring');
            const label = mode === 'remito' ? 'Remito' : 'Recibo';
            const resp = await fetch('/api/n8n-send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailTo,
                    subject: `${label} — ${fecha}`,
                    pdf_base64: pdfBase64,
                    filename: `${label}_${fecha}.pdf`,
                    from_name: tenant?.razon_social || tenant?.name || 'NeuraCore',
                    from_email: tenant?.email || undefined,
                }),
            });
            if (!resp.ok) throw new Error(`Error ${resp.status}`);
            setSent(true);
            setTimeout(() => setSent(false), 3000);
        } catch (err) {
            alert('Error al enviar: ' + (err as Error).message);
        }
        setSending(false);
    };

    const handleSave = async () => {
        if (!tenant || !fecha) return;
        setSaving(true);
        setError(null);

        const isRemito = mode === 'remito';
        const isRecibo = mode === 'recibo';
        const tipoCompFinal = isRemito ? 'Remito' : isRecibo ? 'Recibo' : tipoComp;
        const monto = isRemito ? 0 : isRecibo ? recTotal : totalFinal;

        const payload = {
            tenant_id: tenant.id,
            tipo: 'venta',
            fecha,
            fecha_contable: fecha,
            numero_comprobante: null, // AFIP lo genera
            tipo_comprobante: tipoCompFinal,
            cliente_id: clienteId || null,
            moneda: 'ARS',
            monto_original: monto,
            monto_ars: monto,
            lineas: isRemito
                ? remItems.map(i => ({ descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad }))
                : isRecibo
                    ? recItems.map(i => ({ descripcion: i.concepto, cantidad: 1, precio_unitario: i.monto, subtotal: i.monto, total: i.monto }))
                    : lineas.map(l => ({
                        descripcion: l.descripcion,
                        cantidad: l.cantidad,
                        precio_unitario: l.precio_unitario,
                        iva_porcentaje: l.iva_porcentaje,
                        subtotal: l.cantidad * l.precio_unitario,
                        iva: l.cantidad * l.precio_unitario * l.iva_porcentaje / 100,
                        total: l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100),
                    })),
            descripcion: descripcion.trim() || null,
            observaciones: observaciones.trim() || null,
            estado: 'pendiente',
            clasificacion_score: 100,
            clasificado_por: 'manual',
            source: isRemito ? 'remito' : isRecibo ? 'recibo' : 'manual',
        };

        const { error: err } = await supabase.from('contable_comprobantes').insert(payload);
        setSaving(false);

        if (err) { setError('Error: ' + err.message); return; }
        setSuccess(true);
        setTimeout(() => { setSuccess(false); setMode('select'); }, 2000);
    };

    // ── Mode selector ──
    if (mode === 'select') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0.5rem 0' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                    Emitir comprobante
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    Seleccioná el tipo de comprobante a emitir
                </p>

                {[
                    { mode: 'factura' as Mode, icon: FileText, title: 'Factura', desc: 'Factura A, B o C de venta', color: '#2563EB' },
                    { mode: 'remito' as Mode, icon: ClipboardList, title: 'Remito', desc: 'Entrega de mercadería o servicio', color: '#7C3AED' },
                    { mode: 'recibo' as Mode, icon: Receipt, title: 'Recibo', desc: 'Cobro de dinero', color: '#059669' },
                ].map(opt => (
                    <button key={opt.mode} onClick={() => setMode(opt.mode)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
                            borderRadius: 14, border: '1px solid var(--color-border-subtle)',
                            background: 'var(--color-bg-card)', cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'var(--font-sans)', transition: 'transform 0.1s',
                        }}
                        onTouchStart={e => e.currentTarget.style.transform = 'scale(0.98)'}
                        onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${opt.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <opt.icon size={24} color={opt.color} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>{opt.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        );
    }

    // ── Back button + title ──
    const modeTitle = mode === 'factura' ? 'Nueva Factura' : mode === 'remito' ? 'Nuevo Remito' : 'Nuevo Recibo';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 100 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setMode('select')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}>
                    <ChevronLeft size={22} />
                </button>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{modeTitle}</h2>
            </div>

            {success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', fontWeight: 600, fontSize: '0.85rem' }}>
                    <CheckCircle size={16} /> Comprobante creado
                </div>
            )}
            {error && (
                <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '0.85rem' }}>
                    {error}
                </div>
            )}

            {/* ── Cliente ── */}
            <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 8 }}>Cliente</div>
                <div style={{ position: 'relative' }}>
                    <input
                        className="form-input"
                        placeholder="Buscar cliente..."
                        value={clienteSearch}
                        onChange={e => { setClienteSearch(e.target.value); setShowClienteDrop(true); setClienteId(''); }}
                        onFocus={() => setShowClienteDrop(true)}
                        style={{ fontSize: '0.875rem' }}
                    />
                    {showClienteDrop && filteredClientes.length > 0 && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowClienteDrop(false)} />
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: 'var(--color-bg-card, #fff)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                                {filteredClientes.slice(0, 10).map(c => (
                                    <button key={c.id} onClick={() => { setClienteId(c.id); setClienteSearch(c.razon_social); setShowClienteDrop(false); }}
                                        style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle, #f1f5f9)' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.razon_social}</div>
                                        {c.cuit && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>CUIT: {c.cuit}</div>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                {selectedCliente && (
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {selectedCliente.cuit && `CUIT: ${selectedCliente.cuit}`}
                    </div>
                )}
            </div>

            {/* ── Datos ── */}
            <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 8 }}>Datos</div>

                <div style={{ display: 'grid', gridTemplateColumns: mode === 'factura' ? '1fr 1fr' : '1fr', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
                    </div>
                    {mode === 'factura' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Tipo</label>
                            <select className="form-input" value={tipoComp} onChange={e => setTipoComp(e.target.value)}>
                                {['Factura A', 'Factura B', 'Factura C'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
                    <label className="form-label">Descripción</label>
                    <input className="form-input" placeholder={mode === 'recibo' ? 'Ej: Cobro alquiler marzo' : mode === 'remito' ? 'Ej: Entrega materiales obra' : 'Ej: Servicios profesionales'} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
                </div>

                {mode === 'recibo' && (
                    <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
                        <label className="form-label">Forma de pago</label>
                        <select className="form-input" value={recFormaPago} onChange={e => setRecFormaPago(e.target.value)}>
                            {['Efectivo', 'Transferencia bancaria', 'Cheque', 'Tarjeta de crédito', 'Otro'].map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                )}

                {mode === 'remito' && (
                    <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
                        <label className="form-label">Dirección de entrega</label>
                        <input className="form-input" placeholder="Ej: Av. Corrientes 1234, CABA" value={remDireccion} onChange={e => setRemDireccion(e.target.value)} />
                    </div>
                )}
            </div>

            {/* ── Líneas / Items ── */}
            <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
                        {mode === 'factura' ? 'Detalle' : mode === 'remito' ? 'Items' : 'Conceptos'}
                    </div>
                    <button onClick={() => {
                        if (mode === 'factura') setLineas(p => [...p, { id: newId(), descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
                        else if (mode === 'remito') setRemItems(p => [...p, { id: newId(), descripcion: '', cantidad: 1, unidad: 'UN' }]);
                        else setRecItems(p => [...p, { id: newId(), concepto: '', monto: 0 }]);
                    }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', fontFamily: 'var(--font-sans)' }}>
                        <Plus size={14} /> Agregar
                    </button>
                </div>

                {mode === 'factura' && lineas.map((l, i) => (
                    <div key={l.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--color-border-subtle, #f1f5f9)' : 'none' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <input className="form-input" placeholder="Descripción" value={l.descripcion} onChange={e => setLineas(p => p.map(x => x.id === l.id ? { ...x, descripcion: e.target.value } : x))} style={{ flex: 1, fontSize: '0.85rem' }} />
                            {lineas.length > 1 && (
                                <button onClick={() => setLineas(p => p.filter(x => x.id !== l.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <div>
                                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Cant.</label>
                                <input type="number" className="form-input" value={l.cantidad} onChange={e => setLineas(p => p.map(x => x.id === l.id ? { ...x, cantidad: +e.target.value } : x))} style={{ fontSize: '0.85rem' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Precio unit.</label>
                                <input type="number" className="form-input" value={l.precio_unitario || ''} onChange={e => setLineas(p => p.map(x => x.id === l.id ? { ...x, precio_unitario: +e.target.value } : x))} placeholder="0.00" style={{ fontSize: '0.85rem' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>IVA</label>
                                <select className="form-input" value={l.iva_porcentaje} onChange={e => setLineas(p => p.map(x => x.id === l.id ? { ...x, iva_porcentaje: +e.target.value } : x))} style={{ fontSize: '0.85rem' }}>
                                    {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                            Subtotal: {fmt(l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100))}
                        </div>
                    </div>
                ))}

                {mode === 'remito' && remItems.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--color-border-subtle, #f1f5f9)' : 'none' }}>
                        <input type="number" className="form-input" value={item.cantidad} onChange={e => setRemItems(p => p.map(x => x.id === item.id ? { ...x, cantidad: +e.target.value } : x))} style={{ width: 50, fontSize: '0.85rem', textAlign: 'center' }} />
                        <select className="form-input" value={item.unidad} onChange={e => setRemItems(p => p.map(x => x.id === item.id ? { ...x, unidad: e.target.value } : x))} style={{ width: 60, fontSize: '0.85rem' }}>
                            {['UN', 'KG', 'LT', 'MT', 'M2', 'M3'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input className="form-input" placeholder="Descripción" value={item.descripcion} onChange={e => setRemItems(p => p.map(x => x.id === item.id ? { ...x, descripcion: e.target.value } : x))} style={{ flex: 1, fontSize: '0.85rem' }} />
                        {remItems.length > 1 && (
                            <button onClick={() => setRemItems(p => p.filter(x => x.id !== item.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ))}

                {mode === 'recibo' && recItems.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--color-border-subtle, #f1f5f9)' : 'none' }}>
                        <input className="form-input" placeholder="Concepto" value={item.concepto} onChange={e => setRecItems(p => p.map(x => x.id === item.id ? { ...x, concepto: e.target.value } : x))} style={{ flex: 1, fontSize: '0.85rem' }} />
                        <input type="number" className="form-input" placeholder="Monto" value={item.monto || ''} onChange={e => setRecItems(p => p.map(x => x.id === item.id ? { ...x, monto: +e.target.value } : x))} style={{ width: 100, fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }} />
                        {recItems.length > 1 && (
                            <button onClick={() => setRecItems(p => p.filter(x => x.id !== item.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Totales ── */}
            {mode === 'factura' && (
                <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        <span>Subtotal</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                        <span>IVA</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(totalIva)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-primary)', paddingTop: 8, borderTop: '2px solid var(--color-border-subtle)' }}>
                        <span>Total</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(totalFinal)}</span>
                    </div>
                </div>
            )}

            {mode === 'recibo' && recTotal > 0 && (
                <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                        <span>Total</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(recTotal)}</span>
                    </div>
                </div>
            )}

            {/* ── Vista previa (Remito / Recibo) ── */}
            {(mode === 'remito' || mode === 'recibo') && (
                <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                    <button onClick={() => setShowPreview(p => !p)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {showPreview ? <EyeOff size={16} color="var(--color-text-muted)" /> : <Eye size={16} color="#6366f1" />}
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Vista previa en tiempo real</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{showPreview ? 'Ocultar' : 'Mostrar'}</span>
                    </button>

                    {showPreview && (
                        <div style={{ padding: '0 12px 12px' }}>
                            <div style={{
                                background: '#fff', color: '#111', borderRadius: 10,
                                boxShadow: '0 2px 12px rgba(0,0,0,0.1)', padding: '1.25rem 1rem',
                                fontFamily: "'Inter', 'Helvetica', sans-serif",
                                border: '1px solid #e5e7eb', fontSize: '0.75rem',
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '2px solid #111', paddingBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.08em' }}>
                                        {mode === 'remito' ? 'REMITO' : 'RECIBO'}
                                    </h3>
                                    <div style={{ textAlign: 'right', fontSize: '0.7rem' }}>
                                        <div style={{ color: '#666' }}>Fecha: {fecha}</div>
                                    </div>
                                </div>

                                {/* Emisor + Destinatario/Recibí de */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.5rem 0.625rem' }}>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', marginBottom: 2 }}>
                                            {mode === 'remito' ? 'Remitente' : 'Emisor'}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>{tenant?.razon_social || tenant?.name || '...'}</div>
                                        {tenant?.cuit && <div style={{ fontSize: '0.6rem', color: '#555', fontFamily: 'var(--font-mono)' }}>CUIT: {tenant.cuit}</div>}
                                    </div>
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.5rem 0.625rem' }}>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', marginBottom: 2 }}>
                                            {mode === 'remito' ? 'Destinatario' : 'Recibí de'}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>{selectedCliente?.razon_social || '...'}</div>
                                        {selectedCliente?.cuit && <div style={{ fontSize: '0.6rem', color: '#555', fontFamily: 'var(--font-mono)' }}>CUIT: {selectedCliente.cuit}</div>}
                                        {mode === 'remito' && remDireccion && <div style={{ fontSize: '0.6rem', color: '#555', marginTop: 1 }}>{remDireccion}</div>}
                                    </div>
                                </div>

                                {/* Forma de pago (Recibo only) */}
                                {mode === 'recibo' && (
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.4rem 0.625rem', marginBottom: '0.75rem', fontSize: '0.7rem' }}>
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: '#888' }}>Forma de pago: </span>
                                        <span style={{ fontWeight: 600 }}>{recFormaPago}</span>
                                    </div>
                                )}

                                {/* Items table */}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                                            {mode === 'remito' ? (
                                                <>
                                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 700, fontSize: '0.55rem', textTransform: 'uppercase', color: '#666' }}>Cant.</th>
                                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 700, fontSize: '0.55rem', textTransform: 'uppercase', color: '#666' }}>Un.</th>
                                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 700, fontSize: '0.55rem', textTransform: 'uppercase', color: '#666' }}>Descripción</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 700, fontSize: '0.55rem', textTransform: 'uppercase', color: '#666' }}>Concepto</th>
                                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 700, fontSize: '0.55rem', textTransform: 'uppercase', color: '#666' }}>Monto</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mode === 'remito' && remItems.filter(i => i.descripcion).map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 ? '#fafafa' : '#fff' }}>
                                                <td style={{ padding: '0.35rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.cantidad}</td>
                                                <td style={{ padding: '0.35rem 0.5rem', color: '#555' }}>{item.unidad}</td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>{item.descripcion}</td>
                                            </tr>
                                        ))}
                                        {mode === 'recibo' && recItems.filter(i => i.concepto || i.monto > 0).map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 ? '#fafafa' : '#fff' }}>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>{item.concepto || '...'}</td>
                                                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(item.monto)}</td>
                                            </tr>
                                        ))}
                                        {((mode === 'remito' && remItems.filter(i => i.descripcion).length === 0) ||
                                          (mode === 'recibo' && recItems.filter(i => i.concepto || i.monto > 0).length === 0)) && (
                                            <tr><td colSpan={3} style={{ padding: '0.75rem', textAlign: 'center', color: '#aaa', fontStyle: 'italic' }}>
                                                {mode === 'remito' ? 'Agregá items al remito' : 'Agregá conceptos al recibo'}
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>

                                {/* Total (Recibo only) */}
                                {mode === 'recibo' && recTotal > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem 0', borderTop: '2px solid #111' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>TOTAL:</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{fmt(recTotal)}</span>
                                    </div>
                                )}

                                {/* Observaciones */}
                                {observaciones && (
                                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: '#888', marginBottom: 2 }}>Observaciones</div>
                                        <div style={{ fontSize: '0.7rem', color: '#555' }}>{observaciones}</div>
                                    </div>
                                )}

                                {/* Signature lines */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1.25rem' }}>
                                    <div style={{ width: '40%', textAlign: 'center' }}>
                                        <div style={{ borderTop: '1px solid #999', paddingTop: 3, fontSize: '0.55rem', color: '#888' }}>
                                            {mode === 'remito' ? 'Firma (entregó)' : 'Firma emisor'}
                                        </div>
                                    </div>
                                    <div style={{ width: '40%', textAlign: 'center' }}>
                                        <div style={{ borderTop: '1px solid #999', paddingTop: 3, fontSize: '0.55rem', color: '#888' }}>
                                            {mode === 'remito' ? 'Firma (recibió)' : 'Firma receptor'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Observaciones ── */}
            <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Observaciones (opcional)</label>
                    <textarea className="form-input" rows={2} placeholder="Notas internas..." value={observaciones} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical', fontSize: '0.85rem' }} />
                </div>
            </div>

            {/* ── PDF & Email (Remito / Recibo) ── */}
            {(mode === 'remito' || mode === 'recibo') && (
                <div style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 10 }}>
                        Descargar / Enviar
                    </div>

                    <button onClick={handleDownloadPdf}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border-subtle)',
                            background: 'var(--color-bg-subtle, #f8fafc)', cursor: 'pointer',
                            fontFamily: 'var(--font-sans)', marginBottom: 8,
                        }}>
                        <Download size={18} color="#7C3AED" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            Descargar PDF
                        </span>
                    </button>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="Email del destinatario"
                            value={emailTo}
                            onChange={e => setEmailTo(e.target.value)}
                            style={{ flex: 1, fontSize: '0.85rem' }}
                        />
                        <button
                            onClick={handleSendEmail}
                            disabled={!emailTo || sending}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '0 16px', borderRadius: 10, border: 'none',
                                background: sent ? '#059669' : !emailTo || sending ? '#94a3b8' : '#2563EB',
                                color: '#fff', cursor: !emailTo || sending ? 'default' : 'pointer',
                                fontWeight: 600, fontSize: '0.8rem', fontFamily: 'var(--font-sans)',
                                whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                        >
                            {sending ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                : sent ? <><CheckCircle size={16} /> Enviado</>
                                : <><Send size={16} /> Enviar</>}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Submit ── */}
            <button
                onClick={handleSave}
                disabled={saving || (!descripcion.trim() && mode === 'factura' && totalFinal === 0)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                    background: saving ? '#94a3b8' : 'var(--color-cta, #2563EB)', color: '#fff',
                    fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'default' : 'pointer',
                    fontFamily: 'var(--font-sans)',
                }}
            >
                <Save size={18} />
                {saving ? 'Guardando...' : mode === 'factura' ? `Emitir ${tipoComp}` : mode === 'remito' ? 'Emitir Remito' : 'Emitir Recibo'}
            </button>
        </div>
    );
}
