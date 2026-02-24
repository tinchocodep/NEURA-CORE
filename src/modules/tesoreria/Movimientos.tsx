import { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Pencil } from 'lucide-react';
import TransactionForm from './components/TransactionForm';
import EditTransactionModal from './components/EditTransactionModal';

export default function Movimientos() {
    const { tenant } = useTenant();
    const { role, user } = useAuth() as any;
    const [transactions, setTransactions] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'banks' | 'cajas'>('all');
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
                .limit(100),
            isBasic
                ? supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).eq('assigned_user_id', user?.id).order('name')
                : supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).order('name'),
            isBasic
                ? supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).eq('group', 'Caja Chica').order('name')
                : supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).order('name')
        ]);

        if (txRes.data) {
            // For basic users, only show transactions from their assigned account
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

    useEffect(() => {
        fetchData();
    }, [tenant]);

    const filteredTransactions = transactions.filter(tx => {
        const isCaja = tx.treasury_accounts?.assigned_user_id !== null;
        if (filter === 'banks') return !isCaja;
        if (filter === 'cajas') return isCaja;
        return true;
    });

    return (
        <>
            <div>
                {/* Page Header */}
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

                    {/* Main Table */}
                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="card-title">Historial de Transacciones</h3>

                            {(role === 'admin' || role === 'superadmin') && (
                                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                                    <button
                                        className={`nav-item ${filter === 'all' ? 'active' : ''}`}
                                        onClick={() => setFilter('all')}
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', margin: 0 }}
                                    >
                                        Todas
                                    </button>
                                    <button
                                        className={`nav-item ${filter === 'banks' ? 'active' : ''}`}
                                        onClick={() => setFilter('banks')}
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', margin: 0 }}
                                    >
                                        Bancos
                                    </button>
                                    <button
                                        className={`nav-item ${filter === 'cajas' ? 'active' : ''}`}
                                        onClick={() => setFilter('cajas')}
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', margin: 0 }}
                                    >
                                        Cajas Chicas
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="table-container">
                            {loading ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando datos...</div>
                            ) : filteredTransactions.length === 0 ? (
                                <table style={{ width: '100%' }}>
                                    <tbody>
                                        <tr>
                                            <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                                            // Clean up payment_method — strip "transferencia-[uuid]" → "Transferencia"
                                            const rawMethod = tx.payment_method || '';
                                            const method = rawMethod.startsWith('transferencia-')
                                                ? 'Transferencia'
                                                : rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1);

                                            const dateObj = new Date(tx.date + 'T12:00:00');
                                            const dateLabel = dateObj.toLocaleDateString('es-AR', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            });

                                            return (
                                                <tr key={tx.id} style={{ opacity: tx.treasury_categories?.is_internal_transfer ? 0.6 : 1 }}>
                                                    {/* Fecha */}
                                                    <td>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                                            {dateLabel.split(' ')[0]} {dateLabel.split(' ')[1]}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            {dateLabel.split(' ')[2]}
                                                        </div>
                                                    </td>

                                                    {/* Concepto */}
                                                    <td>
                                                        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.2rem' }}>
                                                            {tx.description || '—'}
                                                            {tx.transfer_pair_id && (
                                                                <span className="badge badge-warning" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>Fondeo</span>
                                                            )}
                                                            {tx.status === 'pendiente' && (
                                                                <span className="badge badge-warning" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>Pendiente</span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {tx.contact_name && <span>{tx.contact_name}</span>}
                                                            {tx.project_name && <span style={{ color: 'var(--brand)', opacity: 0.8 }}>· {tx.project_name}</span>}
                                                            {method && <span style={{ opacity: 0.7 }}>· {method}</span>}
                                                            {tx.invoice_number && <span style={{ opacity: 0.6 }}>· FC {tx.invoice_number}</span>}
                                                        </div>
                                                    </td>

                                                    {/* Categoría */}
                                                    <td>
                                                        {tx.treasury_categories?.name ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                <div style={{
                                                                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                                                                    background: isIn ? 'var(--success)' : 'var(--danger)'
                                                                }} />
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500 }}>
                                                                    {tx.treasury_categories.name}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                                                        )}
                                                        {tx.treasury_categories?.group && (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', paddingLeft: '1.1rem' }}>
                                                                {tx.treasury_categories.group}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Cuenta */}
                                                    <td>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500 }}>
                                                            {tx.treasury_accounts?.name || '—'}
                                                        </div>
                                                        {tx.treasury_accounts?.assigned_user_id && (
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--warning)', marginTop: '0.1rem' }}>Caja chica</div>
                                                        )}
                                                    </td>

                                                    {/* Monto */}
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            fontWeight: 800, fontSize: '0.9375rem',
                                                            color: isIn ? 'var(--success)' : 'var(--danger)'
                                                        }}>
                                                            {isIn ? '+' : '-'}
                                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(tx.amount)}
                                                        </span>
                                                    </td>

                                                    {/* Edit */}
                                                    <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                                                        <button
                                                            onClick={() => setEditingTx(tx)}
                                                            title="Editar"
                                                            style={{
                                                                background: 'none', border: '1px solid var(--border)',
                                                                borderRadius: 'var(--r-sm)', padding: '0.3rem 0.4rem',
                                                                cursor: 'pointer', color: 'var(--text-muted)',
                                                                display: 'flex', alignItems: 'center',
                                                                transition: 'all 0.15s',
                                                            }}
                                                            onMouseEnter={e => {
                                                                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)';
                                                                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand)';
                                                                (e.currentTarget as HTMLButtonElement).style.color = 'var(--brand)';
                                                            }}
                                                            onMouseLeave={e => {
                                                                (e.currentTarget as HTMLButtonElement).style.background = 'none';
                                                                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                                                                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                                                            }}
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
