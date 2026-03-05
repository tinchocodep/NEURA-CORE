import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { FileText, CheckCircle, Upload, AlertTriangle, Clock, ArrowUpRight, ArrowDownLeft, TrendingUp, Send, RefreshCw, DollarSign } from 'lucide-react';
import { DolarService, type DolarResumen } from '../../services/DolarService';

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
    const [dolar, setDolar] = useState<DolarResumen | null>(null);
    const [dolarLoading, setDolarLoading] = useState(true);

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    useEffect(() => {
        loadDolar();
        const interval = setInterval(loadDolar, 5 * 60 * 1000); // refresh every 5 min
        return () => clearInterval(interval);
    }, []);

    async function loadDolar(force = false) {
        setDolarLoading(true);
        const data = await DolarService.getCotizaciones(force);
        setDolar(data);
        setDolarLoading(false);
    }

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

            {/* Alert banner for pending comprobantes */}
            {stats.pendientes > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0.75rem 1.25rem', marginBottom: '1.25rem',
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'rgba(245, 158, 11, 0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <AlertTriangle size={18} color="#f59e0b" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>
                            {stats.pendientes} comprobante{stats.pendientes > 1 ? 's' : ''} pendiente{stats.pendientes > 1 ? 's' : ''} de clasificación
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                            Requieren asignación de producto/servicio antes de aprobar
                        </div>
                    </div>
                    <a
                        href="/contable/comprobantes"
                        style={{
                            fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b',
                            textDecoration: 'none', padding: '0.4rem 0.8rem',
                            borderRadius: 8, border: '1px solid #fde68a',
                            background: 'rgba(245, 158, 11, 0.08)',
                        }}
                    >
                        Ver pendientes →
                    </a>
                </div>
            )}

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
                    {/* Cotizaciones Dólar */}
                    <div className="card" style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 className="card-title" style={{ margin: 0 }}>
                                <DollarSign size={16} /> Cotizaciones
                            </h3>
                            <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => loadDolar(true)}
                                disabled={dolarLoading}
                                title="Actualizar cotizaciones"
                            >
                                <RefreshCw size={14} style={{ animation: dolarLoading ? 'spin 1s linear infinite' : 'none' }} />
                            </button>
                        </div>

                        {dolar?.error && !dolar.oficial && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginBottom: '0.75rem' }}>
                                ⚠️ {dolar.error}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            {[
                                { label: 'BNA Oficial', data: dolar?.oficial, color: 'var(--color-success)' },
                                { label: 'Blue', data: dolar?.blue, color: 'var(--color-info)' },
                                { label: 'MEP', data: dolar?.mep, color: 'var(--color-accent)' },
                                { label: 'CCL', data: dolar?.ccl, color: 'var(--color-warning)' },
                            ].map(item => (
                                <div key={item.label} style={{
                                    padding: '0.625rem', borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--color-border-subtle)',
                                    background: 'var(--color-bg-surface-2)',
                                }}>
                                    <div style={{ fontSize: '0.625rem', fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                                        {item.label}
                                    </div>
                                    {dolarLoading && !item.data ? (
                                        <div className="skeleton skeleton-text" style={{ width: '80%', marginTop: 4 }} />
                                    ) : item.data ? (
                                        <>
                                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                                                ${item.data.venta.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                            </div>
                                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                Compra: ${item.data.compra.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>—</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {dolar?.oficial && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.625rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                                {dolar.isStale ? '⚠️ Cache expirado · ' : ''}
                                Actualizado: {new Date(dolar.oficial.fechaActualizacion).toLocaleString('es-AR')}
                            </div>
                        )}
                    </div>

                    {/* Volume card */}
                    <div className="card" style={{ padding: '1.25rem' }}>
                        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
                            <TrendingUp size={16} /> Volumen
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ArrowDownLeft size={14} color="var(--color-danger)" />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Compras</span>
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{stats.totalCompras}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ArrowUpRight size={14} color="var(--color-success)" />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Ventas</span>
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{stats.totalVentas}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
