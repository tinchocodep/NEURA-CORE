import { useEffect, useState, useRef } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Settings, Eye, EyeOff, Save, RefreshCw, CheckCircle, XCircle, Zap, Building2, Mail, Download, Users, Upload, Image, Palette, Landmark, Plus, Trash2 } from 'lucide-react';
import { SkeletonCard } from '../../shared/components/SkeletonKit';
import { getXubioService } from '../../services/XubioService';
import { getColpyService } from '../../services/ColpyService';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

/* ─── Types ─────────────────── */
interface Config {
    id: string;
    xubio_client_id: string | null;
    xubio_client_secret: string | null;
    colpy_username: string | null;
    colpy_password: string | null;
    colpy_empresa_id: string | null;
    xubio_token: string | null;
    xubio_token_expires_at: string | null;
    arca_cuit: string | null;
    arca_certificate: string | null;
    arca_private_key: string | null;
    auto_approve_threshold: number;
    sync_enabled: boolean;
    last_sync_at: string | null;
}

interface BankCredential {
    id?: string;
    bank_code: string;
    client_id: string;
    client_secret: string;
    environment: string;
}

type TabKey = 'empresa' | 'integraciones' | 'usuarios';

const TABS: { key: TabKey; label: string; icon: any }[] = [
    { key: 'empresa', label: 'Empresa', icon: Building2 },
    { key: 'integraciones', label: 'Integraciones', icon: Zap },
    { key: 'usuarios', label: 'Usuarios', icon: Users },
];

