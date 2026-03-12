import { useNavigate } from 'react-router-dom';
import { FileText, Upload, TrendingUp, Building2, Zap } from 'lucide-react';

export default function AccionesRapidasWidget() {
    const navigate = useNavigate();

    const quickActions = [
        { label: 'Comprobantes', desc: 'Ver y clasificar', icon: FileText, path: '/contable/comprobantes', color: '#6366f1' },
        { label: 'Subir PDF', desc: 'Importar factura', icon: Upload, path: '/contable/comprobantes', color: '#10b981' },
        { label: 'Movimientos', desc: 'Tesorería', icon: TrendingUp, path: '/tesoreria/movimientos', color: '#f59e0b' },
        { label: 'Proveedores', desc: 'Base de datos', icon: Building2, path: '/contable/proveedores', color: '#3b82f6' },
    ];

    return (
        <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--brand) 1.5%, var(--bg-card))', height: '100%' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={13} /> Acceso rápido
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {quickActions.map(a => (
                    <button
                        key={a.label}
                        onClick={() => navigate(a.path)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '0.6rem 0.75rem', borderRadius: 10, border: 'none',
                            background: 'var(--bg-subtle)', cursor: 'pointer',
                            transition: 'background 0.15s, transform 0.1s',
                            textAlign: 'left', width: '100%',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    >
                        <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: a.color + '15', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <a.icon size={14} color={a.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>{a.label}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{a.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
