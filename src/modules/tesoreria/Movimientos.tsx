import { useState, useEffect, useMemo } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Pencil, LayoutList, CalendarDays, ChevronLeft, ChevronRight, Search, Plus, ArrowUpRight, ArrowDownRight, X, Check } from 'lucide-react';
import EditTransactionModal from './components/EditTransactionModal';
import CustomSelect from '../../shared/components/CustomSelect';
import StyledSelect from '../../shared/components/StyledSelect';

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function Movimientos() {
    const { tenant } = useTenant();
    const { role, user } = useAuth() as any;
    const [transactions, setTransactions] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchText, setSearchText] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
    const [calMonth, setCalMonth] = useState(new Date());
    const [calSelected, setCalSelected] = useState<string | null>(null);
    const [editingTx, setEditingTx] = useState<any | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [formStep, setFormStep] = useState(0);
    const [formType, setFormType] = useState<'income' | 'expense'>('income');
    const [formAccount, setFormAccount] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formAmount, setFormAmount] = useState(0);
    const [formDesc, setFormDesc] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
    const [formContact, setFormContact] = useState('');
    const [formMethod, setFormMethod] = useState('transferencia');
    const [showNewAccount, setShowNewAccount] = useState(false);
    const [newAccName, setNewAccName] = useState('');
    const [newAccType, setNewAccType] = useState('bank');

    const createAccount = async () => {
        if (!newAccName.trim()) return;
        const { data } = await supabase.from('treasury_accounts').insert({
            tenant_id: tenant!.id, name: newAccName.trim(), type: newAccType, balance: 0,
        }).select('id, name, type, balance').single();
        if (data) {
            setAccounts((prev: any[]) => [...prev, data]);
            setFormAccount(data.id);
            setShowNewAccount(false);
            setNewAccName('');
        }
    };

    const fetchData = async () => {
        if (!tenant) return;
        setLoading(true);
        const isBasic = role === 'basic';
        const [txRes, accRes, catRes] = await Promise.all([
            supabase.from('treasury_transactions').select('*, treasury_categories(*), treasury_accounts(*)').eq('tenant_id', tenant.id).order('date', { ascending: false }).limit(200),
            isBasic ? supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).eq('assigned_user_id', user?.id).order('name')
                : supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).order('name'),
            isBasic ? supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).eq('group', 'Caja Chica').order('name')
                : supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).order('name'),
        ]);
        if (txRes.data) {
            if (isBasic && accRes.data?.length) {
                const assignedId = accRes.data[0].id;
                setTransactions(txRes.data.filter((tx: any) => tx.treasury_accounts?.id === assignedId));
            } else setTransactions(txRes.data);
        }
        if (accRes.data) setAccounts(accRes.data);
        if (catRes.data) setCategories(catRes.data);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [tenant]);

    const filtered = transactions.filter(tx => {
        if (statusFilter && tx.status !== statusFilter) return false;
        if (searchText) {
            const q = searchText.toLowerCase();
            if (!(tx.description || '').toLowerCase().includes(q) && !(tx.contact_name || '').toLowerCase().includes(q) && !(tx.treasury_accounts?.name || '').toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // KPIs
    const totalIngresos = filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const totalEgresos = filtered.filter(tx => tx.type !== 'income').reduce((s, tx) => s + tx.amount, 0);

    // Calendar helpers
    const calYear = calMonth.getFullYear();
    const calMonthIdx = calMonth.getMonth();
    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const firstDayOfWeek = new Date(calYear, calMonthIdx, 1).getDay();
    const monthLabel = calMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const todayKey = new Date().toISOString().split('T')[0];
    const txByDate = useMemo(() => {
        const map: Record<string, any[]> = {};
        for (const tx of filtered) { const d = (tx.date || '').split('T')[0]; if (!map[d]) map[d] = []; map[d].push(tx); }
        return map;
    }, [filtered]);
    const selectedDayTxs = calSelected ? (txByDate[calSelected] || []) : [];

    const iconBtn: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };

    return (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Movimientos</h1>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar concepto, cuenta..." value={searchText} onChange={e => setSearchText(e.target.value)}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <StyledSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="">Todos los estados</option>
                    <option value="completado">Confirmados</option>
                    <option value="pendiente">Pendientes</option>
                </StyledSelect>
                <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
                    <button onClick={() => setViewMode('table')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'table' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--color-text-muted)' }}><LayoutList size={14} /></button>
                    <button onClick={() => setViewMode('calendar')} style={{ padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'calendar' ? 'var(--color-accent)' : 'transparent', color: viewMode === 'calendar' ? '#fff' : 'var(--color-text-muted)' }}><CalendarDays size={14} /></button>
                </div>
                <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                    <Plus size={14} /> Nuevo
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>{fmt(totalIngresos)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Ingresos</div>
                </div>
                <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#EF4444', fontFamily: 'var(--font-mono)' }}>{fmt(totalEgresos)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Egresos</div>
                </div>
                <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: totalIngresos - totalEgresos >= 0 ? '#10B981' : '#EF4444' }}>{fmt(totalIngresos - totalEgresos)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Balance</div>
                </div>
            </div>

            {/* ── TABLE VIEW ── */}
            {viewMode === 'table' && (
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 90px 70px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
                        <span>Fecha</span><span>Concepto</span><span>Categoría</span><span>Cuenta</span><span style={{ textAlign: 'right' }}>Monto</span><span style={{ textAlign: 'right' }}>Acc.</span>
                    </div>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin movimientos</div>
                    ) : filtered.map(tx => {
                        const isIn = tx.type === 'income';
                        const dateObj = new Date(tx.date + 'T12:00:00');
                        return (
                            <div key={tx.id}
                                style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 90px 70px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s', opacity: tx.treasury_categories?.is_internal_transfer ? 0.6 : 1 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                {/* Fecha */}
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    {dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                </div>
                                {/* Concepto */}
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {tx.description || '—'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                        {tx.contact_name && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{tx.contact_name}</span>}
                                        {tx.status === 'pendiente' && <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#F59E0B15', color: '#F59E0B' }}>Pendiente</span>}
                                    </div>
                                </div>
                                {/* Categoría */}
                                <div>
                                    {tx.treasury_categories?.name ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 99, background: isIn ? '#10B981' : '#EF4444', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{tx.treasury_categories.name}</span>
                                        </div>
                                    ) : <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-faint)' }}>—</span>}
                                </div>
                                {/* Cuenta */}
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tx.treasury_accounts?.name || '—'}
                                </div>
                                {/* Monto */}
                                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                    {isIn ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#EF4444" />}
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700, color: isIn ? '#10B981' : '#EF4444' }}>
                                        {fmt(tx.amount)}
                                    </span>
                                </div>
                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                    <div className="row-action-wrap">
                                        <button onClick={() => setEditingTx(tx)}
                                            style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                                            <Pencil size={13} />
                                        </button>
                                        <span className="row-action-tooltip">Editar</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── CALENDAR VIEW ── */}
            {viewMode === 'calendar' && (
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                            style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.95rem' }}>{monthLabel}</span>
                        <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                            style={{ background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: '0.25rem 0.5rem', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>
                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '0.25rem 0' }}>{d}</div>
                        ))}
                    </div>
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
                                    style={{ minHeight: 64, borderRadius: 8, border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, padding: '0.3rem', cursor: dayTxs.length ? 'pointer' : 'default', background: isSelected ? 'rgba(37,99,235,0.06)' : isToday ? 'rgba(37,99,235,0.02)' : 'var(--color-bg-surface)', transition: 'border-color 0.12s' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--color-cta, #2563EB)' : 'var(--color-text-primary)', marginBottom: '0.15rem' }}>{day}</div>
                                    {income > 0 && <div style={{ fontSize: '0.575rem', fontWeight: 700, color: '#10B981', lineHeight: 1.3 }}>+{fmt(income)}</div>}
                                    {expense > 0 && <div style={{ fontSize: '0.575rem', fontWeight: 700, color: '#EF4444', lineHeight: 1.3 }}>-{fmt(expense)}</div>}
                                </div>
                            );
                        })}
                    </div>
                    {calSelected && selectedDayTxs.length > 0 && (
                        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '1rem' }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>Movimientos del {calSelected}</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {selectedDayTxs.map((tx: any) => (
                                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: 8, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', fontSize: '0.82rem' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{tx.description || '—'}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{tx.treasury_categories?.name} · {tx.treasury_accounts?.name}</div>
                                        </div>
                                        <span style={{ fontWeight: 800, color: tx.type === 'income' ? '#10B981' : '#EF4444' }}>
                                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Wizard form modal */}
        {showForm && (() => {
            const STEPS = [{ label: 'Tipo' }, { label: 'Detalle' }];
            const isLast = formStep === STEPS.length - 1;
            const canNext = formStep === 0 ? !!formAccount : !!(formDesc.trim() && formAmount > 0);
            const filteredCats = categories.filter((c: any) => formType === 'income' ? c.type === 'income' : c.type !== 'income');

            const handleSave = async () => {
                if (!formAccount || !formAmount || !formDesc.trim()) return;
                await supabase.from('treasury_transactions').insert({
                    tenant_id: tenant!.id, account_id: formAccount, category_id: formCategory || null,
                    date: formDate, type: formType, amount: formAmount,
                    description: formDesc.trim(), status: 'completado',
                    payment_method: formMethod, contact_name: formContact || null,
                });
                setShowForm(false); fetchData();
            };

            return (
                <div className="wizard-overlay" onClick={() => setShowForm(false)}>
                <div className="wizard-card" onClick={e => e.stopPropagation()}>
                    <div className="wizard-header">
                        <h3>Nuevo movimiento</h3>
                        <button className="wizard-close" onClick={() => setShowForm(false)}><X size={18} /></button>
                    </div>
                    <div className="wizard-steps">
                        {STEPS.map((s, i) => (
                            <div key={i} className="wizard-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {i > 0 && <div className={`wizard-step-line${i <= formStep ? ' done' : ''}`} />}
                                    <div className={`wizard-step-dot${i === formStep ? ' active' : i < formStep ? ' done' : ' pending'}`}
                                        onClick={() => i < formStep && setFormStep(i)} style={{ cursor: i < formStep ? 'pointer' : 'default' }}>
                                        {i < formStep ? <Check size={14} /> : i + 1}
                                    </div>
                                </div>
                                <div className={`wizard-step-label${i === formStep ? ' active' : i < formStep ? ' done' : ''}`}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                    <div className="wizard-body">
                        {formStep === 0 && (<>
                            <div className="wizard-field">
                                <div className="wizard-section-title">Tipo</div>
                                <div className="wizard-pills" style={{ marginTop: 8 }}>
                                    <button className={`wizard-pill${formType === 'income' ? ' selected' : ''}`}
                                        onClick={() => setFormType('income')} style={formType === 'income' ? { background: '#10B981', borderColor: '#10B981' } : {}}>
                                        Ingreso
                                    </button>
                                    <button className={`wizard-pill${formType === 'expense' ? ' selected' : ''}`}
                                        onClick={() => setFormType('expense')} style={formType === 'expense' ? { background: '#EF4444', borderColor: '#EF4444' } : {}}>
                                        Egreso
                                    </button>
                                </div>
                            </div>
                            <div className="wizard-field">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <label className="form-label">Cuenta *</label>
                                    <button type="button" onClick={() => setShowNewAccount(true)}
                                        style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-cta, #2563EB)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Crear cuenta</button>
                                </div>
                                <CustomSelect
                                    value={formAccount}
                                    onChange={v => setFormAccount(v)}
                                    placeholder="Seleccionar cuenta..."
                                    options={accounts.map((a: any) => ({ value: a.id, label: a.name, sub: a.type === 'bank' ? 'Banco' : a.type === 'cash' ? 'Efectivo' : a.type }))}
                                />
                                {showNewAccount && (
                                    <div style={{ padding: 14, borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Nueva cuenta</div>
                                        <div className="wizard-field">
                                            <input className="form-input" value={newAccName} onChange={e => setNewAccName(e.target.value)} placeholder="Ej: Banco Galicia" />
                                        </div>
                                        <div className="wizard-pills">
                                            {[{ key: 'bank', label: 'Banco' }, { key: 'cash', label: 'Efectivo' }, { key: 'echeq', label: 'eCheq' }].map(t => (
                                                <button key={t.key} className={`wizard-pill${newAccType === t.key ? ' selected' : ''}`}
                                                    onClick={() => setNewAccType(t.key)}>{t.label}</button>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button onClick={() => setShowNewAccount(false)} className="wizard-btn-back" style={{ padding: '6px 14px', fontSize: '0.8125rem' }}>Cancelar</button>
                                            <button onClick={createAccount} className="wizard-btn-next" style={{ padding: '6px 14px', fontSize: '0.8125rem' }} disabled={!newAccName.trim()}>Crear</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Fecha</label>
                                <input type="date" className="form-input" value={formDate} onChange={e => setFormDate(e.target.value)} />
                            </div>
                            <div className="wizard-field">
                                <div className="wizard-section-title">Medio de pago</div>
                                <div className="wizard-pills" style={{ marginTop: 8 }}>
                                    {['transferencia', 'efectivo', 'cheque', 'echeq'].map(m => (
                                        <button key={m} className={`wizard-pill${formMethod === m ? ' selected' : ''}`}
                                            onClick={() => setFormMethod(m)} style={{ textTransform: 'capitalize' }}>{m}</button>
                                    ))}
                                </div>
                            </div>
                        </>)}
                        {formStep === 1 && (<>
                            <div className="wizard-field">
                                <label className="form-label">Concepto *</label>
                                <input className="form-input" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Ej: Cobro alquiler Av. Santa Fe" />
                            </div>
                            <div className="wizard-row">
                                <div className="wizard-field">
                                    <label className="form-label">Monto *</label>
                                    <input type="number" className="form-input" value={formAmount || ''} onChange={e => setFormAmount(Number(e.target.value))} placeholder="0" />
                                </div>
                                <div className="wizard-field">
                                    <label className="form-label">Contacto</label>
                                    <input className="form-input" value={formContact} onChange={e => setFormContact(e.target.value)} placeholder="Nombre del contacto" />
                                </div>
                            </div>
                            {filteredCats.length > 0 && (
                                <div className="wizard-field">
                                    <label className="form-label">Categoría</label>
                                    <CustomSelect
                                        value={formCategory}
                                        onChange={v => setFormCategory(v)}
                                        placeholder="Seleccionar categoría..."
                                        emptyLabel="Sin categoría"
                                        options={filteredCats.map((c: any) => ({ value: c.id, label: c.name, group: c.group || '' }))}
                                    />
                                </div>
                            )}
                        </>)}
                    </div>
                    <div className="wizard-footer">
                        <div className="wizard-footer-left" />
                        <div className="wizard-footer-right">
                            {formStep > 0 && (
                                <button className="wizard-btn-back" onClick={() => setFormStep(s => s - 1)}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                                </button>
                            )}
                            {isLast ? (
                                <button className="wizard-btn-next" onClick={handleSave} disabled={!canNext}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Crear</span>
                                </button>
                            ) : (
                                <button className="wizard-btn-next" onClick={() => setFormStep(s => s + 1)} disabled={!canNext}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Siguiente <ChevronRight size={16} /></span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                </div>
            );
        })()}

        {editingTx && (
            <EditTransactionModal tx={editingTx} accounts={accounts} categories={categories} onClose={() => setEditingTx(null)} onSaved={fetchData} />
        )}
        </>
    );
}
