import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Activity, Settings, CheckCircle, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface Tenant {
    id: string;
    name: string;
    enabled_modules: string[];
    rubro: string;
    monthly_fee: number;
    installation_fee: number;
    created_at: string;
}

interface User {
    id: string;
    email: string;
    role: string;
    status: string;
    tenant_id: string;
    enabled_modules?: string[];
}

interface Submodule {
    id: string;
    name: string;
    rubros?: string[];
}

interface ModuleNode {
    id: string;
    name: string;
    submodules: Submodule[];
    rubros?: string[];
}

const RUBROS = [
    { id: 'general', label: 'General', color: '#8C959F' },
    { id: 'automotriz', label: 'Automotriz', color: '#2563EB' },
    { id: 'inmobiliaria', label: 'Gestor', color: '#16A34A' },
    { id: 'constructora', label: 'Constructora', color: '#D97706' },
    { id: 'logistica', label: 'Logística', color: '#8B5CF6' },
    { id: 'contable', label: 'Estudio Contable', color: '#0284C7' },
];

const MODULE_TREE: ModuleNode[] = [
    {
        id: 'tesoreria',
        name: 'Tesorería',
        submodules: [
            { id: 'tesoreria.movimientos', name: 'Movimientos' },
            { id: 'tesoreria.ordenes-pago', name: 'Órdenes de Pago' },
            { id: 'tesoreria.comprobantes', name: 'Comprobantes' },
            { id: 'tesoreria.cajas', name: 'Cajas Chicas' },
            { id: 'tesoreria.bancos', name: 'Bancos' },
            { id: 'tesoreria.monitor', name: 'Monitor Fiscal' },
            { id: 'tesoreria.equipo', name: 'Equipo' },
        ],
    },
    {
        id: 'contable',
        name: 'Contable',
        submodules: [
            { id: 'contable.comprobantes', name: 'Comprobantes' },
            { id: 'contable.proveedores', name: 'Proveedores' },
            { id: 'contable.clientes', name: 'Clientes' },
            { id: 'contable.catalogos', name: 'Categorías' },
            { id: 'contable.conciliacion', name: 'Conciliación' },
        ],
    },
    {
        id: 'crm',
        name: 'CRM',
        submodules: [
            { id: 'crm.contactos', name: 'Contactos' },
            { id: 'crm.prospectos', name: 'Prospectos' },
            { id: 'crm.obras', name: 'Obras', rubros: ['constructora'] },
            { id: 'crm.catalogo', name: 'Catálogo Vehículos', rubros: ['automotriz'] },
        ],
    },
    {
        id: 'comercial',
        name: 'Comercial',
        submodules: [
            { id: 'comercial.pipeline', name: 'Pipeline' },
            { id: 'comercial.contactos', name: 'Contactos' },
            { id: 'comercial.reportes', name: 'Reportes' },
            { id: 'comercial.config', name: 'Configuración' },
        ],
    },
    {
        id: 'inmobiliaria',
        name: 'Gestor',
        rubros: ['inmobiliaria'],
        submodules: [
            { id: 'inmobiliaria.propiedades', name: 'Propiedades' },
            { id: 'inmobiliaria.contratos', name: 'Contratos' },
            { id: 'inmobiliaria.liquidaciones', name: 'Liquidaciones' },
            { id: 'inmobiliaria.cuentas', name: 'Cuentas Corrientes' },
            { id: 'inmobiliaria.agenda', name: 'Agenda' },
            { id: 'inmobiliaria.reportes', name: 'Reportes' },
        ],
    },
    { id: 'administracion', name: 'Administración', submodules: [] },
    { id: 'logistica', name: 'Logística', submodules: [] },
];

// ── helpers ──────────────────────────────────────────────────────────────────

const isParentActive = (modules: string[], parentId: string) =>
    modules.includes(parentId);

const isSubActive = (modules: string[], parentId: string, subId: string) => {
    if (!modules.includes(parentId)) return false;
    const hasConstraints = modules.some(m => m.startsWith(`${parentId}.`));
    if (!hasConstraints) return true; // no constraints = all submodules allowed
    return modules.includes(subId);
};

const applyToggleParent = (modules: string[], mod: ModuleNode): string[] => {
    if (modules.includes(mod.id)) {
        // Turn OFF: remove parent + all submodule entries
        return modules.filter(m => m !== mod.id && !m.startsWith(`${mod.id}.`));
    }
    // Turn ON: add parent only (absence of sub-entries = all submodules allowed)
    return [...modules, mod.id];
};

