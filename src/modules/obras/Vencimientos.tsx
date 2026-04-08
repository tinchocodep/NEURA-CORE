import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { ShieldAlert, ShieldCheck, AlertTriangle, Clock } from 'lucide-react';
import type { Vencimiento } from './types';

type EstadoVenc = 'vigente' | 'por_vencer' | 'vencido';

function getEstado(fecha: string, diasAnticipacion: number): EstadoVenc {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha + 'T00:00:00');
  const diff = (venc.getTime() - hoy.getTime()) / 86400000;
  if (diff < 0) return 'vencido';
  if (diff <= diasAnticipacion) return 'por_vencer';
  return 'vigente';
}

const ESTADO_COLOR: Record<EstadoVenc, string> = { vigente: '#10b981', por_vencer: '#f59e0b', vencido: '#ef4444' };
const ESTADO_LABEL: Record<EstadoVenc, string> = { vigente: 'Vigente', por_vencer: 'Por Vencer', vencido: 'Vencido' };
const ESTADO_ICON: Record<EstadoVenc, any> = { vigente: ShieldCheck, por_vencer: Clock, vencido: ShieldAlert };

export default function ObrasVencimientos() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<(Vencimiento & { _estado: EstadoVenc })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('obras_vencimientos')
      .select('*')
      .eq('tenant_id', tenant!.id)
      .order('fecha_vencimiento');
    const enriched = (data || []).map(v => ({ ...v, _estado: getEstado(v.fecha_vencimiento, v.dias_anticipacion) }));
    setItems(enriched);
    setLoading(false);
  };

  const tipos = [...new Set(items.map(v => v.tipo))];

  const filtered = items.filter(v => {
    if (filtroEstado && v._estado !== filtroEstado) return false;
    if (filtroTipo && v.tipo !== filtroTipo) return false;
    return true;
  });

  const counts = { vigente: items.filter(v => v._estado === 'vigente').length, por_vencer: items.filter(v => v._estado === 'por_vencer').length, vencido: items.filter(v => v._estado === 'vencido').length };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Vencimientos</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Control de ART, seguros, habilitaciones y permisos</p>
      </div>

      {/* Semáforo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {(['vencido', 'por_vencer', 'vigente'] as EstadoVenc[]).map(est => {
          const Icon = ESTADO_ICON[est];
          const color = ESTADO_COLOR[est];
          const active = filtroEstado === est;
          return (
            <div key={est} className="card"
              onClick={() => setFiltroEstado(active ? '' : est)}
              style={{ padding: '16px 20px', borderTop: `3px solid ${color}`, cursor: 'pointer', opacity: filtroEstado && !active ? 0.5 : 1, transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={16} style={{ color }} />
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ESTADO_LABEL[est]}</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>{counts[est]}</div>
            </div>
          );
        })}
      </div>

      {/* Filtro por tipo */}
      {tipos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltroTipo('')}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--color-border)', background: !filtroTipo ? 'var(--color-accent)' : 'var(--color-bg-surface)', color: !filtroTipo ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Todos</button>
          {tipos.map(t => (
            <button key={t} onClick={() => setFiltroTipo(filtroTipo === t ? '' : t)}
              style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--color-border)', background: filtroTipo === t ? 'var(--color-accent)' : 'var(--color-bg-surface)', color: filtroTipo === t ? '#fff' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>{t}</button>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
            <AlertTriangle size={20} style={{ marginBottom: 8, opacity: 0.5 }} />
            <div>No hay vencimientos registrados</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Tipo', 'Descripción', 'Entidad', 'Vencimiento', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const color = ESTADO_COLOR[v._estado];
                const Icon = ESTADO_ICON[v._estado];
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{v.tipo}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{v.descripcion || '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>
                      <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{v.entidad_tipo}</span>
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>{v.fecha_vencimiento}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>
                        <Icon size={10} /> {ESTADO_LABEL[v._estado]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
