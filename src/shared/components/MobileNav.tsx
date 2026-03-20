import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Landmark, BookOpen, Briefcase, Funnel, Home,
  Plus, LayoutGrid, User, X, ChevronRight, Activity
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';

interface ModuleItem {
  id: string;
  name: string;
  path: string;
  icon: any;
}

export default function MobileNav() {
  const location = useLocation();
  const { role, signOut } = useAuth() as any;
  const { tenant } = useTenant();
  const [showMenu, setShowMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const tenantModules = (tenant as any)?.enabled_modules || [];
  const hasModule = (id: string) => tenantModules.includes(id);

  // Build available modules
  const modules: ModuleItem[] = [];
  modules.push({ id: 'vision', name: 'Visión General', path: '/', icon: LayoutDashboard });
  if (hasModule('tesoreria')) modules.push({ id: 'tesoreria', name: 'Tesorería', path: '/tesoreria', icon: Landmark });
  if (hasModule('contable')) modules.push({ id: 'contable', name: 'Contable', path: '/contable', icon: BookOpen });
  if (hasModule('crm')) modules.push({ id: 'crm', name: 'CRM', path: '/crm', icon: Briefcase });
  if (hasModule('comercial')) modules.push({ id: 'comercial', name: 'Comercial', path: '/comercial', icon: Funnel });
  if (hasModule('inmobiliaria')) modules.push({ id: 'inmobiliaria', name: 'Inmobiliaria', path: '/inmobiliaria', icon: Home });
  if (role === 'superadmin') modules.push({ id: 'superadmin', name: 'Super Admin', path: '/superadmin', icon: Activity });

  // Detect active module for the "current" tab
  const activeModule = modules.find(m => m.path !== '/' && location.pathname.startsWith(m.path)) || modules[0];
  const isHome = location.pathname === '/';

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav className="mobile-nav">
        <Link to="/" className={`mobile-nav-item${isHome ? ' active' : ''}`}>
          <LayoutDashboard size={20} />
          <span>Resumen</span>
        </Link>

        {activeModule && activeModule.path !== '/' && (
          <Link to={activeModule.path} className={`mobile-nav-item${!isHome && !showMenu ? ' active' : ''}`}>
            <activeModule.icon size={20} />
            <span>{activeModule.name}</span>
          </Link>
        )}

        <button className="mobile-nav-item-center" onClick={() => setShowMenu(m => !m)}>
          {showMenu ? <X size={22} /> : <Plus size={22} />}
        </button>

        <button className={`mobile-nav-item${showMenu ? ' active' : ''}`} onClick={() => setShowMenu(m => !m)}>
          <LayoutGrid size={20} />
          <span>Módulos</span>
        </button>

        <button className={`mobile-nav-item${showProfile ? ' active' : ''}`} onClick={() => { setShowProfile(p => !p); setShowMenu(false); }}>
          <User size={20} />
          <span>Perfil</span>
        </button>
      </nav>

      {/* Modules Menu Overlay */}
      {showMenu && (
        <div className="mobile-menu-overlay">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Módulos</h2>
            <button onClick={() => setShowMenu(false)} className="btn btn-ghost btn-icon"><X size={20} /></button>
          </div>

          {modules.map(mod => (
            <Link key={mod.id} to={mod.path} className="mobile-menu-item" onClick={() => setShowMenu(false)}>
              <div className="mobile-menu-item-icon">
                <mod.icon size={20} />
              </div>
              <span style={{ flex: 1 }}>{mod.name}</span>
              <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
            </Link>
          ))}
        </div>
      )}

      {/* Profile Overlay */}
      {showProfile && (
        <div className="mobile-menu-overlay">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Perfil</h2>
            <button onClick={() => setShowProfile(false)} className="btn btn-ghost btn-icon"><X size={20} /></button>
          </div>

          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-cta, #2563EB)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, margin: '0 auto 12px' }}>
              {(tenant?.name || 'N').charAt(0)}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>{tenant?.name || 'Usuario'}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textTransform: 'capitalize' }}>{role}</div>
          </div>

          <Link to="/configuracion" className="mobile-menu-item" onClick={() => setShowProfile(false)}>
            <div className="mobile-menu-item-icon">
              <LayoutDashboard size={20} />
            </div>
            <span style={{ flex: 1 }}>Configuración</span>
            <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
          </Link>

          <button onClick={() => { signOut(); setShowProfile(false); }} className="mobile-menu-item" style={{ width: '100%', textAlign: 'left', color: 'var(--color-danger)' }}>
            <div className="mobile-menu-item-icon" style={{ background: 'var(--color-danger-dim)', color: 'var(--color-danger)' }}>
              <X size={20} />
            </div>
            <span style={{ flex: 1 }}>Cerrar Sesión</span>
          </button>
        </div>
      )}
    </>
  );
}