const applyToggleSub = (
    modules: string[],
    parentId: string,
    subId: string,
    allSubIds: string[]
): string[] => {
    const active = isSubActive(modules, parentId, subId);
    const hasConstraints = modules.some(m => m.startsWith(`${parentId}.`));

    if (active) {
        // Turn OFF
        if (!hasConstraints) {
            // Materialize: explicitly enable all others, disable this one
            return [...modules, ...allSubIds.filter(s => s !== subId)];
        }
        return modules.filter(m => m !== subId);
    } else {
        // Turn ON
        return [...modules, subId];
    }
};

// ── component ─────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
    const { role, loading: authLoading } = useAuth() as any;
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    // expanded: key = `${tenantId}.${moduleId}`
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (role === 'superadmin') loadData();
    }, [role]);

    const loadData = async () => {
        setLoading(true);
        const [tenantsRes, usersRes] = await Promise.all([
            supabase.from('tenants').select('*').order('created_at', { ascending: false }),
            supabase.from('users').select('id, email, role, status, tenant_id, enabled_modules'),
        ]);
        if (!tenantsRes.error && tenantsRes.data) setTenants(tenantsRes.data);
        if (!usersRes.error && usersRes.data) setUsers(usersRes.data);
        setLoading(false);
    };

    const saveTenant = async (tenantId: string, updates: Partial<Tenant>) => {
        setSaving(tenantId);
        const { error } = await supabase.from('tenants').update(updates).eq('id', tenantId);
        if (!error) {
            setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, ...updates } : t));
        } else {
            alert('Error al guardar: ' + error.message);
        }
        setTimeout(() => setSaving(null), 1200);
    };

    const saveUser = async (userId: string, updates: Partial<User>) => {
        const { error } = await supabase.from('users').update(updates).eq('id', userId);
        if (!error) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
        } else {
            alert('Error al actualizar usuario: ' + error.message);
        }
    };

    const toggleParent = (tenant: Tenant, mod: ModuleNode) => {
        const newModules = applyToggleParent(tenant.enabled_modules || [], mod);
        saveTenant(tenant.id, { enabled_modules: newModules });
    };

    const toggleSub = (tenant: Tenant, parentId: string, subId: string, allSubIds: string[]) => {
        const newModules = applyToggleSub(tenant.enabled_modules || [], parentId, subId, allSubIds);
        saveTenant(tenant.id, { enabled_modules: newModules });
    };

    const toggleUserModule = (u: User, moduleId: string) => {
        const current = u.enabled_modules || [];
        const next = current.includes(moduleId)
            ? current.filter(m => m !== moduleId)
            : [...current, moduleId];
        saveUser(u.id, { enabled_modules: next });
    };

    const toggleExpand = (tenantId: string, modId: string) => {
        const key = `${tenantId}.${modId}`;
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const isExpanded = (tenantId: string, modId: string) => {
        const key = `${tenantId}.${modId}`;
        // Default to expanded if parent is active and has submodules
        return expanded[key] !== undefined ? expanded[key] : true;
    };

    if (authLoading) return <div className="p-8">Verificando credenciales...</div>;
    if (role !== 'superadmin') return <Navigate to="/" replace />;

    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Activity size={32} color="var(--primary)" />
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Panel Super Admin</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Gestión centralizada de Empresas, Módulos y Facturación.</p>
                </div>
            </div>

            {loading ? (
                <div>Cargando empresas...</div>
            ) : (
                <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {tenants.map(tenant => (
                        <div key={tenant.id} style={{
                            background: 'var(--bg-card, white)',
                            borderRadius: 'var(--radius-md)',
                            padding: '1.5rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            border: '1px solid var(--border-color)',
                        }}>
                            {/* Tenant header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{tenant.name}</h2>
                                    {(() => {
                                        const r = RUBROS.find(r => r.id === (tenant.rubro || 'general')) || RUBROS[0];
                                        return <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: r.color + '18', color: r.color }}>{r.label}</span>;
                                    })()}
                                </div>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    ID: {tenant.id.slice(0, 8)}…
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                                {/* ── Módulos con submódulos ── */}
                                <div>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                        <Settings size={18} /> Módulos Activos
                                    </h3>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {MODULE_TREE.map(mod => {
                                            const parentOn = isParentActive(tenant.enabled_modules || [], mod.id);
                                            const open = isExpanded(tenant.id, mod.id);
                                            const allSubIds = mod.submodules.map(s => s.id);

                                            return (
                                                <div key={mod.id} style={{
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    overflow: 'hidden',
                                                }}>
                                                    {/* Parent row */}
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.75rem',
                                                        padding: '0.6rem 0.75rem',
                                                        background: parentOn ? 'rgba(79,70,229,0.06)' : 'transparent',
                                                        cursor: 'default',
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={parentOn}
                                                            onChange={() => toggleParent(tenant, mod)}
                                                            style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                                                        />
                                                        <span style={{ fontWeight: 600, flex: 1, fontSize: '0.9rem' }}>{mod.name}</span>

                                                        {mod.submodules.length > 0 && parentOn && (
                                                            <button
                                                                onClick={() => toggleExpand(tenant.id, mod.id)}
                                                                style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                                    color: 'var(--text-muted)', padding: '0 0.25rem',
                                                                    display: 'flex', alignItems: 'center',
                                                                }}
                                                                title={open ? 'Colapsar' : 'Expandir'}
                                                            >
                                                                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Submodule rows */}
                                                    {parentOn && open && mod.submodules.length > 0 && (
                                                        <div style={{
                                                            borderTop: '1px solid var(--border-color)',
                                                            padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.4rem',
                                                            background: 'var(--bg-subtle, #f9fafb)',
                                                        }}>
                                                            {mod.submodules.map(sub => {
                                                                const subOn = isSubActive(tenant.enabled_modules || [], mod.id, sub.id);
                                                                return (
                                                                    <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={subOn}
                                                                            onChange={() => toggleSub(tenant, mod.id, sub.id, allSubIds)}
                                                                            style={{ width: '0.95rem', height: '0.95rem', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                                                        />
                                                                        <span style={{ color: subOn ? 'var(--text-main)' : 'var(--text-muted)' }}>{sub.name}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── Rubro + Facturación ── */}
                                <div>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                        <Activity size={18} /> Rubro y Cobro
                                    </h3>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">Rubro / Industria</label>
                                        <select className="form-input" value={tenant.rubro || 'general'}
                                            onChange={e => saveTenant(tenant.id, { rubro: e.target.value })}>
                                            {RUBROS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                                        <div className="form-group">
                                            <label className="form-label">Costo de Instalación (USD)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                defaultValue={tenant.installation_fee || 0}
                                                onBlur={(e) => saveTenant(tenant.id, { installation_fee: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Abono Mensual (USD)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                defaultValue={tenant.monthly_fee || 0}
                                                onBlur={(e) => saveTenant(tenant.id, { monthly_fee: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    {saving === tenant.id && (
                                        <div style={{ marginTop: '1rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                            <CheckCircle size={16} /> Cambios guardados
                                        </div>
                                    )}
                                </div>

                                {/* ── Usuarios ── */}
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                        <Users size={18} /> Usuarios ({users.filter(u => u.tenant_id === tenant.id).length})
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                        {users.filter(u => u.tenant_id === tenant.id).length === 0 ? (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>No hay usuarios en esta empresa.</div>
                                        ) : (
                                            users.filter(u => u.tenant_id === tenant.id).map(u => (
                                                <div key={u.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                                                    {/* User info + role */}
                                                    <div style={{ flex: '1 1 200px' }}>
                                                        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{u.email || 'Sin correo'}</div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                            <select
                                                                className="form-input"
                                                                style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto' }}
                                                                value={u.role || 'user'}
                                                                onChange={(e) => saveUser(u.id, { role: e.target.value })}
                                                            >
                                                                <option value="user">Usuario Bás.</option>
                                                                <option value="admin">Administrador</option>
                                                                <option value="superadmin">Super Admin</option>
                                                            </select>
                                                            <select
                                                                className="form-input"
                                                                style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', color: u.status === 'active' ? 'var(--success)' : 'var(--danger)' }}
                                                                value={u.status || 'active'}
                                                                onChange={(e) => saveUser(u.id, { status: e.target.value })}
                                                            >
                                                                <option value="active">Activo</option>
                                                                <option value="suspended">Suspendido</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* User modules (parent-level) */}
                                                    <div style={{ flex: '2 1 300px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                            <div style={{ fontWeight: 500, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Módulos del Usuario</div>
                                                            {(u.role === 'admin' || u.role === 'superadmin') && (
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, background: 'rgba(79,70,229,0.1)', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>
                                                                    Acceso Total por Rol
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                            {MODULE_TREE.filter(m => isParentActive(tenant.enabled_modules || [], m.id)).map(mod => {
                                                                const isFullAccess = u.role === 'admin' || u.role === 'superadmin';
                                                                const isActive = isFullAccess || (u.enabled_modules || []).includes(mod.id);
                                                                return (
                                                                    <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: isFullAccess ? 'not-allowed' : 'pointer', fontSize: '0.8rem', opacity: isFullAccess ? 0.6 : 1 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isActive}
                                                                            disabled={isFullAccess}
                                                                            onChange={() => toggleUserModule(u, mod.id)}
                                                                            style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)', cursor: isFullAccess ? 'not-allowed' : 'pointer' }}
                                                                        />
                                                                        <span>{mod.name}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
