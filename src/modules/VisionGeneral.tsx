import { useEffect, useState } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { DolarService, type DolarResumen } from '../services/DolarService';
import {
    ArrowUpRight, ArrowDownLeft, DollarSign, RefreshCw,
    FileText, Upload, TrendingUp, Clock, CheckCircle,
    AlertTriangle, Building2, Zap, BarChart3,
    ArrowRight, Activity as ActivityIcon
} from 'lucide-react';

/* ─── Types ─── */
interface CrossMetrics {
    comprasMes: number;
    ventasMes: number;
    montoComprasMes: number;
    montoVentasMes: number;
    pendientes: number;
    errores: number;
    totalProveedores: number;
    totalClientes: number;
    saldoCajas: number;
    movimientosMes: number;
}

interface RecentActivity {
    id: string;
    type: 'comprobante' | 'movimiento' | 'banco';
    title: string;
    subtitle: string;
    amount: number;
    date: string;
    direction: 'in' | 'out' | 'neutral';
}

/* ─── Helpers ─── */
const fmtMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
};

const getMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    return { start, end };
};

export default function VisionGeneral() {
    const { tenant } = useTenant();
    const { displayName } = useAuth();
    const navigate = useNavigate();
    const [metrics, setMetrics] = useState<CrossMetrics | null>(null);
    const [activity, setActivity] = useState<RecentActivity[]>([]);
    const [dolar, setDolar] = useState<DolarResumen | null>(null);
    const [dolarLoading, setDolarLoading] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenant) return;
        loadAll();
    }, [tenant]);

    useEffect(() => {
        loadDolar();
        const interval = setInterval(loadDolar, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    async function loadDolar(force = false) {
        setDolarLoading(true);
        const data = await DolarService.getCotizaciones(force);
        setDolar(data);
        setDolarLoading(false);
    }

    async function loadAll() {
        setLoading(true);
        const tid = tenant!.id;
        const { start, end } = getMonthRange();

        const [
            comprasMes, ventasMes,
            montoCompras, montoVentas,
            pendientes, errores,
            proveedores, clientes,
            cuentas, movMes, recentComp
        ] = await Promise.all([
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('tipo', 'compra').gte('fecha', start).lte('fecha', end),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('tipo', 'venta').gte('fecha', start).lte('fecha', end),
            supabase.from('contable_comprobantes').select('monto_ars').eq('tenant_id', tid).eq('tipo', 'compra').gte('fecha', start).lte('fecha', end),
            supabase.from('contable_comprobantes').select('monto_ars').eq('tenant_id', tid).eq('tipo', 'venta').gte('fecha', start).lte('fecha', end),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'pendiente'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'error'),
            supabase.from('contable_proveedores').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
            supabase.from('contable_clientes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
            supabase.from('treasury_accounts').select('balance').eq('tenant_id', tid),
            supabase.from('treasury_transactions').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).gte('date', start).lte('date', end),
            supabase.from('contable_comprobantes').select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_ars, estado, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social)')
                .eq('tenant_id', tid).order('created_at', { ascending: false }).limit(8),
        ]);

        const sumCompras = (montoCompras.data || []).reduce((a: number, c: any) => a + Math.abs(Number(c.monto_ars || 0)), 0);
        const sumVentas = (montoVentas.data || []).reduce((a: number, c: any) => a + Math.abs(Number(c.monto_ars || 0)), 0);
        const saldo = (cuentas.data || []).reduce((a: number, c: any) => a + Number(c.balance || 0), 0);

        setMetrics({
            comprasMes: comprasMes.count || 0,
            ventasMes: ventasMes.count || 0,
            montoComprasMes: sumCompras,
            montoVentasMes: sumVentas,
            pendientes: pendientes.count || 0,
            errores: errores.count || 0,
            totalProveedores: proveedores.count || 0,
            totalClientes: clientes.count || 0,
            saldoCajas: saldo,
            movimientosMes: movMes.count || 0,
        });

        // Build activity feed
        const actList: RecentActivity[] = (recentComp.data || []).map((c: any) => ({
            id: c.id,
            type: 'comprobante' as const,
            title: `${c.tipo_comprobante || c.tipo} ${c.numero_comprobante || ''}`.trim(),
            subtitle: c.tipo === 'compra' ? ((c.proveedor as any)?.razon_social || '—') : ((c.cliente as any)?.razon_social || '—'),
            amount: Number(c.monto_ars || 0),
            date: c.fecha,
            direction: c.tipo === 'venta' ? 'in' as const : 'out' as const,
        }));
        setActivity(actList);
        setLoading(false);
    }

    const mesActual = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    // Quick actions
    const quickActions = [
        { label: 'Comprobantes', desc: 'Ver y clasificar', icon: FileText, path: '/contable/comprobantes', color: '#6366f1' },
        { label: 'Subir PDF', desc: 'Importar factura', icon: Upload, path: '/contable/comprobantes', color: '#10b981' },
        { label: 'Movimientos', desc: 'Tesorería', icon: TrendingUp, path: '/tesoreria/movimientos', color: '#f59e0b' },
        { label: 'Proveedores', desc: 'Base de datos', icon: Building2, path: '/contable/proveedores', color: '#3b82f6' },
    ];

    if (loading || !metrics) {
        return (
            <div style={{ padding: '2rem' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ width: 260, height: 28, background: 'var(--bg-subtle)', borderRadius: 8, marginBottom: 8 }} />
                    <div style={{ width: 400, height: 16, background: 'var(--bg-subtle)', borderRadius: 6 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="card" style={{ padding: '1.5rem', minHeight: 100 }}>
                            <div style={{ width: 80, height: 12, background: 'var(--bg-subtle)', borderRadius: 6, marginBottom: 12 }} />
                            <div style={{ width: 100, height: 28, background: 'var(--bg-subtle)', borderRadius: 8 }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* ── Header with greeting ── */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                    {getGreeting()}, {displayName || 'usuario'} 👋
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Resumen de {mesActual} · {tenant?.name}
                </p>
            </div>

            {/* ── Alert bar ── */}
            {(metrics.pendientes > 0 || metrics.errores > 0) && (
                <div style={{
                    display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap',
                }}>
                    {metrics.pendientes > 0 && (
                        <div
                            onClick={() => navigate('/contable/comprobantes')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem',
                                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                                cursor: 'pointer', transition: 'transform 0.15s', flex: 1, minWidth: 200,
                            }}
                        >
                            <Clock size={16} color="#f59e0b" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e' }}>
                                {metrics.pendientes} comprobante{metrics.pendientes > 1 ? 's' : ''} pendiente{metrics.pendientes > 1 ? 's' : ''}
                            </span>
                            <ArrowRight size={14} color="#f59e0b" style={{ marginLeft: 'auto' }} />
                        </div>
                    )}
                    {metrics.errores > 0 && (
                        <div
                            onClick={() => navigate('/contable/comprobantes')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem',
                                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                                cursor: 'pointer', transition: 'transform 0.15s', flex: 1, minWidth: 200,
                            }}
                        >
                            <AlertTriangle size={16} color="#dc2626" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b' }}>
                                {metrics.errores} con errores
                            </span>
                            <ArrowRight size={14} color="#dc2626" style={{ marginLeft: 'auto' }} />
                        </div>
                    )}
                </div>
            )}

            {/* ── Main KPI Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {/* Ventas Mes */}
                <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-success)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <ArrowUpRight size={14} color="var(--color-success)" />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ventas del mes</span>
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.montoVentasMes)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.ventasMes)} comprobantes</div>
                </div>

                {/* Compras Mes */}
                <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-danger)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <ArrowDownLeft size={14} color="var(--color-danger)" />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Compras del mes</span>
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.montoComprasMes)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.comprasMes)} comprobantes</div>
                </div>

                {/* Saldo Neto */}
                <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--brand)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <BarChart3 size={14} color="var(--brand)" />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance neto</span>
                    </div>
                    <div style={{
                        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em',
                        color: (metrics.montoVentasMes - metrics.montoComprasMes) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                        {fmtMoney(metrics.montoVentasMes - metrics.montoComprasMes)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Ventas - Compras</div>
                </div>

                {/* Saldo Cajas */}
                <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-warning)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <DollarSign size={14} color="var(--color-warning)" />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saldo en cajas</span>
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.saldoCajas)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.movimientosMes)} movimientos este mes</div>
                </div>
            </div>

            {/* ── 3-column bottom: Quick Actions | Activity Feed | Dolar + Stats ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 300px', gap: '1rem', alignItems: 'start' }}>

                {/* Quick Actions */}
                <div className="card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={13} /> Acceso rápido
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {quickActions.map(a => (
                            <button
                                key={a.label}
                                onClick={() => navigate(a.path)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '0.6rem 0.75rem', borderRadius: 10, border: 'none',
                                    background: 'var(--bg-subtle)', cursor: 'pointer',
                                    transition: 'background 0.15s, transform 0.1s',
                                    textAlign: 'left', width: '100%',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                            >
                                <div style={{
                                    width: 30, height: 30, borderRadius: 8,
                                    background: a.color + '15', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <a.icon size={14} color={a.color} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>{a.label}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{a.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Activity Feed */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ActivityIcon size={13} /> Actividad reciente
                        </h3>
                        <button onClick={() => navigate('/contable/comprobantes')} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                            Ver todo <ArrowRight size={12} />
                        </button>
                    </div>
                    {activity.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Sin actividad reciente
                        </div>
                    ) : (
                        <div>
                            {activity.map((a, i) => (
                                <div
                                    key={a.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '0.65rem 1.25rem',
                                        borderBottom: i < activity.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                        transition: 'background 0.1s', cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    onClick={() => navigate('/contable/comprobantes')}
                                >
                                    <div style={{
                                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                        background: a.direction === 'in' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {a.direction === 'in'
                                            ? <ArrowUpRight size={13} color="#10b981" />
                                            : <ArrowDownLeft size={13} color="#ef4444" />
                                        }
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.title}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.subtitle}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{
                                            fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                                            color: a.direction === 'in' ? 'var(--color-success)' : 'var(--text-main)',
                                        }}>
                                            {a.direction === 'in' ? '+' : ''}{fmtMoney(a.amount)}
                                        </div>
                                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                            {new Date(a.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right sidebar: Dolar + Entity Stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Dolar widget */}
                    <div className="card" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <DollarSign size={13} /> Dólar
                            </h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => loadDolar(true)} disabled={dolarLoading} style={{ padding: 4 }}>
                                <RefreshCw size={12} style={{ animation: dolarLoading ? 'spin 1s linear infinite' : 'none' }} />
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                            {[
                                { label: 'Oficial', data: dolar?.oficial, color: 'var(--color-success)' },
                                { label: 'Blue', data: dolar?.blue, color: 'var(--color-info)' },
                                { label: 'MEP', data: dolar?.mep, color: 'var(--color-accent)' },
                                { label: 'CCL', data: dolar?.ccl, color: 'var(--color-warning)' },
                            ].map(item => (
                                <div key={item.label} style={{
                                    padding: '0.5rem', borderRadius: 8,
                                    border: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-subtle)',
                                }}>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                                        {item.label}
                                    </div>
                                    {dolarLoading && !item.data ? (
                                        <div style={{ width: '60%', height: 16, background: 'var(--bg-hover)', borderRadius: 4 }} />
                                    ) : item.data ? (
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                                            ${item.data.venta.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Entity stats */}
                    <div className="card" style={{ padding: '1rem' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Building2 size={13} /> Directorio
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div
                                onClick={() => navigate('/contable/proveedores')}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.5rem 0.75rem', borderRadius: 8, background: 'var(--bg-subtle)',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                            >
                                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Proveedores</span>
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand)' }}>{fmtNum(metrics.totalProveedores)}</span>
                            </div>
                            <div
                                onClick={() => navigate('/contable/clientes')}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.5rem 0.75rem', borderRadius: 8, background: 'var(--bg-subtle)',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                            >
                                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Clientes</span>
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand)' }}>{fmtNum(metrics.totalClientes)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Pipeline mini */}
                    <div className="card" style={{ padding: '1rem' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle size={13} /> Pipeline
                        </h3>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {[
                                { label: 'Pend', value: metrics.pendientes, color: '#f59e0b' },
                                { label: 'Error', value: metrics.errores, color: '#ef4444' },
                            ].map(p => (
                                <div key={p.label} style={{
                                    flex: 1, padding: '0.5rem', borderRadius: 8, textAlign: 'center',
                                    background: p.color + '10', border: `1px solid ${p.color}25`,
                                }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: p.color }}>{p.value}</div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 600, color: p.color, textTransform: 'uppercase' }}>{p.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
