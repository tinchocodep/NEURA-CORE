import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Plus, X, Check, ChevronRight, ChevronLeft, Search, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import CustomSelect from '../../shared/components/CustomSelect';

interface Proyeccion {
  id: string; tipo: 'ingreso' | 'gasto'; concepto: string; monto: number;
  fecha_prevista: string; estado: 'pendiente' | 'cobrado' | 'pagado';
  contrato_id: string | null; categoria: string | null;
}
interface Contrato {
  id: string; monto_mensual: number; moneda: string; fecha_fin: string;
  inquilino_id: string;
  propiedad: { direccion: string } | null;
  inquilino: { razon_social: string } | null;
}

const ESTADO_COLOR: Record<string, string> = { pendiente: '#F59E0B', cobrado: '#10B981', pagado: '#10B981' };

export default function ProyeccionesInmob() {
  const { tenant } = useTenant();
  const [proyecciones, setProyecciones] = useState<Proyeccion[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [filterTipo, setFilterTipo] = useState('');
  const [search, setSearch] = useState('');

  // Form
  const [formTipo, setFormTipo] = useState<'ingreso' | 'gasto'>('ingreso');
  const [formConcepto, setFormConcepto] = useState('');
  const [formMonto, setFormMonto] = useState(0);
  const [formFecha, setFormFecha] = useState('');
  const [formContrato, setFormContrato] = useState('');
  const [formCategoria, setFormCategoria] = useState('');

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [pRes, cRes, aRes] = await Promise.all([
      supabase.from('inmobiliaria_proyecciones').select('*').eq('tenant_id', tenant!.id).order('fecha_prevista'),
      supabase.from('inmobiliaria_contratos')
        .select('id, monto_mensual, moneda, fecha_fin, inquilino_id, propiedad:inmobiliaria_propiedades(direccion), inquilino:contable_clientes!inquilino_id(razon_social)')
        .eq('tenant_id', tenant!.id).eq('estado', 'vigente'),
      supabase.from('treasury_accounts').select('id, name').eq('tenant_id', tenant!.id).order('name'),
    ]);

    let items: Proyeccion[] = pRes.data as any || [];

    // Auto-generate projected income from contracts (next 3 months)
    if (cRes.data) {
      setContratos(cRes.data as any);
      const now = new Date();
      const existingKeys = new Set(items.map(p => `${p.contrato_id}-${p.fecha_prevista}`));

      for (const c of cRes.data as any[]) {
        for (let m = 0; m < 3; m++) {
          const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
          const fechaKey = d.toISOString().slice(0, 10);
          const key = `${c.id}-${fechaKey}`;
          if (!existingKeys.has(key)) {
            items.push({
              id: `auto-${key}`,
              tipo: 'ingreso',
              concepto: `Alquiler ${c.propiedad?.direccion || '—'} - ${d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`,
              monto: c.monto_mensual,
              fecha_prevista: fechaKey,
              estado: 'pendiente',
              contrato_id: c.id,
              categoria: 'alquiler',
            });
          }
        }
      }
    }

    items.sort((a, b) => a.fecha_prevista.localeCompare(b.fecha_prevista));
    setProyecciones(items);
    if (aRes.data) setAccounts(aRes.data);
    setLoading(false);
  };

  const openNew = () => {
    setFormTipo('gasto'); setFormConcepto(''); setFormMonto(0);
    setFormFecha(new Date().toISOString().slice(0, 10)); setFormContrato(''); setFormCategoria('');
    setWizardStep(0); setShowModal(true);
  };

  const save = async () => {
    if (!formConcepto.trim() || !formMonto) return;
    await supabase.from('inmobiliaria_proyecciones').insert({
      tenant_id: tenant!.id, tipo: formTipo, concepto: formConcepto.trim(),
      monto: formMonto, fecha_prevista: formFecha,
      contrato_id: formContrato || null, categoria: formCategoria || null,
      estado: 'pendiente',
    });
    setShowModal(false);
    loadData();
  };

  const marcarRealizado = async (p: Proyeccion) => {
    const nuevoEstado = p.tipo === 'ingreso' ? 'cobrado' : 'pagado';

    // If it's an auto-generated projection, create it in DB first
    if (p.id.startsWith('auto-')) {
      const { data } = await supabase.from('inmobiliaria_proyecciones').insert({
        tenant_id: tenant!.id, tipo: p.tipo, concepto: p.concepto,
        monto: p.monto, fecha_prevista: p.fecha_prevista,
        contrato_id: p.contrato_id, categoria: p.categoria,
        estado: nuevoEstado,
      }).select('id').single();
      if (!data) return;
    } else {
      await supabase.from('inmobiliaria_proyecciones').update({ estado: nuevoEstado }).eq('id', p.id);
    }

    // Create real movement in treasury_transactions
    const defaultAccount = accounts[0];
    if (defaultAccount) {
      await supabase.from('treasury_transactions').insert({
        tenant_id: tenant!.id,
        account_id: defaultAccount.id,
        type: p.tipo === 'ingreso' ? 'income' : 'expense',
        amount: p.monto,
        description: p.concepto,
        date: new Date().toISOString().slice(0, 10),
        status: 'completado',
        payment_method: 'transferencia',
        contact_name: p.contrato_id ? contratos.find(c => c.id === p.contrato_id)?.inquilino?.razon_social || '' : '',
      });
    }

    loadData();
  };

  const remove = async (p: Proyeccion) => {
    if (p.id.startsWith('auto-')) return; // can't delete auto-generated
    if (!confirm('Eliminar esta proyección?')) return;
    await supabase.from('inmobiliaria_proyecciones').delete().eq('id', p.id);
    loadData();
  };

  const filtered = proyecciones.filter(p => {
    if (filterTipo === 'ingreso' && p.tipo !== 'ingreso') return false;
    if (filterTipo === 'gasto' && p.tipo !== 'gasto') return false;
    if (filterTipo === 'pendiente' && p.estado !== 'pendiente') return false;
    if (search && !p.concepto.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // KPIs
  const ingresosProyectados = proyecciones.filter(p => p.tipo === 'ingreso' && p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0);
  const gastosProyectados = proyecciones.filter(p => p.tipo === 'gasto' && p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0);
  const cobrados = proyecciones.filter(p => p.estado === 'cobrado' || p.estado === 'pagado').length;

  const fmtMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n.toLocaleString('es-AR')}`;

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando proyecciones...</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Proyecciones</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar concepto..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="gasto">Gastos</option>
          <option value="pendiente">Solo pendientes</option>
        </select>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>{fmtMoney(ingresosProyectados)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Ingresos esperados</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#EF4444', fontFamily: 'var(--font-mono)' }}>{fmtMoney(gastosProyectados)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Gastos previstos</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{cobrados}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Realizados</div>
        </div>
      </div>

      {/* Grid table */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 80px 100px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
          <span>Fecha</span><span>Concepto</span><span style={{ textAlign: 'right' }}>Monto</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {filtered.map(p => {
          const isIngreso = p.tipo === 'ingreso';
          const isPending = p.estado === 'pendiente';
          const isAuto = p.id.startsWith('auto-');
          return (
            <div key={p.id}
              style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 80px 100px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s', opacity: !isPending ? 0.6 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              {/* Fecha */}
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {new Date(p.fecha_prevista + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </div>
              {/* Concepto */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.concepto}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: isIngreso ? '#10B98115' : '#EF444415', color: isIngreso ? '#10B981' : '#EF4444' }}>
                    {isIngreso ? 'Ingreso' : 'Gasto'}
                  </span>
                  {isAuto && <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)' }}>Auto</span>}
                  {p.categoria && <span style={{ fontSize: '0.5625rem', color: 'var(--color-text-faint)' }}>{p.categoria}</span>}
                </div>
              </div>
              {/* Monto */}
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                {isIngreso ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#EF4444" />}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700, color: isIngreso ? '#10B981' : '#EF4444' }}>
                  ${p.monto.toLocaleString('es-AR')}
                </span>
              </div>
              {/* Estado */}
              <div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${ESTADO_COLOR[p.estado]}15`, color: ESTADO_COLOR[p.estado], textTransform: 'capitalize' }}>
                  {p.estado}
                </span>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {isPending && (
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); marcarRealizado(p); }}
                      style={{ ...iconBtn, color: '#10B981', borderColor: '#10B98130' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#10B98110'; e.currentTarget.style.borderColor = '#10B981'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#10B98130'; }}>
                      <Check size={14} />
                    </button>
                    <span className="row-action-tooltip">{isIngreso ? 'Cobrado' : 'Pagado'}</span>
                  </div>
                )}
                {!isAuto && (
                  <div className="row-action-wrap">
                    <button onClick={e => { e.stopPropagation(); remove(p); }}
                      style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                      <Trash2 size={14} />
                    </button>
                    <span className="row-action-tooltip">Eliminar</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin proyecciones</div>}
      </div>

      {/* ─── WIZARD MODAL ─── */}
      {showModal && (() => {
        const STEPS = [{ label: 'Tipo' }, { label: 'Detalle' }];
        const isLast = wizardStep === STEPS.length - 1;
        const canNext = wizardStep === 1 ? !!(formConcepto.trim() && formMonto) : true;

        return (
          <div className="wizard-overlay" onClick={() => setShowModal(false)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()}>
            <div className="wizard-header">
              <h3>Nueva proyección</h3>
              <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="wizard-steps">
              {STEPS.map((s, i) => (
                <div key={i} className="wizard-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && <div className={`wizard-step-line${i <= wizardStep ? ' done' : ''}`} />}
                    <div className={`wizard-step-dot${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ' pending'}`}
                      onClick={() => i < wizardStep && setWizardStep(i)} style={{ cursor: i < wizardStep ? 'pointer' : 'default' }}>
                      {i < wizardStep ? <Check size={14} /> : i + 1}
                    </div>
                  </div>
                  <div className={`wizard-step-label${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ''}`}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="wizard-body">
              {wizardStep === 0 && (<>
                <div className="wizard-field">
                  <div className="wizard-section-title">Tipo</div>
                  <div className="wizard-pills" style={{ marginTop: 8 }}>
                    <button className={`wizard-pill${formTipo === 'ingreso' ? ' selected' : ''}`}
                      onClick={() => setFormTipo('ingreso')}
                      style={formTipo === 'ingreso' ? { background: '#10B981', borderColor: '#10B981' } : {}}>
                      Ingreso futuro
                    </button>
                    <button className={`wizard-pill${formTipo === 'gasto' ? ' selected' : ''}`}
                      onClick={() => setFormTipo('gasto')}
                      style={formTipo === 'gasto' ? { background: '#EF4444', borderColor: '#EF4444' } : {}}>
                      Gasto futuro
                    </button>
                  </div>
                </div>
                <div className="wizard-field">
                  <label className="form-label">Fecha prevista</label>
                  <input type="date" className="form-input" value={formFecha} onChange={e => setFormFecha(e.target.value)} />
                </div>
                {formTipo === 'ingreso' && contratos.length > 0 && (
                  <div className="wizard-field">
                    <label className="form-label">Vincular a contrato (opcional)</label>
                    <CustomSelect
                      value={formContrato}
                      onChange={v => {
                        setFormContrato(v);
                        const c = contratos.find(ct => ct.id === v);
                        if (c) { setFormConcepto(`Alquiler ${c.propiedad?.direccion || ''}`); setFormMonto(c.monto_mensual); }
                      }}
                      placeholder="Seleccionar contrato..."
                      emptyLabel="Sin vincular"
                      options={contratos.map(c => ({ value: c.id, label: (c.propiedad as any)?.direccion || '—', sub: (c.inquilino as any)?.razon_social || '' }))}
                    />
                  </div>
                )}
              </>)}
              {wizardStep === 1 && (<>
                <div className="wizard-field">
                  <label className="form-label">Concepto *</label>
                  <input className="form-input" value={formConcepto} onChange={e => setFormConcepto(e.target.value)} placeholder="Ej: Pago impuesto ABL" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Monto *</label>
                  <input type="number" className="form-input" value={formMonto || ''} onChange={e => setFormMonto(Number(e.target.value))} placeholder="0" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Categoría (opcional)</label>
                  <input className="form-input" value={formCategoria} onChange={e => setFormCategoria(e.target.value)} placeholder="Ej: impuestos, servicios, alquiler" />
                </div>
              </>)}
            </div>
            <div className="wizard-footer">
              <div className="wizard-footer-left" />
              <div className="wizard-footer-right">
                {wizardStep > 0 && (
                  <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                  </button>
                )}
                {isLast ? (
                  <button className="wizard-btn-next" onClick={save} disabled={!canNext}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Crear</span>
                  </button>
                ) : (
                  <button className="wizard-btn-next" onClick={() => setWizardStep(s => s + 1)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Siguiente <ChevronRight size={16} /></span>
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        );
      })()}
    </div>
  );
}
