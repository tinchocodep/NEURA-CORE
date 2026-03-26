import { useNavigate } from 'react-router-dom';
import { Activity as ActivityIcon, ArrowRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface RecentActivity {
    id: string;
    type: 'comprobante' | 'movimiento' | 'banco';
    title: string;
    subtitle: string;
    amount: number;
    date: string;
    direction: 'in' | 'out' | 'neutral';
}

interface ActividadRecienteWidgetProps {
    activity: RecentActivity[];
    periodLabel: string;
}

const fmtMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function ActividadRecienteWidget({ activity, periodLabel }: ActividadRecienteWidgetProps) {
    const navigate = useNavigate();

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'color-mix(in srgb, var(--text-muted) 1.5%, var(--bg-card))', height: '100%' }}>
            <div style={{ padding: '1rem 1.25rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ActivityIcon size={13} /> Actividad reciente en {periodLabel}
                </h3>
                <button onClick={() => navigate('/tesoreria/movimientos')} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                    Ver todo <ArrowRight size={12} />
                </button>
            </div>
            {activity.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Sin actividad reciente
                </div>
            ) : (
                <div>
                    {activity.map((a, i) => (
                        <div
                            key={a.id}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '0.65rem 1.25rem',
                                borderBottom: i < activity.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                transition: 'background 0.1s', cursor: 'pointer',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            onClick={() => navigate('/tesoreria/movimientos')}
                        >
                            <div style={{
                                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                background: a.direction === 'in' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {a.direction === 'in'
                                    ? <ArrowUpRight size={13} color="#10b981" />
                                    : <ArrowDownLeft size={13} color="#ef4444" />
                                }
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.title}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.subtitle}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{
                                    fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                                    color: a.direction === 'in' ? 'var(--color-success)' : 'var(--text-main)',
                                }}>
                                    {a.direction === 'in' ? '+' : ''}{fmtMoney(a.amount)}
                                </div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                    {new Date(a.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
