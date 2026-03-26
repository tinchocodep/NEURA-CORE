import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { DolarService } from '../../services/DolarService';
import type { DolarResumen } from '../../services/DolarService';
import { useAuth } from '../../contexts/AuthContext';

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}


export default function TopBar() {
    const { user } = useAuth() as any;
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [, setDolar] = useState<DolarResumen | null>(null);

    useEffect(() => {
        DolarService.getCotizaciones().then(setDolar);
        const interval = setInterval(() => { DolarService.getCotizaciones().then(setDolar); }, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const { signOut, displayName: authDisplayName } = useAuth() as any;
    const displayName = authDisplayName || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'NC';
    const role = user?.user_metadata?.role || 'user';
    const location = useLocation();
    const isHome = location.pathname === '/';
    const [showProfileMenu, setShowProfileMenu] = useState(false);

    /* ── MOBILE ── */
    if (isMobile) {
        if (isHome) {
            const dn = authDisplayName || (user as any)?.user_metadata?.display_name || (user as any)?.email?.split('@')[0] || '';
            const firstName = dn.charAt(0).toUpperCase() + dn.slice(1);
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-cta, #2563EB)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                            {firstName.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Hola, {firstName}</span>
                    </div>
                    <button onClick={() => navigate('/configuracion')} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', position: 'relative' }}>
                        <Bell size={16} />
                        <span style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
                    </button>
                </div>
            );
        }
        // Submodules: no TopBar, handled by subtabs in Layout
        return null;
    }

    /* ── DESKTOP ── */
    return (
        <div className="topbar">
            {/* Left: Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <img src="/neura-logo.png" alt="Neura" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                {isHome && (
                    <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                        NeuraOrkesta
                    </span>
                )}
            </div>

            {/* Center: Search bar */}
            <div onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', cursor: 'pointer', margin: '0 24px' }}>
                <Search size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-faint)' }}>Buscar...</span>
            </div>

            {/* Right: Notification + Avatar dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <button title="Notificaciones"
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', position: 'relative' }}>
                    <Bell size={16} />
                    <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--color-danger)' }} />
                </button>

                <div style={{ position: 'relative' }}>
                    <div onClick={() => setShowProfileMenu(p => !p)}
                        style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-cta, #2563EB)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        {initials}
                    </div>
                    {showProfileMenu && (
                        <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setShowProfileMenu(false)} />
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 300, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 180 }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>{displayName}</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{role}</div>
                            </div>
                            <button onClick={() => { navigate('/configuracion'); setShowProfileMenu(false); }}
                                style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                Ver perfil
                            </button>
                            <button onClick={() => { navigate('/configuracion'); setShowProfileMenu(false); }}
                                style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-subtle)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                Configuración
                            </button>
                            <button onClick={() => { signOut(); setShowProfileMenu(false); }}
                                style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: '#EF4444', fontFamily: 'var(--font-sans)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                Cerrar sesión
                            </button>
                        </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
