import { ArrowUpRight, ArrowDownLeft, BarChart3, DollarSign } from 'lucide-react';

const fmtMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);

interface ResumenFinancieroWidgetProps {
    metrics: {
        montoVentasMes: number;
        ventasMes: number;
        montoComprasMes: number;
        comprasMes: number;
        saldoCajas: number;
        movimientosMes: number;
    } | null;
}

export default function ResumenFinancieroWidget({ metrics }: ResumenFinancieroWidgetProps) {
    if (!metrics) return null;

    return (
        <div className="grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {/* Ventas Netas */}
            <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--color-success) 4%, var(--bg-card))' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-success)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <ArrowUpRight size={14} color="var(--color-success)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor Generado</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.montoVentasMes)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.ventasMes)} registros ingresos</div>
            </div>

            {/* Compras Netas */}
            <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--color-danger) 4%, var(--bg-card))' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-danger)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <ArrowDownLeft size={14} color="var(--color-danger)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gastos y Compras</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.montoComprasMes)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.comprasMes)} registros egresos</div>
            </div>

            {/* Saldo Neto */}
            <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--brand) 4%, var(--bg-card))' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--brand)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <BarChart3 size={14} color="var(--brand)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance Neto</span>
                </div>
                <div style={{
                    fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em',
                    color: (metrics.montoVentasMes - metrics.montoComprasMes) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                }}>
                    {fmtMoney(metrics.montoVentasMes - metrics.montoComprasMes)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Ingresos - Egresos</div>
            </div>

            {/* Saldo Cajas (Global unaffected by period usually, but kept for layout consistency) */}
            <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', background: 'color-mix(in srgb, var(--color-warning) 5%, var(--bg-card))' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-warning)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <DollarSign size={14} color="var(--color-warning)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saldo Bancos/Caja</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{fmtMoney(metrics.saldoCajas)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtNum(metrics.movimientosMes)} transacciones en período</div>
            </div>
        </div>
    );
}
