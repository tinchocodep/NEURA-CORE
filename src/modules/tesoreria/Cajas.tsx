import { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import AccountForm from './components/AccountForm';
import CategoryForm from './components/CategoryForm';
import { Landmark, List, ChevronRight, AlertTriangle, ClipboardCheck } from 'lucide-react';

function weekStartISO() {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
}

export default function Cajas() {
    const { tenant } = useTenant();
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [pendingMap, setPendingMap] = useState<Set<string>>(new Set());

    const fetchData = async () => {
        if (!tenant) return;
        const ws = weekStartISO();
        const [accRes, catRes, settleRes] = await Promise.all([
            supabase.from('treasury_accounts')
                .select('*, assigned_user:users!treasury_accounts_assigned_user_id_fkey(email)')
                .eq('tenant_id', tenant.id)
                .not('assigned_user_id', 'is', null)
                .order('name'),
            supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).order('name'),
            // fetch all settlements for this week
            supabase.from('cash_settlements')
                .select('account_id')
                .eq('tenant_id', tenant.id)
                .eq('week_start', ws),
        ]);
        if (accRes.data) setAccounts(accRes.data);
        if (catRes.data) setCategories(catRes.data);
        // Build set of account_ids that already settled this week
        if (settleRes.data) {
            setPendingMap(new Set(settleRes.data.map((s: any) => s.account_id)));
        }
    };

    useEffect(() => { fetchData(); }, [tenant]);

    const pendingAccounts = accounts.filter(a => !pendingMap.has(a.id));

    return (
        <div>
            <div className="page-header">
                <h1>Cajas de Empleados</h1>
                <p>Cajas chicas asignadas a empleados. Hacé click en una caja para ver su ficha completa.</p>
            </div>

            {/* ── Pending alert ── */}
            {pendingAccounts.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--r-lg)', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                    <div>
                        <div style={{ fontWeight: 700, color: 'var(--warning)', marginBottom: '0.35rem' }}>
                            {pendingAccounts.length} {pendingAccounts.length === 1 ? 'caja sin rendir' : 'cajas sin rendir'} esta semana
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {pendingAccounts.map(a => (
                                <button key={a.id} onClick={() => navigate(`/tesoreria/cajas/${a.id}`)}
                                    className="badge badge-warning"
                                    style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', border: 'none', background: 'rgba(245,158,11,0.15)' }}>
                                    {a.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {accounts.length === 0 && (
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>No hay cajas de empleados registradas aún.</p>
            )}

            {/* ── Cajas list ── */}
            {accounts.length > 0 && (
                <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div className="metric-icon primary" style={{ width: '40px', height: '40px' }}>
                            <Landmark size={20} />
                        </div>
                        <h3 className="card-title" style={{ margin: 0 }}>Cajas activas</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        {accounts.map(acc => {
                            const settled = pendingMap.has(acc.id);
                            return (
                                <div key={acc.id} onClick={() => navigate(`/tesoreria/cajas/${acc.id}`)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: `1px solid ${settled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background 0.15s', background: settled ? 'rgba(16,185,129,0.03)' : undefined }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = settled ? 'rgba(16,185,129,0.03)' : '')}>
                                    <div>
                                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {acc.name}
                                            {acc.assigned_user?.email && (
                                                <span className="badge badge-warning" style={{ fontSize: '0.7rem', textTransform: 'none' }}>
                                                    {acc.assigned_user.email}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            {acc.type === 'bank' ? 'Banco / Billetera' : 'Efectivo'}
                                            {settled
                                                ? <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ClipboardCheck size={11} /> Rendida esta semana</span>
                                                : <span style={{ color: 'var(--warning)' }}>⚠ Pendiente de rendición</span>
                                            }
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--tenant-primary)' }}>
                                            ${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </div>
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                        <AccountForm onSuccess={fetchData} />
                    </div>
                </div>
            )}

            {/* If no accounts yet, show AccountForm */}
            {accounts.length === 0 && (
                <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <h3 className="card-title" style={{ marginBottom: '1rem' }}>Crear primera caja</h3>
                    <AccountForm onSuccess={fetchData} />
                </div>
            )}

            {/* Categories */}
            <div className="card" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div className="metric-icon" style={{ width: '40px', height: '40px', background: 'rgba(14,165,233,0.1)', color: 'var(--tenant-secondary)' }}>
                        <List size={20} />
                    </div>
                    <h3 className="card-title" style={{ margin: 0 }}>Categorías de Caja Chica</h3>
                </div>
                <div style={{ marginBottom: '2rem' }}>
                    <CategoryForm onSuccess={fetchData} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {categories.filter(c => c.group === 'Caja Chica').length === 0
                        ? <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No hay categorías de caja chica.</p>
                        : categories.filter(c => c.group === 'Caja Chica').map(cat => (
                            <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                <span style={{ fontWeight: 500 }}>{cat.name}</span>
                                <span className={`badge ${cat.type === 'income' ? 'badge-success' : 'badge-danger'}`}
                                    style={{ opacity: 0.8, background: 'transparent', border: '1px solid currentColor' }}>
                                    {cat.type === 'income' ? 'Ingreso' : 'Egreso'}
                                </span>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}
