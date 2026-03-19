import { useEffect, useState } from 'react';
import { Search, User, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Movimiento {
  id: string; cliente_id: string; tipo: string; concepto: string;
  monto: number; saldo_acumulado: number; fecha: string;
  referencia_id: string | null; referencia_tipo: string | null;
}
interface Cliente { id: string; nombre: string; }

export default function CuentasCorrientes() {
  const { tenant } = useTenant();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selCliente, setSelCliente] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { if (tenant) loadClientes(); }, [tenant]);
  useEffect(() => { if (tenant && selCliente) loadMovimientos(); }, [selCliente]);

  const loadClientes = async () => {
    setLoading(true);
    const { data } = await supabase.from('contable_clientes').select('id, nombre').eq('tenant_id', tenant!.id).order('nombre');
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
    !search || c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMovimientos = movimientos.filter(m =>
    !filterTipo || m.tipo === filterTipo
  );

  const saldo = filteredMovimientos.length > 0 ? filteredMovimientos[0].saldo_acumulado : 0;
  const cliName = (id: string) => clientes.find(c => c.id === id)?.nombre || '—';

  if (loading && clientes.length === 0) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando...</div>;

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
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
                background: selCliente === c.id ? 'var(--color-accent)' + '15' : 'transparent',
                borderLeft: selCliente === c.id ? '3px solid var(--color-accent)' : '3px solid transparent',
              }}
              onMouseEnter={e => { if (selCliente !== c.id) e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.03))'; }}
              onMouseLeave={e => { if (selCliente !== c.id) e.currentTarget.style.background = 'transparent'; }}>
                <User size={14} color="var(--color-text-muted)" />
                <span style={{ fontSize: '0.8rem', fontWeight: selCliente === c.id ? 600 : 400 }}>{c.nombre}</span>
              </div>
            ))}
            {filteredClientes.length === 0 && (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Sin clientes</div>
            )}
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
              {/* Header */}
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{cliName(selCliente)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Saldo actual</div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700,
                  color: saldo >= 0 ? '#10B981' : '#EF4444',
                }}>
                  ${saldo.toLocaleString('es-AR')}
                </div>
                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ marginLeft: 'auto', height: 32, fontSize: '0.8rem', width: 'auto' }}>
                  <option value="">Todos los tipos</option>
                  <option value="inquilino">Inquilino</option>
                  <option value="propietario">Propietario</option>
                </select>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando movimientos...</div>
                ) : (
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
                          <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {new Date(m.fecha).toLocaleDateString('es-AR')}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize' }}>{m.tipo}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{m.concepto}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: m.monto >= 0 ? '#10B981' : '#EF4444' }}>
                              {m.monto >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              ${Math.abs(m.monto).toLocaleString('es-AR')}
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            ${m.saldo_acumulado.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))}
                      {filteredMovimientos.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin movimientos</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
