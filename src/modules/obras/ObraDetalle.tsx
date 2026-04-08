import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, HardHat, MapPin, User, Calendar, Ruler } from 'lucide-react';
import type { ObraFicha } from './types';
import { ESTADO_OBRA_COLOR, ESTADO_OBRA_LABEL } from './types';
import TabEquipo from './tabs/TabEquipo';
import TabPresupuesto from './tabs/TabPresupuesto';
import TabDocumentacion from './tabs/TabDocumentacion';
import TabPartesDiarios from './tabs/TabPartesDiarios';

type Tab = 'general' | 'equipo' | 'presupuesto' | 'documentacion' | 'partes' | 'materiales' | 'costos';

export default function ObraDetalle() {
  const { tenant } = useTenant();
  const { obraId } = useParams();
  const navigate = useNavigate();
  const [obra, setObra] = useState<ObraFicha | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('general');

  useEffect(() => { if (tenant && obraId) loadObra(); }, [tenant, obraId]);

  const loadObra = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('obras_fichas')
      .select('*')
      .eq('id', obraId!)
      .eq('tenant_id', tenant!.id)
      .single();
    setObra(data);
    setLoading(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!obra) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
      Obra no encontrada.
      <button onClick={() => navigate('/obras/listado')} style={{ display: 'block', margin: '16px auto', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>Volver</button>
    </div>
  );

  const color = ESTADO_OBRA_COLOR[obra.estado];
  const modules = tenant?.enabled_modules || [];
  const hasModule = (mod: string) => modules.includes(mod) || modules.includes('obras');

  const tabs: { id: Tab; label: string; mod: string }[] = [
    { id: 'general', label: 'General', mod: 'obras.fichas' },
    { id: 'equipo', label: 'Equipo', mod: 'obras.fichas' },
    { id: 'presupuesto', label: 'Presupuesto', mod: 'obras.presupuesto' },
    { id: 'documentacion', label: 'Documentación', mod: 'obras.documentacion' },
    { id: 'partes', label: 'Partes Diarios', mod: 'obras.partes-diarios' },
    { id: 'materiales', label: 'Materiales', mod: 'obras.materiales' },
    { id: 'costos', label: 'Costos', mod: 'obras.reportes' },
  ];

  const visibleTabs = tabs.filter(t => hasModule(t.mod));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/obras/listado')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardHat size={20} style={{ color: '#d97706' }} />
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{obra.nombre}</h1>
            <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>{ESTADO_OBRA_LABEL[obra.estado]}</span>
          </div>
          {obra.direccion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>
              <MapPin size={12} /> {obra.direccion}{obra.localidad ? `, ${obra.localidad}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {obra.comitente && (
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Comitente</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><User size={14} /> {obra.comitente}</div>
          </div>
        )}
        {obra.fecha_inicio && (
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inicio</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {obra.fecha_inicio}</div>
          </div>
        )}
        {obra.fecha_estimada_fin && (
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Est. Fin</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {obra.fecha_estimada_fin}</div>
          </div>
        )}
        {obra.superficie_m2 && (
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Superficie</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Ruler size={14} /> {obra.superficie_m2} m²</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)' }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card" style={{ padding: 20, minHeight: 200 }}>
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {obra.tipo_obra && <div><span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Tipo de obra:</span> <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{obra.tipo_obra}</span></div>}
            {obra.notas && <div><span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Notas:</span><p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{obra.notas}</p></div>}
            {!obra.tipo_obra && !obra.notas && <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem', padding: 40 }}>Sin información adicional</div>}
          </div>
        )}
        {activeTab === 'equipo' && <TabEquipo obraId={obra.id} />}
        {activeTab === 'presupuesto' && <TabPresupuesto obraId={obra.id} />}
        {activeTab === 'documentacion' && <TabDocumentacion obraId={obra.id} />}
        {activeTab === 'partes' && <TabPartesDiarios obraId={obra.id} />}
        {activeTab === 'materiales' && <TabPlaceholder label="Materiales" desc="Usá la sección Materiales del sidebar para gestionar pedidos de esta obra" />}
        {activeTab === 'costos' && <TabPlaceholder label="Costos" desc="Consultá Reportes en el sidebar para ver el comparativo presupuesto vs real" />}
      </div>
    </div>
  );
}

function TabPlaceholder({ label, desc }: { label: string; desc: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 8 }}>{desc}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 16, fontStyle: 'italic' }}>Próximamente</div>
    </div>
  );
}
