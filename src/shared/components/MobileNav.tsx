import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, TrendingUp, Plus, X, Building2, Menu,
  Upload, FileSignature, CalendarPlus, DollarSign, UserPlus,
  Settings, LogOut, Landmark, BookOpen, Briefcase, Funnel,
  Users, BarChart3, Receipt, Wallet, Bell, HelpCircle, Shield,
  FilePlus, PlusCircle, Banknote
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';

interface CreateAction { name: string; icon: any; path: string; }
interface CreateSection { title: string; actions: CreateAction[]; }

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, signOut } = useAuth() as any;
  const { tenant } = useTenant();
  const [showCreate, setShowCreate] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const tenantModules = (tenant as any)?.enabled_modules || [];
  const hasModule = (id: string) => tenantModules.includes(id);

  const rubroModule = tenantModules.find((m: string) => m === 'inmobiliaria') || null;
  const rubroPath = '/inmobiliaria';

  // Create menu sections
  const createSections: CreateSection[] = [];

  if (hasModule('crm')) {
    createSections.push({
      title: 'CRM',
      actions: [
        { name: 'Contacto', icon: UserPlus, path: '/crm/contactos?action=crear' },
        { name: 'Prospecto', icon: Users, path: '/crm/prospectos?action=crear' },
      ]
    });
  }

  if (hasModule('tesoreria')) {
    createSections.push({
      title: 'Tesorería',
      actions: [
        { name: 'Movimiento', icon: DollarSign, path: '/tesoreria/movimientos?action=crear' },
        { name: 'Caja', icon: Wallet, path: '/tesoreria/cajas?action=crear' },
        { name: 'Orden de\nPago', icon: Banknote, path: '/tesoreria/ordenes-pago?tab=nueva' },
      ]
    });
  }

  if (hasModule('contable')) {
    createSections.push({
      title: 'Contable',
      actions: [
        { name: 'Subir\nComprobante', icon: Upload, path: '/contable/comprobantes?tab=upload' },
        { name: 'Gasto', icon: Receipt, path: '/contable/comprobantes?tab=gasto' },
        { name: 'Ingreso', icon: FilePlus, path: '/contable/comprobantes?tab=ingreso' },
      ]
    });
  }

  if (hasModule('inmobiliaria')) {
    createSections.push({
      title: 'Inmobiliaria',
      actions: [
        { name: 'Propiedad', icon: Building2, path: '/inmobiliaria/propiedades?action=crear' },
        { name: 'Contrato', icon: FileSignature, path: '/inmobiliaria/contratos?action=crear' },
        { name: 'Vencimiento', icon: CalendarPlus, path: '/inmobiliaria/agenda?action=crear' },
      ]
    });
  }

  if (hasModule('comercial')) {
    createSections.push({
      title: 'Comercial',
      actions: [
        { name: 'Lead', icon: PlusCircle, path: '/comercial/pipeline?action=crear' },
      ]
    });
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

  const closeAll = () => { setShowCreate(false); setShowMenu(false); };

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
        <button className="mobile-nav-item-center" onClick={() => { setShowCreate(a => !a); setShowMenu(false); }}>
          {showCreate ? <X size={22} /> : <Plus size={22} />}
        </button>

        {/* 4. Rubro (Inmobiliaria) */}
        {rubroModule && (
          <Link to={rubroPath} className={`mobile-nav-item${isActive(rubroPath) ? ' active' : ''}`} onClick={closeAll}>
            <img src="/logo-inmobiliaria.png" alt="Inmob." className="mobile-nav-logo" />
            <span>Inmob.</span>
          </Link>
        )}

        {/* 5. Más (Hamburguesa) */}
        <button className={`mobile-nav-item${showMenu ? ' active' : ''}`} onClick={() => { setShowMenu(m => !m); setShowCreate(false); }}>
          {showMenu ? <X size={20} /> : <Menu size={20} />}
          <span>Más</span>
        </button>
      </nav>

      {/* ── Create Menu (bottom sheet) ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-panel) + 1)', display: 'flex', flexDirection: 'column' }} onClick={() => setShowCreate(false)}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
          <div className="mobile-create-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />

            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--color-text-primary)' }}>Crear</h2>

            <div style={{ maxHeight: 'calc(70vh - 80px)', overflowY: 'auto', paddingBottom: 16 }}>
              {createSections.map(section => (
                <div key={section.title} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                    {section.title}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {section.actions.map(action => (
                      <button
                        key={action.name}
                        className="mobile-create-action"
                        onClick={() => {
                          setShowCreate(false);
                          navigate(action.path);
                        }}
                      >
                        <div className="mobile-create-icon">
                          <action.icon size={22} />
                        </div>
                        <span>{action.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
