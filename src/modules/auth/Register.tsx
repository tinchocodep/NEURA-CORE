import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Box, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [tenantName, setTenantName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { addToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // 1. Create Tenant (Temporary: using anon key without RLS protection for MVP simplicity)
        const { data: tenant, error: tError } = await supabase
            .from('tenants')
            .insert({
                name: tenantName,
                primary_color: '#3b82f6', // Default blue
                secondary_color: '#1d4ed8',
                enabled_modules: ['tesoreria']
            })
            .select()
            .single();

        if (tError) {
            setError('Error al crear tenant: ' + tError.message);
            setLoading(false);
            return;
        }

        // 2. Sign Up User
        const { error: suError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    tenant_id: tenant.id,
                    role: 'admin'
                }
            }
        });

        if (suError) {
            setError('Error al registrar usuario: ' + suError.message);
        } else {
            addToast('success', 'Registro exitoso', 'Tu cuenta ha sido creada. Por favor inicia sesión.');
            navigate('/login');
        }

        setLoading(false);
    };

    return (
        <div className="auth-split-container">
            <div className="auth-left">
                <div className="auth-card">
                    <div className="auth-header">
                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem', color: 'var(--tenant-primary)' }}>
                            <Box size={40} strokeWidth={1.5} />
                        </div>
                        <h1>Crea tu Espacio</h1>
                        <p>Inicia tu plataforma de gestión financiera</p>
                    </div>

                    {error && (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="form-group">
                            <label className="form-label">Nombre de tu Empresa</label>
                            <input
                                type="text"
                                className="form-input"
                                value={tenantName}
                                onChange={(e) => setTenantName(e.target.value)}
                                placeholder="Ej: TechCorp S.A."
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="email">Correo Electrónico (Admin)</label>
                            <input
                                id="email"
                                type="email"
                                className="form-input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@empresa.com"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Contraseña Segura</label>
                            <input
                                id="password"
                                type="password"
                                className="form-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ marginTop: '1rem', width: '100%' }}
                            disabled={loading}
                        >
                            {loading ? 'Configurando entorno...' : (
                                <>
                                    <UserPlus size={20} strokeWidth={2} />
                                    Crear Cuenta Corporativa
                                </>
                            )}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        ¿Ya formas parte de la red? <Link to="/login" style={{ fontWeight: 600, color: 'var(--tenant-primary)' }}>Inicia Sesión</Link>
                    </div>
                </div>
            </div>

            <div className="auth-right">
                <div className="auth-decorative-circle" style={{ width: '800px', height: '800px', top: '-10%', left: '-20%' }}></div>
                <div className="auth-right-content">
                    <Box size={64} strokeWidth={1} style={{ marginBottom: '2rem', opacity: 0.9 }} />
                    <h2>Escalabilidad Extrema</h2>
                    <p>Despliega un entorno corporativo aislado para tu holding en segundos. Colores corporativos, módulos personalizados y reportes en tiempo real.</p>
                </div>
            </div>
        </div>
    );
}
