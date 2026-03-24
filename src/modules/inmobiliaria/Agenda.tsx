import { useEffect, useState, useMemo } from 'react';
import { Calendar, Check, AlertTriangle, Plus, X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
const DIAS_HEADER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
type ViewType = 'mes' | 'semana' | 'dia' | 'tabla';

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

function dateStr(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - ((day + 6) % 7)); return r; }

export default function Agenda() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [calOpen, setCalOpen] = useState(false);
  const [items, setItems] = useState<Vencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>('mes');
  const [filterTipo, setFilterTipo] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [curDate, setCurDate] = useState(new Date());
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ tipo: 'otro', fecha: '', descripcion: '' });

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  // Auto-open form if navigated with ?action=crear
  useEffect(() => {
    if (searchParams.get('action') === 'crear') {
      setFormData({ tipo: 'otro', fecha: '', descripcion: '' });
      setShowForm(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

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

  const today = dateStr(new Date());
  const filtered = useMemo(() => items.filter(v => {
    if (!showCompleted && v.completado) return false;
    if (filterTipo && v.tipo !== filterTipo) return false;
    return true;
  }), [items, showCompleted, filterTipo]);

  const overdueCount = items.filter(v => !v.completado && v.fecha < today).length;

  // Navigation
  const nav = (dir: number) => {
    if (view === 'mes') setCurDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else if (view === 'semana') setCurDate(d => addDays(d, dir * 7));
    else if (view === 'dia') setCurDate(d => addDays(d, dir));
  };
  const goToday = () => setCurDate(new Date());

  const navLabel = () => {
    if (view === 'mes') return curDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    if (view === 'semana') { const s = startOfWeek(curDate); const e = addDays(s, 6); return `${s.getDate()}/${s.getMonth() + 1} — ${e.getDate()}/${e.getMonth() + 1}/${e.getFullYear()}`; }
    if (view === 'dia') return curDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return '';
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando agenda...</div>;

  /* ═══════ MOBILE: Google Calendar style ═══════ */
  if (isMobile) {
    const y = curDate.getFullYear(), mo = curDate.getMonth();
    const firstDay = new Date(y, mo, 1);
    const startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const monthLabel = curDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    // Group events by date
    const eventsByDate: Record<string, Vencimiento[]> = {};
    filtered.forEach(v => {
      if (!eventsByDate[v.fecha]) eventsByDate[v.fecha] = [];
      eventsByDate[v.fecha].push(v);
    });
    const sortedDates = Object.keys(eventsByDate).sort();

    // Dates with events in current month (for dots)
    const datesWithEvents = new Set(filtered.map(v => v.fecha));

    const formatDayHeader = (ds: string) => {
      const d = new Date(ds + 'T12:00:00');
      if (ds === today) return 'Hoy';
      const tomorrow = dateStr(addDays(new Date(), 1));
      if (ds === tomorrow) return 'Mañana';
      return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Mini calendar header */}
        <div style={{ padding: '0 4px' }}>
          <button onClick={() => setCalOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontFamily: 'var(--font-sans)' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{monthLabel}</span>
            <ChevronDown size={16} style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: calOpen ? 'rotate(180deg)' : 'none' }} />
          </button>

          {/* Collapsible mini calendar */}
          {calOpen && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <button onClick={() => setCurDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><ChevronLeft size={18} /></button>
                <button onClick={() => { setCurDate(new Date()); }} style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: 'var(--color-cta-dim, rgba(37,99,235,0.1))', color: 'var(--color-cta)', border: 'none', cursor: 'pointer' }}>Hoy</button>
                <button onClick={() => setCurDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}><ChevronRight size={18} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
                {DIAS_HEADER.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '0.5625rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '2px 0', textTransform: 'uppercase' }}>{d}</div>
                ))}
                {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = ds === today;
                  const hasEvents = datesWithEvents.has(ds);
                  return (
                    <button key={day} onClick={() => { const el = document.getElementById(`day-${ds}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: isToday ? 700 : 400, background: isToday ? 'var(--color-cta)' : 'transparent', color: isToday ? '#fff' : 'var(--color-text-primary)' }}>
                        {day}
                      </span>
                      {hasEvents && <span style={{ width: 4, height: 4, borderRadius: '50%', background: isToday ? '#fff' : 'var(--color-cta)' }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, padding: '4px 4px 8px', overflowX: 'auto' }}>
          <button onClick={() => setFilterTipo('')} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: !filterTipo ? 'var(--color-cta)' : 'var(--color-bg-surface)', color: !filterTipo ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>Todos</button>
          {TIPOS.map(t => {
            const cfg = TIPO_CFG[t];
            return (
              <button key={t} onClick={() => setFilterTipo(filterTipo === t ? '' : t)} style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${filterTipo === t ? cfg.color : 'var(--color-border-subtle)'}`, background: filterTipo === t ? `${cfg.color}15` : 'var(--color-bg-surface)', color: filterTipo === t ? cfg.color : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{cfg.label}</button>
            );
          })}
        </div>

        {/* Schedule list */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sortedDates.length === 0 && (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Sin eventos</div>
          )}
          {sortedDates.map(ds => {
            const isOverdueDay = ds < today;
            return (
              <div key={ds} id={`day-${ds}`}>
                {/* Day header */}
                <div style={{ padding: '10px 4px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: ds === today ? 'var(--color-cta)' : isOverdueDay ? '#EF4444' : 'var(--color-text-primary)', textTransform: 'capitalize' }}>
                    {formatDayHeader(ds)}
                  </span>
                  {isOverdueDay && <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#EF444415', color: '#EF4444' }}>Vencido</span>}
                </div>
                {/* Events */}
                {eventsByDate[ds].map(v => {
                  const cfg = TIPO_CFG[v.tipo] || TIPO_CFG.otro;
                  return (
                    <div key={v.id} onClick={() => toggleComplete(v.id, v.completado)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', marginBottom: 2, borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', cursor: 'pointer', opacity: v.completado ? 0.5 : 1 }}>
                      {/* Color bar */}
                      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: v.completado ? '#10B981' : cfg.color, flexShrink: 0 }} />
                      {/* Checkbox */}
                      <div style={{ width: 20, height: 20, borderRadius: 5, border: v.completado ? 'none' : `2px solid ${cfg.color}`, background: v.completado ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {v.completado && <Check size={12} color="#fff" />}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 500, textDecoration: v.completado ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.descripcion}</div>
                        <span style={{ fontSize: '0.5625rem', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Form modal */}
        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', flexDirection: 'column' }} onClick={() => setShowForm(false)}>
            <div style={{ flex: 1 }} />
            <div style={{ background: 'var(--color-bg-base)', borderRadius: '20px 20px 0 0', padding: '20px 16px 80px' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />
              <h3 style={{ fontWeight: 700, fontSize: '1.0625rem', margin: '0 0 16px' }}>Nuevo vencimiento</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select className="form-input" value={formData.tipo} onChange={e => setFormData(f => ({ ...f, tipo: e.target.value }))} style={{ height: 42, borderRadius: 10 }}>
                  {TIPOS.map(t => <option key={t} value={t}>{TIPO_CFG[t]?.label}</option>)}
                </select>
                <input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(f => ({ ...f, fecha: e.target.value }))} style={{ height: 42, borderRadius: 10 }} />
                <textarea className="form-input" rows={3} placeholder="Descripción..." value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} style={{ borderRadius: 10, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setShowForm(false)} className="btn btn-secondary" style={{ flex: 1, height: 42, borderRadius: 10 }}>Cancelar</button>
                <button onClick={saveNew} className="btn btn-primary" disabled={!formData.fecha || !formData.descripcion} style={{ flex: 1, height: 42, borderRadius: 10 }}>Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══════ DESKTOP: 2-column layout (sidebar filters + calendar) ═══════ */
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)', position: 'relative' }}>
      {/* ── LEFT SIDEBAR: Mini calendar + Filters ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Mini month calendar */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button onClick={() => setCurDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-muted)' }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize' }}>{curDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => setCurDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-muted)' }}><ChevronRight size={14} /></button>
          </div>
          {(() => {
            const y = curDate.getFullYear(), mo = curDate.getMonth();
            const startDow = (new Date(y, mo, 1).getDay() + 6) % 7;
            const dim = new Date(y, mo + 1, 0).getDate();
            const datesWithEvents = new Set(filtered.map(v => v.fecha));
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
                {DIAS_HEADER.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.5rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '2px 0' }}>{d}</div>)}
                {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: dim }).map((_, i) => {
                  const day = i + 1;
                  const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = ds === today;
                  const hasEv = datesWithEvents.has(ds);
                  return (
                    <button key={day} onClick={() => { setCurDate(new Date(y, mo, day)); setView('dia'); }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '2px 0', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: isToday ? 700 : 400, background: isToday ? 'var(--color-cta)' : 'transparent', color: isToday ? '#fff' : 'var(--color-text-primary)' }}>{day}</span>
                      {hasEv && <span style={{ width: 3, height: 3, borderRadius: '50%', background: isToday ? 'var(--color-cta)' : '#3B82F6' }} />}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          <button onClick={goToday} style={{ width: '100%', marginTop: 8, padding: '4px 0', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, background: 'var(--color-cta-dim, rgba(37,99,235,0.1))', color: 'var(--color-cta)', border: 'none', cursor: 'pointer' }}>Hoy</button>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 8 }}>Filtros</div>
          {TIPOS.map(t => {
            const cfg = TIPO_CFG[t];
            const active = filterTipo === t;
            const count = items.filter(v => v.tipo === t && !v.completado).length;
            return (
              <button key={t} onClick={() => setFilterTipo(active ? '' : t)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: 'none', background: active ? `${cfg.color}10` : 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.color, flexShrink: 0, opacity: active ? 1 : 0.5 }} />
                <span style={{ fontSize: '0.75rem', fontWeight: active ? 600 : 400, color: active ? cfg.color : 'var(--color-text-secondary)', flex: 1, textAlign: 'left' }}>{cfg.label}</span>
                {count > 0 && <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>{count}</span>}
              </button>
            );
          })}
          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '8px 0' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px 8px' }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: '#10B981' }} /> Mostrar completados
          </label>
        </div>

        {/* Overdue count */}
        {overdueCount > 0 && (
          <div className="card" style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} color="#EF4444" />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991B1B' }}>{overdueCount} vencidos</span>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Calendar area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {/* Top bar: nav + view toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav(-1)} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'capitalize', minWidth: 180 }}>{navLabel()}</span>
          <button onClick={() => nav(1)} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}><ChevronRight size={16} /></button>
          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', border: '1px solid var(--color-border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
            {(['mes', 'semana', 'dia', 'tabla'] as ViewType[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '5px 14px', fontSize: '0.7rem', fontWeight: view === v ? 700 : 500, background: view === v ? 'var(--color-cta, #2563EB)' : 'var(--color-bg-surface)', color: view === v ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer', borderLeft: v !== 'mes' ? '1px solid var(--color-border-subtle)' : 'none' }}>
                {v === 'tabla' ? 'Tabla' : v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día'}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {view === 'mes' && <MonthView date={curDate} events={filtered} today={today} onToggle={toggleComplete} />}

          {view === 'semana' && (() => {
            const start = startOfWeek(curDate);
            const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
            const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 - 23:00
            return (
              <div className="card" style={{ overflow: 'auto', position: 'relative' }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)', borderBottom: '1px solid var(--color-border-subtle)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-bg-card)' }}>
                  <div />
                  {days.map(d => {
                    const ds = dateStr(d);
                    const isToday = ds === today;
                    return (
                      <div key={ds} style={{ padding: '8px 4px', textAlign: 'center', borderLeft: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{d.toLocaleDateString('es-AR', { weekday: 'short' })}</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--color-cta)' : 'var(--color-text-primary)' }}>{d.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Time grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)', position: 'relative' }}>
                  {hours.map(h => (
                    <div key={h} style={{ display: 'contents' }}>
                      <div style={{ padding: '2px 6px', fontSize: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'right', height: 48, borderTop: '1px solid var(--color-border-subtle)' }}>
                        {String(h).padStart(2, '0')}:00
                      </div>
                      {days.map(d => {
                        const ds = dateStr(d);
                        const dayEvents = filtered.filter(v => v.fecha === ds);
                        const showEvents = h === 9; // Show events at 09:00 row
                        return (
                          <div key={`${ds}-${h}`} style={{ borderTop: '1px solid var(--color-border-subtle)', borderLeft: '1px solid var(--color-border-subtle)', height: 48, padding: '1px 2px', position: 'relative' }}>
                            {showEvents && dayEvents.map(ev => <EventPill key={ev.id} v={ev} onToggle={toggleComplete} />)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {/* Current time line */}
                  {(() => {
                    const todayIdx = days.findIndex(d => dateStr(d) === today);
                    if (todayIdx === -1 || nowHour < 6 || nowHour > 23) return null;
                    const topPx = (nowHour - 6) * 48;
                    return (
                      <div style={{ position: 'absolute', top: topPx, left: 50, right: 0, height: 2, background: '#EF4444', zIndex: 1, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', left: `calc(${todayIdx} * (100% / 7))`, top: -4, width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {view === 'dia' && <DayView date={curDate} events={filtered} today={today} onToggle={toggleComplete} />}

          {view === 'tabla' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label className="form-label" style={{ margin: 0 }}>Desde</label>
                <input type="date" className="form-input" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={{ width: 'auto' }} />
                <label className="form-label" style={{ margin: 0 }}>Hasta</label>
                <input type="date" className="form-input" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={{ width: 'auto' }} />
              </div>
              <TableView events={filtered.filter(v => {
                if (rangeFrom && v.fecha < rangeFrom) return false;
                if (rangeTo && v.fecha > rangeTo) return false;
                return true;
              })} today={today} onToggle={toggleComplete} />
            </div>
          )}
        </div>
      </div>

      {/* ── FAB: New event ── */}
      <button
        onClick={() => { setFormData({ tipo: 'otro', fecha: dateStr(curDate), descripcion: '' }); setShowForm(true); }}
        style={{
          position: 'absolute', bottom: 20, right: 20, width: 52, height: 52,
          borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
          zIndex: 10, transition: 'transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="Nuevo evento"
      >
        <Plus size={24} />
      </button>

      {/* ── NEW FORM MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowForm(false)}>
          <div className="card" style={{ width: 440, padding: 24, borderRadius: 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>Nuevo evento</h3>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-icon"><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">Tipo</label>
                <select className="form-input" value={formData.tipo} onChange={e => setFormData(f => ({ ...f, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{TIPO_CFG[t]?.label}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Fecha</label>
                <input type="date" className="form-input" value={formData.fecha} onChange={e => setFormData(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div className="form-group"><label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} placeholder="Descripción del evento o tarea..." value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} style={{ resize: 'vertical' }} />
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

/* ═══════ EVENT PILL ═══════ */
function EventPill({ v, onToggle }: { v: Vencimiento; onToggle: (id: string, c: boolean) => void }) {
  const cfg = TIPO_CFG[v.tipo] || TIPO_CFG.otro;
  return (
    <div onClick={() => onToggle(v.id, v.completado)} title={v.descripcion}
      style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 3, background: v.completado ? '#10B98115' : `${cfg.color}15`, color: v.completado ? '#10B981' : cfg.color, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: v.completado ? 'line-through' : 'none', borderLeft: `2px solid ${v.completado ? '#10B981' : cfg.color}` }}>
      {v.descripcion}
    </div>
  );
}

/* ═══════ ITEM ROW (for list/table) ═══════ */
function ItemRow({ v, today, onToggle }: { v: Vencimiento; today: string; onToggle: (id: string, c: boolean) => void }) {
  const isOverdue = !v.completado && v.fecha < today;
  const cfg = TIPO_CFG[v.tipo] || TIPO_CFG.otro;
  const daysAway = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / 86400000);
  return (
    <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--color-border-subtle)', background: isOverdue ? '#EF444406' : undefined, opacity: v.completado ? 0.6 : 1 }}>
      <button onClick={() => onToggle(v.id, v.completado)} style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer', border: v.completado ? 'none' : `2px solid ${cfg.color}`, background: v.completado ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {v.completado && <Check size={11} color="#fff" />}
      </button>
      <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: `${cfg.color}15`, color: cfg.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{cfg.label}</span>
      <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 500, textDecoration: v.completado ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.descripcion}</span>
      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: isOverdue ? '#EF4444' : 'var(--color-text-muted)', fontWeight: isOverdue ? 600 : 400, flexShrink: 0 }}>
        {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
      </span>
      {!v.completado && <span style={{ fontSize: '0.6rem', fontWeight: 600, color: isOverdue ? '#EF4444' : daysAway <= 7 ? '#F59E0B' : 'var(--color-text-muted)', flexShrink: 0, width: 60, textAlign: 'right' }}>
        {isOverdue ? `${Math.abs(daysAway)}d atrás` : daysAway === 0 ? 'Hoy' : `en ${daysAway}d`}
      </span>}
    </div>
  );
}

/* ═══════ MONTH VIEW ═══════ */
function MonthView({ date, events, today, onToggle }: { date: Date; events: Vencimiento[]; today: string; onToggle: (id: string, c: boolean) => void }) {
  const y = date.getFullYear(), m = date.getMonth();
  const firstDay = new Date(y, m, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DIAS_HEADER.map(d => (
          <div key={d} style={{ padding: 6, textAlign: 'center', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border-subtle)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} style={{ minHeight: 80, borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-2)' }} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = ds === today;
          const dayEvents = events.filter(v => v.fecha === ds);
          return (
            <div key={day} style={{ minHeight: 80, padding: 3, borderTop: '1px solid var(--color-border-subtle)', borderRight: (startDow + day) % 7 !== 0 ? '1px solid var(--color-border-subtle)' : 'none', background: isToday ? 'var(--color-cta-dim, rgba(37,99,235,0.06))' : undefined }}>
              <div style={{ fontSize: '0.7rem', fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--color-cta)' : 'var(--color-text-secondary)', textAlign: 'right', paddingRight: 3, marginBottom: 2 }}>{day}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dayEvents.slice(0, 3).map(ev => <EventPill key={ev.id} v={ev} onToggle={onToggle} />)}
                {dayEvents.length > 3 && <div style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>+{dayEvents.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════ WEEK VIEW ═══════ */
function WeekView({ date, events, today, onToggle }: { date: Date; events: Vencimiento[]; today: string; onToggle: (id: string, c: boolean) => void }) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
      {days.map(d => {
        const ds = dateStr(d);
        const isToday = ds === today;
        const dayEvents = events.filter(v => v.fecha === ds);
        return (
          <div key={ds} className="card" style={{ minHeight: 200, padding: 10, background: isToday ? 'var(--color-cta-dim, rgba(37,99,235,0.06))' : undefined }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--color-cta)' : 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'capitalize' }}>
              {d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dayEvents.map(ev => <EventPill key={ev.id} v={ev} onToggle={onToggle} />)}
              {dayEvents.length === 0 && <div style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)', textAlign: 'center', paddingTop: 20 }}>—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════ DAY VIEW ═══════ */
function DayView({ date, events, today, onToggle }: { date: Date; events: Vencimiento[]; today: string; onToggle: (id: string, c: boolean) => void }) {
  const ds = dateStr(date);
  const dayEvents = events.filter(v => v.fecha === ds);
  const overdue = events.filter(v => !v.completado && v.fecha < ds);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {overdue.length > 0 && ds <= today && (
        <div className="card" style={{ overflow: 'hidden', border: '1px solid #EF444430' }}>
          <div style={{ padding: '8px 14px', background: '#EF444408', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--color-border-subtle)' }}>
            <AlertTriangle size={13} color="#EF4444" /><span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#EF4444' }}>Vencidos</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, background: '#EF444420', color: '#EF4444', padding: '1px 6px', borderRadius: 99 }}>{overdue.length}</span>
          </div>
          {overdue.map(v => <ItemRow key={v.id} v={v} today={today} onToggle={onToggle} />)}
        </div>
      )}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} color="var(--color-cta)" />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, background: 'var(--color-bg-surface-2)', padding: '1px 6px', borderRadius: 99, color: 'var(--color-text-muted)' }}>{dayEvents.length}</span>
        </div>
        {dayEvents.length === 0
          ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Sin eventos para este día</div>
          : dayEvents.map(v => <ItemRow key={v.id} v={v} today={today} onToggle={onToggle} />)
        }
      </div>
    </div>
  );
}

/* ═══════ TABLE VIEW ═══════ */
function TableView({ events, today, onToggle }: { events: Vencimiento[]; today: string; onToggle: (id: string, c: boolean) => void }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr>
            {['', 'Fecha', 'Tipo', 'Descripción', 'Estado', 'Días'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map(v => {
            const isOverdue = !v.completado && v.fecha < today;
            const cfg = TIPO_CFG[v.tipo] || TIPO_CFG.otro;
            const daysAway = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / 86400000);
            return (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: isOverdue ? '#EF444406' : undefined, opacity: v.completado ? 0.6 : 1 }}>
                <td style={{ padding: '6px 12px', width: 32 }}>
                  <button onClick={() => onToggle(v.id, v.completado)} style={{ width: 18, height: 18, borderRadius: 4, cursor: 'pointer', border: v.completado ? 'none' : `2px solid ${cfg.color}`, background: v.completado ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {v.completado && <Check size={11} color="#fff" />}
                  </button>
                </td>
                <td style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                <td style={{ padding: '6px 12px' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: `${cfg.color}15`, color: cfg.color }}>{cfg.label}</span>
                </td>
                <td style={{ padding: '6px 12px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: v.completado ? 'line-through' : 'none' }}>{v.descripcion}</td>
                <td style={{ padding: '6px 12px' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: v.completado ? '#10B98115' : isOverdue ? '#EF444415' : 'var(--color-bg-surface-2)', color: v.completado ? '#10B981' : isOverdue ? '#EF4444' : 'var(--color-text-muted)' }}>
                    {v.completado ? 'Completado' : isOverdue ? 'Vencido' : 'Pendiente'}
                  </span>
                </td>
                <td style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 600, color: isOverdue ? '#EF4444' : daysAway <= 7 ? '#F59E0B' : 'var(--color-text-muted)' }}>
                  {v.completado ? '—' : isOverdue ? `${Math.abs(daysAway)}d atrás` : daysAway === 0 ? 'Hoy' : `en ${daysAway}d`}
                </td>
              </tr>
            );
          })}
          {events.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin eventos en este rango</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
