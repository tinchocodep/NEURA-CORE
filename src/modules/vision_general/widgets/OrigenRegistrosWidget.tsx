import { PieChart } from 'lucide-react';

const fmtMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);

interface TypeBreakdown {
    tradicionalMonto: number;
    tradicionalCount: number;
    sinFacturaMonto: number;
    sinFacturaCount: number;
}

interface OrigenRegistrosWidgetProps {
    ventasMes: number;
    comprasMes: number;
    montoVentasMes: number;
    montoComprasMes: number;
    ventasBreakdown: TypeBreakdown;
    comprasBreakdown: TypeBreakdown;
}

export default function OrigenRegistrosWidget({
    ventasMes, comprasMes, montoVentasMes, montoComprasMes, ventasBreakdown, comprasBreakdown
}: OrigenRegistrosWidgetProps) {
    return (
        <div className="card" style={{ padding: '1.25rem', background: 'color-mix(in srgb, var(--text-muted) 2%, var(--bg-card))', height: '100%' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <PieChart size={16} color="var(--brand)" /> Origen de Registros
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Ingresos Mix */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>INGRESOS</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{fmtNum(ventasMes || 0)} ops</span>
                    </div>
                    {montoVentasMes > 0 ? (
                        <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{ width: `${(ventasBreakdown.tradicionalMonto / montoVentasMes) * 100}%`, background: 'var(--color-success)', opacity: 0.9 }} title="Con Factura" />
                            <div style={{ width: `${(ventasBreakdown.sinFacturaMonto / montoVentasMes) * 100}%`, background: '#cbd5e1' }} title="Sin Factura" />
                        </div>
                    ) : (
                        <div style={{ height: 16, borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 6 }} />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-success)', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-success)' }} /> Facturado: {fmtMoney(ventasBreakdown.tradicionalMonto)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-sub)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#cbd5e1' }} /> Directo: {fmtMoney(ventasBreakdown.sinFacturaMonto)}
                        </span>
                    </div>
                </div>

                {/* Egresos Mix */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>EGRESOS</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{fmtNum(comprasMes || 0)} ops</span>
                    </div>
                    {montoComprasMes > 0 ? (
                        <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{ width: `${(comprasBreakdown.tradicionalMonto / montoComprasMes) * 100}%`, background: 'var(--color-danger)', opacity: 0.9 }} title="Con Factura" />
                            <div style={{ width: `${(comprasBreakdown.sinFacturaMonto / montoComprasMes) * 100}%`, background: '#cbd5e1' }} title="Sin Factura" />
                        </div>
                    ) : (
                        <div style={{ height: 16, borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 6 }} />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-danger)', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-danger)' }} /> Facturado: {fmtMoney(comprasBreakdown.tradicionalMonto)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-sub)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#cbd5e1' }} /> Directo: {fmtMoney(comprasBreakdown.sinFacturaMonto)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
