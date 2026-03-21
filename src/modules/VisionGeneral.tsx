import { useEffect, useState, useMemo } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { DolarService, type DolarResumen } from '../services/DolarService';
import { Calendar, Settings, AlertTriangle, Clock, ArrowRight, X, GripVertical, BookOpen } from 'lucide-react';

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}

// Import Widgets
import ResumenFinancieroWidget from './vision_general/widgets/ResumenFinancieroWidget';
import AccionesRapidasWidget from './vision_general/widgets/AccionesRapidasWidget';
import ActividadRecienteWidget from './vision_general/widgets/ActividadRecienteWidget';
import CotizacionDolarWidget from './vision_general/widgets/CotizacionDolarWidget';
import DirectorioWidget from './vision_general/widgets/DirectorioWidget';
import RankingEntidadesWidget from './vision_general/widgets/RankingEntidadesWidget';
import OrigenRegistrosWidget from './vision_general/widgets/OrigenRegistrosWidget';
import MonitorTesoreriaWidget from './vision_general/widgets/MonitorTesoreriaWidget';
import FlujoCajaWidget from './vision_general/widgets/FlujoCajaWidget';

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
interface EntityRanking { id: string; name: string; amount: number; count: number; }
interface TypeBreakdown {
    tradicionalMonto: number; tradicionalCount: number;
    sinFacturaMonto: number; sinFacturaCount: number;
}

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
};

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

/* ─── Widget Registry & Preferences Setup ─── */
interface WidgetDef {
    id: string;
    title: string;
    defaultActive: boolean;
}

const WIDGET_REGISTRY: WidgetDef[] = [
    { id: 'resumen_financiero', title: 'Tarjetas de Resumen Financiero', defaultActive: true },
    { id: 'origen_registros', title: 'Origen de Registros (Gráficos)', defaultActive: true },
    { id: 'ranking_entidades', title: 'Top Clientes y Proveedores', defaultActive: true },
    { id: 'acciones_rapidas', title: 'Acceso Rápido', defaultActive: true },
    { id: 'actividad_reciente', title: 'Actividad Reciente', defaultActive: true },
    { id: 'cotizacion_dolar', title: 'Cotización del Dólar', defaultActive: true },
    { id: 'directorio_total', title: 'Directorio Total', defaultActive: true },
    { id: 'monitor_tesoreria', title: 'Monitor de Tesorería (Cajas)', defaultActive: false },
    { id: 'flujo_caja', title: 'Flujo de Caja (Evolutivo)', defaultActive: false },
];

