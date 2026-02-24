import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Zap, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SetPassword() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'done' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        // Supabase v2 with PKCE handles the code exchange automatically via onAuthStateChange.
        // When the user clicks the invite link, Supabase detects the `code` param in the URL,
        // exchanges it for a session, and fires the PASSWORD_RECOVERY or SIGNED_IN event.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
                if (session) {
                    // Session established — user can now set their password
                    setStatus('ready');
                }
            }
        });

        // Also check if there's already an active session (e.g. user navigated here directly)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setStatus('ready');
            } else {
                // Wait for the auth state change event triggered by the invite link
                // Give it 5 seconds before showing error
                setTimeout(() => {
                    setStatus(prev => prev === 'loading' ? 'error' : prev);
                    setErrorMsg('No se detectó una sesión de invitación. El link puede haber expirado. Pedile al administrador que te reenvíe la invitación.');
                }, 5000);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) { setErrorMsg('La contraseña debe tener al menos 6 caracteres.'); return; }
        if (password !== confirm) { setErrorMsg('Las contraseñas no coinciden.'); return; }
        setErrorMsg('');
        setStatus('saving');

        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
            setStatus('ready');
            setErrorMsg(`Error: ${error.message}`);
        } else {
            setStatus('done');
            setTimeout(() => navigate('/login'), 2500);
        }
    };

    const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
    const strengthColors = ['transparent', '#ef4444', '#f59e0b', '#10b981'];
    const strengthLabels = ['', 'Débil', 'Media', 'Fuerte'];

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '1.5rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem', gap: '0.75rem' }}>
                    <div className="sidebar-brand-icon" style={{ width: '52px', height: '52px', borderRadius: '14px' }}>
                        <Zap size={24} color="white" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-main)' }}>Crear contraseña</h2>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Establecé tu contraseña para acceder al sistema</p>
                    </div>
                </div>

                {status === 'loading' && (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                        <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
                        <div style={{ fontSize: '0.875rem' }}>Verificando invitación...</div>
                    </div>
                )}

                {status === 'error' && (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-lg)', padding: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Link inválido o expirado</div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{errorMsg}</div>
                        </div>
                    </div>
                )}

                {status === 'done' && (
                    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                        <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
                        <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>¡Contraseña establecida!</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Redirigiendo al login...</div>
                    </div>
                )}

                {(status === 'ready' || status === 'saving') && (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">Nueva contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input type={showPass ? 'text' : 'password'} className="form-input"
                                    placeholder="Mínimo 6 caracteres" value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }} autoFocus required />
                                <button type="button" onClick={() => setShowPass(p => !p)}
                                    style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {password.length > 0 && (
                                <div style={{ marginTop: '0.5rem' }}>
                                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem' }}>
                                        {[1, 2, 3].map(i => (
                                            <div key={i} style={{ flex: 1, height: '3px', borderRadius: '99px', background: i <= strength ? strengthColors[strength] : 'var(--border)', transition: 'background 0.3s' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: strengthColors[strength], fontWeight: 600 }}>{strengthLabels[strength]}</div>
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirmar contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input type={showPass ? 'text' : 'password'} className="form-input"
                                    placeholder="Repetí la contraseña" value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    style={{ paddingLeft: '2.5rem', borderColor: confirm && password !== confirm ? 'var(--danger)' : undefined }}
                                    required />
                            </div>
                            {confirm && password !== confirm && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.35rem' }}>Las contraseñas no coinciden</div>
                            )}
                        </div>

                        {errorMsg && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', padding: '0.65rem 0.875rem', borderRadius: 'var(--r-md)' }}>
                                {errorMsg}
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary"
                            disabled={status === 'saving' || !password || !confirm}
                            style={{ width: '100%', padding: '0.75rem', marginTop: '0.25rem', fontSize: '0.9375rem', fontWeight: 700 }}>
                            {status === 'saving' ? 'Guardando...' : 'Confirmar contraseña'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
