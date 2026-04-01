import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { Plus, X, Check, ChevronRight, ChevronLeft, Search, ArrowUpRight, ArrowDownRight, Trash2, LayoutList, CalendarDays, Calendar, Copy } from 'lucide-react';
import ProjectSearch from './components/ProjectSearch';
import StyledSelect from '../../shared/components/StyledSelect';

interface Proyeccion {
  id: string;
  tipo: 'cobranza' | 'pago';
  concepto: string;
  monto: number;
  fecha_prevista: string;
  estado: 'pendiente' | 'realizado' | 'vencido' | 'cancelado';
  contacto: string | null;
  categoria: string | null;
  cuenta_destino_id: string | null;
  notas: string | null;
  proyecto_nombre: string | null;
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#F59E0B', realizado: '#10B981', vencido: '#EF4444', cancelado: '#94A3B8',
};

interface LoteRow {
  tipo: 'cobranza' | 'pago';
  concepto: string;
  monto: number;
  fecha_prevista: string;
  contacto: string;
  proyecto_nombre: string;
}
const emptyRow = (): LoteRow => ({ tipo: 'pago', concepto: '', monto: 0, fecha_prevista: new Date().toISOString().slice(0, 10), contacto: '', proyecto_nombre: '' });

export default function ProyeccionesTesoreria() {
  const { tenant } = useTenant();
  const [proyecciones, setProyecciones] = useState<Proyeccion[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'single' | 'lote' | null>(null);
  const [filterTipo, setFilterTipo] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'month' | 'week'>('table');
  const [calDate, setCalDate] = useState(new Date());

  // Form single
  const [formTipo, setFormTipo] = useState<'cobranza' | 'pago'>('cobranza');
  const [formConcepto, setFormConcepto] = useState('');
  const [formMonto, setFormMonto] = useState(0);
  const [formFecha, setFormFecha] = useState('');
  const [formContacto, setFormContacto] = useState('');
  const [formCategoria, setFormCategoria] = useState('');
  const [formCuenta, setFormCuenta] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formProyecto, setFormProyecto] = useState('');

  // Form lote
  const [loteRows, setLoteRows] = useState<LoteRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);

  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [pRes, aRes] = await Promise.all([
      supabase.from('tesoreria_proyecciones').select('*').eq('tenant_id', tenant!.id).order('fecha_prevista'),
      supabase.from('treasury_accounts').select('id, name').eq('tenant_id', tenant!.id).order('name'),
    ]);
    setProyecciones((pRes.data as any) || []);
    if (aRes.data) setAccounts(aRes.data);
    setLoading(false);
  };

  const openSingle = () => {
    setFormTipo('cobranza'); setFormConcepto(''); setFormMonto(0);
    setFormFecha(new Date().toISOString().slice(0, 10)); setFormContacto('');
    setFormCategoria(''); setFormCuenta(''); setFormNotas(''); setFormProyecto('');
    setModalMode('single');
  };

  const openLote = () => {
    setLoteRows([emptyRow(), emptyRow(), emptyRow()]);
    setModalMode('lote');
  };

  const saveSingle = async () => {
    if (!formConcepto.trim() || !formMonto) return;
    setSaving(true);
    await supabase.from('tesoreria_proyecciones').insert({
      tenant_id: tenant!.id, tipo: formTipo, concepto: formConcepto.trim(),
      monto: formMonto, fecha_prevista: formFecha,
      contacto: formContacto.trim() || null, categoria: formCategoria.trim() || null,
      cuenta_destino_id: formCuenta || null, notas: formNotas.trim() || null,
      proyecto_nombre: formProyecto.trim() || null,
      estado: 'pendiente',
    });
    setSaving(false);
    setModalMode(null);
    loadData();
  };

  const saveLote = async () => {
    const valid = loteRows.filter(r => r.concepto.trim() && r.monto > 0);
    if (!valid.length) return;
    setSaving(true);
    await supabase.from('tesoreria_proyecciones').insert(
      valid.map(r => ({
        tenant_id: tenant!.id, tipo: r.tipo, concepto: r.concepto.trim(),
        monto: r.monto, fecha_prevista: r.fecha_prevista,
        contacto: r.contacto.trim() || null,
        proyecto_nombre: r.proyecto_nombre.trim() || null,
        estado: 'pendiente',
      }))
    );
    setSaving(false);
    setModalMode(null);
    loadData();
  };

  const updateLoteRow = (idx: number, field: keyof LoteRow, value: any) => {
    setLoteRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const marcarRealizado = async (p: Proyeccion) => {
    await supabase.from('tesoreria_proyecciones').update({ estado: 'realizado' }).eq('id', p.id);
    const targetAccount = p.cuenta_destino_id ? accounts.find(a => a.id === p.cuenta_destino_id) : accounts[0];
    if (targetAccount) {
      await supabase.from('treasury_transactions').insert({
        tenant_id: tenant!.id, account_id: targetAccount.id,
        type: p.tipo === 'cobranza' ? 'income' : 'expense',
        amount: p.monto, description: p.concepto,
        date: new Date().toISOString().slice(0, 10),
        status: 'completado', payment_method: 'transferencia',
        contact_name: p.contacto || '', project_name: p.proyecto_nombre || '',
      });
    }
    loadData();
  };

  const moverFecha = async (p: Proyeccion, nuevaFecha: string) => {
    await supabase.from('tesoreria_proyecciones').update({ fecha_prevista: nuevaFecha }).eq('id', p.id);
    loadData();
  };

  const cancelar = async (p: Proyeccion) => {
    await supabase.from('tesoreria_proyecciones').update({ estado: 'cancelado' }).eq('id', p.id);
    loadData();
  };

  const remove = (p: Proyeccion) => {
    requestDelete('Esta acción eliminará la proyección y no se puede deshacer.', async () => {
      await supabase.from('tesoreria_proyecciones').delete().eq('id', p.id);
      loadData();
    });
  };

  const filtered = proyecciones.filter(p => {
    if (filterTipo === 'cobranza' && p.tipo !== 'cobranza') return false;
    if (filterTipo === 'pago' && p.tipo !== 'pago') return false;
    if (filterTipo === 'pendiente' && p.estado !== 'pendiente') return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.concepto.toLowerCase().includes(q) && !(p.contacto || '').toLowerCase().includes(q) && !(p.proyecto_nombre || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const cobranzasPend = proyecciones.filter(p => p.tipo === 'cobranza' && p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0);
  const pagosPend = proyecciones.filter(p => p.tipo === 'pago' && p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0);
  const saldoNeto = cobranzasPend - pagosPend;
  const realizados = proyecciones.filter(p => p.estado === 'realizado').length;

  const fmtMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${Math.abs(n).toLocaleString('es-AR')}`;

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando proyecciones...</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
  };

  const isCobranza = (p: Proyeccion) => p.tipo === 'cobranza';
  const canSaveSingle = !!(formConcepto.trim() && formMonto);
  const loteValidCount = loteRows.filter(r => r.concepto.trim() && r.monto > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Proyecciones</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar concepto, contacto u obra..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <StyledSelect value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos</option>
          <option value="cobranza">Cobranzas</option>
          <option value="pago">Pagos</option>
          <option value="pendiente">Solo pendientes</option>
        </StyledSelect>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button onClick={() => setViewMode('table')} title="Tabla" style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'table' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--color-text-muted)' }}><LayoutList size={14} /></button>
          <button onClick={() => setViewMode('month')} title="Mes" style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'month' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'month' ? '#fff' : 'var(--color-text-muted)' }}><CalendarDays size={14} /></button>
          <button onClick={() => setViewMode('week')} title="Semana" style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'week' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'week' ? '#fff' : 'var(--color-text-muted)' }}><Calendar size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={openLote} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
            <Copy size={14} /> Cargar lote
          </button>
          <button onClick={openSingle} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>{fmtMoney(cobranzasPend)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Cobranzas pendientes</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#EF4444', fontFamily: 'var(--font-mono)' }}>{fmtMoney(pagosPend)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Pagos pendientes</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: saldoNeto >= 0 ? '#10B981' : '#EF4444', fontFamily: 'var(--font-mono)' }}>{saldoNeto < 0 ? '-' : ''}{fmtMoney(saldoNeto)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Saldo neto proyectado</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{realizados}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Realizados</div>
        </div>
      </div>

      {/* ─── TABLE VIEW ─── */}
      {viewMode === 'table' && (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 100px 90px 80px 110px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
            <span>Fecha</span><span>Concepto</span><span>Contacto</span><span>Obra</span><span style={{ textAlign: 'right' }}>Monto</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
          </div>
          {filtered.map(p => {
            const isPending = p.estado === 'pendiente';
            return (
              <div key={p.id}
                style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 100px 90px 80px 110px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s', opacity: !isPending ? 0.6 : 1 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {new Date(p.fecha_prevista + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.concepto}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: isCobranza(p) ? '#10B98115' : '#EF444415', color: isCobranza(p) ? '#10B981' : '#EF4444' }}>{isCobranza(p) ? 'Cobranza' : 'Pago'}</span>
                    {p.categoria && <span style={{ fontSize: '0.5625rem', color: 'var(--color-text-faint)' }}>{p.categoria}</span>}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.contacto || '—'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.proyecto_nombre || '—'}
                </div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                  {isCobranza(p) ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#EF4444" />}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700, color: isCobranza(p) ? '#10B981' : '#EF4444' }}>${p.monto.toLocaleString('es-AR')}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado]}15`, color: ESTADO_COLOR[p.estado], textTransform: 'capitalize' }}>{p.estado}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {isPending && (
                    <div className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); marcarRealizado(p); }}
                        style={{ ...iconBtn, color: '#10B981', borderColor: '#10B98130' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#10B98110'; e.currentTarget.style.borderColor = '#10B981'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#10B98130'; }}>
                        <Check size={14} />
                      </button>
                      <span className="row-action-tooltip">{isCobranza(p) ? 'Cobrado' : 'Pagado'}</span>
                    </div>
                  )}
                  {isPending && (
                    <div className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); const nf = prompt('Nueva fecha (YYYY-MM-DD):', p.fecha_prevista); if (nf) moverFecha(p, nf); }}
                        style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                        <CalendarDays size={13} />
                      </button>
                      <span className="row-action-tooltip">Mover fecha</span>
                    </div>
                  )}
                  {isPending && (
                    <div className="row-action-wrap">
                      <button onClick={e => { e.stopPropagation(); cancelar(p); }}
                        style={{ ...iconBtn, color: '#94A3B8', borderColor: '#94A3B820' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#94A3B810'; e.currentTarget.style.borderColor = '#94A3B8'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#94A3B820'; }}>
                        <X size={14} />
                      </button>
                      <span className="row-action-tooltip">Cancelar</span>
                    </div>
                  )}
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); remove(p); }}
                      style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                      <Trash2 size={14} />
                    </button>
                    <span className="row-action-tooltip">Eliminar</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin proyecciones</div>}
        </div>
      )}

      {/* ─── MONTH CALENDAR VIEW ─── */}
      {viewMode === 'month' && (() => {
        const year = calDate.getFullYear();
        const month = calDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const monthLabel = calDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const byDate: Record<string, Proyeccion[]> = {};
        filtered.forEach(p => { const d = p.fecha_prevista; if (!byDate[d]) byDate[d] = []; byDate[d].push(p); });
        return (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <button onClick={() => setCalDate(new Date(year, month - 1, 1))} style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}><ChevronLeft size={16} /></button>
              <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.95rem' }}>{monthLabel}</span>
              <button onClick={() => setCalDate(new Date(year, month + 1, 1))} style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}><ChevronRight size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '0.25rem 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayItems = byDate[dateKey] || [];
                const income = dayItems.filter(p => p.tipo === 'cobranza').reduce((s, p) => s + p.monto, 0);
                const expense = dayItems.filter(p => p.tipo === 'pago').reduce((s, p) => s + p.monto, 0);
                const isToday = dateKey === new Date().toISOString().slice(0, 10);
                return (
                  <div key={day} style={{ minHeight: 64, borderRadius: 8, border: `1px solid ${isToday ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, padding: '0.3rem', background: isToday ? 'rgba(37,99,235,0.03)' : 'var(--color-bg-surface)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--color-cta, #2563EB)' : 'var(--color-text-primary)', marginBottom: 2 }}>{day}</div>
                    {income > 0 && <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#10B981', lineHeight: 1.3 }}>+${(income / 1000).toFixed(0)}K</div>}
                    {expense > 0 && <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#EF4444', lineHeight: 1.3 }}>-${(expense / 1000).toFixed(0)}K</div>}
                    {dayItems.length > 0 && <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                      {dayItems.slice(0, 3).map((p, idx) => <div key={idx} style={{ width: 5, height: 5, borderRadius: 99, background: p.tipo === 'cobranza' ? '#10B981' : '#EF4444' }} />)}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── WEEK VIEW ─── */}
      {viewMode === 'week' && (() => {
        const today = calDate;
        const dayOfWeek = today.getDay();
        const weekStart = new Date(today); weekStart.setDate(today.getDate() - dayOfWeek);
        const days: string[] = [];
        for (let i = 0; i < 7; i++) { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
        const byDate: Record<string, Proyeccion[]> = {};
        filtered.forEach(p => { const d = p.fecha_prevista; if (!byDate[d]) byDate[d] = []; byDate[d].push(p); });
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <button onClick={() => setCalDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}><ChevronLeft size={16} /></button>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Semana del {new Date(days[0] + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} al {new Date(days[6] + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
              <button onClick={() => setCalDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}><ChevronRight size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {days.map((dateKey, i) => {
                const dayItems = byDate[dateKey] || [];
                const isToday = dateKey === new Date().toISOString().slice(0, 10);
                const dayNum = new Date(dateKey + 'T12:00:00').getDate();
                return (
                  <div key={dateKey} style={{ borderRadius: 10, border: `1.5px solid ${isToday ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, padding: '0.5rem', minHeight: 120, background: isToday ? 'rgba(37,99,235,0.03)' : 'var(--color-bg-surface)' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: isToday ? 'var(--color-cta, #2563EB)' : 'var(--color-text-muted)', marginBottom: 6, textAlign: 'center' }}>{dayNames[i]} {dayNum}</div>
                    {dayItems.map(p => (
                      <div key={p.id} style={{ padding: '4px 6px', borderRadius: 6, marginBottom: 4, background: p.tipo === 'cobranza' ? '#10B98110' : '#EF444410', borderLeft: `3px solid ${p.tipo === 'cobranza' ? '#10B981' : '#EF4444'}`, cursor: 'pointer' }}
                        onClick={() => { if (p.estado === 'pendiente') { const nf = prompt('Mover a fecha (YYYY-MM-DD):', p.fecha_prevista); if (nf) moverFecha(p, nf); } }}>
                        <div style={{ fontSize: '0.625rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }}>{p.concepto.length > 20 ? p.concepto.slice(0, 20) + '...' : p.concepto}</div>
                        <div style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: p.tipo === 'cobranza' ? '#10B981' : '#EF4444' }}>${(p.monto / 1000).toFixed(0)}K</div>
                      </div>
                    ))}
                    {dayItems.length === 0 && <div style={{ fontSize: '0.625rem', color: 'var(--color-text-faint)', textAlign: 'center', padding: '1rem 0' }}>—</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── MODAL: SINGLE ─── */}
      {modalMode === 'single' && (
        <div className="wizard-overlay" onClick={() => setModalMode(null)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="wizard-header">
              <h3>Nueva proyección</h3>
              <button className="wizard-close" onClick={() => setModalMode(null)}><X size={18} /></button>
            </div>
            <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="wizard-field">
                <div className="wizard-section-title">Tipo</div>
                <div className="wizard-pills" style={{ marginTop: 8 }}>
                  <button className={`wizard-pill${formTipo === 'cobranza' ? ' selected' : ''}`}
                    onClick={() => setFormTipo('cobranza')}
                    style={formTipo === 'cobranza' ? { background: '#10B981', borderColor: '#10B981' } : {}}>
                    Cobranza
                  </button>
                  <button className={`wizard-pill${formTipo === 'pago' ? ' selected' : ''}`}
                    onClick={() => setFormTipo('pago')}
                    style={formTipo === 'pago' ? { background: '#EF4444', borderColor: '#EF4444' } : {}}>
                    Pago
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="wizard-field">
                  <label className="form-label">Concepto *</label>
                  <input className="form-input" value={formConcepto} onChange={e => setFormConcepto(e.target.value)} placeholder="Factura #1234" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Monto *</label>
                  <input type="number" className="form-input" value={formMonto || ''} onChange={e => setFormMonto(Number(e.target.value))} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="wizard-field">
                  <label className="form-label">Fecha prevista</label>
                  <input type="date" className="form-input" value={formFecha} onChange={e => setFormFecha(e.target.value)} />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Contacto</label>
                  <input className="form-input" value={formContacto} onChange={e => setFormContacto(e.target.value)} placeholder="Proveedor X" />
                </div>
              </div>
              <div className="wizard-field">
                <label className="form-label">Obra / Centro de costos</label>
                <ProjectSearch value={formProyecto} onChange={setFormProyecto} tenant={tenant} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="wizard-field">
                  <label className="form-label">Categoría</label>
                  <input className="form-input" value={formCategoria} onChange={e => setFormCategoria(e.target.value)} placeholder="servicios, impuestos..." />
                </div>
                {accounts.length > 0 && (
                  <div className="wizard-field">
                    <label className="form-label">Cuenta destino</label>
                    <StyledSelect className="form-input" value={formCuenta} onChange={e => setFormCuenta(e.target.value)}>
                      <option value="">Sin asignar</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </StyledSelect>
                  </div>
                )}
              </div>
              <div className="wizard-field">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={2} value={formNotas} onChange={e => setFormNotas(e.target.value)} placeholder="Notas adicionales..." />
              </div>
            </div>
            <div className="wizard-footer">
              <div className="wizard-footer-left" />
              <div className="wizard-footer-right">
                <button className="wizard-btn-back" onClick={() => setModalMode(null)}>Cancelar</button>
                <button className="wizard-btn-next" onClick={saveSingle} disabled={!canSaveSingle || saving}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {saving ? 'Guardando...' : 'Confirmar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: LOTE ─── */}
      {modalMode === 'lote' && (
        <div className="wizard-overlay" onClick={() => setModalMode(null)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="wizard-header">
              <h3>Cargar lote de proyecciones</h3>
              <button className="wizard-close" onClick={() => setModalMode(null)}><X size={18} /></button>
            </div>
            <div className="wizard-body" style={{ padding: '0.75rem' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Tipo</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Concepto *</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Monto *</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Fecha</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Contacto</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Obra</th>
                      <th style={{ width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loteRows.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: '4px' }}>
                          <StyledSelect className="form-input" value={row.tipo} onChange={e => updateLoteRow(idx, 'tipo', e.target.value)} style={{ height: 30, fontSize: '0.75rem', minWidth: 90 }}>
                            <option value="cobranza">Cobranza</option>
                            <option value="pago">Pago</option>
                          </StyledSelect>
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input className="form-input" value={row.concepto} onChange={e => updateLoteRow(idx, 'concepto', e.target.value)} placeholder="Concepto" style={{ height: 30, fontSize: '0.75rem' }} />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input type="number" className="form-input" value={row.monto || ''} onChange={e => updateLoteRow(idx, 'monto', Number(e.target.value))} placeholder="0" style={{ height: 30, fontSize: '0.75rem', width: 80 }} />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input type="date" className="form-input" value={row.fecha_prevista} onChange={e => updateLoteRow(idx, 'fecha_prevista', e.target.value)} style={{ height: 30, fontSize: '0.75rem' }} />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input className="form-input" value={row.contacto} onChange={e => updateLoteRow(idx, 'contacto', e.target.value)} placeholder="Contacto" style={{ height: 30, fontSize: '0.75rem' }} />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input className="form-input" value={row.proyecto_nombre} onChange={e => updateLoteRow(idx, 'proyecto_nombre', e.target.value)} placeholder="Obra" style={{ height: 30, fontSize: '0.75rem' }} />
                        </td>
                        <td style={{ padding: '4px' }}>
                          {loteRows.length > 1 && (
                            <button onClick={() => setLoteRows(prev => prev.filter((_, i) => i !== idx))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2 }}>
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => setLoteRows(prev => [...prev, emptyRow()])}
                style={{ marginTop: 8, background: 'none', border: '1px dashed var(--color-border-subtle)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
                <Plus size={13} /> Agregar fila
              </button>
            </div>
            <div className="wizard-footer">
              <div className="wizard-footer-left">
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{loteValidCount} válida{loteValidCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="wizard-footer-right">
                <button className="wizard-btn-back" onClick={() => setModalMode(null)}>Cancelar</button>
                <button className="wizard-btn-next" onClick={saveLote} disabled={!loteValidCount || saving}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {saving ? 'Guardando...' : `Confirmar (${loteValidCount})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ConfirmModal}
    </div>
  );
}
