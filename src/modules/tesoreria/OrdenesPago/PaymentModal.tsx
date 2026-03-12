import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useToast } from '../../../contexts/ToastContext';
import { X, Building2, CreditCard, DollarSign } from 'lucide-react';

export default function PaymentModal({ op, onClose, onSuccess }: any) {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    
    const [accountId, setAccountId] = useState('');
    const [method, setMethod] = useState('transferencia');
    const [reference, setReference] = useState('');

    useEffect(() => {
        if (!tenant) return;
        supabase.from('treasury_accounts')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('name')
            .then(({ data }) => setAccounts(data || []));
    }, [tenant]);

    const handlePay = async () => {
        if (!accountId) return addToast('warning', 'Seleccione una cuenta de origen');
        if (!tenant) return;
        
        setLoading(true);
        try {
            // 1. Fetch category "Pago a Proveedores" or create it if not exists to have a default category
            let catId = null;
            const { data: catData } = await supabase
                .from('treasury_categories')
                .select('id')
                .eq('tenant_id', tenant.id)
                .ilike('name', '%proveedor%')
                .limit(1);
            
            if (catData && catData.length > 0) {
                catId = catData[0].id;
            } else {
                // Create it if it doesn't exist
                const { data: newCat, error: catError } = await supabase
                    .from('treasury_categories')
                    .insert({ tenant_id: tenant.id, name: 'Pago a Proveedores', type: 'expense' })
                    .select('id')
                    .single();
                
                if (catError) throw new Error('No se pudo crear la categoría de egreso por defecto');
                catId = newCat.id;
            }

            // 2. Insert transaction
            const { error: txError } = await supabase.from('treasury_transactions').insert({
                tenant_id: tenant.id,
                account_id: accountId,
                category_id: catId,
                date: new Date().toISOString().split('T')[0],
                type: 'expense',
                amount: op.monto_neto,
                payment_method: method,
                description: `Pago a Proveedor - OP ${op.numero_op}${reference ? ` (Ref: ${reference})` : ''}`,
                status: 'completado', // Auto completado
                orden_pago_id: op.id, // THE NEW COLUMN
                contact_name: op.proveedor?.razon_social
            });

            if (txError) throw txError;

            // 3. Update OP status to pagada
            const { error: opError } = await supabase.from('tesoreria_ordenes_pago')
                .update({ estado: 'pagada' })
                .eq('id', op.id);

            if (opError) throw opError;

            // 4. Update child comprobantes to "pagado"
            const { data: opComprobantes } = await supabase
                .from('tesoreria_op_comprobantes')
                .select('comprobante_id')
                .eq('op_id', op.id);

            if (opComprobantes && opComprobantes.length > 0) {
                const comprobanteIds = opComprobantes.map(c => c.comprobante_id);
                // Update their status globally
                const { error: compError } = await supabase
                    .from('contable_comprobantes')
                    .update({ estado: 'pagado' })
                    .in('id', comprobanteIds);

                if (compError) console.error('Error actualizando estado de comprobantes:', compError);
            }

            addToast('success', `Orden de Pago ${op.numero_op} abonada correctamente`);
            onSuccess();
        } catch (error: any) {
            console.error('Error pagando OP:', error);
            addToast('error', error.message || 'Error al procesar el pago');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm sm:p-6" style={{ margin: 0 }}>
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Efectivizar Pago</h3>
                        <p className="text-sm text-slate-500">OP {op.numero_op}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 flex flex-col gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-sm text-slate-500 mb-1">Monto a Pagar</div>
                        <div className="text-2xl font-bold text-slate-800">${op.monto_neto?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-sm text-slate-600 mt-2 font-medium">{op.proveedor?.razon_social}</div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label font-medium flex items-center gap-1.5"><Building2 size={16}/> Cuenta de Origen</label>
                        <select className="form-input w-full" value={accountId} onChange={e => setAccountId(e.target.value)}>
                            <option value="">Seleccione una cuenta/caja...</option>
                            {accounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name} (Saldo: ${a.balance?.toLocaleString('es-AR', { minimumFractionDigits: 2 })})</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label font-medium flex items-center gap-1.5"><CreditCard size={16}/> Método de Pago</label>
                        <select className="form-input w-full" value={method} onChange={e => setMethod(e.target.value)}>
                            <option value="transferencia">Transferencia Bancaria</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="cheque">Cheque</option>
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label font-medium">Referencia (Opcional)</label>
                        <input type="text" className="form-input w-full" placeholder="N° Transferencia o Cheque..." value={reference} onChange={e => setReference(e.target.value)} />
                    </div>

                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handlePay} disabled={loading || !accountId} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {loading ? 'Procesando...' : <><DollarSign size={16} /> Confirmar Pago</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
