import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Search, FileText, Trash2, X, Download, Mail, Send, Loader, User, DollarSign } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { DocumentViewer } from '../../../shared/components/DocumentViewer';
import PaymentModal from './PaymentModal';

interface OrdenPago {
    id: string;
    numero_op: string;
    fecha: string;
    estado: string;
    monto_neto: number;
    monto_bruto: number;
    monto_retenciones: number;
    archivo_url?: string;
    proveedor_id: string;
    proveedor: {
        razon_social: string;
    };
    treasury_transactions?: any[];
}

export default function OrdenesPagoList() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const navigate = useNavigate();
    
    const [ordenes, setOrdenes] = useState<OrdenPago[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Almacenamos toda la OP seleccionada para tener contexto en el modal (email, pdf url, id prov)
    const [selectedOp, setSelectedOp] = useState<OrdenPago | null>(null);
    
    // Almacenamos la OP que se va a pagar
    const [opToPay, setOpToPay] = useState<OrdenPago | null>(null);

    // Email state
    const [showEmailInput, setShowEmailInput] = useState(false);
    const [emailDestino, setEmailDestino] = useState('');
    const [enviandoEmail, setEnviandoEmail] = useState(false);
    
    // Filters
    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('todas');

    const fetchOrdenes = async () => {
        if (!tenant) return;
        setLoading(true);
        try {
            let query = supabase
                .from('tesoreria_ordenes_pago')
                .select(`
                    id, numero_op, fecha, estado, monto_neto, monto_bruto, monto_retenciones, archivo_url, proveedor_id,
                    proveedor:contable_proveedores(razon_social),
                    treasury_transactions(
                        id,
                        payment_method,
                        treasury_accounts ( name )
                    )
                `)
                .eq('tenant_id', tenant.id)
                .order('fecha', { ascending: false })
                .order('numero_op', { ascending: false });

            if (filtroEstado !== 'todas') {
                query = query.eq('estado', filtroEstado);
            }

            const { data, error } = await query;
            if (error) throw error;
            setOrdenes(data as any);
        } catch (error: any) {
            console.error('Error cargando OPs', error);
            addToast('error', 'Ocurrió un error al cargar las órdenes de pago');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrdenes();
    }, [tenant, filtroEstado]);

    const eliminarOP = async (id: string, numero_op: string) => {
        if (!confirm(`¿Estás seguro que deseas eliminar la Orden de Pago ${numero_op} y liberar sus facturas?`)) return;
        setLoading(true);
        try {
            // 1. Obtener los IDs de los comprobantes que estaban atados a esta OP
            const { data: compData } = await supabase
                .from('tesoreria_op_comprobantes')
                .select('comprobante_id')
                .eq('op_id', id);

            const comprobanteIds = compData ? compData.map(c => c.comprobante_id) : [];

            // 2. Liberar estado de las facturas hijas (retornar a 'aprobado' o 'pendiente')
            if (comprobanteIds.length > 0) {
                await supabase
                    .from('contable_comprobantes')
                    .update({ estado: 'aprobado' })
                    .in('id', comprobanteIds);
            }

            // 3. Borrar detalles (cascada en Supabase lo borraría igual si está configurado, pero lo forzamos limpiamente)
            await supabase.from('tesoreria_op_comprobantes').delete().eq('op_id', id);
            await supabase.from('tesoreria_op_retenciones').delete().eq('op_id', id);

            // 4. Borrar OP Cabecera
            const { error: opError } = await supabase.from('tesoreria_ordenes_pago').delete().eq('id', id);
            if (opError) throw opError;

            addToast('success', `La Orden de Pago ${numero_op} fue eliminada exitosamente`);
            fetchOrdenes(); // refrescar
        } catch (error: any) {
            console.error('Error al eliminar:', error);
            addToast('error', error.message || 'Error al eliminar la Orden de Pago');
        } finally {
            setLoading(false);
        }
    };
      const handleSendEmail = async () => {
        if (!emailDestino || !selectedOp?.archivo_url) return;
        setEnviandoEmail(true);
        try {
            const subject = `Orden de Pago ${selectedOp.numero_op} - ${tenant?.name || 'Empresa'}`;
            const body = `<p>Estimado ${selectedOp.proveedor?.razon_social || 'Proveedor'},</p><p>Adjuntamos a este correo la Orden de Pago <b>${selectedOp.numero_op}</b>, por un monto neto de $${selectedOp.monto_neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}.</p><p>Saludos cordiales,<br>${tenant?.name || 'Administración'}</p>`;

            const res = await fetch('/api/n8n-send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailDestino,
                    subject,
                    body,
                    attachmentUrl: selectedOp.archivo_url,
                    attachmentName: `OP_${selectedOp.numero_op.replace(/[\/\\]/g, '_')}.pdf`
                })
            });

            if (!res.ok) throw new Error('Error en el servicio de correo (N8N)');

            addToast('success', 'Email enviado correctamente al proveedor');
            setShowEmailInput(false);
            setEmailDestino('');
        } catch (error: any) {
            console.error('Error enviando email:', error);
            addToast('error', error.message || 'No se pudo enviar el email');
        } finally {
            setEnviandoEmail(false);
        }
    };

    const ordenesFiltradas = ordenes.filter(op => 
        (op.numero_op || '').toLowerCase().includes(busqueda.toLowerCase()) || 
        (op.proveedor?.razon_social || '').toLowerCase().includes(busqueda.toLowerCase())
    );

    const iconBtn: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Órdenes de Pago</h1>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar OP o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="todas">Todos los estados</option>
                    <option value="aprobada">Pendiente de Pago</option>
                    <option value="pagada">Abonadas</option>
                    <option value="anulada">Anuladas</option>
                </select>
            </div>

            {/* Grid table */}
            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 80px 120px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
                    <span>OP / Proveedor</span><span style={{ textAlign: 'right' }}>Bruto</span><span style={{ textAlign: 'right' }}>Retenc.</span><span style={{ textAlign: 'right' }}>Neto</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
                </div>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando...</div>
                ) : ordenesFiltradas.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin órdenes de pago</div>
                ) : ordenesFiltradas.map(op => {
                    const estadoColor = op.estado === 'pagada' ? '#10B981' : op.estado === 'anulada' ? '#EF4444' : '#F59E0B';
                    const estadoLabel = op.estado === 'pagada' ? 'Abonada' : op.estado === 'anulada' ? 'Anulada' : 'Pendiente';
                    return (
                        <div key={op.id}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 80px 120px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            {/* OP + Proveedor + fecha */}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {op.proveedor?.razon_social || '—'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)' }}>{op.numero_op}</span>
                                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-faint)' }}>{op.fecha}</span>
                                </div>
                            </div>
                            {/* Bruto */}
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                ${op.monto_bruto?.toLocaleString('es-AR')}
                            </div>
                            {/* Retenciones */}
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: op.monto_retenciones > 0 ? '#EF4444' : 'var(--color-text-faint)' }}>
                                {op.monto_retenciones > 0 ? `-$${op.monto_retenciones.toLocaleString('es-AR')}` : '—'}
                            </div>
                            {/* Neto */}
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                ${op.monto_neto?.toLocaleString('es-AR')}
                            </div>
                            {/* Estado */}
                            <div>
                                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${estadoColor}15`, color: estadoColor, textTransform: 'capitalize' }}>
                                    {estadoLabel}
                                </span>
                            </div>
                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                {op.estado === 'aprobada' && (
                                    <div className="row-action-wrap">
                                        <button onClick={() => setOpToPay(op)}
                                            style={{ ...iconBtn, color: '#10B981', borderColor: '#10B98130' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#10B98110'; e.currentTarget.style.borderColor = '#10B981'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#10B98130'; }}>
                                            <DollarSign size={14} />
                                        </button>
                                        <span className="row-action-tooltip">Pagar</span>
                                    </div>
                                )}
                                <div className="row-action-wrap">
                                    <button onClick={() => { if (op.archivo_url) setSelectedOp(op); else addToast('warning', 'Sin PDF enlazado'); }}
                                        style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                                        <FileText size={14} />
                                    </button>
                                    <span className="row-action-tooltip">Ver PDF</span>
                                </div>
                                <div className="row-action-wrap">
                                    <button onClick={() => eliminarOP(op.id, op.numero_op)}
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
            </div>

            {/* PREVIEW MODAL HISTORICO DE ORDEN DE PAGO */}
            {selectedOp && selectedOp.archivo_url && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm sm:p-6" style={{ margin: 0 }}>
                    <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '90vh' }}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">Visualizar Orden de Pago</h3>
                                <p className="text-sm text-slate-500">Documento oficial desde Supabase Storage</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        navigate(`/contable/proveedores?id=${selectedOp.proveedor_id}`);
                                        setSelectedOp(null);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg shadow-sm hover:bg-blue-100 transition-colors"
                                >
                                    <User className="w-4 h-4" /> 
                                    <span>Ver Proveedor</span>
                                </button>

                                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                                {/* Email Dropdown */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowEmailInput(!showEmailInput)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                                    >
                                        <Mail className="w-4 h-4" /> 
                                        <span>Email</span>
                                    </button>
                                    {showEmailInput && (
                                        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 p-4 z-50">
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                Enviar al Proveedor
                                            </label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="email" 
                                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    placeholder="correo@ejemplo.com"
                                                    value={emailDestino}
                                                    onChange={e => setEmailDestino(e.target.value)}
                                                />
                                                <button 
                                                    onClick={handleSendEmail}
                                                    disabled={!emailDestino || enviandoEmail}
                                                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {enviandoEmail ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <a 
                                    href={selectedOp.archivo_url}
                                    download
                                    target="_blank"
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                                    rel="noreferrer"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>Descargar</span>
                                </a>

                                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                                <button
                                    onClick={() => setSelectedOp(null)}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                                    title="Cerrar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-100 overflow-hidden relative">
                            <DocumentViewer 
                                url={selectedOp.archivo_url} 
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* PAYMENT MODAL */}
            {opToPay && (
                <PaymentModal 
                    op={opToPay} 
                    onClose={() => setOpToPay(null)} 
                    onSuccess={() => {
                        setOpToPay(null);
                        fetchOrdenes();
                    }} 
                />
            )}
        </div>
    );
}
