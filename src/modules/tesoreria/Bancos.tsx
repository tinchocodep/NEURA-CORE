import { useTenant } from '../../contexts/TenantContext';
import { Building2, Link2, Download, ShieldCheck } from 'lucide-react';

export default function Bancos() {
    const { tenant } = useTenant();

    return (
        <div>
            <div className="page-header">
                <h1>Conexión Bancaria</h1>
                <p>Vincula {tenant?.name} con tus entidades financieras para sincronización automática.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(300px, 350px)', gap: '2rem', alignItems: 'start' }}>

                {/* Main Content */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card" style={{ padding: '2rem', borderTop: '4px solid var(--tenant-primary)' }}>
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                            <div className="metric-icon primary">
                                <Link2 size={24} />
                            </div>
                            <div>
                                <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>Open Banking Setup</h3>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                    Conecta automáticamente tus cuentas bancarias para importar movimientos en tiempo real.
                                    Este servicio es de solo lectura y cumple con los estándares más estrictos de seguridad.
                                </p>
                                <button className="btn btn-primary">Vincular Nueva Cuenta</button>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1rem' }}>
                            <h3 className="card-title">Cuentas vinculadas (0)</h3>
                        </div>
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Building2 size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>No tienes bancos configurados.</p>
                            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Vincula una cuenta para ver importaciones automáticas.</p>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 className="card-title" style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Importación Manual</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Si prefieres hacerlo manualmente, sube el extracto bancario en formato CSV, MT940 o Excel.
                        </p>
                        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                            <Download size={18} />
                            Subir Extracto
                        </button>
                    </div>

                    <div className="card" style={{ padding: '1.5rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                            <ShieldCheck size={20} color="var(--success)" style={{ marginTop: '0.125rem' }} />
                            <div>
                                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.25rem' }}>Seguridad Nivel Bancario</h4>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Utilizamos encriptación TLS 256-bit. Tus credenciales no se almacenan en nuestros servidores.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
