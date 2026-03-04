import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import {
    Search, Filter, ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle,
    Upload as UploadIcon, Send, Plus, Trash2, Save, FileText, X, Eye
} from 'lucide-react';

// --- Types ---

type ComprobanteEstado = 'pendiente' | 'clasificado' | 'aprobado' | 'inyectado' | 'error' | 'rechazado';
type ComprobanteAction = 'aprobar' | 'rechazar' | 'inyectar';
type TabKey = 'listado' | 'crear' | 'upload';

interface Comprobante {
    id: string;
    tipo: 'compra' | 'venta';
    fecha: string;
    numero_comprobante: string;
    tipo_comprobante: string;
    monto_original: number;
    monto_ars: number;
    moneda: string;
    tipo_cambio: number | null;
    estado: ComprobanteEstado;
    clasificacion_score: number;
    descripcion: string | null;
    observaciones: string | null;
    pdf_url: string | null;
    source: string | null;
    proveedor: { razon_social: string } | null;
    cliente: { razon_social: string } | null;
    producto_servicio: { nombre: string; grupo: string } | null;
    centro_costo: { nombre: string } | null;
}

interface Proveedor { id: string; razon_social: string; cuit: string | null; condicion_fiscal: string | null; }
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

// --- Constants ---



const TIPOS_COMPROBANTE = ['Factura A', 'Factura B', 'Factura C', 'Nota de Crédito A', 'Nota de Crédito B', 'Nota de Crédito C', 'Nota de Débito A', 'Nota de Débito B', 'Nota de Débito C', 'Recibo', 'Otro'];

const IVA_OPTIONS = [
    { value: 21, label: '21%' },
    { value: 10.5, label: '10.5%' },
    { value: 27, label: '27%' },
    { value: 0, label: 'Exento' },
];

const estadoBadge: Record<string, { cls: string; label: string }> = {
    pendiente: { cls: 'badge-warning', label: 'Pendiente' },
    clasificado: { cls: 'badge-info', label: 'Clasificado' },
    aprobado: { cls: 'badge-success', label: 'Aprobado' },
    inyectado: { cls: 'badge-success', label: 'Inyectado' },
    error: { cls: 'badge-danger', label: 'Error' },
    rechazado: { cls: 'badge-danger', label: 'Rechazado' },
};

function sugerirTipoFactura(condEmisor: string | null, condReceptor: string | null): string | null {
    if (!condEmisor || !condReceptor) return null;
    const e = condEmisor.toLowerCase();
    if (e.includes('monotribut')) return 'Factura C';
    if (e.includes('exento')) return 'Factura B';
    if (e.includes('responsable inscripto') || e.includes('resp.')) {
        const r = condReceptor.toLowerCase();
        if (r.includes('consumidor final')) return 'Factura B';
        return 'Factura A';
    }
    return null;
}

function newLineaId() {
    return crypto.randomUUID?.() || Math.random().toString(36).slice(2);
}

// --- Component ---

