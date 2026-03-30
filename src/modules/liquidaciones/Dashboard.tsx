import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Users, HardHat, Clock, Calendar, DollarSign, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Quincena } from './types';
import { ESTADO_QUINCENA_COLOR, ESTADO_QUINCENA_LABEL } from './types';

export default function LiquidacionesDashboard() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [empleadosActivos, setEmpleadosActivos] = useState(0);
  const [obrasActivas, setObrasActivas] = useState(0);
  const [fichajesHoy, setFichajesHoy] = useState(0);
  const [quincenas, setQuincenas] = useState<Quincena[]>([]);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const [empRes, obrasRes, fichRes, quinRes] = await Promise.all([
      supabase.from('liq_empleados').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('estado', 'activo'),
      supabase.from('liq_obras').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('estado', 'activa'),
      supabase.from('liq_fichajes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('fecha', hoy),
      supabase.from('liq_quincenas').select('*').eq('tenant_id', tenant!.id).order('fecha_desde', { ascending: false }).limit(5),
    ]);
    setEmpleadosActivos(empRes.count || 0);
    setObrasActivas(obrasRes.count || 0);
    setFichajesHoy(fichRes.count || 0);
    setQuincenas(quinRes.data || []);
    setLoading(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  const quincenaActual = quincenas.find(q => q.estado === 'abierta');

  const kpis = [
    { label: 'Empleados Activos', value: empleadosActivos, icon: Users, color: '#3b82f6' },
    { label: 'Obras Activas', value: obrasActivas, icon: HardHat, color: '#10b981' },
    { label: 'Fichajes Hoy', value: fichajesHoy, icon: Clock, color: '#f59e0b' },
    { label: 'Quincena', value: quincenaActual ? quincenaActual.periodo : 'Sin abrir', icon: Calendar, color: '#8b5cf6' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Liquidaciones</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>
          Control de jornales, fichajes y liquidación quincenal
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ padding: '16px 20px', borderTop: `3px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={16} style={{ color }} />
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Accesos rápidos + Quincenas recientes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        {/* Accesos rápidos */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: 16 }}>Accesos Rápidos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { label: 'Cargar Fichajes', path: '/liquidaciones/fichajes', icon: Clock, color: '#f59e0b' },
              { label: 'Empleados', path: '/liquidaciones/empleados', icon: Users, color: '#3b82f6' },
              { label: 'Obras', path: '/liquidaciones/obras', icon: HardHat, color: '#10b981' },
              { label: 'Quincenas', path: '/liquidaciones/quincenas', icon: Calendar, color: '#8b5cf6' },
              { label: 'Categorías', path: '/liquidaciones/categorias', icon: DollarSign, color: '#ec4899' },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 16, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = item.color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; }}
              >
                <item.icon size={20} style={{ color: item.color }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quincenas recientes */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Últimas Quincenas</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {quincenas.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                <AlertTriangle size={20} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div>No hay quincenas creadas</div>
              </div>
            ) : (
              quincenas.map(q => {
                const color = ESTADO_QUINCENA_COLOR[q.estado] || '#6b7280';
                return (
                  <div
                    key={q.id}
                    onClick={() => navigate('/liquidaciones/quincenas')}
                    style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{q.periodo}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {q.fecha_desde} → {q.fecha_hasta}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>
                      {ESTADO_QUINCENA_LABEL[q.estado]}
                    </span>
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
