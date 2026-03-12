import { Users } from 'lucide-react';

const fmtMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

interface EntityRanking {
    id: string;
    name: string;
    amount: number;
    count: number;
}

interface RankingEntidadesWidgetProps {
    topClientes: EntityRanking[];
    topProveedores: EntityRanking[];
}

export default function RankingEntidadesWidget({ topClientes, topProveedores }: RankingEntidadesWidgetProps) {
    return (
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', background: 'color-mix(in srgb, var(--color-info) 3%, var(--bg-card))', height: '100%' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                <Users size={16} color="var(--brand)" /> Top Entidades del Período
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flex: 1 }}>
                {/* Clientes */}
                <div style={{ borderRight: '1px dashed var(--border-subtle)', paddingRight: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Mejores Clientes (Ingresos)</h4>
                    {topClientes.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin registros</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {topClientes.map((c, i) => (
                                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                        {i + 1}. {c.name}
                                    </span>
                                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>{fmtMoney(c.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Proveedores */}
                <div>
                    <h4 style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-danger)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Mayores Proveedores (Gastos)</h4>
                    {topProveedores.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin registros</p> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {topProveedores.map((p, i) => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                        {i + 1}. {p.name}
                                    </span>
                                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-sub)' }}>{fmtMoney(p.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
