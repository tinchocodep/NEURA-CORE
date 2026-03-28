import { useState, useEffect, useRef } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { Search, RefreshCw, X, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useComprobantes } from '../contable/Comprobantes/useComprobantes';
import ComprobantesGrid from '../contable/Comprobantes/ComprobantesGrid';
import { getColpyService } from '../../services/ColpyService';

export default function Comprobantes() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [hasErp, setHasErp] = useState(false);
    const [hasColppy, setHasColppy] = useState(false);
    const [hasXubio, setHasXubio] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncDesde, setSyncDesde] = useState('');
    const [syncHasta, setSyncHasta] = useState('');
    const [syncSource, setSyncSource] = useState<'colppy' | 'xubio' | ''>('');
    const [showErpPicker, setShowErpPicker] = useState<'sync' | 'inject' | ''>('');
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [empresaCuit, setEmpresaCuit] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load empresa CUIT
    useEffect(() => {
        if (!tenant?.id) return;
        const cuit = (tenant as any).cuit;
        if (cuit) { setEmpresaCuit(cuit); return; }
        supabase.from('contable_config').select('arca_cuit').eq('tenant_id', tenant.id).maybeSingle()
            .then(({ data }) => { if (data?.arca_cuit) setEmpresaCuit(data.arca_cuit); });
    }, [tenant?.id]);

    const handleUploadFiles = async (files: File[]) => {
        if (files.length === 0 || !tenant?.id) return;
        setUploading(true);
        const N8N_WEBHOOK = '/api/n8n-comprobantes';
        let ok = 0, fail = 0;
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('data', file);
                formData.append('filename', file.name);
                formData.append('tenant_id', tenant.id);
                if (empresaCuit) formData.append('cuit_empresa', empresaCuit);
                const resp = await fetch(N8N_WEBHOOK, { method: 'POST', body: formData });
                if (resp.ok) { ok++; } else { fail++; }
            } catch { fail++; }
        }
        setUploading(false);
        if (ok > 0) {
            addToast('success', 'Cargados', `${ok} comprobante(s) enviados al OCR`);
            setTimeout(() => reset(), 3000);
        }
        if (fail > 0) addToast('error', 'Error', `${fail} archivo(s) fallaron`);
    };

    // Check ERP config
    useEffect(() => {
        if (!tenant?.id) return;
        const modules = (tenant.enabled_modules as string[]) || [];
        const erpEnabled = modules.includes('erp_colppy') || modules.includes('erp_xubio');
        if (!erpEnabled) { setHasErp(false); return; }

        supabase.from('contable_config')
            .select('colpy_username, colpy_password, colpy_empresa_id, xubio_client_id, xubio_client_secret')
            .eq('tenant_id', tenant.id).maybeSingle()
            .then(({ data }) => {
                if (!data) { setHasErp(false); return; }
                const colppyOk = !!(data.colpy_username && data.colpy_password && data.colpy_empresa_id);
                const xubioOk = !!(data.xubio_client_id && data.xubio_client_secret);
                setHasColppy(colppyOk);
                setHasXubio(xubioOk);
                setHasErp(colppyOk || xubioOk);
            });
    }, [tenant?.id]);

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
    }, [tenant?.id, statusFilter, searchTerm]);

    // ── Sync from Colppy ──
    const handleSync = async () => {
        if (!tenant) return;
        setShowSyncModal(false);
        setSyncing(true);
        addToast('info', 'Sincronización', 'Conectando con Colppy...');

        try {
            const colpy = getColpyService(tenant.id);
            colpy.resetAbort();
            await colpy.loadConfig();
            if (!colpy.isConfigured) {
                addToast('error', 'Error', 'Colppy no está configurado. Ve a Configuración.');
                setSyncing(false);
                return;
            }

            let effectiveDesde = syncDesde;
            if (!effectiveDesde) {
                const { data: lastInvoice } = await supabase
                    .from('contable_comprobantes').select('fecha')
                    .eq('tenant_id', tenant.id).eq('source', 'colpy')
                    .order('fecha', { ascending: false }).limit(1).maybeSingle();
                if (lastInvoice?.fecha) {
                    const d = new Date(lastInvoice.fecha + 'T12:00:00Z');
                    d.setDate(d.getDate() - 15);
                    effectiveDesde = d.toISOString().split('T')[0];
                } else {
                    effectiveDesde = '2023-01-01';
                }
            }

            const ventas = await colpy.getFacturasVenta(effectiveDesde, syncHasta);
            const compras = await colpy.getFacturasCompra(effectiveDesde, syncHasta);
            const todos = [...ventas.map((v: any) => ({ ...v, _tipo: 'venta' })), ...compras.map((c: any) => ({ ...c, _tipo: 'compra' }))];

            const { data: clientes } = await supabase.from('contable_clientes').select('id, colpy_id').eq('tenant_id', tenant.id).not('colpy_id', 'is', null);
            const { data: proveedores } = await supabase.from('contable_proveedores').select('id, colpy_id').eq('tenant_id', tenant.id).not('colpy_id', 'is', null);
            const mapClientes = new Map(clientes?.map((c: any) => [c.colpy_id, c.id]));
            const mapProveedores = new Map(proveedores?.map((p: any) => [p.colpy_id, p.id]));

            let importados = 0;
            for (const c of todos) {
                const nroFull = `${c.nroFactura1 || ''}-${c.nroFactura2 || ''}`;
                const { data: exists } = await supabase.from('contable_comprobantes')
                    .select('id').eq('tenant_id', tenant.id).eq('numero_comprobante', nroFull).eq('source', 'colpy').limit(1);
                if (exists && exists.length > 0) continue;

                const tipoComp = (c as any)._tipo;
                const record: any = {
                    tenant_id: tenant.id,
                    tipo: tipoComp,
                    fecha: c.fechaFactura ? c.fechaFactura.split(' ')[0] : null,
                    numero_comprobante: nroFull,
                    tipo_comprobante: `Factura ${c.idTipoFactura || 'A'}`,
                    moneda: 'ARS',
                    monto_original: parseFloat(c.totalFactura || '0'),
                    monto_ars: parseFloat(c.totalFactura || '0'),
                    estado: 'clasificado',
                    source: 'colpy',
                    colpy_id: c.idFactura,
                    descripcion: c.descripcion || '',
                    neto_gravado: parseFloat(c.netoGravado || '0'),
                    total_iva: parseFloat(c.totalIVA || '0'),
                };
                if (tipoComp === 'venta' && c.idCliente) record.cliente_id = mapClientes.get(String(c.idCliente)) || null;
                if (tipoComp === 'compra' && c.idProveedor) record.proveedor_id = mapProveedores.get(String(c.idProveedor)) || null;

                await supabase.from('contable_comprobantes').insert(record);
                importados++;
            }

            addToast('success', 'Sincronización completada', `${importados} comprobantes importados de Colppy`);
            reset();
        } catch (err: any) {
            addToast('error', 'Error de sincronización', err.message || 'Error desconocido');
        }
        setSyncing(false);
    };

    const handleAction = async (id: string, action: 'aprobar' | 'rechazar' | 'inyectar' | 'eliminar') => {
        console.log('[Comprobantes] handleAction called:', action, id, 'hasErp:', hasErp);
        try {
            if (action === 'aprobar') {
                await updateEstado(id, 'aprobado');
            } else if (action === 'rechazar') {
                await updateEstado(id, 'rechazado');
            } else if (action === 'eliminar') {
                await eliminarComprobante(id);
            } else if (action === 'inyectar') {
                if (!hasErp) {
                    addToast('error', 'Sin ERP', 'No hay ERP configurado. Activalo en Configuración.');
                    return;
                }
                if (hasColppy && hasXubio) {
                    console.log('[Comprobantes] Both ERPs detected, showing prompt');
                    const choice = window.prompt('¿A qué ERP inyectar?\n\nEscribí "colppy" o "xubio":', 'colppy');
                    console.log('[Comprobantes] User chose:', choice);
                    if (!choice) return;
                    const src = choice.toLowerCase().includes('xubio') ? 'xubio' : 'colppy';
                    console.log('[Comprobantes] Injecting to:', src, 'id:', id);
                    await executeErpInjection(id, src as 'colppy' | 'xubio');
                    return;
                }
                console.log('[Comprobantes] Single ERP, injecting to:', hasColppy ? 'colppy' : 'xubio');
                await executeErpInjection(id, hasColppy ? 'colppy' : 'xubio');
            }
        } catch (error) {
            console.error('Error in action:', error);
        }
    };

    const executeErpInjection = async (id: string, source: 'colppy' | 'xubio' = 'colppy') => {
        console.log('[ERP] executeErpInjection called:', id, source);
        const comp = comprobantes.find((c: any) => c.id === id);
        if (!comp) { console.log('[ERP] comp not found!'); return; }
        console.log('[ERP] comp:', comp.numero_comprobante, 'proveedor xubio_id:', comp.proveedor?.xubio_id);

        try {
            if (source === 'xubio') {
                console.log('[ERP] Loading XubioService...');
                const { getXubioService } = await import('../../services/XubioService');
                const xubio = getXubioService(tenant!.id);
                await xubio.loadConfig();
                console.log('[ERP] Xubio loaded, isConfigured:', xubio.isConfigured);
                if (!xubio.isConfigured) { addToast('error', 'Error', 'Xubio no está configurado.'); return; }

                console.log('[ERP] Calling xubio.injectComprobante...');
                const result = await xubio.injectComprobante({
                    tipo: comp.tipo,
                    tipo_comprobante: comp.tipo_comprobante || 'Factura A',
                    fecha: comp.fecha,
                    numero_comprobante: comp.numero_comprobante,
                    moneda: comp.moneda || 'ARS',
                    tipo_cambio: comp.tipo_cambio || undefined,
                    proveedor_xubio_id: comp.proveedor?.xubio_id ? Number(comp.proveedor.xubio_id) : undefined,
                    cliente_xubio_id: (comp.cliente as any)?.xubio_id ? Number((comp.cliente as any).xubio_id) : undefined,
                    lineas: [{
                        descripcion: `Comprobante ${comp.numero_comprobante || ''}`.trim(),
                        cantidad: 1,
                        precio_unitario: Number(comp.neto_gravado || (comp.monto_original || comp.monto_ars || 0) / 1.21),
                        iva_porcentaje: 21,
                    }],
                });
                console.log('[ERP] Xubio inject result:', result);
                if (result.success) {
                    await supabase.from('contable_comprobantes').update({
                        estado: 'inyectado', xubio_id: String(result.xubioId), xubio_synced_at: new Date().toISOString(),
                    }).eq('id', id);
                    addToast('success', 'Inyectado', `Comprobante inyectado a Xubio (ID: ${result.xubioId})`);
                    reset();
                } else {
                    addToast('error', 'Error Xubio', result.error || 'Error al inyectar');
                }
                return;
            }

            // Colppy
            const colpy = getColpyService(tenant!.id);
            try {
                await colpy.loadConfig();
                if (!colpy.isConfigured) { addToast('error', 'Error', 'Colppy no está configurado.'); return; }
            } catch (initErr: any) {
                addToast('error', 'Error Colppy', initErr.message || 'No se pudo conectar');
                return;
            }

            console.log('[Comprobantes] Calling injectComprobante with:', {
                tipo: comp.tipo, tipo_comprobante: comp.tipo_comprobante,
                fecha: comp.fecha, numero_comprobante: comp.numero_comprobante,
                proveedor_colpy_id: comp.proveedor?.colpy_id,
                monto: comp.monto_original || comp.monto_ars,
            });
            const result = await colpy.injectComprobante({
                tipo: comp.tipo,
                tipo_comprobante: comp.tipo_comprobante || 'Factura A',
                fecha: comp.fecha,
                numero_comprobante: comp.numero_comprobante,
                moneda: comp.moneda || 'ARS',
                tipo_cambio: comp.tipo_cambio || undefined,
                proveedor_colpy_id: comp.proveedor?.colpy_id || undefined,
                cliente_colpy_id: (comp.cliente as any)?.colpy_id || undefined,
                monto: comp.monto_original || comp.monto_ars || undefined,
                neto_gravado: comp.neto_gravado || undefined,
                neto_no_gravado: comp.neto_no_gravado || undefined,
                total_iva: comp.total_iva || undefined,
                percepciones_iibb: comp.percepciones_iibb || undefined,
                percepciones_iva: comp.percepciones_iva || undefined,
                fecha_vencimiento: comp.fecha_vencimiento || undefined,
                lineas: [{
                    descripcion: `Comprobante ${comp.numero_comprobante || ''}`.trim(),
                    cantidad: 1,
                    precio_unitario: Number(comp.neto_gravado || (comp.monto_original || comp.monto_ars || 0) / 1.21),
                    iva_porcentaje: 21,
                    colpy_cuenta_id: 'Gastos Varios'
                }],
            });

            console.log('[Comprobantes] injectComprobante result:', result);
            if (result.success) {
                await supabase.from('contable_comprobantes').update({
                    estado: 'inyectado',
                    colpy_id: result.colpyId,
                    colpy_synced_at: new Date().toISOString(),
                }).eq('id', id);
                addToast('success', 'Inyectado', `Comprobante inyectado a Colppy (ID: ${result.colpyId})`);
                reset();
            } else {
                addToast('error', 'Error', result.error || 'Error al inyectar');
            }
        } catch (err: any) {
            addToast('error', 'Error', err.message || 'Error al inyectar');
        }
    };

    return (
        <div>
            {previewUrl && (
                <div className="wizard-overlay" onClick={() => setPreviewUrl(null)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: 900, height: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="wizard-header">
                            <h3>Visualizando Comprobante</h3>
                            <button className="wizard-close" onClick={() => setPreviewUrl(null)}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--color-bg-surface-2)' }}>
                            <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }} title="documento" />
                        </div>
                    </div>
                </div>
            )}

            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Comprobantes</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                    <label className="btn btn-primary" style={{ fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Upload size={14} /> {uploading ? 'Subiendo...' : 'Cargar factura'}
                        <input type="file" accept="image/*,.pdf" multiple hidden ref={fileInputRef}
                            onChange={e => { if (e.target.files) handleUploadFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                    </label>
                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}
                        onClick={async () => {
                            if (!tenant?.id) return;
                            const ok = window.confirm('¿Eliminar TODOS los comprobantes? Esta acción no se puede deshacer.');
                            if (!ok) return;
                            const ok2 = window.confirm('¿Estás seguro? Se borrarán TODOS los comprobantes del tenant.');
                            if (!ok2) return;
                            const { error } = await supabase.from('contable_comprobantes').delete().eq('tenant_id', tenant.id);
                            if (error) addToast('error', 'Error', error.message);
                            else { addToast('success', 'Eliminados', 'Todos los comprobantes fueron eliminados'); reset(); }
                        }}>
                        Eliminar todos
                    </button>
                    {hasErp && (
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-ghost" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={() => {
                                    if (hasColppy && hasXubio) setShowErpPicker(showErpPicker === 'sync' ? '' : 'sync');
                                    else { setSyncSource(hasColppy ? 'colppy' : 'xubio'); setShowSyncModal(true); }
                                }} disabled={syncing}>
                                <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                                {syncing ? 'Sincronizando...' : 'Sincronizar'}
                            </button>
                            {showErpPicker && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
                                    {hasColppy && <button onClick={() => {
                                        setShowErpPicker('');
                                        if (showErpPicker === 'sync') { setSyncSource('colppy'); setShowSyncModal(true); }
                                        else { const id = [...selectedIds][0]; if (id) executeErpInjection(id, 'colppy'); }
                                    }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Colppy
                                    </button>}
                                    {hasXubio && <button onClick={() => {
                                        setShowErpPicker('');
                                        if (showErpPicker === 'sync') { setSyncSource('xubio'); setShowSyncModal(true); }
                                        else { const id = [...selectedIds][0]; if (id) executeErpInjection(id, 'xubio'); }
                                    }} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Xubio
                                    </button>}
                                </div>
                            )}
                        </div>
                    )}
                    <select
                        className="form-input"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ height: 34, fontSize: '0.8rem' }}
                    >
                        <option value="">Todos</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="clasificado">Clasificado</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="inyectado">Inyectado</option>
                    </select>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="form-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: 30, height: 34, fontSize: '0.8rem', minWidth: 200 }}
                        />
                    </div>
                </div>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUploadFiles(Array.from(e.dataTransfer.files)); }}
                style={{ border: `2px dashed ${dragOver ? 'var(--brand)' : 'transparent'}`, borderRadius: 12, padding: dragOver ? 24 : 0, marginBottom: 8, textAlign: 'center', transition: 'all 0.2s', background: dragOver ? 'var(--color-accent-subtle)' : 'transparent' }}
            >
                {dragOver && <p style={{ color: 'var(--brand)', fontWeight: 600, margin: 0 }}>Soltá los archivos acá para cargarlos</p>}
            </div>

            {hasErp && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, background: '#6366F110', borderRadius: 8, border: '1px solid #6366F130', fontSize: '0.75rem' }}>
                    <span style={{ color: '#6366F1', fontWeight: 600 }}>ERP conectado</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>— Los comprobantes aprobados se pueden inyectar</span>
                </div>
            )}

            <div style={{ background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                {loading && comprobantes.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando documentos...</div>
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
                        hasErp={hasErp}
                    />
                )}
            </div>

            {/* Sync Modal */}
            {showSyncModal && (
                <div className="wizard-overlay" onClick={() => setShowSyncModal(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="wizard-header">
                            <h3>Sincronizar con {syncSource === 'xubio' ? 'Xubio' : 'Colppy'}</h3>
                            <button className="wizard-close" onClick={() => setShowSyncModal(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-body">
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
                                Descarga comprobantes de venta y compra desde Colppy. Si dejás "Desde" vacío, se busca desde la última sincronización.
                            </p>
                            <div className="wizard-field">
                                <label className="form-label">Desde (opcional)</label>
                                <input type="date" className="form-input" value={syncDesde} onChange={e => setSyncDesde(e.target.value)} />
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Hasta (opcional)</label>
                                <input type="date" className="form-input" value={syncHasta} onChange={e => setSyncHasta(e.target.value)} />
                            </div>
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left" />
                            <div className="wizard-footer-right">
                                <button className="wizard-btn-next" onClick={handleSync}>
                                    <RefreshCw size={16} /> Sincronizar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
