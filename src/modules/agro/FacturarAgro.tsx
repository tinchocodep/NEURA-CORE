import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { DolarService } from '../../services/DolarService';
import type { DolarResumen } from '../../services/DolarService';
import { Plus, Trash2, Send, Search, X } from 'lucide-react';
import OrdenDePagoForm from './OrdenDePagoForm';
import StyledSelect from '../../shared/components/StyledSelect';

/* ── Types ─── */
interface Cliente { id: string; razon_social: string; cuit: string | null; condicion_fiscal: string | null; telefono: string | null; email: string | null; direccion: string | null; }
interface Producto { id: string; nombre: string; tipo: string; grupo: string | null; }
interface Linea {
    producto_id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    iva_porcentaje: number;
}

const IVA_OPTIONS = [
    { value: 21, label: '21%' },
    { value: 10.5, label: '10.5%' },
    { value: 27, label: '27%' },
    { value: 0, label: 'Exento' },
];

const TIPOS_COMP = [
    { value: 'Factura A', label: 'Factura A', letra: 'A' },
    { value: 'Factura B', label: 'Factura B', letra: 'B' },
    { value: 'Factura C', label: 'Factura C', letra: 'C' },
    { value: 'Nota de Crédito A', label: 'Nota de Crédito A', letra: 'A' },
    { value: 'Nota de Crédito B', label: 'Nota de Crédito B', letra: 'B' },
    { value: 'Recibo X', label: 'Recibo X', letra: 'X' },
    { value: 'Remito', label: 'Remito', letra: 'R' },
    { value: 'Orden de Pago', label: 'Orden de Pago', letra: 'OP' },
];

const CONDICIONES_PAGO = ['Contado (Efectivo)', 'Transferencia ARS', 'Transferencia USD', 'Cheque', 'A 15 días', 'A 30 días', 'A 60 días', 'A 90 días'];

