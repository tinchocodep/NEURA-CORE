import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, CheckCircle, Download, Mail, Loader, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { DolarService } from '../../../services/DolarService';
import jsPDF from 'jspdf';

/* ─── Types ─────────────────────────────────────────── */

interface Proveedor { id: string; razon_social: string; cuit: string | null; condicion_fiscal: string | null; producto_servicio_default_id: string | null; }
interface Cliente { id: string; razon_social: string; cuit: string | null; }
interface ProductoServicio { id: string; nombre: string; grupo: string; }
interface CentroCosto { id: string; nombre: string; }

interface LineaDetalle {
    id: string;
    producto_servicio_id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    iva_porcentaje: number;
}

interface Props {
    onSuccess?: () => void;
}

/* ─── Constants ─────────────────────────────────────── */

const TIPOS_COMPROBANTE = [
    'Factura A', 'Factura B', 'Factura C',
    'Nota de Crédito A', 'Nota de Crédito B', 'Nota de Crédito C',
    'Nota de Débito A', 'Nota de Débito B', 'Nota de Débito C',
    'Recibo', 'Remito', 'Otro',
];

interface RemItem { id: string; descripcion: string; cantidad: number; unidad: string; }
interface RecItem { id: string; concepto: string; monto: number; }

const FORMAS_PAGO = ['Efectivo', 'Transferencia bancaria', 'Cheque', 'Tarjeta de crédito', 'Tarjeta de débito', 'Otro'] as const;

const IVA_OPTIONS = [
    { value: 21, label: '21%' },
    { value: 10.5, label: '10.5%' },
    { value: 27, label: '27%' },
    { value: 0, label: 'Exento' },
];

function newId() { return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2); }

function sugerirTipo(condEmisor: string | null): string | null {
    if (!condEmisor) return null;
    const e = condEmisor.toLowerCase();
    if (e.includes('monotribut')) return 'Factura C';
    if (e.includes('exento')) return 'Factura B';
    if (e.includes('responsable inscripto') || e.includes('resp.')) return 'Factura A';
    return null;
}

const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);

/* ─── Component ─────────────────────────────────────── */

