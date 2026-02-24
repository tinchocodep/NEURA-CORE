import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Activity, Settings, CheckCircle, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface Tenant {
    id: string;
    name: string;
    enabled_modules: string[];
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

const AVAILABLE_MODULES = [
    { id: 'tesoreria', name: 'Tesorería' },
    { id: 'crm', name: 'CRM' },
    { id: 'administracion', name: 'Administración' },
    { id: 'logistica', name: 'Logística' }
];

export default function SuperAdminDashboard() {
    const { role, loading: authLoading } = useAuth() as any;
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        if (role === 'superadmin') {
            loadData();
        }
    }, [role]);

    const loadData = async () => {
        setLoading(true);
        const [tenantsRes, usersRes] = await Promise.all([
            supabase.from('tenants').select('*').order('created_at', { ascending: false }),
            supabase.from('users').select('id, email, role, status, tenant_id, enabled_modules')
        ]);

        if (!tenantsRes.error && tenantsRes.data) {
            setTenants(tenantsRes.data);
        }
        if (!usersRes.error && usersRes.data) {
            setUsers(usersRes.data);
        }
        setLoading(false);
    };

    const handleSaveTenant = async (tenantId: string, updates: Partial<Tenant>) => {
        setSaving(tenantId);
        const { error } = await supabase
            .from('tenants')
            .update(updates)
            .eq('id', tenantId);

        if (!error) {
            setTenants(tenants.map(t => t.id === tenantId ? { ...t, ...updates } : t));
        } else {
            alert('Error al guardar: ' + error.message);
        }

        setTimeout(() => setSaving(null), 1000); // Visual feedback
    };

    const toggleModule = (tenant: Tenant, moduleId: string) => {
        const currentModules = tenant.enabled_modules || [];
        const newModules = currentModules.includes(moduleId)
            ? currentModules.filter(m => m !== moduleId)
            : [...currentModules, moduleId];

        handleSaveTenant(tenant.id, { enabled_modules: newModules });
    };

    const handleSaveUser = async (userId: string, updates: Partial<User>) => {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);

        if (!error) {
            setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
        } else {
            alert('Error al actualizar usuario: ' + error.message);
        }
    };

    const toggleUserModule = (userObj: User, moduleId: string) => {
        const currentModules = userObj.enabled_modules || [];
        const newModules = currentModules.includes(moduleId)
            ? currentModules.filter(m => m !== moduleId)
            : [...currentModules, moduleId];

        handleSaveUser(userObj.id, { enabled_modules: newModules });
    };

    if (authLoading) return <div className="p-8">Verificando credenciales...</div>;

    if (role !== 'superadmin') {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="superadmin-dashboard" style={{ padding: '2rem' }}>
            <div className="page-header" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                            background: 'white',
                            borderRadius: 'var(--radius-md)',
                            padding: '1.5rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{tenant.name}</h2>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    ID: {tenant.id.slice(0, 8)}...
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                                {/* Módulos */}
                                <div>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                        <Settings size={18} /> Módulos Activos
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {AVAILABLE_MODULES.map(mod => {
                                            const isActive = (tenant.enabled_modules || []).includes(mod.id);
                                            return (
                                                <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isActive}
                                                        onChange={() => toggleModule(tenant, mod.id)}
                                                        style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' }}
                                                    />
                                                    <span>{mod.name}</span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Facturación */}
                                <div>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                        <Activity size={18} /> Configuración de Cobro
                                    </h3>
                                    <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                                        <div className="form-group">
                                            <label className="form-label">Costo de Instalación (USD)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                defaultValue={tenant.installation_fee || 0}
                                                onBlur={(e) => handleSaveTenant(tenant.id, { installation_fee: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Abono Mensual (USD)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                defaultValue={tenant.monthly_fee || 0}
                                                onBlur={(e) => handleSaveTenant(tenant.id, { monthly_fee: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    {saving === tenant.id && (
                                        <div style={{ marginTop: '1rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                            <CheckCircle size={16} /> Cambios guardados
                                        </div>
                                    )}
                                </div>

                                {/* Usuarios */}
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                                        <Users size={18} /> Administración de Usuarios ({users.filter(u => u.tenant_id === tenant.id).length})
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                        {users.filter(u => u.tenant_id === tenant.id).length === 0 ? (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>No hay usuarios en esta empresa.</div>
                                        ) : (
                                            users.filter(u => u.tenant_id === tenant.id).map(u => (
                                                <div key={u.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                                                    <div style={{ flex: '1 1 200px' }}>
                                                        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{u.email || 'Usuario sin correo'}</div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                            <select
                                                                className="form-input"
                                                                style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto' }}
                                                                value={u.role || 'user'}
                                                                onChange={(e) => handleSaveUser(u.id, { role: e.target.value })}
                                                            >
                                                                <option value="user">Usuario Bás.</option>
                                                                <option value="admin">Administrador</option>
                                                                <option value="superadmin">Super Admin</option>
                                                            </select>
                                                            <select
                                                                className="form-input"
                                                                style={{ padding: '0.25rem', fontSize: '0.8rem', height: 'auto', color: u.status === 'active' ? 'var(--success)' : 'var(--danger)' }}
                                                                value={u.status || 'active'}
                                                                onChange={(e) => handleSaveUser(u.id, { status: e.target.value })}
                                                            >
                                                                <option value="active">Activo</option>
                                                                <option value="suspended">Suspendido</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div style={{ flex: '2 1 300px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                            <div style={{ fontWeight: 500, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Módulos del Usuario</div>
                                                            {(u.role === 'admin' || u.role === 'superadmin') && (
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, background: 'rgba(79, 70, 229, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>
                                                                    Acceso Total por Rol
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                            {AVAILABLE_MODULES.map(mod => {
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
                                                                )
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
