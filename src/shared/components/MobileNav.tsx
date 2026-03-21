import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Landmark, BookOpen, Briefcase, Funnel, Home,
  Plus, X, Activity,
  Upload, FileText, FileSignature, Building2, CalendarPlus, DollarSign, UserPlus, Settings
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';

interface ModuleItem { id: string; name: string; path: string; icon: any; }
interface QuickAction { name: string; icon: any; path: string; color: string; }

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, signOut } = useAuth() as any;
  const { tenant } = useTenant();
  const [showActions, setShowActions] = useState(false);

  const tenantModules = (tenant as any)?.enabled_modules || [];
  const hasModule = (id: string) => tenantModules.includes(id);

  // Modules
  const modules: ModuleItem[] = [];
  modules.push({ id: 'vision', name: 'Visión General', path: '/', icon: LayoutDashboard });
  if (hasModule('tesoreria')) modules.push({ id: 'tesoreria', name: 'Tesorería', path: '/tesoreria', icon: Landmark });
  if (hasModule('contable')) modules.push({ id: 'contable', name: 'Contable', path: '/contable', icon: BookOpen });
  if (hasModule('crm')) modules.push({ id: 'crm', name: 'CRM', path: '/crm', icon: Briefcase });
  if (hasModule('comercial')) modules.push({ id: 'comercial', name: 'Comercial', path: '/comercial', icon: Funnel });
  if (hasModule('inmobiliaria')) modules.push({ id: 'inmobiliaria', name: 'Inmobiliaria', path: '/inmobiliaria', icon: Home });
  if (role === 'superadmin') modules.push({ id: 'superadmin', name: 'Super Admin', path: '/superadmin', icon: Activity });

  // Quick actions based on active modules
  const actions: QuickAction[] = [];
  if (hasModule('contable')) {
    actions.push({ name: 'Subir comprobante', icon: Upload, path: '/contable/comprobantes', color: '#3B82F6' });
    actions.push({ name: 'Nueva cotización', icon: DollarSign, path: '/contable', color: '#10B981' });
  }
  if (hasModule('inmobiliaria')) {
    actions.push({ name: 'Nueva propiedad', icon: Building2, path: '/inmobiliaria/propiedades', color: '#8B5CF6' });
    actions.push({ name: 'Nuevo contrato', icon: FileSignature, path: '/inmobiliaria/contratos', color: '#F59E0B' });
    actions.push({ name: 'Nuevo vencimiento', icon: CalendarPlus, path: '/inmobiliaria/agenda', color: '#EF4444' });
  }
  if (hasModule('crm')) {
    actions.push({ name: 'Nuevo prospecto', icon: UserPlus, path: '/crm/prospectos', color: '#0D9488' });
  }
  if (hasModule('comercial')) {
    actions.push({ name: 'Nuevo lead', icon: UserPlus, path: '/comercial/pipeline', color: '#EC4899' });
  }
  if (hasModule('tesoreria')) {
    actions.push({ name: 'Nuevo movimiento', icon: FileText, path: '/tesoreria/movimientos', color: '#6366F1' });
  }

  const isHome = location.pathname === '/';

  const closeAll = () => { setShowActions(false); };

  return (
    <>
      <nav className="mobile-nav">
        <Link to="/" className={`mobile-nav-item${isHome ? ' active' : ''}`} onClick={closeAll}>
          <LayoutDashboard size={20} />
          <span>Resumen</span>
        </Link>

        {hasModule('tesoreria') && (
          <Link to="/tesoreria" className={`mobile-nav-item${location.pathname.startsWith('/tesoreria') ? ' active' : ''}`} onClick={closeAll}>
            <Landmark size={20} />
            <span>Tesorería</span>
          </Link>
        )}

        <button className="mobile-nav-item-center" onClick={() => { setShowActions(a => !a); ; }}>
          {showActions ? <X size={22} /> : <Plus size={22} />}
        </button>

        {hasModule('contable') && (
          <Link to="/contable" className={`mobile-nav-item${location.pathname.startsWith('/contable') ? ' active' : ''}`} onClick={closeAll}>
            <BookOpen size={20} />
            <span>Contable</span>
          </Link>
        )}

        {hasModule('inmobiliaria') && (
          <Link to="/inmobiliaria" className={`mobile-nav-item${location.pathname.startsWith('/inmobiliaria') ? ' active' : ''}`} onClick={closeAll}>
            <Home size={20} />
            <span>Inmob.</span>
          </Link>
        )}
      </nav>

      {/* ── Quick Actions Overlay ── */}
      {showActions && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-panel) + 1)', display: 'flex', flexDirection: 'column' }} onClick={() => setShowActions(false)}>
          {/* Backdrop */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
          {/* Content from bottom */}
          <div style={{ background: 'var(--color-bg-base)', borderRadius: '20px 20px 0 0', padding: '20px 16px', paddingBottom: 80 }} onClick={e => e.stopPropagation()}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Acciones Rápidas</h2>
            <button onClick={() => setShowActions(false)} className="btn btn-ghost btn-icon"><X size={20} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {actions.map(a => (
              <button key={a.name} className="mobile-action-card" onClick={() => { navigate(a.path); setShowActions(false); }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${a.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <a.icon size={20} color={a.color} />
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{a.name}</span>
              </button>
            ))}
          </div>

          {/* Más módulos + Perfil */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Más</div>
            {modules.filter(m => !['/', '/tesoreria', '/contable', '/inmobiliaria'].includes(m.path)).map(mod => (
              <Link key={mod.id} to={mod.path} onClick={() => setShowActions(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, color: 'var(--color-text-primary)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
                <mod.icon size={18} style={{ color: 'var(--color-text-muted)' }} />
                {mod.name}
              </Link>
            ))}
            <Link to="/configuracion" onClick={() => setShowActions(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, color: 'var(--color-text-primary)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
              <Settings size={18} style={{ color: 'var(--color-text-muted)' }} />
              Configuración
            </Link>
            <button onClick={() => { signOut(); setShowActions(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, color: 'var(--color-danger)', fontSize: '0.875rem', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', width: '100%' }}>
              <X size={18} />
              Cerrar Sesión
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Modules and Profile overlays removed — now inside quick actions menu */}
    </>
  );
}
