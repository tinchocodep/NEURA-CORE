import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Search, Plus, Trash2, X, Check, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';

interface Cuenta {
    id: string; name: string; type: string; balance: number;
}
interface Movimiento {
    id: string; date: string; type: string; amount: number; description: string;
    contact_name: string | null; payment_method: string | null;
    treasury_categories: { name: string } | null;
}

export default function Bancos() {
    const { tenant } = useTenant();
    const [cuentas, setCuentas] = useState<Cuenta[]>([]);
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [loading, setLoading] = useState(true);
    const [selCuenta, setSelCuenta] = useState('');
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [formName, setFormName] = useState('');
    const [formType, setFormType] = useState('bank');
    const { requestDelete, ConfirmModal } = useConfirmDelete();

    useEffect(() => { if (tenant) loadCuentas(); }, [tenant]);
    useEffect(() => { if (tenant && selCuenta) loadMovimientos(); }, [selCuenta]);

    const loadCuentas = async () => {
        setLoading(true);
        const { data } = await supabase.from('treasury_accounts').select('id, name, type, balance').eq('tenant_id', tenant!.id).order('name');
        if (data) setCuentas(data);
        setLoading(false);
    };

    const loadMovimientos = async () => {
        const { data } = await supabase.from('treasury_transactions')
            .select('id, date, type, amount, description, contact_name, payment_method, treasury_categories(name)')
            .eq('tenant_id', tenant!.id).eq('account_id', selCuenta)
            .order('date', { ascending: false }).limit(20);
        if (data) setMovimientos(data as any);
    };

    const openNew = () => { setFormName(''); setFormType('bank'); setShowModal(true); };

    const save = async () => {
        if (!formName.trim()) return;
        await supabase.from('treasury_accounts').insert({ tenant_id: tenant!.id, name: formName.trim(), type: formType, balance: 0 });
        setShowModal(false); loadCuentas();
    };

    const remove = (c: Cuenta) => {
        requestDelete(`Esta acción eliminará la cuenta "${c.name}" y no se puede deshacer.`, async () => {
            await supabase.from('treasury_accounts').delete().eq('id', c.id);
            if (selCuenta === c.id) { setSelCuenta(''); setMovimientos([]); }
            loadCuentas();
        });
    };

    const fmtMoney = (n: number) => `$${Math.abs(n).toLocaleString('es-AR')}`;
    const totalBalance = cuentas.reduce((s, c) => s + (c.balance || 0), 0);
    const cuentaName = (id: string) => cuentas.find(c => c.id === id)?.name || '';

    const TIPO_ICON: Record<string, string> = { bank: '🏦', cash: '💵', echeq: '📄' };
    const TIPO_LABEL: Record<string, string> = { bank: 'Banco', cash: 'Efectivo', echeq: 'eCheq' };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando cuentas...</div>;

    const iconBtn: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Bancos y Cuentas</h1>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar cuenta..." value={search} onChange={e => setSearch(e.target.value)}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                    <Plus size={14} /> Nueva cuenta
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: totalBalance >= 0 ? '#10B981' : '#EF4444' }}>{fmtMoney(totalBalance)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Balance total</div>
                </div>
                <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{cuentas.length}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Cuentas activas</div>
                </div>
            </div>

            {/* Account cards */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cuentas.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).map(c => {
                    const isActive = selCuenta === c.id;
                    return (
                        <div key={c.id} onClick={() => setSelCuenta(selCuenta === c.id ? '' : c.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12,
                                border: `1.5px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                                background: isActive ? 'rgba(37,99,235,0.04)' : 'var(--color-bg-card)',
                                cursor: 'pointer', transition: 'all 0.12s', minWidth: 180,
                            }}>
                            <span style={{ fontSize: '1.25rem' }}>{TIPO_ICON[c.type] || '🏦'}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.name}</div>
                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{TIPO_LABEL[c.type] || c.type}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700, color: (c.balance || 0) >= 0 ? '#10B981' : '#EF4444' }}>
                                {fmtMoney(c.balance || 0)}
                            </div>
                            <div className="row-action-wrap" onClick={e => e.stopPropagation()}>
                                <button onClick={() => remove(c)}
                                    style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420', width: 24, height: 24 }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                                    <Trash2 size={12} />
                                </button>
                                <span className="row-action-tooltip">Eliminar</span>
                            </div>
                        </div>
                    );
                })}
                {cuentas.length === 0 && <div style={{ padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin cuentas. Creá la primera.</div>}
            </div>

            {/* Movimientos de cuenta seleccionada */}
            {selCuenta && (
                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Últimos movimientos — {cuentaName(selCuenta)}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 90px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <span>Fecha</span><span>Concepto</span><span>Categoría</span><span style={{ textAlign: 'right' }}>Monto</span>
                    </div>
                    {movimientos.map(m => {
                        const isIn = m.type === 'income';
                        return (
                            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 90px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                                    {new Date(m.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description || '—'}</div>
                                    {m.contact_name && <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{m.contact_name}</div>}
                                </div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{m.treasury_categories?.name || '—'}</div>
                                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                    {isIn ? <ArrowUpRight size={11} color="#10B981" /> : <ArrowDownRight size={11} color="#EF4444" />}
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: isIn ? '#10B981' : '#EF4444' }}>{fmtMoney(m.amount)}</span>
                                </div>
                            </div>
                        );
                    })}
                    {movimientos.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin movimientos en esta cuenta</div>}
                </div>
            )}

            {/* ─── WIZARD MODAL ─── */}
            {showModal && (() => {
                return (
                    <div className="wizard-overlay" onClick={() => setShowModal(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()}>
                        <div className="wizard-header">
                            <h3>Nueva cuenta</h3>
                            <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-body">
                            <div className="wizard-field">
                                <label className="form-label">Nombre de la cuenta *</label>
                                <input className="form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Banco Galicia, Efectivo oficina..." />
                            </div>
                            <div className="wizard-field">
                                <div className="wizard-section-title">Tipo de cuenta</div>
                                <div className="wizard-card-options" style={{ marginTop: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                    {[
                                        { key: 'bank', label: 'Banco', icon: '🏦', desc: 'Cuenta bancaria' },
                                        { key: 'cash', label: 'Efectivo', icon: '💵', desc: 'Caja efectivo' },
                                        { key: 'echeq', label: 'eCheq', icon: '📄', desc: 'Cheques electrónicos' },
                                    ].map(t => (
                                        <div key={t.key} className={`wizard-card-option${formType === t.key ? ' selected' : ''}`}
                                            onClick={() => setFormType(t.key)}>
                                            <div className="card-icon">{t.icon}</div>
                                            <div className="card-label">{t.label}</div>
                                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{t.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left" />
                            <div className="wizard-footer-right">
                                <button className="wizard-btn-next" onClick={save} disabled={!formName.trim()}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Crear cuenta</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    </div>
                );
            })()}

            {ConfirmModal}
        </div>
    );
}
