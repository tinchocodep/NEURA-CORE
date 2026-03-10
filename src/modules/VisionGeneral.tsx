import { useEffect, useState, useMemo } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { DolarService, type DolarResumen } from '../services/DolarService';
import {
    ArrowUpRight, ArrowDownLeft, DollarSign, RefreshCw,
    FileText, Upload, TrendingUp, Clock,
    AlertTriangle, Building2, Zap, BarChart3,
    ArrowRight, Activity as ActivityIcon, Calendar, PieChart, Users
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

interface EntityRanking {
    id: string;
    name: string;
    amount: number;
    count: number;
}

interface TypeBreakdown {
    tradicionalMonto: number;
    tradicionalCount: number;
    sinFacturaMonto: number;
    sinFacturaCount: number;
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

// Period calculators
const getDatesForPeriod = (period: string, customStart: string, customEnd: string) => {
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    if (period === 'last_month') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (period === 'this_quarter') {
        const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qStartMonth, 1);
    } else if (period === 'this_year') {
        start = new Date(now.getFullYear(), 0, 1);
    } else if (period === 'historical') {
        start = new Date('2000-01-01');
    } else if (period === 'custom' && customStart && customEnd) {
        start = new Date(customStart + 'T00:00:00');
        end = new Date(customEnd + 'T23:59:59');
    }

    return { start: start.toISOString(), end: end.toISOString() };
};

export default function VisionGeneral() {
    const { tenant } = useTenant();
    const { displayName } = useAuth();
    const navigate = useNavigate();

    // Core State
    const [metrics, setMetrics] = useState<CrossMetrics | null>(null);
    const [activity, setActivity] = useState<RecentActivity[]>([]);
    const [dolar, setDolar] = useState<DolarResumen | null>(null);

    // New Dashboard State
    const [period, setPeriod] = useState('this_month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [topProveedores, setTopProveedores] = useState<EntityRanking[]>([]);
    const [topClientes, setTopClientes] = useState<EntityRanking[]>([]);
    const [ventasBreakdown, setVentasBreakdown] = useState<TypeBreakdown>({ tradicionalMonto: 0, tradicionalCount: 0, sinFacturaMonto: 0, sinFacturaCount: 0 });
    const [comprasBreakdown, setComprasBreakdown] = useState<TypeBreakdown>({ tradicionalMonto: 0, tradicionalCount: 0, sinFacturaMonto: 0, sinFacturaCount: 0 });

    // UI State
    const [dolarLoading, setDolarLoading] = useState(true);
    const [loading, setLoading] = useState(true);

    // Initial load and Realtime
    useEffect(() => {
        if (!tenant) return;
        loadAll();

        const channel = supabase.channel('vision-general-metrics')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contable_comprobantes', filter: `tenant_id=eq.${tenant.id}` }, () => loadAll())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contable_proveedores', filter: `tenant_id=eq.${tenant.id}` }, () => loadAll())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contable_clientes', filter: `tenant_id=eq.${tenant.id}` }, () => loadAll())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'treasury_accounts', filter: `tenant_id=eq.${tenant.id}` }, () => loadAll())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'treasury_transactions', filter: `tenant_id=eq.${tenant.id}` }, () => loadAll())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tenant?.id, period, customStart, customEnd]);

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
        if (!tenant) return;
        setLoading(true);
        const tid = tenant.id;
        const { start, end } = getDatesForPeriod(period, customStart, customEnd);

        // Fetch aggregation counts and base state
        const [
            pendientes, errores, proveedoresCount, clientesCount, cuentas, movMes, recentComp
        ] = await Promise.all([
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'pendiente'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'error'),
            supabase.from('contable_proveedores').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('activo', true),
            supabase.from('contable_clientes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('activo', true),
            supabase.from('treasury_accounts').select('balance').eq('tenant_id', tid),
            supabase.from('treasury_transactions').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).gte('date', start).lte('date', end),
            supabase.from('contable_comprobantes').select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_ars, estado, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social)')
                .eq('tenant_id', tid).order('created_at', { ascending: false }).limit(6),
        ]);

        // Fetch all comprobantes in period for in-memory reduction (breakdowns and rankings)
        const { data: periodComprobantes } = await supabase
            .from('contable_comprobantes')
            .select('id, tipo, tipo_comprobante, monto_ars, proveedor_id, cliente_id, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social)')
            .eq('tenant_id', tid)
            .gte('fecha', start)
            .lte('fecha', end);

        const compList = periodComprobantes || [];

        // Reduce base metrics
        const sumCompras = compList.filter(c => c.tipo === 'compra').reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0);
        const sumVentas = compList.filter(c => c.tipo === 'venta').reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0);
        const countCompras = compList.filter(c => c.tipo === 'compra').length;
        const countVentas = compList.filter(c => c.tipo === 'venta').length;
        const saldo = (cuentas.data || []).reduce((a: number, c: any) => a + Number(c.balance || 0), 0);

        setMetrics({
            comprasMes: countCompras,
            ventasMes: countVentas,
            montoComprasMes: sumCompras,
            montoVentasMes: sumVentas,
            pendientes: pendientes.count || 0,
            errores: errores.count || 0,
            totalProveedores: proveedoresCount.count || 0,
            totalClientes: clientesCount.count || 0,
            saldoCajas: saldo,
            movimientosMes: movMes.count || 0,
        });

        // Produce breakdowns
        const vTrad = compList.filter(c => c.tipo === 'venta' && c.tipo_comprobante !== 'Sin Factura');
        const vSinF = compList.filter(c => c.tipo === 'venta' && c.tipo_comprobante === 'Sin Factura');
        setVentasBreakdown({
            tradicionalMonto: vTrad.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0),
            tradicionalCount: vTrad.length,
            sinFacturaMonto: vSinF.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0),
            sinFacturaCount: vSinF.length,
        });

        const cTrad = compList.filter(c => c.tipo === 'compra' && c.tipo_comprobante !== 'Sin Factura');
        const cSinF = compList.filter(c => c.tipo === 'compra' && c.tipo_comprobante === 'Sin Factura');
        setComprasBreakdown({
            tradicionalMonto: cTrad.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0),
            tradicionalCount: cTrad.length,
            sinFacturaMonto: cSinF.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0),
            sinFacturaCount: cSinF.length,
        });

        // Produce rankings
        const provMap = new Map<string, EntityRanking>();
        const cliMap = new Map<string, EntityRanking>();

        compList.forEach(c => {
            const monto = Math.abs(Number(c.monto_ars || 0));
            if (c.tipo === 'compra' && c.proveedor_id) {
                const existing = provMap.get(c.proveedor_id) || { id: c.proveedor_id, name: (c.proveedor as any)?.razon_social || 'Desconocido', amount: 0, count: 0 };
                existing.amount += monto;
                existing.count += 1;
                provMap.set(c.proveedor_id, existing);
            } else if (c.tipo === 'venta' && c.cliente_id) {
                const existing = cliMap.get(c.cliente_id) || { id: c.cliente_id, name: (c.cliente as any)?.razon_social || 'Desconocido', amount: 0, count: 0 };
                existing.amount += monto;
                existing.count += 1;
                cliMap.set(c.cliente_id, existing);
            }
        });

        setTopProveedores(Array.from(provMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5));
        setTopClientes(Array.from(cliMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5));

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

    const { start: periodStart, end: periodEnd } = getDatesForPeriod(period, customStart, customEnd);
    const periodLabel = useMemo(() => {
        if (period === 'this_month') return 'Este mes';
        if (period === 'last_month') return 'Mes pasado';
        if (period === 'this_quarter') return 'Trimestre actual';
        if (period === 'this_year') return 'Este año';
        if (period === 'historical') return 'Histórico';
        if (period === 'custom') return `${new Date(periodStart).toLocaleDateString('es-AR')} - ${new Date(periodEnd).toLocaleDateString('es-AR')}`;
        return '';
    }, [period, periodStart, periodEnd]);

    // Quick actions
    const quickActions = [
        { label: 'Comprobantes', desc: 'Ver y clasificar', icon: FileText, path: '/contable/comprobantes', color: '#6366f1' },
        { label: 'Subir PDF', desc: 'Importar factura', icon: Upload, path: '/contable/comprobantes', color: '#10b981' },
        { label: 'Movimientos', desc: 'Tesorería', icon: TrendingUp, path: '/tesoreria/movimientos', color: '#f59e0b' },
        { label: 'Proveedores', desc: 'Base de datos', icon: Building2, path: '/contable/proveedores', color: '#3b82f6' },
    ];

    if (loading && !metrics) {
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
        <div style={{ paddingBottom: '3rem' }}>
            {/* ── Header with greeting & Date Filter ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                        {getGreeting()}, {displayName || 'usuario'} 👋
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Mostrando resumen general para:</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 10%, transparent)', padding: '0.15rem 0.6rem', borderRadius: '0.5rem' }}>
                            {periodLabel}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                    <Calendar size={16} color="var(--text-muted)" style={{ marginLeft: 6 }} />
                    <select
                        className="form-input"
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        style={{ border: 'none', background: 'transparent', height: 32, padding: '0 8px', width: 150, fontWeight: 600 }}
                    >
                        <option value="this_month">Este mes</option>
                        <option value="last_month">Mes pasado</option>
                        <option value="this_quarter">Trimestre actual</option>
                        <option value="this_year">Año actual</option>
                        <option value="historical">Histórico total</option>
                        <option value="custom">Personalizado...</option>
                    </select>

                    {period === 'custom' && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '0.5rem' }}>
                            <input type="date" className="form-input" style={{ height: 32, padding: '0 8px', fontSize: '0.8rem' }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
                            <span style={{ color: 'var(--text-faint)' }}>-</span>
                            <input type="date" className="form-input" style={{ height: 32, padding: '0 8px', fontSize: '0.8rem' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Alert bar ── */}
            {metrics && (metrics.pendientes > 0 || metrics.errores > 0) && (
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {metrics && (
                    <>
                        {/* Ventas Netas */}
                        <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--color-success) 4%, var(--bg-card))' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-success)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <ArrowUpRight size={14} color="var(--color-success)" />
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor Generado</span>
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.montoVentasMes)}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.ventasMes)} registros ingresos</div>
                        </div>

                        {/* Compras Netas */}
                        <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--color-danger) 4%, var(--bg-card))' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-danger)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <ArrowDownLeft size={14} color="var(--color-danger)" />
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gastos y Compras</span>
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.montoComprasMes)}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.comprasMes)} registros egresos</div>
                        </div>

                        {/* Saldo Neto */}
                        <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--brand) 4%, var(--bg-card))' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--brand)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <BarChart3 size={14} color="var(--brand)" />
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance Neto</span>
                            </div>
                            <div style={{
                                fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em',
                                color: (metrics.montoVentasMes - metrics.montoComprasMes) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                            }}>
                                {fmtMoney(metrics.montoVentasMes - metrics.montoComprasMes)}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Ingresos - Egresos</div>
                        </div>

                        {/* Saldo Cajas (Global unaffected by period usually, but kept for layout consistency) */}
                        <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--color-warning) 5%, var(--bg-card))' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-warning)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <DollarSign size={14} color="var(--color-warning)" />
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saldo Bancos/Caja</span>
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.saldoCajas)}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.movimientosMes)} transacciones en período</div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Breakdown & Rankings Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>

                {/* Breakdown de Facturación */}
                <div className="card" style={{ padding: '1.25rem', background: 'color-mix(in srgb, var(--text-muted) 2%, var(--bg-card))' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                        <PieChart size={16} color="var(--brand)" /> Origen de Registros
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Ingresos Mix */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>INGRESOS</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{fmtNum(metrics?.ventasMes || 0)} ops</span>
                            </div>
                            {metrics && metrics.montoVentasMes > 0 ? (
                                <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                                    <div style={{ width: `${(ventasBreakdown.tradicionalMonto / metrics.montoVentasMes) * 100}%`, background: 'var(--color-success)', opacity: 0.9 }} title="Con Factura" />
                                    <div style={{ width: `${(ventasBreakdown.sinFacturaMonto / metrics.montoVentasMes) * 100}%`, background: '#cbd5e1' }} title="Sin Factura" />
                                </div>
                            ) : (
                                <div style={{ height: 16, borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 6 }} />
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-success)', fontWeight: 600 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-success)' }} /> Facturado: {fmtMoney(ventasBreakdown.tradicionalMonto)}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-sub)' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#cbd5e1' }} /> Directo: {fmtMoney(ventasBreakdown.sinFacturaMonto)}
                                </span>
                            </div>
                        </div>

                        {/* Egresos Mix */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>EGRESOS</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{fmtNum(metrics?.comprasMes || 0)} ops</span>
                            </div>
                            {metrics && metrics.montoComprasMes > 0 ? (
                                <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                                    <div style={{ width: `${(comprasBreakdown.tradicionalMonto / metrics.montoComprasMes) * 100}%`, background: 'var(--color-danger)', opacity: 0.9 }} title="Con Factura" />
                                    <div style={{ width: `${(comprasBreakdown.sinFacturaMonto / metrics.montoComprasMes) * 100}%`, background: '#cbd5e1' }} title="Sin Factura" />
                                </div>
                            ) : (
                                <div style={{ height: 16, borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 6 }} />
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-danger)', fontWeight: 600 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-danger)' }} /> Facturado: {fmtMoney(comprasBreakdown.tradicionalMonto)}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-sub)' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#cbd5e1' }} /> Directo: {fmtMoney(comprasBreakdown.sinFacturaMonto)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Ranking */}
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', background: 'color-mix(in srgb, var(--color-info) 3%, var(--bg-card))' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                        <Users size={16} color="var(--brand)" /> Top Entidades del Período
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flex: 1 }}>
                        {/* Clientes */}
                        <div style={{ borderRight: '1px dashed var(--border-subtle)', paddingRight: '1.5rem' }}>
                            <h4 style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Mejores Clientes (Ingresos)</h4>
                            {topClientes.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin registros</p> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {topClientes.map((c, i) => (
                                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                                {i + 1}. {c.name}
                                            </span>
                                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>{fmtMoney(c.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Proveedores */}
                        <div>
                            <h4 style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-danger)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Mayores Proveedores (Gastos)</h4>
                            {topProveedores.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin registros</p> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {topProveedores.map((p, i) => (
                                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                                {i + 1}. {p.name}
                                            </span>
                                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>{fmtMoney(p.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* ── 3-column bottom: Quick Actions | Activity Feed | Dolar + Stats ── */}
            {metrics && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) minmax(300px, 1fr) 260px', gap: '1rem', alignItems: 'start' }}>
                    {/* Quick Actions */}
                    <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--brand) 1.5%, var(--bg-card))' }}>
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
                    <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'color-mix(in srgb, var(--text-muted) 1.5%, var(--bg-card))' }}>
                        <div style={{ padding: '1rem 1.25rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ActivityIcon size={13} /> Actividad reciente en {periodLabel}
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
                        <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--color-success) 1.5%, var(--bg-card))' }}>
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
                        <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--color-info) 1.5%, var(--bg-card))' }}>
                            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Building2 size={13} /> Directorio Total
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

                    </div>
                </div>
            )}
        </div>
    );
}