/* ─── Component ─────────────── */
export default function Configuracion() {
    const { tenant, refreshTenant } = useTenant();
    const { refreshProfile } = useAuth();
    const { theme, setTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<TabKey>('empresa');
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [testingXubio, setTestingXubio] = useState(false);
    const [testingColpy, setTestingColpy] = useState(false);
    const [testingArca, setTestingArca] = useState(false);
    const [xubioStatus, setXubioStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [colpyStatus, setColpyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [arcaStatus, setArcaStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [xubioMessage, setXubioMessage] = useState('');
    const [colpyMessage, setColpyMessage] = useState('');
    const [colpyEmpresas, setColpyEmpresas] = useState<{ idEmpresa: string, RazonSocial: string }[] | null>(null);
    const [loadingColpyEmpresas, setLoadingColpyEmpresas] = useState(false);

    // Bank integration state
    const [bankCreds, setBankCreds] = useState<BankCredential[]>([]);
    const [showBankSecret, setShowBankSecret] = useState<Record<string, boolean>>({});

    // Sync state
    const [syncingClientes, setSyncingClientes] = useState(false);
    const [syncingProveedores, setSyncingProveedores] = useState(false);
    const [syncResult, setSyncResult] = useState('');

    const [syncingColpyClientes, setSyncingColpyClientes] = useState(false);
    const [syncingColpyProveedores, setSyncingColpyProveedores] = useState(false);
    const [syncColpyResult, setSyncColpyResult] = useState('');

    // Tenant company data
    const [tenantRazonSocial, setTenantRazonSocial] = useState('');
    const [tenantCuit, setTenantCuit] = useState('');
    const [tenantDireccion, setTenantDireccion] = useState('');
    const [tenantEmail, setTenantEmail] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#3b82f6');
    const [logoUrl, setLogoUrl] = useState('');
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uiFontSize, setUiFontSize] = useState('medium');
    const [uiDensity, setUiDensity] = useState('normal');
    const [savingTenant, setSavingTenant] = useState(false);
    const [tenantSaved, setTenantSaved] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // User management state
    const [tenantUsers, setTenantUsers] = useState<{ id: string; email: string; role: string; status: string; created_at: string; display_name: string | null }[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [invitePassword, setInvitePassword] = useState('');
    const [inviting, setInviting] = useState(false);
    const [inviteResult, setInviteResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRole, setEditRole] = useState('');
    const [editPassword, setEditPassword] = useState('');
    const [savingUser, setSavingUser] = useState(false);
    const [userSaveResult, setUserSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

    useEffect(() => {
        if (!tenant) return;
        loadConfig();
        loadUsers();
        setTenantRazonSocial(tenant.razon_social || tenant.name || '');
        setTenantCuit(tenant.cuit || '');
        setTenantDireccion(tenant.direccion || '');
        setTenantEmail(tenant.email || '');
        setPrimaryColor(tenant.primary_color || '#3b82f6');
        setLogoUrl(tenant.logo_url || '');
        setUiFontSize((tenant as any).ui_font_size || 'medium');
        setUiDensity((tenant as any).ui_density || 'normal');
    }, [tenant?.id]);

    /* ─── Data Loaders ─── */
    async function loadConfig() {
        setLoading(true);
        const { data } = await supabase.from('contable_config').select('*').eq('tenant_id', tenant!.id).single();
        if (data) {
            setConfig(data as any);
        } else {
            const { data: newConfig } = await supabase.from('contable_config').insert({ tenant_id: tenant!.id }).select().single();
            setConfig(newConfig as any);
        }

        const { data: bData } = await supabase.from('tesoreria_bank_credentials').select('*').eq('tenant_id', tenant!.id);
        if (bData) setBankCreds(bData);

        setLoading(false);
    }

    async function loadUsers() {
        if (!tenant) return;
        setLoadingUsers(true);
        const { data } = await supabase.from('users').select('id, email, role, status, created_at, display_name').eq('tenant_id', tenant.id).order('created_at', { ascending: true });
        setTenantUsers((data || []) as any);
        setLoadingUsers(false);
    }

    function startEditUser(u: typeof tenantUsers[0]) {
        setEditingUserId(u.id);
        setEditName(u.display_name || '');
        setEditRole(u.role);
        setEditPassword('');
        setUserSaveResult(null);
    }

    function cancelEditUser() {
        setEditingUserId(null);
        setEditPassword('');
        setUserSaveResult(null);
    }

    async function handleSaveUser() {
        if (!editingUserId) return;
        setSavingUser(true);
        setUserSaveResult(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`https://fuytejvnwihghxymyayw.supabase.co/functions/v1/admin-update-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    user_id: editingUserId,
                    display_name: editName,
                    new_role: editRole,
                    ...(editPassword.length >= 6 ? { new_password: editPassword } : {}),
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error al guardar');
            setUserSaveResult({ ok: true, msg: 'Usuario actualizado correctamente' });
            setEditingUserId(null);
            setEditPassword('');
            await loadUsers();
            await refreshProfile();
        } catch (err) {
            setUserSaveResult({ ok: false, msg: (err as Error).message });
        }
        setSavingUser(false);
    }

    /* ─── Handlers ─── */
    async function handleSave() {
        if (!config) return;
        setSaving(true);
        await supabase.from('contable_config').update({
            xubio_client_id: config.xubio_client_id,
            xubio_client_secret: config.xubio_client_secret,
            colpy_username: config.colpy_username,
            colpy_password: config.colpy_password,
            colpy_empresa_id: config.colpy_empresa_id,
            arca_cuit: config.arca_cuit,
            arca_certificate: config.arca_certificate,
            arca_private_key: config.arca_private_key,
            auto_approve_threshold: config.auto_approve_threshold,
            sync_enabled: config.sync_enabled,
        }).eq('id', config.id);
        setSaving(false);
    }

    async function handleSaveBankCred(index: number) {
        if (!tenant) return;
        setSaving(true);
        const cred = bankCreds[index];
        if (cred.id) {
            await supabase.from('tesoreria_bank_credentials').update({
                bank_code: cred.bank_code,
                client_id: cred.client_id,
                client_secret: cred.client_secret,
                environment: cred.environment
            }).eq('id', cred.id);
        } else {
            const { data } = await supabase.from('tesoreria_bank_credentials').insert({
                tenant_id: tenant.id,
                bank_code: cred.bank_code || 'supervielle',
                client_id: cred.client_id,
                client_secret: cred.client_secret,
                environment: cred.environment || 'sandbox'
            }).select().single();
            if (data) {
                const newCreds = [...bankCreds];
                newCreds[index] = data;
                setBankCreds(newCreds);
            }
        }
        setSaving(false);
    }

    async function handleRemoveBankCred(index: number) {
        if (!tenant) return;
        const cred = bankCreds[index];
        if (cred.id) {
            await supabase.from('tesoreria_bank_credentials').delete().eq('id', cred.id);
        }
        setBankCreds(prev => prev.filter((_, i) => i !== index));
    }

    async function handleSaveTenant() {
        if (!tenant) return;
        setSavingTenant(true);
        await supabase.from('tenants').update({
            razon_social: tenantRazonSocial.trim() || null,
            cuit: tenantCuit.trim() || null,
            direccion: tenantDireccion.trim() || null,
            email: tenantEmail.trim() || null,
            primary_color: primaryColor,
            logo_url: logoUrl || null,
            ui_font_size: uiFontSize,
            ui_density: uiDensity,
        }).eq('id', tenant.id);
        setSavingTenant(false);
        setTenantSaved(true);
        setTimeout(() => setTenantSaved(false), 2500);
        // Apply styles immediately
        const root = document.documentElement;
        root.style.setProperty('--color-accent', primaryColor);
        root.style.setProperty('--color-accent-dim', primaryColor + '18');
        root.style.setProperty('--tenant-primary', primaryColor);
        const fontMap: Record<string, string> = { small: '13.5px', medium: '15px', large: '16.5px' };
        root.style.setProperty('--font-size-base', fontMap[uiFontSize] || '15px');
        const densityMap: Record<string, string> = { compact: '0.85', normal: '1', comfortable: '1.2' };
        root.style.setProperty('--density-scale', densityMap[uiDensity] || '1');
        refreshTenant?.();
    }

    async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !tenant) return;
        setUploadingLogo(true);
        const ext = file.name.split('.').pop();
        const path = `logos/${tenant.id}.${ext}`;
        const { error } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true });
        if (!error) {
            const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
            const url = urlData.publicUrl + '?t=' + Date.now();
            setLogoUrl(url);
            await supabase.from('tenants').update({ logo_url: url }).eq('id', tenant.id);
            refreshTenant?.();
        }
        setUploadingLogo(false);
    }

    async function handleInviteUser() {
        if (!tenant || !inviteEmail.trim() || !invitePassword.trim()) return;
        setInviting(true);
        setInviteResult(null);
        const { data: authData, error: authErr } = await supabase.auth.signUp({
            email: inviteEmail.trim(),
            password: invitePassword.trim(),
            options: { data: { tenant_id: tenant.id } },
        });
        if (authErr || !authData.user) {
            setInviteResult({ ok: false, msg: authErr?.message || 'Error al crear usuario' });
            setInviting(false);
            return;
        }
        const { error: insertErr } = await supabase.from('users').insert({
            id: authData.user.id,
            tenant_id: tenant.id,
            email: inviteEmail.trim(),
            role: 'user',
            status: 'active',
            enabled_modules: (tenant as any).enabled_modules || ['contable'],
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

    async function testXubio() {
        setTestingXubio(true); setXubioStatus('idle'); setXubioMessage('');
        if (config) {
            await supabase.from('contable_config').update({ xubio_client_id: config.xubio_client_id, xubio_client_secret: config.xubio_client_secret }).eq('id', config.id);
        }
        const xubio = getXubioService(tenant!.id);
        await xubio.loadConfig();
        if (!xubio.isConfigured) { setXubioStatus('error'); setXubioMessage('Ingresá Client ID y Client Secret'); setTestingXubio(false); return; }
        const result = await xubio.testConnection();
        setXubioStatus(result.success ? 'ok' : 'error');
        setXubioMessage(result.message);
        setTestingXubio(false);
        if (result.success) await loadConfig();
    }

    async function testColpy() {
        setTestingColpy(true); setColpyStatus('idle'); setColpyMessage('');
        if (config) {
            await supabase.from('contable_config').update({ 
                colpy_username: config.colpy_username, 
                colpy_password: config.colpy_password,
                colpy_empresa_id: config.colpy_empresa_id
            }).eq('id', config.id);
        }
        const colpy = getColpyService(tenant!.id);
        await colpy.loadConfig();
        if (!colpy.isConfigured) { setColpyStatus('error'); setColpyMessage('Ingresá Usuario y Contraseña'); setTestingColpy(false); return; }
        const result = await colpy.testConnection();
        setColpyStatus(result.success ? 'ok' : 'error');
        setColpyMessage(result.message);
        setTestingColpy(false);
        if (result.success) await loadConfig();
    }

    async function buscarEmpresasColpy() {
        setLoadingColpyEmpresas(true);
        setColpyMessage('');
        try {
            if (config) {
                await supabase.from('contable_config').update({ 
                    colpy_username: config.colpy_username, 
                    colpy_password: config.colpy_password
                }).eq('id', config.id);
            }
            const colpy = getColpyService(tenant!.id);
            await colpy.loadConfig();
            if (!colpy.isConfigured) { 
                setColpyStatus('error'); 
                setColpyMessage('Primero debés ingresar tu Usuario y Contraseña'); 
                setLoadingColpyEmpresas(false); 
                return; 
            }
            const empresas = await colpy.getEmpresas();
            setColpyEmpresas(empresas);
            if(empresas.length === 0) {
                 setColpyStatus('error');
                 setColpyMessage('No se encontraron empresas para este usuario');
            } else {
                 setColpyStatus('ok');
                 setColpyMessage('Empresas generadas con éxito. Seleccioná una abajo.');
            }
        } catch(e:any) {
            setColpyStatus('error');
            setColpyMessage('Error al buscar empresas: ' + e.message);
        }
        setLoadingColpyEmpresas(false);
    }

    async function handleSyncColpyClientes() {
        setSyncingColpyClientes(true); setSyncColpyResult('');
        try { const colpy = getColpyService(tenant!.id); await colpy.loadConfig(); const r = await colpy.syncClientesFromColpy(); setSyncColpyResult(`Clientes: ${r.imported} importados, ${r.updated} actualizados${r.errors.length ? ` (${r.errors.length} errores)` : ''}`); }
        catch (e: any) { setSyncColpyResult(`Error: ${e.message}`); }
        finally { setSyncingColpyClientes(false); }
    }

    async function handleSyncColpyProveedores() {
        setSyncingColpyProveedores(true); setSyncColpyResult('');
        try { const colpy = getColpyService(tenant!.id); await colpy.loadConfig(); const r = await colpy.syncProveedoresFromColpy(); setSyncColpyResult(`Proveedores: ${r.imported} importados, ${r.updated} actualizados${r.errors.length ? ` (${r.errors.length} errores)` : ''}`); }
        catch (e: any) { setSyncColpyResult(`Error: ${e.message}`); }
        finally { setSyncingColpyProveedores(false); }
    }

    async function handleSyncClientes() {
        setSyncingClientes(true); setSyncResult('');
        try { const xubio = getXubioService(tenant!.id); await xubio.loadConfig(); const r = await xubio.syncClientesFromXubio(); setSyncResult(`Clientes: ${r.imported} importados, ${r.updated} actualizados${r.errors.length ? ` (${r.errors.length} errores)` : ''}`); }
        catch (err) { setSyncResult(`Error: ${(err as Error).message}`); }
        setSyncingClientes(false);
    }

    async function handleSyncProveedores() {
        setSyncingProveedores(true); setSyncResult('');
        try { const xubio = getXubioService(tenant!.id); await xubio.loadConfig(); const r = await xubio.syncProveedoresFromXubio(); setSyncResult(`Proveedores: ${r.imported} importados, ${r.updated} actualizados${r.errors.length ? ` (${r.errors.length} errores)` : ''}`); }
        catch (err) { setSyncResult(`Error: ${(err as Error).message}`); }
        setSyncingProveedores(false);
    }

    async function testArca() {
        setTestingArca(true); setArcaStatus('idle');
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <SkeletonCard lines={4} />
                    <SkeletonCard lines={4} />
                </div>
            </div>
        );
    }

    /* ─── Tab Content Renderers ─── */
    const renderEmpresa = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Logo + Color */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Image size={16} color="var(--brand)" /> Identidad Visual
                </h3>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                    {/* Logo preview */}
                    <div
                        onClick={() => logoInputRef.current?.click()}
                        style={{
                            width: 96, height: 96, borderRadius: 16, flexShrink: 0,
                            border: '2px dashed var(--border-strong)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', overflow: 'hidden',
                            background: logoUrl ? 'transparent' : 'var(--bg-subtle)',
                            transition: 'border-color 0.2s',
                        }}
                    >
                        {uploadingLogo ? (
                            <RefreshCw size={20} className="spinning" style={{ color: 'var(--text-muted)' }} />
                        ) : logoUrl ? (
                            <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <Upload size={18} style={{ color: 'var(--text-muted)', marginBottom: 4 }} />
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Subir logo</div>
                            </div>
                        )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            Este logo aparecerá en la pantalla de login, sidebar y documentos generados (remitos, recibos).
                        </p>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Palette size={13} /> Color primario
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={e => setPrimaryColor(e.target.value)}
                                    style={{ width: 36, height: 32, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0, background: 'transparent' }}
                                />
                                <input
                                    className="form-input"
                                    value={primaryColor}
                                    onChange={e => setPrimaryColor(e.target.value)}
                                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                {/* Font size + Density + Theme */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                    <div>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Tamaño de texto</label>
                        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                            {([['small', 'Chico'], ['medium', 'Medio'], ['large', 'Grande']] as const).map(([val, lbl]) => (
                                <button key={val} onClick={() => setUiFontSize(val)} style={{
                                    flex: 1, padding: '6px 0', fontSize: val === 'small' ? '0.65rem' : val === 'large' ? '0.8rem' : '0.72rem',
                                    fontWeight: uiFontSize === val ? 700 : 500, border: 'none', cursor: 'pointer',
                                    background: uiFontSize === val ? 'var(--brand)' : 'var(--bg-subtle)',
                                    color: uiFontSize === val ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s',
                                }}>{lbl}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Densidad</label>
                        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                            {([['compact', 'Compacto'], ['normal', 'Normal'], ['comfortable', 'Cómodo']] as const).map(([val, lbl]) => (
                                <button key={val} onClick={() => setUiDensity(val)} style={{
                                    flex: 1, padding: '6px 0', fontSize: '0.72rem',
                                    fontWeight: uiDensity === val ? 700 : 500, border: 'none', cursor: 'pointer',
                                    background: uiDensity === val ? 'var(--brand)' : 'var(--bg-subtle)',
                                    color: uiDensity === val ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s',
                                }}>{lbl}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Tema</label>
                        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                            {([['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Auto']] as const).map(([val, lbl]) => (
                                <button key={val} onClick={() => setTheme(val)} style={{
                                    flex: 1, padding: '6px 0', fontSize: '0.72rem',
                                    fontWeight: theme === val ? 700 : 500, border: 'none', cursor: 'pointer',
                                    background: theme === val ? 'var(--brand)' : 'var(--bg-subtle)',
                                    color: theme === val ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s',
                                }}>{lbl}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Company data */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={16} color="#3b82f6" /> Datos Fiscales
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Razón Social</label>
                        <input className="form-input" value={tenantRazonSocial} onChange={e => setTenantRazonSocial(e.target.value)} placeholder="Mi Empresa S.R.L." />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">CUIT</label>
                        <input className="form-input" value={tenantCuit} onChange={e => setTenantCuit(e.target.value)} placeholder="30-12345678-9" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Dirección</label>
                        <input className="form-input" value={tenantDireccion} onChange={e => setTenantDireccion(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Mail size={12} /> Email
                        </label>
                        <input className="form-input" type="email" value={tenantEmail} onChange={e => setTenantEmail(e.target.value)} placeholder="contabilidad@empresa.com" />
                    </div>
                </div>
            </div>

            {/* General settings — full width */}
            <div className="card" style={{ padding: '1.5rem', gridColumn: '1/-1' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={16} color="var(--text-muted)" /> Parámetros Generales
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Umbral de Auto-Aprobación</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="range" min={0} max={100} value={config?.auto_approve_threshold || 95}
                                onChange={e => updateConfig('auto_approve_threshold', parseInt(e.target.value))}
                                style={{ flex: 1, accentColor: 'var(--brand)' }} />
                            <span style={{ fontWeight: 700, fontSize: '1.125rem', minWidth: 40, textAlign: 'right' as const }}>{config?.auto_approve_threshold || 95}%</span>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Comprobantes con score ≥ este valor se aprueban automáticamente</p>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Sincronización Automática</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                            <button onClick={() => updateConfig('sync_enabled', !config?.sync_enabled)} style={{
                                width: 48, height: 26, borderRadius: 9999, border: 'none', cursor: 'pointer',
                                background: config?.sync_enabled ? 'var(--brand)' : 'var(--border-strong)', transition: 'background 0.2s ease', position: 'relative',
                            }}>
                                <span style={{ position: 'absolute', top: 3, left: config?.sync_enabled ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', transition: 'left 0.2s ease' }} />
                            </button>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: config?.sync_enabled ? 'var(--success)' : 'var(--text-muted)' }}>{config?.sync_enabled ? 'Activa' : 'Inactiva'}</span>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Fetch diario de ARCA e inyección automática a Xubio vía n8n</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderIntegraciones = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* SECCIÓN 1: ERPs Contables */}
            <details open style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <summary style={{ padding: '1rem 1.5rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer', background: 'var(--bg-subtle)' }}>
                    Sistemas ERP Contables
                </summary>
                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', alignItems: 'start', background: 'var(--bg-main)' }}>
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Token expira: {new Date(config.xubio_token_expires_at).toLocaleString('es-AR')}</div>
                )}
                <button className="btn btn-secondary" onClick={testXubio} disabled={testingXubio} style={{ width: '100%' }}>
                    <RefreshCw size={14} className={testingXubio ? 'spinning' : ''} /> {testingXubio ? 'Conectando...' : 'Probar conexión'}
                </button>
                {xubioMessage && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--r-md)', background: xubioStatus === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: xubioStatus === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                        {xubioMessage}
                    </div>
                )}
                {xubioStatus === 'ok' && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Sincronización</div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={handleSyncClientes} disabled={syncingClientes} style={{ flex: 1 }}>
                                <Users size={13} /> {syncingClientes ? 'Sincronizando...' : 'Sync Clientes'}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={handleSyncProveedores} disabled={syncingProveedores} style={{ flex: 1 }}>
                                <Download size={13} /> {syncingProveedores ? 'Sincronizando...' : 'Sync Proveedores'}
                            </button>
                        </div>
                        {syncResult && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-sm)' }}>{syncResult}</div>}
                    </div>
                )}
            </div>

            {/* Colpy */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(234, 88, 12, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={20} color="#ea580c" />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Colpy</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ERP Contable · Transaccional</p>
                    </div>
                    {colpyStatus === 'ok' && <CheckCircle size={20} color="var(--success)" style={{ marginLeft: 'auto' }} />}
                    {colpyStatus === 'error' && <XCircle size={20} color="var(--danger)" style={{ marginLeft: 'auto' }} />}
                </div>
                <div className="form-group">
                    <label className="form-label">Usuario (Email)</label>
                    <input className="form-input" value={config?.colpy_username || ''} onChange={e => updateConfig('colpy_username', e.target.value)} placeholder="Email de acceso a Colpy" />
                </div>
                <div className="form-group">
                    <label className="form-label">Contraseña</label>
                    <div style={{ position: 'relative' }}>
                        <input className="form-input" type={showSecret ? 'text' : 'password'} value={config?.colpy_password || ''} onChange={e => updateConfig('colpy_password', e.target.value)} placeholder="Contraseña de Colpy" style={{ paddingRight: 40 }} />
                        <button onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        ID de Empresa
                        <button 
                             onClick={buscarEmpresasColpy} 
                             disabled={loadingColpyEmpresas}
                             style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                            {loadingColpyEmpresas ? 'Buscando...' : 'Buscar mis empresas'}
                        </button>
                    </label>
                    {colpyEmpresas && colpyEmpresas.length > 0 && (
                        <select 
                            className="form-input" 
                            style={{ marginBottom: '0.5rem' }}
                            value={config?.colpy_empresa_id || ''} 
                            onChange={e => updateConfig('colpy_empresa_id', e.target.value)}
                        >
                            <option value="">Seleccioná una empresa de la lista...</option>
                            {colpyEmpresas.map((emp: any, idx) => (
                                <option key={emp.IdEmpresa ? `${emp.IdEmpresa}-${idx}` : idx} value={emp.IdEmpresa}>
                                    {emp.razonSocial || emp.Nombre || emp.RazonSocial} (ID: {emp.IdEmpresa})
                                </option>
                            ))}
                        </select>
                    )}
                    <input className="form-input" value={config?.colpy_empresa_id || ''} onChange={e => updateConfig('colpy_empresa_id', e.target.value)} placeholder="Ej: 118337 (Ingresar a mano u obtener desde 'Buscar mis empresas')" />
                </div>
                <button className="btn btn-secondary" onClick={testColpy} disabled={testingColpy} style={{ width: '100%' }}>
                    <RefreshCw size={14} className={testingColpy ? 'spinning' : ''} /> {testingColpy ? 'Conectando...' : 'Probar conexión al ERP'}
                </button>
                {colpyMessage && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--r-md)', background: colpyStatus === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: colpyStatus === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                        {colpyMessage}
                    </div>
                )}
                
                {colpyStatus === 'ok' && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Sincronización</div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={handleSyncColpyClientes} disabled={syncingColpyClientes} style={{ flex: 1 }}>
                                <Users size={13} /> {syncingColpyClientes ? 'Sincronizando...' : 'Sync Clientes'}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={handleSyncColpyProveedores} disabled={syncingColpyProveedores} style={{ flex: 1 }}>
                                <Download size={13} /> {syncingColpyProveedores ? 'Sincronizando...' : 'Sync Proveedores'}
                            </button>
                        </div>
                        {syncColpyResult && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-sm)' }}>{syncColpyResult}</div>}
                    </div>
                )}
            </div>
                </div>
            </details>

            {/* SECCIÓN 2: ARCA */}
            <details style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <summary style={{ padding: '1rem 1.5rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer', background: 'var(--bg-subtle)' }}>
                    Reguladores y Facturación Electrónica
                </summary>
                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', alignItems: 'start', background: 'var(--bg-main)' }}>
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
                            style={{ fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' as const, WebkitTextSecurity: showKey ? 'none' : 'disc' } as any} />
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
            </details>

            {/* SECCIÓN 3: BANCOS */}
            <details style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <summary style={{ padding: '1rem 1.5rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer', background: 'var(--bg-subtle)' }}>
                    Conexiones Bancarias (Host-to-Host)
                </summary>
                <div style={{ padding: '1.5rem', background: 'var(--bg-main)' }}>
            {/* API Bancaria Directa (Host-to-Host) */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Landmark size={20} color="#3b82f6" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Conexión Bancaria Directa (Host-to-Host)</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Configurá las credenciales API OAuth2 para conciliación en tiempo real.</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setBankCreds([...bankCreds, { bank_code: 'supervielle', client_id: '', client_secret: '', environment: 'sandbox' }])}>
                        <Plus size={14} /> Añadir Banco
                    </button>
                </div>

                {bankCreds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-md)' }}>
                        No hay credenciales bancarias configuradas.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                        {bankCreds.map((cred, i) => (
                            <div key={cred.id || i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700 }}>Credencial #{i + 1}</h4>
                                    <button onClick={() => handleRemoveBankCred(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Banco</label>
                                    <select className="form-input" value={cred.bank_code} onChange={e => { const copy = [...bankCreds]; copy[i].bank_code = e.target.value; setBankCreds(copy); }} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                                        <option value="supervielle">Banco Supervielle</option>
                                        <option value="galicia">Banco Galicia</option>
                                        <option value="santander">Banco Santander</option>
                                        <option value="macro">Banco Macro</option>
                                        <option value="ypf_ruta">YPF Ruta</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Entorno</label>
                                    <select className="form-input" value={cred.environment} onChange={e => { const copy = [...bankCreds]; copy[i].environment = e.target.value; setBankCreds(copy); }} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                                        <option value="sandbox">Sandbox (Pruebas)</option>
                                        <option value="production">Producción</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Client ID</label>
                                    <input className="form-input" value={cred.client_id} onChange={e => { const copy = [...bankCreds]; copy[i].client_id = e.target.value; setBankCreds(copy); }} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Client Secret</label>
                                    <div style={{ position: 'relative' }}>
                                        <input className="form-input" type={showBankSecret[i] ? 'text' : 'password'} value={cred.client_secret} onChange={e => { const copy = [...bankCreds]; copy[i].client_secret = e.target.value; setBankCreds(copy); }} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', paddingRight: 32 }} />
                                        <button onClick={() => setShowBankSecret(prev => ({ ...prev, [i]: !prev[i] }))} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                            {showBankSecret[i] ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <button className="btn btn-primary" onClick={() => handleSaveBankCred(i)} disabled={saving} style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem' }}>
                                    {saving ? 'Guardando...' : 'Guardar Credencial'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>
        </div>
    );

    const renderUsuarios = () => (
        <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={20} color="#a855f7" />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Usuarios de la Empresa</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Personas con acceso al sistema · {tenantUsers.length} usuario{tenantUsers.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            {userSaveResult && (
                <div style={{ marginBottom: '1rem', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--r-md)', background: userSaveResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: userSaveResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                    {userSaveResult.msg}
                </div>
            )}

            {loadingUsers ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cargando usuarios...</div>
            ) : (
                <div style={{ marginBottom: '1.5rem' }}>
                    {tenantUsers.map(u => {
                        const isEditing = editingUserId === u.id;
                        return (
                            <div key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0.75rem 0' }}>
                                {/* Row summary — always visible */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}
                                    onClick={() => isEditing ? cancelEditUser() : startEditUser(u)}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            {u.display_name || u.email.split('@')[0]}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                    </div>
                                    <div>
                                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, background: u.role === 'admin' || u.role === 'superadmin' ? 'rgba(99,102,241,0.12)' : 'rgba(107,114,128,0.1)', color: u.role === 'admin' || u.role === 'superadmin' ? '#6366f1' : '#6b7280' }}>
                                            {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Usuario'}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, background: u.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: u.status === 'active' ? '#10b981' : '#ef4444' }}>
                                            {u.status === 'active' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--brand)', fontWeight: 600 }}>
                                        {isEditing ? '▲ Cerrar' : '✎ Editar'}
                                    </span>
                                </div>

                                {/* Expandable edit form */}
                                {isEditing && u.role !== 'superadmin' && (
                                    <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Nombre</label>
                                            <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre visible" />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Rol</label>
                                            <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value)}>
                                                <option value="user">Usuario</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Nueva contraseña</label>
                                            <input className="form-input" type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Dejar vacío para no cambiar" />
                                        </div>
                                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            <button className="btn btn-ghost" onClick={cancelEditUser} style={{ fontSize: '0.75rem' }}>Cancelar</button>
                                            <button className="btn btn-primary" onClick={handleSaveUser} disabled={savingUser} style={{ fontSize: '0.75rem' }}>
                                                {savingUser ? 'Guardando...' : 'Guardar cambios'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {isEditing && u.role === 'superadmin' && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        No se puede editar un Super Admin desde este panel.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {tenantUsers.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No hay usuarios registrados</div>}
                </div>
            )}

            {/* Invite */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Agregar nuevo usuario</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Email</label>
                        <input className="form-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="usuario@empresa.com" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Contraseña temporal</label>
                        <input className="form-input" type="text" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                    </div>
                    <button className="btn btn-primary" onClick={handleInviteUser} disabled={inviting || !inviteEmail.trim() || !invitePassword.trim()} style={{ height: 38 }}>
                        {inviting ? 'Creando...' : '+ Agregar'}
                    </button>
                </div>
                {inviteResult && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--r-md)', background: inviteResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: inviteResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                        {inviteResult.msg}
                    </div>
                )}
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    El usuario se crea con rol "Usuario" y acceso completo. Compartile el email y contraseña.
                </p>
            </div>
        </div>
    );

    /* ─── Main Render ─── */
    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Configuración</h1>
                    <p>Parámetros, integraciones y usuarios del módulo contable</p>
                </div>
                <button className="btn btn-primary" onClick={activeTab === 'integraciones' ? handleSave : handleSaveTenant} disabled={saving || savingTenant}>
                    {tenantSaved ? <><CheckCircle size={16} /> Guardado</> : <><Save size={16} /> {saving || savingTenant ? 'Guardando...' : 'Guardar cambios'}</>}
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0 }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0.6rem 1.25rem', fontSize: '0.8rem', fontWeight: isActive ? 700 : 500,
                                color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                                marginBottom: -1, transition: 'all 0.15s ease',
                            }}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'empresa' && renderEmpresa()}
            {activeTab === 'integraciones' && renderIntegraciones()}
            {activeTab === 'usuarios' && renderUsuarios()}
        </div>
    );
}
