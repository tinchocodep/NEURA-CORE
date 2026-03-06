import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { UserPlus, X, Mail, Shield, Wallet, CheckCircle2, Clock, Users } from 'lucide-react';
import { SkeletonTable } from '../../shared/components/SkeletonKit';

const SUPABASE_URL = 'https://fuytejvnwihghxymyayw.supabase.co';

interface TeamUser {
    id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    enabled_modules: string[];
    assignedAccount?: { id: string; name: string };
}

const ROLE_LABELS: Record<string, string> = { admin: 'Administrador', basic: 'Básico', operator: 'Operador' };
const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
    active: { color: 'var(--success)', bg: 'rgba(16,185,129,0.1)', label: 'Activo' },
    invited: { color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', label: 'Invitado' },
    inactive: { color: 'var(--text-muted)', bg: 'var(--bg-main)', label: 'Inactivo' },
};

export default function Equipo() {
    const { tenant } = useTenant();
    const { addToast } = useToast();

    const [users, setUsers] = useState<TeamUser[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('basic');
    const [accountId, setAccountId] = useState('');

    const fetchData = async () => {
        if (!tenant) return;
        setLoading(true);

        const [usersRes, accountsRes] = await Promise.all([
            supabase
                .from('users')
                .select('*')
                .eq('tenant_id', tenant.id)
                .order('created_at', { ascending: false }),
            supabase
                .from('treasury_accounts')
                .select('id, name, assigned_user_id')
                .eq('tenant_id', tenant.id)
                .order('name'),
        ]);

        if (accountsRes.data) setAccounts(accountsRes.data);

        if (usersRes.data && accountsRes.data) {
            const enriched: TeamUser[] = usersRes.data.map((u: any) => ({
                ...u,
                assignedAccount: accountsRes.data.find((a: any) => a.assigned_user_id === u.id),
            }));
            setUsers(enriched);
        }

        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [tenant]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setSaving(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { addToast('error', 'Error', 'Sin sesión activa'); setSaving(false); return; }

        const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                email: email.trim(),
                role,
                enabled_modules: ['tesoreria'],
                account_id: accountId || null,
            }),
        });

        const json = await res.json();
        if (json.error) {
            addToast('error', 'Error al invitar', json.error);
        } else {
            addToast('success', 'Invitación enviada', `Se envió un email de acceso a ${email}`);
            setIsModalOpen(false);
            setEmail(''); setRole('basic'); setAccountId('');
            fetchData();
        }
        setSaving(false);
    };

    const freeAccounts = accounts.filter(a => !a.assigned_user_id);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2.5rem' }}>

            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Equipo</h1>
                    <p>Usuarios de {tenant?.name} y sus cajas asignadas</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserPlus size={16} /> Invitar usuario
                </button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {[
                    { label: 'Total usuarios', value: users.length, icon: Users, color: 'var(--brand)' },
                    { label: 'Activos', value: users.filter(u => u.status === 'active').length, icon: CheckCircle2, color: 'var(--success)' },
                    { label: 'Con caja asignada', value: users.filter(u => u.assignedAccount).length, icon: Wallet, color: 'var(--warning)' },
                ].map(s => (
                    <div key={s.label} className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: 'var(--r-lg)', background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>
                            <s.icon size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Users table */}
            <div className="card" style={{ padding: 0 }}>
                <div className="card-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <h3 className="card-title" style={{ margin: 0 }}>Miembros del equipo</h3>
                </div>
                {loading ? (
                    <SkeletonTable rows={4} columns={4} />
                ) : users.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <UserPlus size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                        <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>No hay usuarios todavía</p>
                        <p style={{ fontSize: '0.875rem' }}>Invitá al equipo con el botón de arriba.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                                {['Usuario', 'Rol', 'Estado', 'Caja Asignada'].map(h => (
                                    <th key={h} style={{ padding: '0.875rem 1.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => {
                                const st = STATUS_STYLE[u.status] || STATUS_STYLE.inactive;
                                return (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }} className="nav-item-hover">
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
                                                    {u.email?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-main)' }}>{u.email}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        <Mail size={10} style={{ display: 'inline', marginRight: '0.2rem' }} />
                                                        {u.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-sub)', fontWeight: 500 }}>
                                                <Shield size={13} /> {ROLE_LABELS[u.role] || u.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, background: st.bg, color: st.color }}>
                                                {u.status === 'invited' ? <Clock size={10} /> : <CheckCircle2 size={10} />}
                                                {st.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            {u.assignedAccount ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-sub)', fontWeight: 500 }}>
                                                    <Wallet size={13} /> {u.assignedAccount.name}
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin asignar</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Invite Modal ── */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
                        onClick={() => setIsModalOpen(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="card"
                            style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', position: 'relative' }}
                            onClick={e => e.stopPropagation()}>

                            <button onClick={() => setIsModalOpen(false)}
                                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--r-lg)', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                                    <UserPlus size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>Invitar usuario</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Le llegará un email para crear su contraseña</p>
                                </div>
                            </div>

                            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Email del usuario *</label>
                                    <input type="email" className="form-input" placeholder="usuario@empresa.com"
                                        value={email} onChange={e => setEmail(e.target.value)} required />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Rol</label>
                                    <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
                                        <option value="basic">Básico — solo ve sus movimientos</option>
                                        <option value="operator">Operador — puede registrar movimientos</option>
                                        <option value="admin">Administrador — acceso completo</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Asignar caja (opcional)</label>
                                    <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                                        <option value="">Sin caja asignada</option>
                                        {freeAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                    {freeAccounts.length === 0 && (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.4rem 0 0' }}>
                                            Todas las cajas ya tienen un usuario asignado. Creá una nueva en la sección Cajas.
                                        </p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={saving}>
                                        <Mail size={14} />
                                        {saving ? 'Enviando...' : 'Enviar invitación'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
