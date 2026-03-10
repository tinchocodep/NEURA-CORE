import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    LogOut, LayoutDashboard, ArrowRightLeft, FileText, Activity, Landmark,
    Briefcase, Zap, Users, BookOpen, Tag, Building2, Settings, ClipboardList,
    Receipt
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import AgentMonitorPanel from '../../design-system/components/AgentMonitor/AgentMonitorPanel';

export default function Layout() {
    const { user, signOut, role, userModules, displayName } = useAuth() as any;
    const { tenant } = useTenant();
    const location = useLocation();
    const [pendingCount, setPendingCount] = useState(0);
    const [pendingComprobantes, setPendingComprobantes] = useState(0);
    const [agentCollapsed, setAgentCollapsed] = useState(true);

    useEffect(() => {
        if (!tenant || (role !== 'admin' && role !== 'superadmin')) return;
        const ws = (() => {
            const d = new Date();
            const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
            d.setDate(d.getDate() + diff);
            return d.toISOString().split('T')[0];
        })();
        supabase.from('treasury_accounts')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenant.id)
            .not('assigned_user_id', 'is', null)
            .then(({ count: total }) => {
                supabase.from('cash_settlements')
                    .select('account_id')
                    .eq('tenant_id', tenant.id)
                    .eq('week_start', ws)
                    .then(({ data }) => {
                        const submitted = data?.length || 0;
                        setPendingCount(Math.max(0, (total || 0) - submitted));
                    });
            });
    }, [tenant, role, location.pathname]);

    // Count pending comprobantes for contable sidebar badge
    useEffect(() => {
        if (!tenant) return;

        const fetchPending = () => {
            supabase.from('contable_comprobantes')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .eq('estado', 'pendiente')
                .then(({ count }) => setPendingComprobantes(count || 0));
        };

        fetchPending();

        const channel = supabase.channel('layout-comprobantes-pending')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contable_comprobantes', filter: `tenant_id=eq.${tenant.id}` },
                () => fetchPending()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tenant?.id]);

    // Hotkey: Cmd+J toggles agent panel
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
                e.preventDefault();
                setAgentCollapsed(c => !c);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    if (!user) return <Navigate to="/login" replace />;

    const tenantModules = tenant?.enabled_modules || [];

    const hasModuleAccess = (moduleId: string) => {
        if (!tenantModules.includes(moduleId)) return false;
        if (role === 'admin' || role === 'superadmin') return true;
        return (userModules || []).includes(moduleId);
    };

    const allTesoreriaItems = [
        { name: 'Proyecciones', path: '/tesoreria', icon: LayoutDashboard },
        { name: 'Movimientos', path: '/tesoreria/movimientos', icon: ArrowRightLeft },
        { name: 'Órdenes de Pago', path: '/tesoreria/ordenes-pago', icon: Receipt },
        { name: 'Comprobantes', path: '/tesoreria/comprobantes', icon: FileText },
        { name: 'Cajas', path: '/tesoreria/cajas', icon: Landmark },
        { name: 'Bancos', path: '/tesoreria/bancos', icon: Landmark },
        { name: 'Monitor', path: '/tesoreria/monitor', icon: Activity },
        { name: 'Equipo', path: '/tesoreria/equipo', icon: Users, adminOnly: true },
    ];

    const allContableItems = [
        { name: 'Dashboard', path: '/contable', icon: LayoutDashboard },
        { name: 'Comprobantes', path: '/contable/comprobantes', icon: ClipboardList },
        { name: 'Proveedores', path: '/contable/proveedores', icon: Building2 },
        { name: 'Clientes', path: '/contable/clientes', icon: Building2 },
        { name: 'Categorías', path: '/contable/catalogos', icon: Tag },
    ];

    const contableItems = allContableItems.filter(
        (i: any) => !i.adminOnly || role === 'admin' || role === 'superadmin'
    );
    const tesoreriaItems = (role === 'admin' || role === 'superadmin'
        ? allTesoreriaItems
        : allTesoreriaItems.filter(i =>
            i.path === '/tesoreria/movimientos' || i.path === '/tesoreria/comprobantes'
        )
    ).filter((i: any) => !i.adminOnly || role === 'admin' || role === 'superadmin');

    const displayRole = role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Usuario';
    const isContable = location.pathname.startsWith('/contable');
    const isTesoreria = location.pathname.startsWith('/tesoreria');

    // Determine current section nav items
    const sectionItems = isContable ? contableItems : isTesoreria ? tesoreriaItems : [];

    return (
        <div
            className={`app-shell${agentCollapsed ? ' agent-collapsed' : ''}`}
        >
            {/* ──────────────── SIDEBAR ──────────────── */}
            <aside className="sidebar">
                {/* Logo */}
                <div className="sidebar-logo">
                    {tenant?.logo_url ? (
                        <img src={tenant.logo_url} alt={tenant.name || 'Logo'}
                            style={{ height: 32, width: 32, objectFit: 'contain', borderRadius: 6 }} />
                    ) : (
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'linear-gradient(135deg, var(--color-accent-dim), rgba(0,209,255,0.05))',
                            border: '1px solid var(--color-accent-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <Zap size={16} color="var(--color-accent)" />
                        </div>
                    )}
                    <div>
                        <div className="sidebar-logo-text">
                            {tenant?.name || 'NeuraOrkesta'}
                        </div>
                        <div className="sidebar-logo-badge">v4.6</div>
                    </div>
                </div>

                {/* Module Navigation */}
                <div className="sidebar-section">
                    <div className="sidebar-section-label">Módulos</div>

                    <Link to="/" className={`sidebar-link${location.pathname === '/' ? ' active' : ''}`}>
                        <LayoutDashboard size={16} />
                        Visión General
                    </Link>

                    {hasModuleAccess('tesoreria') && (
                        <Link
                            to={role === 'admin' || role === 'superadmin' ? '/tesoreria' : '/tesoreria/movimientos'}
                            className={`sidebar-link${isTesoreria ? ' active' : ''}`}
                        >
                            <Landmark size={16} />
                            Tesorería
                        </Link>
                    )}

                    {hasModuleAccess('contable') && (
                        <Link
                            to="/contable"
                            className={`sidebar-link${isContable ? ' active' : ''}`}
                        >
                            <BookOpen size={16} />
                            Contable
                        </Link>
                    )}

                    {hasModuleAccess('crm') && (
                        <Link to="/crm" className={`sidebar-link${location.pathname.startsWith('/crm') ? ' active' : ''}`}>
                            <Briefcase size={16} />
                            CRM
                        </Link>
                    )}

                    {role === 'superadmin' && (
                        <Link
                            to="/superadmin"
                            className={`sidebar-link${location.pathname.startsWith('/superadmin') ? ' active' : ''}`}
                            style={{ color: 'var(--color-accent)' }}
                        >
                            <Activity size={16} />
                            Super Admin
                        </Link>
                    )}
                </div>

                {/* Section sub-navigation */}
                {sectionItems.length > 0 && (
                    <div className="sidebar-section" style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: '0.5rem', paddingTop: '1rem' }}>
                        <div className="sidebar-section-label">
                            {isContable ? 'Contable' : 'Tesorería'}
                        </div>
                        {sectionItems.map(item => {
                            const isActive = item.path === '/tesoreria' || item.path === '/contable'
                                ? location.pathname === item.path
                                : location.pathname.startsWith(item.path);
                            const isCajas = item.path === '/tesoreria/cajas';
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`sidebar-link${isActive ? ' active' : ''}`}
                                    style={{ position: 'relative' }}
                                >
                                    <item.icon size={14} />
                                    {item.name}
                                    {isCajas && pendingCount > 0 && (
                                        <span style={{
                                            marginLeft: 'auto',
                                            background: 'var(--color-warning)',
                                            color: '#0B0E14',
                                            fontSize: '0.6rem', fontWeight: 800,
                                            padding: '1px 5px', borderRadius: 99,
                                        }}>
                                            {pendingCount}
                                        </span>
                                    )}
                                    {item.name === 'Comprobantes' && pendingComprobantes > 0 && (
                                        <span style={{
                                            marginLeft: 'auto',
                                            background: '#f59e0b',
                                            color: '#fff',
                                            fontSize: '0.6rem', fontWeight: 800,
                                            padding: '1px 5px', borderRadius: 99,
                                        }}>
                                            {pendingComprobantes}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                )}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Configuración — always at bottom for admins */}
                {(role === 'admin' || role === 'superadmin') && (
                    <div style={{ padding: '0 0.75rem 0.25rem' }}>
                        <Link
                            to="/contable/configuracion"
                            className={`sidebar-link${location.pathname === '/contable/configuracion' ? ' active' : ''}`}
                        >
                            <Settings size={16} />
                            Configuración
                        </Link>
                    </div>
                )}

                {/* User footer */}
                <div style={{
                    padding: '0.875rem 1rem',
                    borderTop: '1px solid var(--color-border-subtle)',
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'var(--color-accent-dim)',
                        border: '1px solid var(--color-accent-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)',
                        flexShrink: 0,
                    }}>
                        {(displayName || user.email?.charAt(0) || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName || user.email}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                            {displayRole}
                        </div>
                    </div>
                    <button
                        onClick={signOut}
                        className="btn btn-ghost btn-icon"
                        title="Cerrar sesión"
                        tabIndex={0}
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </aside>

            {/* ──────────────── MAIN CONTENT ──────────────── */}
            <main className="main-content">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ minHeight: '100%' }}
                    >
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* ──────────────── AGENT MONITOR ──────────────── */}
            <AgentMonitorPanel
                collapsed={agentCollapsed}
                onToggle={() => setAgentCollapsed(c => !c)}
            />
        </div>
    );
}
