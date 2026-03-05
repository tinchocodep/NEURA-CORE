import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Settings, Eye, EyeOff, Save, RefreshCw, CheckCircle, XCircle, Zap, Building2, Mail, Download, Users } from 'lucide-react';
import { getXubioService } from '../../services/XubioService';

interface Config {
    id: string;
    xubio_client_id: string | null;
    xubio_client_secret: string | null;
    xubio_token: string | null;
    xubio_token_expires_at: string | null;
    arca_cuit: string | null;
    arca_certificate: string | null;
    arca_private_key: string | null;
    auto_approve_threshold: number;
    sync_enabled: boolean;
    last_sync_at: string | null;
}

export default function Configuracion() {
    const { tenant, refreshTenant } = useTenant();
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [testingXubio, setTestingXubio] = useState(false);
    const [testingArca, setTestingArca] = useState(false);
    const [xubioStatus, setXubioStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [arcaStatus, setArcaStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [xubioMessage, setXubioMessage] = useState('');

    // Sync state
    const [syncingClientes, setSyncingClientes] = useState(false);
    const [syncingProveedores, setSyncingProveedores] = useState(false);
    const [syncResult, setSyncResult] = useState('');

    // Tenant company data
    const [tenantRazonSocial, setTenantRazonSocial] = useState('');
    const [tenantCuit, setTenantCuit] = useState('');
    const [tenantDireccion, setTenantDireccion] = useState('');
    const [tenantEmail, setTenantEmail] = useState('');
    const [savingTenant, setSavingTenant] = useState(false);
    const [tenantSaved, setTenantSaved] = useState(false);

    // User management state
    const [tenantUsers, setTenantUsers] = useState<{ id: string; email: string; role: string; status: string; created_at: string }[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [invitePassword, setInvitePassword] = useState('');
    const [inviting, setInviting] = useState(false);
    const [inviteResult, setInviteResult] = useState<{ ok: boolean; msg: string } | null>(null);

    useEffect(() => {
        if (!tenant) return;
        loadConfig();
        loadUsers();
        setTenantRazonSocial(tenant.razon_social || tenant.name || '');
        setTenantCuit(tenant.cuit || '');
        setTenantDireccion(tenant.direccion || '');
        setTenantEmail(tenant.email || '');
    }, [tenant]);

    async function loadUsers() {
        if (!tenant) return;
        setLoadingUsers(true);
        const { data } = await supabase.from('users')
            .select('id, email, role, status, created_at')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: true });
        setTenantUsers((data || []) as any);
        setLoadingUsers(false);
    }

    async function handleInviteUser() {
        if (!tenant || !inviteEmail.trim() || !invitePassword.trim()) return;
        setInviting(true);
        setInviteResult(null);

        // 1) Sign up via Supabase Auth
        const { data: authData, error: authErr } = await supabase.auth.signUp({
            email: inviteEmail.trim(),
            password: invitePassword.trim(),
        });

        if (authErr || !authData.user) {
            setInviteResult({ ok: false, msg: authErr?.message || 'Error al crear usuario' });
            setInviting(false);
            return;
        }

        // 2) Insert into public.users with tenant + role='user'
        const { error: insertErr } = await supabase.from('users').insert({
            id: authData.user.id,
            tenant_id: tenant.id,
            email: inviteEmail.trim(),
            role: 'user',
            status: 'active',
        });

        if (insertErr) {
            setInviteResult({ ok: false, msg: `Auth creado pero error al vincular: ${insertErr.message}` });
        } else {
            setInviteResult({ ok: true, msg: `✅ Usuario ${inviteEmail.trim()} creado exitosamente` });
            setInviteEmail('');
            setInvitePassword('');
            loadUsers();
        }
        setInviting(false);
    }

    async function loadConfig() {
        setLoading(true);
        const { data } = await supabase.from('contable_config')
            .select('*')
            .eq('tenant_id', tenant!.id)
            .single();

        if (data) {
            setConfig(data as any);
        } else {
            // Create default config
            const { data: newConfig } = await supabase.from('contable_config')
                .insert({ tenant_id: tenant!.id })
                .select()
                .single();
            setConfig(newConfig as any);
        }
        setLoading(false);
    }

    async function handleSave() {
        if (!config) return;
        setSaving(true);
        await supabase.from('contable_config')
            .update({
                xubio_client_id: config.xubio_client_id,
                xubio_client_secret: config.xubio_client_secret,
                arca_cuit: config.arca_cuit,
                arca_certificate: config.arca_certificate,
                arca_private_key: config.arca_private_key,
                auto_approve_threshold: config.auto_approve_threshold,
                sync_enabled: config.sync_enabled,
            })
            .eq('id', config.id);
        setSaving(false);
    }

    async function handleSaveTenant() {
        if (!tenant) return;
        setSavingTenant(true);
        await supabase.from('tenants')
            .update({
                razon_social: tenantRazonSocial.trim() || null,
                cuit: tenantCuit.trim() || null,
                direccion: tenantDireccion.trim() || null,
                email: tenantEmail.trim() || null,
            })
            .eq('id', tenant.id);
        setSavingTenant(false);
        setTenantSaved(true);
        setTimeout(() => setTenantSaved(false), 2500);
        refreshTenant?.();
    }

    async function testXubio() {
        setTestingXubio(true);
        setXubioStatus('idle');
        setXubioMessage('');

        // First save current credentials
        if (config) {
            await supabase.from('contable_config').update({
                xubio_client_id: config.xubio_client_id,
                xubio_client_secret: config.xubio_client_secret,
            }).eq('id', config.id);
        }

        const xubio = getXubioService(tenant!.id);
        await xubio.loadConfig();

        if (!xubio.isConfigured) {
            setXubioStatus('error');
            setXubioMessage('Ingresá Client ID y Client Secret');
            setTestingXubio(false);
            return;
        }

        const result = await xubio.testConnection();
        setXubioStatus(result.success ? 'ok' : 'error');
        setXubioMessage(result.message);
        setTestingXubio(false);

        // Reload config to show updated token expiry
        if (result.success) await loadConfig();
    }

    async function handleSyncClientes() {
        setSyncingClientes(true);
        setSyncResult('');
        try {
            const xubio = getXubioService(tenant!.id);
            await xubio.loadConfig();
            const result = await xubio.syncClientesFromXubio();
            setSyncResult(`Clientes: ${result.imported} importados, ${result.updated} actualizados${result.errors.length ? ` (${result.errors.length} errores)` : ''}`);
        } catch (err) {
            setSyncResult(`Error sync clientes: ${(err as Error).message}`);
        }
        setSyncingClientes(false);
    }

    async function handleSyncProveedores() {
        setSyncingProveedores(true);
        setSyncResult('');
        try {
            const xubio = getXubioService(tenant!.id);
            await xubio.loadConfig();
            const result = await xubio.syncProveedoresFromXubio();
            setSyncResult(`Proveedores: ${result.imported} importados, ${result.updated} actualizados${result.errors.length ? ` (${result.errors.length} errores)` : ''}`);
        } catch (err) {
            setSyncResult(`Error sync proveedores: ${(err as Error).message}`);
        }
        setSyncingProveedores(false);
    }

    async function testArca() {
        setTestingArca(true);
        setArcaStatus('idle');
        await new Promise(r => setTimeout(r, 1500));
        setArcaStatus(config?.arca_cuit && config?.arca_certificate ? 'ok' : 'error');
        setTestingArca(false);
    }

    function updateConfig(field: string, value: any) {
        if (!config) return;
        setConfig({ ...config, [field]: value });
    }

    if (loading) {
        return (
            <div>
                <div className="page-header"><h1>Configuración</h1><p>Cargando...</p></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Configuración</h1>
                    <p>Credenciales de integración y parámetros del módulo contable</p>
                </div>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    <Save size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
            </div>

            {/* ═══ Datos de la Empresa ═══ */}
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={20} color="#3b82f6" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Datos de la Empresa</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Información fiscal y de contacto que aparece en remitos, recibos y comprobantes</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveTenant} disabled={savingTenant}>
                        {tenantSaved ? <><CheckCircle size={14} /> Guardado</> : <><Save size={14} /> {savingTenant ? 'Guardando...' : 'Guardar'}</>}
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="form-label">Razón Social</label>
                        <input className="form-input" value={tenantRazonSocial} onChange={e => setTenantRazonSocial(e.target.value)} placeholder="Mi Empresa S.R.L." />
                    </div>
                    <div className="form-group">
                        <label className="form-label">CUIT</label>
                        <input className="form-input" value={tenantCuit} onChange={e => setTenantCuit(e.target.value)} placeholder="30-12345678-9" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Dirección</label>
                        <input className="form-input" value={tenantDireccion} onChange={e => setTenantDireccion(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
                    </div>
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Mail size={14} color="var(--brand)" /> Email de la empresa
                        </label>
                        <input type="email" className="form-input" value={tenantEmail} onChange={e => setTenantEmail(e.target.value)} placeholder="contabilidad@miempresa.com" />
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Se usa como remitente al enviar facturas, remitos y recibos por email
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

                {/* Xubio */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={20} color="var(--brand)" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Xubio</h3>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>API de contabilidad · OAuth2</p>
                        </div>
                        {xubioStatus === 'ok' && <CheckCircle size={20} color="var(--success)" style={{ marginLeft: 'auto' }} />}
                        {xubioStatus === 'error' && <XCircle size={20} color="var(--danger)" style={{ marginLeft: 'auto' }} />}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Client ID</label>
                        <input className="form-input" value={config?.xubio_client_id || ''} onChange={e => updateConfig('xubio_client_id', e.target.value)} placeholder="Tu Client ID de Xubio" />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Client Secret</label>
                        <div style={{ position: 'relative' }}>
                            <input className="form-input" type={showSecret ? 'text' : 'password'} value={config?.xubio_client_secret || ''} onChange={e => updateConfig('xubio_client_secret', e.target.value)} placeholder="Tu Client Secret" style={{ paddingRight: 40 }} />
                            <button onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {config?.xubio_token_expires_at && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Token expira: {new Date(config.xubio_token_expires_at).toLocaleString('es-AR')}
                        </div>
                    )}

                    <button className="btn btn-secondary" onClick={testXubio} disabled={testingXubio} style={{ width: '100%' }}>
                        <RefreshCw size={14} className={testingXubio ? 'spinning' : ''} /> {testingXubio ? 'Conectando...' : 'Probar conexión'}
                    </button>

                    {xubioMessage && (
                        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--r-md)', background: xubioStatus === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: xubioStatus === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                            {xubioMessage}
                        </div>
                    )}

                    {/* Sync buttons — only show when connected */}
                    {xubioStatus === 'ok' && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Sincronización
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary btn-sm" onClick={handleSyncClientes} disabled={syncingClientes} style={{ flex: 1 }}>
                                    <Users size={13} /> {syncingClientes ? 'Sincronizando...' : 'Sync Clientes'}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleSyncProveedores} disabled={syncingProveedores} style={{ flex: 1 }}>
                                    <Download size={13} /> {syncingProveedores ? 'Sincronizando...' : 'Sync Proveedores'}
                                </button>
                            </div>
                            {syncResult && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-sm)' }}>
                                    {syncResult}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ARCA */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Settings size={20} color="var(--success)" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>ARCA (ex-AFIP)</h3>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Certificado digital · Mis Comprobantes</p>
                        </div>
                        {arcaStatus === 'ok' && <CheckCircle size={20} color="var(--success)" style={{ marginLeft: 'auto' }} />}
                        {arcaStatus === 'error' && <XCircle size={20} color="var(--danger)" style={{ marginLeft: 'auto' }} />}
                    </div>

                    <div className="form-group">
                        <label className="form-label">CUIT de la empresa</label>
                        <input className="form-input" value={config?.arca_cuit || ''} onChange={e => updateConfig('arca_cuit', e.target.value)} placeholder="Ej: 30-12345678-9" />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Certificado Digital (PEM)</label>
                        <textarea className="form-input" value={config?.arca_certificate || ''} onChange={e => updateConfig('arca_certificate', e.target.value)} placeholder="Pegá aquí el contenido del certificado .pem" rows={3} style={{ fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' as const }} />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Clave Privada</label>
                        <div style={{ position: 'relative' }}>
                            <textarea className="form-input" value={config?.arca_private_key || ''} onChange={e => updateConfig('arca_private_key', e.target.value)}
                                placeholder="Pegá aquí la clave privada" rows={3}
                                style={{
                                    fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' as const,
                                    WebkitTextSecurity: showKey ? 'none' : 'disc'
                                } as any}
                            />
                            <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button className="btn btn-secondary" onClick={testArca} disabled={testingArca} style={{ width: '100%' }}>
                        <RefreshCw size={14} className={testingArca ? 'spinning' : ''} /> {testingArca ? 'Probando...' : 'Probar conexión'}
                    </button>
                </div>
            </div>

            {/* General settings */}
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Parámetros Generales</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div className="form-group">
                        <label className="form-label">Umbral de Auto-Aprobación</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="range" min={0} max={100} value={config?.auto_approve_threshold || 95}
                                onChange={e => updateConfig('auto_approve_threshold', parseInt(e.target.value))}
                                style={{ flex: 1, accentColor: 'var(--brand)' }}
                            />
                            <span style={{ fontWeight: 700, fontSize: '1.125rem', minWidth: 40, textAlign: 'right' as const }}>
                                {config?.auto_approve_threshold || 95}%
                            </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Comprobantes con score ≥ este valor se aprueban automáticamente
                        </p>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Sincronización Automática</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                            <button
                                onClick={() => updateConfig('sync_enabled', !config?.sync_enabled)}
                                style={{
                                    width: 48, height: 26, borderRadius: 9999, border: 'none', cursor: 'pointer',
                                    background: config?.sync_enabled ? 'var(--brand)' : 'var(--border-strong)',
                                    transition: 'background 0.2s ease', position: 'relative',
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: 3, left: config?.sync_enabled ? 25 : 3,
                                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                    boxShadow: 'var(--shadow-sm)', transition: 'left 0.2s ease',
                                }} />
                            </button>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: config?.sync_enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                                {config?.sync_enabled ? 'Activa' : 'Inactiva'}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Fetch diario de ARCA e inyección automática a Xubio vía n8n
                        </p>
                        {config?.last_sync_at && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                Última sync: {new Date(config.last_sync_at).toLocaleString('es-AR')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ Usuarios ═══ */}
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={20} color="#a855f7" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Usuarios de la Empresa</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Administrá los usuarios que tienen acceso al sistema bajo este tenant</p>
                    </div>
                </div>

                {/* User list */}
                {loadingUsers ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cargando usuarios...</div>
                ) : (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                            <span>Email</span>
                            <span>Rol</span>
                            <span>Estado</span>
                            <span>Creado</span>
                        </div>
                        {tenantUsers.map(u => (
                            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.8rem', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.email}</span>
                                <span>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                                        background: u.role === 'admin' || u.role === 'superadmin' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(107, 114, 128, 0.1)',
                                        color: u.role === 'admin' || u.role === 'superadmin' ? '#6366f1' : '#6b7280',
                                    }}>
                                        {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Usuario'}
                                    </span>
                                </span>
                                <span>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                                        background: u.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: u.status === 'active' ? '#10b981' : '#ef4444',
                                    }}>
                                        {u.status === 'active' ? 'Activo' : 'Inactivo'}
                                    </span>
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {new Date(u.created_at).toLocaleDateString('es-AR')}
                                </span>
                            </div>
                        ))}
                        {tenantUsers.length === 0 && (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No hay usuarios registrados</div>
                        )}
                    </div>
                )}

                {/* Invite form */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Agregar nuevo usuario
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Email</label>
                            <input
                                className="form-input"
                                type="email"
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                                placeholder="usuario@empresa.com"
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Contraseña temporal</label>
                            <input
                                className="form-input"
                                type="text"
                                value={invitePassword}
                                onChange={e => setInvitePassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleInviteUser}
                            disabled={inviting || !inviteEmail.trim() || !invitePassword.trim()}
                            style={{ height: 38 }}
                        >
                            {inviting ? 'Creando...' : '+ Agregar'}
                        </button>
                    </div>
                    {inviteResult && (
                        <div style={{
                            marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.625rem 0.875rem',
                            borderRadius: 'var(--r-md)',
                            background: inviteResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: inviteResult.ok ? 'var(--success)' : 'var(--danger)',
                        }}>
                            {inviteResult.msg}
                        </div>
                    )}
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        El usuario se crea con rol "Usuario" y acceso completo. Compartile el email y contraseña para que inicie sesión.
                    </p>
                </div>
            </div>
        </div>
    );
}
