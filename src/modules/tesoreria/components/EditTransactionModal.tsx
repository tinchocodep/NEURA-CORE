import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../contexts/ToastContext';
import { useTenant } from '../../../contexts/TenantContext';
import ProjectSearch from './ProjectSearch';

export default function EditTransactionModal({
    tx,
    accounts,
    categories,
    onClose,
    onSaved,
}: {
    tx: any;
    accounts: any[];
    categories: any[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const { addToast } = useToast();
    const { tenant } = useTenant();
    const [loading, setLoading] = useState(false);

    // Form state — initialised from tx
    const [description, setDescription] = useState(tx.description || '');
    const [amount, setAmount] = useState(String(tx.amount || ''));
    const [date, setDate] = useState(tx.date || '');
    const [accountId, setAccountId] = useState(tx.account_id || '');
    const [categoryId, setCategoryId] = useState(tx.category_id || '');
    const [contactName, setContactName] = useState(tx.contact_name || '');
    const [projectName, setProjectName] = useState(tx.project_name || '');
    const [invoiceNumber, setInvoiceNumber] = useState(tx.invoice_number || '');
    const [status, setStatus] = useState(tx.status || 'completado');
    const [paymentMethod, setPaymentMethod] = useState(tx.payment_method || 'transferencia');

    const expenseCats = categories.filter(c => c.type === 'expense' && !c.is_internal_transfer);
    const incomeCats = categories.filter(c => c.type === 'income' && !c.is_internal_transfer);
    const relevantCats = tx.type === 'expense' ? expenseCats : incomeCats;

    const handleSave = async () => {
        const amountVal = parseFloat(amount);
        if (!description.trim() || isNaN(amountVal) || amountVal <= 0 || !date || !accountId) {
            addToast('error', 'Campos incompletos', 'Completá todos los campos obligatorios.');
            return;
        }
        setLoading(true);

        // Adjust account balance: reverse old amount, apply new amount
        if (tx.type !== 'transfer') {
            const oldAmt = parseFloat(tx.amount);
            const acct = accounts.find(a => a.id === accountId);
            if (acct) {
                const oldEffect = tx.type === 'income' ? -oldAmt : oldAmt;    // undo
                const newEffect = tx.type === 'income' ? amountVal : -amountVal; // apply
                const newBalance = acct.balance + oldEffect + newEffect;
                await supabase.from('treasury_accounts')
                    .update({ balance: newBalance })
                    .eq('id', accountId);
            }
        }

        const { error } = await supabase.from('treasury_transactions').update({
            description: description.trim(),
            amount: amountVal,
            date,
            account_id: accountId,
            category_id: categoryId || null,
            contact_name: contactName || null,
            project_name: projectName || null,
            invoice_number: invoiceNumber || null,
            status,
            payment_method: paymentMethod,
        }).eq('id', tx.id);

        setLoading(false);
        if (error) {
            addToast('error', 'Error al guardar', error.message);
        } else {
            addToast('success', 'Movimiento actualizado', 'Los cambios se guardaron correctamente.');
            onSaved();
            onClose();
        }
    };

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const typeLabel = tx.type === 'income' ? 'Ingreso' : tx.type === 'expense' ? 'Egreso' : 'Transferencia';
    const typeColor = tx.type === 'income' ? 'var(--success)' : tx.type === 'expense' ? 'var(--danger)' : 'var(--brand)';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem',
                }}
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    style={{
                        background: 'var(--bg-card)', borderRadius: 'var(--r-lg)',
                        border: '1px solid var(--border)', width: '100%', maxWidth: '560px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Editar movimiento</div>
                            <div style={{ fontSize: '0.78rem', color: typeColor, fontWeight: 600, marginTop: '0.1rem' }}>
                                {typeLabel}
                            </div>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'var(--bg-hover)', border: 'none', borderRadius: 'var(--r-md)',
                            padding: '0.4rem', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)',
                        }}>
                            <X size={16} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Descripción */}
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Descripción *</label>
                            <input className="form-input" type="text" value={description}
                                onChange={e => setDescription(e.target.value)} />
                        </div>

                        {/* Monto */}
                        <div className="form-group">
                            <label className="form-label">Monto *</label>
                            <input className="form-input" type="number" step="0.01" value={amount}
                                onChange={e => setAmount(e.target.value)} />
                        </div>

                        {/* Fecha */}
                        <div className="form-group">
                            <label className="form-label">Fecha *</label>
                            <input className="form-input" type="date" value={date}
                                onChange={e => setDate(e.target.value)} />
                        </div>

                        {/* Cuenta */}
                        <div className="form-group">
                            <label className="form-label">Cuenta *</label>
                            <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Categoría */}
                        {tx.type !== 'transfer' && (
                            <div className="form-group">
                                <label className="form-label">Categoría</label>
                                <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                                    <option value="">Sin categoría</option>
                                    {relevantCats.map(c => (
                                        <option key={c.id} value={c.id}>{c.name} {c.group ? `(${c.group})` : ''}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Contacto */}
                        <div className="form-group">
                            <label className="form-label">Contacto / Entidad</label>
                            <input className="form-input" type="text" value={contactName}
                                onChange={e => setContactName(e.target.value)} />
                        </div>

                        {/* Obra */}
                        <div className="form-group">
                            <label className="form-label">Obra / Proyecto</label>
                            <ProjectSearch
                                value={projectName}
                                onChange={setProjectName}
                                tenant={tenant}
                            />
                        </div>

                        {/* Método de pago */}
                        <div className="form-group">
                            <label className="form-label">Método de pago</label>
                            <select className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                {accounts.filter(a => a.type === 'bank').map(a => (
                                    <option key={a.id} value={`transferencia-${a.id}`}>
                                        Transferencia desde {a.name}
                                    </option>
                                ))}
                                {accounts.filter(a => a.type === 'bank').length === 0 && (
                                    <option value="transferencia">Transferencia</option>
                                )}
                                <option value="efectivo">Efectivo</option>
                                <option value="cheque">Cheque</option>
                                <option value="tarjeta">Tarjeta</option>
                                <option value="otro">Otro</option>
                            </select>
                        </div>

                        {/* Estado */}
                        <div className="form-group">
                            <label className="form-label">Estado</label>
                            <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                                <option value="completado">Completado</option>
                                <option value="pendiente">Pendiente</option>
                            </select>
                        </div>

                        {/* N° Factura */}
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">N° Factura / Comprobante</label>
                            <input className="form-input" type="text" value={invoiceNumber}
                                onChange={e => setInvoiceNumber(e.target.value)} />
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '1rem 1.5rem', borderTop: '1px solid var(--border)',
                        display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
                    }}>
                        <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.65rem 1.25rem' }}>
                            Cancelar
                        </button>
                        <button onClick={handleSave} className="btn btn-primary" disabled={loading}
                            style={{ padding: '0.65rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Save size={14} />
                            {loading ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
