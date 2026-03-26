import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
// Google Maps loaded via script tag
import { MapPin, Search, Eye, FileSignature, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Propiedad {
  id: string; direccion: string; tipo: string; estado: string;
  localidad: string | null; provincia: string | null;
  precio_alquiler: number | null; precio_venta: number | null; moneda: string;
  superficie_m2: number | null; ambientes: number | null;
}

const ESTADO_COLOR: Record<string, string> = {
  disponible: '#EF4444', alquilada: '#10B981', en_venta: '#F59E0B', reservada: '#8B5CF6', en_refaccion: '#6B7280',
};
const TIPO_EMOJI: Record<string, string> = {
  departamento: '🏢', casa: '🏠', local: '🏪', oficina: '💼', terreno: '🌳', cochera: '🚗', deposito: '📦',
};
const TIPO_COLOR: Record<string, string> = {
  departamento: '#3B82F6', casa: '#10B981', local: '#F97316', oficina: '#8B5CF6', terreno: '#F59E0B', cochera: '#6B7280', deposito: '#0D9488',
};

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

export default function MapaPropiedades() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProp, setSelectedProp] = useState<Propiedad | null>(null);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_propiedades').select('id, direccion, tipo, estado, localidad, provincia, precio_alquiler, precio_venta, moneda, superficie_m2, ambientes')
      .eq('tenant_id', tenant!.id).order('direccion');
    if (data) setPropiedades(data);
    setLoading(false);
  };

  // Initialize map
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || propiedades.length === 0 || viewMode !== 'map') return;

    const initMap = async () => {
      // Load Google Maps script dynamically
      if (!(window as any).google?.maps) {
        await new Promise<void>((resolve, reject) => {
          if (document.querySelector('script[src*="maps.googleapis"]')) {
            // Already loading, wait for it
            const check = setInterval(() => { if ((window as any).google?.maps) { clearInterval(check); resolve(); } }, 100);
            setTimeout(() => { clearInterval(check); reject('timeout'); }, 10000);
            return;
          }
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=geometry`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject('failed to load');
          document.head.appendChild(script);
        });
      }
      const gm = (window as any).google.maps;

      if (!mapRef.current) return;

      const map = new gm.Map(mapRef.current, {
        center: { lat: -34.6037, lng: -58.3816 },
        zoom: 13,
        mapTypeId: 'hybrid',
        tilt: 45,
      });
      mapInstanceRef.current = map;

      const geocoder = new gm.Geocoder();
      const bounds = new gm.LatLngBounds();
      let placed = 0;

      for (const prop of propiedades) {
        const address = `${prop.direccion}, ${prop.localidad || 'Buenos Aires'}, Argentina`;
        try {
          const result = await new Promise<any>((resolve, reject) => {
            geocoder.geocode({ address }, (results: any, status: any) => {
              if (status === 'OK' && results?.[0]) resolve(results[0]);
              else reject(status);
            });
          });
          const pos = result.geometry.location;
          bounds.extend(pos);

          const pinColor = TIPO_COLOR[prop.tipo] || '#6B7280';
          const letra = (prop.tipo || 'x').charAt(0).toUpperCase();
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${pinColor}" stroke="white" stroke-width="1.5"/><circle cx="14" cy="13" r="7" fill="white"/><text x="14" y="17" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="${pinColor}">${letra}</text></svg>`;
          const marker = new gm.Marker({
            map, position: pos,
            title: prop.direccion,
            icon: {
              url: 'data:image/svg+xml,' + encodeURIComponent(svg),
              scaledSize: new gm.Size(28, 40),
              anchor: new gm.Point(14, 40),
            },
          });
          marker.addListener('click', () => setSelectedProp(prop));
          markersRef.current.push(marker);
          placed++;
        } catch { /* geocode failed */ }
      }

      if (placed > 1) map.fitBounds(bounds);
      else if (placed === 1) map.setZoom(16);
    };

    initMap();

    return () => { markersRef.current = []; };
  }, [propiedades, viewMode]);

  const filtered = propiedades.filter(p => {
    if (filterEstado && p.estado !== filterEstado) return false;
    if (filterTipo && p.tipo !== filterTipo) return false;
    if (search && !p.direccion.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const fmtPrice = (n: number | null, mon: string) => n ? `${mon === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR')}` : '—';

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando mapa...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Mobile title */}
      <div className="module-header-mobile">
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Mapa de Propiedades</div>
      </div>
      {/* Header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Mapa de Propiedades</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar dirección..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="alquilada">Alquilada</option>
          <option value="en_venta">En venta</option>
          <option value="reservada">Reservada</option>
        </select>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {Object.keys(TIPO_COLOR).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button onClick={() => setViewMode('map')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'map' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'map' ? '#fff' : 'var(--color-text-muted)' }}><MapPin size={14} /></button>
          <button onClick={() => setViewMode('list')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'list' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--color-text-muted)' }}><List size={14} /></button>
        </div>
      </div>

      {/* Stats bar — tipos */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(TIPO_COLOR).map(([tipo, color]) => {
          const count = propiedades.filter(p => p.tipo === tipo).length;
          if (!count) return null;
          return (
            <button key={tipo} onClick={() => setFilterTipo(filterTipo === tipo ? '' : tipo)}
              style={{ padding: '4px 10px', borderRadius: 99, border: `1.5px solid ${filterTipo === tipo ? color : 'transparent'}`, background: `${color}15`, color, fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
              <span>{TIPO_EMOJI[tipo]}</span> {tipo} ({count})
            </button>
          );
        })}
        <div style={{ width: 1, background: 'var(--color-border-subtle)', margin: '0 2px' }} />
        {Object.entries(ESTADO_COLOR).map(([estado, color]) => {
          const count = propiedades.filter(p => p.estado === estado).length;
          if (!count) return null;
          return (
            <button key={estado} onClick={() => setFilterEstado(filterEstado === estado ? '' : estado)}
              style={{ padding: '4px 10px', borderRadius: 99, border: `1.5px solid ${filterEstado === estado ? color : 'transparent'}`, background: `${color}15`, color, fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />
              {estado.replace(/_/g, ' ')} ({count})
            </button>
          );
        })}
      </div>

      {/* Map view */}
      {viewMode === 'map' && (
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
          {/* Search overlay on map */}
          {GOOGLE_MAPS_KEY && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 5, display: 'flex', gap: 8 }}>
              {/* Property search */}
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', zIndex: 1 }} />
                <input
                  type="text"
                  placeholder="Buscar propiedad..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    fontSize: '0.8125rem', fontFamily: 'var(--font-sans)', outline: 'none',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                {/* Autocomplete results */}
                {search && filtered.length > 0 && filtered.length < propiedades.length && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
                    borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    overflow: 'hidden', maxHeight: 200, overflowY: 'auto',
                  }}>
                    {filtered.slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => { setSelectedProp(p); setSearch(''); }}
                        style={{
                          width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none',
                          border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'var(--font-sans)',
                          borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 8,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ fontSize: '0.875rem' }}>{TIPO_EMOJI[p.tipo] || '🏠'}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{p.direccion}</div>
                          <div style={{ fontSize: '0.6875rem', color: '#888' }}>{p.localidad || ''} · {p.estado.replace(/_/g, ' ')}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {!GOOGLE_MAPS_KEY ? (
            /* Fallback sin API key */
            <div style={{ height: 500, background: 'var(--color-bg-surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '2rem' }}>
              <MapPin size={48} color="var(--color-text-muted)" />
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Mapa no disponible</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 400 }}>
                Configurá <code style={{ background: 'var(--color-bg-surface)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>VITE_GOOGLE_MAPS_KEY</code> en tu archivo .env para ver las propiedades en el mapa 3D de Google Maps.
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 8 }}>Mientras tanto, usá la vista lista:</div>
              <button onClick={() => setViewMode('list')} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                <List size={14} /> Ver como lista
              </button>
            </div>
          ) : (
            <div ref={mapRef} style={{ height: 500, width: '100%' }} />
          )}

          {/* Selected property card */}
          {selectedProp && (
            <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, maxWidth: 380, background: 'var(--color-bg-surface)', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.2)', border: '1px solid var(--color-border-subtle)', padding: '1rem', zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{selectedProp.direccion}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {selectedProp.localidad}{selectedProp.provincia ? `, ${selectedProp.provincia}` : ''}
                  </div>
                </div>
                <button onClick={() => setSelectedProp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${ESTADO_COLOR[selectedProp.estado]}15`, color: ESTADO_COLOR[selectedProp.estado], textTransform: 'capitalize' }}>{selectedProp.estado.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{TIPO_EMOJI[selectedProp.tipo]} {selectedProp.tipo}</span>
                {selectedProp.superficie_m2 && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{selectedProp.superficie_m2}m²</span>}
                {selectedProp.ambientes && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{selectedProp.ambientes} amb</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                {selectedProp.precio_alquiler && <div><div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>Alquiler</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem' }}>{fmtPrice(selectedProp.precio_alquiler, selectedProp.moneda)}</div></div>}
                {selectedProp.precio_venta && <div><div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>Venta</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem' }}>{fmtPrice(selectedProp.precio_venta, selectedProp.moneda)}</div></div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => navigate(`/inmobiliaria/propiedades`)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', background: 'var(--color-cta, #2563EB)', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                  <Eye size={13} /> Ver propiedad
                </button>
                {selectedProp.estado === 'disponible' && (
                  <button onClick={() => navigate(`/inmobiliaria/contratos?propiedad=${selectedProp.id}`)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid var(--color-cta, #2563EB)', background: 'transparent', color: 'var(--color-cta, #2563EB)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                    <FileSignature size={13} /> Crear contrato
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 90px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
            <span>Propiedad</span><span>Tipo</span><span>Estado</span><span style={{ textAlign: 'right' }}>Alquiler</span><span style={{ textAlign: 'right' }}>Venta</span>
          </div>
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelectedProp(p)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 90px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.direccion}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{p.localidad || ''}{p.superficie_m2 ? ` · ${p.superficie_m2}m²` : ''}{p.ambientes ? ` · ${p.ambientes} amb` : ''}</div>
              </div>
              <div><span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{TIPO_EMOJI[p.tipo]} {p.tipo}</span></div>
              <div><span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado]}15`, color: ESTADO_COLOR[p.estado], textTransform: 'capitalize' }}>{p.estado.replace(/_/g, ' ')}</span></div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>{fmtPrice(p.precio_alquiler, p.moneda)}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: p.precio_venta ? 'var(--color-text-primary)' : 'var(--color-text-faint)' }}>{fmtPrice(p.precio_venta, p.moneda)}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin propiedades</div>}
        </div>
      )}
    </div>
  );
}
