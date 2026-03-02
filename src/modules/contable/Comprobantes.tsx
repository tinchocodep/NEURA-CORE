import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle, Upload as UploadIcon } from 'lucide-react';

interface Comprobante {
    id: string;
    tipo: string;
    fecha: string;
    numero_comprobante: string;
    tipo_comprobante: string;
    monto_original: number;
    monto_ars: number;
    moneda: string;
    tipo_cambio: number | null;
    estado: string;
    clasificacion_score: number;
    descripcion: string | null;
    observaciones: string | null;
    proveedor: { razon_social: string } | null;
    cliente: { razon_social: string } | null;
    producto_servicio: { nombre: string; grupo: string } | null;
    centro_costo: { nombre: string } | null;
}

const estadoBadge: Record<string, { cls: string; label: string }> = {
    pendiente: { cls: 'badge-warning', label: 'Pendiente' },
    clasificado: { cls: 'badge-info', label: 'Clasificado' },
    aprobado: { cls: 'badge-success', label: 'Aprobado' },
    inyectado: { cls: 'badge-success', label: 'Inyectado' },
    error: { cls: 'badge-danger', label: 'Error' },
    rechazado: { cls: 'badge-danger', label: 'Rechazado' },
};

export default function Comprobantes() {
    const { tenant } = useTenant();
    const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroTipo, setFiltroTipo] = useState<string>('todos');
    const [filtroEstado, setFiltroEstado] = useState<string>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (!tenant) return;
        loadComprobantes();
    }, [tenant, filtroTipo, filtroEstado]);

    async function loadComprobantes() {
        setLoading(true);
        let query = supabase
            .from('contable_comprobantes')
            .select(`
                id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_original, monto_ars, moneda, tipo_cambio, estado, clasificacion_score, descripcion, observaciones,
                proveedor:contable_proveedores(razon_social),
                cliente:contable_clientes(razon_social),
                producto_servicio:contable_productos_servicio(nombre, grupo),
                centro_costo:contable_centros_costo(nombre)
            `, { count: 'exact' })
            .eq('tenant_id', tenant!.id)
            .order('fecha', { ascending: false })
            .limit(50);

        if (filtroTipo !== 'todos') query = query.eq('tipo', filtroTipo);
        if (filtroEstado !== 'todos') query = query.eq('estado', filtroEstado);

        const { data, count } = await query;
        setComprobantes((data || []) as any);
        setTotal(count || 0);
        setLoading(false);
    }

    async function handleAction(id: string, action: 'aprobar' | 'rechazar') {
        const newEstado = action === 'aprobar' ? 'aprobado' : 'rechazado';
        await supabase.from('contable_comprobantes').update({ estado: newEstado }).eq('id', id);
        loadComprobantes();
    }

    const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

    const filtered = busqueda
        ? comprobantes.filter(c =>
            c.numero_comprobante.toLowerCase().includes(busqueda.toLowerCase()) ||
            ((c.proveedor as any)?.razon_social || '').toLowerCase().includes(busqueda.toLowerCase()) ||
            ((c.cliente as any)?.razon_social || '').toLowerCase().includes(busqueda.toLowerCase())
        ) : comprobantes;

    return (
        <div>
            <div className="page-header">
                <h1>Comprobantes</h1>
                <p>Gestión de facturas de compra y venta · {total} registros</p>
            </div>

            {/* Filters bar */}
            <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        className="form-input"
                        placeholder="Buscar por comprobante, proveedor o cliente..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        style={{ paddingLeft: 38, height: 40 }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <select
                        className="form-input"
                        value={filtroTipo}
                        onChange={e => setFiltroTipo(e.target.value)}
                        style={{ width: 130, height: 40 }}
                    >
                        <option value="todos">Todos</option>
                        <option value="compra">Compras</option>
                        <option value="venta">Ventas</option>
                    </select>
                    <select
                        className="form-input"
                        value={filtroEstado}
                        onChange={e => setFiltroEstado(e.target.value)}
                        style={{ width: 150, height: 40 }}
                    >
                        <option value="todos">Todo estado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="clasificado">Clasificado</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="inyectado">Inyectado</option>
                        <option value="error">Error</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Cargando comprobantes...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <UploadIcon size={40} color="var(--text-faint)" style={{ marginBottom: '1rem' }} />
                        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                            Sin comprobantes
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            Los comprobantes aparecerán aquí cuando se sincronicen desde ARCA
                        </p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}></th>
                                    <th>Fecha</th>
                                    <th>Comprobante</th>
                                    <th>Entidad</th>
                                    <th>Producto/Servicio</th>
                                    <th>Centro Costo</th>
                                    <th style={{ textAlign: 'right' }}>Monto</th>
                                    <th>Score</th>
                                    <th>Estado</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => {
                                    const badge = estadoBadge[c.estado] || { cls: 'badge-muted', label: c.estado };
                                    const entidad = c.tipo === 'compra'
                                        ? (c.proveedor as any)?.razon_social
                                        : (c.cliente as any)?.razon_social;
                                    const producto = (c.producto_servicio as any)?.nombre;
                                    const centro = (c.centro_costo as any)?.nombre;
                                    return (
                                        <tr key={c.id}>
                                            <td>
                                                {c.tipo === 'compra'
                                                    ? <ArrowDownLeft size={16} color="var(--danger)" />
                                                    : <ArrowUpRight size={16} color="var(--success)" />
                                                }
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                                {new Date(c.fecha).toLocaleDateString('es-AR')}
                                            </td>
                                            <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                <div>{c.numero_comprobante}</div>
                                                {c.tipo_comprobante && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                                                        {c.tipo_comprobante}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                {entidad || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                                            </td>
                                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                                {producto || <span style={{ color: 'var(--text-faint)' }}>Sin clasificar</span>}
                                            </td>
                                            <td>
                                                {centro
                                                    ? <span className="badge badge-muted">{centro}</span>
                                                    : <span style={{ color: 'var(--text-faint)', fontSize: '0.8125rem' }}>—</span>
                                                }
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                {fmt(c.monto_ars)}
                                                {c.moneda === 'USD' && c.tipo_cambio && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                                        USD {c.monto_original.toLocaleString()} · TC {c.tipo_cambio}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {c.clasificacion_score > 0 && (
                                                    <div style={{
                                                        width: 36, height: 36, borderRadius: '50%',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '0.7rem', fontWeight: 700,
                                                        background: c.clasificacion_score >= 80 ? 'var(--success-bg)' : c.clasificacion_score >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                                        color: c.clasificacion_score >= 80 ? 'var(--success)' : c.clasificacion_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                                                        border: `1px solid ${c.clasificacion_score >= 80 ? 'var(--success-border)' : c.clasificacion_score >= 50 ? 'var(--warning-border)' : 'var(--danger-border)'}`,
                                                    }}>
                                                        {c.clasificacion_score}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${badge.cls}`}>{badge.label}</span>
                                            </td>
                                            <td>
                                                {(c.estado === 'clasificado' || c.estado === 'pendiente') && (
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button
                                                            onClick={() => handleAction(c.id, 'aprobar')}
                                                            className="btn btn-primary"
                                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                            title="Aprobar"
                                                        >
                                                            <CheckCircle size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction(c.id, 'rechazar')}
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                            title="Rechazar"
                                                        >
                                                            <XCircle size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
