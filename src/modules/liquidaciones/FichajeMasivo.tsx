import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Save, Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import type { Empleado, Obra } from './types';

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function formatDate(d: Date) { return d.toISOString().slice(0, 10); }

function getQuincenaDates(base: Date): { label: string; desde: string; hasta: string; dates: string[] } {
  const y = base.getFullYear();
  const m = base.getMonth();
  const day = base.getDate();
  const mStr = String(m + 1).padStart(2, '0');
  const lastDay = new Date(y, m + 1, 0).getDate();

  let desde: string, hasta: string, label: string;
  if (day <= 15) {
    desde = `${y}-${mStr}-01`;
    hasta = `${y}-${mStr}-15`;
    label = `1Q ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m]} ${y}`;
  } else {
    desde = `${y}-${mStr}-16`;
    hasta = `${y}-${mStr}-${lastDay}`;
    label = `2Q ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m]} ${y}`;
  }

  const dates: string[] = [];
  const d = new Date(desde + 'T12:00:00');
  const endD = new Date(hasta + 'T12:00:00');
  while (d <= endD) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return { label, desde, hasta, dates };
}

function getDow(fecha: string) { return new Date(fecha + 'T12:00:00').getDay(); }

interface CellData {
  obra_id: string;
  entrada: string;
  salida: string;
  feriado: boolean;
  existing_id?: string; // if already saved
}

type GridData = Record<string, Record<string, CellData | null>>; // empId -> fecha -> data

