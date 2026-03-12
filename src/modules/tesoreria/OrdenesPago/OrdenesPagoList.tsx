import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Calendar, Search, FileText, CheckCircle, Clock, XCircle, Trash2, X, Download, Mail, Send, Loader, User } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { DocumentViewer } from '../../../shared/components/DocumentViewer';

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
}

export default function OrdenesPagoList() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const navigate = useNavigate();
    
    const [ordenes, setOrdenes] = useState<OrdenPago[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Almacenamos toda la OP seleccionada para tener contexto en el modal (email, pdf url, id prov)
    const [selectedOp, setSelectedOp] = useState<OrdenPago | null>(null);

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
                    proveedor:contable_proveedores(razon_social)
                `)
                .eq('tenant_id', tenant.id)
                .order('fecha', { ascending: false })
                .order('numero_op', { ascending: false });

            if (filtroEstado !== 'todas') {
                query = query.eq('estado', filtroEstado);
            }

            if (busqueda) {
                // simple search doesn't work perfectly on relations without RPC, but we can do a naive filter in JS 
                // or just search by numero_op
                query = query.ilike('numero_op', `%${busqueda}%`);
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
    }, [tenant, filtroEstado, busqueda]);

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

    const getEstadoBadge = (estado: string) => {
        switch(estado) {
            case 'aprobada': return <span className="badge badge-warning"><Clock size={12} /> Pendiente de Pago</span>;
            case 'pagada': return <span className="badge badge-success"><CheckCircle size={12} /> Abonada</span>;
            case 'anulada': return <span className="badge badge-danger"><XCircle size={12} /> Anulada</span>;
            default: return <span className="badge badge-neutral">{estado}</span>;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
            <div className="card" style={{ padding: '0.875rem 1rem', display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={14} color="var(--color-text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                        className="form-input"
                        placeholder="Buscar por N° OP..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        style={{ paddingLeft: 32, height: 36 }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                        className="form-input"
                        value={filtroEstado}
                        onChange={e => setFiltroEstado(e.target.value)}
                        style={{ height: 36, maxWidth: 180 }}
                    >
                        <option value="todas">Todos los estados</option>
                        <option value="aprobada">Pendiente de Pago</option>
                        <option value="pagada">Abonadas</option>
                        <option value="anulada">Anuladas</option>
                    </select>
                </div>
            </div>

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>N° OP</th>
                                <th>Proveedor</th>
                                <th style={{ textAlign: 'right' }}>Bruto</th>
                                <th style={{ textAlign: 'right' }}>Retenciones</th>
                                <th style={{ textAlign: 'right' }}>Neto Pagado</th>
                                <th>Estado</th>
                                <th style={{ textAlign: 'right', width: 100 }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Cargando Órdenes...</td></tr>
                            ) : ordenes.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No hay Órdenes de Pago emitidas</td></tr>
                            ) : (
                                ordenes.map(op => (
                                    <tr key={op.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                                                <Calendar size={14} color="var(--color-text-muted)" />
                                                {op.fecha}
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{op.numero_op}</td>
                                        <td>{op.proveedor?.razon_social}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                            ${op.monto_bruto?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>
                                            {op.monto_retenciones > 0 ? `-$${op.monto_retenciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-accent)' }}>
                                            ${op.monto_neto?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td>{getEstadoBadge(op.estado)}</td>
                                        <td style={{ textAlign: 'right', display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                            <button 
                                                className="btn btn-ghost btn-sm btn-icon" 
                                                title="Ver Detalles / PDF"
                                                onClick={() => {
                                                    if (op.archivo_url) {
                                                        setSelectedOp(op);
                                                    } else {
                                                        addToast('warning', 'Esta Orden de Pago antigua no tiene un PDF oficial enlazado en la base de datos.');
                                                    }
                                                }}
                                            >
                                                <FileText size={16} />
                                            </button>
                                            <button 
                                                className="btn btn-ghost btn-sm btn-icon" 
                                                title="Eliminar OP y Liberar Facturas"
                                                onClick={() => eliminarOP(op.id, op.numero_op)}
                                                style={{ color: 'var(--color-danger)' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
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
        </div>
    );
}
