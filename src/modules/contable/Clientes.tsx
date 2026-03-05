import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Search, Plus, Edit2, X, Save, Trash2, Building2, Eye } from 'lucide-react';
import Entity360Panel from './Entity360Panel';

interface Cliente {
    id: string;
    cuit: string | null;
    razon_social: string;
    segmento: string | null;
    activo: boolean;
}

export default function Clientes() {
    const { tenant } = useTenant();
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState<Cliente | null>(null);
    const [form, setForm] = useState({ razon_social: '', cuit: '', segmento: '' });
    const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

    useEffect(() => {
        if (!tenant) return;
        load();
    }, [tenant]);

    async function load() {
        setLoading(true);
        const { data } = await supabase.from('contable_clientes')
            .select('id, cuit, razon_social, segmento, activo')
            .eq('tenant_id', tenant!.id)
            .eq('activo', true)
            .order('razon_social');
        setClientes((data || []) as any);
        setLoading(false);
    }

    function openNew() {
        setEditando(null);
        setForm({ razon_social: '', cuit: '', segmento: '' });
        setShowModal(true);
    }

    function openEdit(c: Cliente) {
        setEditando(c);
        setForm({ razon_social: c.razon_social, cuit: c.cuit || '', segmento: c.segmento || '' });
        setShowModal(true);
    }

    async function handleSave() {
        const payload = {
            tenant_id: tenant!.id,
            razon_social: form.razon_social.trim(),
            cuit: form.cuit.trim() || null,
            segmento: form.segmento || null,
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

    const filtered = busqueda
        ? clientes.filter(c =>
            c.razon_social.toLowerCase().includes(busqueda.toLowerCase()) ||
            (c.cuit || '').includes(busqueda)
        ) : clientes;

    const segmentoBadge = (s: string | null) => {
        if (s === 'corp') return <span className="badge badge-info">Corp</span>;
        if (s === 'biz') return <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.2)' }}>Biz</span>;
        return <span style={{ color: 'var(--text-faint)', fontSize: '0.8125rem' }}>—</span>;
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Clientes</h1>
                    <p>Gestión de clientes de venta · {clientes.length} activos</p>
                </div>
                <button className="btn btn-primary" onClick={openNew}>
                    <Plus size={16} /> Nuevo Cliente
                </button>
            </div>

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

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando clientes...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <Building2 size={40} color="var(--text-faint)" style={{ marginBottom: '1rem' }} />
                        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                            {busqueda ? 'Sin resultados' : 'Sin clientes aún'}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {busqueda ? 'Probá con otra búsqueda' : 'Agregá clientes manualmente o sincronizá desde Xubio'}
                        </p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Razón Social</th>
                                    <th>CUIT</th>
                                    <th>Segmento</th>
                                    <th style={{ width: 80 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.id} onClick={() => setSelectedCliente(c)} style={{ cursor: 'pointer' }}>
                                        <td style={{ fontWeight: 600 }}>{c.razon_social}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: c.cuit ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                            {c.cuit || 'Sin CUIT'}
                                        </td>
                                        <td>{segmentoBadge(c.segmento)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4 }}>
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
