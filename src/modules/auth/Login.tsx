import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { LogIn, AlertCircle, Eye, EyeOff, Zap, BarChart3, Shield, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

/* ─── Animation helpers ─── */
const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const } },
});

const features = [
    { icon: Zap, title: 'Automatización', desc: 'Importación y clasificación automática de comprobantes' },
    { icon: BarChart3, title: 'Análisis en tiempo real', desc: 'Dashboard con KPIs de tesorería y contabilidad' },
    { icon: Shield, title: 'Seguridad', desc: 'Multi-tenant con aislamiento completo de datos' },
    { icon: Users, title: 'Colaboración', desc: 'Múltiples usuarios con roles y permisos' },
];

/* ─── Styles ─── */
const styles = {
    container: {
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        fontFamily: "'Inter', -apple-system, sans-serif",
    } as React.CSSProperties,
    // Left: form side
    leftPanel: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        background: '#fafbfc',
    } as React.CSSProperties,
    formWrapper: {
        width: '100%',
        maxWidth: 420,
    } as React.CSSProperties,
    // Right: branding side
    rightPanel: {
        position: 'relative' as const,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
        overflow: 'hidden',
        color: '#fff',
    } as React.CSSProperties,
    input: {
        width: '100%',
        padding: '0.8rem 1rem',
        fontSize: '0.9rem',
        border: '1.5px solid #e2e8f0',
        borderRadius: 12,
        background: '#fff',
        color: '#1e293b',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxSizing: 'border-box' as const,
    },
    inputFocus: {
        borderColor: 'var(--brand, #6366f1)',
        boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)',
    },
    label: {
        display: 'block',
        fontSize: '0.78rem',
        fontWeight: 600 as const,
        color: '#475569',
        marginBottom: 6,
        letterSpacing: '0.02em',
    },
    submitBtn: {
        width: '100%',
        padding: '0.85rem',
        fontSize: '0.9rem',
        fontWeight: 700 as const,
        color: '#fff',
        background: 'var(--brand, #6366f1)',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
    } as React.CSSProperties,
};

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [focusedField, setFocusedField] = useState<string | null>(null);
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
        <div style={styles.container}>
            {/* ── Left: Login Form ── */}
            <div style={styles.leftPanel}>
                <div style={styles.formWrapper}>
                    <motion.div {...fadeUp(0)}>
                        <img
                            src="/neura-logo.png"
                            alt="Neura Core"
                            style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: '1.5rem' }}
                        />
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: 6, letterSpacing: '-0.02em' }}>
                            Bienvenido
                        </h1>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '2rem', lineHeight: 1.5 }}>
                            Ingresá tus credenciales para acceder a tu espacio de trabajo
                        </p>
                    </motion.div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                padding: '0.75rem 1rem',
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: 12,
                                fontSize: '0.8rem',
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: '1rem',
                            }}
                        >
                            <AlertCircle size={15} />
                            {error === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error}
                        </motion.div>
                    )}

                    <motion.form {...fadeUp(0.1)} onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={styles.label} htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                onFocus={() => setFocusedField('email')}
                                onBlur={() => setFocusedField(null)}
                                placeholder="usuario@empresa.com"
                                required
                                style={{
                                    ...styles.input,
                                    ...(focusedField === 'email' ? styles.inputFocus : {}),
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={styles.label} htmlFor="password">Contraseña</label>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        ...styles.input,
                                        paddingRight: 44,
                                        ...(focusedField === 'password' ? styles.inputFocus : {}),
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: '#94a3b8', padding: 4,
                                    }}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <motion.button
                            type="submit"
                            style={{
                                ...styles.submitBtn,
                                opacity: loading ? 0.7 : 1,
                            }}
                            disabled={loading}
                            whileTap={{ scale: 0.97 }}
                            whileHover={{ scale: 1.01, boxShadow: '0 6px 20px rgba(99, 102, 241, 0.4)' }}
                        >
                            {loading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }}
                                />
                            ) : (
                                <>
                                    <LogIn size={17} />
                                    Ingresar
                                </>
                            )}
                        </motion.button>
                    </motion.form>

                    <motion.div {...fadeUp(0.2)} style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>¿Primera vez? </span>
                        <Link to="/register" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand, #6366f1)', textDecoration: 'none' }}>
                            Registrar mi empresa
                        </Link>
                    </motion.div>

                    <motion.div {...fadeUp(0.3)} style={{ textAlign: 'center', marginTop: '3rem' }}>
                        <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
                            Powered by{' '}
                            <a href="https://neuracall.net" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', fontWeight: 600, textDecoration: 'none' }}>
                                NeuraCall
                            </a>
                        </span>
                    </motion.div>
                </div>
            </div>

            {/* ── Right: Branding Panel ── */}
            <div style={styles.rightPanel}>
                {/* Animated gradient orbs */}
                <motion.div
                    style={{
                        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                        top: '-10%', right: '-5%', filter: 'blur(40px)',
                    }}
                    animate={{ scale: [1, 1.15, 1], x: [0, 20, 0] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    style={{
                        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%)',
                        bottom: '-5%', left: '-5%', filter: 'blur(40px)',
                    }}
                    animate={{ scale: [1, 1.1, 1], y: [0, -15, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                />
                {/* Grid dots pattern */}
                <div style={{
                    position: 'absolute', inset: 0, opacity: 0.04,
                    backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }} />

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.3 } }}
                    style={{ position: 'relative', zIndex: 2, maxWidth: 400 }}
                >
                    {/* Floating logo */}
                    <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ marginBottom: '2.5rem' }}
                    >
                        <div style={{
                            width: 80, height: 80, borderRadius: 22,
                            background: 'rgba(255,255,255,0.08)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                        }}>
                            <img src="/neura-logo.png" alt="Neura" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                    </motion.div>

                    <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                        Tu operación contable,<br />
                        <span style={{ background: 'linear-gradient(135deg, #818cf8 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            bajo control total.
                        </span>
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '2.5rem', lineHeight: 1.7 }}>
                        Plataforma integral de gestión contable y tesorería con automatización inteligente.
                    </p>

                    {/* Feature cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {features.map(({ icon: Icon, title, desc }, i) => (
                            <motion.div
                                key={title}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0, transition: { delay: 0.5 + i * 0.1, duration: 0.5 } }}
                                style={{
                                    padding: '1rem',
                                    borderRadius: 14,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                <Icon size={18} color="#818cf8" style={{ marginBottom: 8 }} />
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>{title}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.4 }}>{desc}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Responsive: hide right panel on small screens */}
            <style>{`
                @media (max-width: 900px) {
                    .login-container { grid-template-columns: 1fr !important; }
                    .login-right { display: none !important; }
                }
            `}</style>
        </div>
    );
}
