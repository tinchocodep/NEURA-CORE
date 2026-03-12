import { TrendingUp } from 'lucide-react';

export default function FlujoCajaWidget() {
    return (
        <div className="card" style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-subtle)' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <TrendingUp size={16} color="var(--brand)" /> Flujo de Caja (Evolutivo)
            </h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 150 }}>
                <TrendingUp size={32} color="var(--text-faint)" style={{ marginBottom: 12 }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Próximamente...</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', textAlign: 'center', maxWidth: 220, marginTop: 4 }}>
                    Gráfico evolutivo de saldos en construcción.
                </span>
            </div>
        </div>
    );
}
