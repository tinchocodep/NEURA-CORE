import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    LogOut, LayoutDashboard, ArrowRightLeft, FileText, Activity, Landmark,
    Briefcase, Zap, Users, BookOpen, Tag, Building2, Settings, ClipboardList,
    Receipt, TrendingUp, HardHat,
    Funnel, Columns3, Contact, BarChart3, Car, ChevronLeft, ChevronDown,
    Home, FileSignature, Wallet, CalendarClock, UserPlus, MapPin
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState, useCallback } from 'react';
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
    const [sidebarActionsOpen, setSidebarActionsOpen] = useState(false);
    const [finanzasOpen, setFinanzasOpen] = useState(() => {
        // Auto-open if user is on a finanzas route
        const p = typeof window !== 'undefined' ? window.location.pathname : '';
        return (p.startsWith('/tesoreria/') || (p.startsWith('/contable') && p !== '/contable/comprobantes' && p !== '/contable/proveedores'));
    });

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
        { name: 'Comprobantes', path: '/contable/comprobantes', icon: ClipboardList, submodule: 'contable.comprobantes' },
        { name: 'Proveedores', path: '/contable/proveedores', icon: Building2, submodule: 'contable.proveedores' },
        { name: 'Centro de Costos', path: '/contable/catalogos', icon: Tag, submodule: 'contable.catalogos' },
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

    // Mobile: map routes to display names matching the new tab bar
    // In mobile, Contable/Tesorería/CRM routes are absorbed into Gestión (no "Administración" in mobile)
    const hasInmob = tenantModules.includes('inmobiliaria');
    const isOperaciones = (isInmobiliaria && (location.pathname.startsWith('/inmobiliaria/propiedades') || location.pathname.startsWith('/inmobiliaria/contratos') || location.pathname.startsWith('/inmobiliaria/ordenes') || location.pathname.startsWith('/inmobiliaria/liquidaciones') || location.pathname.startsWith('/inmobiliaria/facturar')))
        || (hasInmob && location.pathname.startsWith('/contable/proveedores'));
    const isGestion = (isInmobiliaria && !isOperaciones) ||
        (hasInmob && isCRM && location.pathname.startsWith('/crm/contactos'));
    const isFinanzas = hasInmob && !isOperaciones && !isGestion && (
        isTesoreria ||
        ((isContable && !isConfiguracion) && !location.pathname.startsWith('/contable/proveedores')) ||
        (isCRM && !location.pathname.startsWith('/crm/contactos'))
    );
    const isMobileGestion = isMobile && isGestion;

    const currentModuleName = hasInmob
        ? (isMobile
            ? (isOperaciones ? 'Operaciones' : (isGestion || isMobileGestion) ? 'Gestión' : '')
            : (isOperaciones ? 'Operaciones' : isGestion ? 'Gestión' : isFinanzas ? 'Finanzas' : ''))
        : isMobile
            ? ''
            : (isCRM ? 'CRM' : isTesoreria ? 'Tesorería' : (isContable && !isConfiguracion) ? 'Contable' : isComercial ? 'Comercial' : '');

    // Mobile items — NO finanzas, proveedores goes to /inmobiliaria/proveedores
    const mobileOperacionesItems = [
        { name: 'Propiedades', path: '/inmobiliaria/propiedades', icon: Home },
        { name: 'Contratos', path: '/inmobiliaria/contratos', icon: FileSignature },
        { name: 'Órdenes', path: '/inmobiliaria/ordenes', icon: ClipboardList },
        { name: 'Liquidaciones', path: '/inmobiliaria/liquidaciones', icon: Wallet },
        { name: 'Comprobantes', path: '/inmobiliaria/facturar', icon: Receipt },
    ];
    const mobileGestionItems = [
        { name: 'Cuentas', path: '/inmobiliaria/cuentas', icon: Receipt },
        { name: 'Proveedores', path: '/inmobiliaria/proveedores', icon: Building2 },
        { name: 'Comprobantes', path: '/contable/comprobantes', icon: ClipboardList },
        { name: 'Proyecciones', path: '/tesoreria', icon: TrendingUp },
    ];

    // Desktop items
    const operacionesItems = [
        { name: 'Propiedades', path: '/inmobiliaria/propiedades', icon: Home },
        { name: 'Contratos', path: '/inmobiliaria/contratos', icon: FileSignature },
        { name: 'Órdenes', path: '/inmobiliaria/ordenes', icon: ClipboardList },
        { name: 'Liquidaciones', path: '/inmobiliaria/liquidaciones', icon: Wallet },
        { name: 'Comprobantes', path: '/inmobiliaria/facturar', icon: Receipt },
    ];
    const gestionItems = [
        { name: 'Cuentas', path: '/inmobiliaria/cuentas', icon: Receipt },
        { name: 'Proveedores', path: '/inmobiliaria/proveedores', icon: Building2 },
        { name: 'Mapa', path: '/inmobiliaria/mapa', icon: MapPin },
        ...(hasModuleAccess('crm') ? [
            { name: 'Contactos', path: '/crm/contactos', icon: UserPlus },
        ] : []),
    ];
    // Finanzas subtab items (for when navigating within Tesorería/Contable advanced)
    // Finanzas: flat list merging tesorería + contable items (excluding promoted ones)
    const finanzasItems = [
        ...(hasModuleAccess('tesoreria') ? tesoreriaItems.filter(i => i.path === '/tesoreria') : []),
        ...(hasModuleAccess('tesoreria') ? tesoreriaItems.filter(i => i.path === '/tesoreria/ordenes-pago') : []),
        ...(hasModuleAccess('tesoreria') ? tesoreriaItems.filter(i => i.path === '/tesoreria/movimientos') : []),
        ...(hasModuleAccess('tesoreria') ? tesoreriaItems.filter(i => i.path === '/tesoreria/bancos') : []),
        ...contableItems.filter(i => i.path === '/contable/catalogos'),
    ];

    const effectiveSectionItems = hasInmob
        ? (isOperaciones ? operacionesItems : isGestion ? gestionItems : isFinanzas ? finanzasItems : sectionItems)
        : sectionItems;
    const mobileSectionItems = isMobile ? (isOperaciones ? mobileOperacionesItems : isMobileGestion ? mobileGestionItems : sectionItems) : effectiveSectionItems;

    // Ref callback for auto-scrolling to active subnav item — must be declared at top level (Rules of Hooks)
    const subnavScrollRef = useCallback((node: HTMLDivElement | null) => {
        if (!node) return;
        const active = node.querySelector('[data-active="true"]') as HTMLElement;
        if (active) {
            const scrollLeft = active.offsetLeft - node.offsetWidth / 2 + active.offsetWidth / 2;
            node.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    }, [location.pathname]);

    return (
        <>
            <div
                className={`app-shell${agentCollapsed ? ' agent-collapsed' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}${hasInmob ? ' inmob-layout' : ''}`}
            >
                {/* ──────────────── SIDEBAR (INMOB = icon-only) ──────────────── */}
                {!isMobile && hasInmob && (
                    <aside className="sidebar">
                        {/* + Button */}
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                            <button onClick={() => setSidebarActionsOpen((o: boolean) => !o)} title="Nueva acción"
                                style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: sidebarActionsOpen ? 'var(--color-cta, #2563EB)' : 'var(--color-bg-surface)', color: sidebarActionsOpen ? '#fff' : 'var(--color-cta, #2563EB)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s', fontSize: '1.25rem', fontWeight: 700 }}>
                                +
                            </button>
                            {sidebarActionsOpen && (
                                <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setSidebarActionsOpen(false)} />
                                <div style={{ position: 'absolute', left: '100%', top: -44, marginLeft: 8, zIndex: 999, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 200 }}>
                                    {[
                                        { label: 'Comprobantes', path: '/inmobiliaria/facturar' },
                                        { label: 'Cobranzas', path: '/inmobiliaria/liquidaciones' },
                                        { label: 'Órdenes de trabajo', path: '/inmobiliaria/ordenes' },
                                        { label: 'Nuevo contrato', path: '/inmobiliaria/contratos?action=crear' },
                                        { label: 'Nueva propiedad', path: '/inmobiliaria/propiedades?action=crear' },
                                    ].map(a => (
                                        <Link key={a.label} to={a.path} onClick={() => setSidebarActionsOpen(false)}
                                            style={{ display: 'block', padding: '10px 16px', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: 'none', borderBottom: '1px solid var(--color-border-subtle)' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                            {a.label}
                                        </Link>
                                    ))}
                                </div>
                                </>
                            )}
                        </div>

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />

                        {/* Nav icons — centered */}
                        {[
                            { icon: LayoutDashboard, label: 'Home', path: '/', match: (p: string) => p === '/' },
                            { icon: ClipboardList, label: 'Operaciones', path: '/inmobiliaria/propiedades', match: () => isOperaciones },
                            { icon: Briefcase, label: 'Gestión', path: '/inmobiliaria/cuentas', match: () => isGestion },
                            { icon: Landmark, label: 'Finanzas', path: '/tesoreria', match: () => isFinanzas },
                        ].map(item => {
                            const active = item.match(location.pathname);
                            return (
                                <Link key={item.label} to={item.path} className="sidebar-icon-btn"
                                    style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'var(--color-accent)' : 'var(--color-bg-surface)', color: active ? '#fff' : 'var(--color-text-muted)', textDecoration: 'none', boxShadow: active ? 'none' : 'var(--shadow-sm)', transition: 'all 0.15s', border: active ? 'none' : '1px solid var(--color-border-subtle)' }}>
                                    <item.icon size={20} />
                                    <span className="sidebar-icon-tooltip">{item.label}</span>
                                </Link>
                            );
                        })}

                        {/* Spacer */}
                        <div style={{ flex: 1 }} />
                    </aside>
                )}

                {/* ──────────────── SIDEBAR (other tenants = full) ──────────────── */}
                {!isMobile && !hasInmob && <aside className="sidebar">
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
                {hasInmob ? (
                    /* ── INMOBILIARIA TENANT: Operaciones / Gestión / Finanzas ── */
                    <>
                        <div className="sidebar-section">
                            <Link to="/" className={`sidebar-link${location.pathname === '/' ? ' active' : ''}`}>
                                <LayoutDashboard size={16} />
                                Visión General
                            </Link>
                        </div>

                        <div className="sidebar-section">
                            <div className="sidebar-section-label">Operaciones</div>
                            {operacionesItems.map(item => {
                                const isExact = ['/inmobiliaria', '/tesoreria', '/contable', '/crm'].includes(item.path);
                                const isActive = isExact ? location.pathname === item.path : location.pathname.startsWith(item.path);
                                return (
                                    <Link key={item.path} to={item.path} className={`sidebar-link${isActive ? ' active' : ''}`}>
                                        <item.icon size={16} />
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="sidebar-section">
                            <div className="sidebar-section-label">Gestión</div>
                            {gestionItems.map(item => {
                                const isExact = ['/inmobiliaria', '/tesoreria', '/contable', '/crm'].includes(item.path);
                                const isActive = isExact ? location.pathname === item.path : location.pathname.startsWith(item.path);
                                return (
                                    <Link key={item.path} to={item.path} className={`sidebar-link${isActive ? ' active' : ''}`}>
                                        <item.icon size={16} />
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </div>

                        {finanzasItems.length > 0 && (
                            <div className="sidebar-section">
                                <button
                                    onClick={() => setFinanzasOpen(f => !f)}
                                    className="sidebar-section-label"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 'inherit', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', textTransform: 'inherit' as any, letterSpacing: 'inherit' }}
                                >
                                    Finanzas
                                    <ChevronDown size={12} style={{ transform: finanzasOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>
                                {finanzasOpen && finanzasItems.map(item => {
                                    const isExact = ['/inmobiliaria', '/tesoreria', '/contable', '/crm'].includes(item.path);
                                    const isActive = isExact ? location.pathname === item.path : location.pathname.startsWith(item.path);
                                    return (
                                        <Link key={item.path} to={item.path} className={`sidebar-link${isActive ? ' active' : ''}`}>
                                            <item.icon size={16} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}

                        {role === 'superadmin' && (
                            <div className="sidebar-section">
                                <Link to="/superadmin" className={`sidebar-link${location.pathname.startsWith('/superadmin') ? ' active' : ''}`} style={{ color: 'var(--color-accent)' }}>
                                    <Activity size={16} />
                                    Super Admin
                                </Link>
                            </div>
                        )}
                    </>
                ) : (
                    /* ── OTHER TENANTS: Original sidebar ── */
                    <div className="sidebar-section">
                        <div className="sidebar-section-label">Módulos</div>

                        <Link to="/" className={`sidebar-link${location.pathname === '/' ? ' active' : ''}`}>
                            <LayoutDashboard size={16} />
                            Visión General
                        </Link>

                        {hasModuleAccess('tesoreria') && (
                            <Link to={role === 'admin' || role === 'superadmin' ? '/tesoreria' : '/tesoreria/movimientos'} className={`sidebar-link${isTesoreria ? ' active' : ''}`}>
                                <Landmark size={16} />
                                Tesorería
                            </Link>
                        )}

                        {hasModuleAccess('contable') && (
                            <Link to="/contable" className={`sidebar-link${isContable ? ' active' : ''}`}>
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

                        {role === 'superadmin' && (
                            <Link to="/superadmin" className={`sidebar-link${location.pathname.startsWith('/superadmin') ? ' active' : ''}`} style={{ color: 'var(--color-accent)' }}>
                                <Activity size={16} />
                                Super Admin
                            </Link>
                        )}
                    </div>
                )}

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


            {/* ──────────────── TOPBAR (full width for inmob) ──────────────── */}
            {hasInmob && !isMobile && <TopBar />}

            {/* ──────────────── MAIN CONTENT ──────────────── */}
            <main className="main-content">
                {(!hasInmob || isMobile) && <TopBar />}
                {(isMobile ? mobileSectionItems : (hasInmob ? effectiveSectionItems : sectionItems)).length > 0 && (
                    isMobile ? (
                        /* ── MOBILE: Title + horizontal scroll tabs ── */
                        <div className="mobile-subnav">
                            <div className="mobile-subnav-toggle" style={{ cursor: 'default' }}>
                                <span className="mobile-subnav-title">{currentModuleName}</span>
                            </div>
                            <div className="mobile-subnav-scroll" ref={subnavScrollRef}>
                                {mobileSectionItems.map(item => {
                                    const isDashboardPath = ['/tesoreria', '/contable', '/crm', '/comercial', '/inmobiliaria'].includes(item.path);
                                    const isActiveItem = isDashboardPath
                                        ? location.pathname === item.path
                                        : location.pathname.startsWith(item.path);
                                    return (
                                        <Link key={item.path} to={item.path} data-active={isActiveItem}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 99, fontSize: '0.8125rem', fontWeight: isActiveItem ? 600 : 500, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, background: isActiveItem ? 'var(--color-cta, #2563EB)' : 'var(--color-bg-surface)', color: isActiveItem ? '#fff' : 'var(--color-text-muted)', border: isActiveItem ? 'none' : '1px solid var(--color-border-subtle)', transition: 'all 0.15s' }}>
                                            <item.icon size={14} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* ── DESKTOP: Horizontal subtabs ── */
                        <div className="subtabs">
                            {(hasInmob ? effectiveSectionItems : sectionItems).map(item => {
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

            {/* ──────────────── AGENT MONITOR (hidden for inmobiliaria tenants) ──────────────── */}
            {!isMobile && !hasInmob && (
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
