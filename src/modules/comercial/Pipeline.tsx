import { useEffect, useState } from 'react';
import { Search, Plus, List, Columns3, X, Phone, MessageCircle, Calendar, StickyNote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';

interface Stage { id: string; nombre: string; color: string; orden: number; es_final: boolean; }
interface Source { id: string; nombre: string; icono: string; }
interface Contact {
    id: string; nombre: string; apellido: string; telefono: string; email: string;
    vehiculo_interes: string; fuente_id: string; fuente_detalle: string;
    etapa_id: string; prioridad: string; vendedor_id: string;
    presupuesto_min: number; presupuesto_max: number; monto_cierre: number | null;
    motivo_perdida: string | null; fecha_primer_contacto: string;
    last_activity_at: string; created_at: string; tags: string[];
}
interface Interaction {
    id: string; tipo: string; descripcion: string; created_at: string;
    registrado_por: string;
}

const TIPO_COLORS: Record<string, string> = {
    mensaje_entrante: '#3B82F6', respuesta_enviada: '#0D9488', llamada: '#F97316',
    visita: '#10B981', nota: '#6B7280', recordatorio: '#EF4444', cambio_etapa: '#8B5CF6',
};
const TIPO_LABELS: Record<string, string> = {
    mensaje_entrante: 'Mensaje entrante', respuesta_enviada: 'Respuesta enviada',
    llamada: 'Llamada', visita: 'Visita al showroom', nota: 'Nota interna',
    recordatorio: 'Recordatorio', cambio_etapa: 'Cambio de etapa',
};
const PRIORITY_COLORS: Record<string, string> = { baja: '#10B981', media: '#F59E0B', alta: '#EF4444' };
const MOTIVOS_PERDIDA = ['Precio', 'Eligió otra agencia', 'No responde', 'Desistió', 'Otro'];

export default function ComercialPipeline() {
    const { tenant } = useTenant();
    const { user } = useAuth() as any;
    const [stages, setStages] = useState<Stage[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLead, setSelectedLead] = useState<Contact | null>(null);
    const [showNewLeadForm, setShowNewLeadForm] = useState(false);
    const [draggedId, setDraggedId] = useState<string | null>(null);

    // Close modal states
    const [showCloseWon, setShowCloseWon] = useState<Contact | null>(null);
    const [showCloseLost, setShowCloseLost] = useState<Contact | null>(null);
    const [closeWonAmount, setCloseWonAmount] = useState('');
    const [closeLostReason, setCloseLostReason] = useState('');

    // New lead form
    const [newLead, setNewLead] = useState({ nombre: '', apellido: '', telefono: '', email: '', vehiculo_interes: '', fuente_id: '', prioridad: 'media' });

    // Quick action forms
    const [showNoteForm, setShowNoteForm] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [showReminderForm, setShowReminderForm] = useState(false);
    const [reminderDate, setReminderDate] = useState('');
    const [reminderNote, setReminderNote] = useState('');

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    useEffect(() => {
        if (!selectedLead || !tenant) return;
        loadInteractions(selectedLead.id);
    }, [selectedLead?.id]);

    const loadData = async () => {
        setLoading(true);
        const [stRes, cRes, srcRes] = await Promise.all([
            supabase.from('comercial_pipeline_stages').select('*').eq('tenant_id', tenant!.id).order('orden'),
            supabase.from('comercial_contacts').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
            supabase.from('comercial_sources').select('*').eq('tenant_id', tenant!.id),
        ]);
        if (stRes.data) setStages(stRes.data);
        if (cRes.data) setContacts(cRes.data as any);
        if (srcRes.data) setSources(srcRes.data);
        setLoading(false);
    };

    const loadInteractions = async (contactId: string) => {
        const { data } = await supabase.from('comercial_interactions').select('*')
            .eq('contact_id', contactId).order('created_at', { ascending: false });
        if (data) setInteractions(data);
    };

    const moveToStage = async (contactId: string, stageId: string) => {
        const stage = stages.find(s => s.id === stageId);
        const contact = contacts.find(c => c.id === contactId);
        if (!stage || !contact) return;

        // If moving to "Cerrado ganado", ask for amount
        if (stage.nombre === 'Cerrado ganado') {
            setShowCloseWon(contact);
            return;
        }
        // If moving to "Cerrado perdido", ask for reason
        if (stage.nombre === 'Cerrado perdido') {
            setShowCloseLost(contact);
            return;
        }

        await updateContact(contactId, { etapa_id: stageId });
        // Record interaction
        await supabase.from('comercial_interactions').insert({
            tenant_id: tenant!.id, contact_id: contactId,
            tipo: 'cambio_etapa', descripcion: `Movido a "${stage.nombre}"`,
            registrado_por: user?.id,
        });
    };

    const confirmCloseWon = async () => {
        if (!showCloseWon) return;
        const wonStage = stages.find(s => s.nombre === 'Cerrado ganado');
        if (!wonStage) return;
        await updateContact(showCloseWon.id, {
            etapa_id: wonStage.id,
            monto_cierre: parseFloat(closeWonAmount) || 0,
        });
        await supabase.from('comercial_interactions').insert({
            tenant_id: tenant!.id, contact_id: showCloseWon.id,
            tipo: 'cambio_etapa', descripcion: `Cerrado ganado — $${parseFloat(closeWonAmount)?.toLocaleString('es-AR')}`,
            registrado_por: user?.id,
        });
        setShowCloseWon(null);
        setCloseWonAmount('');
    };

    const confirmCloseLost = async () => {
        if (!showCloseLost) return;
        const lostStage = stages.find(s => s.nombre === 'Cerrado perdido');
        if (!lostStage) return;
        await updateContact(showCloseLost.id, {
            etapa_id: lostStage.id,
            motivo_perdida: closeLostReason,
        });
        await supabase.from('comercial_interactions').insert({
            tenant_id: tenant!.id, contact_id: showCloseLost.id,
            tipo: 'cambio_etapa', descripcion: `Cerrado perdido — ${closeLostReason}`,
            registrado_por: user?.id,
        });
        setShowCloseLost(null);
        setCloseLostReason('');
    };

    const updateContact = async (id: string, updates: any) => {
        const { error } = await supabase.from('comercial_contacts')
            .update({ ...updates, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
            .eq('id', id);
        if (!error) {
            setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates, last_activity_at: new Date().toISOString() } : c));
            if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    const createLead = async () => {
        const firstStage = stages.find(s => s.orden === 1) || stages[0];
        if (!firstStage) return;
        const { data, error } = await supabase.from('comercial_contacts').insert({
            ...newLead,
            tenant_id: tenant!.id,
            etapa_id: firstStage.id,
            vendedor_id: user?.id,
            fuente_id: newLead.fuente_id || null,
        }).select().single();
        if (!error && data) {
            setContacts(prev => [data as any, ...prev]);
            setShowNewLeadForm(false);
            setNewLead({ nombre: '', apellido: '', telefono: '', email: '', vehiculo_interes: '', fuente_id: '', prioridad: 'media' });
        }
    };

    const addNote = async () => {
        if (!selectedLead || !noteText.trim()) return;
        await supabase.from('comercial_interactions').insert({
            tenant_id: tenant!.id, contact_id: selectedLead.id,
            tipo: 'nota', descripcion: noteText, registrado_por: user?.id,
        });
        setNoteText('');
        setShowNoteForm(false);
        loadInteractions(selectedLead.id);
        await updateContact(selectedLead.id, {});
    };

    const addReminder = async () => {
        if (!selectedLead || !reminderDate) return;
        await supabase.from('comercial_reminders').insert({
            tenant_id: tenant!.id, contact_id: selectedLead.id,
            fecha: reminderDate, nota: reminderNote, creado_por: user?.id,
        });
        await supabase.from('comercial_interactions').insert({
            tenant_id: tenant!.id, contact_id: selectedLead.id,
            tipo: 'recordatorio', descripcion: `Recordatorio agendado: ${reminderNote}`, registrado_por: user?.id,
        });
        setReminderDate('');
        setReminderNote('');
        setShowReminderForm(false);
        loadInteractions(selectedLead.id);
    };

    const sourceName = (id: string) => sources.find(s => s.id === id)?.nombre || '—';
    const stageName = (id: string) => stages.find(s => s.id === id)?.nombre || '—';
    const stageColor = (id: string) => stages.find(s => s.id === id)?.color || '#6B7280';

    const filteredContacts = contacts.filter(c =>
        !searchTerm || `${c.nombre} ${c.apellido} ${c.vehiculo_interes}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000));

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando pipeline...</div>;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'calc(100vh - 3rem)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Pipeline</h1>
                <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
                    <button onClick={() => setViewMode('kanban')} style={{
                        padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
                        background: viewMode === 'kanban' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'kanban' ? '#fff' : 'var(--color-text-muted)',
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}><Columns3 size={14} /> Kanban</button>
                    <button onClick={() => setViewMode('list')} style={{
                        padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
                        background: viewMode === 'list' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--color-text-muted)',
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}><List size={14} /> Lista</button>
                </div>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar nombre o vehículo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <button onClick={() => setShowNewLeadForm(true)} style={{
                        padding: '0.4rem 1rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                        background: 'var(--color-accent)', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}><Plus size={14} /> Nuevo Lead</button>
                </div>
            </div>

            {/* Kanban View */}
            {viewMode === 'kanban' && (
                <div style={{ display: 'flex', gap: '0.75rem', flex: 1, overflow: 'auto', paddingBottom: '1rem' }}>
                    {stages.map(stage => {
                        const stageContacts = filteredContacts.filter(c => c.etapa_id === stage.id);
                        return (
                            <div key={stage.id}
                                style={{ minWidth: 260, maxWidth: 290, flex: '0 0 270px', display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)' }}
                                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = stage.color; }}
                                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
                                onDrop={e => {
                                    e.preventDefault();
                                    e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                                    if (draggedId) moveToStage(draggedId, stage.id);
                                    setDraggedId(null);
                                }}
                            >
                                {/* Column header */}
                                <div style={{
                                    padding: '0.75rem', borderBottom: `2px solid ${stage.color}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{stage.nombre}</span>
                                    </div>
                                    <span style={{
                                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                                        background: `${stage.color}18`, color: stage.color,
                                    }}>{stageContacts.length}</span>
                                </div>

                                {/* Cards */}
                                <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {stageContacts.map(contact => {
                                        const days = daysSince(contact.last_activity_at);
                                        return (
                                            <div key={contact.id}
                                                draggable
                                                onDragStart={() => setDraggedId(contact.id)}
                                                onDragEnd={() => setDraggedId(null)}
                                                onClick={() => setSelectedLead(contact)}
                                                style={{
                                                    background: 'var(--color-bg-subtle, rgba(255,255,255,0.02))',
                                                    border: '1px solid var(--color-border-subtle)',
                                                    borderRadius: 'var(--radius-sm)', padding: '0.75rem',
                                                    cursor: 'grab', transition: 'box-shadow 0.15s, transform 0.15s',
                                                    opacity: draggedId === contact.id ? 0.5 : 1,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
                                            >
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>
                                                    {contact.nombre} {contact.apellido}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                                                    {contact.vehiculo_interes || 'Sin vehículo especificado'}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        fontSize: '0.65rem', padding: '1px 6px', borderRadius: 99,
                                                        background: 'var(--color-border-subtle)', color: 'var(--color-text-muted)',
                                                    }}>{sourceName(contact.fuente_id)}</span>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[contact.prioridad] || '#F59E0B' }} title={`Prioridad: ${contact.prioridad}`} />
                                                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: days > 3 ? '#EF444420' : 'transparent', color: days > 3 ? '#EF4444' : 'var(--color-text-muted)' }}>
                                                        {days}d
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {stageContacts.length === 0 && (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                            Sin leads
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                {['Nombre', 'Vehículo', 'Fuente', 'Etapa', 'Prioridad', 'Última act.', 'Días'].map(h => (
                                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredContacts.map(c => (
                                <tr key={c.id} onClick={() => setSelectedLead(c)}
                                    style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                                >
                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{c.nombre} {c.apellido}</td>
                                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)' }}>{c.vehiculo_interes}</td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>{sourceName(c.fuente_id)}</td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${stageColor(c.etapa_id)}20`, color: stageColor(c.etapa_id) }}>{stageName(c.etapa_id)}</span>
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[c.prioridad], display: 'inline-block' }} />
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                        {new Date(c.last_activity_at).toLocaleDateString('es-AR')}
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: daysSince(c.last_activity_at) > 3 ? '#EF4444' : 'inherit' }}>
                                        {daysSince(c.last_activity_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ══════════ SLIDE PANEL — Lead Detail ══════════ */}
            {selectedLead && (
                <>
                    <div onClick={() => setSelectedLead(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 90 }} />
                    <div style={{
                        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '100vw',
                        background: 'var(--color-bg-main, #0d1117)', borderLeft: '1px solid var(--color-border-subtle)',
                        zIndex: 100, overflow: 'auto', display: 'flex', flexDirection: 'column',
                        animation: 'slideIn 0.2s ease',
                    }}>
                        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

                        {/* Panel Header */}
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${stageColor(selectedLead.etapa_id)}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontWeight: 700, color: stageColor(selectedLead.etapa_id) }}>
                                    {selectedLead.nombre.charAt(0)}{selectedLead.apellido?.charAt(0) || ''}
                                </span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedLead.nombre} {selectedLead.apellido}</div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${stageColor(selectedLead.etapa_id)}20`, color: stageColor(selectedLead.etapa_id) }}>
                                    {stageName(selectedLead.etapa_id)}
                                </span>
                            </div>
                            <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Contact Info */}
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                            {selectedLead.telefono && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Phone size={13} color="var(--color-text-muted)" />
                                    <a href={`https://wa.me/${selectedLead.telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                                       style={{ color: '#25D366', textDecoration: 'none' }}>{selectedLead.telefono}</a>
                                </div>
                            )}
                            {selectedLead.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@</span>
                                    <a href={`mailto:${selectedLead.email}`} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{selectedLead.email}</a>
                                </div>
                            )}
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Fuente:</span> {sourceName(selectedLead.fuente_id)} {selectedLead.fuente_detalle && ` — ${selectedLead.fuente_detalle}`}</div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Vehículo:</span> <strong>{selectedLead.vehiculo_interes}</strong></div>
                            {(selectedLead.presupuesto_min || selectedLead.presupuesto_max) && (
                                <div><span style={{ color: 'var(--color-text-muted)' }}>Presupuesto:</span> ${selectedLead.presupuesto_min?.toLocaleString('es-AR')} — ${selectedLead.presupuesto_max?.toLocaleString('es-AR')}</div>
                            )}
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Prioridad:</span> <span style={{ fontWeight: 600, color: PRIORITY_COLORS[selectedLead.prioridad] }}>{selectedLead.prioridad}</span></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Primer contacto:</span> {new Date(selectedLead.fecha_primer_contacto).toLocaleDateString('es-AR')}</div>
                        </div>

                        {/* Quick Actions */}
                        <div style={{
                            padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)',
                            display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                        }}>
                            <a href={`https://wa.me/${selectedLead.telefono?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                               style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid #25D366', color: '#25D366', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MessageCircle size={12} /> WhatsApp
                            </a>
                            <button onClick={() => { setShowNoteForm(true); setShowReminderForm(false); }}
                                style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <StickyNote size={12} /> Nota
                            </button>
                            <button onClick={() => { setShowReminderForm(true); setShowNoteForm(false); }}
                                style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={12} /> Recordatorio
                            </button>
                            <select value={selectedLead.etapa_id} onChange={e => moveToStage(selectedLead.id, e.target.value)}
                                className="form-input" style={{ fontSize: '0.75rem', height: 28, padding: '0 0.5rem' }}>
                                {stages.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </div>

                        {/* Note/Reminder forms */}
                        {showNoteForm && (
                            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', gap: '0.5rem' }}>
                                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Escribir nota..."
                                    className="form-input" style={{ flex: 1, minHeight: 50, fontSize: '0.8rem' }} />
                                <button onClick={addNote} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-end' }}>Guardar</button>
                            </div>
                        )}
                        {showReminderForm && (
                            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <input type="datetime-local" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="form-input" style={{ fontSize: '0.8rem', height: 32 }} />
                                <input type="text" value={reminderNote} onChange={e => setReminderNote(e.target.value)} placeholder="Nota del recordatorio..." className="form-input" style={{ fontSize: '0.8rem', height: 32 }} />
                                <button onClick={addReminder} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-end' }}>Agendar</button>
                            </div>
                        )}

                        {/* Timeline */}
                        <div style={{ padding: '1rem', flex: 1, overflow: 'auto' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem' }}>Timeline</div>
                            {interactions.length === 0 ? (
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>Sin interacciones registradas</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 16 }}>
                                    <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--color-border-subtle)' }} />
                                    {interactions.map(i => (
                                        <div key={i.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', position: 'relative' }}>
                                            <div style={{
                                                position: 'absolute', left: -12, top: 12,
                                                width: 10, height: 10, borderRadius: '50%',
                                                background: TIPO_COLORS[i.tipo] || '#6B7280',
                                                border: '2px solid var(--color-bg-main, #0d1117)',
                                                zIndex: 1,
                                            }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 2 }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: TIPO_COLORS[i.tipo] }}>{TIPO_LABELS[i.tipo]}</span>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                                        {new Date(i.created_at).toLocaleDateString('es-AR')} {new Date(i.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, var(--color-text-primary))' }}>{i.descripcion}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ══════════ CLOSE WON MODAL ══════════ */}
            {showCloseWon && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', padding: '1.5rem', width: 360, border: '1px solid var(--color-border-subtle)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#10B981' }}>🎉 Cerrar como Ganado</h3>
                        <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Monto de la operación con <strong>{showCloseWon.nombre} {showCloseWon.apellido}</strong>:</p>
                        <input type="number" value={closeWonAmount} onChange={e => setCloseWonAmount(e.target.value)} placeholder="Monto en pesos" className="form-input" style={{ marginBottom: '1rem', width: '100%' }} />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCloseWon(null)} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}>Cancelar</button>
                            <button onClick={confirmCloseWon} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', background: '#10B981', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ CLOSE LOST MODAL ══════════ */}
            {showCloseLost && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', padding: '1.5rem', width: 360, border: '1px solid var(--color-border-subtle)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: '#EF4444' }}>Cerrar como Perdido</h3>
                        <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Motivo de pérdida para <strong>{showCloseLost.nombre} {showCloseLost.apellido}</strong>:</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                            {MOTIVOS_PERDIDA.map(m => (
                                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                    <input type="radio" name="motivo" value={m} checked={closeLostReason === m} onChange={() => setCloseLostReason(m)} />
                                    {m}
                                </label>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCloseLost(null)} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}>Cancelar</button>
                            <button onClick={confirmCloseLost} disabled={!closeLostReason} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: closeLostReason ? 1 : 0.5 }}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ NEW LEAD MODAL ══════════ */}
            {showNewLeadForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)', padding: '1.5rem', width: 400, border: '1px solid var(--color-border-subtle)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Nuevo Lead</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="text" placeholder="Nombre *" value={newLead.nombre} onChange={e => setNewLead(p => ({ ...p, nombre: e.target.value }))} className="form-input" style={{ flex: 1 }} />
                                <input type="text" placeholder="Apellido" value={newLead.apellido} onChange={e => setNewLead(p => ({ ...p, apellido: e.target.value }))} className="form-input" style={{ flex: 1 }} />
                            </div>
                            <input type="text" placeholder="Teléfono" value={newLead.telefono} onChange={e => setNewLead(p => ({ ...p, telefono: e.target.value }))} className="form-input" />
                            <input type="email" placeholder="Email" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="form-input" />
                            <input type="text" placeholder="Vehículo de interés" value={newLead.vehiculo_interes} onChange={e => setNewLead(p => ({ ...p, vehiculo_interes: e.target.value }))} className="form-input" />
                            <select value={newLead.fuente_id} onChange={e => setNewLead(p => ({ ...p, fuente_id: e.target.value }))} className="form-input">
                                <option value="">Fuente de origen</option>
                                {sources.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                            <select value={newLead.prioridad} onChange={e => setNewLead(p => ({ ...p, prioridad: e.target.value }))} className="form-input">
                                <option value="baja">Prioridad: Baja</option>
                                <option value="media">Prioridad: Media</option>
                                <option value="alta">Prioridad: Alta</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button onClick={() => setShowNewLeadForm(false)} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}>Cancelar</button>
                            <button onClick={createLead} disabled={!newLead.nombre} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: newLead.nombre ? 1 : 0.5 }}>Crear Lead</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
