import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, TrendingUp, Plus, X, Building2, Menu,
  Upload, FileText, FileSignature, CalendarPlus, DollarSign, UserPlus,
  Settings, LogOut, Landmark, BookOpen, Briefcase, Funnel,
  Users, BarChart3, Receipt, Wallet, Bell, HelpCircle, Shield
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';

interface QuickAction { name: string; icon: any; path: string; color: string; }

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, signOut } = useAuth() as any;
  const { tenant } = useTenant();
  const [showActions, setShowActions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const tenantModules = (tenant as any)?.enabled_modules || [];
  const hasModule = (id: string) => tenantModules.includes(id);

  // Detect rubro module (the empresa-specific module)
  const rubroModule = tenantModules.find((m: string) => m === 'inmobiliaria') || null;
  const rubroPath = '/inmobiliaria';

  // Quick actions for + button: CRM, Tesorería, Contable, Empresa
  const actions: QuickAction[] = [];
  if (hasModule('contable')) {
    actions.push({ name: 'Subir comprobante', icon: Upload, path: '/contable/comprobantes', color: '#3B82F6' });
    actions.push({ name: 'Comprobantes', icon: Receipt, path: '/contable/comprobantes', color: '#6366F1' });
  }
  if (hasModule('tesoreria')) {
    actions.push({ name: 'Nuevo movimiento', icon: FileText, path: '/tesoreria/movimientos', color: '#10B981' });
    actions.push({ name: 'Tesorería', icon: Wallet, path: '/tesoreria', color: '#F59E0B' });
  }
  if (hasModule('crm')) {
    actions.push({ name: 'Nuevo contacto', icon: UserPlus, path: '/crm/contactos', color: '#0D9488' });
    actions.push({ name: 'CRM', icon: Users, path: '/crm', color: '#8B5CF6' });
  }
  if (rubroModule) {
    actions.push({ name: 'Nueva propiedad', icon: Building2, path: '/inmobiliaria/propiedades', color: '#EC4899' });
    actions.push({ name: 'Nuevo contrato', icon: FileSignature, path: '/inmobiliaria/contratos', color: '#F97316' });
  }

  // Menu items for hamburger (Mercado Pago style)
  const menuSections = [
    {
      title: 'Principal',
      items: [
        { name: 'Inicio', icon: Home, path: '/' },
        { name: 'Notificaciones', icon: Bell, path: '/notificaciones' },
        ...(hasModule('tesoreria') ? [{ name: 'Proyecciones', icon: TrendingUp, path: '/tesoreria' }] : []),
      ]
    },
    {
      title: 'Módulos',
      items: [
        ...(hasModule('contable') ? [
          { name: 'Contable', icon: BookOpen, path: '/contable' },
          { name: 'Comprobantes', icon: Receipt, path: '/contable/comprobantes' },
        ] : []),
        ...(hasModule('tesoreria') ? [
          { name: 'Tesorería', icon: Landmark, path: '/tesoreria' },
          { name: 'Movimientos', icon: DollarSign, path: '/tesoreria/movimientos' },
        ] : []),
        ...(hasModule('crm') ? [
          { name: 'CRM', icon: Briefcase, path: '/crm' },
          { name: 'Contactos', icon: Users, path: '/crm/contactos' },
        ] : []),
        ...(hasModule('comercial') ? [
          { name: 'Comercial', icon: Funnel, path: '/comercial' },
        ] : []),
        ...(hasModule('inmobiliaria') ? [
          { name: 'Inmobiliaria', icon: Building2, path: '/inmobiliaria' },
          { name: 'Propiedades', icon: Building2, path: '/inmobiliaria/propiedades' },
          { name: 'Contratos', icon: FileSignature, path: '/inmobiliaria/contratos' },
          { name: 'Agenda', icon: CalendarPlus, path: '/inmobiliaria/agenda' },
        ] : []),
      ]
    },
    {
      title: 'Reportes',
      items: [
        { name: 'Reportes', icon: BarChart3, path: '/reportes' },
      ]
    },
    {
      title: 'Cuenta',
      items: [
        { name: 'Configuración', icon: Settings, path: '/configuracion' },
        { name: 'Ayuda', icon: HelpCircle, path: '/ayuda' },
        ...(role === 'superadmin' ? [{ name: 'Super Admin', icon: Shield, path: '/superadmin' }] : []),
      ]
    },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const closeAll = () => { setShowActions(false); setShowMenu(false); };

  return (
    <>
      <nav className="mobile-nav">
        {/* 1. Inicio */}
        <Link to="/" className={`mobile-nav-item${isActive('/') ? ' active' : ''}`} onClick={closeAll}>
          <Home size={20} />
          <span>Inicio</span>
        </Link>

        {/* 2. Proyecciones */}
        <Link to="/tesoreria" className={`mobile-nav-item${isActive('/tesoreria') ? ' active' : ''}`} onClick={closeAll}>
          <TrendingUp size={20} />
          <span>Proyecc.</span>
        </Link>

        {/* 3. + (FAB) */}
        <button className="mobile-nav-item-center" onClick={() => { setShowActions(a => !a); setShowMenu(false); }}>
          {showActions ? <X size={22} /> : <Plus size={22} />}
        </button>

        {/* 4. Rubro (Inmobiliaria) */}
        {rubroModule && (
          <Link to={rubroPath} className={`mobile-nav-item${isActive(rubroPath) ? ' active' : ''}`} onClick={closeAll}>
            <Building2 size={20} />
            <span>Inmob.</span>
          </Link>
        )}

        {/* 5. Más (Hamburguesa) */}
        <button className={`mobile-nav-item${showMenu ? ' active' : ''}`} onClick={() => { setShowMenu(m => !m); setShowActions(false); }}>
          {showMenu ? <X size={20} /> : <Menu size={20} />}
          <span>Más</span>
        </button>
      </nav>

      {/* ── Floating Quick Actions Bar (+) ── */}
      {showActions && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-panel))', background: 'rgba(0,0,0,0.15)' }} onClick={() => setShowActions(false)} />
          <div className="mobile-fab-bar" onClick={e => e.stopPropagation()}>
            <button className="mobile-fab-item" onClick={() => { navigate('/crm'); setShowActions(false); }}>
              <Briefcase size={20} />
              <span>CRM</span>
            </button>
            <button className="mobile-fab-item" onClick={() => { navigate('/tesoreria'); setShowActions(false); }}>
              <Landmark size={20} />
              <span>Tesorería</span>
            </button>
          </div>
        </>
      )}

      {/* ── Hamburger Menu (Mercado Pago style) ── */}
      {showMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-panel) + 1)', display: 'flex', flexDirection: 'column' }} onClick={() => setShowMenu(false)}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
          <div className="mobile-menu-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />

            {/* User header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.125rem' }}>
                {(tenant as any)?.nombre?.[0] || 'N'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{(tenant as any)?.nombre || 'Mi Empresa'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tu perfil ›</div>
              </div>
            </div>

            {/* Menu sections */}
            <div style={{ maxHeight: 'calc(70vh - 120px)', overflowY: 'auto', paddingBottom: 16 }}>
              {menuSections.map(section => (
                <div key={section.title} style={{ marginBottom: 8 }}>
                  {section.items.length > 0 && (
                    <>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0', marginTop: 4 }}>
                        {section.title}
                      </div>
                      {section.items.map(item => (
                        <Link
                          key={item.name + item.path}
                          to={item.path}
                          onClick={() => setShowMenu(false)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 8px', borderRadius: 10,
                            color: isActive(item.path) ? 'var(--brand)' : 'var(--color-text-primary)',
                            textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 500,
                            background: isActive(item.path) ? 'var(--color-accent-subtle)' : 'transparent',
                          }}
                        >
                          <item.icon size={20} style={{ color: isActive(item.path) ? 'var(--brand)' : 'var(--color-text-muted)' }} />
                          {item.name}
                        </Link>
                      ))}
                      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '8px 0' }} />
                    </>
                  )}
                </div>
              ))}

              {/* Logout */}
              <button
                onClick={() => { signOut(); setShowMenu(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 8px', borderRadius: 10,
                  color: 'var(--color-danger)', fontSize: '0.9375rem', fontWeight: 500,
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-sans)', width: '100%',
                }}
              >
                <LogOut size={20} />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
