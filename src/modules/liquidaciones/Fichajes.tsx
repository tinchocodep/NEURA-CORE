import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, X, ChevronLeft, ChevronRight, Clock, Trash2, AlertCircle } from 'lucide-react';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import type { Fichaje, Empleado, Obra, Ausencia, TipoAusencia } from './types';
import { TIPO_AUSENCIA_LABEL } from './types';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day === 0 ? 7 : day) - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

export default function LiqFichajes() {
  const { tenant } = useTenant();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [showAusenciaModal, setShowAusenciaModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formEmpleado, setFormEmpleado] = useState('');
  const [formObra, setFormObra] = useState('');
  const [formFecha, setFormFecha] = useState(formatDate(new Date()));
  const [formEntrada, setFormEntrada] = useState('08:00');
  const [formSalida, setFormSalida] = useState('18:00');
  const [formFeriado, setFormFeriado] = useState(false);
  const [formNotas, setFormNotas] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Ausencia form
  const [ausEmpleado, setAusEmpleado] = useState('');
  const [ausFecha, setAusFecha] = useState(formatDate(new Date()));
  const [ausTipo, setAusTipo] = useState<TipoAusencia>('injustificada');
  const [ausNotas, setAusNotas] = useState('');

  const { requestDelete, ConfirmModal } = useConfirmDelete();
  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const weekStart = formatDate(weekDates[0]);
  const weekEnd = formatDate(weekDates[6]);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);
  useEffect(() => { if (tenant && empleados.length) loadWeekData(); }, [weekStart, tenant]);

  const loadData = async () => {
    setLoading(true);
    const [empRes, obrasRes] = await Promise.all([
      supabase.from('liq_empleados').select('*, categoria:liq_categorias(id, nombre)').eq('tenant_id', tenant!.id).eq('estado', 'activo').order('apellido'),
      supabase.from('liq_obras').select('*').eq('tenant_id', tenant!.id).eq('estado', 'activa').order('nombre'),
    ]);
    setEmpleados(empRes.data || []);
    setObras(obrasRes.data || []);
    await loadWeekData();
    setLoading(false);
  };

  const loadWeekData = async () => {
    const [fichRes, ausRes] = await Promise.all([
      supabase.from('liq_fichajes').select('*, empleado:liq_empleados(id, nombre, apellido), obra:liq_obras(id, nombre)').eq('tenant_id', tenant!.id).gte('fecha', weekStart).lte('fecha', weekEnd).order('fecha').order('hora_entrada'),
      supabase.from('liq_ausencias').select('*, empleado:liq_empleados(id, nombre, apellido)').eq('tenant_id', tenant!.id).gte('fecha', weekStart).lte('fecha', weekEnd).order('fecha'),
    ]);
    setFichajes(fichRes.data || []);
    setAusencias(ausRes.data || []);
  };

  const prevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
  const nextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };
  const goToday = () => setBaseDate(new Date());

  const openNew = (fecha?: string) => {
    setEditingId(null);
    setFormEmpleado(empleados[0]?.id || '');
    setFormObra(obras[0]?.id || '');
    setFormFecha(fecha || formatDate(new Date()));
    setFormEntrada('08:00');
    setFormSalida('18:00');
    setFormFeriado(false);
    setFormNotas('');
    setShowModal(true);
  };

  const openEdit = (f: Fichaje) => {
    setEditingId(f.id);
    setFormEmpleado(f.empleado_id);
    setFormObra(f.obra_id);
    setFormFecha(f.fecha);
    setFormEntrada(f.hora_entrada);
    setFormSalida(f.hora_salida || '');
    setFormFeriado(f.es_feriado);
    setFormNotas(f.notas || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formEmpleado || !formObra || !formFecha || !formEntrada) return;
    setSaving(true);
    const payload = {
      empleado_id: formEmpleado,
      obra_id: formObra,
      fecha: formFecha,
      hora_entrada: formEntrada,
      hora_salida: formSalida || null,
      es_feriado: formFeriado,
      notas: formNotas || null,
    };
    if (editingId) {
      await supabase.from('liq_fichajes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
    } else {
      await supabase.from('liq_fichajes').insert({ ...payload, tenant_id: tenant!.id });
    }
    setSaving(false);
    setShowModal(false);
    loadWeekData();
  };

  const handleSaveAusencia = async () => {
    if (!ausEmpleado || !ausFecha) return;
    setSaving(true);
    await supabase.from('liq_ausencias').insert({
      tenant_id: tenant!.id,
      empleado_id: ausEmpleado,
      fecha: ausFecha,
      tipo: ausTipo,
      justificada: ausTipo !== 'injustificada',
      notas: ausNotas || null,
    });
    setSaving(false);
    setShowAusenciaModal(false);
    loadWeekData();
  };

  const handleDeleteFichaje = (f: Fichaje) => {
    const empName = f.empleado ? `${(f.empleado as any).apellido}, ${(f.empleado as any).nombre}` : '';
    requestDelete(`¿Eliminar fichaje de ${empName} del ${f.fecha}?`, async () => {
      await supabase.from('liq_fichajes').delete().eq('id', f.id);
      setFichajes(prev => prev.filter(x => x.id !== f.id));
    });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  // Group fichajes by date
  const fichByDate: Record<string, Fichaje[]> = {};
  const ausByDate: Record<string, Ausencia[]> = {};
  fichajes.forEach(f => { if (!fichByDate[f.fecha]) fichByDate[f.fecha] = []; fichByDate[f.fecha].push(f); });
  ausencias.forEach(a => { if (!ausByDate[a.fecha]) ausByDate[a.fecha] = []; ausByDate[a.fecha].push(a); });

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Fichajes</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>Carga diaria de horas por empleado y obra</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAusEmpleado(empleados[0]?.id || ''); setAusFecha(formatDate(new Date())); setAusTipo('injustificada'); setAusNotas(''); setShowAusenciaModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
              <AlertCircle size={14} /> Ausencia
            </button>
            <button onClick={() => openNew()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
              <Plus size={15} /> Nuevo Fichaje
            </button>
          </div>
        </div>

        {/* Week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevWeek} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><ChevronLeft size={18} /></button>
          <div style={{ display: 'flex', gap: 6 }}>
            {weekDates.map(date => {
              const ds = formatDate(date);
              const isToday = ds === formatDate(new Date());
              const hasFich = fichByDate[ds]?.length > 0;
              const hasAus = ausByDate[ds]?.length > 0;
              const isSat = date.getDay() === 6;
              const isSun = date.getDay() === 0;
              return (
                <div
                  key={ds}
                  onClick={() => openNew(ds)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer',
                    border: isToday ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                    background: isSun ? 'var(--color-bg-surface-2)' : 'var(--color-bg-surface)',
                    opacity: isSun ? 0.5 : 1,
                    minWidth: 64,
                  }}
                >
                  <div style={{ fontSize: '0.625rem', fontWeight: 700, color: isSat ? '#f59e0b' : 'var(--color-text-muted)', textTransform: 'uppercase' }}>{DIAS[date.getDay()]}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 2 }}>{date.getDate()}</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
                    {hasFich && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />}
                    {hasAus && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={nextWeek} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><ChevronRight size={18} /></button>
          <button onClick={goToday} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.75rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Hoy</button>
        </div>

        {/* Daily breakdown */}
        {weekDates.filter(d => d.getDay() !== 0).map(date => {
          const ds = formatDate(date);
          const dayFich = fichByDate[ds] || [];
          const dayAus = ausByDate[ds] || [];
          if (dayFich.length === 0 && dayAus.length === 0) return null;
          return (
            <div key={ds} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {DIAS[date.getDay()]} {date.getDate()}/{date.getMonth() + 1}
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                  {dayFich.length} fichaje{dayFich.length !== 1 ? 's' : ''}{dayAus.length > 0 ? ` · ${dayAus.length} ausencia${dayAus.length !== 1 ? 's' : ''}` : ''}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Empleado', 'Obra', 'Entrada', 'Salida', 'Horas', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 16px', fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-subtle)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayFich.map(f => {
                    const emp = f.empleado as any;
                    const obra = f.obra as any;
                    let horas = '—';
                    if (f.hora_salida) {
                      const [eh, em] = f.hora_entrada.split(':').map(Number);
                      const [sh, sm] = f.hora_salida.split(':').map(Number);
                      const totalMin = (sh * 60 + sm) - (eh * 60 + em) - 60; // -60 for lunch
                      horas = `${Math.floor(totalMin / 60)}h ${totalMin % 60 > 0 ? (totalMin % 60) + 'm' : ''}`.trim();
                    }
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }} onClick={() => openEdit(f)}>
                        <td style={{ padding: '8px 16px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {emp?.apellido}, {emp?.nombre}
                          {f.es_feriado && <span style={{ marginLeft: 6, fontSize: '0.5625rem', fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: '#ef444418', color: '#ef4444' }}>FERIADO</span>}
                        </td>
                        <td style={{ padding: '8px 16px', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{obra?.nombre}</td>
                        <td style={{ padding: '8px 16px', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{f.hora_entrada}</td>
                        <td style={{ padding: '8px 16px', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{f.hora_salida || '—'}</td>
                        <td style={{ padding: '8px 16px', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-accent)' }}>{horas}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); handleDeleteFichaje(f); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {dayAus.map(a => {
                    const emp = a.empleado as any;
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: '#ef444408' }}>
                        <td style={{ padding: '8px 16px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {emp?.apellido}, {emp?.nombre}
                        </td>
                        <td colSpan={4} style={{ padding: '8px 16px' }}>
                          <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#ef444418', color: '#ef4444' }}>
                            AUSENCIA — {TIPO_AUSENCIA_LABEL[a.tipo as TipoAusencia]}
                          </span>
                          {a.notas && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{a.notas}</span>}
                        </td>
                        <td />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {fichajes.length === 0 && ausencias.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Clock size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.875rem' }}>Sin fichajes esta semana</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Hacé click en un día o en "Nuevo Fichaje" para empezar</div>
          </div>
        )}
      </div>

      {/* Modal Fichaje */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ width: 460, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>{editingId ? 'Editar Fichaje' : 'Nuevo Fichaje'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Empleado *</label>
                <select value={formEmpleado} onChange={e => setFormEmpleado(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  <option value="">Seleccionar...</option>
                  {empleados.map(emp => <option key={emp.id} value={emp.id}>{emp.apellido}, {emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Obra *</label>
                <select value={formObra} onChange={e => setFormObra(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  <option value="">Seleccionar...</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Fecha *</label>
                <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Entrada *</label>
                  <input type="time" value={formEntrada} onChange={e => setFormEntrada(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Salida</label>
                  <input type="time" value={formSalida} onChange={e => setFormSalida(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={formFeriado} onChange={e => setFormFeriado(e.target.checked)} />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Es feriado</span>
              </label>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Notas</label>
                <input value={formNotas} onChange={e => setFormNotas(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !formEmpleado || !formObra} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ausencia */}
      {showAusenciaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAusenciaModal(false)}>
          <div className="card" style={{ width: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Registrar Ausencia</h2>
              <button onClick={() => setShowAusenciaModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Empleado *</label>
                <select value={ausEmpleado} onChange={e => setAusEmpleado(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  <option value="">Seleccionar...</option>
                  {empleados.map(emp => <option key={emp.id} value={emp.id}>{emp.apellido}, {emp.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Fecha *</label>
                <input type="date" value={ausFecha} onChange={e => setAusFecha(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Tipo *</label>
                <select value={ausTipo} onChange={e => setAusTipo(e.target.value as TipoAusencia)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  {Object.entries(TIPO_AUSENCIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Notas</label>
                <input value={ausNotas} onChange={e => setAusNotas(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAusenciaModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveAusencia} disabled={saving || !ausEmpleado} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ConfirmModal}
    </>
  );
}
