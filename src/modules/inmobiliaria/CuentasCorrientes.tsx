import { useEffect, useState } from 'react';
import { Search, User, ArrowUpRight, ArrowDownRight, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Movimiento {
  id: string; cliente_id: string; tipo: string; concepto: string;
  monto: number; saldo_acumulado: number; fecha: string;
  referencia_id: string | null; referencia_tipo: string | null;
}
interface Cliente { id: string; razon_social: string; }

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

export default function CuentasCorrientes() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selCliente, setSelCliente] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => { if (tenant) loadClientes(); }, [tenant]);
  useEffect(() => { if (tenant && selCliente) loadMovimientos(); }, [selCliente]);

  const loadClientes = async () => {
    setLoading(true);
    const { data } = await supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id).order('razon_social');
    if (data) setClientes(data);
    setLoading(false);
  };

  const loadMovimientos = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_cuentas_corrientes')
      .select('*').eq('tenant_id', tenant!.id).eq('cliente_id', selCliente)
      .order('fecha', { ascending: false });
    if (data) setMovimientos(data);
    setLoading(false);
  };

  const filteredClientes = clientes.filter(c =>
    !search || c.razon_social.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMovimientos = movimientos.filter(m => !filterTipo || m.tipo === filterTipo);
  const saldo = filteredMovimientos.length > 0 ? filteredMovimientos[0].saldo_acumulado : 0;
  const cliName = (id: string) => clientes.find(c => c.id === id)?.razon_social || '—';

  if (loading && clientes.length === 0) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

  /* ── MOBILE ── */
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Client selector — dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setShowPicker(p => !p); setPickerSearch(''); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 42, padding: '0 14px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '0.9375rem', color: selCliente ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            <span>{selCliente ? cliName(selCliente) : 'Seleccionar cliente...'}</span>
            <ChevronDown size={16} style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: showPicker ? 'rotate(180deg)' : 'none' }} />
          </button>

          {showPicker && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowPicker(false)} />
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4, background: 'var(--color-bg-surface)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar..." value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                      className="form-input" style={{ paddingLeft: 30, height: 36, fontSize: '0.875rem', borderRadius: 8 }} autoFocus />
                  </div>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {clientes.filter(c => !pickerSearch || c.razon_social.toLowerCase().includes(pickerSearch.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { setSelCliente(c.id); setShowPicker(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 'none', background: selCliente === c.id ? 'var(--color-cta-dim, rgba(37,99,235,0.08))' : 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: selCliente === c.id ? 600 : 400, color: selCliente === c.id ? 'var(--color-cta, #2563EB)' : 'var(--color-text-primary)', textAlign: 'left', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <User size={14} style={{ color: selCliente === c.id ? 'var(--color-cta)' : 'var(--color-text-muted)', flexShrink: 0 }} />
                      {c.razon_social}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {!selCliente ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Seleccioná un cliente para ver sus movimientos
          </div>
        ) : (
          <>
            {/* Saldo card */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Saldo actual</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{cliName(selCliente)}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: saldo >= 0 ? '#10B981' : '#EF4444' }}>
                ${saldo.toLocaleString('es-AR')}
              </div>
            </div>

            {/* Movements list */}
            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              {filteredMovimientos.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.monto >= 0 ? '#10B98112' : '#EF444412', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {m.monto >= 0 ? <ArrowUpRight size={16} color="#10B981" /> : <ArrowDownRight size={16} color="#EF4444" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{new Date(m.fecha).toLocaleDateString('es-AR')}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700, color: m.monto >= 0 ? '#10B981' : '#EF4444' }}>
                      {m.monto >= 0 ? '+' : ''}${m.monto.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              ))}
              {filteredMovimientos.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin movimientos</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── DESKTOP ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div className="module-header-desktop" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Cuentas Corrientes</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', minHeight: 400 }}>
        {/* Client list */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)}
                className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredClientes.map(c => (
              <div key={c.id} onClick={() => setSelCliente(c.id)} style={{
                padding: '0.6rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                borderBottom: '1px solid var(--color-border-subtle)',
                background: selCliente === c.id ? 'var(--color-accent)15' : 'transparent',
                borderLeft: selCliente === c.id ? '3px solid var(--color-accent)' : '3px solid transparent',
              }}
              onMouseEnter={e => { if (selCliente !== c.id) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
              onMouseLeave={e => { if (selCliente !== c.id) e.currentTarget.style.background = 'transparent'; }}>
                <User size={14} color="var(--color-text-muted)" />
                <span style={{ fontSize: '0.8rem', fontWeight: selCliente === c.id ? 600 : 400 }}>{c.razon_social}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Movements */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column' }}>
          {!selCliente ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Selecciona un cliente para ver su cuenta corriente
            </div>
          ) : (
            <>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{cliName(selCliente)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Saldo actual</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: saldo >= 0 ? '#10B981' : '#EF4444' }}>
                  ${saldo.toLocaleString('es-AR')}
                </div>
                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ marginLeft: 'auto', height: 32, fontSize: '0.8rem', width: 'auto' }}>
                  <option value="">Todos los tipos</option>
                  <option value="inquilino">Inquilino</option>
                  <option value="propietario">Propietario</option>
                </select>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      {['Fecha', 'Tipo', 'Concepto', 'Monto', 'Saldo'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem', position: 'sticky', top: 0, background: 'var(--color-bg-card)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovimientos.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize' }}>{m.tipo}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>{m.concepto}</td>
                        <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: m.monto >= 0 ? '#10B981' : '#EF4444' }}>
                            {m.monto >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            ${Math.abs(m.monto).toLocaleString('es-AR')}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${m.saldo_acumulado.toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                    {filteredMovimientos.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin movimientos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
