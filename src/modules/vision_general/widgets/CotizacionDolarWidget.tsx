import { DollarSign, RefreshCw } from 'lucide-react';
import type { DolarResumen } from '../../../services/DolarService';

interface CotizacionDolarWidgetProps {
    dolar: DolarResumen | null;
    dolarLoading: boolean;
    loadDolar: (force: boolean) => void;
}

export default function CotizacionDolarWidget({ dolar, dolarLoading, loadDolar }: CotizacionDolarWidgetProps) {
    return (
        <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--color-success) 1.5%, var(--bg-card))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DollarSign size={13} /> Dólar
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={() => loadDolar(true)} disabled={dolarLoading} style={{ padding: 4 }}>
                    <RefreshCw size={12} style={{ animation: dolarLoading ? 'spin 1s linear infinite' : 'none' }} />
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                {[
                    { label: 'Oficial', data: dolar?.oficial, color: 'var(--color-success)' },
                    { label: 'Blue', data: dolar?.blue, color: 'var(--color-info)' },
                    { label: 'MEP', data: dolar?.mep, color: 'var(--color-accent)' },
                    { label: 'CCL', data: dolar?.ccl, color: 'var(--color-warning)' },
                ].map(item => (
                    <div key={item.label} style={{
                        padding: '0.5rem', borderRadius: 8,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                    }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                            {item.label}
                        </div>
                        {dolarLoading && !item.data ? (
                            <div style={{ width: '60%', height: 16, background: 'var(--bg-hover)', borderRadius: 4 }} />
                        ) : item.data ? (
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                                ${item.data.venta.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
