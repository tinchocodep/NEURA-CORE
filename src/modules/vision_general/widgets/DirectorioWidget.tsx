import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';

const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);

interface DirectorioWidgetProps {
    totalProveedores: number;
    totalClientes: number;
}

export default function DirectorioWidget({ totalProveedores, totalClientes }: DirectorioWidgetProps) {
    const navigate = useNavigate();

    return (
        <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--color-info) 1.5%, var(--bg-card))' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Building2 size={13} /> Directorio Total
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div
                    onClick={() => navigate('/contable/proveedores')}
                    style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.5rem 0.75rem', borderRadius: 8, background: 'var(--bg-subtle)',
                        cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                >
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Proveedores</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand)' }}>{fmtNum(totalProveedores)}</span>
                </div>
                <div
                    onClick={() => navigate('/contable/clientes')}
                    style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.5rem 0.75rem', borderRadius: 8, background: 'var(--bg-subtle)',
                        cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                >
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Clientes</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand)' }}>{fmtNum(totalClientes)}</span>
                </div>
            </div>
        </div>
    );
}
