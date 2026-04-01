import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useToast } from '../../../contexts/ToastContext';
import { Plus, Search, Check } from 'lucide-react';
import ProjectSearch from './ProjectSearch';
import StyledSelect from '../../../shared/components/StyledSelect';

// ── Searchable expense-category picker ──────────────────────────────────────
function ExpenseCategorySearch({ categories, selectedId, onSelect, tenant, onCreated }: {
    categories: any[];
    selectedId: string;
    onSelect: (id: string) => void;
    tenant: any;
    onCreated: (cat: any) => void;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();

    const openDropdown = () => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
        setOpen(true);
    };

    const selected = categories.find(c => c.id === selectedId);
    const filtered = query.trim()
        ? categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
        : categories;
    const exactMatch = categories.some(c => c.name.toLowerCase() === query.toLowerCase().trim());

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleCreate = async () => {
        if (!tenant || !query.trim() || creating) return;
        setCreating(true);
        const { data, error } = await supabase.from('treasury_categories').insert({
            tenant_id: tenant.id,
            name: query.trim(),
            type: 'expense',
            is_internal_transfer: false,
        }).select().single();
        setCreating(false);
        if (error) { addToast('error', 'Error', error.message); return; }
        addToast('success', 'Categoría creada', `"${data.name}" agregada.`);
        onCreated(data);
        setQuery('');
        setOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div className="form-input" onClick={openDropdown}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'text', padding: '0.5rem 0.875rem' }}>
                <Search size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                {open || !selected ? (
                    <input
                        autoFocus={open}
                        type="text"
                        placeholder={selected ? selected.name : 'Buscar categoría...'}
                        value={query}
                        onChange={e => { setQuery(e.target.value); openDropdown(); }}
                        onFocus={openDropdown}
                        style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-main)' }}
                    />
                ) : (
                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-main)' }}>{selected.name}</span>
                )}
                {selected && !open && <Check size={13} color="var(--success)" />}
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        style={{
                            position: 'fixed', zIndex: 9999,
                            top: dropPos.top, left: dropPos.left, width: dropPos.width,
                            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: '220px', overflowY: 'auto'
                        }}>
                        {filtered.map(cat => (
                            <div key={cat.id}
                                onMouseDown={() => { onSelect(cat.id); setQuery(''); setOpen(false); }}
                                style={{
                                    padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.875rem',
                                    background: cat.id === selectedId ? 'rgba(99,102,241,0.08)' : undefined,
                                    display: 'flex', flexDirection: 'column', gap: '0.1rem'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = cat.id === selectedId ? 'rgba(99,102,241,0.08)' : '')}>
                                <span style={{ fontWeight: 600 }}>{cat.name}</span>
                                {cat.group && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cat.group}</span>}
                            </div>
                        ))}
                        {!exactMatch && query.trim() && (
                            <div onMouseDown={handleCreate}
                                style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.875rem', borderTop: '1px solid var(--border)', color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Plus size={13} />
                                {creating ? 'Creando...' : `Crear "${query.trim()}"`}
                            </div>
                        )}
                        {filtered.length === 0 && !query.trim() && (
                            <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin categorías de egreso</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

type TransactionType = 'expense' | 'income' | 'transfer';

export default function TransactionForm({
    accounts,
    categories,
    onSuccess,
    onCancel,
    defaultAccountId,
}: {
    accounts: any[];
    categories: any[];
    onSuccess: () => void;
    onCancel?: () => void;
    defaultAccountId?: string;
}) {
    const { tenant } = useTenant();
    const { addToast } = useToast();

    // Type selection
    const [txType, setTxType] = useState<TransactionType>('expense');

    // Common fields
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [accountId, setAccountId] = useState(defaultAccountId || '');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    // Expense: category state (now uses ExpenseCategorySearch, only need categoryId)
    const [categoryId, setCategoryId] = useState('');


    // Income category: create new or select existing
    const [incomeMode, setIncomeMode] = useState<'select' | 'create'>('select');
    const [incomeCategoryId, setIncomeCategoryId] = useState('');
    const [newIncomeCategoryName, setNewIncomeCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);

    // Other fields
    const [contactName, setContactName] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('transferencia');
    const [status, setStatus] = useState('completado');
    const [projectName, setProjectName] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [destinationAccountId, setDestinationAccountId] = useState('');
    const [checkDate, setCheckDate] = useState('');
    const [checkNumber, setCheckNumber] = useState('');

    const isCheque = paymentMethod === 'cheque';
    const effectiveDate = isCheque && checkDate ? checkDate : date;
    const effectiveStatus = isCheque ? 'pendiente' : status;

    // Auto-select account if only one is available
    useEffect(() => {
        if (accounts.length === 1 && !accountId) {
            setAccountId(accounts[0].id);
        }
    }, [accounts, accountId]);

    // Reset category selection when type changes
    useEffect(() => {
        setCategoryId('');
        setIncomeCategoryId('');
        setNewIncomeCategoryName('');
        setIncomeMode('select');
    }, [txType]);

    // Derived: income categories
    const incomeCategories = categories.filter(c => !c.is_internal_transfer && c.type === 'income');

    // Create a new income category
    const handleCreateIncomeCategory = async () => {
        if (!tenant || !newIncomeCategoryName.trim()) return;
        setCreatingCategory(true);
        const { data, error } = await supabase
            .from('treasury_categories')
            .insert({ tenant_id: tenant.id, name: newIncomeCategoryName.trim(), type: 'income', is_internal_transfer: false })
            .select()
            .single();
        if (error) {
            addToast('error', 'Error', error.message);
        } else {
            setIncomeCategoryId(data.id);
            setIncomeMode('select');
            setNewIncomeCategoryName('');
            // Re-fetch categories would happen via onSuccess, but let's push the new cat to existing list
            categories.push(data);
            addToast('success', 'Categoría creada', `"${data.name}" agregada a ingresos.`);
        }
        setCreatingCategory(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenant || !accountId) return;
        setLoading(true);

        const amountValue = parseFloat(amount);

        // ── TRANSFERENCIA ──
        if (txType === 'transfer') {
            if (!destinationAccountId) {
                addToast('error', 'Error', 'Debe seleccionar una cuenta de destino');
                setLoading(false);
                return;
            }
            if (accountId === destinationAccountId) {
                addToast('error', 'Error', 'La cuenta de origen y destino deben ser diferentes');
                setLoading(false);
                return;
            }
            const transferPairId = crypto.randomUUID();
            const expenseCat = categories.find(c => c.is_internal_transfer && c.type === 'expense');
            const incomeCat = categories.find(c => c.is_internal_transfer && c.type === 'income');
            if (!expenseCat || !incomeCat) {
                addToast('error', 'Error Configuración', 'No se encontraron las categorías de transferencia interna');
                setLoading(false);
                return;
            }
            await supabase.from('treasury_transactions').insert({
                tenant_id: tenant.id, account_id: accountId, category_id: expenseCat.id,
                type: 'expense', amount: amountValue,
                description: `Fondeo a ${accounts.find(a => a.id === destinationAccountId)?.name}: ${description}`,
                date, transfer_pair_id: transferPairId
            });
            await supabase.from('treasury_transactions').insert({
                tenant_id: tenant.id, account_id: destinationAccountId, category_id: incomeCat.id,
                type: 'income', amount: amountValue,
                description: `Fondeo desde ${accounts.find(a => a.id === accountId)?.name}: ${description}`,
                date, transfer_pair_id: transferPairId
            });
            const sourceAcc = accounts.find(a => a.id === accountId);
            const destAcc = accounts.find(a => a.id === destinationAccountId);
            if (sourceAcc) await supabase.from('treasury_accounts').update({ balance: sourceAcc.balance - amountValue }).eq('id', sourceAcc.id);
            if (destAcc) await supabase.from('treasury_accounts').update({ balance: destAcc.balance + amountValue }).eq('id', destAcc.id);
            addToast('success', 'Transferencia Exitosa', 'El fondeo se completó correctamente.');
            setAmount(''); setDescription(''); setDestinationAccountId('');
            onSuccess();
            setLoading(false);
            return;
        }

        // ── EGRESO ──
        if (txType === 'expense') {
            if (!categoryId) {
                addToast('error', 'Error', 'Seleccioná una categoría de egreso');
                setLoading(false);
                return;
            }
            const { error } = await supabase.from('treasury_transactions').insert({
                tenant_id: tenant.id, account_id: accountId, category_id: categoryId,
                type: 'expense', amount: amountValue, description, date: effectiveDate,
                contact_name: contactName || null, payment_method: paymentMethod,
                status: effectiveStatus, project_name: projectName || null,
                invoice_number: invoiceNumber || null,
                check_date: isCheque ? checkDate || null : null,
                check_number: isCheque ? checkNumber || null : null,
            });
            if (!error) {
                const account = accounts.find(a => a.id === accountId);
                if (account) await supabase.from('treasury_accounts').update({ balance: account.balance - amountValue }).eq('id', account.id);
                addToast('success', 'Egreso registrado', isCheque ? 'Cheque agendado en el calendario de pagos.' : 'El movimiento se guardó correctamente.');
                setAmount(''); setDescription(''); setCategoryId('');
                setContactName(''); setProjectName(''); setInvoiceNumber(''); setStatus('completado');
                setCheckDate(''); setCheckNumber('');
                onSuccess();
            } else { addToast('error', 'Error', error.message); }
        }

        // ── INGRESO ──
        if (txType === 'income') {
            const finalCategoryId = incomeCategoryId;
            if (!finalCategoryId) {
                addToast('error', 'Error', 'Seleccioná o creá una categoría de ingreso');
                setLoading(false);
                return;
            }
            const { error } = await supabase.from('treasury_transactions').insert({
                tenant_id: tenant.id, account_id: accountId, category_id: finalCategoryId,
                type: 'income', amount: amountValue, description, date: effectiveDate,
                contact_name: contactName || null, payment_method: paymentMethod,
                status: effectiveStatus, project_name: projectName || null,
                invoice_number: invoiceNumber || null,
                check_date: isCheque ? checkDate || null : null,
                check_number: isCheque ? checkNumber || null : null,
            });
            if (!error) {
                const account = accounts.find(a => a.id === accountId);
                if (account) await supabase.from('treasury_accounts').update({ balance: account.balance + amountValue }).eq('id', account.id);
                addToast('success', 'Ingreso registrado', isCheque ? 'Cheque agendado en el calendario de cobros.' : 'El movimiento se guardó correctamente.');
                setAmount(''); setDescription(''); setIncomeCategoryId('');
                setContactName(''); setProjectName(''); setInvoiceNumber(''); setStatus('completado');
                setCheckDate(''); setCheckNumber('');
                onSuccess();
            } else { addToast('error', 'Error', error.message); }
        }

        setLoading(false);
    };

    const tabStyle = (active: boolean, color?: string): React.CSSProperties => ({
        flex: 1,
        padding: '0.55rem 0.5rem',
        borderRadius: 'var(--r-md)',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.8125rem',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
        background: active ? (color || 'var(--brand)') : 'transparent',
        color: active ? '#fff' : 'var(--text-muted)',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
    });

    return (
        <div>
            {/* ── Type Toggle ── */}
            <div style={{
                display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
                background: 'var(--bg-main)', borderRadius: 'var(--r-lg)',
                padding: '0.3rem', border: '1px solid var(--border)'
            }}>
                <button type="button" style={tabStyle(txType === 'expense', 'var(--danger)')} onClick={() => setTxType('expense')}>
                    Egreso
                </button>
                <button type="button" style={tabStyle(txType === 'income', 'var(--success)')} onClick={() => setTxType('income')}>
                    Ingreso
                </button>
                <button type="button" style={tabStyle(txType === 'transfer')} onClick={() => setTxType('transfer')}>
                    Fondeo
                </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>

                {/* Descripción */}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Descripción</label>
                    <input type="text" className="form-input"
                        placeholder={txType === 'transfer' ? 'Motivo del fondeo' : 'Motivo de la transacción'}
                        value={description} onChange={e => setDescription(e.target.value)} required />
                </div>

                {/* Cuenta */}
                <div className="form-group" style={{ gridColumn: txType === 'transfer' ? '1' : '1 / -1' }}>
                    <label className="form-label">{txType === 'transfer' ? 'Cuenta Origen' : 'Banco / Cuenta'}</label>
                    <StyledSelect className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)} required>
                        <option value="">Seleccione una cuenta</option>
                        {txType === 'transfer' ? (
                            <>
                                <optgroup label="🏦 Bancos">
                                    {accounts.filter(a => !a.assigned_user_id).map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} (${acc.balance?.toLocaleString('es-AR')})</option>
                                    ))}
                                </optgroup>
                                <optgroup label="💵 Cajas Chicas">
                                    {accounts.filter(a => !!a.assigned_user_id).map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} (${acc.balance?.toLocaleString('es-AR')})</option>
                                    ))}
                                </optgroup>
                            </>
                        ) : (
                            // For expense/income: only show bank accounts
                            accounts.filter(a => !a.assigned_user_id).map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} — ${acc.balance?.toLocaleString('es-AR')}</option>
                            ))
                        )}
                    </StyledSelect>
                </div>

                {/* Cuenta destino para transferencia */}
                {txType === 'transfer' && (
                    <div className="form-group">
                        <label className="form-label">Cuenta Destino</label>
                        <StyledSelect className="form-input" value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} required>
                            <option value="">Seleccione destino</option>
                            <optgroup label="🏦 Bancos">
                                {accounts.filter(a => !a.assigned_user_id).map(acc => (
                                    <option key={acc.id} value={acc.id} disabled={acc.id === accountId}>{acc.name}</option>
                                ))}
                            </optgroup>
                            <optgroup label="💵 Cajas Chicas">
                                {accounts.filter(a => !!a.assigned_user_id).map(acc => (
                                    <option key={acc.id} value={acc.id} disabled={acc.id === accountId}>{acc.name}</option>
                                ))}
                            </optgroup>
                        </StyledSelect>
                    </div>
                )}

                {/* ══ EGRESO: Buscador de categorías ══ */}
                {txType === 'expense' && (
                    <div className="form-group" style={{ gridColumn: '1 / -1', position: 'relative' }}>
                        <label className="form-label">Categoría de egreso</label>
                        <ExpenseCategorySearch
                            categories={categories.filter(c => c.type === 'expense')}
                            selectedId={categoryId}
                            onSelect={(id) => setCategoryId(id)}
                            tenant={tenant}
                            onCreated={(newCat) => {
                                setCategoryId(newCat.id);
                            }}
                        />
                    </div>
                )}

                {/* ══ INGRESO: Seleccionar o crear categoría ══ */}
                {txType === 'income' && (
                    <motion.div style={{ gridColumn: '1 / -1' }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Categoría de Ingreso</span>
                                <button type="button"
                                    onClick={() => setIncomeMode(incomeMode === 'create' ? 'select' : 'create')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>
                                    <Plus size={12} />
                                    {incomeMode === 'create' ? 'Seleccionar existente' : 'Crear nueva'}
                                </button>
                            </label>

                            <AnimatePresence mode="wait">
                                {incomeMode === 'select' ? (
                                    <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                        {incomeCategories.length === 0 ? (
                                            <div style={{ background: 'var(--info-bg)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--r-md)', padding: '0.75rem', fontSize: '0.875rem', color: 'var(--info)' }}>
                                                No hay categorías de ingreso. Hacé click en <strong>"Crear nueva"</strong> para agregar una.
                                            </div>
                                        ) : (
                                            <StyledSelect className="form-input" value={incomeCategoryId} onChange={e => setIncomeCategoryId(e.target.value)} required>
                                                <option value="">Seleccione una categoría</option>
                                                {incomeCategories.map(cat => (
                                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                ))}
                                            </StyledSelect>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                                        style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input className="form-input" type="text" placeholder="Ej: Cobro a cliente, Anticipo obra..."
                                            value={newIncomeCategoryName} onChange={e => setNewIncomeCategoryName(e.target.value)}
                                            style={{ flex: 1 }} />
                                        <button type="button" className="btn btn-secondary"
                                            onClick={handleCreateIncomeCategory}
                                            disabled={creatingCategory || !newIncomeCategoryName.trim()}
                                            style={{ whiteSpace: 'nowrap', padding: '0.6rem 1rem' }}>
                                            {creatingCategory ? '...' : 'Guardar'}
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}

                {/* Fecha */}
                <div className="form-group">
                    <label className="form-label">Fecha</label>
                    <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} required />
                </div>

                {/* Monto */}
                <div className="form-group">
                    <label className="form-label">Monto</label>
                    <input type="number" step="0.01" className="form-input" placeholder="0.00"
                        value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>

                {/* Campos extra para ingreso/egreso */}
                {txType !== 'transfer' && (
                    <>
                        <div className="form-group">
                            <label className="form-label">Contacto / Entidad (Opcional)</label>
                            <input type="text" className="form-input" placeholder="Ej: Proveedor S.A."
                                value={contactName} onChange={e => setContactName(e.target.value)} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Método de Pago</label>
                            <StyledSelect className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                {/* Dynamic transferencia options — one per bank account */}
                                {accounts.filter(a => a.type === 'bank').length > 0
                                    ? accounts.filter(a => a.type === 'bank').map(a => (
                                        <option key={a.id} value={`transferencia-${a.id}`}>
                                            Transferencia desde {a.name}
                                        </option>
                                    ))
                                    : <option value="transferencia">Transferencia</option>
                                }
                                <option value="efectivo">Efectivo</option>
                                <option value="cheque">Cheque</option>
                                <option value="tarjeta">Tarjeta</option>
                                <option value="otro">Otro</option>
                            </StyledSelect>
                        </div>

                        {/* Cheque fields — shown automatically when method = cheque */}
                        {isCheque && (
                            <>
                                <div className="form-group" style={{ gridColumn: '1 / -1', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--r-md)', padding: '1rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--warning)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                                        📋 Datos del cheque
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div>
                                            <label className="form-label">Fecha de acreditación *</label>
                                            <input type="date" className="form-input" value={checkDate}
                                                onChange={e => setCheckDate(e.target.value)} required={isCheque} />
                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                                Se agendará en el calendario de pagos en esa fecha
                                            </p>
                                        </div>
                                        <div>
                                            <label className="form-label">N° de cheque (opcional)</label>
                                            <input type="text" className="form-input" placeholder="Ej: 00012345"
                                                value={checkNumber} onChange={e => setCheckNumber(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Status selector — hidden for cheques (auto-pendiente) */}
                        {!isCheque && (
                            <div className="form-group">
                                <label className="form-label">Estado</label>
                                <StyledSelect className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                                    <option value="completado">Completado</option>
                                    <option value="pendiente">Pendiente (A futuro)</option>
                                </StyledSelect>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Obra / Proyecto (Opcional)</label>
                            <ProjectSearch
                                value={projectName}
                                onChange={setProjectName}
                                tenant={tenant}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">N° Factura / Comprobante (Opcional)</label>
                            <input type="text" className="form-input" placeholder="Ej: FC-0001-00002341"
                                value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                        </div>
                    </>
                )}

                {/* Submit */}
                <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', display: 'flex', gap: '0.75rem' }}>
                    {onCancel && (
                        <button type="button" onClick={onCancel} className="btn btn-secondary" style={{ flex: 1, padding: '0.8rem' }}>
                            Cancelar
                        </button>
                    )}
                    <button type="submit" className="btn btn-primary" style={{ flex: onCancel ? 2 : undefined, width: onCancel ? undefined : '100%', padding: '0.8rem' }} disabled={loading}>
                        {loading ? 'Guardando...' : txType === 'transfer' ? 'Transferir Fondos' : txType === 'expense' ? 'Registrar Egreso' : 'Registrar Ingreso'}
                    </button>
                </div>
            </form>
        </div>
    );
}