export default function VisionGeneral() {
    const { tenant } = useTenant();
    const { user, displayName } = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const tenantModules = (tenant as any)?.enabled_modules || [];

    // Data State
    const [metrics, setMetrics] = useState<CrossMetrics | null>(null);
    const [activity, setActivity] = useState<RecentActivity[]>([]);
    const [dolar, setDolar] = useState<DolarResumen | null>(null);
    const [period, setPeriod] = useState('this_month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [topProveedores, setTopProveedores] = useState<EntityRanking[]>([]);
    const [topClientes, setTopClientes] = useState<EntityRanking[]>([]);
    const [ventasBreakdown, setVentasBreakdown] = useState<TypeBreakdown>({ tradicionalMonto: 0, tradicionalCount: 0, sinFacturaMonto: 0, sinFacturaCount: 0 });
    const [comprasBreakdown, setComprasBreakdown] = useState<TypeBreakdown>({ tradicionalMonto: 0, tradicionalCount: 0, sinFacturaMonto: 0, sinFacturaCount: 0 });

    const [dolarLoading, setDolarLoading] = useState(true);
    const [loading, setLoading] = useState(true);

    // Dashboard Customization State
    const prefsKey = `neura_dashboard_prefs_${tenant?.id}_${user?.id}`;
    const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
    const [isCustomizing, setIsCustomizing] = useState(false);

    useEffect(() => {
        if (!tenant || !user) return;
        const saved = localStorage.getItem(prefsKey);
        if (saved) {
            setActiveWidgets(JSON.parse(saved));
        } else {
            setActiveWidgets(WIDGET_REGISTRY.filter(w => w.defaultActive).map(w => w.id));
        }
    }, [tenant, user, prefsKey]);

    const savePreferences = (newWidgets: string[]) => {
        setActiveWidgets(newWidgets);
        localStorage.setItem(prefsKey, JSON.stringify(newWidgets));
    };

    const toggleWidget = (id: string) => {
        const newList = activeWidgets.includes(id) ? activeWidgets.filter(w => w !== id) : [...activeWidgets, id];
        savePreferences(newList);
    };

    // Data Fetching
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

        const [pendientes, errores, proveedoresCount, clientesCount, cuentas, movMes, recentComp] = await Promise.all([
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'pendiente'),
            supabase.from('contable_comprobantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('estado', 'error'),
            supabase.from('contable_proveedores').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('activo', true),
            supabase.from('contable_clientes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('activo', true),
            supabase.from('treasury_accounts').select('balance').eq('tenant_id', tid),
            supabase.from('treasury_transactions').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).gte('date', start).lte('date', end),
            supabase.from('contable_comprobantes').select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_ars, estado, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social)').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(6),
        ]);

        const { data: periodComprobantes } = await supabase.from('contable_comprobantes')
            .select('id, tipo, tipo_comprobante, monto_ars, proveedor_id, cliente_id, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social)')
            .eq('tenant_id', tid).gte('fecha', start).lte('fecha', end);

        const compList = periodComprobantes || [];

        const sumCompras = compList.filter(c => c.tipo === 'compra').reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0);
        const sumVentas = compList.filter(c => c.tipo === 'venta').reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0);
        const countCompras = compList.filter(c => c.tipo === 'compra').length;
        const countVentas = compList.filter(c => c.tipo === 'venta').length;
        const saldo = (cuentas.data || []).reduce((a: number, c: any) => a + Number(c.balance || 0), 0);

        setMetrics({
            comprasMes: countCompras, ventasMes: countVentas, montoComprasMes: sumCompras, montoVentasMes: sumVentas,
            pendientes: pendientes.count || 0, errores: errores.count || 0, totalProveedores: proveedoresCount.count || 0, totalClientes: clientesCount.count || 0,
            saldoCajas: saldo, movimientosMes: movMes.count || 0,
        });

        const vTrad = compList.filter(c => c.tipo === 'venta' && c.tipo_comprobante !== 'Sin Factura');
        const vSinF = compList.filter(c => c.tipo === 'venta' && c.tipo_comprobante === 'Sin Factura');
        setVentasBreakdown({
            tradicionalMonto: vTrad.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0), tradicionalCount: vTrad.length,
            sinFacturaMonto: vSinF.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0), sinFacturaCount: vSinF.length,
        });

        const cTrad = compList.filter(c => c.tipo === 'compra' && c.tipo_comprobante !== 'Sin Factura');
        const cSinF = compList.filter(c => c.tipo === 'compra' && c.tipo_comprobante === 'Sin Factura');
        setComprasBreakdown({
            tradicionalMonto: cTrad.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0), tradicionalCount: cTrad.length,
            sinFacturaMonto: cSinF.reduce((a, c) => a + Math.abs(Number(c.monto_ars || 0)), 0), sinFacturaCount: cSinF.length,
        });

        const provMap = new Map<string, EntityRanking>();
        const cliMap = new Map<string, EntityRanking>();

        compList.forEach(c => {
            const monto = Math.abs(Number(c.monto_ars || 0));
            if (c.tipo === 'compra' && c.proveedor_id) {
                const existing = provMap.get(c.proveedor_id) || { id: c.proveedor_id, name: (c.proveedor as any)?.razon_social || 'Desconocido', amount: 0, count: 0 };
                existing.amount += monto; existing.count += 1;
                provMap.set(c.proveedor_id, existing);
            } else if (c.tipo === 'venta' && c.cliente_id) {
                const existing = cliMap.get(c.cliente_id) || { id: c.cliente_id, name: (c.cliente as any)?.razon_social || 'Desconocido', amount: 0, count: 0 };
                existing.amount += monto; existing.count += 1;
                cliMap.set(c.cliente_id, existing);
            }
        });

        setTopProveedores(Array.from(provMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5));
        setTopClientes(Array.from(cliMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 5));

        const actList: RecentActivity[] = (recentComp.data || []).map((c: any) => ({
            id: c.id, type: 'comprobante' as const,
            title: `${c.tipo_comprobante || c.tipo} ${c.numero_comprobante || ''}`.trim(),
            subtitle: c.tipo === 'compra' ? ((c.proveedor as any)?.razon_social || '—') : ((c.cliente as any)?.razon_social || '—'),
            amount: Number(c.monto_ars || 0), date: c.fecha,
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

    if (loading && !metrics) {
        return (
            <div style={{ padding: '2rem' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ width: 260, height: 28, background: 'var(--bg-subtle)', borderRadius: 8, marginBottom: 8 }} />
                    <div style={{ width: 400, height: 16, background: 'var(--bg-subtle)', borderRadius: 6 }} />
                </div>
                <div className="grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
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

    /* ─── Widget Rendering Engine ─── */
    const isWidgetActive = (id: string) => activeWidgets.includes(id);

    return (
        <div style={{ paddingBottom: '3rem' }}>
            {/* Header with greeting, Date Filter & Customization Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'center' : 'flex-start', marginBottom: isMobile ? '0.75rem' : '1.5rem', flexWrap: 'wrap', gap: isMobile ? '0.5rem' : '1rem' }}>
                {isMobile ? (
                    /* ── MOBILE header: logo + greeting link ── */
                    <div onClick={() => navigate('/configuracion')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                        <img src="/neura-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            Hola, {displayName || 'usuario'}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>›</span>
                    </div>
                ) : (
                    /* ── DESKTOP header ── */
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                            {getGreeting()}, {displayName || 'usuario'} 👋
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Mostrando resumen para:</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 10%, transparent)', padding: '0.15rem 0.6rem', borderRadius: '0.5rem' }}>{periodLabel}</span>
                        </div>
                    </div>
                )}

                {!isMobile && <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                        <Calendar size={16} color="var(--text-muted)" style={{ marginLeft: 6 }} />
                        <select
                            className="form-input" value={period} onChange={e => setPeriod(e.target.value)}
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
                    {/* Botón Personalizar */}
                    <button
                        onClick={() => setIsCustomizing(true)}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: 48, borderRadius: 12 }}
                    >
                        <Settings size={16} /> <span style={{ fontWeight: 600 }}>Personalizar Panel</span>
                    </button>
                </div>}
            </div>

            {/* Alert bar */}
            {metrics && (metrics.pendientes > 0 || metrics.errores > 0) && (
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    {metrics.pendientes > 0 && (
                        <div
                            onClick={() => navigate('/contable/comprobantes')}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, cursor: 'pointer', flex: 1, minWidth: 200 }}
                        >
                            <Clock size={16} color="#f59e0b" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e' }}>{metrics.pendientes} pendiente{metrics.pendientes > 1 ? 's' : ''}</span>
                            <ArrowRight size={14} color="#f59e0b" style={{ marginLeft: 'auto' }} />
                        </div>
                    )}
                    {metrics.errores > 0 && (
                        <div
                            onClick={() => navigate('/contable/comprobantes')}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer', flex: 1, minWidth: 200 }}
                        >
                            <AlertTriangle size={16} color="#dc2626" />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b' }}>{metrics.errores} con errores</span>
                            <ArrowRight size={14} color="#dc2626" style={{ marginLeft: 'auto' }} />
                        </div>
                    )}
                </div>
            )}

            {/* MAIN DASHBOARD GRID */}
            {isMobile ? (
                /* ── MOBILE: Module shortcuts + KPIs + Cotizaciones + Actividad ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Scroll horizontal de módulos */}
                    <div className="mobile-module-scroll">
                        {tenantModules.includes('crm') && (
                            <button className="mobile-module-chip" onClick={() => navigate('/crm')}>
                                <img src="/logo-crm.png" alt="CRM" className="mobile-module-chip-logo" />
                                <span>CRM</span>
                            </button>
                        )}
                        {tenantModules.includes('tesoreria') && (
                            <button className="mobile-module-chip" onClick={() => navigate('/tesoreria')}>
                                <img src="/logo-tesoreria.png" alt="Tesorería" className="mobile-module-chip-logo" />
                                <span>Tesorería</span>
                            </button>
                        )}
                        {tenantModules.includes('comercial') && (
                            <button className="mobile-module-chip" onClick={() => navigate('/comercial')}>
                                <img src="/logo-comercial.png" alt="Comercial" className="mobile-module-chip-logo" />
                                <span>Comercial</span>
                            </button>
                        )}
                        {tenantModules.includes('contable') && (
                            <button className="mobile-module-chip" onClick={() => navigate('/contable')}>
                                <img src="/logo-contable.png" alt="Contable" className="mobile-module-chip-logo" />
                                <span>Contable</span>
                            </button>
                        )}
                    </div>

                    <ResumenFinancieroWidget metrics={metrics} />

                    {/* Cotizaciones USD — tira compacta */}
                    {dolar && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: 'var(--shadow-sm)' }}>
                            {([
                                { label: 'Oficial', value: dolar.oficial?.venta, color: 'var(--color-text-primary)' },
                                { label: 'Blue', value: dolar.blue?.venta, color: '#3B82F6' },
                                { label: 'MEP', value: dolar.mep?.venta, color: '#8B5CF6' },
                                { label: 'CCL', value: dolar.ccl?.venta, color: '#0D9488' },
                            ]).map((item, i, arr) => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: i < arr.length - 1 ? 0 : 0 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.color }}>
                                            ${item.value ? Math.round(item.value).toLocaleString('es-AR') : '—'}
                                        </div>
                                    </div>
                                    {i < arr.length - 1 && <div style={{ width: 1, height: 24, background: 'var(--color-border-subtle)', margin: '0 12px' }} />}
                                </div>
                            ))}
                        </div>
                    )}

                    <ActividadRecienteWidget activity={activity} periodLabel={periodLabel} />
                </div>
            ) : (
                /* ── DESKTOP: full dashboard ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {isWidgetActive('resumen_financiero') && <ResumenFinancieroWidget metrics={metrics} />}

                    <div className="grid-responsive-1" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                        {isWidgetActive('origen_registros') && metrics && (
                            <OrigenRegistrosWidget
                                ventasMes={metrics.ventasMes} comprasMes={metrics.comprasMes}
                                montoVentasMes={metrics.montoVentasMes} montoComprasMes={metrics.montoComprasMes}
                                ventasBreakdown={ventasBreakdown} comprasBreakdown={comprasBreakdown}
                            />
                        )}
                        {isWidgetActive('ranking_entidades') && (
                            <RankingEntidadesWidget topClientes={topClientes} topProveedores={topProveedores} />
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) minmax(300px, 1fr) 260px', gap: '1rem', alignItems: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {isWidgetActive('acciones_rapidas') && <AccionesRapidasWidget />}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
                            {isWidgetActive('actividad_reciente') && <ActividadRecienteWidget activity={activity} periodLabel={periodLabel} />}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {isWidgetActive('monitor_tesoreria') && metrics && <MonitorTesoreriaWidget saldoCajas={metrics.saldoCajas} />}
                            {isWidgetActive('flujo_caja') && <FlujoCajaWidget />}
                            {isWidgetActive('cotizacion_dolar') && <CotizacionDolarWidget dolar={dolar} dolarLoading={dolarLoading} loadDolar={loadDolar} />}
                            {isWidgetActive('directorio_total') && metrics && <DirectorioWidget totalClientes={metrics.totalClientes} totalProveedores={metrics.totalProveedores} />}
                        </div>
                    </div>
                </div>
            )}

            {/* Customization Modal */}
            {isCustomizing && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: 450, padding: 0, animation: 'slideUp 0.2s ease-out' }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Settings size={18} color="var(--brand)" /> Personalizar Panel
                            </h2>
                            <button onClick={() => setIsCustomizing(false)} className="btn btn-ghost btn-icon">
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: '1.25rem' }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                Activa o desactiva los widgets que querés ver en tu vista principal. Esta configuración se guarda localmente en tu navegador.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {WIDGET_REGISTRY.map(w => {
                                    const active = isWidgetActive(w.id);
                                    return (
                                        <div key={w.id} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '0.75rem 1rem', background: active ? 'color-mix(in srgb, var(--brand) 4%, var(--bg-card))' : 'var(--bg-subtle)',
                                            border: `1px solid ${active ? 'color-mix(in srgb, var(--brand) 20%, transparent)' : 'var(--border-subtle)'}`,
                                            borderRadius: 12, transition: 'all 0.2s',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <GripVertical size={16} color="var(--text-faint)" style={{ cursor: 'grab' }} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500, color: active ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                                    {w.title}
                                                </span>
                                            </div>
                                            {/* Toggle Switch */}
                                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={active}
                                                    onChange={() => toggleWidget(w.id)}
                                                    style={{ display: 'none' }}
                                                />
                                                <div style={{
                                                    width: 40, height: 22, borderRadius: 20,
                                                    background: active ? 'var(--brand)' : 'var(--border-subtle)',
                                                    position: 'relative', transition: 'background 0.2s'
                                                }}>
                                                    <div style={{
                                                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                                        position: 'absolute', top: 3, left: active ? 21 : 3,
                                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                    }} />
                                                </div>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>

                        </div>
                        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setIsCustomizing(false)} className="btn btn-primary" style={{ minWidth: 120 }}>
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
