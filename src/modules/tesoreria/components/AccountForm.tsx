import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';

interface User {
    id: string;
    email: string;
}

export default function AccountForm({ onSuccess }: { onSuccess: () => void }) {
    const { tenant } = useTenant();
    const { role } = useAuth() as any;
    const { addToast } = useToast();
    const [name, setName] = useState('');
    const [balance, setBalance] = useState('');
    const [assignedUser, setAssignedUser] = useState<string>('');
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (tenant && (role === 'admin' || role === 'superadmin')) {
            fetchUsers();
        }
    }, [tenant, role]);

    const fetchUsers = async () => {
        const { data } = await supabase
            .from('users')
            .select('id, email')
            .eq('tenant_id', tenant?.id);
        if (data) setUsers(data);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenant) return;
        setLoading(true);

        const { error } = await supabase.from('treasury_accounts').insert({
            tenant_id: tenant.id,
            name,
            balance: parseFloat(balance) || 0,
            assigned_user_id: assignedUser || null
        });

        setLoading(false);
        if (!error) {
            setName('');
            setBalance('');
            setAssignedUser('');
            addToast('success', 'Cuenta Creada', `La cuenta ${name} se ha guardado correctamente.`);
            onSuccess();
        } else {
            addToast('error', 'Error al crear', error.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
            <div className="form-group">
                <label className="form-label">Nueva Cuenta / Caja</label>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Caja Fuerte o Banco Galicia"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                />
            </div>

            {(role === 'admin' || role === 'superadmin') && (
                <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--primary)' }}>Caja Exclusiva de Usuario (Opcional)</label>
                    <select
                        className="form-input"
                        value={assignedUser}
                        onChange={e => setAssignedUser(e.target.value)}
                    >
                        <option value="">Toda la empresa (Compartido)</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.email || 'Sin correo asociado'}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="form-group">
                <label className="form-label">Saldo Inicial</label>
                <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={balance}
                    onChange={e => setBalance(e.target.value)}
                />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '42px' }}>
                Crear Caja
            </button>
        </form>
    );
}
