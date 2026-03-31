import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Building2, Edit2, X, Save, Trash2, Eye, Send, RefreshCw } from 'lucide-react';
import { SkeletonTable } from '../../shared/components/SkeletonKit';
import Entity360Panel from './Entity360Panel';

interface Cliente {
    id: string;
    cuit: string | null;
    razon_social: string;
    segmento: string | null;
    activo: boolean;
    condicion_fiscal: string | null;
    email: string | null;
    telefono: string | null;
    direccion: string | null;
    provincia: string | null;
    localidad: string | null;
    observaciones: string | null;
    categoria_default: { id: string; nombre: string; color: string; tipo: string; } | null;
}

interface Categoria {
    id: string;
    nombre: string;
    tipo: 'ingreso' | 'gasto' | 'ambos';
    color: string;
}

export default function Clientes() {
    const { tenant } = useTenant();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [categoriaFilter, setCategoriaFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState<Cliente | null>(null);
    const [form, setForm] = useState({ razon_social: '', cuit: '', segmento: '', categoria_default_id: '' });
    const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

    // Sync state
    const [syncingClientes, setSyncingClientes] = useState(false);
    const [showSyncMenu, setShowSyncMenu] = useState(false);
    const tenantModules = (tenant?.enabled_modules as string[]) || [];
    const hasColppy = tenantModules.includes('erp_colppy');
    const hasXubio = tenantModules.includes('erp_xubio');
    const hasBothErps = hasColppy && hasXubio;
    const hasErpModule = hasColppy || hasXubio;

    // Pagination state
    const [visibleCount, setVisibleCount] = useState(50);

    useEffect(() => {
        setVisibleCount(50);
    }, [busqueda, categoriaFilter]);

    useEffect(() => {
        if (!tenant) return;
        load();
    }, [tenant]);

    // Open 360 panel if navigated with ?cliente_id=
    useEffect(() => {
        const clienteId = searchParams.get('cliente_id');
        if (clienteId && clientes.length > 0) {
            const found = clientes.find(c => c.id === clienteId);
            if (found) {
                setSelectedCliente(found);
                setSearchParams({}, { replace: true });
            }
        }
    }, [clientes, searchParams]);

    async function load() {
        setLoading(true);
        const [{ data: clis }, { data: cats }] = await Promise.all([
            supabase.from('contable_clientes')
                .select('id, cuit, razon_social, segmento, activo, condicion_fiscal, email, telefono, direccion, provincia, localidad, observaciones, categoria_default:contable_categorias(id, nombre, color, tipo)')
                .eq('tenant_id', tenant!.id)
                .eq('activo', true)
                .order('razon_social'),
            supabase.from('contable_categorias')
                .select('id, nombre, tipo, color')
                .eq('tenant_id', tenant!.id)
                .order('nombre')
        ]);
        setClientes((clis || []) as any);
        setCategorias((cats || []) as Categoria[]);
        setLoading(false);
    }

    function openNew() {
        setEditando(null);
        setForm({ razon_social: '', cuit: '', segmento: '', categoria_default_id: '' });
        setShowModal(true);
    }

    function openEdit(c: Cliente) {
        setEditando(c);
        setForm({ razon_social: c.razon_social, cuit: c.cuit || '', segmento: c.segmento || '', categoria_default_id: c.categoria_default?.id || '' });
        setShowModal(true);
    }

    async function handleSave() {
        const payload = {
            tenant_id: tenant!.id,
            razon_social: form.razon_social.trim(),
            cuit: form.cuit.trim() || null,
            segmento: form.segmento || null,
            categoria_default_id: form.categoria_default_id || null,
        };
        if (editando) {
            await supabase.from('contable_clientes').update(payload).eq('id', editando.id);
        } else {
            await supabase.from('contable_clientes').insert(payload);
        }
        setShowModal(false);
        load();
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Desactivar este cliente?')) return;
        await supabase.from('contable_clientes').update({ activo: false }).eq('id', id);
        load();
    }

    const filtered = clientes.filter(c => {
        if (busqueda && !c.razon_social.toLowerCase().includes(busqueda.toLowerCase()) && !(c.cuit || '').includes(busqueda)) return false;
        if (categoriaFilter) {
            if (categoriaFilter === '__none__') {
                if (c.categoria_default) return false;
            } else {
                if (c.categoria_default?.id !== categoriaFilter) return false;
            }
        }
        return true;
    });

    const handleSyncClientes = async (source?: 'colppy' | 'xubio') => {
        if (!tenant) return;
        if (hasBothErps && !source) { setShowSyncMenu(!showSyncMenu); return; }
        const selectedSource = source || (hasColppy ? 'colppy' : 'xubio');
        setShowSyncMenu(false);
        setSyncingClientes(true);
        try {
            if (selectedSource === 'colppy') {
                const { getColpyService } = await import('../../services/ColpyService');
                const colpy = getColpyService(tenant.id);
                await colpy.loadConfig();
                if (!colpy.isConfigured) { alert('Colppy no está configurado.'); setSyncingClientes(false); return; }
                const result = await colpy.syncClientesFromColpy();
                alert(`Colppy: ${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} errores` : ''}`);
            } else {
                const { getXubioService } = await import('../../services/XubioService');
                const xubio = getXubioService(tenant.id);
                await xubio.loadConfig();
                if (!xubio.isConfigured) { alert('Xubio no está configurado.'); setSyncingClientes(false); return; }
                const result = await xubio.syncClientesFromXubio();
                alert(`Xubio: ${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} errores` : ''}`);
            }
            load();
        } catch (err: any) {
            console.error('Sync error:', err);
            alert('Error al sincronizar: ' + (err.message || 'Error desconocido'));
        }
        setSyncingClientes(false);
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Clientes</h1>
                    <p>Gestión de clientes de venta · {clientes.length} activos</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {hasErpModule && (
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-ghost" onClick={() => handleSyncClientes()} disabled={syncingClientes}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.8rem', borderRadius: 10 }}>
                                <RefreshCw size={14} className={syncingClientes ? 'spin' : ''} />
                                {syncingClientes ? 'Sincronizando...' : 'Sincronizar'}
                            </button>
                            {showSyncMenu && hasBothErps && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
                                    <button onClick={() => handleSyncClientes('colppy')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Colppy
                                    </button>
                                    <button onClick={() => handleSyncClientes('xubio')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Xubio
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <button className="btn btn-primary" onClick={openNew}>
                        <Plus size={16} /> Nuevo Cliente
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '0.75rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
                        <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            className="form-input"
                            placeholder="Buscar por razón social o CUIT..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            style={{ paddingLeft: 38, height: 40 }}
                        />
                    </div>

                    <select
                        className="form-input"
                        value={categoriaFilter}
                        onChange={e => setCategoriaFilter(e.target.value)}
                        style={{ height: 40, fontSize: '0.85rem', padding: '0 0.5rem', minWidth: 200, maxWidth: 260, borderRadius: 8, border: categoriaFilter ? '2px solid #1958E0' : '1px solid #e2e8f0', background: categoriaFilter ? 'rgba(25, 88, 224, 0.08)' : '#fff', color: categoriaFilter ? '#1958E0' : '#64748b' }}
                    >
                        <option value="">Categoría: Todas</option>
                        <option value="__none__">⚠️ Sin asignar</option>
                        {categorias.filter(c => c.tipo !== 'gasto').map(c => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <SkeletonTable rows={5} columns={3} />
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <Building2 size={40} color="var(--text-faint)" style={{ marginBottom: '1rem' }} />
                        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                            {busqueda ? 'Sin resultados' : 'Sin clientes aún'}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {busqueda ? 'Probá con otra búsqueda' : 'Agregá clientes manualmente o sincronizá desde tu ERP (Xubio/Colpy)'}
                        </p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Razón Social</th>
                                    <th>CUIT</th>
                                    <th>Cond. Fiscal</th>
                                    <th>Contacto</th>
                                    <th style={{ width: 140 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.slice(0, visibleCount).map(c => (
                                    <tr key={c.id} onClick={() => setSelectedCliente(c)} style={{ cursor: 'pointer' }}>
                                        <td style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <span>{c.razon_social}</span>
                                                {c.categoria_default && (
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 99, background: `${c.categoria_default.color}15`, color: c.categoria_default.color, border: `1px solid ${c.categoria_default.color}30`, alignSelf: 'flex-start' }}>
                                                        {c.categoria_default.nombre}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: c.cuit ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                            {c.cuit || 'Sin CUIT'}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: c.condicion_fiscal ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                            {c.condicion_fiscal || '—'}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {c.email || c.telefono || [c.localidad, c.provincia].filter(Boolean).join(', ') || '—'}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/contable/comprobantes?tab=crear&cliente_id=${c.id}`); }}
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', gap: 4 }}
                                                    title="Emitir factura a este cliente"
                                                >
                                                    <Send size={12} /> Factura
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); setSelectedCliente(c); }} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} title="Vista 360°">
                                                    <Eye size={14} />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {visibleCount < filtered.length && (
                            <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border-subtle)' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setVisibleCount(v => v + 50)}
                                    style={{ background: 'var(--color-bg-surface-2)' }}
                                >
                                    Cargar más ({filtered.length - visibleCount} restantes)
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setShowModal(false)}>
                    <div className="card" style={{ width: 460, margin: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="card-title">{editando ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                            <button className="btn btn-secondary" style={{ padding: '0.3rem' }} onClick={() => setShowModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Razón Social *</label>
                            <input className="form-input" value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} placeholder="Ej: GAVIGLIO AGROINSUMOS S.A." />
                        </div>

                        <div className="form-group">
                            <label className="form-label">CUIT</label>
                            <input className="form-input" value={form.cuit} onChange={e => setForm({ ...form, cuit: e.target.value })} placeholder="Ej: 30-12345678-9" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Segmento</label>
                            <select className="form-input" value={form.segmento} onChange={e => setForm({ ...form, segmento: e.target.value })}>
                                <option value="">Sin definir</option>
                                <option value="biz">Biz (PyME)</option>
                                <option value="corp">Corp (Corporativo)</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Categoría Default</label>
                            <select
                                className="form-input"
                                value={form.categoria_default_id}
                                onChange={e => setForm({ ...form, categoria_default_id: e.target.value })}
                            >
                                <option value="">Seleccione una categoría</option>
                                {categorias.filter(c => c.tipo !== 'gasto').map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={!form.razon_social.trim()}>
                                <Save size={16} /> {editando ? 'Guardar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 360° Detail Panel */}
            {selectedCliente && (
                <Entity360Panel
                    entity={selectedCliente}
                    entityType="cliente"
                    onClose={() => setSelectedCliente(null)}
                />
            )}
        </div>
    );
}
