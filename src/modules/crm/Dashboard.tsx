import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Users, TrendingUp, CheckCircle, Car, DollarSign, ShoppingCart } from 'lucide-react';

interface Prospecto {
    id: string;
    nombre: string;
    etapa: string;
    monto_estimado: number | null;
    contacto_id: string | null;
    created_at: string;
}

interface AutoResumen {
    id: string;
    marca: string;
    modelo: string;
    anio: number;
    precio: number | null;
    moneda: string;
    estado: string;
    prospecto_id: string | null;
}

const ETAPA_COLORS: Record<string, string> = {
    Nuevo: '#6366f1', Contactado: '#3b82f6', Propuesta: '#f59e0b',
    'Negociación': '#8b5cf6', Ganado: '#10b981', Perdido: '#ef4444',
};

const ESTADO_AUTO_COLORS: Record<string, { color: string; bg: string }> = {
    disponible: { color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    reservado: { color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
    vendido: { color: '#0284c7', bg: 'rgba(2,132,199,0.1)' },
};

function fmtPrice(n: number | null, moneda: string) {
    if (!n) return '';
    return (moneda === 'USD' ? 'USD ' : '$ ') + n.toLocaleString('es-AR');
}

export default function CRMDashboard() {
    const { tenant } = useTenant();
    const [prospectos, setProspectos] = useState<Prospecto[]>([]);
    const [contactosCount, setContactosCount] = useState(0);
    const [autos, setAutos] = useState<AutoResumen[]>([]);
    const [loading, setLoading] = useState(true);

    const modules = (tenant as any)?.enabled_modules || [];
    const hasCatalogo = modules.includes('crm.catalogo');

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [prospectosRes, contactosRes] = await Promise.all([
            supabase.from('crm_prospectos').select('id, nombre, etapa, monto_estimado, contacto_id, created_at').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }).limit(10),
            supabase.from('crm_contactos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('activo', true),
        ]);
        setProspectos(prospectosRes.data || []);
        setContactosCount(contactosRes.count || 0);
        if (hasCatalogo) {
            const autosRes = await supabase.from('crm_catalogo_autos').select('id, marca, modelo, anio, precio, moneda, estado, prospecto_id').eq('tenant_id', tenant!.id);
            setAutos(autosRes.data || []);
        }
        setLoading(false);
    };

    const prospectosActivos = prospectos.filter(p => p.etapa !== 'Ganado' && p.etapa !== 'Perdido').length;
    const ganados = prospectos.filter(p => p.etapa === 'Ganado').length;
    const cerrados = prospectos.filter(p => p.etapa === 'Ganado' || p.etapa === 'Perdido').length;
    const conversion = cerrados > 0 ? Math.round((ganados / cerrados) * 100) : 0;

    // Auto stats
    const autosDisponibles = autos.filter(a => a.estado === 'disponible').length;
    const autosReservados = autos.filter(a => a.estado === 'reservado').length;
    const autosVendidos = autos.filter(a => a.estado === 'vendido').length;
    const autosConProspecto = autos.filter(a => a.prospecto_id).length;
    const valorStock = autos.filter(a => a.estado !== 'vendido').reduce((s, a) => s + (a.precio || 0), 0);

    // Pipeline value
    const pipelineValue = prospectos
        .filter(p => p.etapa !== 'Ganado' && p.etapa !== 'Perdido')
        .reduce((s, p) => s + (p.monto_estimado || 0), 0);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
            <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
    );

    // Build KPIs dynamically
    const kpis: { label: string; value: string | number; icon: any; color: string }[] = [];
    if (hasCatalogo) {
        kpis.push({ label: 'En Stock', value: autosDisponibles, icon: Car, color: '#16a34a' });
        kpis.push({ label: 'Reservados', value: autosReservados, icon: ShoppingCart, color: '#d97706' });
        kpis.push({ label: 'Vendidos', value: autosVendidos, icon: CheckCircle, color: '#0284c7' });
    }
    kpis.push({ label: 'Prospectos Activos', value: prospectosActivos, icon: TrendingUp, color: '#f59e0b' });
    kpis.push({ label: 'Contactos', value: contactosCount, icon: Users, color: '#3b82f6' });
    kpis.push({ label: 'Conversión', value: `${conversion}%`, icon: TrendingUp, color: '#8b5cf6' });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
                <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>CRM</h1>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>
                    Visión general de {hasCatalogo ? 'vehículos, ' : ''}prospectos y contactos
                </p>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {kpis.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="card" style={{ padding: '16px 20px', borderTop: `3px solid ${color}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon size={16} style={{ color }} />
                            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Main grid */}
            <div style={{ display: 'grid', gridTemplateColumns: hasCatalogo ? '1fr 360px' : '1fr 360px', gap: 20 }}>
                {/* Left: Catálogo summary or Pipeline value */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Pipeline value card */}
                    {pipelineValue > 0 && (
                        <div className="card" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <DollarSign size={16} style={{ color: 'var(--color-accent)' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Valor del Pipeline</span>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                                $ {pipelineValue.toLocaleString('es-AR')}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                {prospectosActivos} prospectos activos
                            </div>
                        </div>
                    )}

                    {/* Catálogo resumen */}
                    {hasCatalogo && autos.length > 0 && (
                        <div className="card" style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Car size={15} style={{ color: 'var(--color-accent)' }} /> Vehículos
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    {autosConProspecto} con prospecto · Stock: $ {valorStock.toLocaleString('es-AR')}
                                </span>
                            </div>
                            <div className="table-container">
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            {['Vehículo', 'Precio', 'Estado'].map(h => (
                                                <th key={h} style={{ textAlign: 'left', padding: '8px 16px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {autos.filter(a => a.estado !== 'vendido').slice(0, 8).map(auto => {
                                            const ec = ESTADO_AUTO_COLORS[auto.estado] || ESTADO_AUTO_COLORS.disponible;
                                            return (
                                                <tr key={auto.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{auto.marca} {auto.modelo} {auto.anio}</span>
                                                    </td>
                                                    <td style={{ padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                        {fmtPrice(auto.precio, auto.moneda)}
                                                    </td>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: '0.625rem', fontWeight: 700, background: ec.bg, color: ec.color }}>{auto.estado}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Etapas breakdown */}
                    <div className="card" style={{ padding: 20 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: 14 }}>Pipeline por Etapa</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {['Nuevo', 'Contactado', 'Propuesta', 'Negociación', 'Ganado', 'Perdido'].map(etapa => {
                                const count = prospectos.filter(p => p.etapa === etapa).length;
                                const monto = prospectos.filter(p => p.etapa === etapa).reduce((s, p) => s + (p.monto_estimado || 0), 0);
                                const color = ETAPA_COLORS[etapa] || '#999';
                                const pct = prospectos.length > 0 ? (count / prospectos.length) * 100 : 0;
                                return (
                                    <div key={etapa} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 90, fontSize: '0.75rem', fontWeight: 600, color }}>{etapa}</span>
                                        <div style={{ flex: 1, height: 6, background: 'var(--color-border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s' }} />
                                        </div>
                                        <span style={{ width: 24, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{count}</span>
                                        {monto > 0 && (
                                            <span style={{ width: 100, fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                                                $ {monto.toLocaleString('es-AR')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Prospectos recientes */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 600 }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Prospectos Recientes</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {prospectos.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin prospectos cargados</div>
                        ) : (
                            prospectos.map(p => {
                                const color = ETAPA_COLORS[p.etapa] || '#999';
                                return (
                                    <div key={p.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: `${color}18`, color, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                            {p.etapa}
                                        </span>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                                        </div>
                                        {p.monto_estimado && (
                                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                                                $ {p.monto_estimado.toLocaleString('es-AR')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
