import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { LogIn, AlertCircle, Eye, EyeOff, Zap, BarChart3, Shield, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const } },
});

const features = [
    { icon: Zap, title: 'Automatización', desc: 'Importación y clasificación automática de comprobantes' },
    { icon: BarChart3, title: 'Análisis en tiempo real', desc: 'Dashboard con KPIs de tesorería y contabilidad' },
    { icon: Shield, title: 'Seguridad', desc: 'Multi-tenant con aislamiento completo de datos' },
    { icon: Users, title: 'Colaboración', desc: 'Múltiples usuarios con roles y permisos' },
];

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
        <div className="login-shell">
            {/* ── Left / Mobile: Form ── */}
            <div className="login-form-panel">
                <div className="login-form-inner">
                    <motion.div {...fadeUp(0)}>
                        <div className="login-logo-row">
                            <img src="/neura-logo.png" alt="Neura Core" className="login-logo" />
                            <span className="login-logo-text">NEURA CORE</span>
                        </div>
                        <h1 className="login-title">Bienvenido</h1>
                        <p className="login-subtitle">Ingresá tus credenciales para acceder a tu espacio de trabajo</p>
                    </motion.div>

                    {error && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="login-error">
                            <AlertCircle size={15} />
                            {error === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error}
                        </motion.div>
                    )}

                    <motion.form {...fadeUp(0.1)} onSubmit={handleSubmit}>
                        <div className="login-field">
                            <label className="login-label" htmlFor="email">Email</label>
                            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="usuario@empresa.com" required className="login-input" autoComplete="email" />
                        </div>

                        <div className="login-field">
                            <label className="login-label" htmlFor="password">Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <input id="password" type={showPassword ? 'text' : 'password'} value={password}
                                    onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                                    className="login-input" style={{ paddingRight: 44 }} autoComplete="current-password" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <motion.button type="submit" className="login-submit" disabled={loading}
                            whileTap={{ scale: 0.97 }} style={{ opacity: loading ? 0.7 : 1 }}>
                            {loading ? (
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                            ) : (
                                <><LogIn size={17} /> Ingresar</>
                            )}
                        </motion.button>
                    </motion.form>

                    <motion.div {...fadeUp(0.2)} style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>¿Primera vez? </span>
                        <Link to="/register" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-cta, #2563EB)', textDecoration: 'none' }}>
                            Registrar mi empresa
                        </Link>
                    </motion.div>

                    <motion.div {...fadeUp(0.3)} className="login-powered">
                        Powered by{' '}
                        <a href="https://neuracall.net" target="_blank" rel="noopener noreferrer">NeuraCall</a>
                    </motion.div>
                </div>
            </div>

            {/* ── Right: Branding (desktop only) ── */}
            <div className="login-brand-panel">
                {/* Animated orbs */}
                <motion.div className="login-orb login-orb-1"
                    animate={{ scale: [1, 1.15, 1], x: [0, 20, 0] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
                <motion.div className="login-orb login-orb-2"
                    animate={{ scale: [1, 1.1, 1], y: [0, -15, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }} />
                {/* Dot pattern */}
                <div className="login-dots" />

                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.3 } }}
                    style={{ position: 'relative', zIndex: 2, maxWidth: 400 }}>
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ marginBottom: '2.5rem' }}>
                        <div className="login-brand-logo">
                            <img src="/neura-logo.png" alt="Neura" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                    </motion.div>

                    <h2 className="login-brand-title">
                        Tu operación contable,<br />
                        <span className="login-brand-gradient">bajo control total.</span>
                    </h2>
                    <p className="login-brand-desc">
                        Plataforma integral de gestión contable y tesorería con automatización inteligente.
                    </p>

                    <div className="login-features-grid">
                        {features.map(({ icon: Icon, title, desc }, i) => (
                            <motion.div key={title} className="login-feature-card"
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0, transition: { delay: 0.5 + i * 0.1, duration: 0.5 } }}>
                                <Icon size={18} color="#818cf8" style={{ marginBottom: 8 }} />
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>{title}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>{desc}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