/* ── Component ─── */
export default function FacturarAgro() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const [searchParams] = useSearchParams();

    // Data
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [productos, setProductos] = useState<Producto[]>([]);
    const [, setRecientes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Emisor config (from contable_config)
    const [emisorCuit, setEmisorCuit] = useState('');
    const [emisorPuntoVenta, setEmisorPuntoVenta] = useState(1);

    // Form
    const [, setShowForm] = useState(true);
    const [tipoComp, setTipoComp] = useState('Factura A');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [servDesde, setServDesde] = useState('');
    const [servHasta, setServHasta] = useState('');
    const [clienteId, setClienteId] = useState('');
    const [clienteSearch, setClienteSearch] = useState('');
    const [showClienteDropdown, setShowClienteDropdown] = useState(false);
    const [condicionPago, setCondicionPago] = useState('Contado');
    const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [tipoDolar, setTipoDolar] = useState<'oficial' | 'blue' | 'mep' | 'ccl'>('oficial');
    const [dolar, setDolar] = useState<DolarResumen | null>(null);
    const [observaciones, setObservaciones] = useState('');
    const [lineas, setLineas] = useState<Linea[]>([{
        producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21
    }]);
    const [saving, setSaving] = useState(false);

    // Load dollar quotes
    useEffect(() => {
        DolarService.getCotizaciones().then(setDolar);
    }, []);

    const cotizacion = dolar ? (
        tipoDolar === 'oficial' ? dolar.oficial?.venta :
        tipoDolar === 'blue' ? dolar.blue?.venta :
        tipoDolar === 'mep' ? dolar.mep?.venta :
        dolar.ccl?.venta
    ) || 0 : 0;

    // Load data
    useEffect(() => {
        if (!tenant?.id) return;
        setLoading(true);
        Promise.all([
            supabase.from('contable_clientes').select('id, razon_social, cuit, condicion_fiscal, telefono, email, direccion').eq('tenant_id', tenant.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_productos_servicio').select('id, nombre, tipo, grupo').eq('tenant_id', tenant.id).eq('activo', true).order('nombre'),
            supabase.from('contable_comprobantes').select('id, tipo, tipo_comprobante, numero_comprobante, fecha, monto_original, estado, descripcion, cliente:contable_clientes!cliente_id(razon_social)')
                .eq('tenant_id', tenant.id).eq('tipo', 'venta').order('created_at', { ascending: false }).limit(10),
            supabase.from('contable_config').select('arca_cuit, punto_venta').eq('tenant_id', tenant.id).maybeSingle(),
        ]).then(([cliRes, prodRes, recRes, configRes]) => {
            if (cliRes.data) {
                setClientes(cliRes.data as any);
                // Pre-select client from URL param
                const paramClienteId = searchParams.get('cliente_id');
                if (paramClienteId) {
                    const cli = (cliRes.data as any[]).find((c: any) => c.id === paramClienteId);
                    if (cli) {
                        setClienteId(paramClienteId);
                        setClienteSearch(cli.razon_social);
                        autocompletarDesdeHistorial(paramClienteId);
                    }
                }
            }
            if (prodRes.data) setProductos(prodRes.data.filter((p: any) => p.tipo === 'venta' || p.tipo === 'ambos') as any);
            if (recRes.data) setRecientes(recRes.data as any);
            if (configRes.data) {
                if (configRes.data.arca_cuit) setEmisorCuit(configRes.data.arca_cuit);
                if (configRes.data.punto_venta) setEmisorPuntoVenta(configRes.data.punto_venta);
            }
            setLoading(false);
        });
    }, [tenant?.id]);

    // Auto-complete from last invoice when client is selected
    const [autocompletando, setAutocompletando] = useState(false);
    const autocompletarDesdeHistorial = async (cliId: string) => {
        if (!tenant?.id) return;
        setAutocompletando(true);
        const cli = clientes.find(c => c.id === cliId);

        // Determine tipo factura from condicion_fiscal
        if (cli?.condicion_fiscal) {
            const cf = cli.condicion_fiscal.toLowerCase();
            if (cf.includes('responsable inscripto')) setTipoComp('Factura A');
            else if (cf.includes('monotribut')) setTipoComp('Factura C');
            else if (cf.includes('exento')) setTipoComp('Factura B');
            else setTipoComp('Factura B'); // Consumidor Final default
        }

        // Fetch last invoice for this client
        const { data: lastInvoice } = await supabase
            .from('contable_comprobantes')
            .select('tipo_comprobante, lineas_detalle, descripcion')
            .eq('tenant_id', tenant.id)
            .eq('cliente_id', cliId)
            .eq('tipo', 'venta')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastInvoice) {
            // Auto-fill tipo from last invoice if no condicion_fiscal
            if (!cli?.condicion_fiscal && lastInvoice.tipo_comprobante) {
                setTipoComp(lastInvoice.tipo_comprobante);
            }

            // Auto-fill lineas from last invoice
            if (lastInvoice.lineas_detalle && Array.isArray(lastInvoice.lineas_detalle) && lastInvoice.lineas_detalle.length > 0) {
                setLineas(lastInvoice.lineas_detalle.map((l: any) => ({
                    producto_id: '',
                    descripcion: l.descripcion || '',
                    cantidad: l.cantidad || 1,
                    precio_unitario: l.precio_unitario || 0,
                    iva_porcentaje: l.iva_porcentaje || 21,
                })));
            }
        }
        setAutocompletando(false);
    };

    // Filtered clients
    const filteredClientes = clientes.filter(c =>
        c.razon_social.toLowerCase().includes(clienteSearch.toLowerCase()) ||
        (c.cuit && c.cuit.includes(clienteSearch))
    );
    const selectedCliente = clientes.find(c => c.id === clienteId);

    // Lineas helpers
    const addLinea = () => setLineas(l => [...l, { producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
    const removeLinea = (i: number) => setLineas(l => l.filter((_, idx) => idx !== i));
    const updateLinea = (i: number, field: string, value: any) => {
        setLineas(l => l.map((lin, idx) => {
            if (idx !== i) return lin;
            const updated = { ...lin, [field]: value };
            if (field === 'producto_id') {
                const prod = productos.find(p => p.id === value);
                if (prod) updated.descripcion = prod.nombre;
            }
            return updated;
        }));
    };

    // Factura C = always exento
    const isFacturaC = tipoComp.includes('C');
    const isOrdenPago = tipoComp === 'Orden de Pago';
    const isRecibo = tipoComp === 'Recibo X';
    const isRemito = tipoComp === 'Remito';
    const isDocPreview = isRecibo || isRemito;

    // When switching to Factura C, force all lines to 0% IVA
    useEffect(() => {
        if (isFacturaC) {
            setLineas(l => l.map(lin => ({ ...lin, iva_porcentaje: 0 })));
        }
    }, [isFacturaC]);

    // Totals (in original currency)
    const subtotalOrig = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const descuentoMontoOrig = subtotalOrig * (descuentoPorcentaje / 100);
    const netoGravadoOrig = subtotalOrig - descuentoMontoOrig;
    const totalIvaOrig = isFacturaC ? 0 : lineas.reduce((s, l) => {
        const lineSubtotal = l.cantidad * l.precio_unitario;
        const lineDiscount = lineSubtotal * (descuentoPorcentaje / 100);
        return s + (lineSubtotal - lineDiscount) * (l.iva_porcentaje / 100);
    }, 0);
    const totalOrig = netoGravadoOrig + totalIvaOrig;

    // Convert to ARS if USD
    const factor = moneda === 'USD' && cotizacion > 0 ? cotizacion : 1;
    const subtotal = subtotalOrig * factor;
    const descuentoMonto = descuentoMontoOrig * factor;
    const netoGravado = netoGravadoOrig * factor;
    const totalIva = totalIvaOrig * factor;
    const total = totalOrig * factor;

    // Reset form
    const resetForm = () => {
        setTipoComp('Factura A'); setFecha(new Date().toISOString().split('T')[0]); setFechaVencimiento('');
        setServDesde(''); setServHasta(''); setClienteId(''); setClienteSearch(''); setCondicionPago('Contado');
        setObservaciones(''); setLineas([{ producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
    };

    // Emit to ARCA or save locally
    const [emitirArca, setEmitirArca] = useState(true);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [lastCae, setLastCae] = useState<string | null>(null);
    const [lastInvoiceNum, setLastInvoiceNum] = useState<string | null>(null);

    const handleSave = async () => {
        if (!tenant?.id || !clienteId || lineas.length === 0) {
            addToast('error', 'Faltan datos', 'Seleccioná un cliente y agregá al menos un ítem');
            return;
        }
        if (lineas.some(l => !l.descripcion || l.precio_unitario <= 0)) {
            addToast('error', 'Ítems incompletos', 'Completá la descripción y precio de todos los ítems');
            return;
        }

        setSaving(true);
        try {
            const lineasDetalle = lineas.map(l => ({
                descripcion: l.descripcion,
                cantidad: l.cantidad,
                precio_unitario: l.precio_unitario,
                iva_porcentaje: l.iva_porcentaje,
                subtotal: l.cantidad * l.precio_unitario,
                iva: l.cantidad * l.precio_unitario * (l.iva_porcentaje / 100),
                total: l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100),
            }));

            const fechaEmision = fecha || new Date().toISOString().split('T')[0];
            const tipoLetra = tipoComp.includes('A') ? 'A' : tipoComp.includes('B') ? 'B' : 'C';
            const isCreditNote = tipoComp.toLowerCase().includes('crédito') || tipoComp.toLowerCase().includes('credito');

            let cae: string | null = null;
            let invoiceNumber: string | null = null;
            let pdfBlobUrl: string | null = null;
            let estado = 'pendiente';

            // If emitir via ARCA webhook (not for Orden de Pago)
            const webhookUrl = (tenant as any).webhook_facturacion || 'https://n8n.neuracall.net/webhook-test/NeuraUSUARIOPRUEBANEURAORKESTA';
            if (emitirArca && webhookUrl && !isOrdenPago) {
                const payload = {
                    emisor: {
                        razonSocial: (tenant as any).razon_social || tenant.name,
                        cuit: Number((emisorCuit || (tenant as any).cuit || '').replace(/[-\s]/g, '')) || 0,
                        domicilio: (tenant as any).direccion || '',
                        condicionIva: (tenant as any).condicion_iva || 'Responsable Inscripto',
                        iibb: (tenant as any).ingresos_brutos || emisorCuit || ((tenant as any).cuit || ''),
                        inicioActividades: (tenant as any).inicio_actividades || '01/01/2020',
                        puntoVenta: emisorPuntoVenta,
                    },
                    type: tipoLetra,
                    creditnote: isCreditNote,
                    client: {
                        id: clienteId,
                        name: selectedCliente?.razon_social || '',
                        cuit: (selectedCliente?.cuit || '0').replace(/[-\s]/g, ''),
                        address: selectedCliente?.direccion || '-',
                        tax_condition: selectedCliente?.condicion_fiscal || 'Consumidor Final',
                        email: selectedCliente?.email || '',
                    },
                    items: lineas.map(l => ({
                        productId: l.producto_id || undefined,
                        productName: l.descripcion,
                        quantity: l.cantidad,
                        unitPrice: l.precio_unitario,
                        vatRate: 0, // n8n calcula el IVA
                        subtotal: l.cantidad * l.precio_unitario,
                    })),
                    totals: {
                        subtotal,
                        discountPercentage: descuentoPorcentaje,
                        discountAmount: descuentoMonto,
                        netTaxable: netoGravado,
                        vatTotal: totalIva,
                        total,
                    },
                    date: fechaEmision,
                    dueDate: fechaVencimiento || fechaEmision,
                    serviceFrom: servDesde || null,
                    serviceTo: servHasta || null,
                    originalInvoiceNumber: null,
                    originalInvoiceCAE: null,
                };

                console.log('[FacturarAgro] Sending to ARCA webhook:', JSON.stringify(payload, null, 2));

                const resp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                // Read headers
                cae = resp.headers.get('x-cae');
                invoiceNumber = resp.headers.get('x-invoice-number');
                // invoiceId available in resp.headers.get('x-invoice-id') if needed

                if (resp.ok) {
                    // Response is PDF binary
                    const blob = await resp.blob();
                    if (blob.size > 0) {
                        pdfBlobUrl = URL.createObjectURL(blob);
                        setPdfUrl(pdfBlobUrl);

                        // Upload PDF to Supabase storage
                        const fileName = `factura_${invoiceNumber || Date.now()}.pdf`;
                        await supabase.storage.from('comprobantes').upload(fileName, blob, { contentType: 'application/pdf', upsert: true });
                    }
                    estado = 'aprobado'; // ARCA approved it
                    setLastCae(cae);
                    setLastInvoiceNum(invoiceNumber);
                    addToast('success', 'Factura emitida', `CAE: ${cae || 'pendiente'} | N°: ${invoiceNumber || '—'}`);
                } else {
                    const errText = await resp.text();
                    console.error('[FacturarAgro] ARCA error:', errText);
                    addToast('error', 'Error ARCA', `No se pudo emitir: ${errText.slice(0, 100)}`);
                    // Still save locally as pendiente
                }
            }

            // Save to Supabase
            const nroComp = invoiceNumber ? `${String((tenant as any).punto_venta || 1).padStart(5, '0')}-${String(invoiceNumber).padStart(8, '0')}` : undefined;
            const { error } = await supabase.from('contable_comprobantes').insert({
                tenant_id: tenant.id,
                tipo: isOrdenPago ? 'compra' : 'venta',
                tipo_comprobante: tipoComp,
                numero_comprobante: nroComp,
                fecha: fecha || new Date().toISOString().split('T')[0],
                cliente_id: clienteId,
                moneda: 'ARS',
                monto_original: total,
                monto_ars: total,
                neto_gravado: netoGravado,
                total_iva: totalIva,
                estado,
                descripcion: observaciones || `${tipoComp} - ${selectedCliente?.razon_social || ''}`,
                source: emitirArca ? 'arca' : 'manual',
                origen: emitirArca ? 'arca' : 'manual',
                lineas_detalle: lineasDetalle,
                pdf_url: pdfBlobUrl ? `https://fuytejvnwihghxymyayw.supabase.co/storage/v1/object/public/comprobantes/factura_${invoiceNumber || Date.now()}.pdf` : undefined,
            });

            if (error) throw error;
            if (!emitirArca || isOrdenPago) addToast('success', 'Comprobante guardado', `${tipoComp} registrad${isOrdenPago ? 'a' : 'o'} correctamente`);
            resetForm();
            setShowForm(false);
            // Reload recientes
            const { data } = await supabase.from('contable_comprobantes')
                .select('id, tipo, tipo_comprobante, numero_comprobante, fecha, monto_original, estado, descripcion, cliente:contable_clientes!cliente_id(razon_social)')
                .eq('tenant_id', tenant.id).eq('tipo', 'venta').order('created_at', { ascending: false }).limit(10);
            if (data) setRecientes(data as any);
        } catch (err: any) {
            addToast('error', 'Error', err.message || 'No se pudo crear el comprobante');
        }
        setSaving(false);
    };

    if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* Form always visible */}
            <div style={{ background: 'var(--color-bg-card)', borderRadius: 14, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                {/* Form header */}
                {/* Tipo selector - always visible */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Tipo de comprobante</label>
                    <StyledSelect className="form-input" value={tipoComp} onChange={e => setTipoComp(e.target.value)} style={{ height: 36, fontSize: '0.85rem', maxWidth: 220 }}>
                        {TIPOS_COMP.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </StyledSelect>
                </div>

                {/* Orden de Pago: dedicated form with live preview */}
                {isOrdenPago && <OrdenDePagoForm />}

                {/* Factura/NC/Recibo/Remito: original form */}
                {!isOrdenPago && (<>
                    <div style={{ padding: 20, display: 'flex', gap: 24 }}>
                        {/* Left: form */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Row 1: Condición */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Condición de pago</label>
                                    <StyledSelect className="form-input" value={condicionPago} onChange={e => setCondicionPago(e.target.value)} style={{ height: 38 }}>
                                        {CONDICIONES_PAGO.map(c => <option key={c} value={c}>{c}</option>)}
                                    </StyledSelect>
                                </div>
                            </div>

                            {/* Row 2: Moneda + Tipo dólar + Descuento */}
                            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Moneda</label>
                                    <StyledSelect className="form-input" value={moneda} onChange={e => setMoneda(e.target.value as 'ARS' | 'USD')} style={{ height: 38 }}>
                                        <option value="ARS">ARS</option>
                                        <option value="USD">USD</option>
                                    </StyledSelect>
                                </div>
                                <div>
                                    {moneda === 'USD' ? (
                                        <>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Tipo de dólar</label>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {(['oficial', 'blue', 'mep', 'ccl'] as const).map(t => (
                                                    <button key={t} onClick={() => setTipoDolar(t)}
                                                        style={{
                                                            flex: 1, height: 38, border: '1px solid', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase',
                                                            background: tipoDolar === t ? 'var(--brand)' : 'var(--color-bg-surface-2)',
                                                            color: tipoDolar === t ? '#fff' : 'var(--color-text-muted)',
                                                            borderColor: tipoDolar === t ? 'var(--brand)' : 'var(--color-border-subtle)',
                                                        }}>
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                            {cotizacion > 0 && (
                                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                                    1 USD = ${cotizacion.toLocaleString('es-AR')} ARS
                                                </div>
                                            )}
                                        </>
                                    ) : <div />}
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Descuento %</label>
                                    <input type="number" className="form-input" min={0} max={100} step={0.5} value={descuentoPorcentaje}
                                        onChange={e => setDescuentoPorcentaje(Number(e.target.value))}
                                        style={{ height: 38, textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                                </div>
                            </div>

                            {/* Row 3: Fecha emisión + Fecha vencimiento */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Fecha de emisión</label>
                                    <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} style={{ height: 38 }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Fecha de vencimiento</label>
                                    <input type="date" className="form-input" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} style={{ height: 38 }} />
                                </div>
                            </div>

                            {/* Row 3: Período de servicio (opcional) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Período desde <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>(opcional)</span></label>
                                    <input type="date" className="form-input" value={servDesde} onChange={e => setServDesde(e.target.value)} style={{ height: 38 }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Período hasta <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>(opcional)</span></label>
                                    <input type="date" className="form-input" value={servHasta} onChange={e => setServHasta(e.target.value)} style={{ height: 38 }} />
                                </div>
                            </div>

                            {/* Cliente search */}
                            <div style={{ marginBottom: 16, position: 'relative' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Cliente</label>
                                {selectedCliente ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-bg-surface-2)', borderRadius: 10, border: '1px solid var(--color-border-subtle)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{selectedCliente.razon_social}</div>
                                            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                                {selectedCliente.cuit && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>CUIT: {selectedCliente.cuit}</span>}
                                                {selectedCliente.condicion_fiscal && <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: '#3B82F615', color: '#3B82F6', fontWeight: 600 }}>{selectedCliente.condicion_fiscal}</span>}
                                            </div>
                                            {autocompletando && <div style={{ fontSize: '0.7rem', color: 'var(--brand)', marginTop: 4 }}>Autocompletando desde última factura...</div>}
                                        </div>
                                        <button onClick={() => { setClienteId(''); setClienteSearch(''); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={16} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                                            <input className="form-input" placeholder="Buscar cliente por nombre o CUIT..."
                                                value={clienteSearch} onChange={e => { setClienteSearch(e.target.value); setShowClienteDropdown(true); }}
                                                onFocus={() => setShowClienteDropdown(true)}
                                                style={{ paddingLeft: 30, height: 38 }} />
                                        </div>
                                        {showClienteDropdown && clienteSearch && (
                                            <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                                                {filteredClientes.length === 0 ? (
                                                    <div style={{ padding: '12px 14px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Sin resultados</div>
                                                ) : filteredClientes.slice(0, 8).map(c => (
                                                    <div key={c.id} onClick={() => { setClienteId(c.id); setClienteSearch(''); setShowClienteDropdown(false); autocompletarDesdeHistorial(c.id); }}
                                                        style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                                        <div style={{ fontWeight: 500 }}>{c.razon_social}</div>
                                                        {c.cuit && <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{c.cuit}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Líneas */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Ítems</label>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={addLinea}>
                                        <Plus size={12} /> Agregar ítem
                                    </button>
                                </div>
                                {lineas.map((l, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                                        <div>
                                            {i === 0 && <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Producto / Descripción</label>}
                                            <StyledSelect className="form-input" value={l.producto_id} onChange={e => updateLinea(i, 'producto_id', e.target.value)} style={{ height: 36, fontSize: '0.8rem' }}>
                                                <option value="">Seleccionar producto...</option>
                                                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                            </StyledSelect>
                                        </div>
                                        <div>
                                            {i === 0 && <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Descripción</label>}
                                            <input className="form-input" value={l.descripcion} onChange={e => updateLinea(i, 'descripcion', e.target.value)}
                                                placeholder="Detalle..." style={{ height: 36, fontSize: '0.8rem' }} />
                                        </div>
                                        <div>
                                            {i === 0 && <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Cant.</label>}
                                            <input className="form-input" type="number" min={1} value={l.cantidad} onChange={e => updateLinea(i, 'cantidad', Number(e.target.value))}
                                                style={{ height: 36, fontSize: '0.8rem', textAlign: 'center' }} />
                                        </div>
                                        <div>
                                            {i === 0 && <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Precio</label>}
                                            <input className="form-input" type="number" min={0} step={0.01} value={l.precio_unitario} onChange={e => updateLinea(i, 'precio_unitario', Number(e.target.value))}
                                                style={{ height: 36, fontSize: '0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                        <div>
                                            {i === 0 && <label style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>IVA</label>}
                                            {isFacturaC ? (
                                                <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderRadius: 6, border: '1px solid var(--color-border-subtle)' }}>
                                                    Exento
                                                </div>
                                            ) : (
                                                <StyledSelect className="form-input" value={l.iva_porcentaje} onChange={e => updateLinea(i, 'iva_porcentaje', Number(e.target.value))}
                                                    style={{ height: 36, fontSize: '0.8rem' }}>
                                                    {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </StyledSelect>
                                            )}
                                        </div>
                                        <div>
                                            {lineas.length > 1 && (
                                                <button onClick={() => removeLinea(i)} style={{ width: 32, height: 36, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Observaciones */}
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Observaciones</label>
                                <textarea className="form-input" value={observaciones} onChange={e => setObservaciones(e.target.value)}
                                    placeholder="Notas adicionales..." rows={2} style={{ fontSize: '0.8rem', resize: 'vertical' }} />
                            </div>
                        </div>

                        {/* Right: live document preview OR summary */}
                        <div style={{ width: 320, flexShrink: 0 }}>
                          {isDocPreview ? (
                            /* ─── LIVE DOCUMENT PREVIEW (Recibo / Remito) ─── */
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '24px 20px', fontFamily: 'Georgia, serif', color: '#1a1a1a', fontSize: '0.7rem', lineHeight: 1.5, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', position: 'sticky', top: 20 }}>
                              <div style={{ textAlign: 'center', borderBottom: '2px solid #1a1a1a', paddingBottom: 12, marginBottom: 12 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: 2 }}>{tipoComp}</div>
                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{(tenant as any)?.razon_social || tenant?.name || '—'}</div>
                                <div style={{ fontSize: '0.6rem', color: '#64748b' }}>CUIT: {emisorCuit || (tenant as any)?.cuit || '—'}</div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 14 }}>
                                <div><span style={{ color: '#64748b' }}>Fecha:</span> <b>{new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR')}</b></div>
                                <div><span style={{ color: '#64748b' }}>Condición:</span> <b>{condicionPago}</b></div>
                              </div>
                              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 4, marginBottom: 14, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Cliente</div>
                                <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{selectedCliente?.razon_social || '—'}</div>
                                {selectedCliente?.cuit && <div style={{ fontSize: '0.6rem', color: '#64748b' }}>CUIT: {selectedCliente.cuit}</div>}
                              </div>
                              {lineas.some(l => l.descripcion) && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Detalle</div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
                                    <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                      <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 700, color: '#64748b' }}>Descripción</th>
                                      <th style={{ textAlign: 'center', padding: '3px 0', fontWeight: 700, color: '#64748b' }}>Cant.</th>
                                      <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 700, color: '#64748b' }}>Precio</th>
                                      <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 700, color: '#64748b' }}>Subtotal</th>
                                    </tr></thead>
                                    <tbody>
                                      {lineas.filter(l => l.descripcion).map((l, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '3px 0' }}>{l.descripcion}</td>
                                          <td style={{ padding: '3px 0', textAlign: 'center' }}>{l.cantidad}</td>
                                          <td style={{ padding: '3px 0', textAlign: 'right', fontFamily: 'monospace' }}>${l.precio_unitario.toLocaleString('es-AR')}</td>
                                          <td style={{ padding: '3px 0', textAlign: 'right', fontFamily: 'monospace' }}>${(l.cantidad * l.precio_unitario).toLocaleString('es-AR')}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {observaciones.trim() && (
                                <div style={{ marginBottom: 10, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, fontSize: '0.6rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                  <b>Obs:</b> {observaciones}
                                </div>
                              )}
                              <div style={{ borderTop: '2px solid #1a1a1a', paddingTop: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700 }}>
                                  <span>TOTAL</span>
                                  <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                              <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, height: 42, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                onClick={handleSave} disabled={saving || !clienteId || lineas.length === 0}>
                                <Send size={16} /> {saving ? 'Guardando...' : `Emitir ${tipoComp}`}
                              </button>
                            </div>
                          ) : (
                            /* ─── FACTURA SUMMARY ─── */
                            <div style={{ background: 'var(--color-bg-surface-2)', borderRadius: 12, padding: 20, position: 'sticky', top: 20 }}>
                                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: 16, margin: '0 0 16px' }}>Resumen</h3>
                                <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--color-bg-card)', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Emisor</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{(tenant as any)?.razon_social || tenant?.name || '—'}</div>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>CUIT: {emisorCuit || (tenant as any)?.cuit || '—'}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Pto. Venta: {String(emisorPuntoVenta).padStart(5, '0')}</div>
                                </div>
                                {[
                                  ['Tipo', tipoComp], ['Fecha', fecha], ['Cliente', selectedCliente?.razon_social || '—'], ['Condición', condicionPago],
                                  ['Ítems', String(lineas.filter(l => l.descripcion).length)],
                                ].map(([label, val]) => (
                                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                                    <span style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                                  </div>
                                ))}
                                <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 12, paddingTop: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
                                        <span style={{ fontFamily: 'var(--font-mono)' }}>${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--color-text-muted)' }}>IVA</span>
                                        <span style={{ fontFamily: 'var(--font-mono)' }}>${totalIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '2px solid var(--color-border-subtle)', fontSize: '1rem' }}>
                                        <span style={{ fontWeight: 700 }}>Total</span>
                                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--color-border-subtle)' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Emitir via ARCA</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Factura electrónica con CAE</div>
                                    </div>
                                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={emitirArca} onChange={e => setEmitirArca(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                        <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: emitirArca ? 'var(--brand)' : '#ccc', transition: 'background 0.2s' }}>
                                            <span style={{ position: 'absolute', top: 2, left: emitirArca ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                        </span>
                                    </label>
                                </div>
                                <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, height: 42, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                    onClick={handleSave} disabled={saving || !clienteId || lineas.length === 0}>
                                    <Send size={16} /> {saving ? (emitirArca ? 'Emitiendo...' : 'Guardando...') : (emitirArca ? 'Emitir factura' : 'Guardar borrador')}
                                </button>
                                {lastCae && (
                                    <div style={{ marginTop: 12, padding: 12, background: '#22C55E10', borderRadius: 8, border: '1px solid #22C55E30' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#22C55E', marginBottom: 4 }}>Factura emitida</div>
                                        <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>CAE: {lastCae}</div>
                                        {lastInvoiceNum && <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>N°: {lastInvoiceNum}</div>}
                                        {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--brand)', fontWeight: 600, marginTop: 6, display: 'inline-block' }}>Ver PDF</a>}
                                    </div>
                                )}
                            </div>
                          )}
                        </div>
                    </div>
                </>)}
            </div>
        </div>
    );
}
