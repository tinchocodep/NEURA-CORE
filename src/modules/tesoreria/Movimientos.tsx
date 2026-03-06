import { useState, useEffect, useMemo } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Pencil, LayoutList, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import TransactionForm from './components/TransactionForm';
import EditTransactionModal from './components/EditTransactionModal';
import { SkeletonTable } from '../../shared/components/SkeletonKit';

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function Movimientos() {
    const { tenant } = useTenant();
    const { role, user } = useAuth() as any;
    const [transactions, setTransactions] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'banks' | 'cajas'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completado' | 'pendiente'>('all');
    const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
    const [calMonth, setCalMonth] = useState(new Date());
    const [calSelected, setCalSelected] = useState<string | null>(null);
    const [editingTx, setEditingTx] = useState<any | null>(null);

    const fetchData = async () => {
        if (!tenant) return;
        setLoading(true);
        const isBasic = role === 'basic';
        const [txRes, accRes, catRes] = await Promise.all([
            supabase.from('treasury_transactions')
                .select('*, treasury_categories(*), treasury_accounts(*)')
                .eq('tenant_id', tenant.id)
                .order('date', { ascending: false })
                .limit(200),
            isBasic
                ? supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).eq('assigned_user_id', user?.id).order('name')
                : supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).order('name'),
            isBasic
                ? supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).eq('group', 'Caja Chica').order('name')
                : supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).order('name')
        ]);
        if (txRes.data) {
            if (isBasic && accRes.data && accRes.data.length > 0) {
                const assignedId = accRes.data[0].id;
                setTransactions(txRes.data.filter((tx: any) => tx.treasury_accounts?.id === assignedId));
            } else {
                setTransactions(txRes.data);
            }
        }
        if (accRes.data) setAccounts(accRes.data);
        if (catRes.data) setCategories(catRes.data);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [tenant]);

    const filteredTransactions = transactions.filter(tx => {
        const isCaja = tx.treasury_accounts?.assigned_user_id !== null;
        if (filter === 'banks' && isCaja) return false;
        if (filter === 'cajas' && !isCaja) return false;
        if (statusFilter === 'completado' && tx.status !== 'completado') return false;
        if (statusFilter === 'pendiente' && tx.status !== 'pendiente') return false;
        return true;
    });

    // ── Calendar helpers ─────────────────────────────────────────────────────
    const calYear = calMonth.getFullYear();
    const calMonthIdx = calMonth.getMonth();
    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const firstDayOfWeek = new Date(calYear, calMonthIdx, 1).getDay();
    const monthLabel = calMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const todayKey = new Date().toISOString().split('T')[0];

    const txByDate = useMemo(() => {
        const map: Record<string, any[]> = {};
        for (const tx of filteredTransactions) {
            const d = (tx.date || '').split('T')[0];
            if (!map[d]) map[d] = [];
            map[d].push(tx);
        }
        return map;
    }, [filteredTransactions]);

    const selectedDayTxs = calSelected ? (txByDate[calSelected] || []) : [];

    return (
        <>
            <div>
                <div className="page-header">
                    <h1>Movimientos</h1>
                    <p>Registra y administra los ingresos y egresos de {tenant?.name}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '2rem', alignItems: 'start' }}>

                    {/* Form Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 className="card-title" style={{ marginBottom: '1.5rem', fontSize: '1.125rem' }}>Nuevo Movimiento</h3>
                            {accounts.length === 0 ? (
                                <div className="form-label" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No hay cuentas registradas</p>
                                    <p style={{ fontSize: '0.85rem' }}>Ve a la sección "Cajas" en el menú lateral para crear tu primera cuenta bancaria o caja chica.</p>
                                </div>
                            ) : categories.length === 0 ? (
                                <div className="form-label" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No hay categorías registradas</p>
                                    <p style={{ fontSize: '0.85rem' }}>Ve a la sección "Cajas" para crear las categorías de Ingreso y Egreso.</p>
                                </div>
                            ) : (
                                <TransactionForm accounts={accounts} categories={categories} onSuccess={fetchData} />
                            )}
                        </div>
                    </div>

                    {/* Main Panel */}
                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        {/* Header with filters */}
                        <div className="card-header" style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            <h3 className="card-title" style={{ margin: 0 }}>Historial de Transacciones</h3>

                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                {/* View mode */}
                                <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '2px' }}>
                                    <button onClick={() => setViewMode('table')} title="Tabla"
                                        style={{ padding: '0.3rem 0.5rem', borderRadius: 'calc(var(--r-md) - 2px)', border: 'none', cursor: 'pointer', background: viewMode === 'table' ? 'var(--brand)' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        <LayoutList size={15} />
                                    </button>
                                    <button onClick={() => setViewMode('calendar')} title="Calendario"
                                        style={{ padding: '0.3rem 0.5rem', borderRadius: 'calc(var(--r-md) - 2px)', border: 'none', cursor: 'pointer', background: viewMode === 'calendar' ? 'var(--brand)' : 'transparent', color: viewMode === 'calendar' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        <CalendarDays size={15} />
                                    </button>
                                </div>

                                {/* Status filter */}
                                <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '2px' }}>
                                    {(['all', 'completado', 'pendiente'] as const).map(s => (
                                        <button key={s} onClick={() => setStatusFilter(s)}
                                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.73rem', fontWeight: 600, borderRadius: 'calc(var(--r-md) - 2px)', border: 'none', cursor: 'pointer', background: statusFilter === s ? 'var(--brand)' : 'transparent', color: statusFilter === s ? '#fff' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {s === 'all' ? 'Todos' : s === 'completado' ? '✅ Confirmados' : '⏳ Pendientes'}
                                        </button>
                                    ))}
                                </div>

                                {/* Bank/Caja filter — admins only */}
                                {(role === 'admin' || role === 'superadmin') && (
                                    <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '2px' }}>
                                        {(['all', 'banks', 'cajas'] as const).map(f => (
                                            <button key={f} onClick={() => setFilter(f)}
                                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.73rem', fontWeight: 600, borderRadius: 'calc(var(--r-md) - 2px)', border: 'none', cursor: 'pointer', background: filter === f ? 'var(--brand)' : 'transparent', color: filter === f ? '#fff' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {f === 'all' ? 'Todas' : f === 'banks' ? '🏦 Bancos' : '💵 Cajas'}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── CALENDAR VIEW ── */}
                        {viewMode === 'calendar' && (
                            <div style={{ padding: '1.25rem' }}>
                                {/* Month navigation */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.95rem' }}>{monthLabel}</span>
                                    <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        <ChevronRight size={16} />
                                    </button>
                                </div>

                                {/* Day headers */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>
                                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', padding: '0.25rem 0' }}>{d}</div>
                                    ))}
                                </div>

                                {/* Calendar grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px' }}>
                                    {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const day = i + 1;
                                        const dateKey = `${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayTxs = txByDate[dateKey] || [];
                                        const income = dayTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
                                        const expense = dayTxs.filter((t: any) => t.type !== 'income').reduce((s: number, t: any) => s + t.amount, 0);
                                        const isSelected = calSelected === dateKey;
                                        const isToday = dateKey === todayKey;
                                        return (
                                            <div key={day} onClick={() => dayTxs.length && setCalSelected(isSelected ? null : dateKey)}
                                                style={{ minHeight: '64px', borderRadius: 'var(--r-sm)', border: `1px solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`, padding: '0.3rem', cursor: dayTxs.length ? 'pointer' : 'default', background: isSelected ? 'rgba(99,102,241,0.08)' : isToday ? 'rgba(99,102,241,0.03)' : 'var(--bg-main)', transition: 'border-color 0.12s' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--brand)' : 'var(--text-main)', marginBottom: '0.15rem' }}>{day}</div>
                                                {income > 0 && <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--success)', lineHeight: 1.3 }}>+{fmt(income)}</div>}
                                                {expense > 0 && <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--danger)', lineHeight: 1.3 }}>-{fmt(expense)}</div>}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Selected day detail */}
                                {calSelected && selectedDayTxs.length > 0 && (
                                    <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>Movimientos del {calSelected}</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            {selectedDayTxs.map((tx: any) => (
                                                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: 'var(--r-sm)', background: 'var(--bg-main)', border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{tx.description || '—'}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tx.treasury_categories?.name} · {tx.treasury_accounts?.name}</div>
                                                    </div>
                                                    <span style={{ fontWeight: 800, color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                                                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TABLE VIEW ── */}
                        {viewMode === 'table' && (
                            <div className="table-container">
                                {loading ? (
                                    <SkeletonTable rows={5} columns={5} />
                                ) : filteredTransactions.length === 0 ? (
                                    <table style={{ width: '100%' }}>
                                        <tbody>
                                            <tr>
                                                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                    No hay movimientos registrados.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                ) : (
                                    <table>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '90px' }}>Fecha</th>
                                                <th>Concepto</th>
                                                <th>Categoría</th>
                                                <th>Cuenta</th>
                                                <th style={{ textAlign: 'right' }}>Monto</th>
                                                <th style={{ width: '36px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTransactions.map(tx => {
                                                const isIn = tx.type === 'income';
                                                const rawMethod = tx.payment_method || '';
                                                const method = rawMethod.startsWith('transferencia-')
                                                    ? 'Transferencia'
                                                    : rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1);
                                                const dateObj = new Date(tx.date + 'T12:00:00');
                                                const dateLabel = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
                                                return (
                                                    <tr key={tx.id} style={{ opacity: tx.treasury_categories?.is_internal_transfer ? 0.6 : 1 }}>
                                                        <td>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                                                {dateLabel.split(' ')[0]} {dateLabel.split(' ')[1]}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{dateLabel.split(' ')[2]}</div>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.2rem' }}>
                                                                {tx.description || '—'}
                                                                {tx.transfer_pair_id && <span className="badge badge-warning" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>Fondeo</span>}
                                                                {tx.status === 'pendiente' && <span className="badge badge-warning" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>Pendiente</span>}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                {tx.contact_name && <span>{tx.contact_name}</span>}
                                                                {tx.project_name && <span style={{ color: 'var(--brand)', opacity: 0.8 }}>· {tx.project_name}</span>}
                                                                {method && <span style={{ opacity: 0.7 }}>· {method}</span>}
                                                                {tx.invoice_number && <span style={{ opacity: 0.6 }}>· FC {tx.invoice_number}</span>}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {tx.treasury_categories?.name ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: isIn ? 'var(--success)' : 'var(--danger)' }} />
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500 }}>{tx.treasury_categories.name}</span>
                                                                </div>
                                                            ) : (
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                                                            )}
                                                            {tx.treasury_categories?.group && (
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', paddingLeft: '1.1rem' }}>{tx.treasury_categories.group}</div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500 }}>{tx.treasury_accounts?.name || '—'}</div>
                                                            {tx.treasury_accounts?.assigned_user_id && (
                                                                <div style={{ fontSize: '0.68rem', color: 'var(--warning)', marginTop: '0.1rem' }}>Caja chica</div>
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                            <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: isIn ? 'var(--success)' : 'var(--danger)' }}>
                                                                {isIn ? '+' : '-'}{fmt(tx.amount)}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                                                            <button onClick={() => setEditingTx(tx)} title="Editar"
                                                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0.3rem 0.4rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                                                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--brand)'; }}
                                                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                                                            >
                                                                <Pencil size={13} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {editingTx && (
                <EditTransactionModal
                    tx={editingTx}
                    accounts={accounts}
                    categories={categories}
                    onClose={() => setEditingTx(null)}
                    onSaved={fetchData}
                />
            )}
        </>
    );
}
