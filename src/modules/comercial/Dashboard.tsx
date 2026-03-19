import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Clock, DollarSign, Users, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Stage { id: string; nombre: string; color: string; orden: number; es_final: boolean; }
interface Source { id: string; nombre: string; }
interface Contact {
    id: string; nombre: string; apellido: string; vehiculo_interes: string;
    etapa_id: string; prioridad: string; last_activity_at: string;
    fuente_id: string; monto_cierre: number | null;
    created_at: string;
}
interface Interaction {
    id: string; tipo: string; descripcion: string; created_at: string;
    contact_id: string;
    contact: { nombre: string; apellido: string } | null;
}

const SOURCE_COLORS = ['#E1306C', '#FFE600', '#3B82F6', '#25D366', '#8B5CF6', '#F97316', '#06B6D4'];

export default function ComercialDashboard() {
    const { tenant } = useTenant();
    const navigate = useNavigate();
    const [stages, setStages] = useState<Stage[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [stagesRes, contactsRes, sourcesRes, interactionsRes] = await Promise.all([
            supabase.from('comercial_pipeline_stages').select('*').eq('tenant_id', tenant!.id).order('orden'),
            supabase.from('comercial_contacts').select('*').eq('tenant_id', tenant!.id),
            supabase.from('comercial_sources').select('*').eq('tenant_id', tenant!.id),
            supabase.from('comercial_interactions')
                .select('id, tipo, descripcion, created_at, contact_id, contact:comercial_contacts(nombre, apellido)')
                .eq('tenant_id', tenant!.id)
                .order('created_at', { ascending: false })
                .limit(10),
        ]);
        if (stagesRes.data) setStages(stagesRes.data);
        if (contactsRes.data) setContacts(contactsRes.data as any);
        if (sourcesRes.data) setSources(sourcesRes.data);
        if (interactionsRes.data) setInteractions(interactionsRes.data as any);
        setLoading(false);
    };

    // KPI calculations
    const now = new Date();
    const thisMonth = contacts.filter(c => new Date(c.created_at).getMonth() === now.getMonth() && new Date(c.created_at).getFullYear() === now.getFullYear());
    const leadsThisMonth = thisMonth.length;
    const wonStage = stages.find(s => s.nombre === 'Cerrado ganado');
    const lostStage = stages.find(s => s.nombre === 'Cerrado perdido');
    const won = contacts.filter(c => c.etapa_id === wonStage?.id);
    const lost = contacts.filter(c => c.etapa_id === lostStage?.id);
    const closedTotal = won.length + lost.length;
    const conversionRate = closedTotal > 0 ? Math.round((won.length / closedTotal) * 100) : 0;
    const avgTicket = won.length > 0 ? won.reduce((s, c) => s + (c.monto_cierre || 0), 0) / won.length : 0;

    // Leads by source
    const leadsBySource = sources.map((src, i) => ({
        name: src.nombre,
        count: contacts.filter(c => c.fuente_id === src.id).length,
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    })).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
    const maxSourceCount = Math.max(...leadsBySource.map(s => s.count), 1);

    // Funnel
    const funnelData = stages.filter(s => !s.es_final || s.nombre === 'Cerrado ganado').map(stage => ({
        name: stage.nombre,
        count: contacts.filter(c => c.etapa_id === stage.id).length,
        color: stage.color,
    }));
    const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);

    // Alerts: contacts without activity > 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const finalStageIds = stages.filter(s => s.es_final).map(s => s.id);
    const alertContacts = contacts.filter(c =>
        !finalStageIds.includes(c.etapa_id || '') &&
        new Date(c.last_activity_at) < threeDaysAgo
    );

    const TIPO_LABELS: Record<string, string> = {
        mensaje_entrante: '📩 Mensaje entrante',
        respuesta_enviada: '📤 Respuesta enviada',
        llamada: '📞 Llamada',
        visita: '🏪 Visita',
        nota: '📝 Nota',
        recordatorio: '⏰ Recordatorio',
        cambio_etapa: '🔄 Cambio de etapa',
    };

    const timeAgo = (d: string) => {
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `hace ${mins} min`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `hace ${days}d`;
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    const kpis = [
        { label: 'Leads este mes', value: leadsThisMonth, change: '+12%', up: true, color: '#3B82F6', icon: Users },
        { label: 'Tasa de conversión', value: `${conversionRate}%`, change: '+3pp', up: true, color: '#0D9488', icon: TrendingUp },
        { label: 'Tiempo resp. promedio', value: '8 min', change: '-15%', up: true, color: '#F97316', icon: Clock },
        { label: 'Ticket promedio', value: avgTicket > 0 ? `$${(avgTicket / 1000000).toFixed(1)}M` : '$0', change: '+5%', up: true, color: '#10B981', icon: DollarSign },
    ];

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Comercial</h1>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Dashboard de seguimiento de leads y ventas.</p>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {kpis.map(({ label, value, change, up, color, icon: Icon }) => (
                    <div key={label} style={{
                        background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-md)', padding: '1.25rem', cursor: 'pointer',
                        transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={20} color={color} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, marginBottom: '0.25rem' }}>{value}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</span>
                            <span style={{ fontSize: '0.7rem', color: up ? '#10B981' : '#EF4444', display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
                                {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {change}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Leads by Source */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Leads por fuente de origen</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {leadsBySource.map(s => (
                            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                                 onClick={() => navigate('/comercial/pipeline')}>
                                <span style={{ fontSize: '0.8rem', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                <div style={{ flex: 1, height: 22, background: 'var(--color-border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', width: `${(s.count / maxSourceCount) * 100}%`,
                                        background: `linear-gradient(90deg, ${s.color}cc, ${s.color})`,
                                        borderRadius: 6, transition: 'width 0.6s ease',
                                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
                                    }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff' }}>{s.count}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {leadsBySource.length === 0 && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Sin datos</div>}
                    </div>
                </div>

                {/* Conversion Funnel */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Embudo de conversión</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                        {funnelData.map((f) => {
                            const widthPct = Math.max(25, (f.count / maxFunnel) * 100);
                            return (
                                <div key={f.name} style={{
                                    width: `${widthPct}%`, minWidth: 120,
                                    background: `${f.color}22`, border: `1px solid ${f.color}44`,
                                    borderRadius: 8, padding: '0.6rem 1rem',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    cursor: 'pointer', transition: 'transform 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                onClick={() => navigate('/comercial/pipeline')}
                                >
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: f.color }}>{f.name}</span>
                                    <span style={{ fontSize: '1rem', fontWeight: 700, color: f.color }}>{f.count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Activity + Alerts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
                {/* Recent Activity */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Actividad Reciente</span>
                    </div>
                    <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                        {interactions.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin actividad registrada</div>
                        ) : (
                            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Cuando</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Lead</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {interactions.map(i => (
                                        <tr key={i.id}
                                            style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                                            onClick={() => navigate(`/comercial/contactos/${i.contact_id}`)}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{timeAgo(i.created_at)}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                                                {(i.contact as any)?.nombre} {(i.contact as any)?.apellido}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem' }}>
                                                <span style={{ marginRight: 4 }}>{TIPO_LABELS[i.tipo]?.split(' ')[0]}</span>
                                                <span style={{ color: 'var(--color-text-muted)' }}>{i.descripcion?.substring(0, 60)}{(i.descripcion?.length || 0) > 60 ? '...' : ''}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Alerts */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={16} color="#F97316" />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Alertas</span>
                        {alertContacts.length > 0 && (
                            <span style={{ marginLeft: 'auto', background: '#F9731620', color: '#F97316', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                                {alertContacts.length}
                            </span>
                        )}
                    </div>
                    <div style={{ padding: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
                        {alertContacts.length === 0 ? (
                            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                ✅ Todo al día, sin alertas pendientes
                            </div>
                        ) : (
                            alertContacts.map(c => {
                                const daysSince = Math.floor((Date.now() - new Date(c.last_activity_at).getTime()) / (24 * 60 * 60 * 1000));
                                return (
                                    <div key={c.id}
                                        style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}
                                        onClick={() => navigate(`/comercial/contactos/${c.id}`)}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                                    >
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F9731618', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F97316' }}>{c.nombre.charAt(0)}{c.apellido?.charAt(0) || ''}</span>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre} {c.apellido}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#EF4444' }}>Sin respuesta hace {daysSince} días</div>
                                        </div>
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
