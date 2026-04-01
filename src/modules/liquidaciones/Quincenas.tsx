import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, X, Calendar, Calculator, ChevronDown, ChevronUp, Edit2, Table } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Quincena, LiquidacionDetalle, Empleado, ValorHora } from './types';
import { ESTADO_QUINCENA_COLOR, ESTADO_QUINCENA_LABEL } from './types';
import { calcularEmpleado } from './hooks/useCalculoQuincenal';
import StyledSelect from '../../shared/components/StyledSelect';

function fmtMoney(n: number | null | undefined) {
  if (!n) return '$0';
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getQuincenaOptions(): { periodo: string; desde: string; hasta: string }[] {
  const opts: { periodo: string; desde: string; hasta: string }[] = [];
  const now = new Date();
  for (let i = -4; i <= 2; i++) {
    const month = now.getMonth() + Math.floor(i / 2);
    const d = new Date(now.getFullYear(), month, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
    if (i % 2 === 0) {
      opts.push({ periodo: `${y}-${m}-Q1`, desde: `${y}-${m}-01`, hasta: `${y}-${m}-15` });
    } else {
      opts.push({ periodo: `${y}-${m}-Q2`, desde: `${y}-${m}-16`, hasta: `${y}-${m}-${lastDay}` });
    }
  }
  return opts;
}

export default function LiqQuincenas() {
  const { tenant } = useTenant();
  const [quincenas, setQuincenas] = useState<Quincena[]>([]);
  const [detalles, setDetalles] = useState<Record<string, LiquidacionDetalle[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingDetalle, setEditingDetalle] = useState<LiquidacionDetalle | null>(null);
  const [newPeriodo, setNewPeriodo] = useState('');
  const nav = useNavigate();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('liq_quincenas').select('*').eq('tenant_id', tenant!.id).order('fecha_desde', { ascending: false });
    setQuincenas(data || []);
    setLoading(false);
  };

  const loadDetalles = async (quincenaId: string) => {
    if (detalles[quincenaId]) {
      setExpanded(expanded === quincenaId ? null : quincenaId);
      return;
    }
    const { data } = await supabase.from('liq_liquidacion_detalle')
      .select('*, empleado:liq_empleados(id, nombre, apellido, es_revestimiento, dni), categoria:liq_categorias(id, nombre)')
      .eq('quincena_id', quincenaId)
      .order('total_bruto', { ascending: false });
    setDetalles(prev => ({ ...prev, [quincenaId]: data || [] }));
    setExpanded(quincenaId);
  };

  const handleCreate = async () => {
    const opts = getQuincenaOptions();
    const sel = opts.find(o => o.periodo === newPeriodo);
    if (!sel) return;
    setSaving(true);
    await supabase.from('liq_quincenas').insert({
      tenant_id: tenant!.id,
      periodo: sel.periodo,
      fecha_desde: sel.desde,
      fecha_hasta: sel.hasta,
      estado: 'abierta',
    });
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const handleCalcular = async (q: Quincena) => {
    setCalculating(q.id);
    const [empRes, fichRes, ausRes, valRes] = await Promise.all([
      supabase.from('liq_empleados').select('*, categoria:liq_categorias(id, nombre)').eq('tenant_id', tenant!.id).eq('estado', 'activo'),
      supabase.from('liq_fichajes').select('*').eq('tenant_id', tenant!.id).gte('fecha', q.fecha_desde).lte('fecha', q.fecha_hasta),
      supabase.from('liq_ausencias').select('*').eq('tenant_id', tenant!.id).gte('fecha', q.fecha_desde).lte('fecha', q.fecha_hasta),
      supabase.from('liq_valores_hora').select('*').eq('tenant_id', tenant!.id).lte('vigencia_desde', q.fecha_hasta).order('vigencia_desde', { ascending: false }),
    ]);

    const empleados: Empleado[] = empRes.data || [];
    const fichajes = fichRes.data || [];
    const ausencias = ausRes.data || [];
    const valoresHora: ValorHora[] = valRes.data || [];

    const latestValor: Record<string, number> = {};
    valoresHora.forEach(v => {
      if (!latestValor[v.categoria_id]) latestValor[v.categoria_id] = v.valor_hora;
    });

    const resultados = empleados.map(emp => {
      const empFichajes = fichajes.filter(f => f.empleado_id === emp.id);
      const empAusencias = ausencias.filter(a => a.empleado_id === emp.id);
      const valorHora = emp.categoria_id ? (latestValor[emp.categoria_id] || 0) : 0;
      const calc = calcularEmpleado(emp, empFichajes, empAusencias, valorHora);

      // Vacaciones
      const diasVac = empAusencias.filter(a => a.tipo === 'vacaciones').length;
      const horasVac = diasVac * 9; // 9h por día de vacaciones
      const montoVac = horasVac * calc.valor_hora;

      // Pago total = total bruto (includes presentismo)
      const pagoTotal = calc.total_bruto;

      return {
        ...calc,
        quincena_id: q.id,
        tenant_id: tenant!.id,
        categoria_id: emp.categoria_id,
        horas_vacaciones: horasVac,
        dias_vacaciones_calc: diasVac,
        monto_vacaciones: Math.round(montoVac * 100) / 100,
        pago_total: Math.round(pagoTotal * 100) / 100,
        monto_suss: 0,
        monto_adelanto: 0,
        redondeo: 0,
      };
    }).filter(r => r.horas_normales > 0 || r.horas_extra_50 > 0 || r.horas_extra_100 > 0 || r.dias_ausencia_injustificada > 0 || r.horas_vacaciones > 0);

    await supabase.from('liq_liquidacion_detalle').delete().eq('quincena_id', q.id);
    if (resultados.length > 0) {
      await supabase.from('liq_liquidacion_detalle').insert(resultados);
    }
    await supabase.from('liq_quincenas').update({ estado: 'calculada', updated_at: new Date().toISOString() }).eq('id', q.id);
    await supabase.from('liq_fichajes').update({ quincena_id: q.id }).eq('tenant_id', tenant!.id).gte('fecha', q.fecha_desde).lte('fecha', q.fecha_hasta);
    await supabase.from('liq_ausencias').update({ quincena_id: q.id }).eq('tenant_id', tenant!.id).gte('fecha', q.fecha_desde).lte('fecha', q.fecha_hasta);

    setCalculating(null);
    setDetalles(prev => { const n = { ...prev }; delete n[q.id]; return n; });
    loadData();
    loadDetalles(q.id);
  };

  const handleCambiarEstado = async (q: Quincena, nuevoEstado: string) => {
    await supabase.from('liq_quincenas').update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq('id', q.id);
    loadData();
  };

  const handleSaveDetalle = async () => {
    if (!editingDetalle) return;
    setSaving(true);
    const d = editingDetalle;
    // Recalculate efectivo: (quincena + vacaciones) - (quincena_contador + vacaciones_contador)
    const quincenaTotal = d.pago_total;
    const vacTotal = d.monto_vacaciones;
    const quincenaContador = d.quincena_contador || 0;
    const vacContador = d.vacaciones_contador || 0;
    const efectivo = (quincenaTotal + vacTotal) - (quincenaContador + vacContador);
    const redondeo = Math.round(efectivo / 1000) * 1000;

    await supabase.from('liq_liquidacion_detalle').update({
      quincena_contador: d.quincena_contador,
      vacaciones_contador: d.vacaciones_contador,
      monto_adelanto: d.monto_adelanto,
      monto_efectivo: efectivo,
      monto_transferencia: quincenaContador + vacContador,
      redondeo: redondeo,
      updated_at: new Date().toISOString(),
    }).eq('id', d.id);

    setSaving(false);
    setEditingDetalle(null);
    // Refresh detalles
    const qId = d.quincena_id;
    setDetalles(prev => { const n = { ...prev }; delete n[qId]; return n; });
    loadDetalles(qId);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  const opts = getQuincenaOptions();
  const existingPeriods = new Set(quincenas.map(q => q.periodo));

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Quincenas</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 2 }}>Liquidación quincenal de jornales</p>
          </div>
          <button onClick={() => { setNewPeriodo(opts.find(o => !existingPeriods.has(o.periodo))?.periodo || ''); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
            <Plus size={15} /> Nueva Quincena
          </button>
        </div>

        {quincenas.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Calendar size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.875rem' }}>No hay quincenas creadas</div>
          </div>
        ) : quincenas.map(q => {
          const color = ESTADO_QUINCENA_COLOR[q.estado] || '#6b7280';
          const isExpanded = expanded === q.id;
          const qDetalles = detalles[q.id] || [];
          const totQuincena = qDetalles.reduce((s, d) => s + d.pago_total, 0);
          const totVacaciones = qDetalles.reduce((s, d) => s + d.monto_vacaciones, 0);
          const totTransferencia = qDetalles.reduce((s, d) => s + (d.monto_transferencia || 0), 0);
          const totEfectivo = qDetalles.reduce((s, d) => s + (d.monto_efectivo || 0), 0);
          const totRedondeo = qDetalles.reduce((s, d) => s + d.redondeo, 0);

          return (
            <div key={q.id} className="card" style={{ overflow: 'hidden' }}>
              <div
                style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => loadDetalles(q.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Calendar size={18} style={{ color: 'var(--color-accent)' }} />
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{q.periodo}</span>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {q.fecha_desde} → {q.fecha_hasta}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color }}>
                    {ESTADO_QUINCENA_LABEL[q.estado]}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={e => { e.stopPropagation(); nav(`/liquidaciones/quincenas/${q.id}`); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.75rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                    <Table size={13} /> Ver Grilla
                  </button>
                  {q.estado === 'abierta' && (
                    <button onClick={e => { e.stopPropagation(); handleCalcular(q); }} disabled={calculating === q.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', opacity: calculating === q.id ? 0.6 : 1 }}>
                      <Calculator size={14} /> {calculating === q.id ? 'Calculando...' : 'Calcular'}
                    </button>
                  )}
                  {q.estado === 'calculada' && (
                    <>
                      <button onClick={e => { e.stopPropagation(); handleCalcular(q); }} disabled={calculating === q.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.75rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                        <Calculator size={13} /> Recalcular
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleCambiarEstado(q, 'enviada_contador'); }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                        Enviar al Contador
                      </button>
                    </>
                  )}
                  {q.estado === 'enviada_contador' && (
                    <button onClick={e => { e.stopPropagation(); handleCambiarEstado(q, 'liquidada'); }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                      Marcar Liquidada
                    </button>
                  )}
                  {q.estado === 'liquidada' && (
                    <button onClick={e => { e.stopPropagation(); handleCambiarEstado(q, 'cerrada'); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.75rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                      Cerrar
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--color-border)' }}>
                  {qDetalles.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                      {q.estado === 'abierta' ? 'Presioná "Calcular" para generar la liquidación' : 'Sin detalles'}
                    </div>
                  ) : (
                    <>
                      {/* Totals bar */}
                      <div style={{ padding: '10px 20px', background: 'var(--color-bg-surface-2)', display: 'flex', gap: 24, fontSize: '0.75rem', flexWrap: 'wrap' }}>
                        <span><strong>Quincena:</strong> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent)' }}>{fmtMoney(totQuincena)}</span></span>
                        <span><strong>Vacaciones:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMoney(totVacaciones)}</span></span>
                        <span><strong>Transferencia:</strong> <span style={{ fontFamily: 'var(--font-mono)', color: '#8b5cf6' }}>{fmtMoney(totTransferencia)}</span></span>
                        <span><strong>Efectivo:</strong> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981' }}>{fmtMoney(totEfectivo)}</span></span>
                        <span><strong>Redondeo:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMoney(totRedondeo)}</span></span>
                        <span style={{ marginLeft: 'auto' }}>{qDetalles.length} empleados</span>
                      </div>

                      <div className="table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                          <thead>
                            <tr>
                              {['#', 'Empleado', 'DNI', 'Horas', 'Hs Vac', 'Cat.', 'Quincena', 'Vacaciones', 'Transferencia', 'Efectivo', 'Redondeo', ''].map(h => (
                                <th key={h} style={{ textAlign: ['Quincena', 'Vacaciones', 'Transferencia', 'Efectivo', 'Redondeo'].includes(h) ? 'right' : 'left', padding: '8px 10px', fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {qDetalles.map((d, i) => {
                              const emp = d.empleado as any;
                              const cat = d.categoria as any;
                              const hasContador = d.quincena_contador != null;
                              return (
                                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                  <td style={{ padding: '8px 10px', fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                                  <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                                    {emp?.apellido} {emp?.nombre}
                                    {emp?.es_revestimiento && <span style={{ marginLeft: 4, fontSize: '0.5rem', fontWeight: 700, padding: '1px 4px', borderRadius: 10, background: '#8b5cf618', color: '#8b5cf6' }}>REV</span>}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{emp?.dni || '—'}</td>
                                  <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--color-text-primary)', fontWeight: 600 }}>{d.horas_normales + d.horas_extra_50 + d.horas_extra_100}</td>
                                  <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: d.horas_vacaciones > 0 ? '#f59e0b' : 'var(--color-text-muted)' }}>{d.horas_vacaciones || '—'}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-primary)' }}>{cat?.nombre || '—'}</span>
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{fmtMoney(d.pago_total)}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: d.monto_vacaciones > 0 ? '#f59e0b' : 'var(--color-text-muted)' }}>{d.monto_vacaciones > 0 ? fmtMoney(d.monto_vacaciones) : '—'}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: hasContador ? '#8b5cf6' : 'var(--color-text-muted)', background: hasContador ? '#8b5cf608' : undefined }}>{hasContador ? fmtMoney((d.quincena_contador || 0) + (d.vacaciones_contador || 0)) : '—'}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8125rem', color: (d.monto_efectivo || 0) > 0 ? '#10b981' : 'var(--color-text-muted)' }}>{(d.monto_efectivo || 0) > 0 ? fmtMoney(d.monto_efectivo) : '—'}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: d.redondeo > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{d.redondeo > 0 ? fmtMoney(d.redondeo) : '—'}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                    <button onClick={() => setEditingDetalle({ ...d })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }} title="Editar datos contador">
                                      <Edit2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Nueva Quincena */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ width: 400, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Nueva Quincena</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Período *</label>
              <StyledSelect value={newPeriodo} onChange={e => setNewPeriodo(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                <option value="">Seleccionar...</option>
                {opts.filter(o => !existingPeriods.has(o.periodo)).map(o => (
                  <option key={o.periodo} value={o.periodo}>{o.periodo} ({o.desde} → {o.hasta})</option>
                ))}
              </StyledSelect>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !newPeriodo} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Detalle (datos del contador) */}
      {editingDetalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditingDetalle(null)}>
          <div className="card" style={{ width: 480, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                Datos del Contador — {(editingDetalle.empleado as any)?.apellido}
              </h2>
              <button onClick={() => setEditingDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            {/* Resumen del empleado */}
            <div style={{ padding: 12, background: 'var(--color-bg-surface-2)', borderRadius: 8, marginBottom: 16, fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Quincena (ustedes):</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtMoney(editingDetalle.pago_total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Vacaciones:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMoney(editingDetalle.monto_vacaciones)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>
                <span style={{ fontWeight: 600 }}>Total adeudado:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent)' }}>{fmtMoney(editingDetalle.pago_total + editingDetalle.monto_vacaciones)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Quincena Transferencia (lo que liquida el contador)</label>
                <input type="number" step="0.01" value={editingDetalle.quincena_contador || ''} onChange={e => setEditingDetalle({ ...editingDetalle, quincena_contador: parseFloat(e.target.value) || null })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Vacaciones Transferencia</label>
                <input type="number" step="0.01" value={editingDetalle.vacaciones_contador || ''} onChange={e => setEditingDetalle({ ...editingDetalle, vacaciones_contador: parseFloat(e.target.value) || null })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Adelanto</label>
                <input type="number" step="0.01" value={editingDetalle.monto_adelanto || ''} onChange={e => setEditingDetalle({ ...editingDetalle, monto_adelanto: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} placeholder="0.00" />
              </div>

              {/* Preview */}
              {editingDetalle.quincena_contador != null && (
                <div style={{ padding: 12, background: '#10b98110', borderRadius: 8, border: '1px solid #10b98130' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', marginBottom: 4 }}>Resultado</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span>Efectivo:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981' }}>
                      {fmtMoney((editingDetalle.pago_total + editingDetalle.monto_vacaciones) - (editingDetalle.quincena_contador || 0) - (editingDetalle.vacaciones_contador || 0))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginTop: 2 }}>
                    <span>Redondeo:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {fmtMoney(Math.round(((editingDetalle.pago_total + editingDetalle.monto_vacaciones) - (editingDetalle.quincena_contador || 0) - (editingDetalle.vacaciones_contador || 0)) / 1000) * 1000)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setEditingDetalle(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveDetalle} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
