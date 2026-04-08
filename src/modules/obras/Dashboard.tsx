import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { HardHat, Users, FileText, AlertTriangle, ClipboardList, Truck, ShieldAlert, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ObraFicha, Vencimiento } from './types';
import { ESTADO_OBRA_COLOR, ESTADO_OBRA_LABEL } from './types';

export default function ObrasDashboard() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [obrasActivas, setObrasActivas] = useState(0);
  const [contratistas, setContratistas] = useState(0);
  const [certificadosPendientes, setCertificadosPendientes] = useState(0);
  const [vencimientosProximos, setVencimientosProximos] = useState(0);
  const [obras, setObras] = useState<ObraFicha[]>([]);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [obrasRes, contRes, certRes, vencRes, obrasListRes] = await Promise.all([
      supabase.from('obras_fichas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('estado', 'activa'),
      supabase.from('obras_contratistas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('estado', 'activo'),
      supabase.from('obras_certificados').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).eq('estado', 'borrador'),
      supabase.from('obras_vencimientos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id).lte('fecha_vencimiento', en30).gte('fecha_vencimiento', hoy),
      supabase.from('obras_fichas').select('*').eq('tenant_id', tenant!.id).order('updated_at', { ascending: false }).limit(5),
    ]);

    setObrasActivas(obrasRes.count || 0);
    setContratistas(contRes.count || 0);
    setCertificadosPendientes(certRes.count || 0);
    setVencimientosProximos(vencRes.count || 0);
    setObras(obrasListRes.data || []);
    setLoading(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  const kpis = [
    { label: 'Obras Activas', value: obrasActivas, icon: HardHat, color: '#10b981' },
    { label: 'Contratistas', value: contratistas, icon: Users, color: '#3b82f6' },
    { label: 'Cert. Pendientes', value: certificadosPendientes, icon: FileText, color: '#f59e0b' },
    { label: 'Vencimientos', value: vencimientosProximos, icon: ShieldAlert, color: '#ef4444' },
  ];

  const modules = tenant?.enabled_modules || [];

  const accesos = [
    { label: 'Obras', path: '/obras/listado', icon: HardHat, color: '#10b981', mod: 'obras.fichas' },
    { label: 'Contratistas', path: '/obras/contratistas', icon: Users, color: '#3b82f6', mod: 'obras.contratistas' },
    { label: 'Materiales', path: '/obras/materiales', icon: Truck, color: '#8b5cf6', mod: 'obras.materiales' },
    { label: 'Vencimientos', path: '/obras/vencimientos', icon: ShieldAlert, color: '#ef4444', mod: 'obras.vencimientos' },
    { label: 'F931', path: '/obras/f931', icon: ClipboardList, color: '#0ea5e9', mod: 'obras.f931' },
    { label: 'Reportes', path: '/obras/reportes', icon: FileText, color: '#d97706', mod: 'obras.reportes' },
  ].filter(a => modules.includes(a.mod) || modules.includes('obras'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Obras</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>
          Gestión integral de obras, contratistas, presupuestos y avance
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

      {/* Accesos rápidos + Obras recientes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: 16 }}>Accesos Rápidos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {accesos.map(item => (
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

        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Obras Recientes</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {obras.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                <AlertTriangle size={20} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div>No hay obras creadas</div>
              </div>
            ) : (
              obras.map(o => {
                const color = ESTADO_OBRA_COLOR[o.estado];
                return (
                  <div
                    key={o.id}
                    onClick={() => navigate(`/obras/${o.id}`)}
                    style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{o.nombre}</div>
                      {o.direccion && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{o.direccion}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>
                      {ESTADO_OBRA_LABEL[o.estado]}
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
