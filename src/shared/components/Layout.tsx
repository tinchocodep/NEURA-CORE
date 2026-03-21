import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    LogOut, LayoutDashboard, ArrowRightLeft, FileText, Activity, Landmark,
    Briefcase, Zap, Users, BookOpen, Tag, Building2, Settings, ClipboardList,
    Receipt, GitMerge, TrendingUp, HardHat,
    Funnel, Columns3, Contact, BarChart3, Car, ChevronLeft, ChevronDown,
    Home, FileSignature, Wallet, CalendarClock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import AgentMonitorPanel from '../../design-system/components/AgentMonitor/AgentMonitorPanel';
import ChatbotAsistente from './ChatbotAsistente';
import TopBar from './TopBar';
import MobileNav from './MobileNav';

export default function Layout() {
    const { user, signOut, role, userModules, displayName } = useAuth() as any;
    const { tenant } = useTenant();
    const location = useLocation();
    const [pendingCount, setPendingCount] = useState(0);
    const [pendingComprobantes, setPendingComprobantes] = useState(0);
    const [agentCollapsed, setAgentCollapsed] = useState(true);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

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

    // Responsive: detect mobile
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

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

    // Checks access to a module or submodule (e.g. 'tesoreria' or 'tesoreria.bancos').
    // Submodule logic: if tenant has no submodule constraints for a parent, all submodules are allowed.
    const hasModuleAccess = (moduleId: string) => {
        const [parentId] = moduleId.split('.');
        const isSubmodule = moduleId.includes('.');

        // Tenant must have parent enabled
        if (!tenantModules.includes(parentId)) return false;

        // Check tenant submodule constraint
        if (isSubmodule) {
            const tenantHasConstraints = tenantModules.some((m: string) => m.startsWith(`${parentId}.`));
            if (tenantHasConstraints && !tenantModules.includes(moduleId)) return false;
        }

        // Admins bypass user-level check
        if (role === 'admin' || role === 'superadmin') return true;

        // User must have parent enabled
        const uMods = userModules || [];
        if (!uMods.includes(parentId)) return false;

        // Check user submodule constraint
        if (isSubmodule) {
            const userHasConstraints = uMods.some((m: string) => m.startsWith(`${parentId}.`));
            if (userHasConstraints && !uMods.includes(moduleId)) return false;
        }

        return true;
    };

    const allTesoreriaItems = [
        { name: 'Proyecciones', path: '/tesoreria', icon: LayoutDashboard },
        { name: 'Movimientos', path: '/tesoreria/movimientos', icon: ArrowRightLeft, submodule: 'tesoreria.movimientos' },
        { name: 'Órdenes de Pago', path: '/tesoreria/ordenes-pago', icon: Receipt, submodule: 'tesoreria.ordenes-pago' },
        { name: 'Comprobantes', path: '/tesoreria/comprobantes', icon: FileText, submodule: 'tesoreria.comprobantes' },
        { name: 'Cajas', path: '/tesoreria/cajas', icon: Landmark, submodule: 'tesoreria.cajas' },
        { name: 'Bancos', path: '/tesoreria/bancos', icon: Landmark, submodule: 'tesoreria.bancos' },
        { name: 'Monitor', path: '/tesoreria/monitor', icon: Activity, submodule: 'tesoreria.monitor' },
        { name: 'Equipo', path: '/tesoreria/equipo', icon: Users, adminOnly: true, submodule: 'tesoreria.equipo' },
    ];

    const allCRMItems = [
        { name: 'Dashboard', path: '/crm', icon: LayoutDashboard },
        { name: 'Contactos', path: '/crm/contactos', icon: Users, submodule: 'crm.contactos' },
        { name: 'Prospectos', path: '/crm/prospectos', icon: TrendingUp, submodule: 'crm.prospectos' },
        { name: 'Obras', path: '/crm/obras', icon: HardHat, submodule: 'crm.obras' },
        { name: 'Catálogo', path: '/crm/catalogo', icon: Car, submodule: 'crm.catalogo' },
    ];
    const crmItems = allCRMItems.filter(
        (i: any) => !i.submodule || hasModuleAccess(i.submodule)
    );

    const allComercialItems = [
        { name: 'Dashboard', path: '/comercial', icon: LayoutDashboard },
        { name: 'Pipeline', path: '/comercial/pipeline', icon: Columns3, submodule: 'comercial.pipeline' },
        { name: 'Contactos', path: '/comercial/contactos', icon: Contact, submodule: 'comercial.contactos' },
        { name: 'Reportes', path: '/comercial/reportes', icon: BarChart3, submodule: 'comercial.reportes' },
        { name: 'Config', path: '/comercial/config', icon: Settings, submodule: 'comercial.config' },
    ];
    const comercialItems = allComercialItems.filter(
        (i: any) => !i.submodule || hasModuleAccess(i.submodule)
    );

    const allInmobiliariaItems = [
        { name: 'Dashboard', path: '/inmobiliaria', icon: LayoutDashboard },
        { name: 'Propiedades', path: '/inmobiliaria/propiedades', icon: Home, submodule: 'inmobiliaria.propiedades' },
        { name: 'Contratos', path: '/inmobiliaria/contratos', icon: FileSignature, submodule: 'inmobiliaria.contratos' },
        { name: 'Liquidaciones', path: '/inmobiliaria/liquidaciones', icon: Wallet, submodule: 'inmobiliaria.liquidaciones' },
        { name: 'Cuentas', path: '/inmobiliaria/cuentas', icon: Receipt, submodule: 'inmobiliaria.cuentas' },
        { name: 'Agenda', path: '/inmobiliaria/agenda', icon: CalendarClock, submodule: 'inmobiliaria.agenda' },
    ];
    const inmobiliariaItems = allInmobiliariaItems.filter(
        (i: any) => !i.submodule || hasModuleAccess(i.submodule)
    );

    const allContableItems = [
        { name: 'Dashboard', path: '/contable', icon: LayoutDashboard },
        { name: 'Comprobantes', path: '/contable/comprobantes', icon: ClipboardList, submodule: 'contable.comprobantes' },
        { name: 'Proveedores', path: '/contable/proveedores', icon: Building2, submodule: 'contable.proveedores' },
        { name: 'Clientes', path: '/contable/clientes', icon: Building2, submodule: 'contable.clientes' },
        { name: 'Categorías', path: '/contable/catalogos', icon: Tag, submodule: 'contable.catalogos' },
        { name: 'Conciliación', path: '/contable/conciliacion', icon: GitMerge, adminOnly: true, submodule: 'contable.conciliacion' },
    ];

    const contableItems = allContableItems.filter(
        (i: any) => (!i.adminOnly || role === 'admin' || role === 'superadmin')
            && (!i.submodule || hasModuleAccess(i.submodule))
    );
    const tesoreriaItems = (role === 'admin' || role === 'superadmin'
        ? allTesoreriaItems
        : allTesoreriaItems.filter(i =>
            (i as any).path === '/tesoreria/movimientos' || (i as any).path === '/tesoreria/comprobantes'
        )
    ).filter((i: any) =>
        (!i.adminOnly || role === 'admin' || role === 'superadmin')
        && (!i.submodule || hasModuleAccess(i.submodule))
    );

    const displayRole = role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Usuario';
    const isConfiguracion = location.pathname === '/configuracion';
    const isContable = location.pathname.startsWith('/contable') || isConfiguracion;
    const isTesoreria = location.pathname.startsWith('/tesoreria');
    const isComercial = location.pathname.startsWith('/comercial');
    const isCRM = location.pathname.startsWith('/crm');
    const isInmobiliaria = location.pathname.startsWith('/inmobiliaria');

    // Determine current section nav items (Ocultamos sub-opciones en configuración)
    const sectionItems = (isContable && !isConfiguracion) ? contableItems : isTesoreria ? tesoreriaItems : isCRM ? crmItems : isComercial ? comercialItems : isInmobiliaria ? inmobiliariaItems : [];

    // Mobile: module title for toggle
    const currentModuleName = isCRM ? 'CRM' : isTesoreria ? 'Tesorería' : (isContable && !isConfiguracion) ? 'Contable' : isComercial ? 'Comercial' : isInmobiliaria ? 'Inmobiliaria' : '';
    const [mobileSubnavOpen, setMobileSubnavOpen] = useState(false);

    // Mobile: current section name (e.g. "Dashboard", "Contratos")
    const currentSectionName = (() => {
        if (!isMobile || sectionItems.length === 0) return '';
        // Find best match: longest path that matches current location
        const match = sectionItems
            .filter(item => {
                const isDash = ['/tesoreria', '/contable', '/crm', '/comercial', '/inmobiliaria'].includes(item.path);
                return isDash ? location.pathname === item.path : location.pathname.startsWith(item.path);
            })
            .sort((a, b) => b.path.length - a.path.length)[0];
        return match?.name || '';
    })();

    return (
        <>
            <div
                className={`app-shell${agentCollapsed ? ' agent-collapsed' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
            >
                {/* ──────────────── SIDEBAR ──────────────── */}
                {!isMobile && <aside className="sidebar">
                {/* Logo + collapse toggle */}
                <div className="sidebar-logo" onClick={() => setSidebarCollapsed(c => !c)} style={{ cursor: 'pointer' }}>
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
                    {!sidebarCollapsed && (
                        <>
                            <div style={{ flex: 1 }}>
                                <div className="sidebar-logo-text">
                                    {tenant?.name || 'NeuraOrkesta'}
                                </div>
                                <div className="sidebar-logo-badge">v4.6</div>
                            </div>
                            <ChevronLeft size={14} style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s' }} />
                        </>
                    )}
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

                    {hasModuleAccess('comercial') && (
                        <Link to="/comercial" className={`sidebar-link${isComercial ? ' active' : ''}`}>
                            <Funnel size={16} />
                            Comercial
                        </Link>
                    )}

                    {hasModuleAccess('inmobiliaria') && (
                        <Link to="/inmobiliaria" className={`sidebar-link${isInmobiliaria ? ' active' : ''}`}>
                            <Home size={16} />
                            Inmobiliaria
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

                {/* Section sub-navigation removed from sidebar — now rendered as subtabs above content */}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Configuración — always at bottom for admins */}
                {(role === 'admin' || role === 'superadmin') && (
                    <div style={{ padding: '0 0.75rem 0.25rem' }}>
                        <Link
                            to="/configuracion"
                            className={`sidebar-link${location.pathname === '/configuracion' ? ' active' : ''}`}
                        >
                            <Settings size={16} />
                            Configuración
                        </Link>
                    </div>
                )}

                {/* User footer */}
                <div className={`sidebar-user-footer${sidebarCollapsed ? ' collapsed' : ''}`}>
                    <div className="sidebar-user-avatar">
                        {(displayName || user.email?.charAt(0) || '?').charAt(0).toUpperCase()}
                    </div>
                    {!sidebarCollapsed && (
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {displayName || user.email}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                                {displayRole}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={signOut}
                        className="btn btn-ghost btn-icon"
                        title="Cerrar sesión"
                        tabIndex={0}
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </aside>}


            {/* ──────────────── MAIN CONTENT ──────────────── */}
            <main className="main-content">
                <TopBar />
                {sectionItems.length > 0 && (
                    isMobile ? (
                        /* ── MOBILE: Title + toggle dropdown ── */
                        <div className="mobile-subnav">
                            <button className="mobile-subnav-toggle" onClick={() => setMobileSubnavOpen(o => !o)}>
                                <span className="mobile-subnav-title">{currentModuleName}</span>
                                <ChevronDown size={18} style={{ transition: 'transform 0.2s', transform: mobileSubnavOpen ? 'rotate(180deg)' : 'none' }} />
                            </button>
                            {currentSectionName && !mobileSubnavOpen && (
                                <div className="mobile-section-label">{currentSectionName}</div>
                            )}
                            {mobileSubnavOpen && (
                                <div className="mobile-subnav-dropdown">
                                    {sectionItems.map(item => {
                                        const isDashboardPath = ['/tesoreria', '/contable', '/crm', '/comercial', '/inmobiliaria'].includes(item.path);
                                        const isActiveItem = isDashboardPath
                                            ? location.pathname === item.path
                                            : location.pathname.startsWith(item.path);
                                        return (
                                            <Link key={item.path} to={item.path} className={`mobile-subnav-item${isActiveItem ? ' active' : ''}`} onClick={() => setMobileSubnavOpen(false)}>
                                                <item.icon size={16} />
                                                {item.name}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ── DESKTOP: Horizontal subtabs ── */
                        <div className="subtabs">
                            {sectionItems.map(item => {
                                const isDashboardPath = ['/tesoreria', '/contable', '/crm', '/comercial', '/inmobiliaria'].includes(item.path);
                                const isActive = isDashboardPath
                                    ? location.pathname === item.path
                                    : location.pathname.startsWith(item.path);
                                const isCajas = item.path === '/tesoreria/cajas';
                                return (
                                    <Link key={item.path} to={item.path} className={`subtab${isActive ? ' active' : ''}`}>
                                        <item.icon size={14} />
                                        {item.name}
                                        {isCajas && pendingCount > 0 && <span className="subtab-badge">{pendingCount}</span>}
                                        {item.name === 'Comprobantes' && pendingComprobantes > 0 && <span className="subtab-badge">{pendingComprobantes}</span>}
                                    </Link>
                                );
                            })}
                        </div>
                    )
                )}
                <div className={isMobile ? 'mobile-content-area' : ''} style={{ padding: isMobile ? '0.25rem 1rem' : '2rem 2.5rem', flex: 1 }}>
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
                </div>
            </main>

            {/* ──────────────── AGENT MONITOR ──────────────── */}
            {!isMobile && (
                <AgentMonitorPanel
                    collapsed={agentCollapsed}
                    onToggle={() => setAgentCollapsed(c => !c)}
                />
            )}
            </div>

            {/* ──────────────── MOBILE BOTTOM NAV ──────────────── */}
            {isMobile && <MobileNav />}

            {/* ──────────────── N8N CHATBOT ──────────────── */}
            {!isMobile && <ChatbotAsistente />}
        </>
    );
}
