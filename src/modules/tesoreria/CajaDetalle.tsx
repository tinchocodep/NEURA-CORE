import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import {
    ArrowLeft, TrendingUp, TrendingDown, Wallet,
    ReceiptText, Plus, Landmark, CreditCard, Loader2,
    ClipboardCheck, ChevronDown, ChevronUp, CheckCircle2, X
} from 'lucide-react';
import TransactionForm from './components/TransactionForm';

const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);

// Returns Mon of current week
function weekStart(d: Date = new Date()) {
    const dd = new Date(d);
    const day = dd.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    dd.setDate(dd.getDate() + diff);
    dd.setHours(0, 0, 0, 0);
    return dd;
}
function weekEnd(start: Date) {
    const d = new Date(start);
    d.setDate(d.getDate() + 6);
    return d;
}
function toISO(d: Date) { return d.toISOString().split('T')[0]; }
function fmtDate(iso: string) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CajaDetalle() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { tenant } = useTenant();

    const [account, setAccount] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [settlements, setSettlements] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showSettle, setShowSettle] = useState(false);
    const [settleNotes, setSettleNotes] = useState('');
    const [settling, setSettling] = useState(false);
    const [settleSuccess, setSettleSuccess] = useState(false);

    const fetchData = async () => {
        if (!id || !tenant) return;
        setLoading(true);
        const [accRes, txRes, allAccRes, catRes, settleRes] = await Promise.all([
            supabase.from('treasury_accounts')
                .select('*, assigned_user:users!treasury_accounts_assigned_user_id_fkey(email)')
                .eq('id', id).single(),
            supabase.from('treasury_transactions')
                .select('*, treasury_categories(name, type, "group")')
                .eq('account_id', id)
                .eq('tenant_id', tenant.id)
                .order('date', { ascending: false }).limit(200),
            supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).order('name'),
            supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).order('name'),
            supabase.from('cash_settlements')
                .select('*')
                .eq('account_id', id)
                .order('week_start', { ascending: false }).limit(20),
        ]);
        if (accRes.data) setAccount(accRes.data);
        if (txRes.data) setTransactions(txRes.data);
        if (allAccRes.data) setAccounts(allAccRes.data);
        if (catRes.data) setCategories(catRes.data);
        if (settleRes.data) setSettlements(settleRes.data);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [id, tenant]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '0.75rem', color: 'var(--text-muted)' }}>
            <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} />
            Cargando...
        </div>
    );
    if (!account) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cuenta no encontrada.</div>;

    // KPIs (all confirmed)
    const confirmed = transactions.filter(t => t.status === 'confirmed');
    const totalIn = confirmed.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalOut = confirmed.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net = totalIn - totalOut;

    // Current week transactions
    const ws = weekStart();
    const we = weekEnd(ws);
    const thisWeekTx = confirmed.filter(t => t.date >= toISO(ws) && t.date <= toISO(we));
    const weekLoaded = thisWeekTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const weekSpent = thisWeekTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Spending by category (all time)
    const byCat: Record<string, number> = {};
    confirmed.filter(t => t.type === 'expense').forEach(t => {
        const name = t.treasury_categories?.name || 'Sin categoría';
        byCat[name] = (byCat[name] || 0) + t.amount;
    });
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxCat = catRows[0]?.[1] || 1;

    // Already settled this week?
    const alreadySettled = settlements.some(s => s.week_start === toISO(ws));

    const handleSettle = async () => {
        if (!id || !tenant || alreadySettled) return;
        setSettling(true);
        const { error } = await supabase.from('cash_settlements').insert({
            tenant_id: tenant.id,
            account_id: id,
            week_start: toISO(ws),
            week_end: toISO(we),
            total_loaded: weekLoaded,
            total_spent: weekSpent,
            remaining_balance: account.balance,
            status: 'submitted',
            notes: settleNotes,
        });
        setSettling(false);
        if (!error) {
            setSettleSuccess(true);
            setTimeout(() => { setShowSettle(false); setSettleSuccess(false); setSettleNotes(''); fetchData(); }, 1800);
        }
    };

    const isCaja = account.type !== 'bank';
    const Icon = isCaja ? Wallet : (account.name?.toLowerCase().includes('banco') ? Landmark : CreditCard);

    const kpis = [
        { label: 'Saldo actual', value: fmt2(account.balance), color: 'var(--brand)', icon: Wallet, big: true },
        { label: 'Total ingresado', value: fmt(totalIn), color: 'var(--success)', icon: TrendingUp },
        { label: 'Total egresado', value: fmt(totalOut), color: 'var(--danger)', icon: TrendingDown },
        { label: 'Resultado neto', value: fmt(net), color: net >= 0 ? 'var(--success)' : 'var(--danger)', icon: ReceiptText },
    ];

    return (
        <div>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <button onClick={() => navigate('/tesoreria/cajas')} className="btn btn-secondary" style={{ gap: '0.4rem', padding: '0.4rem 0.9rem' }}>
                        <ArrowLeft size={15} /> Volver
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="metric-icon primary" style={{ width: '44px', height: '44px' }}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{account.name}</h1>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {isCaja ? 'Caja Fuerte / Efectivo' : 'Banco / Billetera'}
                                {account.assigned_user?.email && ` · ${account.assigned_user.email}`}
                            </p>
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setShowSettle(true)} className="btn btn-secondary"
                            style={{ gap: '0.4rem', borderColor: alreadySettled ? 'var(--success)' : undefined, color: alreadySettled ? 'var(--success)' : undefined }}>
                            <ClipboardCheck size={15} />
                            {alreadySettled ? 'Semana rendida ✓' : 'Rendir semana'}
                        </button>
                        <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ gap: '0.4rem' }}>
                            <Plus size={15} /> Nuevo movimiento
                        </button>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {kpis.map((k, i) => (
                    <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }} className="card"
                        style={{ padding: '1.25rem', borderLeft: `3px solid ${k.color}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <k.icon size={14} color={k.color} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
                        </div>
                        <div style={{ fontSize: k.big ? '1.5rem' : '1.25rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                    </motion.div>
                ))}
            </div>

            {/* Main grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>
                {/* Category breakdown */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                    className="card" style={{ padding: '1.5rem' }}>
                    <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>¿En qué se gastó?</h3>
                    {catRows.length === 0
                        ? <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sin egresos confirmados aún.</p>
                        : catRows.map(([name, amount]) => (
                            <div key={name} style={{ marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{name}</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--danger)' }}>{fmt(amount)}</span>
                                </div>
                                <div style={{ height: '5px', borderRadius: '99px', background: 'var(--border)' }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(amount / maxCat) * 100}%` }}
                                        transition={{ duration: 0.6, ease: 'easeOut' }}
                                        style={{ height: '100%', borderRadius: '99px', background: 'var(--danger)', opacity: 0.7 }} />
                                </div>
                            </div>
                        ))
                    }
                </motion.div>

                {/* Recent transactions */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                    className="card" style={{ padding: '1.5rem' }}>
                    <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
                        Últimos movimientos
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>({transactions.length})</span>
                    </h3>
                    {transactions.length === 0
                        ? <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sin movimientos.</p>
                        : transactions.slice(0, 30).map(tx => {
                            const isIn = tx.type === 'income';
                            return (
                                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isIn ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {tx.treasury_categories?.name || '—'} · {new Date(tx.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: isIn ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}>
                                        {isIn ? '+' : '-'}{fmt(tx.amount)}
                                    </div>
                                    <span className={`badge ${tx.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                                        {tx.status === 'confirmed' ? 'OK' : 'Pend.'}
                                    </span>
                                </div>
                            );
                        })
                    }
                </motion.div>
            </div>

            {/* Settlement History */}
            {settlements.length > 0 && (
                <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                    <button onClick={() => setShowHistory(h => !h)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                            Historial de rendiciones
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>({settlements.length})</span>
                        </span>
                        {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <AnimatePresence>
                        {showHistory && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                style={{ overflow: 'hidden' }}>
                                <div style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {settlements.map(s => (
                                        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '1rem', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-md)' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                    Semana del {fmtDate(s.week_start)} al {fmtDate(s.week_end)}
                                                </div>
                                                {s.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{s.notes}</div>}
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ingresado</div>
                                                <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.875rem' }}>{fmt(s.total_loaded)}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Gastado</div>
                                                <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '0.875rem' }}>{fmt(s.total_spent)}</div>
                                            </div>
                                            <span className={`badge ${s.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>
                                                {s.status === 'approved' ? 'Aprobada' : 'Rendida'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Settle Modal ── */}
            <AnimatePresence>
                {showSettle && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="card" style={{ width: '100%', maxWidth: '480px', padding: '2rem' }}>

                            {settleSuccess ? (
                                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                                    <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
                                    <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>¡Rendición enviada!</div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h3 style={{ margin: 0 }}>Rendir semana</h3>
                                        <button onClick={() => setShowSettle(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                                        Período: <strong>{fmtDate(toISO(ws))}</strong> al <strong>{fmtDate(toISO(we))}</strong>
                                    </div>

                                    {/* Week summary */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                        {[
                                            { label: 'Ingresó', value: fmt(weekLoaded), color: 'var(--success)' },
                                            { label: 'Gastó', value: fmt(weekSpent), color: 'var(--danger)' },
                                            { label: 'Saldo', value: fmt2(account.balance), color: 'var(--brand)' },
                                        ].map(k => (
                                            <div key={k.label} style={{ padding: '0.875rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{k.label}</div>
                                                <div style={{ fontWeight: 800, color: k.color, fontSize: '1rem' }}>{k.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Category breakdown for current week */}
                                    {thisWeekTx.filter(t => t.type === 'expense').length > 0 && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Detalle de gastos</div>
                                            {(() => {
                                                const wcat: Record<string, number> = {};
                                                thisWeekTx.filter(t => t.type === 'expense').forEach(t => {
                                                    const n = t.treasury_categories?.name || 'Sin categoría';
                                                    wcat[n] = (wcat[n] || 0) + t.amount;
                                                });
                                                return Object.entries(wcat).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
                                                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                                                        <span>{name}</span>
                                                        <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(amt)}</span>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    )}

                                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                        <label className="form-label">Notas / observaciones (opcional)</label>
                                        <textarea className="form-input" rows={3} placeholder="Ej: Se gastó más en combustible por viaje a obra extra..."
                                            value={settleNotes} onChange={e => setSettleNotes(e.target.value)}
                                            style={{ resize: 'vertical' }} />
                                    </div>

                                    {alreadySettled ? (
                                        <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>
                                            <CheckCircle2 size={16} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                                            Esta semana ya fue rendida
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <button onClick={() => setShowSettle(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                                            <button onClick={handleSettle} className="btn btn-primary" style={{ flex: 2 }} disabled={settling}>
                                                {settling ? 'Enviando...' : 'Confirmar rendición'}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* New Transaction Modal */}
            {showForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <TransactionForm accounts={accounts} categories={categories} defaultAccountId={id}
                            onSuccess={() => { setShowForm(false); fetchData(); }}
                            onCancel={() => setShowForm(false)} />
                    </div>
                </div>
            )}
        </div>
    );
}
