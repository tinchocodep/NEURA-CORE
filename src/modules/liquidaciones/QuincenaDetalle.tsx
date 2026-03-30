import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator } from 'lucide-react';
import type { Quincena, Empleado, Fichaje, Ausencia, Categoria, ValorHora } from './types';
import { ESTADO_QUINCENA_COLOR, ESTADO_QUINCENA_LABEL, TIPO_AUSENCIA_LABEL } from './types';

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fmtMoney(n: number) {
  if (!n) return '$0';
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T12:00:00');
  const endD = new Date(end + 'T12:00:00');
  while (d <= endD) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getDayOfWeek(fecha: string): number {
  return new Date(fecha + 'T12:00:00').getDay();
}

interface DayInfo {
  tipo: 'trabajo' | 'ausencia';
  badge: string;
  color: string;
  bg: string;
  horas?: number;
  extra50?: number;
  extra100?: number;
  obra?: string;
}

function getBadgeForDay(
  empleado: Empleado,
  fichajes: Fichaje[],
  ausencia: Ausencia | undefined,
  fecha: string
): DayInfo | null {
  const dow = getDayOfWeek(fecha);
  if (dow === 0) return null; // domingo

  if (ausencia) {
    const labels: Record<string, { badge: string; color: string; bg: string }> = {
      vacaciones: { badge: 'VAC', color: '#d946ef', bg: '#d946ef18' },
      visita_medica: { badge: 'MEDICO', color: '#8b5cf6', bg: '#8b5cf618' },
      injustificada: { badge: 'AUS', color: '#ef4444', bg: '#ef444418' },
      art: { badge: 'ART', color: '#ef4444', bg: '#ef444418' },
      paro_transporte: { badge: 'PARO', color: '#f59e0b', bg: '#f59e0b18' },
      permiso: { badge: 'PERM', color: '#6366f1', bg: '#6366f118' },
      feriado: { badge: 'FER', color: '#f59e0b', bg: '#f59e0b18' },
      otro: { badge: 'AUS', color: '#6b7280', bg: '#6b728018' },
    };
    const info = labels[ausencia.tipo] || labels.otro;
    return { tipo: 'ausencia', ...info };
  }

  if (fichajes.length === 0) return null;

  // Calculate hours from fichajes
  let totalHoras = 0;
  let extra50 = 0;
  let extra100 = 0;
  fichajes.forEach(f => {
    if (!f.hora_salida) return;
    const [eh, em] = f.hora_entrada.split(':').map(Number);
    const [sh, sm] = f.hora_salida.split(':').map(Number);
    const mins = (sh * 60 + sm) - (eh * 60 + em);
    if (dow === 6) {
      // Saturday - all extra
      totalHoras += mins / 60;
    } else {
      totalHoras += mins / 60;
    }
  });

  // Determine badge based on employee type and hours
  const horasRedondeadas = Math.round(totalHoras);
  const esRev = empleado.es_revestimiento;
  const catNombre = (empleado.categoria as any)?.nombre || '';

  let prefix = 'T'; // default
  if (esRev) prefix = 'REV';
  else if (catNombre === 'PREP') prefix = 'P';
  else if (catNombre.startsWith('CAP') || catNombre === 'ENCARGADO') prefix = 'GC';
  else if (catNombre === 'OE' || catNombre === 'OE MEDIO PUNTERO') prefix = 'VL';

  // Color by type
  const colors: Record<string, { color: string; bg: string }> = {
    T: { color: '#16a34a', bg: '#16a34a20' },
    P: { color: '#7c3aed', bg: '#7c3aed20' },
    REV: { color: '#dc2626', bg: '#dc262620' },
    GC: { color: '#065f46', bg: '#065f4620' },
    VL: { color: '#1e3a5f', bg: '#1e3a5f20' },
  };
  const c = colors[prefix] || colors.T;

  const badge = `${prefix}${horasRedondeadas > 0 ? horasRedondeadas : ''}`;

  return {
    tipo: 'trabajo',
    badge,
    color: c.color,
    bg: c.bg,
    horas: horasRedondeadas > 0 ? horasRedondeadas : undefined,
  };
}

export default function QuincenaDetalle() {
  const { tenant } = useTenant();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quincena, setQuincena] = useState<Quincena | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (tenant && id) loadData(); }, [tenant, id]);

  const loadData = async () => {
    setLoading(true);
    const [qRes, empRes, fichRes, ausRes] = await Promise.all([
      supabase.from('liq_quincenas').select('*').eq('id', id!).single(),
      supabase.from('liq_empleados').select('*, categoria:liq_categorias(id, nombre)').eq('tenant_id', tenant!.id).eq('estado', 'activo').order('apellido'),
      supabase.from('liq_fichajes').select('*, obra:liq_obras(id, nombre)').eq('tenant_id', tenant!.id).eq('quincena_id', id!).order('fecha'),
      supabase.from('liq_ausencias').select('*').eq('tenant_id', tenant!.id).eq('quincena_id', id!).order('fecha'),
    ]);

    setQuincena(qRes.data);
    setEmpleados(empRes.data || []);

    // If no fichajes linked to quincena yet, load by date range
    if (qRes.data && (fichRes.data || []).length === 0) {
      const [fichByDate, ausByDate] = await Promise.all([
        supabase.from('liq_fichajes').select('*, obra:liq_obras(id, nombre)').eq('tenant_id', tenant!.id).gte('fecha', qRes.data.fecha_desde).lte('fecha', qRes.data.fecha_hasta).order('fecha'),
        supabase.from('liq_ausencias').select('*').eq('tenant_id', tenant!.id).gte('fecha', qRes.data.fecha_desde).lte('fecha', qRes.data.fecha_hasta).order('fecha'),
      ]);
      setFichajes(fichByDate.data || []);
      setAusencias(ausByDate.data || []);
    } else {
      setFichajes(fichRes.data || []);
      setAusencias(ausRes.data || []);
    }

    setLoading(false);
  };

  const dates = useMemo(() => {
    if (!quincena) return [];
    return getDatesInRange(quincena.fecha_desde, quincena.fecha_hasta);
  }, [quincena]);

  if (loading || !quincena) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  const color = ESTADO_QUINCENA_COLOR[quincena.estado] || '#6b7280';

  // Group data
  const fichByEmpDate: Record<string, Record<string, Fichaje[]>> = {};
  const ausByEmpDate: Record<string, Record<string, Ausencia>> = {};
  fichajes.forEach(f => {
    if (!fichByEmpDate[f.empleado_id]) fichByEmpDate[f.empleado_id] = {};
    if (!fichByEmpDate[f.empleado_id][f.fecha]) fichByEmpDate[f.empleado_id][f.fecha] = [];
    fichByEmpDate[f.empleado_id][f.fecha].push(f);
  });
  ausencias.forEach(a => {
    if (!ausByEmpDate[a.empleado_id]) ausByEmpDate[a.empleado_id] = {};
    ausByEmpDate[a.empleado_id][a.fecha] = a;
  });

  // Calculate per-employee summaries
  const empSummaries = empleados.map(emp => {
    let horasBrutas = 0;
    let extra50 = 0;
    let extra100 = 0;
    let ausCount = 0;
    let vacDias = 0;
    let satuHoras = 0;

    dates.forEach(date => {
      const dow = getDayOfWeek(date);
      const empFich = fichByEmpDate[emp.id]?.[date] || [];
      const empAus = ausByEmpDate[emp.id]?.[date];

      if (empAus) {
        ausCount++;
        if (empAus.tipo === 'vacaciones') vacDias++;
        return;
      }

      empFich.forEach(f => {
        if (!f.hora_salida) return;
        const [eh, em] = f.hora_entrada.split(':').map(Number);
        const [sh, sm] = f.hora_salida.split(':').map(Number);
        const mins = (sh * 60 + sm) - (eh * 60 + em) - (dow !== 6 ? 60 : 0); // -60 lunch on weekdays
        if (dow === 6) {
          satuHoras += mins / 60;
        } else {
          horasBrutas += mins / 60;
        }
      });
    });

    const horasNetas = horasBrutas;
    const horasVac = vacDias * 9;

    return {
      emp,
      horasBrutas: Math.round(horasBrutas),
      extra50: Math.round(extra50),
      extra100: Math.round(extra100),
      satuHoras: Math.round(satuHoras),
      ausCount,
      horasNetas: Math.round(horasNetas),
      vacDias,
      horasVac,
    };
  }).filter(s => s.horasBrutas > 0 || s.ausCount > 0 || s.satuHoras > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/liquidaciones/quincenas')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {quincena.periodo}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>
            {quincena.fecha_desde} → {quincena.fecha_hasta}
          </p>
        </div>
        <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>
          {ESTADO_QUINCENA_LABEL[quincena.estado]}
        </span>
      </div>

      {/* Grid */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: dates.length * 60 + 300 }}>
            <thead>
              {/* Row 1: Day names grouped by week */}
              <tr>
                <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--color-bg-surface-2)', padding: '6px 12px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)', minWidth: 200, textAlign: 'left' }}>
                  Empleado
                </th>
                {dates.map(date => {
                  const dow = getDayOfWeek(date);
                  const d = new Date(date + 'T12:00:00');
                  const isSun = dow === 0;
                  const isSat = dow === 6;
                  return (
                    <th key={date} style={{
                      padding: '4px 2px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase',
                      color: isSat ? '#f59e0b' : isSun ? '#ef4444' : 'var(--color-text-muted)',
                      background: isSun ? 'var(--color-bg-surface-2)' : 'var(--color-bg-surface)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      textAlign: 'center', minWidth: 48,
                      opacity: isSun ? 0.4 : 1,
                    }}>
                      <div>{DIAS_SEMANA[dow]}</div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 1 }}>{d.getDate()}</div>
                    </th>
                  );
                })}
                {/* Summary columns */}
                <th style={{ padding: '6px 8px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)', borderLeft: '2px solid var(--color-border)', textAlign: 'center' }}>Hs Brutas</th>
                <th style={{ padding: '6px 8px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>Sáb</th>
                <th style={{ padding: '6px 8px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>AUS</th>
                <th style={{ padding: '6px 8px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>Vac</th>
                <th style={{ padding: '6px 8px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>Cat.</th>
              </tr>
            </thead>
            <tbody>
              {empSummaries.map(({ emp, horasBrutas, satuHoras, ausCount, vacDias }, idx) => {
                const catNombre = (emp.categoria as any)?.nombre || '—';
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: idx % 2 === 0 ? undefined : 'var(--color-bg-surface-2)' }}>
                    {/* Employee name - sticky */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1,
                      background: idx % 2 === 0 ? 'var(--color-bg-surface)' : 'var(--color-bg-surface-2)',
                      padding: '6px 12px', borderRight: '1px solid var(--color-border)',
                      fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--color-text-muted)', marginRight: 6 }}>{idx + 1}</span>
                      {emp.apellido} {emp.nombre}
                    </td>

                    {/* Day cells */}
                    {dates.map(date => {
                      const dow = getDayOfWeek(date);
                      const isSun = dow === 0;
                      const empFich = fichByEmpDate[emp.id]?.[date] || [];
                      const empAus = ausByEmpDate[emp.id]?.[date];
                      const info = getBadgeForDay(emp, empFich, empAus, date);

                      return (
                        <td key={date} style={{
                          padding: '4px 2px', textAlign: 'center',
                          background: isSun ? 'var(--color-bg-surface-2)' : undefined,
                          opacity: isSun ? 0.3 : 1,
                        }}>
                          {info && (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 5px',
                              borderRadius: 6,
                              fontSize: '0.5625rem',
                              fontWeight: 700,
                              color: info.color,
                              background: info.bg,
                              whiteSpace: 'nowrap',
                              cursor: 'default',
                            }} title={info.tipo === 'ausencia' ? TIPO_AUSENCIA_LABEL[empAus?.tipo as keyof typeof TIPO_AUSENCIA_LABEL] || '' : `${empFich.length} fichaje(s)`}>
                              {info.badge}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Summary cells */}
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-primary)', borderLeft: '2px solid var(--color-border)' }}>{horasBrutas || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: satuHoras > 0 ? '#f59e0b' : 'var(--color-text-muted)' }}>{satuHoras || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: ausCount > 0 ? '#ef4444' : 'var(--color-text-muted)' }}>{ausCount || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: vacDias > 0 ? '#d946ef' : 'var(--color-text-muted)' }}>{vacDias || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 5px', borderRadius: 6, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-primary)' }}>{catNombre}</span>
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--color-bg-surface-2)', padding: '8px 12px', fontWeight: 700, fontSize: '0.75rem', color: 'var(--color-text-primary)', borderRight: '1px solid var(--color-border)' }}>
                  TOTAL ({empSummaries.length} empleados)
                </td>
                {dates.map(date => {
                  const dow = getDayOfWeek(date);
                  const count = empSummaries.filter(s => {
                    const hasFich = fichByEmpDate[s.emp.id]?.[date]?.length > 0;
                    return hasFich;
                  }).length;
                  return (
                    <td key={date} style={{ padding: '6px 2px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-2)', opacity: dow === 0 ? 0.3 : 1 }}>
                      {count > 0 ? count : ''}
                    </td>
                  );
                })}
                <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-accent)', background: 'var(--color-bg-surface-2)', borderLeft: '2px solid var(--color-border)' }}>{empSummaries.reduce((s, e) => s + e.horasBrutas, 0)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', background: 'var(--color-bg-surface-2)' }}>{empSummaries.reduce((s, e) => s + e.satuHoras, 0) || '—'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', background: 'var(--color-bg-surface-2)' }}>{empSummaries.reduce((s, e) => s + e.ausCount, 0) || '—'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#d946ef', background: 'var(--color-bg-surface-2)' }}>{empSummaries.reduce((s, e) => s + e.vacDias, 0) || '—'}</td>
                <td style={{ background: 'var(--color-bg-surface-2)' }} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {empSummaries.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          No hay fichajes cargados para esta quincena. Cargá fichajes en la sección de Fichajes y después volvé acá.
        </div>
      )}
    </div>
  );
}
