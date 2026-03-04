import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { FileText, CheckCircle, Upload, AlertTriangle, Clock, ArrowUpRight, ArrowDownLeft, TrendingUp, Send } from 'lucide-react';

interface Stats {
    pendientes: number;
    clasificados: number;
    aprobados: number;
    inyectados: number;
    errores: number;
    totalCompras: number;
    totalVentas: number;
}

interface Comprobante {
    id: string;
    tipo: string;
    fecha: string;
    numero_comprobante: string;
    tipo_comprobante: string;
    monto_ars: number;
    estado: string;
    proveedor?: { razon_social: string };
    cliente?: { razon_social: string };
    producto_servicio?: { nombre: string };
}

const estadoBadge: Record<string, { cls: string; label: string }> = {
    pendiente: { cls: 'badge-warning', label: 'Pendiente' },
    clasificado: { cls: 'badge-info', label: 'Clasificado' },
    aprobado: { cls: 'badge-success', label: 'Aprobado' },
    inyectado: { cls: 'badge-success', label: 'Inyectado' },
    error: { cls: 'badge-danger', label: 'Error' },
    rechazado: { cls: 'badge-danger', label: 'Rechazado' },
};

export default function ContableDashboard() {
    const { tenant } = useTenant();
    const [stats, setStats] = useState<Stats>({ pendientes: 0, clasificados: 0, aprobados: 0, inyectados: 0, errores: 0, totalCompras: 0, totalVentas: 0 });
    const [recientes, setRecientes] = useState<Comprobante[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    async function loadData() {
        setLoading(true);
        const tid = tenant!.id;

        // Count by estado
        const [pend, clas, aprob, inyec, err, compras, ventas, recent] = await Promise.all([
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'pendiente'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'clasificado'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'aprobado'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'inyectado'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'error'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('tipo', 'compra'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('tipo', 'venta'),
            supabase.from('contable_comprobantes')
                .select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_ars, estado, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social), producto_servicio:contable_productos_servicio(nombre)')
                .eq('tenant_id', tid)
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        setStats({
            pendientes: pend.count || 0,
            clasificados: clas.count || 0,
            aprobados: aprob.count || 0,
            inyectados: inyec.count || 0,
            errores: err.count || 0,
            totalCompras: compras.count || 0,
            totalVentas: ventas.count || 0,
        });
        setRecientes((recent.data || []) as any);
        setLoading(false);
    }

    const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

    if (loading) {
        return (
            <div>
                <div className="page-header">
                    <h1>Contable</h1>
                    <p>Cargando tablero de control...</p>
                </div>
                <div className="metrics-grid">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="metric-card" style={{ minHeight: 100 }}>
                            <div>
                                <div className="metric-title" style={{ width: 80, height: 12, background: 'var(--bg-main)', borderRadius: 6 }} />
                                <div style={{ width: 60, height: 32, background: 'var(--bg-main)', borderRadius: 8, marginTop: 12 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1>Contable</h1>
                <p>Motor de clasificación e inyección a Xubio · {tenant?.name}</p>
            </div>

            {/* KPI Cards */}
            <div className="metrics-grid">
                <div className="metric-card" style={{ borderTop: '3px solid var(--warning)' }}>
                    <div>
                        <div className="metric-title">Pendientes</div>
                        <div className="metric-value">{stats.pendientes}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Esperando clasificación
                        </div>
                    </div>
                    <div className="metric-icon primary">
                        <Clock size={22} />
                    </div>
                </div>

                <div className="metric-card" style={{ borderTop: '3px solid var(--info)' }}>
                    <div>
                        <div className="metric-title">Clasificados</div>
                        <div className="metric-value">{stats.clasificados}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Listos para aprobar
                        </div>
                    </div>
                    <div className="metric-icon info">
                        <FileText size={22} />
                    </div>
                </div>

                <div className="metric-card" style={{ borderTop: '3px solid var(--success)' }}>
                    <div>
                        <div className="metric-title">Aprobados</div>
                        <div className="metric-value">{stats.aprobados}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Listos para inyectar
                        </div>
                    </div>
                    <div className="metric-icon success">
                        <CheckCircle size={22} />
                    </div>
                </div>

                <div className="metric-card success" style={{ borderTop: '3px solid var(--success)' }}>
                    <div>
                        <div className="metric-title">Inyectados</div>
                        <div className="metric-value">{stats.inyectados}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Enviados a Xubio
                        </div>
                    </div>
                    <div className="metric-icon success">
                        <Send size={22} />
                    </div>
                </div>

                <div className="metric-card danger" style={{ borderTop: '3px solid var(--danger)' }}>
                    <div>
                        <div className="metric-title">Errores</div>
                        <div className="metric-value">{stats.errores}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Requiere atención
                        </div>
                    </div>
                    <div className="metric-icon danger">
                        <AlertTriangle size={22} />
                    </div>
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>

                {/* Recent comprobantes */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="card-header" style={{ padding: '1.25rem 1.5rem 0' }}>
                        <h3 className="card-title">Últimos Comprobantes</h3>
                    </div>
                    {recientes.length === 0 ? (
                        <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                            <Upload size={40} color="var(--text-faint)" style={{ marginBottom: '1rem' }} />
                            <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                Sin comprobantes aún
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Cuando se sincronicen facturas desde ARCA aparecerán aquí
                            </p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Fecha</th>
                                        <th>Comprobante</th>
                                        <th>Entidad</th>
                                        <th>Monto</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recientes.map(c => {
                                        const badge = estadoBadge[c.estado] || { cls: 'badge-muted', label: c.estado };
                                        const entidad = c.tipo === 'compra'
                                            ? (c.proveedor as any)?.razon_social
                                            : (c.cliente as any)?.razon_social;
                                        return (
                                            <tr key={c.id}>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        {c.tipo === 'compra'
                                                            ? <ArrowDownLeft size={14} color="var(--danger)" />
                                                            : <ArrowUpRight size={14} color="var(--success)" />
                                                        }
                                                        {c.tipo === 'compra' ? 'Compra' : 'Venta'}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(c.fecha).toLocaleDateString('es-AR')}
                                                </td>
                                                <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                    {c.numero_comprobante}
                                                </td>
                                                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {entidad || '—'}
                                                </td>
                                                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                    {fmt(c.monto_ars)}
                                                </td>
                                                <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Side panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Volume card */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
                            <TrendingUp size={16} /> Volumen
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ArrowDownLeft size={14} color="var(--danger)" />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Compras</span>
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{stats.totalCompras}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ArrowUpRight size={14} color="var(--success)" />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Ventas</span>
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{stats.totalVentas}</span>
                            </div>
                        </div>
                    </div>

                    {/* Status APIs */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>Status Integraciones</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>ARCA</span>
                                <span className="badge badge-muted">No configurado</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Xubio</span>
                                <span className="badge badge-muted">No configurado</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>DolarApi</span>
                                <span className="badge badge-success">Online</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
