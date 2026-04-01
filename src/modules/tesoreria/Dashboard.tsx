import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    Calendar, Landmark, Wallet, CreditCard, CalendarClock,
    CheckCircle2, X, AlertCircle, RefreshCw
} from 'lucide-react';
import TransactionForm from './components/TransactionForm';
import StyledSelect from '../../shared/components/StyledSelect';

interface Transaction {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    date: string;
    status: 'completado' | 'pendiente';
    payment_method: string;
    contact_name?: string;
    project_name?: string;
    category?: { name: string; group?: string };
    account?: { name: string };
}

interface AgendaDay {
    dateKey: string;    // YYYY-MM-DD for sorting
    dateLabel: string;  // display label
    isToday: boolean;
    totalIncome: number;
    totalExpense: number;
    pendingCount: number;
    items: Transaction[];
}

function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dayName = dayNames[d.getDay()];
    const day = d.getDate();
    const month = monthNames[d.getMonth()];
    if (diff === 0) return `Hoy, ${day} ${month}`;
    if (diff === 1) return `Mañana, ${day} ${month}`;
    return `${dayName}, ${day} ${month}`;
}

const METHOD_LABELS: Record<string, string> = {
    transferencia: 'Transferencia', efectivo: 'Efectivo',
    cheque: 'Cheque', tarjeta: 'Tarjeta', otro: 'Otro'
};

