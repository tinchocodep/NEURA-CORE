import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Building2, FileText, AlertTriangle, DollarSign, TrendingUp, Calendar } from 'lucide-react';

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

// Fix leaflet default marker icons with Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

function createPin(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

interface Propiedad {
  id: string; estado: string; precio_alquiler: number | null; precio_venta: number | null; moneda: string;
  direccion: string; tipo: string; latitud: number | null; longitud: number | null;
}
interface Contrato {
  id: string; fecha_fin: string; estado: string; monto_mensual: number;
  propiedad: { direccion: string } | null;
  inquilino: { razon_social: string } | null;
}
interface Vencimiento {
  id: string; tipo: string; fecha: string; descripcion: string; completado: boolean;
}
interface CuentaCorriente {
  id: string; monto: number; tipo: string;
}

const ESTADO_COLOR: Record<string, string> = {
  disponible: '#EF4444', alquilada: '#10B981', en_venta: '#F59E0B',
  reservada: '#8B5CF6', en_refaccion: '#6B7280',
};
const VENC_COLOR: Record<string, string> = {
  contrato_vence: '#EF4444', pago_pendiente: '#F59E0B',
  ajuste_alquiler: '#3B82F6', habilitacion: '#8B5CF6', otro: '#6B7280',
};

export default function Dashboard() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [vencimientos, setVencimientos] = useState<Vencimiento[]>([]);
  const [cuentas, setCuentas] = useState<CuentaCorriente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;
    loadData();
  }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [pRes, cRes, vRes, ccRes] = await Promise.all([
      supabase.from('inmobiliaria_propiedades').select('id, estado, precio_alquiler, precio_venta, moneda, direccion, tipo, latitud, longitud').eq('tenant_id', tenant!.id),
      supabase.from('inmobiliaria_contratos')
        .select('id, fecha_fin, estado, monto_mensual, propiedad:inmobiliaria_propiedades(direccion), inquilino:contable_clientes!inquilino_id(razon_social)')
        .eq('tenant_id', tenant!.id),
      supabase.from('inmobiliaria_vencimientos').select('*').eq('tenant_id', tenant!.id).eq('completado', false).order('fecha').limit(15),
      supabase.from('inmobiliaria_cuentas_corrientes').select('id, monto, tipo').eq('tenant_id', tenant!.id),
    ]);
    if (pRes.data) setPropiedades(pRes.data);
    if (cRes.data) setContratos(cRes.data as any);
    if (vRes.data) setVencimientos(vRes.data);
    if (ccRes.data) setCuentas(ccRes.data);
    setLoading(false);
  };

  const totalProps = propiedades.length;
  const alquiladas = propiedades.filter(p => p.estado === 'alquilada').length;
  const ocupacion = totalProps > 0 ? Math.round((alquiladas / totalProps) * 100) : 0;
  const vigentes = contratos.filter(c => c.estado === 'vigente');
  const morosidad = cuentas.filter(c => c.tipo === 'inquilino' && c.monto > 0).reduce((s, c) => s + c.monto, 0);
  const valorPortfolio = propiedades.reduce((s, p) => s + (p.precio_venta || (p.precio_alquiler || 0) * 100), 0);

  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const porVencer = vigentes.filter(c => {
    const fin = new Date(c.fecha_fin);
    return fin >= now && fin <= in30;
  });

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

  const kpis = [
    { label: 'Propiedades', value: totalProps, icon: Building2, color: '#3B82F6' },
    { label: 'Ocupacion', value: `${ocupacion}%`, icon: TrendingUp, color: '#10B981' },
    { label: 'Contratos vigentes', value: vigentes.length, icon: FileText, color: '#8B5CF6' },
    { label: 'Morosidad', value: `$${morosidad.toLocaleString('es-AR')}`, icon: AlertTriangle, color: '#EF4444' },
    { label: 'Valor portfolio', value: `$${(valorPortfolio / 1000000).toFixed(1)}M`, icon: DollarSign, color: '#F59E0B' },
  ];

  return (
    <div style={{ padding: isMobile ? '0' : '1.5rem', display: 'flex', flexDirection: 'column', gap: isMobile ? '0.5rem' : '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Gestor</h1>
        {!isMobile && <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Dashboard de gestión de propiedades y contratos.</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: isMobile ? '0.5rem' : '1rem' }}>
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)', padding: isMobile ? '0.75rem' : '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: isMobile ? '0.25rem' : '0.75rem' }}>
              <div style={{ width: isMobile ? 28 : 40, height: isMobile ? 28 : 40, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={isMobile ? 14 : 20} color={color} />
              </div>
              {isMobile && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{label}</span>}
            </div>
            <div style={{ fontSize: isMobile ? '1.125rem' : '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1, marginBottom: isMobile ? 0 : '0.25rem' }}>{value}</div>
            {!isMobile && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</span>}
          </div>
        ))}
      </div>

      {/* Mapa de propiedades */}
      {(() => {
        const conUbicacion = propiedades.filter(p => p.latitud && p.longitud);
        if (conUbicacion.length === 0) return null;
        const center: [number, number] = [conUbicacion[0].latitud!, conUbicacion[0].longitud!];
        return (
          <div className="card" style={{ overflow: 'hidden', position: 'relative', zIndex: 0 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Mapa de Propiedades</span>
              <div style={{ display: 'flex', gap: 12, fontSize: '0.6875rem' }}>
                {Object.entries(ESTADO_COLOR).map(([est, col]) => {
                  const c = propiedades.filter(p => p.estado === est).length;
                  if (c === 0) return null;
                  return (
                    <span key={est} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'inline-block' }} />
                      <span style={{ textTransform: 'capitalize' }}>{est.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700 }}>{c}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ height: isMobile ? 200 : 340 }}>
              <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>' />
                {conUbicacion.map(p => (
                  <Marker key={p.id} position={[p.latitud!, p.longitud!]} icon={createPin(ESTADO_COLOR[p.estado] || '#6B7280')}>
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.direccion}</div>
                        <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'capitalize', marginBottom: 4 }}>{p.tipo}</div>
                        <span style={{ background: ESTADO_COLOR[p.estado], color: 'white', padding: '1px 6px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600 }}>
                          {p.estado.replace(/_/g, ' ')}
                        </span>
                        {p.precio_alquiler && <div style={{ marginTop: 4, fontSize: '0.8rem' }}>Alquiler: ${p.precio_alquiler.toLocaleString('es-AR')}</div>}
                        {p.precio_venta && <div style={{ marginTop: 2, fontSize: '0.8rem' }}>Venta: USD {p.precio_venta.toLocaleString('es-AR')}</div>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.75rem' : '1.5rem' }}>
        {/* Proximos vencimientos */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={16} color="var(--color-text-muted)" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Proximos vencimientos</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {vencimientos.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin vencimientos pendientes</div>
            ) : vencimientos.map(v => {
              const isOverdue = new Date(v.fecha) < now;
              return (
                <div key={v.id} style={{
                  padding: '0.6rem 1rem', borderBottom: '1px solid var(--color-border-subtle)',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: isOverdue ? '#EF444408' : 'transparent',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: VENC_COLOR[v.tipo] || '#6B7280', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.descripcion}</div>
                    <div style={{ fontSize: '0.7rem', color: isOverdue ? '#EF4444' : 'var(--color-text-muted)' }}>
                      {new Date(v.fecha).toLocaleDateString('es-AR')}
                      {isOverdue && ' — VENCIDO'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contratos por vencer */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} color="#F59E0B" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Contratos por vencer (30 dias)</span>
            {porVencer.length > 0 && (
              <span style={{ marginLeft: 'auto', background: '#F59E0B20', color: '#F59E0B', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                {porVencer.length}
              </span>
            )}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {porVencer.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin contratos por vencer</div>
            ) : porVencer.map(c => {
              const dias = Math.ceil((new Date(c.fecha_fin).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
              return (
                <div key={c.id} style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{(c.propiedad as any)?.direccion || '—'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{(c.inquilino as any)?.razon_social || '—'}</div>
                  </div>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: dias <= 7 ? '#EF444420' : '#F59E0B20',
                    color: dias <= 7 ? '#EF4444' : '#F59E0B',
                  }}>
                    {dias}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Estado propiedades chart */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>Estado de propiedades</div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {Object.entries(ESTADO_COLOR).map(([estado, color]) => {
            const count = propiedades.filter(p => p.estado === estado).length;
            if (count === 0) return null;
            return (
              <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
                <span style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{estado.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
