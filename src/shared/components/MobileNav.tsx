import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, TrendingUp, Plus, X, Building2, Menu,
  Upload, FileSignature, CalendarPlus, DollarSign, UserPlus,
  Settings, LogOut, Landmark, BookOpen, Briefcase, Funnel,
  Users, BarChart3, Receipt, Wallet, Bell, HelpCircle, Shield,
  FilePlus, PlusCircle, Banknote, CheckCircle, CircleDollarSign
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
      <nav className="mobile-nav" style={{ justifyContent: 'space-around' }}>
        {/* 1. Inicio */}
        <Link to="/" className={`mobile-nav-item${isActive('/') && !showMenu ? ' active' : ''}`} onClick={closeAll}>
          <Home size={20} />
          <span>Inicio</span>
        </Link>

        {/* 2. Operaciones */}
        <Link to="/inmobiliaria/liquidaciones" className={`mobile-nav-item${(isActive('/inmobiliaria/liquidaciones') || isActive('/inmobiliaria/agenda')) && !showMenu ? ' active' : ''}`} onClick={closeAll}>
          <CheckCircle size={20} />
          <span>Operac.</span>
        </Link>

        {/* 3. Inmob. */}
        <Link to="/inmobiliaria" className={`mobile-nav-item${isActive('/inmobiliaria') && !isActive('/inmobiliaria/liquidaciones') && !isActive('/inmobiliaria/agenda') && !showMenu ? ' active' : ''}`} onClick={closeAll}>
          <Building2 size={20} />
          <span>Inmob.</span>
        </Link>

        {/* 4. Admin. */}
        <Link to="/tesoreria" className={`mobile-nav-item${(isActive('/tesoreria') || isActive('/contable')) && !showMenu ? ' active' : ''}`} onClick={closeAll}>
          <CircleDollarSign size={20} />
          <span>Admin.</span>
        </Link>

        {/* 5. Más */}
        <button className={`mobile-nav-item${showMenu ? ' active' : ''}`} onClick={() => { setShowMenu(m => !m); setShowCreate(false); }}>
          <Menu size={20} />
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

      {/* ── Más Menu — always-expanded index ── */}
      {showMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-panel) + 1)', display: 'flex', flexDirection: 'column' }} onClick={() => setShowMenu(false)}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
          <div className="mobile-menu-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />

            {/* Profile header */}
            <Link to="/configuracion" onClick={() => setShowMenu(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0', textDecoration: 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-cta, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.125rem', flexShrink: 0 }}>
                {((tenant as any)?.name || 'N').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{(tenant as any)?.name || 'Mi Empresa'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tu perfil ›</div>
              </div>
            </Link>

            <div style={{ maxHeight: 'calc(70vh - 120px)', overflowY: 'auto', paddingBottom: 16 }}>

              {/* ── MÓDULOS ── */}
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0 10px' }}>
                Módulos
              </div>

              {/* Inmobiliaria */}
              {hasModule('inmobiliaria') && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <Building2 size={18} color="#185FA5" />
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Inmobiliaria</span>
                </div>
                {([
                  { name: 'Dashboard', path: '/inmobiliaria' },
                  { name: 'Propiedades', path: '/inmobiliaria/propiedades', badge: '10' },
                  { name: 'Contratos', path: '/inmobiliaria/contratos', badge: '2 vencen', badgeColor: '#F59E0B' },
                  { name: 'Liquidaciones', path: '/inmobiliaria/liquidaciones' },
                  { name: 'Cuentas', path: '/inmobiliaria/cuentas' },
                  { name: 'Agenda', path: '/inmobiliaria/agenda' },
                ] as { name: string; path: string; badge?: string; badgeColor?: string }[]).map(item => (
                  <Link key={item.path} to={item.path} onClick={() => setShowMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0 11px 32px', borderBottom: '1px solid #f8f8f8', textDecoration: 'none', color: '#555', fontSize: '0.8125rem' }}>
                    <span>{item.name}</span>
                    {item.badge && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${item.badgeColor || '#3B82F6'}15`, color: item.badgeColor || '#3B82F6' }}>{item.badge}</span>
                    )}
                  </Link>
                ))}
                <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />
              </>)}

              {/* Administración (Tesorería + Contable) */}
              {(hasModule('tesoreria') || hasModule('contable')) && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <Landmark size={18} color="#185FA5" />
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Administración</span>
                </div>
                {([
                  ...(hasModule('tesoreria') ? [
                    { name: 'Movimientos', path: '/tesoreria/movimientos', badge: '3 pend.', badgeColor: '#F59E0B' },
                    { name: 'Órdenes de pago', path: '/tesoreria/ordenes-pago' },
                    { name: 'Cajas', path: '/tesoreria/cajas' },
                    { name: 'Bancos', path: '/tesoreria/bancos' },
                  ] : []),
                  ...(hasModule('contable') ? [
                    { name: 'Comprobantes', path: '/contable/comprobantes' },
                    { name: 'Gastos', path: '/contable/comprobantes?tab=gasto' },
                    { name: 'Ingresos', path: '/contable/comprobantes?tab=ingreso' },
                  ] : []),
                  ...(hasModule('tesoreria') ? [
                    { name: 'Proyecciones', path: '/tesoreria' },
                  ] : []),
                ] as { name: string; path: string; badge?: string; badgeColor?: string }[]).map(item => (
                  <Link key={item.path + item.name} to={item.path} onClick={() => setShowMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0 11px 32px', borderBottom: '1px solid #f8f8f8', textDecoration: 'none', color: '#555', fontSize: '0.8125rem' }}>
                    <span>{item.name}</span>
                    {item.badge && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${item.badgeColor || '#3B82F6'}15`, color: item.badgeColor || '#3B82F6' }}>{item.badge}</span>
                    )}
                  </Link>
                ))}
                <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />
              </>)}

              {/* CRM */}
              {hasModule('crm') && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <Briefcase size={18} color="#185FA5" />
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>CRM</span>
                </div>
                {([
                  { name: 'Contactos', path: '/crm/contactos' },
                  { name: 'Prospectos', path: '/crm/prospectos' },
                ] as { name: string; path: string; badge?: string; badgeColor?: string }[]).map(item => (
                  <Link key={item.path} to={item.path} onClick={() => setShowMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0 11px 32px', borderBottom: '1px solid #f8f8f8', textDecoration: 'none', color: '#555', fontSize: '0.8125rem' }}>
                    <span>{item.name}</span>
                  </Link>
                ))}
                <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />
              </>)}

              {/* ── HERRAMIENTAS ── */}
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 10px' }}>
                Herramientas
              </div>
              {([
                { name: 'Agenda', icon: CalendarPlus, path: '/inmobiliaria/agenda' },
                { name: 'Reportes', icon: BarChart3, path: '/comercial/reportes' },
              ]).map(item => (
                <Link key={item.name} to={item.path} onClick={() => setShowMenu(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: '1px solid #f8f8f8', textDecoration: 'none', color: '#555', fontSize: '0.8125rem' }}>
                  <item.icon size={16} color="#999" />
                  <span>{item.name}</span>
                </Link>
              ))}
              <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />

              {/* ── CUENTA ── */}
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 10px' }}>
                Cuenta
              </div>
              {([
                ...(role === 'admin' || role === 'superadmin' ? [{ name: 'Equipo', icon: Users, path: '/tesoreria/equipo' }] : []),
                { name: 'Configuración', icon: Settings, path: '/configuracion' },
                { name: 'Ayuda', icon: HelpCircle, path: '/ayuda' },
                ...(role === 'superadmin' ? [{ name: 'Super Admin', icon: Shield, path: '/superadmin' }] : []),
              ]).map(item => (
                <Link key={item.name} to={item.path} onClick={() => setShowMenu(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: '1px solid #f8f8f8', textDecoration: 'none', color: '#555', fontSize: '0.8125rem' }}>
                  <item.icon size={16} color="#999" />
                  <span>{item.name}</span>
                </Link>
              ))}

              {/* Cerrar sesión */}
              <button
                onClick={() => { signOut(); setShowMenu(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px', color: '#C93B3B', fontSize: '0.8125rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', width: '100%', marginTop: 4 }}>
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