export default function Dashboard() {
    const { tenant } = useTenant();
    const { role, user } = useAuth() as any;
    const [balance, setBalance] = useState(0);
    const [agendaDays, setAgendaDays] = useState<AgendaDay[]>([]);
    const [selectedDateKey, setSelectedDateKey] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [paymentTotals, setPaymentTotals] = useState<Record<string, { income: number; expense: number }>>({});
    const [periodFilter, setPeriodFilter] = useState<'day' | 'week' | '15d' | '60d' | 'custom'>('60d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Action modals
    const [actionItem, setActionItem] = useState<Transaction | null>(null);
    const [actionType, setActionType] = useState<'confirm' | 'reschedule' | 'payment' | null>(null);
    const [newDate, setNewDate] = useState('');
    const [newPayment, setNewPayment] = useState('transferencia');
    const [actionLoading, setActionLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!tenant) return;

        // Fetch accounts — basic users only see their assigned account
        const accQuery = supabase
            .from('treasury_accounts')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('name');

        const { data: accData } = role === 'basic'
            ? await accQuery.eq('assigned_user_id', user?.id)
            : await accQuery;

        if (accData) {
            setAccounts(accData);
            // Exclude cajas chicas (assigned to individual users) from the balance  
            const bankAccounts = accData.filter((a: any) => !a.assigned_user_id);
            setBalance(bankAccounts.reduce((sum: number, a: any) => sum + (a.balance || 0), 0));
        }

        // Fetch categories
        const { data: catData } = await supabase
            .from('treasury_categories')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('name');
        if (catData) setCategories(catData);

        // Fetch all transactions to compute payment-method totals
        const { data: completedTx } = await supabase
            .from('treasury_transactions')
            .select('type, amount, payment_method')
            .eq('tenant_id', tenant.id);

        if (completedTx) {
            const totals: Record<string, { income: number; expense: number }> = {};
            for (const tx of completedTx as any[]) {
                const method = tx.payment_method?.startsWith('transferencia')
                    ? 'transferencia'
                    : (tx.payment_method || 'otro');
                if (!totals[method]) totals[method] = { income: 0, expense: 0 };
                if (tx.type === 'income') totals[method].income += tx.amount;
                else totals[method].expense += tx.amount;
            }
            setPaymentTotals(totals);
        }

        // Fetch pending transactions (next 60 days + today)
        const todayStr = new Date().toISOString().split('T')[0];
        const future = new Date();
        future.setDate(future.getDate() + 60);
        const futureStr = future.toISOString().split('T')[0];

        const { data: txData } = await supabase
            .from('treasury_transactions')
            .select(`
                id, type, amount, description, date, status, payment_method,
                contact_name, project_name,
                category:treasury_categories(name, group),
                account:treasury_accounts(name)
            `)
            .eq('tenant_id', tenant.id)
            .eq('status', 'pendiente')
            .gte('date', todayStr)
            .lte('date', futureStr)
            .order('date', { ascending: true });

        if (txData) {
            // Group by date
            const grouped: Record<string, Transaction[]> = {};
            for (const tx of txData as unknown as Transaction[]) {
                if (!grouped[tx.date]) grouped[tx.date] = [];
                grouped[tx.date].push(tx);
            }

            const days: AgendaDay[] = Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dateKey, items]) => ({
                    dateKey,
                    dateLabel: formatDateLabel(dateKey),
                    isToday: dateKey === todayStr,
                    totalIncome: items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0),
                    totalExpense: items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0),
                    pendingCount: items.length,
                    items
                }));

            setAgendaDays(days);
            if (days.length > 0 && !selectedDateKey) {
                setSelectedDateKey(days[0].dateKey);
            }
        }
    }, [tenant]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Confirm payment ──
    const handleConfirm = async () => {
        if (!actionItem) return;
        setActionLoading(true);
        await supabase.from('treasury_transactions')
            .update({ status: 'completado', payment_method: newPayment || actionItem.payment_method })
            .eq('id', actionItem.id);
        setActionLoading(false);
        setActionItem(null); setActionType(null);
        fetchData();
    };

    // ── Reschedule ──
    const handleReschedule = async () => {
        if (!actionItem || !newDate) return;
        setActionLoading(true);
        await supabase.from('treasury_transactions')
            .update({ date: newDate })
            .eq('id', actionItem.id);
        setActionLoading(false);
        setActionItem(null); setActionType(null);
        fetchData();
    };

    // ── Change payment method only ──
    const handleChangePayment = async () => {
        if (!actionItem) return;
        setActionLoading(true);
        await supabase.from('treasury_transactions')
            .update({ payment_method: newPayment })
            .eq('id', actionItem.id);
        setActionLoading(false);
        setActionItem(null); setActionType(null);
        fetchData();
    };

    const openAction = (item: Transaction, type: 'confirm' | 'reschedule' | 'payment') => {
        setActionItem(item);
        setActionType(type);
        setNewDate(item.date);
        setNewPayment(item.payment_method || 'transferencia');
    };

    const selectedDay = agendaDays.find(d => d.dateKey === selectedDateKey);

    // ── Period filter ──────────────────────────────────────────────────────────
    const todayKey = new Date().toISOString().split('T')[0];
    const endOfWeek = (() => {
        const d = new Date(); const diff = 6 - d.getDay(); d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    })();
    const in15 = (() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0]; })();

    const filteredDays = agendaDays.filter(d => {
        if (periodFilter === 'day') return d.dateKey === todayKey;
        if (periodFilter === 'week') return d.dateKey >= todayKey && d.dateKey <= endOfWeek;
        if (periodFilter === '15d') return d.dateKey >= todayKey && d.dateKey <= in15;
        if (periodFilter === 'custom') {
            const from = customFrom || todayKey;
            const to = customTo || from;
            return d.dateKey >= from && d.dateKey <= to;
        }
        return true; // 60d — all
    });

    const periodIncome = filteredDays.reduce((s, d) => s + d.totalIncome, 0);
    const periodExpense = filteredDays.reduce((s, d) => s + d.totalExpense, 0);
    const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '2.5rem' }}>

            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                    <h1>Agenda de Proyecciones</h1>
                    <p>Movimientos pendientes de {tenant?.name}</p>
                </div>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-end' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Por Cobrar (60d)</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--success)', lineHeight: 1 }}>
                            +{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
                                .format(agendaDays.reduce((s, d) => s + d.totalIncome, 0))}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--brand)', fontWeight: 700, textTransform: 'uppercase' as const }}>Saldo Disp. Hoy</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: balance >= 0 ? 'var(--brand)' : 'var(--danger)', lineHeight: 1 }}>
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(balance)}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Balance breakdown ── */}
            {(accounts.length > 0 || Object.keys(paymentTotals).length > 0) && (() => {
                const bankAccts = accounts.filter((a: any) => !a.assigned_user_id);
                const cajaAccts = accounts.filter((a: any) => !!a.assigned_user_id);
                const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
                const METHOD_ICONS: Record<string, string> = {
                    efectivo: '💵', transferencia: '🏦', cheque: '🔖', tarjeta: '💳', otro: '·',
                };
                const METHOD_NAMES: Record<string, string> = {
                    efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', tarjeta: 'Tarjeta', otro: 'Otro',
                };
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>

                        {/* Row 1: Payment method breakdown - income vs expense */}
                        {Object.keys(paymentTotals).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'stretch' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', alignSelf: 'center', marginRight: '0.25rem' }}>Por método:</span>
                                {Object.entries(paymentTotals).sort(([a], [b]) => a.localeCompare(b)).map(([method, vals]) => (
                                    <div key={method} className="card" style={{
                                        padding: '0.5rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.2rem',
                                        borderTop: '2px solid var(--border)', flexShrink: 0, minWidth: '130px',
                                    }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                            {METHOD_ICONS[method] || '·'} {METHOD_NAMES[method] || method}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', fontWeight: 700 }}>
                                            <span style={{ color: 'var(--success)' }}>+{fmt(vals.income)}</span>
                                            <span style={{ color: 'var(--danger)' }}>-{fmt(vals.expense)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Row 2: Per-account balances */}
                        {accounts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '0.25rem' }}>Saldo por cuenta:</span>
                                {bankAccts.map((a: any) => (
                                    <div key={a.id} className="card" style={{
                                        padding: '0.5rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.1rem',
                                        borderLeft: '3px solid var(--brand)', flexShrink: 0,
                                    }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>🏦 {a.name}</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: a.balance >= 0 ? 'var(--text-main)' : 'var(--danger)' }}>{fmt(a.balance)}</div>
                                    </div>
                                ))}
                                {bankAccts.length > 0 && cajaAccts.length > 0 && (
                                    <div style={{ width: '1px', background: 'var(--border)', alignSelf: 'stretch' }} />
                                )}
                                {cajaAccts.map((a: any) => (
                                    <div key={a.id} className="card" style={{
                                        padding: '0.5rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.1rem',
                                        borderLeft: '3px solid var(--warning)', flexShrink: 0,
                                    }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>💵 {a.name}</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: a.balance >= 0 ? 'var(--text-main)' : 'var(--danger)' }}>{fmt(a.balance)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Empty state */}
            {/* ── Period filter + summary ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                {/* Filter buttons */}
                <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.25rem' }}>
                    {([['day', 'Hoy'], ['week', 'Esta semana'], ['15d', 'Próx. 15d'], ['60d', 'Todo (60d)'], ['custom', 'Rango']] as const).map(([key, label]) => (
                        <button key={key}
                            onClick={() => setPeriodFilter(key)}
                            style={{
                                padding: '0.3rem 0.8rem', borderRadius: 'calc(var(--r-md) - 2px)',
                                border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                                background: periodFilter === key ? 'var(--brand)' : 'transparent',
                                color: periodFilter === key ? '#fff' : 'var(--text-muted)',
                                transition: 'all 0.15s',
                            }}>{label}</button>
                    ))}
                </div>

                {/* Custom date pickers */}
                {periodFilter === 'custom' && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="date" className="form-input" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: 'auto' }} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>al</span>
                        <input type="date" className="form-input" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: 'auto' }} />
                    </div>
                )}

                {/* Period summary — by payment method */}
                {filteredDays.length > 0 && (() => {
                    const METHOD_ICONS: Record<string, string> = { efectivo: '💵', transferencia: '🏦', cheque: '🔖', tarjeta: '💳', otro: '·' };
                    const METHOD_NAMES: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transf.', cheque: 'Cheque', tarjeta: 'Tarjeta', otro: 'Otro' };
                    const byMethod: Record<string, { income: number; expense: number }> = {};
                    for (const day of filteredDays) {
                        for (const tx of day.items) {
                            const m = (tx.payment_method || 'otro').startsWith('transferencia') ? 'transferencia' : (tx.payment_method || 'otro');
                            if (!byMethod[m]) byMethod[m] = { income: 0, expense: 0 };
                            if (tx.type === 'income') byMethod[m].income += tx.amount;
                            else byMethod[m].expense += tx.amount;
                        }
                    }
                    const methods = Object.entries(byMethod).sort(([a], [b]) => a.localeCompare(b));
                    return (
                        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {methods.map(([method, vals]) => (
                                <div key={method} className="card" style={{ padding: '0.5rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '120px' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                        {METHOD_ICONS[method] || '·'} {METHOD_NAMES[method] || method}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.82rem', fontWeight: 700 }}>
                                        <span style={{ color: 'var(--success)' }}>+{fmt(vals.income)}</span>
                                        <span style={{ color: 'var(--danger)' }}>-{fmt(vals.expense)}</span>
                                    </div>
                                </div>
                            ))}
                            {/* Total */}
                            <div className="card" style={{ padding: '0.5rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '120px', borderLeft: '3px solid var(--brand)' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand)' }}>Total período</div>
                                <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.82rem', fontWeight: 700 }}>
                                    <span style={{ color: 'var(--success)' }}>+{fmt(periodIncome)}</span>
                                    <span style={{ color: 'var(--danger)' }}>-{fmt(periodExpense)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {agendaDays.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <AlertCircle size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-main)' }}>No hay movimientos pendientes</p>
                    <p style={{ fontSize: '0.875rem' }}>Creá un movimiento con estado "Pendiente" para que aparezca acá.</p>
                </div>
            )}

            {/* Day Cards */}
            {filteredDays.length > 0 && (
                <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '1rem', flexShrink: 0 }} className="custom-scrollbar">
                    {filteredDays.map((day, idx) => (
                        <motion.div
                            key={day.dateKey}
                            onClick={() => setSelectedDateKey(day.dateKey)}
                            className="card nav-item-hover"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: idx * 0.055, ease: 'easeOut' }}
                            whileHover={{ y: -3, boxShadow: 'var(--shadow-lg)' }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                                width: '210px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                                padding: '1.25rem', cursor: 'pointer',
                                background: selectedDateKey === day.dateKey ? 'rgba(99,102,241,0.05)' : 'var(--bg-card)',
                                border: selectedDateKey === day.dateKey ? '1px solid var(--brand)' : '1px solid var(--border)',
                                borderRadius: 'var(--r-xl)', position: 'relative', overflow: 'hidden',
                                boxShadow: selectedDateKey === day.dateKey ? 'var(--shadow-brand)' : 'var(--shadow-sm)'
                            }}
                        >
                            {selectedDateKey === day.dateKey && (
                                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '3px', background: 'var(--brand)', borderRadius: '3px 0 0 3px' }} />
                            )}
                            <h3 style={{
                                margin: '0 0 0.75rem 0', fontSize: '0.9375rem',
                                fontWeight: selectedDateKey === day.dateKey || day.isToday ? 700 : 600,
                                color: day.isToday ? 'var(--brand)' : 'var(--text-main)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                {day.dateLabel}
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>
                                    {day.pendingCount} pend.
                                </span>
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Ingresos</span>
                                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>+${day.totalIncome.toLocaleString('es-AR')}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Egresos</span>
                                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>-${day.totalExpense.toLocaleString('es-AR')}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Detail Table */}
            {selectedDay && (
                <div className="card" style={{ padding: 0, flex: 1 }}>
                    <div className="card-header" style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                        <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={18} />
                            {selectedDay.dateLabel}
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', padding: '0.2rem 0.6rem', borderRadius: '99px' }}>
                                {selectedDay.pendingCount} pendientes
                            </span>
                        </h3>
                        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                            + Nuevo Movimiento
                        </button>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                                {['Tipo', 'Descripción / Categoría', 'Forma de Pago', 'Monto', 'Acciones'].map(h => (
                                    <th key={h} style={{ padding: '0.875rem 1.5rem', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, textAlign: h === 'Monto' ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {selectedDay.items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} className="nav-item-hover">
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span className={`badge ${item.type === 'expense' ? 'badge-danger' : 'badge-success'}`}>
                                            {item.type === 'expense' ? 'PAGO' : 'COBRO'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.875rem' }}>{item.description}</div>
                                        {item.category?.name && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                {item.category.group ? `${item.category.group} → ` : ''}{item.category.name}
                                            </div>
                                        )}
                                        {item.contact_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.contact_name}</div>}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: 'var(--text-sub)' }}>
                                            {item.payment_method === 'transferencia' ? <Landmark size={13} /> : item.payment_method === 'efectivo' ? <Wallet size={13} /> : <CreditCard size={13} />}
                                            {METHOD_LABELS[item.payment_method] || item.payment_method}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontWeight: 700, fontSize: '0.9375rem', color: item.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                                        {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-start' }}>
                                            {/* Confirm */}
                                            <button
                                                className="btn btn-secondary"
                                                title={item.type === 'income' ? 'Confirmar cobro' : 'Confirmar pago'}
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--success)', borderColor: 'var(--success)' }}
                                                onClick={() => openAction(item, 'confirm')}
                                            >
                                                <CheckCircle2 size={13} />
                                                {item.type === 'income' ? 'Cobrar' : 'Pagar'}
                                            </button>
                                            {/* Reschedule */}
                                            <button
                                                className="btn btn-secondary"
                                                title="Reprogramar fecha"
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                onClick={() => openAction(item, 'reschedule')}
                                            >
                                                <CalendarClock size={13} />
                                                Reprogramar
                                            </button>
                                            {/* Change payment */}
                                            <button
                                                className="btn btn-secondary"
                                                title="Cambiar forma de pago"
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                onClick={() => openAction(item, 'payment')}
                                            >
                                                <RefreshCw size={13} />
                                                Forma de pago
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Action Modal ── */}
            <AnimatePresence>
                {actionItem && actionType && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '1rem' }}
                        onClick={() => { setActionItem(null); setActionType(null); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="card"
                            style={{ width: '100%', maxWidth: '440px', padding: '1.75rem', position: 'relative' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button onClick={() => { setActionItem(null); setActionType(null); }}
                                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>

                            {actionType === 'confirm' && (
                                <>
                                    <h3 style={{ margin: '0 0 0.25rem' }}>{actionItem.type === 'income' ? '✅ Confirmar cobro' : '✅ Confirmar pago'}</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>{actionItem.description}</p>
                                    <div className="form-group">
                                        <label className="form-label">Forma de pago (puede cambiarla)</label>
                                        <StyledSelect className="form-input" value={newPayment} onChange={e => setNewPayment(e.target.value)}>
                                            <option value="transferencia">Transferencia</option>
                                            <option value="efectivo">Efectivo</option>
                                            <option value="cheque">Cheque</option>
                                            <option value="tarjeta">Tarjeta</option>
                                            <option value="otro">Otro</option>
                                        </StyledSelect>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setActionItem(null); setActionType(null); }}>Cancelar</button>
                                        <button className="btn btn-primary" style={{ flex: 1, background: 'var(--success)', borderColor: 'var(--success)' }} onClick={handleConfirm} disabled={actionLoading}>
                                            {actionLoading ? 'Guardando...' : actionItem.type === 'income' ? 'Confirmar cobro' : 'Confirmar pago'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {actionType === 'reschedule' && (
                                <>
                                    <h3 style={{ margin: '0 0 0.25rem' }}>📅 Reprogramar</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>{actionItem.description}</p>
                                    <div className="form-group">
                                        <label className="form-label">Nueva fecha</label>
                                        <input type="date" className="form-input" value={newDate} onChange={e => setNewDate(e.target.value)} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setActionItem(null); setActionType(null); }}>Cancelar</button>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleReschedule} disabled={actionLoading || !newDate}>
                                            {actionLoading ? 'Guardando...' : 'Reprogramar'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {actionType === 'payment' && (
                                <>
                                    <h3 style={{ margin: '0 0 0.25rem' }}>💳 Cambiar forma de pago</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>{actionItem.description}</p>
                                    <div className="form-group">
                                        <label className="form-label">Nueva forma de pago</label>
                                        <StyledSelect className="form-input" value={newPayment} onChange={e => setNewPayment(e.target.value)}>
                                            <option value="transferencia">Transferencia</option>
                                            <option value="efectivo">Efectivo</option>
                                            <option value="cheque">Cheque</option>
                                            <option value="tarjeta">Tarjeta</option>
                                            <option value="otro">Otro</option>
                                        </StyledSelect>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setActionItem(null); setActionType(null); }}>Cancelar</button>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleChangePayment} disabled={actionLoading}>
                                            {actionLoading ? 'Guardando...' : 'Guardar'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Nuevo Movimiento Modal ── */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
                        onClick={() => setIsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="card"
                            style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', position: 'relative' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 className="card-title" style={{ margin: 0 }}>Nuevo Movimiento</h3>
                                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            {accounts.length === 0 ? (
                                <div style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', padding: '1rem', borderRadius: 'var(--r-md)' }}>
                                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No hay cuentas registradas</p>
                                    <p style={{ fontSize: '0.85rem' }}>Ve a "Cajas" para crear tu primera cuenta.</p>
                                </div>
                            ) : (
                                <TransactionForm
                                    accounts={accounts}
                                    categories={categories}
                                    onSuccess={() => { setIsModalOpen(false); fetchData(); }}
                                />
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
