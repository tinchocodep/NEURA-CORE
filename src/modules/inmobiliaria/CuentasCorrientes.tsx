import { useEffect, useState } from 'react';
import { Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

interface Movimiento {
  id: string; cliente_id: string; tipo: string; concepto: string;
  monto: number; saldo_acumulado: number; fecha: string;
  referencia_id: string | null; referencia_tipo: string | null;
}
interface Cliente { id: string; razon_social: string; }
export default function CuentasCorrientes() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selCliente, setSelCliente] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { if (tenant) loadData(); }, [tenant]);
  useEffect(() => { if (tenant && selCliente) loadMovimientos(); }, [selCliente]);

  const loadData = async () => {
    setLoading(true);
    // Load clients that have accounts
    const { data: cliData } = await supabase.from('contable_clientes')
      .select('id, razon_social').eq('tenant_id', tenant!.id).order('razon_social');
    if (cliData) setClientes(cliData);

    // Load latest saldo per client (last movement's saldo_acumulado)
    if (cliData && cliData.length > 0) {
      const saldoMap: Record<string, number> = {};
      // Get the most recent movement per client
      const { data: movs } = await supabase.from('inmobiliaria_cuentas_corrientes')
        .select('cliente_id, saldo_acumulado, fecha')
        .eq('tenant_id', tenant!.id)
        .order('fecha', { ascending: false });
      if (movs) {
        for (const m of movs) {
          if (!(m.cliente_id in saldoMap)) saldoMap[m.cliente_id] = m.saldo_acumulado;
        }
      }
      setSaldos(saldoMap);
    }
    setLoading(false);
  };

  const loadMovimientos = async () => {
    const { data } = await supabase.from('inmobiliaria_cuentas_corrientes')
      .select('*').eq('tenant_id', tenant!.id).eq('cliente_id', selCliente)
      .order('fecha', { ascending: false });
    if (data) setMovimientos(data);
  };

  const fmtMoney = (n: number) => `$${Math.abs(n).toLocaleString('es-AR')}`;

  // Only show clients that have movements (saldo entry)
  const clientesConCuenta = clientes.filter(c => c.id in saldos);
  const filteredClientes = clientesConCuenta.filter(c =>
    !search || c.razon_social.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMovimientos = movimientos.filter(m => !filterTipo || m.tipo === filterTipo);

  // KPIs
  const totalAFavor = Object.values(saldos).filter(s => s > 0).reduce((a, b) => a + b, 0);
  const totalDeuda = Object.values(saldos).filter(s => s < 0).reduce((a, b) => a + Math.abs(b), 0);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando cuentas...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div className="module-header-desktop">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Cuentas Corrientes</h1>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar cuenta..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
      </div>
      {isMobile && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
          </div>
        </div>
      )}

      {/* KPI - Saldo neto */}
      {(() => {
        const saldoNeto = totalAFavor - totalDeuda;
        const color = saldoNeto >= 0 ? '#10B981' : '#EF4444';
        return (
          <div style={{ padding: '14px 20px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Saldo neto</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>
              {saldoNeto >= 0 ? '+' : '-'}{fmtMoney(saldoNeto)}
            </span>
          </div>
        );
      })()}

      {/* ─── ACCOUNTS LIST ─── */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Table header */}
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Cuenta</span><span style={{ textAlign: 'right' }}>Saldo</span><span style={{ textAlign: 'right' }}>Estado</span>
          </div>
        )}

        {filteredClientes.map(c => {
          const s = saldos[c.id] || 0;
          const isActive = selCliente === c.id;
          const estadoLabel = s > 0 ? 'A favor' : s < 0 ? 'Deudor' : 'Sin saldo';
          const estadoColor = s > 0 ? '#10B981' : s < 0 ? '#EF4444' : 'var(--color-text-muted)';
          return (
            <div key={c.id}>
              {/* Account row */}
              <div
                onClick={() => setSelCliente(isActive ? '' : c.id)}
                style={{
                  display: isMobile ? 'flex' : 'grid',
                  gridTemplateColumns: isMobile ? undefined : '1fr 120px 120px',
                  justifyContent: isMobile ? 'space-between' : undefined,
                  alignItems: 'center', padding: isMobile ? '12px 14px' : '10px 16px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer', transition: 'background 0.1s',
                  background: isActive ? 'var(--color-bg-surface-2)' : undefined,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = isActive ? 'var(--color-bg-surface-2)' : 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = isActive ? 'var(--color-bg-surface-2)' : '')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: isActive ? '0.875rem' : '0.8125rem', fontWeight: isActive ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.razon_social}</span>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700, color: estadoColor }}>
                  {s >= 0 ? '+' : '-'}{fmtMoney(s)}
                </div>
                {!isMobile && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s > 0 ? '#10B98115' : s < 0 ? '#EF444415' : 'var(--color-bg-surface-2)', color: estadoColor }}>
                      {estadoLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Expanded movements */}
              {isActive && (
                <div style={{ background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {/* Filter */}
                  <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    {[{ key: '', label: 'Todos' }, { key: 'cargo', label: 'Cargos' }, { key: 'pago', label: 'Pagos' }].map(f => (
                      <button key={f.key} onClick={(e) => { e.stopPropagation(); setFilterTipo(filterTipo === f.key ? '' : f.key); }}
                        style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${filterTipo === f.key ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: filterTipo === f.key ? 'var(--color-text-primary)' : 'transparent', color: filterTipo === f.key ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Movement rows */}
                  {!isMobile && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 100px', padding: '6px 24px', fontSize: '0.5625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <span>Fecha</span><span>Concepto</span><span style={{ textAlign: 'right' }}>Monto</span><span style={{ textAlign: 'right' }}>Saldo</span>
                      </div>
                      {filteredMovimientos.map(m => (
                        <div key={m.id}
                          style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 100px', padding: '8px 24px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto}</div>
                            {m.tipo && <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{m.tipo}</span>}
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                            {m.monto >= 0 ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#EF4444" />}
                            <span style={{ color: m.monto >= 0 ? '#10B981' : '#EF4444' }}>{fmtMoney(m.monto)}</span>
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>
                            {fmtMoney(m.saldo_acumulado)}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Mobile movement rows */}
                  {isMobile && filteredMovimientos.map(m => (
                    <div key={m.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                            {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                          </span>
                          {m.tipo && <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{m.tipo}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                          {m.monto >= 0 ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#EF4444" />}
                          <span style={{ color: m.monto >= 0 ? '#10B981' : '#EF4444' }}>{fmtMoney(m.monto)}</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                          Saldo: {fmtMoney(m.saldo_acumulado)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredMovimientos.length === 0 && (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin movimientos</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredClientes.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin cuentas con movimientos</div>
        )}
      </div>
    </div>
  );
}
