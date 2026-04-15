import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Bell, AlertTriangle, FileText, Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { DolarService } from '../../services/DolarService';
import type { DolarResumen } from '../../services/DolarService';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useSync } from '../../contexts/SyncContext';
import { supabase } from '../../lib/supabase';
import GlobalSearch from './GlobalSearch';

interface Notif { id: string; icon: any; color: string; title: string; subtitle: string; time: string; path: string; }

function useIsMobile() {
    const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
    useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
    return m;
}

function useNotifications() {
    const { tenant } = useTenant();
    const [notifs, setNotifs] = useState<Notif[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        if (!tenant) return;
        setLoading(true);
        const now = new Date();
        const items: Notif[] = [];
        const hasInmob = (tenant.enabled_modules || []).includes('inmobiliaria');

        if (hasInmob) {
            // Contratos por vencer (30 días)
            const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
            const { data: contratos } = await supabase.from('inmobiliaria_contratos')
                .select('id, fecha_fin, propiedad_id, inmobiliaria_propiedades(direccion)')
                .eq('tenant_id', tenant.id).eq('estado', 'vigente')
                .lte('fecha_fin', in30.toISOString().slice(0, 10));
            (contratos || []).forEach((c: any) => {
                const dir = c.inmobiliaria_propiedades?.direccion || 'Propiedad';
                const dias = Math.ceil((new Date(c.fecha_fin).getTime() - now.getTime()) / 86400000);
                items.push({
                    id: 'c-' + c.id, icon: AlertTriangle, color: '#F59E0B',
                    title: `Contrato vence en ${dias}d`, subtitle: dir,
                    time: new Date(c.fecha_fin).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
                    path: '/inmobiliaria/contratos',
                });
            });

            // Órdenes pendientes (reportado/asignado)
            const { data: ordenes } = await supabase.from('inmobiliaria_ordenes_trabajo')
                .select('id, titulo, estado').eq('tenant_id', tenant.id)
                .in('estado', ['reportado', 'asignado']).limit(5);
            (ordenes || []).forEach((o: any) => {
                items.push({
                    id: 'o-' + o.id, icon: Clock, color: '#F59E0B',
                    title: o.titulo, subtitle: `Orden ${o.estado}`,
                    time: '', path: '/inmobiliaria/ordenes',
                });
            });
        }

        // Comprobantes pendientes
        const { data: comps } = await supabase.from('contable_comprobantes')
            .select('id, descripcion, estado, fecha').eq('tenant_id', tenant.id)
            .eq('estado', 'pendiente').order('fecha', { ascending: false }).limit(5);
        (comps || []).forEach((c: any) => {
            items.push({
                id: 'comp-' + c.id, icon: FileText, color: '#3B82F6',
                title: c.descripcion || 'Comprobante pendiente', subtitle: 'Requiere aprobación',
                time: new Date(c.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
                path: hasInmob ? '/inmobiliaria/comprobantes' : '/contable/comprobantes',
            });
        });

        setNotifs(items);
        setLoading(false);
    };

    useEffect(() => { load(); }, [tenant?.id]);

    return { notifs, loading, reload: load };
}

export default function TopBar() {
    const { user } = useAuth() as any;
    const { tenant } = useTenant();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [dolar, setDolar] = useState<DolarResumen | null>(null);
    const { notifs } = useNotifications();
    const [showNotifs, setShowNotifs] = useState(false);

    useEffect(() => {
        console.log('[TopBar] Loading dolar, tenant rubro:', tenant?.rubro);
        DolarService.getCotizaciones().then(d => { console.log('[TopBar] Dolar loaded:', d); setDolar(d); }).catch(e => console.error('[TopBar] Dolar error:', e));
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
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const notifCount = notifs.length;
    const sync = useSync();

    const SyncIndicator = () => {
        if (sync.status === 'idle') return null;
        const isRunning = sync.status === 'running';
        const isSuccess = sync.status === 'success';
        const color = isRunning ? '#3B82F6' : isSuccess ? '#10B981' : '#EF4444';
        const label = isRunning ? (sync.step || 'Procesando...') : isSuccess ? 'Listo' : (sync.error || 'Error');
        const Icon = isRunning ? RefreshCw : isSuccess ? CheckCircle2 : XCircle;
        const dest = sync.kind === 'conciliacion' ? '/agro/conciliacion' : null;
        return (
            <button
                onClick={() => {
                    if (dest) navigate(dest);
                    if (!isRunning) setTimeout(() => sync.reset(), 100);
                }}
                title={label}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 99,
                    border: `1px solid ${color}40`, background: `${color}10`, color,
                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
            >
                <Icon size={14} className={isRunning ? 'spinning' : ''} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            </button>
        );
    };

    const NotifPanel = ({ style }: { style?: React.CSSProperties }) => (
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 399 }} onClick={() => setShowNotifs(false)} />
            <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8, zIndex: 400,
                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.15)', overflow: 'hidden',
                width: 340, maxHeight: 420, ...style,
            }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Notificaciones</span>
                    {notifCount > 0 && <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#EF444415', color: '#EF4444' }}>{notifCount}</span>}
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 360 }}>
                    {notifs.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin notificaciones</div>
                    )}
                    {notifs.map(n => (
                        <div key={n.id} onClick={() => { navigate(n.path); setShowNotifs(false); }}
                            style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: n.color + '15', color: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                <n.icon size={14} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{n.subtitle}</div>
                            </div>
                            {n.time && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 4 }}>{n.time}</span>}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );

    /* ── MOBILE ── */
    if (isMobile) {
        if (isHome) {
            const dn = authDisplayName || (user as any)?.user_metadata?.display_name || (user as any)?.email?.split('@')[0] || '';
            const firstName = dn.charAt(0).toUpperCase() + dn.slice(1);
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 10px', boxShadow: '0 8px 40px rgba(59,130,246,0.08), 0 20px 60px rgba(59,130,246,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-cta, #2563EB)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                            {firstName.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Hola, {firstName}</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowNotifs(p => !p)} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', position: 'relative' }}>
                            <Bell size={16} />
                            {notifCount > 0 && <span style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />}
                        </button>
                        {showNotifs && <NotifPanel style={{ right: -8, width: 'calc(100vw - 32px)' }} />}
                    </div>
                </div>
            );
        }
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

            {/* Dollar quotes — for agro and general tenants */}
            {dolar && (tenant?.rubro === 'general' || tenant?.rubro === 'agro') && (
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    {[
                        { label: 'OFICIAL', value: dolar.oficial?.venta },
                        { label: 'BLUE', value: dolar.blue?.venta },
                        { label: 'MEP', value: dolar.mep?.venta },
                    ].map(d => (
                        <div key={d.label} style={{ textAlign: 'center', lineHeight: 1.2 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.label}</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{d.value ? `$${Number(d.value).toLocaleString('es-AR')}` : '—'}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Center: Search bar (inline) */}
            <div style={{ flex: 1, position: 'relative', margin: '0 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: showSearch ? '16px 16px 0 0' : 99, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                    <Search size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <input
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); if (!showSearch) setShowSearch(true); }}
                        onFocus={() => setShowSearch(true)}
                        placeholder="Buscar..."
                        style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '0.8125rem', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}
                    />
                </div>
                {showSearch && <GlobalSearch query={searchQuery} onClose={() => { setShowSearch(false); setSearchQuery(''); }} />}
            </div>

            {/* Right: Notification + Avatar dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <SyncIndicator />
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowNotifs(p => !p)} title="Notificaciones"
                        style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)', position: 'relative' }}>
                        <Bell size={16} />
                        {notifCount > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--color-danger)' }} />}
                    </button>
                    {showNotifs && <NotifPanel />}
                </div>

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
