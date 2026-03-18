import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, Upload, Trash2, FileText, ExternalLink, MapPin, X, Edit2 } from 'lucide-react';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

interface Cliente { id: string; razon_social: string; }
interface Contacto { id: string; nombre: string; apellido: string | null; }
interface Archivo { id: string; nombre: string; tipo: string; url: string; created_at: string; }
interface Obra {
    id: string;
    nombre: string;
    descripcion: string | null;
    estado: string;
    avance: number;
    fecha_inicio: string | null;
    fecha_fin_estimada: string | null;
    monto_contrato: number | null;
    cliente_id: string | null;
    contacto_id: string | null;
    latitud: number | null;
    longitud: number | null;
    direccion: string | null;
    cliente: Cliente | null;
    contacto: Contacto | null;
}

const ESTADOS = [
    { id: 'activa', label: 'Activa', color: '#10b981' },
    { id: 'pausada', label: 'Pausada', color: '#f59e0b' },
    { id: 'terminada', label: 'Terminada', color: '#6366f1' },
    { id: 'cancelada', label: 'Cancelada', color: '#ef4444' },
];
const TIPOS_ARCHIVO = ['presupuesto', 'plano', 'contrato', 'certificado', 'otro'];
const EMPTY_OBRA: Partial<Obra> = { nombre: '', descripcion: '', estado: 'activa', avance: 0, monto_contrato: undefined, cliente_id: null, contacto_id: null, latitud: null, longitud: null, direccion: '' };

// Component to pick location on map click
function LocationPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
    useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
    return null;
}

