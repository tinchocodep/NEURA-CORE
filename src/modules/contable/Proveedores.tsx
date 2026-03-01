import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Search, Plus, Edit2, AlertTriangle, X, Save, Trash2 } from 'lucide-react';

interface Proveedor {
    id: string;
    cuit: string | null;
    razon_social: string;
    es_caso_rojo: boolean;
    activo: boolean;
    producto_servicio_default: { id: string; nombre: string; grupo: string } | null;
}

interface ProductoServicio {
    id: string;
    nombre: string;
    grupo: string;
}

export default function Proveedores() {
    const { tenant } = useTenant();
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [productos, setProductos] = useState<ProductoServicio[]>([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState<Proveedor | null>(null);
    const [form, setForm] = useState({ razon_social: '', cuit: '', producto_servicio_default_id: '', es_caso_rojo: false });

    useEffect(() => {
        if (!tenant) return;
        load();
    }, [tenant]);

    async function load() {
        setLoading(true);
        const [{ data: provs }, { data: prods }] = await Promise.all([
            supabase.from('contable_proveedores')
                .select('id, cuit, razon_social, es_caso_rojo, activo, producto_servicio_default:contable_productos_servicio(id, nombre, grupo)')
                .eq('tenant_id', tenant!.id)
                .eq('activo', true)
                .order('razon_social'),
            supabase.from('contable_productos_servicio')
                .select('id, nombre, grupo')
                .eq('tenant_id', tenant!.id)
                .eq('tipo', 'compra')
                .eq('activo', true)
                .order('grupo, nombre'),
        ]);
        setProveedores((provs || []) as any);
        setProductos((prods || []) as any);
        setLoading(false);
    }

    function openNew() {
        setEditando(null);
        setForm({ razon_social: '', cuit: '', producto_servicio_default_id: '', es_caso_rojo: false });
        setShowModal(true);
    }

    function openEdit(p: Proveedor) {
        setEditando(p);
        setForm({
            razon_social: p.razon_social,
            cuit: p.cuit || '',
            producto_servicio_default_id: (p.producto_servicio_default as any)?.id || '',
            es_caso_rojo: p.es_caso_rojo,
        });
        setShowModal(true);
    }

    async function handleSave() {
        const payload = {
            tenant_id: tenant!.id,
            razon_social: form.razon_social.trim(),
            cuit: form.cuit.trim() || null,
            producto_servicio_default_id: form.producto_servicio_default_id || null,
            es_caso_rojo: form.es_caso_rojo,
        };
        if (editando) {
            await supabase.from('contable_proveedores').update(payload).eq('id', editando.id);
        } else {
            await supabase.from('contable_proveedores').insert(payload);
        }
        setShowModal(false);
        load();
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Desactivar este proveedor?')) return;
        await supabase.from('contable_proveedores').update({ activo: false }).eq('id', id);
        load();
    }

    const filtered = busqueda
        ? proveedores.filter(p =>
            p.razon_social.toLowerCase().includes(busqueda.toLowerCase()) ||
            (p.cuit || '').includes(busqueda)
        ) : proveedores;

    // Group productos by grupo
    const productosByGrupo = productos.reduce((acc, p) => {
        if (!acc[p.grupo]) acc[p.grupo] = [];
        acc[p.grupo].push(p);
        return acc;
    }, {} as Record<string, ProductoServicio[]>);

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Proveedores</h1>
                    <p>Gestión de proveedores y clasificación de compras · {proveedores.length} activos</p>
                </div>
                <button className="btn btn-primary" onClick={openNew}>
                    <Plus size={16} /> Nuevo Proveedor
                </button>
            </div>

            {/* Search */}
            <div className="card" style={{ padding: '0.75rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        className="form-input"
                        placeholder="Buscar por razón social o CUIT..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        style={{ paddingLeft: 38, height: 40 }}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando proveedores...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                            {busqueda ? 'Sin resultados' : 'Sin proveedores aún'}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {busqueda ? 'Probá con otra búsqueda' : 'Agregá proveedores manualmente o sincronizá desde ARCA'}
                        </p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Razón Social</th>
                                    <th>CUIT</th>
                                    <th>Producto/Servicio Default</th>
                                    <th>Grupo</th>
                                    <th style={{ width: 60 }}></th>
                                    <th style={{ width: 80 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {p.es_caso_rojo && <AlertTriangle size={14} color="var(--warning)" title="Caso rojo: múltiples clasificaciones" />}
                                            {p.razon_social}
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: p.cuit ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                            {p.cuit || 'Sin CUIT'}
                                        </td>
                                        <td style={{ fontSize: '0.8125rem' }}>
                                            {(p.producto_servicio_default as any)?.nombre || <span style={{ color: 'var(--text-faint)' }}>Sin asignar</span>}
                                        </td>
                                        <td>
                                            {(p.producto_servicio_default as any)?.grupo && (
                                                <span className="badge badge-muted">{(p.producto_servicio_default as any).grupo}</span>
                                            )}
                                        </td>
                                        <td>
                                            {p.es_caso_rojo && (
                                                <span className="badge badge-warning" style={{ fontSize: '0.6rem' }}>ROJO</span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => openEdit(p)} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDelete(p.id)} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setShowModal(false)}>
                    <div className="card" style={{ width: 520, maxHeight: '80vh', overflow: 'auto', margin: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="card-title">{editando ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
                            <button className="btn btn-secondary" style={{ padding: '0.3rem' }} onClick={() => setShowModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Razón Social *</label>
                            <input className="form-input" value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} placeholder="Ej: GOOGLE CLOUD ARGENTINA SRL" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">CUIT</label>
                            <input className="form-input" value={form.cuit} onChange={e => setForm({ ...form, cuit: e.target.value })} placeholder="Ej: 30-12345678-9" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Producto/Servicio Default</label>
                            <select className="form-input" value={form.producto_servicio_default_id} onChange={e => setForm({ ...form, producto_servicio_default_id: e.target.value })}>
                                <option value="">Sin asignar</option>
                                {Object.entries(productosByGrupo).map(([grupo, prods]) => (
                                    <optgroup key={grupo} label={grupo}>
                                        {prods.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
                            <input type="checkbox" id="caso-rojo" checked={form.es_caso_rojo} onChange={e => setForm({ ...form, es_caso_rojo: e.target.checked })} />
                            <label htmlFor="caso-rojo" style={{ fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={14} color="var(--warning)" /> Caso rojo (múltiples clasificaciones posibles)
                            </label>
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
        </div>
    );
}
