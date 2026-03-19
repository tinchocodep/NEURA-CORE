import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MessageCircle, Mail, StickyNote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';

interface Stage { id: string; nombre: string; color: string; }
interface Source { id: string; nombre: string; }
interface Contact {
    id: string; nombre: string; apellido: string; telefono: string; email: string;
    vehiculo_interes: string; fuente_id: string; fuente_detalle: string;
    etapa_id: string; prioridad: string; presupuesto_min: number; presupuesto_max: number;
    monto_cierre: number | null; motivo_perdida: string | null;
    fecha_primer_contacto: string; last_activity_at: string; tags: string[];
    created_at: string;
}
interface Interaction {
    id: string; tipo: string; descripcion: string; created_at: string;
}

const TIPO_COLORS: Record<string, string> = {
    mensaje_entrante: '#3B82F6', respuesta_enviada: '#0D9488', llamada: '#F97316',
    visita: '#10B981', nota: '#6B7280', recordatorio: '#EF4444', cambio_etapa: '#8B5CF6',
};
const TIPO_LABELS: Record<string, string> = {
    mensaje_entrante: 'Mensaje entrante', respuesta_enviada: 'Respuesta enviada',
    llamada: 'Llamada', visita: 'Visita', nota: 'Nota interna',
    recordatorio: 'Recordatorio', cambio_etapa: 'Cambio de etapa',
};
const PRIORITY_COLORS: Record<string, string> = { baja: '#10B981', media: '#F59E0B', alta: '#EF4444' };

