import { useTenant } from '../../contexts/TenantContext';
import { UploadCloud, FileText, Search, Plus } from 'lucide-react';

export default function Comprobantes() {
    const { tenant } = useTenant();

    return (
        <div>
            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Comprobantes</h1>
                    <p>Carga y administración de facturas y recibos para {tenant?.name}</p>
                </div>
                <button className="btn btn-primary">
                    <Plus size={18} />
                    Nuevo Comprobante
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '2rem', alignItems: 'start' }}>

                {/* Upload Zone sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: '2px', borderColor: 'var(--border-color)', backgroundColor: 'rgba(79, 70, 229, 0.02)', cursor: 'pointer', transition: 'all 0.2s', minHeight: '300px' }}>
                        <UploadCloud size={48} color="var(--tenant-primary)" style={{ opacity: 0.8, marginBottom: '1rem' }} />
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--tenant-primary)' }}>Subir Comprobante</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Arrastra tu factura o recibo aquí, o haz clic para explorar tus archivos.</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', opacity: 0.8 }}>Soporta PDF, JPG, PNG (Max. 5MB)</p>
                    </div>
                </div>

                {/* Main List */}
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="card-title">Documentos Recientes</h3>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)' }} />
                            <input type="text" placeholder="Buscar por cliente o N°..." className="form-input" style={{ paddingLeft: '2.5rem', paddingRight: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', minWidth: '250px' }} />
                        </div>
                    </div>

                    <div className="table-container">
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>No se encontraron comprobantes registrados.</p>
                            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Los documentos que subas aparecerán aquí para su procesamiento.</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
