import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';

export default function CategoryForm({ onSuccess }: { onSuccess: () => void }) {
    const { tenant } = useTenant();
    const [name, setName] = useState('');
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenant) return;
        setLoading(true);

        const { error } = await supabase.from('treasury_categories').insert({
            tenant_id: tenant.id,
            name,
            type
        });

        setLoading(false);
        if (!error) {
            setName('');
            onSuccess();
        } else {
            alert('Error: ' + error.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Nueva Categoría</label>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Pago a Proveedores"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Tipo</label>
                <select
                    className="form-input"
                    value={type}
                    onChange={e => setType(e.target.value as 'income' | 'expense')}
                >
                    <option value="expense">Egreso (Gasto)</option>
                    <option value="income">Ingreso (Cobro)</option>
                </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>Guardar</button>
        </form>
    );
}
