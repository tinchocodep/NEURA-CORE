import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Settings, LogOut } from 'lucide-react';
import { DolarService, DolarResumen } from '../../services/DolarService';
import { useAuth } from '../../contexts/AuthContext';

export default function TopBar() {
    const { user, signOut } = useAuth() as any;
    const navigate = useNavigate();
    const [dolar, setDolar] = useState<DolarResumen | null>(null);

    useEffect(() => {
        DolarService.getCotizaciones().then(setDolar);
        const interval = setInterval(() => {
            DolarService.getCotizaciones().then(setDolar);
        }, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const initials = user?.email
        ? user.email.substring(0, 2).toUpperCase()
        : 'NC';

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const role = user?.user_metadata?.role || 'user';

    return (
        <div className="topbar">
            {/* Left: Brand + Exchange Rates */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                    NEURA CORE
                </span>
                {dolar && (
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.6875rem' }}>
                        {([
                            { label: 'OFICIAL', value: dolar.oficial?.venta },
                            { label: 'BLUE', value: dolar.blue?.venta },
                            { label: 'MEP', value: dolar.mep?.venta },
                        ]).map(item => (
                            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                <span style={{ fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-text-muted)', fontSize: '0.5625rem', textTransform: 'uppercase' }}>
                                    {item.label}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                                    {item.value ? `$${Math.round(item.value).toLocaleString('es-AR')}` : '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Right: Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                    onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                    title="Buscar (⌘K)"
                    style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', transition: 'all 0.12s' }}
                >
                    <Search size={16} />
                </button>
                <button
                    title="Notificaciones"
                    style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', position: 'relative', transition: 'all 0.12s' }}
                >
                    <Bell size={16} />
                    <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--color-danger)' }} />
                </button>
                <button
                    onClick={() => navigate('/configuracion')}
                    title="Configuración"
                    style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', transition: 'all 0.12s' }}
                >
                    <Settings size={16} />
                </button>

                {/* Separator */}
                <div style={{ width: 1, height: 28, background: 'var(--color-border-subtle)', margin: '0 6px' }} />

                {/* User */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 10, transition: 'background 0.12s' }}
                    onClick={() => navigate('/configuracion')}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{displayName}</div>
                        <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{role}</div>
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-cta, #2563EB)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                        {initials}
                    </div>
                </div>
            </div>
        </div>
    );
}
