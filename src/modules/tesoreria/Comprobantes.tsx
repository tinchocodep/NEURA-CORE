import { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { Search, Plus } from 'lucide-react';
import { useComprobantes } from '../contable/Comprobantes/useComprobantes';
import ComprobantesGrid from '../contable/Comprobantes/ComprobantesGrid';

export default function Comprobantes() {
    const { tenant } = useTenant();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    
    // Defaulting to only showing 'ingreso' / 'venta' to the company? 
    // Or should it show everything? In Tesorería we usually see both to manage cashflow.
    // Let's pass empty string for tipo to show all by default, or provide a filter.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const { 
        data: comprobantes, 
        isLoading: loading, 
        totalCount,
        hasMore,
        loadMore,
        updateEstado, 
        eliminarComprobante,
        reset
    } = useComprobantes({
        tipo: '',
        estado: statusFilter,
        busqueda: searchTerm,
        fechaDesde: '',
        fechaHasta: ''
    });

    useEffect(() => {
        reset(); 
        setSelectedIds(new Set()); 
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenant?.id, statusFilter, searchTerm]);

    const handleAction = async (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => {
        try {
             if (action === 'aprobar') {
                 await updateEstado(id, 'aprobado');
             } else if (action === 'rechazar') {
                 await updateEstado(id, 'rechazado');
             } else if (action === 'eliminar') {
                 await eliminarComprobante(id);
             }
         } catch (error) {
             console.error('Error in action:', error);
         }
    };

    return (
        <div>
            {previewUrl && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm sm:p-6" style={{ margin: 0 }}>
                    <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '90vh' }}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 relative">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">Visualizando Comprobante</h3>
                            </div>
                            <button onClick={() => setPreviewUrl(null)} className="btn btn-ghost text-slate-500 hover:bg-slate-200">
                                Cerrar
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-100/50 p-6 flex flex-col items-center justify-center overflow-auto relative">
                           <iframe src={previewUrl} className="w-full max-w-4xl h-full shadow-lg border border-slate-200 bg-white" title="documento" />
                        </div>
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Comprobantes</h1>
                    <p>Carga y administración de facturas y recibos para {tenant?.name}</p>
                </div>
                <button className="btn btn-primary" onClick={() => window.alert('Para subir comprobantes, vaya al módulo Contable o use el flujo automatizado.')}>
                    <Plus size={18} />
                    Nuevo Comprobante
                </button>
            </div>

            {/* Main List */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="card-title">Documentos Recientes</h3>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <select 
                                className="form-input" 
                                value={statusFilter} 
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ height: '38px' }}
                            >
                                <option value="">Todos los Estados</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="clasificado">Clasificado</option>
                                <option value="aprobado">Aprobado</option>
                                <option value="pagado">Pagado</option>
                            </select>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)' }} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por proveedor o N°..." 
                                    className="form-input" 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ paddingLeft: '2.5rem', paddingRight: '1rem', minWidth: '250px', height: '38px' }} 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="table-container">
                        {loading && comprobantes.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>Cargando documentos...</div>
                        ) : (
                            <ComprobantesGrid 
                                data={comprobantes} 
                                totalCount={totalCount}
                                isLoading={loading}
                                hasMore={hasMore}
                                onLoadMore={loadMore}
                                onAction={handleAction} 
                                onDocPreview={(url) => setPreviewUrl(url)}
                                selectedIds={selectedIds}
                                onSelectionChange={setSelectedIds}
                            />
                        )}
                    </div>
                </div>
        </div>
    );
}
