import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Download, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';

interface Stage { id: string; nombre: string; color: string; }
interface Source { id: string; nombre: string; }
interface Contact {
    id: string; nombre: string; apellido: string; telefono: string; email: string;
    vehiculo_interes: string; fuente_id: string; etapa_id: string;
    prioridad: string; vendedor_id: string; last_activity_at: string; created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = { baja: '#10B981', media: '#F59E0B', alta: '#EF4444' };

export default function ComercialContactos() {
    const { tenant } = useTenant();
    const navigate = useNavigate();
    const { user } = useAuth() as any;
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [stages, setStages] = useState<Stage[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStage, setFilterStage] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [page, setPage] = useState(1);
    const perPage = 25;

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [cRes, stRes, srcRes] = await Promise.all([
            supabase.from('comercial_contacts').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
            supabase.from('comercial_pipeline_stages').select('id, nombre, color').eq('tenant_id', tenant!.id).order('orden'),
            supabase.from('comercial_sources').select('id, nombre').eq('tenant_id', tenant!.id),
        ]);
        if (cRes.data) setContacts(cRes.data as any);
        if (stRes.data) setStages(stRes.data);
        if (srcRes.data) setSources(srcRes.data);
        setLoading(false);
    };

    const filtered = contacts.filter(c => {
        if (searchTerm && !`${c.nombre} ${c.apellido} ${c.telefono} ${c.email} ${c.vehiculo_interes}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filterStage && c.etapa_id !== filterStage) return false;
        if (filterPriority && c.prioridad !== filterPriority) return false;
        return true;
    });

    const totalPages = Math.ceil(filtered.length / perPage);
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    const stageName = (id: string) => stages.find(s => s.id === id)?.nombre || '—';
    const stageColor = (id: string) => stages.find(s => s.id === id)?.color || '#6B7280';
    const sourceName = (id: string) => sources.find(s => s.id === id)?.nombre || '—';

    const timeAgo = (d: string) => {
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `hace ${mins} min`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        if (days === 1) return 'ayer';
        return `hace ${days} días`;
    };

    const exportCSV = () => {
        const headers = ['Nombre', 'Apellido', 'Teléfono', 'Email', 'Vehículo', 'Etapa', 'Fuente', 'Prioridad'];
        const rows = filtered.map(c => [c.nombre, c.apellido, c.telefono, c.email, c.vehiculo_interes, stageName(c.etapa_id), sourceName(c.fuente_id), c.prioridad]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'contactos_comercial.csv'; a.click();
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando contactos...</div>;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Contactos</h1>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <select value={filterStage} onChange={e => { setFilterStage(e.target.value); setPage(1); }} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="">Todas las etapas</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1); }} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="">Toda prioridad</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                </select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={exportCSV} style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Download size={14} /> Exportar
                    </button>
                    <button onClick={() => navigate('/comercial/pipeline')} style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Plus size={14} /> Nuevo
                    </button>
                </div>
            </div>

            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                            {['Nombre', 'Teléfono', 'Vehículo', 'Etapa', 'Fuente', 'Última actividad', 'Prioridad'].map(h => (
                                <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map(c => (
                            <tr key={c.id} onClick={() => navigate(`/comercial/contactos/${c.id}`)}
                                style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}
                            >
                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{c.nombre} {c.apellido}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {c.telefono && (
                                            <a href={`https://wa.me/${c.telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                                               onClick={e => e.stopPropagation()}
                                               style={{ color: '#25D366', display: 'flex' }}>
                                                <MessageCircle size={13} />
                                            </a>
                                        )}
                                        <span style={{ color: 'var(--color-text-muted)' }}>{c.telefono}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)' }}>{c.vehiculo_interes}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${stageColor(c.etapa_id)}20`, color: stageColor(c.etapa_id) }}>
                                        {stageName(c.etapa_id)}
                                    </span>
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>{sourceName(c.fuente_id)}</td>
                                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{timeAgo(c.last_activity_at)}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[c.prioridad], display: 'inline-block' }} />
                                </td>
                            </tr>
                        ))}
                        {paginated.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    Sin contactos {searchTerm ? 'para esa búsqueda' : ''}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, color: 'var(--color-text-primary)' }}>
                        ← Anterior
                    </button>
                    <span style={{ color: 'var(--color-text-muted)' }}>Página {page} de {totalPages} ({filtered.length} contactos)</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, color: 'var(--color-text-primary)' }}>
                        Siguiente →
                    </button>
                </div>
            )}
        </div>
    );
}
