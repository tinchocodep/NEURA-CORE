import { useNavigate } from 'react-router-dom';
import { DollarSign, ArrowRight } from 'lucide-react';

const fmtMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

interface MonitorTesoreriaWidgetProps {
    saldoCajas: number;
}

export default function MonitorTesoreriaWidget({ saldoCajas }: MonitorTesoreriaWidgetProps) {
    const navigate = useNavigate();

    return (
        <div className="card" style={{ padding: '1.25rem', background: 'color-mix(in srgb, var(--color-warning) 5%, var(--bg-card))', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <DollarSign size={16} color="var(--color-warning)" /> Monitor de Tesorería (Cajas)
            </h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Caja Diaria Total</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
                    {fmtMoney(saldoCajas)}
                </span>
            </div>
            <button
                onClick={() => navigate('/tesoreria/cuentas')}
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: 6 }}
            >
                Ver Cuentas <ArrowRight size={14} />
            </button>
        </div>
    );
}
