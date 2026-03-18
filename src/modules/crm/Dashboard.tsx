import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Building2, Users, TrendingUp, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

// Fix leaflet default marker icons with Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

interface Obra {
    id: string;
    nombre: string;
    estado: string;
    avance: number;
    latitud: number | null;
    longitud: number | null;
    direccion: string | null;
    cliente: { razon_social: string } | null;
}

interface Prospecto {
    id: string;
    nombre: string;
    etapa: string;
    monto_estimado: number | null;
    created_at: string;
}

const ETAPA_COLORS: Record<string, string> = {
    nuevo: '#6366f1',
    contactado: '#3b82f6',
    propuesta: '#f59e0b',
    negociacion: '#8b5cf6',
    ganado: '#10b981',
    perdido: '#ef4444',
};

const ESTADO_COLORS: Record<string, string> = {
    activa: '#10b981',
    pausada: '#f59e0b',
    terminada: '#6366f1',
    cancelada: '#ef4444',
};

function createColoredMarker(color: string) {
    return L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

export default function CRMDashboard() {
    const { tenant } = useTenant();
    const [obras, setObras] = useState<Obra[]>([]);
    const [prospectos, setProspectos] = useState<Prospecto[]>([]);
    const [contactosCount, setContactosCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [obrasRes, prospectosRes, contactosRes] = await Promise.all([
            supabase.from('crm_obras').select('id, nombre, estado, avance, latitud, longitud, direccion, cliente:contable_clientes(razon_social)').eq('tenant_id', tenant!.id),
            supabase.from('crm_prospectos').select('id, nombre, etapa, monto_estimado, created_at').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }).limit(8),
            supabase.from('crm_contactos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('activo', true),
        ]);
        if (obrasRes.data) setObras(obrasRes.data as any);
        if (prospectosRes.data) setProspectos(prospectosRes.data);
        setContactosCount(contactosRes.count || 0);
        setLoading(false);
    };

    const obrasActivas = obras.filter(o => o.estado === 'activa').length;
    const obrasTerminadas = obras.filter(o => o.estado === 'terminada').length;
    const prospectosActivos = prospectos.filter(p => p.etapa !== 'ganado' && p.etapa !== 'perdido').length;
    const ganados = prospectos.filter(p => p.etapa === 'ganado').length;
    const totalProspectos = prospectos.filter(p => p.etapa === 'ganado' || p.etapa === 'perdido').length;
    const conversion = totalProspectos > 0 ? Math.round((ganados / totalProspectos) * 100) : 0;

    const obrasConUbicacion = obras.filter(o => o.latitud && o.longitud);
    const mapCenter: [number, number] = obrasConUbicacion.length > 0
        ? [obrasConUbicacion[0].latitud!, obrasConUbicacion[0].longitud!]
        : [-34.6037, -58.3816]; // Buenos Aires default

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

    return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>CRM</h1>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Visión general de obras, prospectos y contactos.</p>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                {[
                    { label: 'Obras Activas', value: obrasActivas, icon: Building2, color: '#10b981' },
                    { label: 'Obras Terminadas', value: obrasTerminadas, icon: CheckCircle, color: '#6366f1' },
                    { label: 'Prospectos Activos', value: prospectosActivos, icon: TrendingUp, color: '#f59e0b' },
                    { label: 'Contactos', value: contactosCount, icon: Users, color: '#3b82f6' },
                    { label: 'Conversión', value: `${conversion}%`, icon: TrendingUp, color: '#8b5cf6' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={18} color={color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Map + Prospectos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
                {/* Mapa de obras */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Mapa de Obras</span>
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                            {Object.entries(ESTADO_COLORS).map(([estado, color]) => (
                                <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                                    {estado.charAt(0).toUpperCase() + estado.slice(1)}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ height: 380 }}>
                        <MapContainer center={mapCenter} zoom={obrasConUbicacion.length > 0 ? 13 : 5} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                            />
                            {obrasConUbicacion.map(obra => (
                                <Marker
                                    key={obra.id}
                                    position={[obra.latitud!, obra.longitud!]}
                                    icon={createColoredMarker(ESTADO_COLORS[obra.estado] || '#6366f1')}
                                >
                                    <Popup>
                                        <div style={{ minWidth: 160 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{obra.nombre}</div>
                                            {obra.cliente && <div style={{ fontSize: '0.8rem', color: '#666' }}>{(obra.cliente as any).razon_social}</div>}
                                            <div style={{ marginTop: 6, fontSize: '0.8rem' }}>
                                                <span style={{ background: ESTADO_COLORS[obra.estado], color: 'white', padding: '1px 6px', borderRadius: 99, fontSize: '0.7rem' }}>{obra.estado}</span>
                                                <span style={{ marginLeft: 8 }}>Avance: {obra.avance}%</span>
                                            </div>
                                            {obra.direccion && <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#888' }}>{obra.direccion}</div>}
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                    {obrasConUbicacion.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                            Agregá ubicación a las obras para verlas en el mapa
                        </div>
                    )}
                </div>

                {/* Prospectos recientes */}
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Prospectos Recientes</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                        {prospectos.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin prospectos cargados</div>
                        ) : (
                            prospectos.map(p => (
                                <div key={p.id} style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{
                                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                                        background: `${ETAPA_COLORS[p.etapa] || '#6366f1'}20`,
                                        color: ETAPA_COLORS[p.etapa] || '#6366f1',
                                        flexShrink: 0, whiteSpace: 'nowrap'
                                    }}>{p.etapa}</span>
                                    <span style={{ fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                                    {p.monto_estimado && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                                            ${p.monto_estimado.toLocaleString('es-AR')}
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Resumen de obras */}
            {obras.length > 0 && (
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Estado de Obras</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {obras.slice(0, 6).map(obra => (
                            <div key={obra.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLORS[obra.estado], flexShrink: 0 }} />
                                <span style={{ fontSize: '0.875rem', flex: '1 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obra.nombre}</span>
                                {obra.cliente && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flex: '1 1 150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(obra.cliente as any).razon_social}</span>}
                                <div style={{ flex: '0 0 160px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ flex: 1, height: 6, background: 'var(--color-border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${obra.avance}%`, background: obra.avance >= 100 ? '#10b981' : '#6366f1', borderRadius: 99 }} />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: 32, textAlign: 'right' }}>{obra.avance}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
