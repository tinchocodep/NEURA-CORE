import { useEffect, useState } from 'react';
import { Calendar, Check, AlertTriangle, Clock, Plus, X, LayoutGrid, List } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Vencimiento {
  id: string; tipo: string; referencia_id: string | null; fecha: string;
  descripcion: string; completado: boolean;
}

const TIPOS = ['contrato_vence', 'pago_pendiente', 'ajuste_alquiler', 'habilitacion', 'otro'];
const TIPO_CFG: Record<string, { label: string; color: string }> = {
  contrato_vence: { label: 'Vto. Contrato', color: '#EF4444' },
  pago_pendiente: { label: 'Pago pendiente', color: '#F59E0B' },
  ajuste_alquiler: { label: 'Ajuste alquiler', color: '#3B82F6' },
  habilitacion: { label: 'Habilitación', color: '#8B5CF6' },
  otro: { label: 'Otro', color: '#6B7280' },
};
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function Agenda() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<Vencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [filterTipo, setFilterTipo] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ tipo: 'otro', fecha: '', descripcion: '' });

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_vencimientos').select('*').eq('tenant_id', tenant!.id).order('fecha');
    if (data) setItems(data);
    setLoading(false);
  };

  const toggleComplete = async (id: string, current: boolean) => {
    await supabase.from('inmobiliaria_vencimientos').update({ completado: !current }).eq('id', id);
    setItems(prev => prev.map(v => v.id === id ? { ...v, completado: !current } : v));
  };

  const saveNew = async () => {
    if (!formData.fecha || !formData.descripcion) return;
    const { data } = await supabase.from('inmobiliaria_vencimientos')
      .insert({ tenant_id: tenant!.id, ...formData, completado: false }).select().single();
    if (data) setItems(prev => [...prev, data].sort((a, b) => a.fecha.localeCompare(b.fecha)));
    setShowForm(false);
    setFormData({ tipo: 'otro', fecha: '', descripcion: '' });
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = items.filter(v => {
    if (!showCompleted && v.completado) return false;
    if (filterTipo && v.tipo !== filterTipo) return false;
    return true;
  });

  const overdueCount = items.filter(v => !v.completado && v.fecha < today).length;

  // Calendar helpers
  const firstDay = new Date(month.y, month.m, 1);
  const lastDay = new Date(month.y, month.m + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
  const daysInMonth = lastDay.getDate();
  const monthLabel = firstDay.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const prevMonth = () => setMonth(m => m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 });
  const nextMonth = () => setMonth(m => m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 });
  const goToday = () => { const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); };

  const eventsForDay = (day: number) => {
    const dateStr = `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filtered.filter(v => v.fecha === dateStr);
  };

  // List grouping
  const overdue = filtered.filter(v => !v.completado && v.fecha < today);
  const todayItems = filtered.filter(v => v.fecha === today && !v.completado);
  const upcoming = filtered.filter(v => v.fecha > today && !v.completado);
  const completed = filtered.filter(v => v.completado);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando agenda...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Agenda</h1>
        {overdueCount > 0 && (
          <span style={{ background: '#EF444420', color: '#EF4444', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} /> {overdueCount} vencidos
          </span>
        )}
        <div style={{ flex: 1 }} />

        {/* Filters */}
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_CFG[t]?.label || t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Completados
        </label>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <button onClick={() => setView('calendar')} style={{ padding: '4px 10px', background: view === 'calendar' ? 'var(--color-cta, #2563EB)' : 'var(--color-bg-surface)', color: view === 'calendar' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={14} />
          </button>
          <button onClick={() => setView('list')} style={{ padding: '4px 10px', background: view === 'list' ? 'var(--color-cta, #2563EB)' : 'var(--color-bg-surface)', color: view === 'list' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--color-border-subtle)' }}>
            <List size={14} />
          </button>
        </div>

        <button onClick={() => { setFormData({ tipo: 'otro', fecha: '', descripcion: '' }); setShowForm(true); }} className="btn btn-primary" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {Object.entries(TIPO_CFG).map(([key, cfg]) => (
          <button key={key} onClick={() => setFilterTipo(filterTipo === key ? '' : key)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: filterTipo === key ? cfg.color : 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: filterTipo === key ? 700 : 400 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: cfg.color }} />
            {cfg.label}
          </button>
        ))}
      </div>

      {/* ─── CALENDAR VIEW ─── */}
      {view === 'calendar' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Month nav */}
          <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <button onClick={prevMonth} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}>‹</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', textTransform: 'capitalize' }}>{monthLabel}</span>
              <button onClick={goToday} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--color-cta-dim, rgba(37,99,235,0.1))', color: 'var(--color-cta, #2563EB)', border: 'none', cursor: 'pointer' }}>Hoy</button>
            </div>
            <button onClick={nextMonth} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {DIAS.map(d => (
              <div key={d} style={{ padding: '6px', textAlign: 'center', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {/* Empty cells before first day */}
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`e${i}`} style={{ minHeight: 80, borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-2)' }} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === today;
              const events = eventsForDay(day);
              return (
                <div key={day} style={{ minHeight: 80, padding: 4, borderTop: '1px solid var(--color-border-subtle)', borderRight: (startDow + day) % 7 !== 0 ? '1px solid var(--color-border-subtle)' : 'none', position: 'relative', background: isToday ? 'var(--color-cta-dim, rgba(37,99,235,0.06))' : undefined }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--color-cta, #2563EB)' : 'var(--color-text-secondary)', marginBottom: 2, textAlign: 'right', paddingRight: 4 }}>
                    {day}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {events.slice(0, 3).map(ev => {
                      const cfg = TIPO_CFG[ev.tipo] || TIPO_CFG.otro;
                      return (
                        <div key={ev.id} onClick={() => toggleComplete(ev.id, ev.completado)} title={ev.descripcion}
                          style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 3, background: ev.completado ? '#10B98118' : `${cfg.color}18`, color: ev.completado ? '#10B981' : cfg.color, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: ev.completado ? 'line-through' : 'none', borderLeft: `2px solid ${ev.completado ? '#10B981' : cfg.color}` }}>
                          {ev.descripcion}
                        </div>
                      );
                    })}
                    {events.length > 3 && (
                      <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>+{events.length - 3} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── LIST VIEW ─── */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {overdue.length > 0 && (
            <Section title="Vencidos" icon={<AlertTriangle size={14} color="#EF4444" />} count={overdue.length} borderColor="#EF444440" headerBg="#EF444410" titleColor="#EF4444">
              {overdue.map(v => <Item key={v.id} v={v} today={today} onToggle={toggleComplete} />)}
            </Section>
          )}
          {todayItems.length > 0 && (
            <Section title="Hoy" icon={<Calendar size={14} color="var(--color-cta, #2563EB)" />} count={todayItems.length}>
              {todayItems.map(v => <Item key={v.id} v={v} today={today} onToggle={toggleComplete} />)}
            </Section>
          )}
          <Section title="Próximos" icon={<Clock size={14} color="var(--color-text-muted)" />} count={upcoming.length}>
            {upcoming.length === 0
              ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin vencimientos próximos</div>
              : upcoming.map(v => <Item key={v.id} v={v} today={today} onToggle={toggleComplete} />)}
          </Section>
          {showCompleted && completed.length > 0 && (
            <Section title="Completados" icon={<Check size={14} color="#10B981" />} count={completed.length}>
              {completed.map(v => <Item key={v.id} v={v} today={today} onToggle={toggleComplete} />)}
            </Section>
          )}
        </div>
      )}

      {/* ─── NEW FORM MODAL ─── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowForm(false)}>
          <div className="card" style={{ width: 420, padding: 24, borderRadius: 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>Nuevo vencimiento</h3>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-icon"><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={formData.tipo} onChange={e => setFormData(f => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS.map(t => <option key={t} value={t}>{TIPO_CFG[t]?.label || t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveNew} className="btn btn-primary" disabled={!formData.fecha || !formData.descripcion}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function Section({ title, icon, count, children, borderColor, headerBg, titleColor }: {
  title: string; icon: React.ReactNode; count: number; children: React.ReactNode;
  borderColor?: string; headerBg?: string; titleColor?: string;
}) {
  return (
    <div className="card" style={{ overflow: 'hidden', border: borderColor ? `1px solid ${borderColor}` : undefined }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 6, background: headerBg }}>
        {icon}
        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: titleColor }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, background: 'var(--color-bg-surface-2)', padding: '1px 6px', borderRadius: 99, color: 'var(--color-text-muted)' }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Item({ v, today, onToggle }: { v: Vencimiento; today: string; onToggle: (id: string, c: boolean) => void }) {
  const isOverdue = !v.completado && v.fecha < today;
  const cfg = TIPO_CFG[v.tipo] || TIPO_CFG.otro;
  const daysAway = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / (86400000));

  return (
    <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--color-border-subtle)', background: isOverdue ? '#EF444406' : undefined, opacity: v.completado ? 0.6 : 1 }}>
      <button onClick={() => onToggle(v.id, v.completado)} style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, cursor: 'pointer', border: v.completado ? 'none' : `2px solid ${cfg.color}`, background: v.completado ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {v.completado && <Check size={12} color="#fff" />}
      </button>
      <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${cfg.color}18`, color: cfg.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{cfg.label}</span>
      <div style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, textDecoration: v.completado ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.descripcion}</div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', color: isOverdue ? '#EF4444' : 'var(--color-text-muted)', fontWeight: isOverdue ? 600 : 400 }}>{new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</div>
        {!v.completado && <div style={{ fontSize: '0.625rem', fontWeight: 600, color: isOverdue ? '#EF4444' : daysAway <= 7 ? '#F59E0B' : 'var(--color-text-muted)' }}>{isOverdue ? `${Math.abs(daysAway)}d atrasado` : daysAway === 0 ? 'Hoy' : `en ${daysAway}d`}</div>}
      </div>
    </div>
  );
}
