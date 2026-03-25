import { useEffect, useState } from 'react';
import { Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Movimiento {
  id: string; cliente_id: string; tipo: string; concepto: string;
  monto: number; saldo_acumulado: number; fecha: string;
  referencia_id: string | null; referencia_tipo: string | null;
}
interface Cliente { id: string; razon_social: string; }
export default function CuentasCorrientes() {
  const { tenant } = useTenant();
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

  const cliName = (id: string) => clientes.find(c => c.id === id)?.razon_social || '—';
  const fmtMoney = (n: number) => `$${Math.abs(n).toLocaleString('es-AR')}`;

  // Only show clients that have movements (saldo entry)
  const clientesConCuenta = clientes.filter(c => c.id in saldos);
  const filteredClientes = clientesConCuenta.filter(c =>
    !search || c.razon_social.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMovimientos = movimientos.filter(m => !filterTipo || m.tipo === filterTipo);
  const saldo = saldos[selCliente] || 0;

  // KPIs
  const totalAFavor = Object.values(saldos).filter(s => s > 0).reduce((a, b) => a + b, 0);
  const totalDeuda = Object.values(saldos).filter(s => s < 0).reduce((a, b) => a + Math.abs(b), 0);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando cuentas...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Cuentas Corrientes</h1>
        <div style={{ flex: 1, position: 'relative', maxWidth: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar cuenta..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 34, fontSize: '0.8rem' }} />
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>{fmtMoney(totalAFavor)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>A favor</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#EF4444', fontFamily: 'var(--font-mono)' }}>{fmtMoney(totalDeuda)}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Deuda</div>
        </div>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{clientesConCuenta.length}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Cuentas</div>
        </div>
      </div>

      {/* ─── ACCOUNT BADGES ─── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {filteredClientes.map(c => {
          const s = saldos[c.id] || 0;
          const isActive = selCliente === c.id;
          return (
            <button key={c.id} onClick={() => setSelCliente(selCliente === c.id ? '' : c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 12,
                border: `1.5px solid ${isActive ? (s >= 0 ? '#10B981' : '#EF4444') : 'var(--color-border-subtle)'}`,
                background: isActive ? (s >= 0 ? '#10B98108' : '#EF444408') : 'var(--color-bg-card)',
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--color-text-muted)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: isActive ? 700 : 500, color: 'var(--color-text-primary)' }}>{c.razon_social}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                color: s >= 0 ? '#10B981' : '#EF4444',
                padding: '2px 8px', borderRadius: 99,
                background: s >= 0 ? '#10B98115' : '#EF444415',
              }}>
                {s >= 0 ? '+' : '-'}{fmtMoney(s)}
              </span>
            </button>
          );
        })}
        {filteredClientes.length === 0 && (
          <div style={{ padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin cuentas con movimientos</div>
        )}
      </div>

      {/* ─── MOVEMENTS TABLE (when account selected) ─── */}
      {selCliente && (
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Account header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-2)' }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{cliName(selCliente)}</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Cuenta corriente</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Saldo</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: saldo >= 0 ? '#10B981' : '#EF4444' }}>
                {saldo >= 0 ? '+' : '-'}{fmtMoney(saldo)}
              </div>
            </div>
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            {[{ key: '', label: 'Todos' }, { key: 'cargo', label: 'Cargos' }, { key: 'pago', label: 'Pagos' }].map(f => (
              <button key={f.key} onClick={() => setFilterTipo(filterTipo === f.key ? '' : f.key)}
                style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${filterTipo === f.key ? 'var(--color-text-primary)' : 'var(--color-border-subtle)'}`, background: filterTipo === f.key ? 'var(--color-text-primary)' : 'transparent', color: filterTipo === f.key ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Grid rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 100px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Fecha</span><span>Concepto</span><span style={{ textAlign: 'right' }}>Monto</span><span style={{ textAlign: 'right' }}>Saldo</span>
          </div>
          {filteredMovimientos.map(m => (
            <div key={m.id}
              style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 100px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto}</div>
                {m.tipo && <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{m.tipo}</span>}
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
          {filteredMovimientos.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin movimientos</div>
          )}
        </div>
      )}
    </div>
  );
}