function EstadoBadge({ estado }: { estado: string }) {
    const e = ESTADOS.find(s => s.id === estado);
    return <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${e?.color || '#6366f1'}20`, color: e?.color || '#6366f1' }}>{e?.label || estado}</span>;
}

export default function CRMObras() {
    const { tenant } = useTenant();
    const [obras, setObras] = useState<Obra[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [contactos, setContactos] = useState<Contacto[]>([]);
    const [archivos, setArchivos] = useState<Archivo[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Obra | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Obra>>(EMPTY_OBRA);
    const [saving, setSaving] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [filtroEstado, setFiltroEstado] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (tenant) loadData(); }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [obrasRes, clientesRes, contactosRes] = await Promise.all([
            supabase.from('crm_obras').select('*, cliente:contable_clientes(id, razon_social), contacto:crm_contactos(id, nombre, apellido)').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
            supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id).eq('activo', true).order('razon_social'),
            supabase.from('crm_contactos').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
        ]);
        if (obrasRes.data) setObras(obrasRes.data as any);
        if (clientesRes.data) setClientes(clientesRes.data);
        if (contactosRes.data) setContactos(contactosRes.data);
        setLoading(false);
    };

    const loadArchivos = async (obraId: string) => {
        const { data } = await supabase.from('crm_obras_archivos').select('*').eq('obra_id', obraId).order('created_at', { ascending: false });
        setArchivos(data || []);
    };

    const selectObra = (obra: Obra) => {
        setSelected(obra);
        loadArchivos(obra.id);
    };

    const openCreate = () => { setEditing({ ...EMPTY_OBRA }); setShowModal(true); };
    const openEdit = (o: Obra) => { setEditing({ ...o }); setShowModal(true); };

    const handleSave = async () => {
        if (!editing.nombre?.trim()) return;
        setSaving(true);
        const payload = {
            nombre: editing.nombre!.trim(),
            descripcion: editing.descripcion || null,
            estado: editing.estado || 'activa',
            avance: editing.avance ?? 0,
            fecha_inicio: editing.fecha_inicio || null,
            fecha_fin_estimada: editing.fecha_fin_estimada || null,
            monto_contrato: editing.monto_contrato || null,
            cliente_id: editing.cliente_id || null,
            contacto_id: editing.contacto_id || null,
            latitud: editing.latitud || null,
            longitud: editing.longitud || null,
            direccion: editing.direccion || null,
            tenant_id: tenant!.id,
            updated_at: new Date().toISOString(),
        };
        if (editing.id) {
            await supabase.from('crm_obras').update(payload).eq('id', editing.id);
        } else {
            await supabase.from('crm_obras').insert(payload);
        }
        setSaving(false);
        setShowModal(false);
        await loadData();
        // refresh selected if editing
        if (editing.id && selected?.id === editing.id) {
            const updated = obras.find(o => o.id === editing.id);
            if (updated) setSelected({ ...updated, ...payload } as any);
        }
    };

    const actualizarAvance = async (obraId: string, avance: number) => {
        await supabase.from('crm_obras').update({ avance, updated_at: new Date().toISOString() }).eq('id', obraId);
        setObras(prev => prev.map(o => o.id === obraId ? { ...o, avance } : o));
        if (selected?.id === obraId) setSelected(prev => prev ? { ...prev, avance } : null);
    };

    const eliminarObra = async (id: string) => {
        if (!confirm('¿Eliminar esta obra? Se eliminarán también sus archivos.')) return;
        await supabase.from('crm_obras').delete().eq('id', id);
        setObras(prev => prev.filter(o => o.id !== id));
        if (selected?.id === id) setSelected(null);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0] || !selected) return;
        const file = e.target.files[0];
        const tipoSelect = (document.getElementById('tipo-archivo') as HTMLSelectElement)?.value || 'presupuesto';
        setUploadingFile(true);
        const path = `${tenant!.id}/${selected.id}/${Date.now()}_${file.name}`;
        const { data: uploaded, error } = await supabase.storage.from('crm-archivos').upload(path, file);
        if (!error && uploaded) {
            const { data: urlData } = supabase.storage.from('crm-archivos').getPublicUrl(path);
            await supabase.from('crm_obras_archivos').insert({
                obra_id: selected.id,
                tenant_id: tenant!.id,
                nombre: file.name,
                tipo: tipoSelect,
                url: urlData.publicUrl,
            });
            loadArchivos(selected.id);
        }
        setUploadingFile(false);
        e.target.value = '';
    };

    const eliminarArchivo = async (archivo: Archivo) => {
        if (!confirm('¿Eliminar archivo?')) return;
        await supabase.from('crm_obras_archivos').delete().eq('id', archivo.id);
        setArchivos(prev => prev.filter(a => a.id !== archivo.id));
    };

    const filtradas = filtroEstado ? obras.filter(o => o.estado === filtroEstado) : obras;
    const estadoColor = (estado: string) => ESTADOS.find(e => e.id === estado)?.color || '#6366f1';

    if (loading) return <div style={{ padding: '1.5rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', height: 'calc(100vh - 60px)' }}>
            {/* Lista de obras */}
            <div style={{ flex: selected ? '0 0 360px' : '1', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 2 }}>Obras</h1>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{obras.length} obras</p>
                    </div>
                    <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={16} /> Nueva Obra
                    </button>
                </div>

                {/* Filtro por estado */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={() => setFiltroEstado('')} style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 99, border: `1px solid ${!filtroEstado ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, background: !filtroEstado ? 'var(--color-accent-dim)' : 'none', cursor: 'pointer', color: !filtroEstado ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: !filtroEstado ? 700 : 400 }}>
                        Todas
                    </button>
                    {ESTADOS.map(e => (
                        <button key={e.id} onClick={() => setFiltroEstado(e.id)} style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 99, border: `1px solid ${filtroEstado === e.id ? e.color : 'var(--color-border-subtle)'}`, background: filtroEstado === e.id ? `${e.color}20` : 'none', cursor: 'pointer', color: filtroEstado === e.id ? e.color : 'var(--color-text-muted)', fontWeight: filtroEstado === e.id ? 700 : 400 }}>
                            {e.label}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: 2 }}>
                    {filtradas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>No hay obras. Creá la primera.</div>
                    ) : filtradas.map(o => (
                        <div
                            key={o.id}
                            onClick={() => selectObra(o)}
                            style={{
                                background: 'var(--color-bg-card)',
                                border: `1px solid ${selected?.id === o.id ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                                borderRadius: 'var(--radius-md)',
                                padding: '0.875rem',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1, paddingRight: 8 }}>{o.nombre}</div>
                                <EstadoBadge estado={o.estado} />
                            </div>
                            {o.cliente && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{(o.cliente as any).razon_social}</div>}
                            {o.direccion && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 3, marginBottom: '0.5rem' }}><MapPin size={11} />{o.direccion}</div>}
                            {/* Progress bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ flex: 1, height: 5, background: 'var(--color-border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${o.avance}%`, background: o.avance >= 100 ? '#10b981' : estadoColor(o.estado), borderRadius: 99, transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', width: 30, textAlign: 'right' }}>{o.avance}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Panel de detalle */}
            {selected && (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{selected.nombre}</h2>
                            <EstadoBadge estado={selected.estado} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-ghost btn-icon" onClick={() => openEdit(selected)} title="Editar"><Edit2 size={15} /></button>
                            <button className="btn btn-ghost btn-icon" onClick={() => eliminarObra(selected.id)} title="Eliminar" style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>
                            <button className="btn btn-ghost btn-icon" onClick={() => setSelected(null)} title="Cerrar"><X size={15} /></button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Info grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.85rem' }}>
                            {selected.cliente && <div><span style={{ color: 'var(--color-text-muted)' }}>Cliente: </span><span style={{ fontWeight: 600 }}>{(selected.cliente as any).razon_social}</span></div>}
                            {selected.contacto && <div><span style={{ color: 'var(--color-text-muted)' }}>Contacto: </span><span style={{ fontWeight: 600 }}>{selected.contacto.nombre} {selected.contacto.apellido || ''}</span></div>}
                            {selected.monto_contrato && <div><span style={{ color: 'var(--color-text-muted)' }}>Contrato: </span><span style={{ fontWeight: 600 }}>${selected.monto_contrato.toLocaleString('es-AR')}</span></div>}
                            {selected.fecha_inicio && <div><span style={{ color: 'var(--color-text-muted)' }}>Inicio: </span><span>{selected.fecha_inicio}</span></div>}
                            {selected.fecha_fin_estimada && <div><span style={{ color: 'var(--color-text-muted)' }}>Fin est.: </span><span>{selected.fecha_fin_estimada}</span></div>}
                        </div>

                        {selected.descripcion && <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{selected.descripcion}</p>}

                        {/* Avance */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                <span>Avance de obra</span>
                                <span>{selected.avance}%</span>
                            </div>
                            <input
                                type="range" min={0} max={100} step={5}
                                value={selected.avance}
                                onChange={e => actualizarAvance(selected.id, parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: estadoColor(selected.estado) }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                            </div>
                        </div>

                        {/* Mapa de ubicación */}
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={14} /> Ubicación
                                {!selected.latitud && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>— Hacé clic en el mapa para fijar</span>}
                            </div>
                            {selected.direccion && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{selected.direccion}</div>}
                            <div style={{ height: 200, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
                                <MapContainer
                                    center={selected.latitud ? [selected.latitud, selected.longitud!] : [-34.6037, -58.3816]}
                                    zoom={selected.latitud ? 15 : 5}
                                    style={{ height: '100%', width: '100%' }}
                                    scrollWheelZoom={false}
                                >
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                                    <LocationPicker onPick={async (lat, lng) => {
                                        await supabase.from('crm_obras').update({ latitud: lat, longitud: lng }).eq('id', selected.id);
                                        setSelected(prev => prev ? { ...prev, latitud: lat, longitud: lng } : null);
                                        setObras(prev => prev.map(o => o.id === selected.id ? { ...o, latitud: lat, longitud: lng } : o));
                                    }} />
                                    {selected.latitud && <Marker position={[selected.latitud, selected.longitud!]} />}
                                </MapContainer>
                            </div>
                        </div>

                        {/* Archivos / Presupuestos */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Archivos y Presupuestos</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <select id="tipo-archivo" className="form-input" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', height: 'auto' }}>
                                        {TIPOS_ARCHIVO.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                    </select>
                                    <button
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingFile}
                                    >
                                        <Upload size={13} /> {uploadingFile ? 'Subiendo...' : 'Subir'}
                                    </button>
                                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                                </div>
                            </div>
                            {archivos.length === 0 ? (
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin archivos adjuntos</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {archivos.map(a => (
                                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: 'var(--color-bg-surface, #f8fafc)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', fontSize: '0.8rem' }}>
                                            <FileText size={13} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0, background: 'var(--color-border-subtle)', padding: '1px 6px', borderRadius: 99 }}>{a.tipo}</span>
                                            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', flexShrink: 0 }} title="Abrir"><ExternalLink size={12} /></a>
                                            <button onClick={() => eliminarArchivo(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', flexShrink: 0 }} title="Eliminar"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal crear/editar */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
                    <div style={{ background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>{editing.id ? 'Editar Obra' : 'Nueva Obra'}</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Nombre *</label>
                                <input className="form-input" value={editing.nombre || ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Estado</label>
                                <select className="form-input" value={editing.estado || 'activa'} onChange={e => setEditing(p => ({ ...p, estado: e.target.value }))}>
                                    {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Avance (%)</label>
                                <input className="form-input" type="number" min={0} max={100} value={editing.avance ?? 0} onChange={e => setEditing(p => ({ ...p, avance: parseInt(e.target.value) || 0 }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Cliente</label>
                                <select className="form-input" value={editing.cliente_id || ''} onChange={e => setEditing(p => ({ ...p, cliente_id: e.target.value || null }))}>
                                    <option value="">Sin cliente</option>
                                    {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Contacto</label>
                                <select className="form-input" value={editing.contacto_id || ''} onChange={e => setEditing(p => ({ ...p, contacto_id: e.target.value || null }))}>
                                    <option value="">Sin contacto</option>
                                    {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Fecha Inicio</label>
                                <input className="form-input" type="date" value={editing.fecha_inicio || ''} onChange={e => setEditing(p => ({ ...p, fecha_inicio: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Fin Estimado</label>
                                <input className="form-input" type="date" value={editing.fecha_fin_estimada || ''} onChange={e => setEditing(p => ({ ...p, fecha_fin_estimada: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Monto Contrato ($)</label>
                                <input className="form-input" type="number" value={editing.monto_contrato || ''} onChange={e => setEditing(p => ({ ...p, monto_contrato: parseFloat(e.target.value) || undefined }))} />
                            </div>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Dirección</label>
                                <input className="form-input" value={editing.direccion || ''} onChange={e => setEditing(p => ({ ...p, direccion: e.target.value }))} placeholder="Calle, número, ciudad" />
                            </div>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Descripción</label>
                                <textarea className="form-input" rows={3} value={editing.descripcion || ''} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} style={{ resize: 'vertical' }} />
                            </div>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>💡 La ubicación exacta se puede fijar en el mapa desde el detalle de la obra.</p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
