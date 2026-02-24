import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { Zap, LogIn, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' as const } },
});

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    // If Supabase redirected here with an invite/recovery token, send to set-password
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
                        {/* Brand icon */}
                        <div style={{
                            width: '48px', height: '48px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, var(--brand), var(--brand-accent))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: 'var(--shadow-brand)',
                            marginBottom: '1.5rem'
                        }}>
                            <Zap size={22} color="white" />
                        </div>
                        <h1>Bienvenido de nuevo</h1>
                        <p>Ingresa a tu entorno de trabajo seguro</p>
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
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
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
                            style={{ marginTop: '1rem', width: '100%', padding: '0.8rem' }}
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

                    <motion.div {...fadeUp(0.2)} style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        ¿Aún no tienes cuenta?{' '}
                        <Link to="/register" style={{ fontWeight: 700, color: 'var(--brand)' }}>Registrar mi Empresa</Link>
                    </motion.div>
                </div>
            </div>

            {/* ── Right panel ── */}
            <div className="auth-right">
                {/* Decorative blobs */}
                <motion.div
                    className="auth-decorative-circle"
                    style={{ width: '500px', height: '500px', top: '-15%', right: '-8%' }}
                    animate={{ scale: [1, 1.06, 1], rotate: [0, 5, 0] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="auth-decorative-circle"
                    style={{ width: '350px', height: '350px', bottom: '-8%', left: '-8%', opacity: 0.12 }}
                    animate={{ scale: [1, 1.08, 1], rotate: [0, -6, 0] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                />

                <motion.div
                    className="auth-right-content"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.2, ease: 'easeOut' } }}
                >
                    <motion.div
                        style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <div style={{
                            width: '80px', height: '80px',
                            borderRadius: '24px',
                            background: 'rgba(255,255,255,0.15)',
                            backdropFilter: 'blur(10px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid rgba(255,255,255,0.3)'
                        }}>
                            <Zap size={40} color="white" />
                        </div>
                    </motion.div>
                    <h2>Tesorería Inteligente</h2>
                    <p>Gestiona flujos de caja, conciliaciones bancarias y múltiples unidades de negocio en tiempo real.</p>
                </motion.div>
            </div>
        </div>
    );
}