export default function Comprobantes() {
    const { tenant } = useTenant();

    // Tab state
    const [activeTab, setActiveTab] = useState<TabKey>('listado');

    // Listado state
    const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroTipo, setFiltroTipo] = useState<string>('todos');
    const [filtroEstado, setFiltroEstado] = useState<string>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [total, setTotal] = useState(0);

    // Form state (crear)
    const [formTipo, setFormTipo] = useState<'compra' | 'venta'>('compra');
    const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0]);
    const [formNumero, setFormNumero] = useState('');
    const [formTipoComprobante, setFormTipoComprobante] = useState('');
    const [formMoneda, setFormMoneda] = useState('ARS');
    const [formTipoCambio, setFormTipoCambio] = useState('');
    const [formProveedorId, setFormProveedorId] = useState('');
    const [formClienteId, setFormClienteId] = useState('');
    const [formProductoServicioId, setFormProductoServicioId] = useState('');
    const [formCentroCostoId, setFormCentroCostoId] = useState('');
    const [formDescripcion, setFormDescripcion] = useState('');
    const [formObservaciones, setFormObservaciones] = useState('');
    const [lineas, setLineas] = useState<LineaDetalle[]>([
        { id: newLineaId(), producto_servicio_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 },
    ]);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Catalogs for form
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [productosServicio, setProductosServicio] = useState<ProductoServicio[]>([]);
    const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);

    // Entity search
    const [entitySearch, setEntitySearch] = useState('');
    const [showEntityDropdown, setShowEntityDropdown] = useState(false);

    // Upload PDF state
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadResults, setUploadResults] = useState<{
        name: string;
        status: 'ok' | 'error';
        msg: string;
        data?: {
            numero_comprobante?: string;
            tipo?: string;
            tipo_comprobante?: string;
            fecha?: string;
            monto?: number;
            proveedor_nombre?: string;
            proveedor_nuevo?: boolean;
            proveedor_cuit?: string;
            pdf_url?: string;
        };
    }[]>([]);
    const [dragOver, setDragOver] = useState(false);

    useEffect(() => {
        if (!tenant) return;
        loadComprobantes();
        loadCatalogs();
    }, [tenant, filtroTipo, filtroEstado]);

    async function loadComprobantes() {
        setLoading(true);
        let query = supabase
            .from('contable_comprobantes')
            .select(`
                id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_original, monto_ars, moneda, tipo_cambio, estado, clasificacion_score, descripcion, observaciones, pdf_url, source,
                proveedor:contable_proveedores(razon_social),
                cliente:contable_clientes(razon_social),
                producto_servicio:contable_productos_servicio(nombre, grupo),
                centro_costo:contable_centros_costo(nombre)
            `, { count: 'exact' })
            .eq('tenant_id', tenant!.id)
            .order('fecha', { ascending: false })
            .limit(50);

        if (filtroTipo !== 'todos') query = query.eq('tipo', filtroTipo);
        if (filtroEstado !== 'todos') query = query.eq('estado', filtroEstado);

        const { data, count } = await query;
        setComprobantes((data || []) as any);
        setTotal(count || 0);
        setLoading(false);
    }

    async function loadCatalogs() {
        const [{ data: provs }, { data: clis }, { data: prods }, { data: centros }] = await Promise.all([
            supabase.from('contable_proveedores').select('id, razon_social, cuit, condicion_fiscal').eq('tenant_id', tenant!.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_clientes').select('id, razon_social, cuit').eq('tenant_id', tenant!.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_productos_servicio').select('id, nombre, grupo').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
            supabase.from('contable_centros_costo').select('id, nombre').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
        ]);
        setProveedores((provs || []) as Proveedor[]);
        setClientes((clis || []) as Cliente[]);
        setProductosServicio((prods || []) as ProductoServicio[]);
        setCentrosCosto((centros || []) as CentroCosto[]);
    }

    async function handleAction(id: string, action: ComprobanteAction) {
        const estadoMap: Record<ComprobanteAction, ComprobanteEstado> = {
            aprobar: 'aprobado',
            rechazar: 'rechazado',
            inyectar: 'inyectado',
        };
        const newEstado = estadoMap[action];
        const updatePayload: Record<string, unknown> = { estado: newEstado };
        if (action === 'inyectar') updatePayload.inyectado_at = new Date().toISOString();

        const { error } = await supabase.from('contable_comprobantes').update(updatePayload).eq('id', id);
        if (error) { console.error(`Error al ${action} comprobante:`, error.message); return; }
        loadComprobantes();
    }

    // --- Form logic ---

    const selectedEntity = formTipo === 'compra'
        ? proveedores.find(p => p.id === formProveedorId)
        : clientes.find(c => c.id === formClienteId);

    const suggestedInvoiceType = formTipo === 'compra' && selectedEntity
        ? sugerirTipoFactura('Responsable Inscripto', (selectedEntity as Proveedor).condicion_fiscal)
        : null;

    // Auto-set invoice type when entity changes
    useEffect(() => {
        if (suggestedInvoiceType && !formTipoComprobante) {
            setFormTipoComprobante(suggestedInvoiceType);
        }
    }, [formProveedorId, formClienteId]);

    function addLinea() {
        setLineas(prev => [...prev, { id: newLineaId(), producto_servicio_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
    }

    function removeLinea(id: string) {
        if (lineas.length <= 1) return;
        setLineas(prev => prev.filter(l => l.id !== id));
    }

    function updateLinea(id: string, field: keyof LineaDetalle, value: string | number) {
        setLineas(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
    }

    const subtotal = lineas.reduce((sum, l) => sum + (l.cantidad * l.precio_unitario), 0);
    const totalIva = lineas.reduce((sum, l) => sum + (l.cantidad * l.precio_unitario * l.iva_porcentaje / 100), 0);
    const totalFinal = subtotal + totalIva;

    const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

    async function handleSaveComprobante() {
        if (!tenant) return;
        setSaving(true);
        setSaveSuccess(false);

        const montoOriginal = formMoneda === 'USD' ? totalFinal : totalFinal;
        const tipoCambio = formMoneda === 'USD' ? parseFloat(formTipoCambio) || 1 : null;
        const montoArs = formMoneda === 'USD' ? totalFinal * (tipoCambio || 1) : totalFinal;

        const payload = {
            tenant_id: tenant.id,
            tipo: formTipo,
            fecha: formFecha,
            fecha_contable: formFecha,
            numero_comprobante: formNumero.trim(),
            tipo_comprobante: formTipoComprobante,
            proveedor_id: formTipo === 'compra' ? (formProveedorId || null) : null,
            cliente_id: formTipo === 'venta' ? (formClienteId || null) : null,
            producto_servicio_id: formProductoServicioId || (lineas.length === 1 && lineas[0].producto_servicio_id ? lineas[0].producto_servicio_id : null),
            centro_costo_id: formCentroCostoId || null,
            moneda: formMoneda,
            monto_original: montoOriginal,
            tipo_cambio: tipoCambio,
            monto_ars: montoArs,
            lineas: lineas.map(l => ({
                producto_servicio_id: l.producto_servicio_id || null,
                descripcion: l.descripcion,
                cantidad: l.cantidad,
                precio_unitario: l.precio_unitario,
                iva_porcentaje: l.iva_porcentaje,
                subtotal: l.cantidad * l.precio_unitario,
                iva: l.cantidad * l.precio_unitario * l.iva_porcentaje / 100,
                total: l.cantidad * l.precio_unitario * (1 + l.iva_porcentaje / 100),
            })),
            descripcion: formDescripcion.trim() || null,
            observaciones: formObservaciones.trim() || null,
            estado: 'pendiente' as const,
            clasificacion_score: 100,
            clasificado_por: 'manual',
            source: 'manual',
        };

        const { error } = await supabase.from('contable_comprobantes').insert(payload);
        setSaving(false);

        if (error) {
            alert('Error al guardar: ' + error.message);
            return;
        }

        setSaveSuccess(true);
        // Reset form
        setFormNumero('');
        setFormTipoComprobante('');
        setFormDescripcion('');
        setFormObservaciones('');
        setFormProveedorId('');
        setFormClienteId('');
        setFormProductoServicioId('');
        setFormCentroCostoId('');
        setFormTipoCambio('');
        setLineas([{ id: newLineaId(), producto_servicio_id: '', descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }]);
        setEntitySearch('');

        setTimeout(() => setSaveSuccess(false), 3000);
        loadComprobantes();
    }

    // Filtered entities for dropdown
    const entityList = formTipo === 'compra' ? proveedores : clientes;
    const filteredEntities = entitySearch
        ? entityList.filter(e => e.razon_social.toLowerCase().includes(entitySearch.toLowerCase()) || (e.cuit || '').includes(entitySearch))
        : entityList;

    const filtered = busqueda
        ? comprobantes.filter(c =>
            c.numero_comprobante.toLowerCase().includes(busqueda.toLowerCase()) ||
            ((c.proveedor as any)?.razon_social || '').toLowerCase().includes(busqueda.toLowerCase()) ||
            ((c.cliente as any)?.razon_social || '').toLowerCase().includes(busqueda.toLowerCase())
        ) : comprobantes;

    // --- Render ---

    const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
        { key: 'listado', label: 'Listado', icon: <FileText size={15} /> },
        { key: 'crear', label: 'Crear Factura', icon: <Plus size={15} /> },
        { key: 'upload', label: 'Subir PDF', icon: <UploadIcon size={15} /> },
    ];

    return (
        <div>
            <div className="page-header">
                <h1>Comprobantes</h1>
                <p>Gestión de facturas de compra y venta · {total} registros</p>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: 0, marginBottom: '1.25rem',
                borderBottom: '2px solid #e2e8f0',
            }}>
                {tabs.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: '0.875rem', fontWeight: isActive ? 600 : 400,
                                color: isActive ? '#1958E0' : '#64748b',
                                background: 'transparent', border: 'none',
                                borderBottom: isActive ? '2px solid #1958E0' : '2px solid transparent',
                                marginBottom: -2, cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ===================== TAB: LISTADO ===================== */}
            {activeTab === 'listado' && (
                <>
                    {/* Filters bar */}
                    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                className="form-input"
                                placeholder="Buscar por comprobante, proveedor o cliente..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                style={{ paddingLeft: 38, height: 40 }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Filter size={14} color="var(--text-muted)" />
                            <select className="form-input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 130, height: 40 }}>
                                <option value="todos">Todos</option>
                                <option value="compra">Compras</option>
                                <option value="venta">Ventas</option>
                            </select>
                            <select className="form-input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 150, height: 40 }}>
                                <option value="todos">Todo estado</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="clasificado">Clasificado</option>
                                <option value="aprobado">Aprobado</option>
                                <option value="inyectado">Inyectado</option>
                                <option value="error">Error</option>
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                Cargando comprobantes...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>
                                <UploadIcon size={40} color="var(--text-faint)" style={{ marginBottom: '1rem' }} />
                                <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                    Sin comprobantes
                                </p>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    Creá una factura o subí un PDF para empezar
                                </p>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}></th>
                                            <th>Fecha</th>
                                            <th>Comprobante</th>
                                            <th>Entidad</th>
                                            <th>Producto/Servicio</th>
                                            <th>Centro Costo</th>
                                            <th style={{ textAlign: 'right' }}>Monto</th>
                                            <th>Score</th>
                                            <th>Estado</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(c => {
                                            const badge = estadoBadge[c.estado] || { cls: 'badge-muted', label: c.estado };
                                            const entidad = c.tipo === 'compra'
                                                ? (c.proveedor as any)?.razon_social
                                                : (c.cliente as any)?.razon_social;
                                            const producto = (c.producto_servicio as any)?.nombre;
                                            const centro = (c.centro_costo as any)?.nombre;
                                            return (
                                                <tr key={c.id}>
                                                    <td>
                                                        {c.tipo === 'compra'
                                                            ? <ArrowDownLeft size={16} color="var(--danger)" />
                                                            : <ArrowUpRight size={16} color="var(--success)" />
                                                        }
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                                        {new Date(c.fecha).toLocaleDateString('es-AR')}
                                                    </td>
                                                    <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                        <div>{c.numero_comprobante}</div>
                                                        {c.tipo_comprobante && (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                                                                {c.tipo_comprobante}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                        {entidad || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                                                    </td>
                                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                                        {producto || <span style={{ color: 'var(--text-faint)' }}>Sin clasificar</span>}
                                                    </td>
                                                    <td>
                                                        {centro
                                                            ? <span className="badge badge-muted">{centro}</span>
                                                            : <span style={{ color: 'var(--text-faint)', fontSize: '0.8125rem' }}>—</span>
                                                        }
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        {fmt(c.monto_ars)}
                                                        {c.moneda === 'USD' && c.tipo_cambio && (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                                                USD {c.monto_original.toLocaleString()} · TC {c.tipo_cambio}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {c.clasificacion_score > 0 && (
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: '50%',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '0.7rem', fontWeight: 700,
                                                                background: c.clasificacion_score >= 80 ? 'var(--success-bg)' : c.clasificacion_score >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                                                color: c.clasificacion_score >= 80 ? 'var(--success)' : c.clasificacion_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                                                                border: `1px solid ${c.clasificacion_score >= 80 ? 'var(--success-border)' : c.clasificacion_score >= 50 ? 'var(--warning-border)' : 'var(--danger-border)'}`,
                                                            }}>
                                                                {c.clasificacion_score}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                            {(c as any).pdf_url && (
                                                                <a
                                                                    href={(c as any).pdf_url.trim()}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                                                                    title="Ver PDF"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    <Eye size={14} color="#2563eb" />
                                                                </a>
                                                            )}
                                                            {(c.estado === 'clasificado' || c.estado === 'pendiente') && (
                                                                <>
                                                                    <button onClick={() => handleAction(c.id, 'aprobar')} className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} title="Aprobar">
                                                                        <CheckCircle size={14} />
                                                                    </button>
                                                                    <button onClick={() => handleAction(c.id, 'rechazar')} className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} title="Rechazar">
                                                                        <XCircle size={14} />
                                                                    </button>
                                                                </>
                                                            )}
                                                            {c.estado === 'aprobado' && (
                                                                <button onClick={() => handleAction(c.id, 'inyectar')} className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', gap: 4 }} title="Inyectar a Xubio">
                                                                    <Send size={14} /> Inyectar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ===================== TAB: CREAR FACTURA ===================== */}
            {activeTab === 'crear' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.25rem' }}>
                    {/* Left: Form */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 1.25rem' }}>
                            Nueva Factura
                        </h2>

                        {/* Tipo compra/venta toggle */}
                        <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            {(['compra', 'venta'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => { setFormTipo(t); setFormProveedorId(''); setFormClienteId(''); setEntitySearch(''); setFormTipoComprobante(''); }}
                                    style={{
                                        flex: 1, padding: '0.5rem 1rem', border: 'none', cursor: 'pointer',
                                        fontWeight: formTipo === t ? 700 : 400, fontSize: '0.875rem',
                                        background: formTipo === t
                                            ? (t === 'compra' ? '#fef2f2' : '#f0fdf4')
                                            : '#fff',
                                        color: formTipo === t
                                            ? (t === 'compra' ? '#ef4444' : '#22c55e')
                                            : '#94a3b8',
                                        transition: 'all 0.15s ease',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}
                                >
                                    {t === 'compra' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                    {t === 'compra' ? 'Compra (recibida)' : 'Venta (emitida)'}
                                </button>
                            ))}
                        </div>

                        {/* Entity selector */}
                        <div className="form-group" style={{ position: 'relative', marginBottom: '1rem' }}>
                            <label>{formTipo === 'compra' ? 'Proveedor' : 'Cliente'}</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <input
                                        className="form-input"
                                        placeholder={`Buscar ${formTipo === 'compra' ? 'proveedor' : 'cliente'} por nombre o CUIT...`}
                                        value={selectedEntity ? selectedEntity.razon_social : entitySearch}
                                        onChange={e => {
                                            setEntitySearch(e.target.value);
                                            setShowEntityDropdown(true);
                                            if (formTipo === 'compra') setFormProveedorId('');
                                            else setFormClienteId('');
                                        }}
                                        onFocus={() => setShowEntityDropdown(true)}
                                        style={{ paddingRight: selectedEntity ? 32 : undefined }}
                                    />
                                    {selectedEntity && (
                                        <button
                                            onClick={() => {
                                                if (formTipo === 'compra') setFormProveedorId('');
                                                else setFormClienteId('');
                                                setEntitySearch('');
                                            }}
                                            style={{
                                                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                                                color: '#94a3b8',
                                            }}
                                        ><X size={14} /></button>
                                    )}
                                    {showEntityDropdown && !selectedEntity && filteredEntities.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
                                        }}>
                                            {filteredEntities.slice(0, 20).map(e => (
                                                <div
                                                    key={e.id}
                                                    onClick={() => {
                                                        if (formTipo === 'compra') setFormProveedorId(e.id);
                                                        else setFormClienteId(e.id);
                                                        setShowEntityDropdown(false);
                                                        setEntitySearch('');
                                                    }}
                                                    style={{
                                                        padding: '0.5rem 0.75rem', cursor: 'pointer',
                                                        fontSize: '0.8125rem', borderBottom: '1px solid #f1f5f9',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    }}
                                                    onMouseEnter={ev => (ev.currentTarget.style.background = '#f8fafc')}
                                                    onMouseLeave={ev => (ev.currentTarget.style.background = '')}
                                                >
                                                    <span style={{ fontWeight: 500 }}>{e.razon_social}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{e.cuit || ''}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Invoice type suggestion */}
                                {suggestedInvoiceType && (
                                    <span style={{
                                        padding: '0.3rem 0.6rem', borderRadius: 99, fontSize: '0.7rem',
                                        fontWeight: 700, whiteSpace: 'nowrap',
                                        background: suggestedInvoiceType.includes('A') ? 'rgba(25,88,224,0.1)' : suggestedInvoiceType.includes('C') ? 'rgba(13,148,136,0.1)' : 'rgba(245,158,11,0.1)',
                                        color: suggestedInvoiceType.includes('A') ? '#1958E0' : suggestedInvoiceType.includes('C') ? '#0d9488' : '#f59e0b',
                                        border: `1.5px solid ${suggestedInvoiceType.includes('A') ? 'rgba(25,88,224,0.3)' : suggestedInvoiceType.includes('C') ? 'rgba(13,148,136,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                    }}>
                                        📋 {suggestedInvoiceType}
                                    </span>
                                )}
                            </div>
                            {selectedEntity && formTipo === 'compra' && (selectedEntity as Proveedor).condicion_fiscal && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>
                                    📋 {(selectedEntity as Proveedor).condicion_fiscal}
                                </div>
                            )}
                        </div>

                        {/* Date + Number + Type row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div className="form-group">
                                <label>Fecha</label>
                                <input className="form-input" type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Nro. Comprobante</label>
                                <input className="form-input" placeholder="0001-00012345" value={formNumero} onChange={e => setFormNumero(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Tipo Comprobante</label>
                                <select className="form-input" value={formTipoComprobante} onChange={e => setFormTipoComprobante(e.target.value)}>
                                    <option value="">Seleccionar...</option>
                                    {TIPOS_COMPROBANTE.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Moneda */}
                        <div style={{ display: 'grid', gridTemplateColumns: formMoneda === 'USD' ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div className="form-group">
                                <label>Moneda</label>
                                <select className="form-input" value={formMoneda} onChange={e => setFormMoneda(e.target.value)}>
                                    <option value="ARS">ARS - Peso Argentino</option>
                                    <option value="USD">USD - Dólar</option>
                                </select>
                            </div>
                            {formMoneda === 'USD' && (
                                <div className="form-group">
                                    <label>Tipo de Cambio</label>
                                    <input className="form-input" type="number" placeholder="1200.00" step="0.01" value={formTipoCambio} onChange={e => setFormTipoCambio(e.target.value)} />
                                </div>
                            )}
                        </div>

                        {/* Centro de costo */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div className="form-group">
                                <label>Producto/Servicio (general)</label>
                                <select className="form-input" value={formProductoServicioId} onChange={e => setFormProductoServicioId(e.target.value)}>
                                    <option value="">Sin asignar</option>
                                    {productosServicio.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Centro de Costo</label>
                                <select className="form-input" value={formCentroCostoId} onChange={e => setFormCentroCostoId(e.target.value)}>
                                    <option value="">Sin asignar</option>
                                    {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Line items */}
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0f172a' }}>Detalle de ítems</label>
                                <button onClick={addLinea} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', gap: 4 }}>
                                    <Plus size={12} /> Agregar ítem
                                </button>
                            </div>

                            {lineas.map((linea, idx) => {
                                const lineTotal = linea.cantidad * linea.precio_unitario;
                                const lineIvaAmt = lineTotal * linea.iva_porcentaje / 100;
                                const inputStyle: React.CSSProperties = {
                                    width: '100%', padding: '6px 10px', borderRadius: 6,
                                    border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a',
                                    fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
                                    boxSizing: 'border-box' as const,
                                };
                                const selectStyle: React.CSSProperties = {
                                    ...inputStyle, appearance: 'auto' as const, cursor: 'pointer',
                                };
                                const labelStyle: React.CSSProperties = {
                                    fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block',
                                };
                                return (
                                    <div key={linea.id} style={{
                                        padding: '0.75rem 1rem', marginBottom: idx < lineas.length - 1 ? 8 : 0,
                                        border: '1px solid #e2e8f0', borderRadius: 8,
                                        background: '#fafbfc',
                                    }}>
                                        {/* Header: #N + description + trash */}
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>#{idx + 1}</span>
                                            <input
                                                placeholder="Descripción del ítem"
                                                value={linea.descripcion}
                                                onChange={e => updateLinea(linea.id, 'descripcion', e.target.value)}
                                                style={{ ...inputStyle, flex: 1 }}
                                            />
                                            <button
                                                onClick={() => removeLinea(linea.id)}
                                                disabled={lineas.length <= 1}
                                                style={{
                                                    background: 'none', border: 'none', padding: 4, cursor: lineas.length > 1 ? 'pointer' : 'not-allowed',
                                                    color: lineas.length > 1 ? '#f43f5e' : '#d1d5db', flexShrink: 0,
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {/* Producto - full width */}
                                        <div style={{ marginBottom: 10 }}>
                                            <span style={labelStyle}>Producto / Servicio</span>
                                            <select
                                                value={linea.producto_servicio_id}
                                                onChange={e => updateLinea(linea.id, 'producto_servicio_id', e.target.value)}
                                                style={selectStyle}
                                            >
                                                <option value="">Sin asignar</option>
                                                {productosServicio.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                            </select>
                                        </div>

                                        {/* Cant | Precio | IVA | Subtotal */}
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={labelStyle}>Cantidad</span>
                                                <input
                                                    type="number" min="1"
                                                    value={linea.cantidad}
                                                    onChange={e => updateLinea(linea.id, 'cantidad', parseInt(e.target.value) || 1)}
                                                    style={{ ...inputStyle, textAlign: 'center' }}
                                                />
                                            </div>
                                            <div style={{ flex: 1.5 }}>
                                                <span style={labelStyle}>Precio Unitario</span>
                                                <input
                                                    type="number" placeholder="0"
                                                    value={linea.precio_unitario || ''}
                                                    onChange={e => updateLinea(linea.id, 'precio_unitario', parseFloat(e.target.value) || 0)}
                                                    style={{ ...inputStyle, textAlign: 'right' }}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <span style={labelStyle}>IVA</span>
                                                <select
                                                    value={linea.iva_porcentaje}
                                                    onChange={e => updateLinea(linea.id, 'iva_porcentaje', parseFloat(e.target.value))}
                                                    style={selectStyle}
                                                >
                                                    {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1.5 }}>
                                                <span style={labelStyle}>Subtotal</span>
                                                <div style={{
                                                    padding: '6px 10px', borderRadius: 6, background: '#e8edf5',
                                                    border: '1.5px solid #cbd5e1', textAlign: 'right',
                                                    fontSize: '0.9rem', fontWeight: 700, color: '#0f172a',
                                                }}>
                                                    {fmt(lineTotal + lineIvaAmt)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Description + observaciones */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div className="form-group">
                                <label>Descripción</label>
                                <input className="form-input" placeholder="Descripción general" value={formDescripcion} onChange={e => setFormDescripcion(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Observaciones</label>
                                <input className="form-input" placeholder="Notas internas" value={formObservaciones} onChange={e => setFormObservaciones(e.target.value)} />
                            </div>
                        </div>

                        {/* Save */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            {saveSuccess && (
                                <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle size={16} /> Comprobante guardado!
                                </span>
                            )}
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveComprobante}
                                disabled={saving || !formNumero.trim()}
                                style={{ gap: 6 }}
                            >
                                {saving ? 'Guardando...' : <><Save size={16} /> Guardar Comprobante</>}
                            </button>
                        </div>
                    </div>

                    {/* Right: Summary panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Totals card */}
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b', margin: '0 0 0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                                Resumen
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                    <span style={{ color: '#64748b' }}>Subtotal</span>
                                    <span style={{ fontWeight: 500 }}>{fmt(subtotal)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                    <span style={{ color: '#64748b' }}>IVA</span>
                                    <span style={{ fontWeight: 500 }}>{fmt(totalIva)}</span>
                                </div>
                                <div style={{ height: 1, background: '#e2e8f0', margin: '0.25rem 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem' }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Total</span>
                                    <span style={{ fontWeight: 700, color: '#1958E0' }}>{fmt(totalFinal)}</span>
                                </div>
                                {formMoneda === 'USD' && formTipoCambio && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginTop: 4 }}>
                                        <span style={{ color: '#94a3b8' }}>Total ARS</span>
                                        <span style={{ fontWeight: 600, color: '#475569' }}>{fmt(totalFinal * (parseFloat(formTipoCambio) || 1))}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Info card */}
                        <div className="card" style={{ padding: '1rem', background: '#f8fafc' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                    <FileText size={14} /> Información
                                </div>
                                <p style={{ margin: 0 }}>
                                    El comprobante se guardará con estado <strong>"Pendiente"</strong>. Podés aprobarlo después desde el Listado.
                                </p>
                                {formTipo === 'compra' && (
                                    <p style={{ margin: 0, marginTop: 4 }}>
                                        💡 Al seleccionar un proveedor con condición fiscal, se sugiere automáticamente el tipo de factura.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Line items breakdown */}
                        {lineas.some(l => l.precio_unitario > 0) && (
                            <div className="card" style={{ padding: '1rem' }}>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: '0 0 0.5rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                                    Desglose por ítem
                                </h3>
                                {lineas.filter(l => l.precio_unitario > 0).map((l, i) => {
                                    const lineSubtotal = l.cantidad * l.precio_unitario;
                                    const lineIva = lineSubtotal * l.iva_porcentaje / 100;
                                    return (
                                        <div key={l.id} style={{
                                            padding: '0.4rem 0', borderBottom: i < lineas.length - 1 ? '1px solid #f1f5f9' : undefined,
                                            fontSize: '0.8125rem',
                                        }}>
                                            <div style={{ fontWeight: 500, color: '#0f172a', marginBottom: 2 }}>
                                                {l.descripcion || `Ítem ${i + 1}`}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.75rem' }}>
                                                <span>{l.cantidad} × {fmt(l.precio_unitario)}</span>
                                                <span>{fmt(lineSubtotal + lineIva)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div >
            )
            }

            {/* ===================== TAB: SUBIR PDF ===================== */}
            {activeTab === 'upload' && (() => {
                const N8N_WEBHOOK = '/api/n8n-comprobantes';

                const handleUploadFiles = async () => {
                    if (!tenant || uploadFiles.length === 0) return;
                    setUploading(true);
                    setUploadResults([]);
                    const results: typeof uploadResults = [];

                    for (const file of uploadFiles) {
                        try {
                            const formData = new FormData();
                            formData.append('data', file);
                            formData.append('tenant_id', tenant.id);
                            formData.append('filename', file.name);

                            const resp = await fetch(N8N_WEBHOOK, { method: 'POST', body: formData });

                            if (resp.ok) {
                                let data: typeof uploadResults[0]['data'] | undefined;
                                try {
                                    const json = await resp.json();
                                    // n8n returns the Supabase row (may be array or object)
                                    const row = Array.isArray(json) ? json[0] : json;
                                    if (row) {
                                        data = {
                                            numero_comprobante: row.numero_comprobante,
                                            tipo: row.tipo,
                                            tipo_comprobante: row.tipo_comprobante,
                                            fecha: row.fecha,
                                            monto: row.monto_original,
                                            proveedor_nombre: row.proveedor_nombre || row.descripcion,
                                            proveedor_cuit: row.cuit_emisor,
                                            proveedor_nuevo: row.proveedor_nuevo,
                                            pdf_url: row.pdf_url?.trim(),
                                        };
                                    }
                                } catch { /* response might not be JSON */ }
                                results.push({ name: file.name, status: 'ok', msg: 'Procesado correctamente', data });
                            } else {
                                const errText = await resp.text().catch(() => resp.statusText);
                                results.push({ name: file.name, status: 'error', msg: `Error ${resp.status}: ${errText}` });
                            }
                        } catch (err: unknown) {
                            const errMsg = err instanceof Error ? err.message : 'Error de red';
                            results.push({ name: file.name, status: 'error', msg: errMsg });
                        }
                    }

                    setUploadResults(results);
                    setUploading(false);
                    setUploadFiles([]);
                    setTimeout(() => { loadComprobantes(); loadCatalogs(); }, 2000);
                };

                const handleDrop = (e: React.DragEvent) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
                    if (files.length > 0) setUploadFiles(prev => [...prev, ...files]);
                };

                const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const files = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
                    if (files.length > 0) setUploadFiles(prev => [...prev, ...files]);
                    e.target.value = '';
                };

                return (
                    <div className="card" style={{ padding: '2rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem' }}>
                            Subir Factura PDF
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 1.5rem' }}>
                            Arrastrá PDFs de facturas acá. Se envían a n8n para extraer datos automáticamente y crear el comprobante.
                        </p>

                        {/* Drop zone */}
                        <div
                            onDrop={handleDrop}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onClick={() => document.getElementById('pdf-file-input')?.click()}
                            style={{
                                border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`,
                                borderRadius: 12, padding: '2.5rem 2rem', textAlign: 'center',
                                background: dragOver ? '#eff6ff' : '#f8fafc',
                                cursor: 'pointer', transition: 'all 0.2s ease',
                                marginBottom: '1.25rem',
                            }}
                        >
                            <UploadIcon size={40} color={dragOver ? '#3b82f6' : '#94a3b8'} />
                            <p style={{ fontSize: '0.9rem', color: dragOver ? '#3b82f6' : '#64748b', margin: '0.75rem 0 0.25rem', fontWeight: 600 }}>
                                {dragOver ? 'Soltá el archivo acá' : 'Hacé click o arrastrá un PDF'}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Solo archivos .pdf</p>
                            <input
                                id="pdf-file-input"
                                type="file"
                                accept=".pdf,application/pdf"
                                multiple
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {/* Queued files */}
                        {uploadFiles.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                                    Archivos seleccionados ({uploadFiles.length})
                                </div>
                                {uploadFiles.map((f, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                        background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
                                        marginBottom: 6, fontSize: '0.85rem',
                                    }}>
                                        <FileText size={16} color="#ef4444" />
                                        <span style={{ flex: 1, color: '#0f172a', fontWeight: 500 }}>{f.name}</span>
                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{(f.size / 1024).toFixed(0)} KB</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e', padding: 2 }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={handleUploadFiles}
                                    disabled={uploading}
                                    className="btn btn-primary"
                                    style={{ marginTop: 8, gap: 6, width: '100%', justifyContent: 'center' }}
                                >
                                    {uploading ? (
                                        <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Enviando...</>
                                    ) : (
                                        <><Send size={16} /> Enviar {uploadFiles.length} {uploadFiles.length === 1 ? 'archivo' : 'archivos'} a n8n</>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Results */}
                        {uploadResults.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 8 }}>Resultados</div>
                                {uploadResults.map((r, i) => (
                                    <div key={i} style={{
                                        padding: '12px 16px', borderRadius: 8, marginBottom: 8,
                                        background: r.status === 'ok' ? '#f0fdf4' : '#fef2f2',
                                        border: `1px solid ${r.status === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                                    }}>
                                        {/* Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: r.data ? 8 : 0 }}>
                                            {r.status === 'ok' ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                            <span style={{ flex: 1, fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{r.name}</span>
                                            {r.data?.pdf_url && (
                                                <a
                                                    href={r.data.pdf_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        color: '#2563eb', fontSize: '0.75rem', fontWeight: 600,
                                                        textDecoration: 'none', padding: '2px 8px',
                                                        background: '#eff6ff', borderRadius: 4, border: '1px solid #bfdbfe',
                                                    }}
                                                    title="Ver PDF"
                                                >
                                                    <Eye size={13} /> Ver PDF
                                                </a>
                                            )}
                                            <span style={{ fontSize: '0.75rem', color: r.status === 'ok' ? '#16a34a' : '#dc2626' }}>{r.msg}</span>
                                        </div>
                                        {/* Detail card if data available */}
                                        {r.status === 'ok' && r.data && (
                                            <div style={{
                                                background: '#fff', borderRadius: 6, padding: '10px 12px',
                                                border: '1px solid #e2e8f0', fontSize: '0.8rem',
                                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                                            }}>
                                                {r.data.numero_comprobante && (
                                                    <div><span style={{ color: '#64748b' }}>Nº:</span> <strong>{r.data.numero_comprobante}</strong></div>
                                                )}
                                                {r.data.tipo_comprobante && (
                                                    <div><span style={{ color: '#64748b' }}>Tipo:</span> <strong>{r.data.tipo_comprobante}</strong></div>
                                                )}
                                                {r.data.fecha && (
                                                    <div><span style={{ color: '#64748b' }}>Fecha:</span> <strong>{r.data.fecha}</strong></div>
                                                )}
                                                {r.data.monto != null && (
                                                    <div><span style={{ color: '#64748b' }}>Monto:</span> <strong>${Number(r.data.monto).toLocaleString('es-AR')}</strong></div>
                                                )}
                                                {r.data.proveedor_nombre && (
                                                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ color: '#64748b' }}>Proveedor:</span>
                                                        <strong>{r.data.proveedor_nombre}</strong>
                                                        {r.data.proveedor_cuit && <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>({r.data.proveedor_cuit})</span>}
                                                        {r.data.proveedor_nuevo && (
                                                            <span style={{
                                                                background: '#dbeafe', color: '#2563eb', fontSize: '0.65rem',
                                                                padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            }}>NUEVO</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}
        </div >
    );
}
