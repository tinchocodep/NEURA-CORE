import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Calendar, Search, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

interface OrdenPago {
    id: string;
    numero_op: string;
    fecha: string;
    estado: string;
    monto_neto: number;
    monto_bruto: number;
    monto_retenciones: number;
    proveedor: {
        razon_social: string;
    };
}

export default function OrdenesPagoList() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const [ordenes, setOrdenes] = useState<OrdenPago[]>([]);
    const [loading, setLoading] = useState(false);
    
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
                    id, numero_op, fecha, estado, monto_neto, monto_bruto, monto_retenciones,
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
                        style={{ width: 220, height: 36 }}
                    >
                        <option value="todas">Todos los estados</option>
                        <option value="aprobada">Aprobada (A Pagar)</option>
                        <option value="pagada">Pagada</option>
                        <option value="anulada">Anulada</option>
                    </select>
                </div>
            </div>

            <div className="card" style={{ borderTop: '4px solid var(--color-accent)' }}>
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Emisión</th>
                                <th>Número OP</th>
                                <th>Proveedor</th>
                                <th style={{ textAlign: 'right' }}>Bruto</th>
                                <th style={{ textAlign: 'right' }}>Retenciones</th>
                                <th style={{ textAlign: 'right' }}>Monto Neto a Pagar</th>
                                <th>Estado</th>
                                <th></th>
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
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" title="Ver Detalles">
                                                <FileText size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
