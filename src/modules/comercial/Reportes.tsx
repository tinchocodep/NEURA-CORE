import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import StyledSelect from '../../shared/components/StyledSelect';

interface Stage { id: string; nombre: string; color: string; es_final: boolean; }
interface Source { id: string; nombre: string; }
interface Contact {
    id: string; nombre: string; apellido: string; fuente_id: string; etapa_id: string;
    vendedor_id: string; monto_cierre: number | null; created_at: string;
    fecha_primer_contacto: string;
}

const SOURCE_COLORS = ['#E1306C', '#FFE600', '#3B82F6', '#25D366', '#8B5CF6', '#F97316', '#06B6D4'];

export default function ComercialReportes() {
    const { tenant } = useTenant();
    const [stages, setStages] = useState<Stage[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('general');
    const [period, setPeriod] = useState('month');

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [stRes, cRes, srcRes] = await Promise.all([
            supabase.from('comercial_pipeline_stages').select('*').eq('tenant_id', tenant!.id).order('orden'),
            supabase.from('comercial_contacts').select('*').eq('tenant_id', tenant!.id),
            supabase.from('comercial_sources').select('*').eq('tenant_id', tenant!.id),
        ]);
        if (stRes.data) setStages(stRes.data);
        if (cRes.data) setContacts(cRes.data as any);
        if (srcRes.data) setSources(srcRes.data);
        setLoading(false);
    };

    // Date filter
    const now = new Date();
    const filterDate = (d: string) => {
        const date = new Date(d);
        if (period === 'today') return date.toDateString() === now.toDateString();
        if (period === 'week') { const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); return date >= weekAgo; }
        if (period === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        if (period === 'quarter') { const q = Math.floor(now.getMonth() / 3); return Math.floor(date.getMonth() / 3) === q && date.getFullYear() === now.getFullYear(); }
        return true;
    };

    const filtered = contacts.filter(c => filterDate(c.created_at));
    const wonStage = stages.find(s => s.nombre === 'Cerrado ganado');
    const lostStage = stages.find(s => s.nombre === 'Cerrado perdido');
    const won = filtered.filter(c => c.etapa_id === wonStage?.id);
    const lost = filtered.filter(c => c.etapa_id === lostStage?.id);
    const totalClosed = won.length + lost.length;
    const convRate = totalClosed > 0 ? Math.round((won.length / totalClosed) * 100) : 0;
    const totalRevenue = won.reduce((s, c) => s + (c.monto_cierre || 0), 0);


    // By Source
    const bySource = sources.map((src, i) => {
        const srcContacts = filtered.filter(c => c.fuente_id === src.id);
        const srcWon = srcContacts.filter(c => c.etapa_id === wonStage?.id);
        const srcClosed = srcContacts.filter(c => c.etapa_id === wonStage?.id || c.etapa_id === lostStage?.id);
        return {
            name: src.nombre, count: srcContacts.length,
            won: srcWon.length, convRate: srcClosed.length > 0 ? Math.round((srcWon.length / srcClosed.length) * 100) : 0,
            color: SOURCE_COLORS[i % SOURCE_COLORS.length],
        };
    }).filter(s => s.count > 0);
    const maxSourceCount = Math.max(...bySource.map(s => s.count), 1);

    // By Stage
    const byStage = stages.map(st => ({
        name: st.nombre, color: st.color, count: filtered.filter(c => c.etapa_id === st.id).length,
    }));

    const tabs = [
        { key: 'general', label: 'General' },
        { key: 'canales', label: 'Por Canal' },
        { key: 'etapas', label: 'Por Etapa' },
    ];

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando reportes...</div>;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Reportes</h1>
                <StyledSelect value={period} onChange={e => setPeriod(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="today">Hoy</option>
                    <option value="week">Esta semana</option>
                    <option value="month">Este mes</option>
                    <option value="quarter">Último trimestre</option>
                    <option value="all">Todo</option>
                </StyledSelect>
                <div style={{ marginLeft: 'auto' }}>
                    <button style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Download size={14} /> Exportar
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border-subtle)' }}>
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                        padding: '0.6rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: activeTab === t.key ? 600 : 400,
                        color: activeTab === t.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                        borderBottom: activeTab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
                    }}>{t.label}</button>
                ))}
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        {[
                            { label: 'Total leads', value: filtered.length, color: '#3B82F6' },
                            { label: 'Cerrados ganados', value: won.length, color: '#10B981' },
                            { label: 'Cerrados perdidos', value: lost.length, color: '#EF4444' },
                            { label: 'Tasa conversión', value: `${convRate}%`, color: '#0D9488' },
                            { label: 'Ingresos totales', value: `$${(totalRevenue / 1000000).toFixed(1)}M`, color: '#8B5CF6' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{kpi.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Stage distribution */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Distribución por etapa</div>
                        <div style={{ display: 'flex', gap: '0.5rem', height: 200, alignItems: 'flex-end' }}>
                            {byStage.map(s => {
                                const maxStage = Math.max(...byStage.map(x => x.count), 1);
                                return (
                                    <div key={s.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: s.color }}>{s.count}</span>
                                        <div style={{
                                            width: '100%', maxWidth: 60,
                                            height: `${Math.max(8, (s.count / maxStage) * 160)}px`,
                                            background: `linear-gradient(to top, ${s.color}, ${s.color}88)`,
                                            borderRadius: '4px 4px 0 0',
                                            transition: 'height 0.5s ease',
                                        }} />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.1 }}>{s.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* By Channel Tab */}
            {activeTab === 'canales' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Source pie chart approximation + table */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Leads por canal</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {bySource.map(s => (
                                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.8rem', width: 100, flexShrink: 0 }}>{s.name}</span>
                                        <div style={{ flex: 1, height: 20, background: 'var(--color-border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(s.count / maxSourceCount) * 100}%`, background: s.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fff' }}>{s.count}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                        {['Canal', 'Leads', 'Ganados', 'Conversión'].map(h => (
                                            <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {bySource.map(s => (
                                        <tr key={s.name} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                                                {s.name}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{s.count}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#10B981' }}>{s.won}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{s.convRate}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* By Stage Tab */}
            {activeTab === 'etapas' && (
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                {['Etapa', 'Leads', '% del total'].map(h => (
                                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {byStage.map(s => (
                                <tr key={s.name} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${s.color}20`, color: s.color }}>{s.name}</span>
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{s.count}</td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ flex: 1, maxWidth: 200, height: 8, background: 'var(--color-border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${filtered.length > 0 ? (s.count / filtered.length) * 100 : 0}%`, background: s.color, borderRadius: 4 }} />
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{filtered.length > 0 ? Math.round((s.count / filtered.length) * 100) : 0}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