export default function FichajeMasivo() {
  const { tenant } = useTenant();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [grid, setGrid] = useState<GridData>({});
  const [selectedEmps, setSelectedEmps] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);

  // Bulk assign form
  const [bulkObra, setBulkObra] = useState('');
  const [bulkHoras, setBulkHoras] = useState<9 | 8 | 5>(9); // 9=Lu-Ju, 8=Vie, 5=sábado
  const [bulkEntrada, setBulkEntrada] = useState('08:00');
  const [bulkDias, setBulkDias] = useState<string[]>([]);
  const [bulkSobreescribir, setBulkSobreescribir] = useState(false); // allow overwrite existing

  const q = getQuincenaDates(baseDate);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);
  useEffect(() => { if (tenant && empleados.length) loadFichajes(); }, [q.desde, tenant, empleados.length]);

  const loadData = async () => {
    setLoading(true);
    const [empRes, obrasRes] = await Promise.all([
      supabase.from('liq_empleados').select('*, categoria:liq_categorias(id, nombre)').eq('tenant_id', tenant!.id).eq('estado', 'activo').order('apellido'),
      supabase.from('liq_obras').select('*').eq('tenant_id', tenant!.id).eq('estado', 'activa').order('nombre'),
    ]);
    setEmpleados(empRes.data || []);
    setObras(obrasRes.data || []);
    setLoading(false);
  };

  const loadFichajes = async () => {
    const { data } = await supabase.from('liq_fichajes').select('*')
      .eq('tenant_id', tenant!.id)
      .gte('fecha', q.desde).lte('fecha', q.hasta);

    const newGrid: GridData = {};
    (data || []).forEach(f => {
      if (!newGrid[f.empleado_id]) newGrid[f.empleado_id] = {};
      newGrid[f.empleado_id][f.fecha] = {
        obra_id: f.obra_id,
        entrada: f.hora_entrada,
        salida: f.hora_salida || '',
        feriado: f.es_feriado,
        existing_id: f.id,
      };
    });
    setGrid(newGrid);
  };

  const prevQ = () => {
    const d = new Date(baseDate);
    if (d.getDate() <= 15) { d.setMonth(d.getMonth() - 1); d.setDate(16); }
    else { d.setDate(1); }
    setBaseDate(d);
  };

  const nextQ = () => {
    const d = new Date(baseDate);
    if (d.getDate() <= 15) { d.setDate(16); }
    else { d.setMonth(d.getMonth() + 1); d.setDate(1); }
    setBaseDate(d);
  };

  const setCell = (empId: string, fecha: string, data: CellData | null) => {
    setGrid(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [fecha]: data },
    }));
  };

  const toggleEmp = (empId: string) => {
    setSelectedEmps(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedEmps.size === empleados.length) {
      setSelectedEmps(new Set());
    } else {
      setSelectedEmps(new Set(empleados.map(e => e.id)));
    }
  };

  const calcSalida = (entrada: string, horas: number, dow: number): string => {
    // Add lunch hour (12-13) for weekdays with 8+ hours
    const [eh, em] = entrada.split(':').map(Number);
    const totalMin = eh * 60 + em + (horas * 60) + (horas >= 8 && dow !== 6 ? 60 : 0); // +60 lunch
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const applyBulk = () => {
    if (!bulkObra || bulkDias.length === 0 || selectedEmps.size === 0) return;
    const newGrid = { ...grid };
    selectedEmps.forEach(empId => {
      if (!newGrid[empId]) newGrid[empId] = {};
      bulkDias.forEach(fecha => {
        const existing = newGrid[empId][fecha];
        if (existing?.existing_id && !bulkSobreescribir) return; // Skip saved unless overwrite
        const dow = getDow(fecha);
        // Auto hours: viernes=8, sábado=bulkHoras, resto=bulkHoras
        const horasEfectivas = dow === 5 ? Math.min(bulkHoras, 8) : bulkHoras;
        const salida = calcSalida(bulkEntrada, horasEfectivas, dow);
        newGrid[empId][fecha] = {
          obra_id: bulkObra,
          entrada: bulkEntrada,
          salida,
          feriado: false,
          existing_id: existing?.existing_id, // preserve ID if overwriting
        };
      });
    });
    setGrid(newGrid);
    setShowBulk(false);
    setSavedCount(0);
  };

  const handleSave = async () => {
    setSaving(true);
    let count = 0;
    const inserts: any[] = [];
    const updates: { id: string; data: any }[] = [];

    Object.entries(grid).forEach(([empId, dates]) => {
      Object.entries(dates).forEach(([fecha, cell]) => {
        if (!cell || !cell.obra_id || !cell.entrada) return;
        const payload = {
          empleado_id: empId,
          obra_id: cell.obra_id,
          fecha,
          hora_entrada: cell.entrada,
          hora_salida: cell.salida || null,
          es_feriado: cell.feriado,
        };
        if (cell.existing_id) {
          updates.push({ id: cell.existing_id, data: { ...payload, updated_at: new Date().toISOString() } });
        } else {
          inserts.push({ ...payload, tenant_id: tenant!.id });
        }
        count++;
      });
    });

    // Batch insert
    if (inserts.length > 0) {
      await supabase.from('liq_fichajes').insert(inserts);
    }
    // Batch update
    for (const u of updates) {
      await supabase.from('liq_fichajes').update(u.data).eq('id', u.id);
    }

    setSaving(false);
    setSavedCount(count);
    loadFichajes(); // Reload to get IDs
  };

  const clearCell = (empId: string, fecha: string) => {
    const cell = grid[empId]?.[fecha];
    if (cell?.existing_id) {
      supabase.from('liq_fichajes').delete().eq('id', cell.existing_id).then(() => {});
    }
    setCell(empId, fecha, null);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  // Count cells with data
  const totalCells = Object.values(grid).reduce((sum, dates) => sum + Object.values(dates).filter(c => c && c.obra_id).length, 0);
  const unsavedCells = Object.values(grid).reduce((sum, dates) => sum + Object.values(dates).filter(c => c && c.obra_id && !c.existing_id).length, 0);

  // Workable days (not Sunday)
  const workDays = q.dates.filter(d => getDow(d) !== 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevQ} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><ChevronLeft size={18} /></button>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{q.label}</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: 2 }}>{q.desde} → {q.hasta} · {totalCells} fichajes ({unsavedCells > 0 ? `${unsavedCells} sin guardar` : 'todo guardado'})</p>
          </div>
          <button onClick={nextQ} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setBulkObra(obras[0]?.id || ''); setBulkEntrada('08:00'); setBulkSalida('18:00'); setBulkDias(workDays); setShowBulk(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            <Plus size={14} /> Fichaje Masivo
          </button>
          <button onClick={handleSave} disabled={saving || unsavedCells === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: unsavedCells > 0 ? '#10b981' : 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: saving || unsavedCells === 0 ? 0.6 : 1 }}>
            <Save size={15} /> {saving ? 'Guardando...' : savedCount > 0 && unsavedCells === 0 ? `${savedCount} guardados ✓` : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: q.dates.length * 56 + 250 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--color-bg-surface-2)', padding: '6px 8px', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)', minWidth: 220, textAlign: 'left' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedEmps.size === empleados.length} onChange={selectAll} />
                    Empleado
                  </label>
                </th>
                {q.dates.map(date => {
                  const dow = getDow(date);
                  const d = new Date(date + 'T12:00:00');
                  const isSun = dow === 0;
                  const isSat = dow === 6;
                  return (
                    <th key={date} style={{
                      padding: '4px 2px', fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase',
                      color: isSat ? '#f59e0b' : isSun ? '#ef4444' : 'var(--color-text-muted)',
                      background: isSun ? '#ef444408' : 'var(--color-bg-surface-2)',
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'center', minWidth: 50,
                    }}>
                      <div>{DIAS_SEMANA[dow]}</div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 1 }}>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {empleados.map((emp, idx) => {
                const catNombre = (emp.categoria as any)?.nombre || '';
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: idx % 2 === 0 ? undefined : 'var(--color-bg-surface-2)' }}>
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1,
                      background: idx % 2 === 0 ? 'var(--color-bg-surface)' : 'var(--color-bg-surface-2)',
                      padding: '4px 8px', borderRight: '1px solid var(--color-border)',
                      fontSize: '0.6875rem', whiteSpace: 'nowrap',
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedEmps.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{emp.apellido} {emp.nombre}</span>
                        {emp.es_revestimiento && <span style={{ fontSize: '0.5rem', fontWeight: 700, padding: '1px 3px', borderRadius: 4, background: '#8b5cf618', color: '#8b5cf6' }}>REV</span>}
                        <span style={{ fontSize: '0.5rem', color: 'var(--color-text-muted)' }}>{catNombre}</span>
                      </label>
                    </td>

                    {q.dates.map(date => {
                      const dow = getDow(date);
                      const isSun = dow === 0;
                      const cell = grid[emp.id]?.[date];
                      const hasData = cell && cell.obra_id;
                      const isSaved = cell?.existing_id;
                      const obra = hasData ? obras.find(o => o.id === cell!.obra_id) : null;

                      if (isSun) {
                        return <td key={date} style={{ background: '#ef444408', opacity: 0.3 }} />;
                      }

                      return (
                        <td key={date} style={{ padding: '2px', textAlign: 'center', position: 'relative' }}>
                          {hasData ? (
                            <div
                              style={{
                                padding: '2px 4px', borderRadius: 4, fontSize: '0.5rem', fontWeight: 700,
                                background: isSaved ? '#10b98118' : '#f59e0b18',
                                color: isSaved ? '#10b981' : '#f59e0b',
                                cursor: 'pointer', position: 'relative',
                                border: isSaved ? '1px solid #10b98130' : '1px dashed #f59e0b60',
                              }}
                              title={`${obra?.nombre || '?'} · ${cell!.entrada}-${cell!.salida}`}
                              onClick={() => clearCell(emp.id, date)}
                            >
                              <div>{obra?.nombre?.substring(0, 6) || '?'}</div>
                              <div style={{ fontSize: '0.4375rem', opacity: 0.8 }}>{cell!.entrada}-{cell!.salida}</div>
                            </div>
                          ) : (
                            <div
                              style={{ width: '100%', height: 28, cursor: 'pointer', borderRadius: 4 }}
                              onClick={() => {
                                if (obras.length > 0) {
                                  const horas = dow === 5 ? 8 : dow === 6 ? 5 : 9;
                                  const salida = calcSalida('08:00', horas, dow);
                                  setCell(emp.id, date, { obra_id: obras[0].id, entrada: '08:00', salida, feriado: false });
                                }
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Fichaje Masivo */}
      {showBulk && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowBulk(false)}>
          <div className="card" style={{ width: 500, maxHeight: '85vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Fichaje Masivo</h2>
              <button onClick={() => setShowBulk(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Asignar a <strong>{selectedEmps.size} empleado{selectedEmps.size !== 1 ? 's' : ''} seleccionado{selectedEmps.size !== 1 ? 's' : ''}</strong> la misma obra y horas para los días elegidos.
              {selectedEmps.size === 0 && <span style={{ color: '#ef4444' }}> (seleccioná empleados primero)</span>}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Obra *</label>
                <select value={bulkObra} onChange={e => setBulkObra(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </div>

              {/* Horas selector */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>Horas por día</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([9, 8, 5] as const).map(h => (
                    <button key={h} onClick={() => setBulkHoras(h)} style={{
                      padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
                      border: bulkHoras === h ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      background: bulkHoras === h ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                      color: bulkHoras === h ? '#fff' : 'var(--color-text-primary)',
                    }}>
                      {h}h
                      <div style={{ fontSize: '0.5625rem', fontWeight: 400, marginTop: 2, opacity: 0.8 }}>
                        {h === 9 ? 'Lu-Ju' : h === 8 ? 'Viernes' : 'Sábado'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Entrada</label>
                <input type="time" value={bulkEntrada} onChange={e => setBulkEntrada(e.target.value)} style={{ width: 140, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                <span style={{ marginLeft: 10, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Salida auto: Lu-Ju {calcSalida(bulkEntrada, bulkHoras, 1)}, Vie {calcSalida(bulkEntrada, Math.min(bulkHoras, 8), 5)}
                </span>
              </div>

              {/* Overwrite toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: bulkSobreescribir ? '#f59e0b10' : 'var(--color-bg-surface-2)', border: bulkSobreescribir ? '1px solid #f59e0b40' : '1px solid transparent' }}>
                <input type="checkbox" checked={bulkSobreescribir} onChange={e => setBulkSobreescribir(e.target.checked)} />
                <div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Sobreescribir fichajes existentes</span>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Útil para cargar extras o corregir masivamente</div>
                </div>
              </label>

              {/* Day selector */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, display: 'block' }}>Días a fichar</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setBulkDias(bulkDias.length === workDays.length ? [] : [...workDays])}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: bulkDias.length === workDays.length ? 'var(--color-accent)' : 'var(--color-bg-surface)', color: bulkDias.length === workDays.length ? '#fff' : 'var(--color-text-primary)', fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer', marginRight: 8 }}
                  >
                    TODOS
                  </button>
                  {q.dates.map(date => {
                    const dow = getDow(date);
                    if (dow === 0) return null;
                    const d = new Date(date + 'T12:00:00');
                    const selected = bulkDias.includes(date);
                    const isSat = dow === 6;
                    return (
                      <button
                        key={date}
                        onClick={() => setBulkDias(prev => prev.includes(date) ? prev.filter(x => x !== date) : [...prev, date])}
                        style={{
                          padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                          border: selected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                          background: selected ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                          color: selected ? '#fff' : isSat ? '#f59e0b' : 'var(--color-text-primary)',
                          fontSize: '0.625rem', fontWeight: 700,
                        }}
                      >
                        <div>{DIAS_SEMANA[dow]}</div>
                        <div>{d.getDate()}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowBulk(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', fontSize: '0.8125rem', color: 'var(--color-text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={applyBulk} disabled={selectedEmps.size === 0 || !bulkObra || bulkDias.length === 0} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', opacity: selectedEmps.size === 0 ? 0.6 : 1 }}>
                Aplicar a {selectedEmps.size} empleados × {bulkDias.length} días
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
