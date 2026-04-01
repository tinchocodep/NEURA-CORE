import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useToast } from '../../../contexts/ToastContext';
import { Building2, Save, FileText, Plus, Trash2, Calendar, X, Download, Mail, Send, Loader, User } from 'lucide-react';
import { DocumentViewer } from '../../../shared/components/DocumentViewer';
import StyledSelect from '../../../shared/components/StyledSelect';

interface Proveedor {
    id: string;
    razon_social: string;
    cuit: string;
}

interface Comprobante {
    id: string;
    fecha: string;
    numero_comprobante: string;
    tipo_comprobante: string;
    monto_ars: number;
    monto_original: number;
    moneda: string;
    estado: string;
}

interface Retencion {
    id: string; // temp id for UI
    tipo: string;
    base_imponible: number;
    alicuota: number;
    monto: number;
}

const TIPOS_RETENCION = [
    'Ganancias',
    'Ingresos Brutos (IIBB)',
    'SUSS',
    'IVA'
];

export default function NuevaOrdenPago({ onAceptar }: { onAceptar?: () => void }) {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const navigate = useNavigate();
    
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [proveedorId, setProveedorId] = useState('');
    const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
    const [loadingComprobantes, setLoadingComprobantes] = useState(false);
    
    // Selection and calculation state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [retenciones, setRetenciones] = useState<Retencion[]>([]);
    
    // Form fields
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [observaciones, setObservaciones] = useState('');
    const [generando, setGenerando] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Email state
    const [showEmailInput, setShowEmailInput] = useState(false);
    const [emailDestino, setEmailDestino] = useState('');
    const [enviandoEmail, setEnviandoEmail] = useState(false);

    useEffect(() => {
        if (!tenant) return;
        supabase.from('contable_proveedores')
            .select('id, razon_social, cuit')
            .eq('tenant_id', tenant.id)
            .order('razon_social')
            .then(({ data }) => setProveedores(data || []));
    }, [tenant]);

    useEffect(() => {
        if (!tenant || !proveedorId) {
            setComprobantes([]);
            setSelectedIds(new Set());
            return;
        }

        const fetchComprobantes = async () => {
            setLoadingComprobantes(true);
            // Traer facturas de compra pendientes o aprobadas
            const { data, error } = await supabase.from('contable_comprobantes')
                .select('id, fecha, numero_comprobante, tipo_comprobante, monto_ars, monto_original, moneda, estado')
                .eq('tenant_id', tenant.id)
                .eq('proveedor_id', proveedorId)
                // Solo asegurarnos de que sean compras y no ventas mal asignadas
                .eq('tipo', 'compra')
                // Se incluyen facturas en varios estados válidos pre-pago
                .in('estado', ['pendiente', 'clasificado', 'aprobado', 'inyectado'])
                .order('fecha', { ascending: false });
                
            setLoadingComprobantes(false);
            if (data) {
                setComprobantes(data);
                // Clean up selectedIds if they no longer exist in the fetched data
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    const currentIds = new Set(data.map(c => c.id));
                    for (const id of next) {
                        if (!currentIds.has(id)) next.delete(id);
                    }
                    return next;
                });
            }
            if (error) addToast('error', 'Error al cargar facturas');
        };

        fetchComprobantes();

        // set up realtime subscription for this tenant's comprobantes
        const channel = supabase.channel(`op-comprobantes-${proveedorId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contable_comprobantes', filter: `tenant_id=eq.${tenant.id}` },
                () => {
                    fetchComprobantes();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tenant, proveedorId, addToast]);

    const toggleComprobante = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const addRetencion = () => {
        setRetenciones([...retenciones, {
            id: Math.random().toString(36).substring(7),
            tipo: 'Ganancias',
            base_imponible: montoBruto, 
            alicuota: 0,
            monto: 0
        }]);
    };

    const updateRetencion = (id: string, field: keyof Retencion, value: any) => {
        setRetenciones(prev => prev.map(r => {
            if (r.id !== id) return r;
            const updated = { ...r, [field]: value };
            // auto calc monto if base or alicuota changes
            if (field === 'alicuota' || field === 'base_imponible') {
                updated.monto = (Number(updated.base_imponible || 0) * Number(updated.alicuota || 0)) / 100;
            }
            return updated;
        }));
    };

    const removeRetencion = (id: string) => {
        setRetenciones(prev => prev.filter(r => r.id !== id));
    };

    const comprobantesSeleccionados = comprobantes.filter(c => selectedIds.has(c.id));
    // Fallback: usar monto_original si monto_ars es 0 o null
    const montoBruto = comprobantesSeleccionados.reduce((acc, c) => acc + (c.monto_ars || c.monto_original || 0), 0);
    const montoRetenciones = retenciones.reduce((acc, r) => acc + (r.monto || 0), 0);
    const montoNeto = montoBruto - montoRetenciones;

    const handleGenerar = async () => {
        if (!tenant) return;
        if (!proveedorId) return addToast('warning', 'Seleccione un proveedor');
        if (selectedIds.size === 0) return addToast('warning', 'Debe seleccionar al menos un comprobante');
        if (montoNeto <= 0 && montoBruto > 0) return addToast('warning', 'El monto neto no puede ser negativo');

        setGenerando(true);
        try {
            // 1. Generar OP (Cabecera)
            const nOp = `OP-${Date.now().toString().slice(-6)}`;
            const { data: opData, error: opError } = await supabase
                .from('tesoreria_ordenes_pago')
                .insert({
                    tenant_id: tenant.id,
                    proveedor_id: proveedorId,
                    fecha,
                    numero_op: nOp,
                    estado: 'aprobada', // Sale aprobada por default para ser pagada luego
                    monto_bruto: montoBruto,
                    monto_retenciones: montoRetenciones,
                    monto_neto: montoNeto,
                    observaciones
                })
                .select('id')
                .single();

            if (opError) throw opError;
            const opId = opData.id;

            // 2. Insertar Detalle de Comprobantes (tesoreria_op_comprobantes)
            const compInserts = comprobantesSeleccionados.map(c => ({
                tenant_id: tenant.id,
                op_id: opId,
                comprobante_id: c.id,
                monto_pagado: c.monto_ars || c.monto_original || 0
            }));
            const { error: compError } = await supabase.from('tesoreria_op_comprobantes').insert(compInserts);
            if (compError) throw compError;

            // 3. Insertar Retenciones (opcional)
            if (retenciones.length > 0) {
                const retInserts = retenciones.map(r => ({
                    tenant_id: tenant.id,
                    op_id: opId,
                    tipo_retencion: r.tipo,
                    base_imponible: r.base_imponible,
                    alicuota: r.alicuota,
                    monto_retenido: r.monto
                }));
                const { error: retError } = await supabase.from('tesoreria_op_retenciones').insert(retInserts);
                if (retError) throw retError;
            }
            
            // 4. Actualizar estado de las facturas (marcarlas como pagadas)
            const idsArray = Array.from(selectedIds);
            if (idsArray.length > 0) {
                const { error: updErr } = await supabase
                    .from('contable_comprobantes')
                    .update({ estado: 'pagado' })
                    .in('id', idsArray);
                if (updErr) {
                    console.error('Error actualizando estado de comprobantes:', updErr);
                    // No cortamos el flujo para que termine de generar la OP
                }
            }

            // 5. Postear a N8N Webhook para la Orden de Pago
            try {
                const payload = {
                    op_id: opId,
                    numero_op: nOp,
                    proveedor_id: proveedorId,
                    monto_bruto: montoBruto,
                    monto_retenciones: montoRetenciones,
                    monto_neto: montoNeto,
                    fecha: fecha,
                    observaciones: observaciones,
                    tenant_id: tenant.id
                };

                const response = await fetch('/api/n8n-ordenes-pago', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                // N8n responde un JSON con el path del archivo subido a Supabase Storage
                if (response.ok) {
                    try {
                        const responseText = await response.text();
                        if (!responseText) {
                            addToast('warning', 'N8n se ejecutó pero devolvió una respuesta vacía.');
                        } else {
                            const jsonResArray = JSON.parse(responseText);
                            
                            // N8n puede devolver el array completo o un objeto directo dependiendo el nodo final
                            const storageData = Array.isArray(jsonResArray) ? jsonResArray[0] : jsonResArray;

                            // Revisamos si devuelve directamente la URL publica o el Key de AWS
                            const publicUrl = storageData.archivo_url 
                                ? storageData.archivo_url 
                                : (storageData.Key 
                                    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/comprobantes/${storageData.Key.replace('comprobantes/', '')}` 
                                    : null);

                            if (publicUrl) {
                                // Guardar la URL en la orden de pago para acceder luego
                                const { error: updateErr } = await supabase
                                    .from('tesoreria_ordenes_pago')
                                    .update({ archivo_url: publicUrl })
                                    .eq('id', opId);
                                    
                                if (updateErr) {
                                    console.error('Error guardando la URL oficial en DB:', updateErr);
                                    addToast('warning', 'OP Generada pero hubo un error enlazando el PDF. Revisa N8n.');
                                } else {
                                    addToast('success', 'PDF resguardado en Supabase exitosamente.');
                                }
                                
                                // Mostrar el PDF localmente en la App en vez de nueva pestaña
                                setPreviewUrl(publicUrl);
                                
                            } else {
                                addToast('warning', 'N8n se ejecutó pero no devolvió ninguna URL válida esperada.');
                                console.log('Respuesta cruda de N8N:', storageData);
                            }
                        }
                    } catch (err) {
                        console.error('Error procesando la respuesta de N8n:', err);
                        addToast('error', 'Error interpretando respuesta de n8n');
                    }
                } else {
                    addToast('error', `Fallo al disparar N8N: ${response.status}`);
                }
            } catch (webhookErr) {
                console.warn('El webhook de N8N falló o no está disponible, pero la OP se creó en BD.', webhookErr);
            }

            addToast('success', `Orden de Pago ${nOp} generada exitosamente`);
            
            // reset
            setProveedorId('');
            setSelectedIds(new Set());
            setRetenciones([]);
            setObservaciones('');
            
            if (onAceptar) onAceptar();

        } catch (error: any) {
            console.error(error);
            addToast('error', `Error al generar OP: ${error.message}`);
        } finally {
            setGenerando(false);
        }
    };

    const handleSendEmail = async () => {
        if (!emailDestino) return;
        setEnviandoEmail(true);
        try {
            const resp = await fetch('/api/n8n-send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailDestino,
                    subject: `Orden de Pago Generada - Administracion`,
                    body: `Adjuntamos la orden de pago oficial emitida a través de NeuraCore.`,
                    pdf_url: previewUrl,
                    from_name: tenant?.name || 'Administración',
                    from_email: tenant?.email || undefined
                })
            });
            if (resp.ok) {
                addToast('success', 'Email enviado con éxito');
                setShowEmailInput(false);
                setEmailDestino('');
            } else {
                throw new Error('Error en el envío');
            }
        } catch (err) {
            console.error('[Orden Pago] Email error:', err);
            addToast('error', 'No se pudo enviar el correo');
        } finally {
             setEnviandoEmail(false);
        }
    };


    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out', paddingBottom: '3rem' }}>
            <div className="card">
                <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <h2 className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', width: '22px', height: '22px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>1</span>
                        Datos de la Orden de Pago
                    </h2>
                </div>
                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', paddingTop: '1rem', paddingBottom: '1rem' }}>
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600 }}><Building2 size={14} color="var(--color-text-muted)" /> Proveedor</label>
                        <StyledSelect
                            className="form-input"
                            value={proveedorId}
                            onChange={(e) => setProveedorId(e.target.value)}
                            style={{ height: 38 }}
                        >
                            <option value="">Seleccione un proveedor...</option>
                            {proveedores.map(p => (
                                <option key={p.id} value={p.id}>{p.razon_social} ({p.cuit})</option>
                            ))}
                        </StyledSelect>
                    </div>
                    
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600 }}><Calendar size={14} color="var(--color-text-muted)" /> Fecha de Emisión</label>
                        <input 
                            type="date" 
                            className="form-input" 
                            value={fecha} 
                            onChange={e => setFecha(e.target.value)}
                            style={{ height: 38 }}
                        />
                    </div>
                </div>
            </div>

            {proveedorId && (
                <div className="card">
                    <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <h2 className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', width: '22px', height: '22px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>2</span>
                            Facturas Pendientes (A pagar)
                        </h2>
                    </div>
                    {loadingComprobantes ? (
                        <div style={{ padding: '2rem', textAlign: 'center' }}>Buscando comprobantes...</div>
                    ) : comprobantes.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            No hay facturas pendientes para este proveedor.
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 44, textAlign: 'center' }}></th>
                                        <th style={{ width: 120 }}>Fecha</th>
                                        <th>Tipo / N°</th>
                                        <th style={{ width: 140, textAlign: 'right' }}>Monto</th>
                                        <th style={{ width: 120, textAlign: 'center' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comprobantes.map(c => (
                                        <tr key={c.id} 
                                            onClick={() => toggleComprobante(c.id)}
                                            style={{ cursor: 'pointer', background: selectedIds.has(c.id) ? 'var(--color-accent-dim)' : 'transparent' }}>
                                            <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(c.id)} 
                                                    onChange={() => {}} 
                                                    style={{ pointerEvents: 'none', margin: 0 }}
                                                />
                                            </td>
                                            <td style={{ verticalAlign: 'middle' }}>{c.fecha}</td>
                                            <td style={{ verticalAlign: 'middle' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <FileText size={14} color="var(--color-text-muted)" />
                                                    <span>{c.tipo_comprobante || 'Factura'} {c.numero_comprobante || 'S/N'}</span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'middle' }}>
                                                {c.monto_ars ? (
                                                    `$${c.monto_ars.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS`
                                                ) : (
                                                    `${c.moneda === 'USD' ? 'u$s' : '$'} ${(c.monto_original || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${c.moneda || 'ARS'}`
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                                <span className={`badge badge-${c.estado === 'pendiente' ? 'warning' : c.estado === 'error' || c.estado === 'rechazado' ? 'danger' : c.estado === 'clasificado' ? 'info' : 'success'}`}>
                                                    {c.estado}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {selectedIds.size > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem' }}>
                    
                    {/* Retenciones Panel */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                            <h2 className="card-title" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', width: '22px', height: '22px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>3</span>
                                Retenciones Impositivas
                            </h2>
                            <button className="btn btn-outline btn-sm" onClick={addRetencion}>
                                <Plus size={14} /> Añadir
                            </button>
                        </div>
                        {retenciones.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                Sin retenciones aplicadas.
                            </div>
                        ) : (
                            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {retenciones.map(r => (
                                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 100px 80px 100px 40px', gap: '0.5rem', alignItems: 'end', background: 'var(--color-bg-secondary)', padding: '1rem', borderRadius: 8 }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label style={{ fontSize: '0.7rem' }}>Impuesto</label>
                                            <StyledSelect className="form-control form-control-sm" value={r.tipo} onChange={e => updateRetencion(r.id, 'tipo', e.target.value)}>
                                                {TIPOS_RETENCION.map(t => <option key={t} value={t}>{t}</option>)}
                                            </StyledSelect>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label style={{ fontSize: '0.7rem' }}>Base Imp.</label>
                                            <input type="number" className="form-control form-control-sm" value={r.base_imponible} onChange={e => updateRetencion(r.id, 'base_imponible', e.target.value)} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label style={{ fontSize: '0.7rem' }}>% Ali.</label>
                                            <input type="number" className="form-control form-control-sm" value={r.alicuota} onChange={e => updateRetencion(r.id, 'alicuota', e.target.value)} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label style={{ fontSize: '0.7rem' }}>Retenido</label>
                                            <input type="number" className="form-control form-control-sm" value={r.monto} onChange={e => updateRetencion(r.id, 'monto', e.target.value)} />
                                        </div>
                                        <button className="btn btn-ghost btn-icon text-danger" onClick={() => removeRetencion(r.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Resumen / Totales */}
                    <div className="card" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-subtle)', position: 'sticky', top: '2rem', alignSelf: 'start' }}>
                        <div className="card-header" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                            <h2 className="card-title" style={{ fontSize: '1.2rem', textAlign: 'center', width: '100%' }}>Liquidación Final</h2>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)' }}>
                                <span>Facturas sumadas ({selectedIds.size}):</span>
                                <span>${montoBruto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                                <span>Total Retenciones:</span>
                                <span>- ${montoRetenciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            
                            <hr style={{ borderColor: 'var(--color-border-subtle)', margin: '0.5rem 0' }} />
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                <span>Neto a Pagar:</span>
                                <span>${montoNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label className="form-label">Observaciones (Opcional)</label>
                                <textarea 
                                    className="form-input" 
                                    rows={2} 
                                    placeholder="Detalle para la tesorería..."
                                    value={observaciones}
                                    onChange={e => setObservaciones(e.target.value)}
                                />
                            </div>

                            <button 
                                className="btn btn-primary" 
                                style={{ width: '100%', marginTop: '0.5rem' }}
                                onClick={handleGenerar}
                                disabled={generando}
                            >
                                {generando ? 'Emitiendo...' : (
                                    <>
                                        <Save size={16} />
                                        Emitir Orden de Pago
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PREVIEW MODAL DE ORDEN DE PAGO */}
            {previewUrl && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm sm:p-6" style={{ margin: 0 }}>
                    <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '90vh' }}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 relative">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">Orden de Pago Generada</h3>
                                <p className="text-sm text-slate-500">Visualizando documento desde Supabase Storage</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        navigate(`/contable/proveedores?id=${proveedorId}`);
                                        setPreviewUrl(null);
                                        if (onAceptar) onAceptar(); 
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg shadow-sm hover:bg-blue-100 transition-colors"
                                >
                                    <User className="w-4 h-4" /> 
                                    <span>Ver Proveedor</span>
                                </button>

                                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                                {/* Email Dropdown */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowEmailInput(!showEmailInput)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                                    >
                                        <Mail className="w-4 h-4" /> 
                                        <span>Email</span>
                                    </button>
                                    {showEmailInput && (
                                        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 p-4 z-50">
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                Enviar al Proveedor
                                            </label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="email" 
                                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    placeholder="correo@ejemplo.com"
                                                    value={emailDestino}
                                                    onChange={e => setEmailDestino(e.target.value)}
                                                />
                                                <button 
                                                    onClick={handleSendEmail}
                                                    disabled={!emailDestino || enviandoEmail}
                                                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {enviandoEmail ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <a 
                                    href={previewUrl}
                                    download
                                    target="_blank"
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                                    rel="noreferrer"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>Descargar</span>
                                </a>

                                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                                <button
                                    onClick={() => {
                                        setPreviewUrl(null);
                                        if (onAceptar) onAceptar(); 
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                                    title="Cerrar y volver"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-100 overflow-hidden relative">
                            <DocumentViewer 
                                url={previewUrl as string} 
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
