import { useEffect, useState } from 'react';
import { Calendar, Check, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Vencimiento {
  id: string; tipo: string; referencia_id: string | null; fecha: string;
  descripcion: string; completado: boolean;
}

const TIPOS = ['contrato_vence', 'pago_pendiente', 'ajuste_alquiler', 'habilitacion', 'otro'];

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  contrato_vence: { label: 'Vto. Contrato', color: '#EF4444' },
  pago_pendiente: { label: 'Pago pendiente', color: '#F59E0B' },
  ajuste_alquiler: { label: 'Ajuste alquiler', color: '#3B82F6' },
  habilitacion: { label: 'Habilitacion', color: '#8B5CF6' },
  otro: { label: 'Otro', color: '#6B7280' },
};

export default function Agenda() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<Vencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_vencimientos')
      .select('*').eq('tenant_id', tenant!.id).order('fecha');
    if (data) setItems(data);
    setLoading(false);
  };

  const toggleComplete = async (id: string, current: boolean) => {
    const { error } = await supabase.from('inmobiliaria_vencimientos').update({ completado: !current }).eq('id', id);
    if (!error) setItems(prev => prev.map(v => v.id === id ? { ...v, completado: !current } : v));
  };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const filtered = items.filter(v => {
    if (!showCompleted && v.completado) return false;
    if (filterTipo && v.tipo !== filterTipo) return false;
    return true;
  });

  const overdue = filtered.filter(v => !v.completado && v.fecha < today);
  const todayItems = filtered.filter(v => v.fecha === today && !v.completado);
  const upcoming = filtered.filter(v => v.fecha > today && !v.completado);
  const completed = filtered.filter(v => v.completado);

  const overdueCount = items.filter(v => !v.completado && v.fecha < today).length;

  const renderItem = (v: Vencimiento) => {
    const isOverdue = !v.completado && v.fecha < today;
    const cfg = TIPO_CONFIG[v.tipo] || TIPO_CONFIG.otro;
    const daysAway = Math.ceil((new Date(v.fecha).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    return (
      <div key={v.id} style={{
        padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: isOverdue ? '#EF444408' : v.completado ? 'var(--color-bg-subtle, rgba(255,255,255,0.01))' : 'transparent',
        opacity: v.completado ? 0.6 : 1,
      }}>
        {/* Checkbox */}
        <button onClick={() => toggleComplete(v.id, v.completado)} style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
          border: v.completado ? 'none' : `2px solid ${cfg.color}`,
          background: v.completado ? '#10B981' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {v.completado && <Check size={14} color="#fff" />}
        </button>

        {/* Tipo badge */}
        <span style={{
          fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
          background: `${cfg.color}20`, color: cfg.color, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {cfg.label}
        </span>

        {/* Description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.85rem', fontWeight: 500,
            textDecoration: v.completado ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {v.descripcion}
          </div>
        </div>

        {/* Date */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={{ fontSize: '0.75rem', color: isOverdue ? '#EF4444' : 'var(--color-text-muted)', fontWeight: isOverdue ? 600 : 400 }}>
            {new Date(v.fecha).toLocaleDateString('es-AR')}
          </span>
          {!v.completado && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 600,
              color: isOverdue ? '#EF4444' : daysAway <= 7 ? '#F59E0B' : 'var(--color-text-muted)',
            }}>
              {isOverdue ? `${Math.abs(daysAway)}d atrasado` : daysAway === 0 ? 'Hoy' : `en ${daysAway}d`}
            </span>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando agenda...</div>;

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Agenda</h1>
        {overdueCount > 0 && (
          <span style={{ background: '#EF444420', color: '#EF4444', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} /> {overdueCount} vencidos
          </span>
        )}
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_CONFIG[t]?.label || t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
          Mostrar completados
        </label>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: cfg.color }} />
            {cfg.label}
          </div>
        ))}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Overdue */}
        {overdue.length > 0 && (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid #EF444440', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#EF444410' }}>
              <AlertTriangle size={14} color="#EF4444" />
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#EF4444' }}>Vencidos</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, background: '#EF444420', color: '#EF4444', padding: '1px 6px', borderRadius: 99 }}>{overdue.length}</span>
            </div>
            {overdue.map(renderItem)}
          </div>
        )}

        {/* Today */}
        {todayItems.length > 0 && (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={14} color="var(--color-accent)" />
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Hoy</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, background: 'var(--color-accent)20', color: 'var(--color-accent)', padding: '1px 6px', borderRadius: 99 }}>{todayItems.length}</span>
            </div>
            {todayItems.map(renderItem)}
          </div>
        )}

        {/* Upcoming */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={14} color="var(--color-text-muted)" />
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Proximos</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, background: 'var(--color-border-subtle)', color: 'var(--color-text-muted)', padding: '1px 6px', borderRadius: 99 }}>{upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin vencimientos proximos</div>
          ) : upcoming.map(renderItem)}
        </div>

        {/* Completed */}
        {showCompleted && completed.length > 0 && (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Check size={14} color="#10B981" />
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Completados</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, background: '#10B98120', color: '#10B981', padding: '1px 6px', borderRadius: 99 }}>{completed.length}</span>
            </div>
            {completed.map(renderItem)}
          </div>
        )}
      </div>
    </div>
  );
}
