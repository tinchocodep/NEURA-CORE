import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { LogIn, AlertCircle, Shield, TrendingUp, Building2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' as const } },
});

const features = [
    { icon: TrendingUp, text: 'Proyecciones en tiempo real' },
    { icon: Building2, text: 'Multi-empresa nativo' },
    { icon: Shield, text: 'Acceso por roles y permisos' },
];

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token') && hash.includes('type=invite')) {
            navigate('/set-password' + hash, { replace: true });
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); } else { navigate('/'); }
        setLoading(false);
    };

    return (
        <div className="auth-split-container">
            {/* ── Left panel ── */}
            <div className="auth-left">
                <div className="auth-card">
                    <motion.div {...fadeUp(0)} className="auth-header">
                        {/* Neura logo */}
                        <img
                            src="/neura-logo.png"
                            alt="Neura Core"
                            style={{ width: '72px', height: '72px', objectFit: 'contain', marginBottom: '1.25rem' }}
                        />
                        <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--brand)', opacity: 0.8 }}>
                            Neura Core
                        </div>
                        <h1 style={{ fontSize: '1.65rem', marginBottom: '0.35rem' }}>Bienvenido de nuevo</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Ingresá a tu entorno de trabajo seguro</p>
                    </motion.div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{
                                padding: '0.875rem 1rem',
                                background: 'var(--danger-bg)',
                                color: 'var(--danger)',
                                border: '1px solid var(--danger-border)',
                                borderRadius: 'var(--r-md)',
                                fontSize: '0.875rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                marginBottom: '0.5rem',
                            }}
                        >
                            <AlertCircle size={16} />
                            {error}
                        </motion.div>
                    )}

                    <motion.form {...fadeUp(0.1)} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="email">Correo Electrónico</label>
                            <input
                                id="email" type="email" className="form-input"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                placeholder="usuario@empresa.com" required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Contraseña</label>
                            <input
                                id="password" type="password" className="form-input"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" required
                            />
                        </div>

                        <motion.button
                            type="submit"
                            className="btn btn-primary"
                            style={{ marginTop: '1.25rem', width: '100%', padding: '0.85rem', fontSize: '0.95rem', gap: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            disabled={loading}
                            whileTap={{ scale: 0.97 }}
                            whileHover={{ scale: 1.01 }}
                        >
                            {loading ? 'Validando...' : (
                                <>
                                    <LogIn size={17} />
                                    Ingresar a la Plataforma
                                </>
                            )}
                        </motion.button>
                    </motion.form>

                    <motion.div {...fadeUp(0.2)} style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ¿Primera vez?{' '}
                        <Link to="/register" style={{ fontWeight: 700, color: 'var(--brand)' }}>Registrar mi empresa</Link>
                    </motion.div>

                    <motion.div {...fadeUp(0.3)} style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Powered by <a href="https://neuracall.net" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', textDecoration: 'none' }}>NeuraCall</a></p>

                    </motion.div>
                </div>
            </div>

            {/* ── Right panel ── */}
            <div className="auth-right">
                {/* Decorative blobs */}
                <motion.div
                    className="auth-decorative-circle"
                    style={{ width: '520px', height: '520px', top: '-15%', right: '-8%' }}
                    animate={{ scale: [1, 1.06, 1], rotate: [0, 5, 0] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="auth-decorative-circle"
                    style={{ width: '360px', height: '360px', bottom: '-8%', left: '-8%', opacity: 0.12 }}
                    animate={{ scale: [1, 1.08, 1], rotate: [0, -6, 0] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                />

                <motion.div
                    className="auth-right-content"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.2, ease: 'easeOut' } }}
                >
                    {/* Floating logo */}
                    <motion.div
                        style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <div style={{
                            width: '100px', height: '100px',
                            borderRadius: '28px',
                            background: 'rgba(255,255,255,0.15)',
                            backdropFilter: 'blur(16px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1.5px solid rgba(255,255,255,0.35)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                            padding: '12px',
                        }}>
                            <img src="/neura-logo.png" alt="Neura" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                    </motion.div>

                    <h2 style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>Tesorería Inteligente</h2>
                    <p style={{ opacity: 0.85, marginBottom: '2rem', lineHeight: 1.6 }}>
                        Gestioná flujos de caja, conciliaciones bancarias y múltiples empresas en tiempo real.
                    </p>

                    {/* Feature list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start', width: '100%', maxWidth: '320px' }}>
                        {features.map(({ icon: Icon, text }, i) => (
                            <motion.div
                                key={text}
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0, transition: { delay: 0.5 + i * 0.12, duration: 0.4 } }}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                            >
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '10px',
                                    background: 'rgba(255,255,255,0.18)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <Icon size={16} color="white" />
                                </div>
                                <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.92 }}>{text}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