export default function ComprobanteForm({ onSuccess }: Props) {
    const { tenant } = useTenant();
    const [searchParams, setSearchParams] = useSearchParams();

    // Header fields
    const [tipo, setTipo] = useState<'compra' | 'venta'>('compra');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [numero, setNumero] = useState('');
    const [tipoComp, setTipoComp] = useState('');
    const [moneda, setMoneda] = useState('ARS');
    const [tipoCambio, setTipoCambio] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [observaciones, setObs] = useState('');

    // Entity
    const [proveedorId, setProveedorId] = useState('');
    const [clienteId, setClienteId] = useState('');
    const [entitySearch, setEntitySearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // Clasificación
    const [productoId, setProductoId] = useState('');
    const [centroCostoId, setCentroId] = useState('');
    const [categoriaId, setCategoriaId] = useState('');

    // Líneas de detalle
    const [lineas, setLineas] = useState<LineaDetalle[]>([
        { id: newId(), producto_servicio_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 },
    ]);

    // Catalogs
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [productos, setProductos] = useState<ProductoServicio[]>([]);
    const [centros, setCentros] = useState<CentroCosto[]>([]);
    const [categorias, setCategorias] = useState<{ id: string, nombre: string, color: string, tipo: string }[]>([]);

    // UI
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showLineas, setShowLineas] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [prodSearch, setProdSearch] = useState('');

    // Remito-specific state
    const [remDireccion, setRemDireccion] = useState('');
    const [remTransportista, setRemTransportista] = useState('');
    const [remItems, setRemItems] = useState<RemItem[]>([{ id: newId(), descripcion: '', cantidad: 1, unidad: 'UN' }]);
    const [remSending, setRemSending] = useState(false);
    const [remSent, setRemSent] = useState(false);
    const [remEmail, setRemEmail] = useState('');

    // Recibo-specific state
    const [recFormaPago, setRecFormaPago] = useState<string>('Efectivo');
    const [recItems, setRecItems] = useState<RecItem[]>([{ id: newId(), concepto: '', monto: 0 }]);
    const [recSending, setRecSending] = useState(false);
    const [recSent, setRecSent] = useState(false);
    const [recEmail, setRecEmail] = useState('');

    // Dollar rate state (auto-fill tipo de cambio)
    const [bnaRate, setBnaRate] = useState<number | null>(null);
    const [bnaLoading, setBnaLoading] = useState(false);

    // Duplicate detection
    const [duplicateWarning, setDuplicateWarning] = useState<{ count: number; existing: { numero_comprobante: string; fecha: string; monto_ars: number }[] } | null>(null);
    const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);

    const isRemito = tipoComp === 'Remito';
    const isRecibo = tipoComp === 'Recibo';

    /* Load catalogs */
    useEffect(() => {
        if (!tenant) return;
        Promise.all([
            supabase.from('contable_proveedores').select('id, razon_social, cuit, condicion_fiscal, producto_servicio_default_id').eq('tenant_id', tenant.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_clientes').select('id, razon_social, cuit').eq('tenant_id', tenant.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_productos_servicio').select('id, nombre, grupo').eq('tenant_id', tenant.id).eq('activo', true).order('nombre'),
            supabase.from('contable_centros_costo').select('id, nombre').eq('tenant_id', tenant.id).eq('activo', true).order('nombre'),
            supabase.from('contable_categorias').select('id, nombre, color, tipo').eq('tenant_id', tenant.id).order('nombre'),
        ]).then(([{ data: p }, { data: c }, { data: ps }, { data: cc }, { data: cat }]) => {
            const provs = (p || []) as Proveedor[];
            const clis = (c || []) as Cliente[];
            setProveedores(provs);
            setClientes(clis);
            setProductos((ps || []) as ProductoServicio[]);
            setCentros((cc || []) as CentroCosto[]);
            setCategorias((cat || []) as any);

            let changedParams = false;
            const newParams = new URLSearchParams(searchParams);

            // Pre-fill proveedor from URL param (quick action from Proveedores)
            const preProvId = searchParams.get('proveedor_id');
            if (preProvId) {
                const prov = provs.find(x => x.id === preProvId);
                if (prov) {
                    setProveedorId(prov.id);
                    setEntitySearch(prov.razon_social);
                    setTipo('compra');
                }
                newParams.delete('proveedor_id');
                changedParams = true;
            }

            // Pre-fill cliente from URL param (quick action from Clientes)
            const preCliId = searchParams.get('cliente_id');
            if (preCliId) {
                const cli = clis.find(x => x.id === preCliId);
                if (cli) {
                    setClienteId(cli.id);
                    setEntitySearch(cli.razon_social);
                    setTipo('venta');
                }
                newParams.delete('cliente_id');
                changedParams = true;
            }

            if (changedParams) {
                setSearchParams(newParams, { replace: true });
            }
        });
    }, [tenant]);

    /* Auto-suggest tipo comprobante from proveedor */
    useEffect(() => {
        if (tipo === 'compra' && proveedorId) {
            const prov = proveedores.find(p => p.id === proveedorId);
            const sug = sugerirTipo(prov?.condicion_fiscal ?? null);
            if (sug && !tipoComp) setTipoComp(sug);
        }
    }, [proveedorId, tipo]);

    /* Auto-fill producto/servicio from proveedor's default */
    useEffect(() => {
        if (tipo === 'compra' && proveedorId) {
            const prov = proveedores.find(p => p.id === proveedorId);
            if (prov?.producto_servicio_default_id && !productoId) {
                setProductoId(prov.producto_servicio_default_id);
            }
        }
    }, [proveedorId, tipo]);

    /* Auto-fetch BNA rate when moneda switches to USD */
    useEffect(() => {
        if (moneda === 'USD') {
            setBnaLoading(true);
            DolarService.getOficialVenta().then(rate => {
                setBnaRate(rate);
                if (rate && !tipoCambio) {
                    setTipoCambio(rate.toFixed(2));
                }
                setBnaLoading(false);
            });
        } else {
            setBnaRate(null);
        }
    }, [moneda]);

    /* Lines helpers */
    const addLinea = () =>
        setLineas(prev => [...prev, { id: newId(), producto_servicio_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);

    const removeLinea = (id: string) => {
        if (lineas.length <= 1) return;
        setLineas(prev => prev.filter(l => l.id !== id));
    };

    const updateLinea = (id: string, field: keyof LineaDetalle, value: string | number) =>
        setLineas(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

    /* Totals */
    const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    const totalIva = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario * l.iva_porcentaje / 100, 0);
    const totalFinal = subtotal + totalIva;

    /* Entity search */
    const entityList = tipo === 'compra' ? proveedores : clientes;
    const entityId = tipo === 'compra' ? proveedorId : clienteId;
    const setEntityId = tipo === 'compra' ? setProveedorId : setClienteId;

    const filteredEntities = entitySearch
        ? entityList.filter(e => e.razon_social.toLowerCase().includes(entitySearch.toLowerCase()) || (e.cuit || '').includes(entitySearch))
        : entityList;

    const selectedEntity = entityList.find(e => e.id === entityId);

    /* Product groups */
    const filteredProducts = prodSearch
        ? productos.filter(p => p.nombre.toLowerCase().includes(prodSearch.toLowerCase()) || p.grupo.toLowerCase().includes(prodSearch.toLowerCase()))
        : productos;

    const productGroups = filteredProducts.reduce((acc, p) => {
        if (!acc[p.grupo]) acc[p.grupo] = [];
        acc[p.grupo].push(p);
        return acc;
    }, {} as Record<string, ProductoServicio[]>);

    /* Save */
    const handleSave = async () => {
        if (!tenant) return;
        setError(null);

        if (!fecha) { setError('La fecha es obligatoria.'); return; }

        // Duplicate detection (skip if user already confirmed)
        if (!skipDuplicateCheck) {
            const entityField = tipo === 'compra' ? 'proveedor_id' : 'cliente_id';
            const entityValue = tipo === 'compra' ? proveedorId : clienteId;

            let hasDupes = false;
            let dupeData: { numero_comprobante: string; fecha: string; monto_ars: number }[] = [];

            if (numero.trim()) {
                // Case 1: Check by numero_comprobante + entity
                let query = supabase.from('contable_comprobantes')
                    .select('numero_comprobante, fecha, monto_ars')
                    .eq('tenant_id', tenant.id)
                    .eq('numero_comprobante', numero.trim());
                if (entityValue) query = query.eq(entityField, entityValue);
                const { data: dupes } = await query;
                if (dupes && dupes.length > 0) {
                    hasDupes = true;
                    dupeData = dupes.slice(0, 3) as typeof dupeData;
                }
            } else if (entityValue && totalFinal > 0) {
                // Case 2: No numero — check by entity + fecha + monto (exact match)
                const { data: dupes } = await supabase.from('contable_comprobantes')
                    .select('numero_comprobante, fecha, monto_ars')
                    .eq('tenant_id', tenant.id)
                    .eq(entityField, entityValue)
                    .eq('fecha', fecha)
                    .eq('monto_original', totalFinal);
                if (dupes && dupes.length > 0) {
                    hasDupes = true;
                    dupeData = dupes.slice(0, 3) as typeof dupeData;
                }
            }

            if (hasDupes) {
                setDuplicateWarning({
                    count: dupeData.length,
                    existing: dupeData,
                });
                return;
            }
        }

        setSkipDuplicateCheck(false); // Reset for next save
        setSaving(true);

        const tipoCambioNum = moneda === 'USD' ? parseFloat(tipoCambio) || 1 : null;
        const montoArs = moneda === 'USD' ? totalFinal * (tipoCambioNum || 1) : totalFinal;

        // If Remito or Recibo, auto-generate PDF and upload to Storage
        let pdfUrl: string | null = null;
        const isDocumentType = isRemito || isRecibo;
        if (isDocumentType) {
            try {
                const doc = isRecibo ? generateReciboPdf() : generateRemitoPdf();
                const pdfBlob = doc.output('blob');
                const docLabel = isRecibo ? 'Recibo' : 'Remito';
                const folder = isRecibo ? 'recibos' : 'remitos';
                const fileName = `${folder}/${tenant.id}/${Date.now()}_${docLabel}_${(numero || 'SN').replace(/[^a-zA-Z0-9-_]/g, '')}_${fecha}.pdf`;
                const { error: upErr } = await supabase.storage
                    .from('comprobantes-pdf')
                    .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: false });
                if (upErr) {
                    console.warn(`[${docLabel}] Storage upload error:`, upErr);
                } else {
                    const { data: urlData } = supabase.storage.from('comprobantes-pdf').getPublicUrl(fileName);
                    pdfUrl = urlData.publicUrl;
                }
            } catch (pdfErr) {
                console.warn('[PDF] Generation error:', pdfErr);
            }
        }

        const recTotal = recItems.reduce((s, i) => s + i.monto, 0);

        const payload = {
            tenant_id: tenant.id,
            tipo,
            fecha,
            fecha_contable: fecha,
            numero_comprobante: numero.trim() || null,
            tipo_comprobante: tipoComp || null,
            proveedor_id: tipo === 'compra' ? (proveedorId || null) : null,
            cliente_id: tipo === 'venta' ? (clienteId || null) : null,
            producto_servicio_id: productoId || (lineas.length === 1 && lineas[0].producto_servicio_id ? lineas[0].producto_servicio_id : null),
            centro_costo_id: centroCostoId || null,
            categoria_id: categoriaId || null,
            moneda,
            monto_original: isRemito ? 0 : isRecibo ? recTotal : totalFinal,
            tipo_cambio: tipoCambioNum,
            monto_ars: isRemito ? 0 : isRecibo ? (moneda === 'USD' ? recTotal * (tipoCambioNum || 1) : recTotal) : montoArs,
            lineas: isRemito
                ? remItems.map(i => ({ descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad }))
                : isRecibo
                    ? recItems.map(i => ({ descripcion: i.concepto, cantidad: 1, precio_unitario: i.monto, subtotal: i.monto, total: i.monto }))
                    : lineas.map(l => ({
                        producto_servicio_id: l.producto_servicio_id || null,
                        descripcion: l.descripcion,
                        cantidad: l.cantidad,
                        precio_unitario: l.precio_unitario,
                        iva_porcentaje: l.iva_porcentaje,
                        subtotal: l.cantidad * l.precio_unitario,
                        iva: l.cantidad * l.precio_unitario * l.iva_porcentaje / 100,
                        total: l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100),
                    })),
            descripcion: descripcion.trim() || (isRemito ? `Remito ${numero || ''}`.trim() : isRecibo ? `Recibo ${numero || ''}`.trim() : null),
            observaciones: observaciones.trim() || null,
            estado: 'pendiente' as const,
            clasificacion_score: 100,
            clasificado_por: 'manual',
            source: isRemito ? 'remito' : isRecibo ? 'recibo' : 'manual',
            pdf_url: pdfUrl,
        };

        const { error: err } = await supabase.from('contable_comprobantes').insert(payload);
        setSaving(false);

        if (err) { setError('Error al guardar: ' + err.message); return; }

        // Reset
        setNumero(''); setTipoComp(''); setDescripcion(''); setObs('');
        setProveedorId(''); setClienteId(''); setProductoId(''); setCentroId(''); setCategoriaId('');
        setTipoCambio(''); setEntitySearch('');
        setLineas([{ id: newId(), producto_servicio_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3500);
        onSuccess?.();
    };

    /* ─── Remito helpers ─── */
    const addRemItem = () => setRemItems(prev => [...prev, { id: newId(), descripcion: '', cantidad: 1, unidad: 'UN' }]);
    const removeRemItem = (id: string) => { if (remItems.length > 1) setRemItems(prev => prev.filter(i => i.id !== id)); };
    const updateRemItem = (id: string, field: keyof RemItem, value: string | number) => setRemItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

    const generateRemitoPdf = () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const w = doc.internal.pageSize.getWidth();
        const half = (w - 30) / 2 - 3; // half width for 2-col layout
        const entityName = selectedEntity?.razon_social || '—';
        const entityCuit = selectedEntity ? ('cuit' in selectedEntity ? selectedEntity.cuit : '') : '';
        const tenantName = tenant?.razon_social || tenant?.name || '';
        const tenantCuit = tenant?.cuit || '';
        const tenantDir = tenant?.direccion || '';

        // Header
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('REMITO', w / 2, 25, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`N°: ${numero || 'S/N'}`, w - 20, 25, { align: 'right' });
        doc.text(`Fecha: ${fecha}`, w - 20, 31, { align: 'right' });

        // Remitente box (left)
        doc.setDrawColor(200);
        doc.rect(15, 40, half, 28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('REMITENTE', 20, 47);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(tenantName, 20, 54);
        if (tenantCuit) doc.text(`CUIT: ${tenantCuit}`, 20, 60);
        if (tenantDir) doc.text(tenantDir, 20, 66, { maxWidth: half - 10 });

        // Destinatario box (right)
        const rightX = 15 + half + 6;
        doc.rect(rightX, 40, half, 28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('DESTINATARIO', rightX + 5, 47);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(entityName, rightX + 5, 54);
        if (entityCuit) doc.text(`CUIT: ${entityCuit}`, rightX + 5, 60);
        if (remDireccion) doc.text(remDireccion, rightX + 5, 66, { maxWidth: half - 10 });

        // Transportista
        if (remTransportista) {
            doc.rect(15, 73, w - 30, 12);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('TRANSPORTISTA', 20, 80);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(remTransportista, 60, 80);
        }

        // Items table
        const tableTop = remTransportista ? 95 : 80;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setFillColor(240, 240, 240);
        doc.rect(15, tableTop, w - 30, 8, 'F');
        doc.text('CANT.', 20, tableTop + 6);
        doc.text('UNIDAD', 45, tableTop + 6);
        doc.text('DESCRIPCIÓN', 75, tableTop + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        let y = tableTop + 14;
        remItems.forEach(item => {
            if (item.descripcion || item.cantidad) {
                doc.text(String(item.cantidad), 20, y);
                doc.text(item.unidad, 45, y);
                doc.text(item.descripcion, 75, y);
                y += 7;
            }
        });

        // Line separator
        doc.setDrawColor(200);
        doc.line(15, y + 2, w - 15, y + 2);

        // Observations
        if (observaciones) {
            y += 10;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVACIONES:', 20, y);
            doc.setFont('helvetica', 'normal');
            doc.text(observaciones, 20, y + 6);
            y += 16;
        }

        // Signature lines
        const sigY = Math.max(y + 20, 240);
        doc.line(25, sigY, 90, sigY);
        doc.line(w - 90, sigY, w - 25, sigY);
        doc.setFontSize(8);
        doc.text('Firma y aclaración (entregó)', 30, sigY + 5);
        doc.text('Firma y aclaración (recibió)', w - 88, sigY + 5);

        return doc;
    };

    const handleDownloadRemitoPdf = () => {
        const doc = generateRemitoPdf();
        doc.save(`Remito_${numero || 'SN'}_${fecha}.pdf`);
    };

    const handleSendRemitoEmail = async () => {
        if (!remEmail) return;
        setRemSending(true);
        try {
            const doc = generateRemitoPdf();
            const pdfBase64 = doc.output('datauristring');
            const resp = await fetch('/api/n8n-send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: remEmail,
                    subject: `Remito ${numero || 'S/N'} \u2014 ${fecha}`,
                    pdf_base64: pdfBase64,
                    filename: `Remito_${numero || 'SN'}_${fecha}.pdf`,
                    from_name: tenant?.razon_social || tenant?.name || 'NeuraCore',
                    from_email: tenant?.email || undefined,
                }),
            });
            if (!resp.ok) throw new Error(`n8n respondió ${resp.status}`);
            setRemSent(true);
            setTimeout(() => setRemSent(false), 3000);
        } catch (err) {
            console.error('[Remito] Email error:', err);
            alert('Error al enviar email: ' + (err as Error).message);
        }
        setRemSending(false);
    };

    /* ─── Recibo helpers ─── */
    const addRecItem = () => setRecItems(prev => [...prev, { id: newId(), concepto: '', monto: 0 }]);
    const removeRecItem = (id: string) => { if (recItems.length > 1) setRecItems(prev => prev.filter(i => i.id !== id)); };
    const updateRecItem = (id: string, field: keyof RecItem, value: string | number) => setRecItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    const recTotalMonto = recItems.reduce((s, i) => s + i.monto, 0);

    const generateReciboPdf = () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const w = doc.internal.pageSize.getWidth();
        const half = (w - 30) / 2 - 3;
        const entityName = selectedEntity?.razon_social || '—';
        const entityCuit = selectedEntity ? ('cuit' in selectedEntity ? selectedEntity.cuit : '') : '';
        const tenantName = tenant?.razon_social || tenant?.name || '';
        const tenantCuit = tenant?.cuit || '';
        const tenantDir = tenant?.direccion || '';

        // Header
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('RECIBO', w / 2, 25, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`N°: ${numero || 'S/N'}`, w - 20, 25, { align: 'right' });
        doc.text(`Fecha: ${fecha}`, w - 20, 31, { align: 'right' });

        // Emisor box (left)
        doc.setDrawColor(200);
        doc.rect(15, 40, half, 28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('EMISOR', 20, 47);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(tenantName, 20, 54);
        if (tenantCuit) doc.text(`CUIT: ${tenantCuit}`, 20, 60);
        if (tenantDir) doc.text(tenantDir, 20, 66, { maxWidth: half - 10 });

        // Recibí de box (right)
        const rightX = 15 + half + 6;
        doc.rect(rightX, 40, half, 28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('RECIBÍ DE', rightX + 5, 47);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(entityName, rightX + 5, 54);
        if (entityCuit) doc.text(`CUIT: ${entityCuit}`, rightX + 5, 60);

        // Forma de pago
        doc.rect(15, 73, w - 30, 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('FORMA DE PAGO', 20, 80);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(recFormaPago, 60, 80);

        // Conceptos table
        const tableTop = 95;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setFillColor(240, 240, 240);
        doc.rect(15, tableTop, w - 30, 8, 'F');
        doc.text('CONCEPTO', 20, tableTop + 6);
        doc.text('MONTO', w - 20, tableTop + 6, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        let y = tableTop + 14;
        recItems.forEach(item => {
            if (item.concepto || item.monto) {
                doc.text(item.concepto || '—', 20, y);
                doc.text(fmt(item.monto), w - 20, y, { align: 'right' });
                y += 7;
            }
        });

        // Total line
        doc.setDrawColor(100);
        doc.line(15, y + 2, w - 15, y + 2);
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('TOTAL:', w - 70, y);
        doc.text(fmt(recTotalMonto), w - 20, y, { align: 'right' });

        // Observations
        if (observaciones) {
            y += 12;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVACIONES:', 20, y);
            doc.setFont('helvetica', 'normal');
            doc.text(observaciones, 20, y + 6, { maxWidth: w - 40 });
            y += 16;
        }

        // Signature lines
        const sigY = Math.max(y + 20, 240);
        doc.line(25, sigY, 90, sigY);
        doc.line(w - 90, sigY, w - 25, sigY);
        doc.setFontSize(8);
        doc.text('Firma emisor', 40, sigY + 5);
        doc.text('Firma receptor', w - 75, sigY + 5);

        return doc;
    };

    const handleDownloadReciboPdf = () => {
        const doc = generateReciboPdf();
        doc.save(`Recibo_${numero || 'SN'}_${fecha}.pdf`);
    };

    const handleSendReciboEmail = async () => {
        if (!recEmail) return;
        setRecSending(true);
        try {
            const doc = generateReciboPdf();
            const pdfBase64 = doc.output('datauristring');
            const resp = await fetch('/api/n8n-send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: recEmail,
                    subject: `Recibo ${numero || 'S/N'} \u2014 ${fecha}`,
                    pdf_base64: pdfBase64,
                    filename: `Recibo_${numero || 'SN'}_${fecha}.pdf`,
                    from_name: tenant?.razon_social || tenant?.name || 'NeuraCore',
                    from_email: tenant?.email || undefined,
                }),
            });
            if (!resp.ok) throw new Error(`n8n respondió ${resp.status}`);
            setRecSent(true);
            setTimeout(() => setRecSent(false), 3000);
        } catch (err) {
            console.error('[Recibo] Email error:', err);
            alert('Error al enviar email: ' + (err as Error).message);
        }
        setRecSending(false);
    };

    /* ─── Render ─────────────────────────────────────── */

    return (
        <>
            <div style={{ maxWidth: (isRemito || isRecibo) ? 1200 : 860, margin: '0 auto' }}>

                {/* Success banner */}
                {success && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--color-success-dim)', border: '1px solid rgba(22,163,74,0.3)',
                        borderRadius: 'var(--radius-md)', padding: '0.875rem 1.25rem',
                        color: 'var(--color-success)', fontWeight: 600, fontSize: '0.875rem',
                        marginBottom: '1.25rem',
                    }}>
                        <CheckCircle size={18} />
                        Comprobante guardado correctamente. Estado: Pendiente de clasificación.
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'var(--color-danger-dim)', border: '1px solid rgba(220,38,38,0.3)',
                        borderRadius: 'var(--radius-md)', padding: '0.875rem 1.25rem',
                        color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '1.25rem',
                    }}>
                        {error}
                    </div>
                )}

                {/* ── SECCIÓN 1: Header ── */}
                <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                        Datos del Comprobante
                    </div>

                    {/* Tipo toggle */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        {(['compra', 'venta'] as const).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => { setTipo(t); setProveedorId(''); setClienteId(''); setEntitySearch(''); }}
                                style={{
                                    flex: 1, padding: '0.625rem', borderRadius: 'var(--radius-md)',
                                    border: tipo === t ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                                    background: tipo === t ? 'var(--color-accent-dim)' : 'var(--color-bg-surface)',
                                    color: tipo === t ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                    fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                                    transition: 'all 0.12s',
                                }}
                            >
                                {t === 'compra' ? '↙ Compra' : '↗ Venta'}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        {/* Fecha */}
                        <div className="form-group">
                            <label className="form-label">Fecha *</label>
                            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} autoFocus />
                        </div>
                        {/* N° Comprobante */}
                        <div className="form-group">
                            <label className="form-label">N° Comprobante</label>
                            <input className="form-input" placeholder="0001-00000100" value={numero} onChange={e => setNumero(e.target.value)}
                                style={{ fontFamily: 'var(--font-mono)' }} />
                        </div>
                        {/* Tipo */}
                        <div className="form-group">
                            <label className="form-label">Tipo</label>
                            <select className="form-input" value={tipoComp} onChange={e => setTipoComp(e.target.value)}>
                                <option value="">Seleccionar...</option>
                                {TIPOS_COMPROBANTE.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        {/* Moneda */}
                        <div className="form-group">
                            <label className="form-label">Moneda</label>
                            <select className="form-input" value={moneda} onChange={e => setMoneda(e.target.value)}>
                                <option value="ARS">ARS – Peso Argentino</option>
                                <option value="USD">USD – Dólar</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Concepto Facturable / Descripción Principal</label>
                            <input
                                className="form-input"
                                placeholder={isRecibo ? "Ej: Cobro parcial de deuda" : `Ej: ${tipo === 'compra' ? 'Compra de Insumos' : 'Servicios de Consultoría'}`}
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                            />
                        </div>

                        {!isRecibo && !isRemito && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Categoría Automática (IA)</label>
                                    <select className="form-input" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                                        <option value="">Sin categoría...</option>
                                        {categorias
                                            .filter(c => c.tipo === 'ambos' || c.tipo === (tipo === 'compra' ? 'gasto' : 'ingreso'))
                                            .map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Concepto Analítico Principal</label>
                                    <select className="form-input" value={productoId} onChange={e => setProductoId(e.target.value)}>
                                        <option value="">Diferenciado por Línea</option>
                                        {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.grupo})</option>)}
                                    </select>
                                </div>
                            </>
                        )}
                        <div className="form-group" style={{ gridColumn: (isRecibo || isRemito) ? '1 / -1' : 'auto' }}>
                            <label className="form-label">Centro de Costo</label>
                            <select className="form-input" value={centroCostoId} onChange={e => setCentroId(e.target.value)}>
                                <option value="">General</option>
                                {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        {/* Tipo de cambio (solo USD) */}
                        {moneda === 'USD' && (
                            <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    Tipo de Cambio
                                    {bnaLoading && <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                                    {bnaRate && !bnaLoading && (
                                        <span style={{
                                            fontSize: '0.68rem', fontWeight: 600,
                                            padding: '0.15rem 0.5rem', borderRadius: 99,
                                            background: 'rgba(16, 185, 129, 0.1)', color: '#059669',
                                            border: '1px solid rgba(16, 185, 129, 0.2)',
                                        }}>
                                            BNA Oficial: ${bnaRate.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </span>
                                    )}
                                </label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="number" className="form-input"
                                        placeholder="1350.00" value={tipoCambio}
                                        onChange={e => setTipoCambio(e.target.value)}
                                        style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
                                    />
                                    {bnaRate && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setTipoCambio(bnaRate.toFixed(2))}
                                            style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem', whiteSpace: 'nowrap', gap: 4 }}
                                            title="Usar cotización BNA oficial del día"
                                        >
                                            <RefreshCw size={12} /> Usar BNA
                                        </button>
                                    )}
                                </div>
                                {tipoCambio && totalFinal > 0 && (
                                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                        💱 Equivalente ARS: <strong style={{ color: 'var(--color-text-primary)' }}>
                                            ${(totalFinal * parseFloat(tipoCambio)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </strong>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SECCIÓN 2: Entidad ── */}
                <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                        {tipo === 'compra' ? 'Proveedor' : 'Cliente'}
                    </div>

                    <div style={{ position: 'relative' }}>
                        <input
                            className="form-input"
                            placeholder={`Buscar ${tipo === 'compra' ? 'proveedor' : 'cliente'} por nombre o CUIT...`}
                            value={selectedEntity ? selectedEntity.razon_social : entitySearch}
                            onChange={e => { setEntitySearch(e.target.value); setEntityId(''); setShowDropdown(true); }}
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
                        />
                        {showDropdown && filteredEntities.length > 0 && !entityId && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                                maxHeight: 220, overflowY: 'auto',
                            }}>
                                {filteredEntities.slice(0, 20).map(e => (
                                    <div
                                        key={e.id}
                                        style={{ padding: '0.625rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.875rem' }}
                                        onMouseDown={() => { setEntityId(e.id); setEntitySearch(e.razon_social); setShowDropdown(false); }}
                                        className="nav-item-hover"
                                    >
                                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.razon_social}</div>
                                        {e.cuit && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>CUIT: {e.cuit}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {selectedEntity && 'condicion_fiscal' in selectedEntity && (selectedEntity as Proveedor).condicion_fiscal && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            Condición fiscal: <strong>{(selectedEntity as Proveedor).condicion_fiscal}</strong>
                            {tipoComp && <> · Tipo sugerido: <strong style={{ color: 'var(--color-accent)' }}>{tipoComp}</strong></>}
                        </div>
                    )}
                </div>

                {/* ── SECTIONS 3-5: Normal comprobante (hide when Remito/Recibo) ── */}
                {!isRemito && !isRecibo && (
                    <>
                        {/* ── SECCIÓN 3: Clasificación ── */}
                        <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                                Clasificación
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Producto / Servicio</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            className="form-input"
                                            placeholder="Buscar producto o servicio..."
                                            value={prodSearch || productos.find(p => p.id === productoId)?.nombre || ''}
                                            onChange={e => { setProdSearch(e.target.value); setProductoId(''); }}
                                            onFocus={() => setProdSearch(prev => prev || (productos.find(p => p.id === productoId)?.nombre ?? ''))}
                                        />
                                        {prodSearch && !productoId && (
                                            <div style={{
                                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                                                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                                                maxHeight: 240, overflowY: 'auto',
                                            }}>
                                                {Object.entries(productGroups).map(([group, items]) => (
                                                    <div key={group}>
                                                        <div
                                                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                                                            onClick={() => setExpandedGroups(prev => { const n = new Set(prev); n.has(group) ? n.delete(group) : n.add(group); return n; })}
                                                        >
                                                            {expandedGroups.has(group) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                            {group}
                                                        </div>
                                                        {(expandedGroups.has(group) || Object.keys(productGroups).length === 1) && items.map(p => (
                                                            <div
                                                                key={p.id}
                                                                style={{ padding: '0.5rem 1.25rem', fontSize: '0.8125rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)' }}
                                                                className="nav-item-hover"
                                                                onMouseDown={() => { setProductoId(p.id); setProdSearch(''); }}
                                                            >
                                                                {p.nombre}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Centro de Costo</label>
                                    <select className="form-input" value={centroCostoId} onChange={e => setCentroId(e.target.value)}>
                                        <option value="">Sin asignar</option>
                                        {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label className="form-label">Descripción</label>
                                    <input className="form-input" placeholder="Ej: Servicios de consultoría — Enero 2025" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        {/* ── SECCIÓN 4: Líneas de Detalle ── */}
                        <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <button
                                    type="button"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}
                                    onClick={() => setShowLineas(s => !s)}
                                >
                                    {showLineas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    Líneas de Detalle ({lineas.length})
                                </button>
                                {showLineas && (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={addLinea}>
                                        <Plus size={13} /> Agregar línea
                                    </button>
                                )}
                            </div>

                            {showLineas && (
                                <>
                                    {/* Header row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 80px 120px 90px 30px', gap: '0.5rem', padding: '0 0 0.375rem', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: '0.5rem' }}>
                                        {['Descripción', 'Cant.', 'Precio Unit.', 'IVA', ''].map(h => (
                                            <div key={h} style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)' }}>{h}</div>
                                        ))}
                                    </div>

                                    {lineas.map((l, i) => (
                                        <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '3fr 80px 120px 90px 30px', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                            <input className="form-input" placeholder={`Línea ${i + 1}`} value={l.descripcion} onChange={e => updateLinea(l.id, 'descripcion', e.target.value)} style={{ fontSize: '0.8125rem' }} tabIndex={0} />
                                            <input type="number" className="form-input" min={1} value={l.cantidad} onChange={e => updateLinea(l.id, 'cantidad', parseFloat(e.target.value) || 1)} style={{ fontSize: '0.8125rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                            <input type="number" className="form-input" min={0} step={0.01} value={l.precio_unitario === 0 ? '' : l.precio_unitario} placeholder="0.00" onChange={e => updateLinea(l.id, 'precio_unitario', parseFloat(e.target.value) || 0)} style={{ fontSize: '0.8125rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                            <select className="form-input" value={l.iva_porcentaje} onChange={e => updateLinea(l.id, 'iva_porcentaje', parseFloat(e.target.value))} style={{ fontSize: '0.8125rem' }}>
                                                {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeLinea(l.id)} disabled={lineas.length <= 1} title="Eliminar línea">
                                                <Trash2 size={13} color="var(--color-danger)" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Totals */}
                                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: '0.75rem', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', fontSize: '0.875rem' }}>
                                        <div style={{ display: 'flex', gap: '2rem' }}>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Subtotal</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, minWidth: 120, textAlign: 'right' }}>{fmt(subtotal)}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '2rem' }}>
                                            <span style={{ color: 'var(--color-text-muted)' }}>IVA</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, minWidth: 120, textAlign: 'right' }}>{fmt(totalIva)}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '2rem', borderTop: '2px solid var(--color-border)', paddingTop: '0.375rem', marginTop: '0.25rem' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Total</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.125rem', color: 'var(--color-text-primary)', minWidth: 120, textAlign: 'right' }}>
                                                {moneda === 'USD' && tipoCambio
                                                    ? `USD ${totalFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })} → ${fmt(totalFinal * parseFloat(tipoCambio || '1'))}`
                                                    : fmt(totalFinal)
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── SECCIÓN 5: Observaciones ── */}
                        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                            <div className="form-group">
                                <label className="form-label">Observaciones internas (opcional)</label>
                                <textarea
                                    className="form-input"
                                    rows={2}
                                    placeholder="Notas internas, referencia de pedido de compra, etc."
                                    value={observaciones}
                                    onChange={e => setObs(e.target.value)}
                                    style={{ resize: 'vertical', fontFamily: 'var(--font-sans)' }}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                                style={{ minWidth: 160 }}
                            >
                                <Save size={15} />
                                {saving ? 'Guardando...' : 'Guardar Comprobante'}
                            </button>
                        </div>
                    </>
                )}

                {/* ═══════════════════════════════════════════════════ */}
                {/* ══ RECIBO MODE: 2-column layout (form + preview) ══ */}
                {/* ═══════════════════════════════════════════════════ */}
                {isRecibo && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '0.5rem' }}>

                        {/* ── LEFT: Recibo Form ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* Forma de pago */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                    Datos del Recibo
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Forma de pago</label>
                                    <select className="form-input" value={recFormaPago} onChange={e => setRecFormaPago(e.target.value)}>
                                        {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Conceptos */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                                        Conceptos ({recItems.length})
                                    </div>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={addRecItem}>
                                        <Plus size={13} /> Agregar
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '3fr 120px 28px', gap: '0.5rem', padding: '0 0 0.375rem', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: '0.5rem' }}>
                                    {['Concepto', 'Monto', ''].map(h => (
                                        <div key={h} style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)' }}>{h}</div>
                                    ))}
                                </div>
                                {recItems.map((item, i) => (
                                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '3fr 120px 28px', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <input className="form-input" placeholder={`Ej: Factura A-0001-000${i + 1}`} value={item.concepto} onChange={e => updateRecItem(item.id, 'concepto', e.target.value)} style={{ fontSize: '0.8125rem' }} />
                                        <input type="number" className="form-input" min={0} step="0.01" value={item.monto || ''} onChange={e => updateRecItem(item.id, 'monto', parseFloat(e.target.value) || 0)} style={{ fontSize: '0.8125rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeRecItem(item.id)} disabled={recItems.length <= 1} title="Eliminar">
                                            <Trash2 size={13} color="var(--color-danger)" />
                                        </button>
                                    </div>
                                ))}
                                {/* Total */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border)' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>TOTAL:</span>
                                    <span style={{ fontWeight: 800, fontSize: '1.125rem', fontFamily: 'var(--font-mono)' }}>{fmt(recTotalMonto)}</span>
                                </div>
                            </div>

                            {/* Observations */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Observaciones</label>
                                    <textarea className="form-input" rows={2} placeholder="Notas adicionales para el recibo..." value={observaciones} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label">Enviar por email</label>
                                    <input type="email" className="form-input" placeholder="destinatario@email.com" value={recEmail} onChange={e => setRecEmail(e.target.value)} />
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-secondary" onClick={handleDownloadReciboPdf} style={{ flex: 1 }}>
                                    <Download size={15} /> Descargar PDF
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={handleSendReciboEmail} disabled={!recEmail || recSending} style={{ flex: 1 }}>
                                    {recSending ? <Loader size={15} className="spin" /> : <Mail size={15} />}
                                    {recSending ? 'Enviando...' : recSent ? '✓ Enviado' : 'Enviar Email'}
                                </button>
                                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                                    <Save size={15} />
                                    {saving ? 'Guardando...' : 'Guardar Recibo'}
                                </button>
                            </div>
                        </div>

                        {/* ── RIGHT: Live Preview ── */}
                        <div style={{ position: 'sticky', top: '1rem', alignSelf: 'start' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                                Vista previa
                            </div>
                            <div style={{
                                background: '#fff', color: '#111', borderRadius: 'var(--radius-lg)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.15)', padding: '2rem 2.25rem',
                                fontFamily: "'Inter', 'Helvetica', sans-serif",
                                aspectRatio: '210 / 297', maxHeight: '75vh', overflow: 'auto',
                                border: '1px solid #e5e7eb',
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #111', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.1em' }}>RECIBO</h2>
                                    <div style={{ textAlign: 'right', fontSize: '0.8125rem' }}>
                                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>N° {numero || 'S/N'}</div>
                                        <div style={{ color: '#666' }}>Fecha: {fecha}</div>
                                    </div>
                                </div>

                                {/* Emisor + Recibí de (2 columns) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                    {/* Emisor */}
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.75rem 0.875rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888', marginBottom: '0.375rem' }}>Emisor</div>
                                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{tenant?.razon_social || tenant?.name || '—'}</div>
                                        {tenant?.cuit && <div style={{ fontSize: '0.75rem', color: '#555', fontFamily: 'var(--font-mono)' }}>CUIT: {tenant.cuit}</div>}
                                        {tenant?.direccion && <div style={{ fontSize: '0.75rem', color: '#555', marginTop: 2 }}>📍 {tenant.direccion}</div>}
                                    </div>
                                    {/* Recibí de */}
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.75rem 0.875rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888', marginBottom: '0.375rem' }}>Recibí de</div>
                                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{selectedEntity?.razon_social || '—'}</div>
                                        {selectedEntity && 'cuit' in selectedEntity && selectedEntity.cuit && (
                                            <div style={{ fontSize: '0.75rem', color: '#555', fontFamily: 'var(--font-mono)' }}>CUIT: {selectedEntity.cuit}</div>
                                        )}
                                    </div>
                                </div>

                                {/* Forma de pago */}
                                <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.625rem 1rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Forma de pago: </span>
                                    <span style={{ fontWeight: 600 }}>{recFormaPago}</span>
                                </div>

                                {/* Conceptos table */}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                                            <th style={{ padding: '0.5rem 0.625rem', textAlign: 'left', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666' }}>Concepto</th>
                                            <th style={{ padding: '0.5rem 0.625rem', textAlign: 'right', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666' }}>Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recItems.filter(i => i.concepto || i.monto > 0).map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 ? '#fafafa' : '#fff' }}>
                                                <td style={{ padding: '0.5rem 0.625rem' }}>{item.concepto || <span style={{ color: '#ccc', fontStyle: 'italic' }}>Sin concepto</span>}</td>
                                                <td style={{ padding: '0.5rem 0.625rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(item.monto)}</td>
                                            </tr>
                                        ))}
                                        {recItems.filter(i => i.concepto || i.monto > 0).length === 0 && (
                                            <tr><td colSpan={2} style={{ padding: '1.5rem', textAlign: 'center', color: '#aaa', fontStyle: 'italic' }}>Agregá conceptos al recibo</td></tr>
                                        )}
                                    </tbody>
                                </table>

                                {/* Total */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', padding: '0.75rem 0.625rem', borderTop: '2px solid #111', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.05em' }}>TOTAL:</span>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{fmt(recTotalMonto)}</span>
                                </div>

                                {/* Observations */}
                                {observaciones && (
                                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888', marginBottom: '0.25rem' }}>Observaciones</div>
                                        <div style={{ fontSize: '0.8125rem', color: '#555', whiteSpace: 'pre-wrap' }}>{observaciones}</div>
                                    </div>
                                )}

                                {/* Signature lines */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '2rem' }}>
                                    <div style={{ width: '40%', textAlign: 'center' }}>
                                        <div style={{ borderTop: '1px solid #999', paddingTop: '0.375rem', fontSize: '0.6875rem', color: '#888' }}>Firma emisor</div>
                                    </div>
                                    <div style={{ width: '40%', textAlign: 'center' }}>
                                        <div style={{ borderTop: '1px solid #999', paddingTop: '0.375rem', fontSize: '0.6875rem', color: '#888' }}>Firma receptor</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════ */}
                {/* ══ REMITO MODE: 2-column layout (form + preview) ══ */}
                {/* ═══════════════════════════════════════════════════ */}
                {isRemito && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '0.5rem' }}>

                        {/* ── LEFT: Remito Form ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* Dirección de entrega */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                    Datos del Remito
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label">Dirección de entrega</label>
                                    <input className="form-input" placeholder="Av. Corrientes 1234, CABA" value={remDireccion} onChange={e => setRemDireccion(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Transportista</label>
                                    <input className="form-input" placeholder="Nombre del transportista o empresa" value={remTransportista} onChange={e => setRemTransportista(e.target.value)} />
                                </div>
                            </div>

                            {/* Items */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                                        Ítems ({remItems.length})
                                    </div>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={addRemItem}>
                                        <Plus size={13} /> Agregar
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 28px', gap: '0.5rem', padding: '0 0 0.375rem', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: '0.5rem' }}>
                                    {['Descripción', 'Cant.', 'Unidad', ''].map(h => (
                                        <div key={h} style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)' }}>{h}</div>
                                    ))}
                                </div>
                                {remItems.map((item, i) => (
                                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 28px', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <input className="form-input" placeholder={`Ítem ${i + 1}`} value={item.descripcion} onChange={e => updateRemItem(item.id, 'descripcion', e.target.value)} style={{ fontSize: '0.8125rem' }} />
                                        <input type="number" className="form-input" min={1} value={item.cantidad} onChange={e => updateRemItem(item.id, 'cantidad', parseFloat(e.target.value) || 1)} style={{ fontSize: '0.8125rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                                        <select className="form-input" value={item.unidad} onChange={e => updateRemItem(item.id, 'unidad', e.target.value)} style={{ fontSize: '0.8125rem' }}>
                                            {['UN', 'KG', 'LT', 'MT', 'M2', 'M3', 'CM', 'PAR', 'JUEGO', 'CAJA', 'BOLSA', 'ROLLO'].map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeRemItem(item.id)} disabled={remItems.length <= 1} title="Eliminar">
                                            <Trash2 size={13} color="var(--color-danger)" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Observations */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Observaciones</label>
                                    <textarea className="form-input" rows={2} placeholder="Notas adicionales para el remito..." value={observaciones} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="card" style={{ padding: '1.25rem' }}>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label">Enviar por email</label>
                                    <input type="email" className="form-input" placeholder="destinatario@email.com" value={remEmail} onChange={e => setRemEmail(e.target.value)} />
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-secondary" onClick={handleDownloadRemitoPdf} style={{ flex: 1 }}>
                                    <Download size={15} /> Descargar PDF
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={handleSendRemitoEmail} disabled={!remEmail || remSending} style={{ flex: 1 }}>
                                    {remSending ? <Loader size={15} className="spin" /> : <Mail size={15} />}
                                    {remSending ? 'Enviando...' : remSent ? '✓ Enviado' : 'Enviar Email'}
                                </button>
                                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                                    <Save size={15} />
                                    {saving ? 'Guardando...' : 'Guardar Remito'}
                                </button>
                            </div>
                        </div>

                        {/* ── RIGHT: Live Preview ── */}
                        <div style={{ position: 'sticky', top: '1rem', alignSelf: 'start' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                                Vista previa
                            </div>
                            <div style={{
                                background: '#fff', color: '#111', borderRadius: 'var(--radius-lg)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.15)', padding: '2rem 2.25rem',
                                fontFamily: "'Inter', 'Helvetica', sans-serif",
                                aspectRatio: '210 / 297', maxHeight: '75vh', overflow: 'auto',
                                border: '1px solid #e5e7eb',
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #111', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.1em' }}>REMITO</h2>
                                    <div style={{ textAlign: 'right', fontSize: '0.8125rem' }}>
                                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>N° {numero || 'S/N'}</div>
                                        <div style={{ color: '#666' }}>Fecha: {fecha}</div>
                                    </div>
                                </div>

                                {/* Remitente + Destinatario (2 columns) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                    {/* Remitente */}
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.75rem 0.875rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888', marginBottom: '0.375rem' }}>Remitente</div>
                                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{tenant?.razon_social || tenant?.name || '—'}</div>
                                        {tenant?.cuit && <div style={{ fontSize: '0.75rem', color: '#555', fontFamily: 'var(--font-mono)' }}>CUIT: {tenant.cuit}</div>}
                                        {tenant?.direccion && <div style={{ fontSize: '0.75rem', color: '#555', marginTop: 2 }}>📍 {tenant.direccion}</div>}
                                    </div>
                                    {/* Destinatario */}
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.75rem 0.875rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888', marginBottom: '0.375rem' }}>Destinatario</div>
                                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{selectedEntity?.razon_social || '—'}</div>
                                        {selectedEntity && 'cuit' in selectedEntity && selectedEntity.cuit && (
                                            <div style={{ fontSize: '0.75rem', color: '#555', fontFamily: 'var(--font-mono)' }}>CUIT: {selectedEntity.cuit}</div>
                                        )}
                                        {remDireccion && <div style={{ fontSize: '0.75rem', color: '#555', marginTop: 2 }}>📍 {remDireccion}</div>}
                                    </div>
                                </div>

                                {/* Transportista */}
                                {remTransportista && (
                                    <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '0.625rem 1rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888' }}>Transportista: </span>
                                        <span style={{ fontWeight: 600 }}>{remTransportista}</span>
                                    </div>
                                )}

                                {/* Items table */}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                                            <th style={{ padding: '0.5rem 0.625rem', textAlign: 'left', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666' }}>Cant.</th>
                                            <th style={{ padding: '0.5rem 0.625rem', textAlign: 'left', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666' }}>Unidad</th>
                                            <th style={{ padding: '0.5rem 0.625rem', textAlign: 'left', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666' }}>Descripción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {remItems.filter(i => i.descripcion || i.cantidad > 0).map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 ? '#fafafa' : '#fff' }}>
                                                <td style={{ padding: '0.5rem 0.625rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.cantidad}</td>
                                                <td style={{ padding: '0.5rem 0.625rem', color: '#555' }}>{item.unidad}</td>
                                                <td style={{ padding: '0.5rem 0.625rem' }}>{item.descripcion || <span style={{ color: '#ccc', fontStyle: 'italic' }}>Sin descripción</span>}</td>
                                            </tr>
                                        ))}
                                        {remItems.filter(i => i.descripcion || i.cantidad > 0).length === 0 && (
                                            <tr><td colSpan={3} style={{ padding: '1.5rem', textAlign: 'center', color: '#aaa', fontStyle: 'italic' }}>Agregá ítems al remito</td></tr>
                                        )}
                                    </tbody>
                                </table>

                                {/* Observations */}
                                {observaciones && (
                                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#888', marginBottom: '0.25rem' }}>Observaciones</div>
                                        <div style={{ fontSize: '0.8125rem', color: '#555', whiteSpace: 'pre-wrap' }}>{observaciones}</div>
                                    </div>
                                )}

                                {/* Signature lines */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '2rem' }}>
                                    <div style={{ width: '40%', textAlign: 'center' }}>
                                        <div style={{ borderTop: '1px solid #999', paddingTop: '0.375rem', fontSize: '0.6875rem', color: '#888' }}>Firma y aclaración (entregó)</div>
                                    </div>
                                    <div style={{ width: '40%', textAlign: 'center' }}>
                                        <div style={{ borderTop: '1px solid #999', paddingTop: '0.375rem', fontSize: '0.6875rem', color: '#888' }}>Firma y aclaración (recibió)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Duplicate warning modal */}
            {
                duplicateWarning && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 440, width: '90%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <AlertTriangle size={24} color="#f59e0b" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>Posible duplicado</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        Se encontraron {duplicateWarning.count} comprobante{duplicateWarning.count > 1 ? 's' : ''} similar{duplicateWarning.count > 1 ? 'es' : ''}
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                                padding: '0.75rem', marginBottom: '1.25rem',
                            }}>
                                {duplicateWarning.existing.map((d, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.35rem 0',
                                        borderBottom: i < duplicateWarning.existing.length - 1 ? '1px solid #fde68a' : 'none',
                                        fontSize: '0.8rem',
                                    }}>
                                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#92400e' }}>
                                            {d.numero_comprobante}
                                        </span>
                                        <span style={{ color: '#92400e' }}>
                                            {new Date(d.fecha).toLocaleDateString('es-AR')} · ${Number(d.monto_ars || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setDuplicateWarning(null)}
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setDuplicateWarning(null);
                                        setSkipDuplicateCheck(true);
                                        setTimeout(() => handleSave(), 0);
                                    }}
                                    style={{ padding: '0.5rem 1rem', background: '#f59e0b', borderColor: '#f59e0b' }}
                                >
                                    Guardar de todas formas
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