export default function ComercialContactoDetalle() {
    const { id } = useParams();
    const { tenant } = useTenant();
    const { user } = useAuth() as any;
    const navigate = useNavigate();
    const [contact, setContact] = useState<Contact | null>(null);
    const [stages, setStages] = useState<Stage[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'timeline' | 'notas'>('timeline');

    // Quick action forms
    const [showNoteForm, setShowNoteForm] = useState(false);
    const [noteText, setNoteText] = useState('');

    useEffect(() => {
        if (!tenant || !id) return;
        loadData();
    }, [tenant, id]);

    const loadData = async () => {
        setLoading(true);
        const [cRes, stRes, srcRes, iRes] = await Promise.all([
            supabase.from('comercial_contacts').select('*').eq('id', id!).single(),
            supabase.from('comercial_pipeline_stages').select('id, nombre, color').eq('tenant_id', tenant!.id).order('orden'),
            supabase.from('comercial_sources').select('id, nombre').eq('tenant_id', tenant!.id),
            supabase.from('comercial_interactions').select('*').eq('contact_id', id!).order('created_at', { ascending: false }),
        ]);
        if (cRes.data) setContact(cRes.data as any);
        if (stRes.data) setStages(stRes.data);
        if (srcRes.data) setSources(srcRes.data);
        if (iRes.data) setInteractions(iRes.data);
        setLoading(false);
    };

    const stageName = (sid: string) => stages.find(s => s.id === sid)?.nombre || '—';
    const stageColor = (sid: string) => stages.find(s => s.id === sid)?.color || '#6B7280';
    const sourceName = (sid: string) => sources.find(s => s.id === sid)?.nombre || '—';

    const addNote = async () => {
        if (!contact || !noteText.trim()) return;
        await supabase.from('comercial_interactions').insert({
            tenant_id: tenant!.id, contact_id: contact.id,
            tipo: 'nota', descripcion: noteText, registrado_por: user?.id,
        });
        setNoteText('');
        setShowNoteForm(false);
        loadData();
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;
    if (!contact) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Contacto no encontrado</div>;

    const notes = interactions.filter(i => i.tipo === 'nota');
    const displayInteractions = activeTab === 'notas' ? notes : interactions;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => navigate('/comercial/contactos')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 4 }}>
                    <ArrowLeft size={18} />
                </button>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${stageColor(contact.etapa_id)}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: stageColor(contact.etapa_id) }}>
                        {contact.nombre.charAt(0)}{contact.apellido?.charAt(0) || ''}
                    </span>
                </div>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{contact.nombre} {contact.apellido}</h1>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: `${stageColor(contact.etapa_id)}20`, color: stageColor(contact.etapa_id) }}>
                        {stageName(contact.etapa_id)}
                    </span>
                </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                {contact.telefono && (
                    <a href={`https://wa.me/${contact.telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                       style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #25D366', color: '#25D366', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MessageCircle size={14} /> WhatsApp
                    </a>
                )}
                {contact.telefono && (
                    <a href={`tel:${contact.telefono}`}
                       style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-primary)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={14} /> Llamar
                    </a>
                )}
                {contact.email && (
                    <a href={`mailto:${contact.email}`}
                       style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-primary)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={14} /> Email
                    </a>
                )}
                <button onClick={() => setShowNoteForm(!showNoteForm)}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <StickyNote size={14} /> Agregar nota
                </button>
            </div>

            {/* Note form */}
            {showNoteForm && (
                <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Escribir nota..."
                        className="form-input" style={{ flex: 1, minHeight: 60, fontSize: '0.85rem' }} />
                    <button onClick={addNote} style={{ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', alignSelf: 'flex-end' }}>Guardar</button>
                </div>
            )}

            {/* Main Content - 2 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem' }}>
                {/* Left - Contact Info */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>Información</div>
                    
                    {[
                        { label: 'Teléfono', value: contact.telefono },
                        { label: 'Email', value: contact.email },
                        { label: 'Fuente', value: `${sourceName(contact.fuente_id)}${contact.fuente_detalle ? ` — ${contact.fuente_detalle}` : ''}` },
                        { label: 'Vehículo', value: contact.vehiculo_interes, bold: true },
                        { label: 'Presupuesto', value: (contact.presupuesto_min || contact.presupuesto_max) ? `$${contact.presupuesto_min?.toLocaleString('es-AR')} — $${contact.presupuesto_max?.toLocaleString('es-AR')}` : '—' },
                        { label: 'Prioridad', value: contact.prioridad, color: PRIORITY_COLORS[contact.prioridad] },
                        { label: 'Primer contacto', value: new Date(contact.fecha_primer_contacto).toLocaleDateString('es-AR') },
                        { label: 'Última actividad', value: new Date(contact.last_activity_at).toLocaleDateString('es-AR') },
                    ].map(({ label, value, bold, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                            <span style={{ fontWeight: bold ? 700 : 400, color: color || 'inherit', textAlign: 'right', maxWidth: '60%' }}>{value || '—'}</span>
                        </div>
                    ))}

                    {contact.monto_cierre && (
                        <div style={{ padding: '0.5rem', background: '#10B98118', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#10B981', fontWeight: 600 }}>Monto cierre</span>
                            <span style={{ fontWeight: 700, color: '#10B981' }}>${contact.monto_cierre.toLocaleString('es-AR')}</span>
                        </div>
                    )}
                    {contact.motivo_perdida && (
                        <div style={{ padding: '0.5rem', background: '#EF444418', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#EF4444', fontWeight: 600 }}>Motivo perdida</span>
                            <span style={{ color: '#EF4444' }}>{contact.motivo_perdida}</span>
                        </div>
                    )}

                    {contact.tags && contact.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            {contact.tags.map(t => (
                                <span key={t} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 99, background: 'var(--color-accent-dim, rgba(99,102,241,0.1))', color: 'var(--color-accent)' }}>{t}</span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right - Timeline / Notes */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {[
                            { key: 'timeline', label: 'Timeline', count: interactions.length },
                            { key: 'notas', label: 'Notas', count: notes.length },
                        ].map(tab => (
                            <button key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                style={{
                                    padding: '0.75rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
                                    fontSize: '0.85rem', fontWeight: activeTab === tab.key ? 600 : 400,
                                    color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                    borderBottom: activeTab === tab.key ? `2px solid var(--color-accent)` : '2px solid transparent',
                                }}>
                                {tab.label} <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>({tab.count})</span>
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                        {displayInteractions.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                Sin {activeTab === 'notas' ? 'notas' : 'interacciones'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 20 }}>
                                <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--color-border-subtle)' }} />
                                {displayInteractions.map(i => (
                                    <div key={i.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.6rem 0', position: 'relative' }}>
                                        <div style={{
                                            position: 'absolute', left: -16, top: 14,
                                            width: 12, height: 12, borderRadius: '50%',
                                            background: TIPO_COLORS[i.tipo] || '#6B7280',
                                            border: '2px solid var(--color-bg-card)',
                                            zIndex: 1,
                                        }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: TIPO_COLORS[i.tipo] }}>{TIPO_LABELS[i.tipo]}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                                    {new Date(i.created_at).toLocaleDateString('es-AR')} {new Date(i.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>{i.descripcion}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
