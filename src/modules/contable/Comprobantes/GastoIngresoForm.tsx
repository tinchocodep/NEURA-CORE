import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, CheckCircle, Loader, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { DolarService } from '../../../services/DolarService';

/* ─── Types ─────────────────────────────────────────── */

interface Proveedor { id: string; razon_social: string; cuit: string | null; condicion_fiscal: string | null; producto_servicio_default_id: string | null; }
interface Cliente { id: string; razon_social: string; cuit: string | null; }
interface ProductoServicio { id: string; nombre: string; grupo: string; }
interface CentroCosto { id: string; nombre: string; }

interface Props {
    tipo: 'compra' | 'venta';
    onSuccess?: () => void;
}

export default function GastoIngresoForm({ tipo, onSuccess }: Props) {
    const { tenant } = useTenant();
    const [searchParams, setSearchParams] = useSearchParams();

    // Data fields
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [moneda, setMoneda] = useState('ARS');
    const [tipoCambio, setTipoCambio] = useState('');
    const [monto, setMonto] = useState<number | ''>('');
    const [descripcion, setDescripcion] = useState('');
    const [observaciones, setObs] = useState('');

    // Entity
    const [entityId, setEntityId] = useState('');
    const [entitySearch, setEntitySearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // Clasificación
    const [productoId, setProductoId] = useState('');
    const [centroId, setCentroId] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [accountId, setAccountId] = useState('');

    // Catalogs
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [productos, setProductos] = useState<ProductoServicio[]>([]);
    const [centros, setCentros] = useState<CentroCosto[]>([]);
    const [categorias, setCategorias] = useState<{ id: string, nombre: string, color: string, tipo: string }[]>([]);
    const [accounts, setAccounts] = useState<{ id: string, name: string, balance: number }[]>([]);
    const [treasuryCategories, setTreasuryCategories] = useState<{ id: string, name: string, type: string }[]>([]);

    // UI
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dollar rate state (auto-fill tipo de cambio)
    const [bnaRate, setBnaRate] = useState<number | null>(null);
    const [bnaLoading, setBnaLoading] = useState(false);

    // Duplicate detection
    const [duplicateWarning, setDuplicateWarning] = useState<{ count: number; existing: { numero_comprobante: string; fecha: string; monto_ars: number }[] } | null>(null);
    const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);

    const isGasto = tipo === 'compra';

    useEffect(() => {
        if (!tenant) return;
        Promise.all([
            supabase.from('contable_proveedores').select('id, razon_social, cuit, condicion_fiscal, producto_servicio_default_id').eq('tenant_id', tenant.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_clientes').select('id, razon_social, cuit').eq('tenant_id', tenant.id).eq('activo', true).order('razon_social'),
            supabase.from('contable_productos_servicio').select('id, nombre, grupo').eq('tenant_id', tenant.id).eq('activo', true).order('nombre'),
            supabase.from('contable_centros_costo').select('id, nombre').eq('tenant_id', tenant.id).eq('activo', true).order('nombre'),
            supabase.from('contable_categorias').select('id, nombre, color, tipo').eq('tenant_id', tenant.id).order('nombre'),
            supabase.from('treasury_accounts').select('id, name, balance').eq('tenant_id', tenant.id).is('assigned_user_id', null).eq('is_active', true).order('name'),
            supabase.from('treasury_categories').select('id, name, type').eq('tenant_id', tenant.id),
        ]).then(([{ data: p }, { data: c }, { data: ps }, { data: cc }, { data: cat }, { data: acc }, { data: tCat }]) => {
            const provs = (p || []) as Proveedor[];
            setProveedores(provs);
            setClientes((c || []) as Cliente[]);
            setProductos((ps || []) as ProductoServicio[]);
            setCentros((cc || []) as CentroCosto[]);
            setCategorias((cat || []) as any);
            setAccounts((acc || []) as any);
            setTreasuryCategories((tCat || []) as any);

            const preProvId = searchParams.get('proveedor_id');
            if (preProvId && isGasto) {
                const prov = provs.find(x => x.id === preProvId);
                if (prov) {
                    setEntityId(prov.id);
                    setEntitySearch(prov.razon_social);
                }
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('proveedor_id');
                setSearchParams(newParams, { replace: true });
            }
        });
    }, [tenant, isGasto, searchParams, setSearchParams]);

    useEffect(() => {
        if (isGasto && entityId) {
            const prov = proveedores.find(p => p.id === entityId);
            if (prov?.producto_servicio_default_id && !productoId) {
                setProductoId(prov.producto_servicio_default_id);
            }
        }
    }, [entityId, isGasto]);

    useEffect(() => {
        if (moneda === 'USD') {
            setBnaLoading(true);
            DolarService.getOficialVenta().then(rate => {
                setBnaRate(rate);
                if (rate && !tipoCambio) {
                    setTipoCambio(rate.toFixed(2));
                }
                setBnaLoading(false);
            });
        } else {
            setBnaRate(null);
        }
    }, [moneda]);

    const entityList = isGasto ? proveedores : clientes;
    const filteredEntities = entitySearch
        ? entityList.filter(e => e.razon_social.toLowerCase().includes(entitySearch.toLowerCase()) || ((e as any).cuit || '').includes(entitySearch))
        : entityList;

    const selectedEntity = entityList.find(e => e.id === entityId);

    const handleSave = async () => {
        if (!tenant) return;
        setError(null);

        if (!fecha) { setError('La fecha es obligatoria.'); return; }
        if (!monto || monto <= 0) { setError('El monto debe ser mayor a 0.'); return; }

        const numMonto = Number(monto);

        if (!skipDuplicateCheck && entityId) {
            const entityField = isGasto ? 'proveedor_id' : 'cliente_id';

            const { data: dupes } = await supabase.from('contable_comprobantes')
                .select('numero_comprobante, fecha, monto_ars')
                .eq('tenant_id', tenant.id)
                .eq(entityField, entityId)
                .eq('fecha', fecha)
                .eq('monto_original', numMonto);

            if (dupes && dupes.length > 0) {
                setDuplicateWarning({
                    count: dupes.length,
                    existing: dupes.slice(0, 3) as { numero_comprobante: string; fecha: string; monto_ars: number }[],
                });
                return;
            }
        }

        setSkipDuplicateCheck(false);
        setSaving(true);

        const tipoCambioNum = moneda === 'USD' ? parseFloat(tipoCambio) || 1 : null;
        const montoArs = moneda === 'USD' ? numMonto * (tipoCambioNum || 1) : numMonto;

        const defaultDesc = isGasto ? 'Gasto sin factura' : 'Ingreso sin factura';

        const payload = {
            tenant_id: tenant.id,
            tipo,
            fecha,
            fecha_contable: fecha,
            numero_comprobante: '',
            tipo_comprobante: 'Sin Factura',
            proveedor_id: isGasto ? (entityId || null) : null,
            cliente_id: !isGasto ? (entityId || null) : null,
            producto_servicio_id: productoId || null,
            centro_costo_id: centroId || null,
            categoria_id: categoriaId || null,
            moneda,
            monto_original: numMonto,
            tipo_cambio: tipoCambioNum,
            monto_ars: montoArs,
            lineas: [{
                producto_servicio_id: productoId || null,
                descripcion: descripcion.trim() || defaultDesc,
                cantidad: 1,
                precio_unitario: numMonto,
                iva_porcentaje: 0,
                subtotal: numMonto,
                iva: 0,
                total: numMonto,
            }],
            descripcion: descripcion.trim() || defaultDesc,
            observaciones: observaciones.trim() || null,
            estado: 'pendiente' as const,
            clasificacion_score: 100,
            clasificado_por: 'manual',
            source: 'manual' as const,
        };

        const { error: err } = await supabase.from('contable_comprobantes').insert(payload);

        if (err) { setSaving(false); setError('Error al guardar comprobante: ' + err.message); return; }

        if (accountId) {
            const tCat = treasuryCategories.find(c => c.type === (isGasto ? 'expense' : 'income'));
            const txPayload = {
                tenant_id: tenant.id,
                account_id: accountId,
                category_id: tCat?.id || null, // Best effort
                type: isGasto ? 'expense' : 'income',
                amount: montoArs,
                description: descripcion.trim() || defaultDesc,
                date: fecha,
                status: 'completado',
                source: 'manual',
            };
            const { error: txErr } = await supabase.from('treasury_transactions').insert(txPayload);
            if (!txErr) {
                const acc = accounts.find(a => a.id === accountId);
                if (acc) {
                    const newBal = isGasto ? acc.balance - montoArs : acc.balance + montoArs;
                    await supabase.from('treasury_accounts').update({ balance: newBal }).eq('id', accountId);
                }
            } else {
                console.error("Error inserting treasury tx:", txErr);
            }
        }

        setSaving(false);

        // Reset
        setMonto(''); setDescripcion(''); setObs('');
        setEntityId(''); setProductoId(''); setCentroId(''); setCategoriaId(''); setAccountId('');
        setTipoCambio(''); setEntitySearch('');
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3500);
        onSuccess?.();
    };

    return (
        <>
            <div style={{ maxWidth: 860, margin: '0 auto' }}>
                {success && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--color-success-dim)', border: '1px solid rgba(22,163,74,0.3)',
                        borderRadius: 'var(--radius-md)', padding: '0.875rem 1.25rem',
                        color: 'var(--color-success)', fontWeight: 600, fontSize: '0.875rem',
                        marginBottom: '1.25rem',
                    }}>
                        <CheckCircle size={18} />
                        Registro guardado correctamente.
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'var(--color-danger-dim)', border: '1px solid rgba(220,38,38,0.3)',
                        borderRadius: 'var(--radius-md)', padding: '0.875rem 1.25rem',
                        color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '1.25rem',
                    }}>
                        {error}
                    </div>
                )}

                {/* ── SECCIÓN 1: Header ── */}
                <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                        Datos Principales
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">Fecha *</label>
                            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} autoFocus />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Moneda *</label>
                            <select className="form-input" value={moneda} onChange={e => setMoneda(e.target.value)}>
                                <option value="ARS">ARS – Peso Argentino</option>
                                <option value="USD">USD – Dólar</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Monto (Total) *</label>
                            <input type="number" step="0.01" min="0" className="form-input" value={monto} onChange={e => setMonto(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" style={{ fontFamily: 'var(--font-mono)' }} />
                        </div>

                        {moneda === 'USD' && (
                            <div className="form-group" style={{ gridColumn: '2 / 4' }}>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    Tipo de Cambio
                                    {bnaLoading && <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                                    {bnaRate && !bnaLoading && (
                                        <span style={{
                                            fontSize: '0.68rem', fontWeight: 600,
                                            padding: '0.15rem 0.5rem', borderRadius: 99,
                                            background: 'rgba(16, 185, 129, 0.1)', color: '#059669',
                                            border: '1px solid rgba(16, 185, 129, 0.2)',
                                        }}>
                                            BNA Oficial: ${bnaRate.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </span>
                                    )}
                                </label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="number" className="form-input"
                                        placeholder="1350.00" value={tipoCambio}
                                        onChange={e => setTipoCambio(e.target.value)}
                                        style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
                                    />
                                    {bnaRate && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setTipoCambio(bnaRate.toFixed(2))}
                                            style={{ fontSize: '0.7rem', padding: '0.35rem 0.6rem', whiteSpace: 'nowrap', gap: 4 }}
                                            title="Usar cotización BNA oficial del día"
                                        >
                                            <RefreshCw size={12} /> Usar BNA
                                        </button>
                                    )}
                                </div>
                                {tipoCambio && Number(monto) > 0 && (
                                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                        💱 Equivalente ARS: <strong style={{ color: 'var(--color-text-primary)' }}>
                                            ${(Number(monto) * parseFloat(tipoCambio)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </strong>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SECCIÓN 2: Entidad ── */}
                <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                        {isGasto ? 'Proveedor (Opcional)' : 'Cliente (Opcional)'}
                    </div>

                    <div style={{ position: 'relative' }}>
                        <input
                            className="form-input"
                            placeholder={`Buscar ${isGasto ? 'proveedor' : 'cliente'} por nombre o CUIT...`}
                            value={selectedEntity ? selectedEntity.razon_social : entitySearch}
                            onChange={e => { setEntitySearch(e.target.value); setEntityId(''); setShowDropdown(true); }}
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
                        />
                        {showDropdown && filteredEntities.length > 0 && !entityId && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                                maxHeight: 220, overflowY: 'auto',
                            }}>
                                {filteredEntities.slice(0, 20).map(e => (
                                    <div
                                        key={e.id}
                                        style={{ padding: '0.625rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.875rem' }}
                                        onMouseDown={() => { setEntityId(e.id); setEntitySearch(e.razon_social); setShowDropdown(false); }}
                                        className="nav-item-hover"
                                    >
                                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{e.razon_social}</div>
                                        {(e as any).cuit && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>CUIT: {(e as any).cuit}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SECCIÓN 3: Clasificación ── */}
                <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
                        Clasificación y Detalles
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Concepto / Descripción</label>
                            <input className="form-input" placeholder={isGasto ? "Ej: Compra de insumos, almuerzo, etc." : "Ej: Cobro de servicio extra"} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Categoría Automática (IA)</label>
                            <select className="form-input" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                                <option value="">Sin categoría...</option>
                                {categorias
                                    .filter(c => c.tipo === 'ambos' || c.tipo === (isGasto ? 'gasto' : 'ingreso'))
                                    .map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Concepto Facturable (Rubro)</label>
                            <select className="form-input" value={productoId} onChange={e => setProductoId(e.target.value)}>
                                <option value="">Sin concepto...</option>
                                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.grupo})</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Centro de Costo</label>
                            <select className="form-input" value={centroId} onChange={e => setCentroId(e.target.value)}>
                                <option value="">Sin asignar</option>
                                {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label" style={{ color: 'var(--color-brand)', fontWeight: 600 }}>Impacto en Tesorería (Caja / Banco)</label>
                            <select
                                className="form-input"
                                value={accountId}
                                onChange={e => setAccountId(e.target.value)}
                                style={{ borderColor: accountId ? 'var(--color-brand)' : undefined, background: accountId ? 'rgba(37,99,235,0.05)' : undefined }}
                            >
                                <option value="">Sin impacto inicial (Pendiente de pago)</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} — ${acc.balance?.toLocaleString('es-AR')}</option>
                                ))}
                            </select>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
                                Si seleccionás una cuenta, se creará un movimiento completado en Tesorería y se actualizará el saldo.
                            </span>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Observaciones internas</label>
                            <textarea className="form-input" rows={2} placeholder="Opcional..." value={observaciones} onChange={e => setObs(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                        style={{ minWidth: 160 }}
                    >
                        <Save size={15} />
                        {saving ? 'Guardando...' : `Guardar ${isGasto ? 'Gasto' : 'Ingreso'}`}
                    </button>
                </div>
            </div>

            {/* Duplicate warning modal */}
            {duplicateWarning && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 440, width: '90%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <AlertTriangle size={24} color="#f59e0b" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>Posible duplicado</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Se encontraron {duplicateWarning.count} registro{duplicateWarning.count > 1 ? 's' : ''} similar{duplicateWarning.count > 1 ? 'es' : ''}
                                </div>
                            </div>
                        </div>

                        <div style={{
                            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                            padding: '0.75rem', marginBottom: '1.25rem',
                        }}>
                            {duplicateWarning?.existing.map((d, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.35rem 0',
                                    borderBottom: i < duplicateWarning.existing.length - 1 ? '1px solid #fde68a' : 'none',
                                    fontSize: '0.8rem',
                                }}>
                                    <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#92400e' }}>
                                        {d.numero_comprobante || 'Sin Factura'}
                                    </span>
                                    <span style={{ color: '#92400e' }}>
                                        {new Date(d.fecha).toLocaleDateString('es-AR')} · ${Number(d.monto_ars || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setDuplicateWarning(null)}
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    setDuplicateWarning(null);
                                    setSkipDuplicateCheck(true);
                                    setTimeout(() => handleSave(), 0);
                                }}
                                style={{ padding: '0.5rem 1rem', background: '#f59e0b', borderColor: '#f59e0b' }}
                            >
                                Guardar de todas formas
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
