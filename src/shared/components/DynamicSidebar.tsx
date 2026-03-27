import { NavLink, useLocation } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { resolveIcon } from '../utils/iconMap';

interface SidebarChild {
  id: string;
  label: string;
  path: string;
  icon: string;
  module_required?: string;
}

interface SidebarSection {
  id: string;
  label: string;
  icon: string;
  path?: string;
  module_required?: string;
  children?: SidebarChild[];
}

export default function DynamicSidebar() {
  const { tenant } = useTenant();
  const location = useLocation();
  const sections: SidebarSection[] = tenant?.sidebar_config?.sections || [];

  return (
    <>
      {/* Spacer top */}
      <div style={{ flex: 1 }} />

      {sections.map(section => {
        const Icon = resolveIcon(section.icon);
        const hasChildren = section.children && section.children.length > 0;
        // Active if on the section path, or on any child path
        const active = section.path
          ? location.pathname === section.path
          : hasChildren
            ? section.children!.some(c => location.pathname.startsWith(c.path))
            : false;
        // Default path: section.path or first child's path
        const defaultPath = section.path || (hasChildren ? section.children![0].path : '/');

        return (
          <NavLink
            key={section.id}
            to={defaultPath}
            className="sidebar-icon-btn"
            style={{
              width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'var(--color-accent)' : 'var(--color-bg-surface)',
              color: active ? '#fff' : 'var(--color-text-muted)',
              textDecoration: 'none',
              boxShadow: active ? 'none' : 'var(--shadow-sm)',
              transition: 'all 0.15s',
              border: active ? 'none' : '1px solid var(--color-border-subtle)',
            }}
          >
            <Icon size={20} />
            <span className="sidebar-icon-tooltip">{section.label}</span>
          </NavLink>
        );
      })}

      {/* Spacer bottom */}
      <div style={{ flex: 1 }} />
    </>
  );
}
