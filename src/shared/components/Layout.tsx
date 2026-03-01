import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, LayoutDashboard, ArrowRightLeft, FileText, Activity, Landmark, Briefcase, Zap, Users, BookOpen, Package, Building2, Settings, ClipboardList } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export default function Layout() {
    const { user, signOut, role, userModules } = useAuth() as any;
    const { tenant } = useTenant();
    const location = useLocation();
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (!tenant || (role !== 'admin' && role !== 'superadmin')) return;
        const ws = (() => {
            const d = new Date();
            const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
            d.setDate(d.getDate() + diff);
            return d.toISOString().split('T')[0];
        })();
        // Count cajas with assigned_user_id that have NO settlement this week
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
        { name: 'Catálogos', path: '/contable/catalogos', icon: Package },
        { name: 'Configuración', path: '/contable/configuracion', icon: Settings, adminOnly: true },
    ];

    const contableItems = (role === 'admin' || role === 'superadmin'
        ? allContableItems
        : allContableItems.filter((i: any) =>
            !i.adminOnly
        )).filter((i: any) => !i.adminOnly || role === 'admin' || role === 'superadmin');

    const tesoreriaItems = (role === 'admin' || role === 'superadmin'
        ? allTesoreriaItems
        : allTesoreriaItems.filter((i: any) =>
            i.path === '/tesoreria/movimientos' || i.path === '/tesoreria/comprobantes'
        )).filter((i: any) => !i.adminOnly || role === 'admin' || role === 'superadmin');

    const displayRole = role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Administrador' : 'Usuario';

    return (
        <div className="app-layout">
            {/* ──── SIDEBAR ──── */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    {tenant?.logo_url ? (
                        <img src={tenant.logo_url} alt={tenant.name || 'Logo'}
                            style={{ height: '36px', width: '36px', objectFit: 'contain', borderRadius: '8px' }} />
                    ) : (
                        <div style={{ position: 'relative' }}>
                            <div className="sidebar-brand-icon">
                                <Zap size={18} color="white" />
                            </div>
                            <span className="tooltip-text">{tenant?.name || 'Tesorería'}</span>
                        </div>
                    )}
                </div>

                <nav className="sidebar-nav">
                    <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
                        <LayoutDashboard size={18} />
                        <span className="tooltip-text">Visión General</span>
                    </Link>

                    {hasModuleAccess('tesoreria') && (
                        <Link
                            to={role === 'admin' || role === 'superadmin' ? '/tesoreria' : '/tesoreria/movimientos'}
                            className={`nav-item ${location.pathname.startsWith('/tesoreria') ? 'active' : ''}`}
                        >
                            <Landmark size={18} />
                            <span className="tooltip-text">Tesorería</span>
                        </Link>
                    )}

                    {hasModuleAccess('contable') && (
                        <Link
                            to="/contable"
                            className={`nav-item ${location.pathname.startsWith('/contable') ? 'active' : ''}`}
                        >
                            <BookOpen size={18} />
                            <span className="tooltip-text">Contable</span>
                        </Link>
                    )}

                    {hasModuleAccess('crm') && (
                        <Link to="/crm" className={`nav-item ${location.pathname.startsWith('/crm') ? 'active' : ''}`}>
                            <Briefcase size={18} />
                            <span className="tooltip-text">CRM</span>
                        </Link>
                    )}

                    {role === 'superadmin' && (
                        <Link
                            to="/superadmin"
                            className={`nav-item ${location.pathname.startsWith('/superadmin') ? 'active' : ''}`}
                            style={{ color: 'var(--brand-accent)' }}
                        >
                            <Activity size={18} />
                            <span className="tooltip-text">Super Admin</span>
                        </Link>
                    )}
                </nav>

                <div className="sidebar-user">
                    <div className="user-avatar">
                        {user.email?.charAt(0).toUpperCase()}
                    </div>
                    <div className="sidebar-user-menu">
                        <div style={{ padding: '0.75rem', marginBottom: '0.25rem', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '168px' }}>
                                {user.email}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                {displayRole}
                            </div>
                        </div>
                        <button
                            onClick={signOut}
                            className="btn btn-secondary"
                            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', border: 'none', borderRadius: 'var(--r-sm)', fontSize: '0.8125rem' }}
                        >
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </aside>

            {/* ──── MAIN ──── */}
            <main className="main-content">
                <header className="topbar">
                    <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                            {tenant?.name}
                        </span>
                    </div>

                    {location.pathname.startsWith('/tesoreria') && (
                        <nav className="topbar-nav">
                            {tesoreriaItems.map((item) => {
                                const isActive = item.path === '/tesoreria'
                                    ? location.pathname === '/tesoreria'
                                    : location.pathname.startsWith(item.path);
                                const isCajas = item.path === '/tesoreria/cajas';
                                return (
                                    <Link key={item.path} to={item.path} className={`topbar-nav-item ${isActive ? 'active' : ''}`}
                                        style={{ position: 'relative' }}>
                                        <item.icon size={13} />
                                        {item.name}
                                        {isCajas && pendingCount > 0 && (
                                            <span style={{
                                                position: 'absolute', top: '-4px', right: '-6px',
                                                background: 'var(--warning)', color: '#fff',
                                                fontSize: '0.6rem', fontWeight: 800,
                                                width: '16px', height: '16px', borderRadius: '50%',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                lineHeight: 1,
                                            }}>
                                                {pendingCount}
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>
                    )}

                    {location.pathname.startsWith('/contable') && (
                        <nav className="topbar-nav">
                            {contableItems.map((item) => {
                                const isActive = item.path === '/contable'
                                    ? location.pathname === '/contable'
                                    : location.pathname.startsWith(item.path);
                                return (
                                    <Link key={item.path} to={item.path} className={`topbar-nav-item ${isActive ? 'active' : ''}`}>
                                        <item.icon size={13} />
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </nav>
                    )}

                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
                        <span className="signal-dot online" />
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Online</span>
                    </div>
                </header>

                {/* Animated pages */}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            style={{ height: '100%', padding: '2rem 2.5rem', overflowY: 'auto' }}
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
