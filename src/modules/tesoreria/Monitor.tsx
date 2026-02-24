import { useTenant } from '../../contexts/TenantContext';
import { FileCheck, HelpCircle } from 'lucide-react';

export default function Monitor() {
    const { tenant } = useTenant();

    return (
        <div>
            <div className="page-header">
                <h1>Monitor Fiscal</h1>
                <p>Tablero de control impositivo y obligaciones de {tenant?.name}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '2rem', alignItems: 'start' }}>

                {/* Stats & Tools sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card danger" style={{ padding: '1.5rem', borderTop: '4px solid var(--danger)' }}>
                        <h3 className="form-label" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Vencimientos Próximos (7 días)</h3>
                        <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)' }}>3</p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 600, marginTop: '0.5rem' }}>Requiere tu atención</p>
                    </div>

                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 className="card-title" style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Status APIS</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>AFIP WSFE</span>
                                <span className="badge badge-success">Online</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Padrones de Retención</span>
                                <span className="badge badge-success">Sincronizado</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main List */}
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="card-title">Calendario Fiscal y DDJJ</h3>
                        <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>Historial</button>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fechas</th>
                                    <th>Obligación</th>
                                    <th>Periodo</th>
                                    <th>Estado</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ color: 'var(--text-muted)' }}>15 Feb 2026</td>
                                    <td style={{ fontWeight: 600 }}>IVA (F.2002)</td>
                                    <td>01-2026</td>
                                    <td><span className="badge badge-success">Presentado</span></td>
                                    <td style={{ textAlign: 'right' }}><FileCheck size={18} color="var(--text-muted)" /></td>
                                </tr>
                                <tr>
                                    <td style={{ color: 'var(--danger)', fontWeight: 600 }}>22 Feb 2026</td>
                                    <td style={{ fontWeight: 600 }}>Sicore (Retenciones)</td>
                                    <td>01/02-2026</td>
                                    <td><span className="badge badge-danger">Vence en 2 días</span></td>
                                    <td style={{ textAlign: 'right' }}><HelpCircle size={18} color="var(--text-muted)" /></td>
                                </tr>
                                <tr>
                                    <td style={{ color: 'var(--text-muted)' }}>28 Feb 2026</td>
                                    <td style={{ fontWeight: 600 }}>Ingresos Brutos (CM03)</td>
                                    <td>01-2026</td>
                                    <td><span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>Pendiente</span></td>
                                    <td style={{ textAlign: 'right' }}><HelpCircle size={18} color="var(--text-muted)" /></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
