import React, { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Package, MapPin, ChevronRight, ChevronDown, Plus, Edit2, X, Save, Trash2 } from 'lucide-react';
import { SkeletonTable } from '../../shared/components/SkeletonKit';

type Tab = 'productos' | 'centros' | 'cuentas';

interface ProductoServicio {
    id: string; nombre: string; tipo: string; grupo: string; activo: boolean;
    cuenta_contable: { codigo: string; nombre: string } | null;
}

interface CentroCosto {
    id: string; nombre: string; activo: boolean;
}

interface CuentaContable {
    id: string; codigo: string; nombre: string; nivel: number; tipo: string; imputable: boolean;
    padre_id: string | null;
}

export default function Catalogos() {
    const { tenant } = useTenant();
    const [tab, setTab] = useState<Tab>('productos');
    const [productos, setProductos] = useState<ProductoServicio[]>([]);
    const [centros, setCentros] = useState<CentroCosto[]>([]);
    const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [expandedCuentas, setExpandedCuentas] = useState<Set<string>>(new Set());

    // Modal state for centros
    const [showModal, setShowModal] = useState(false);
    const [editandoCentro, setEditandoCentro] = useState<CentroCosto | null>(null);
    const [formCentro, setFormCentro] = useState({ nombre: '' });

    useEffect(() => {
        if (!tenant) return;
        loadAll();
    }, [tenant]);

    async function loadAll() {
        setLoading(true);
        const [{ data: prods }, { data: ccs }, { data: pcs }] = await Promise.all([
            supabase.from('contable_productos_servicio')
                .select('id, nombre, tipo, grupo, activo, cuenta_contable:contable_plan_cuentas(codigo, nombre)')
                .eq('tenant_id', tenant!.id).eq('activo', true).order('tipo, grupo, nombre'),
            supabase.from('contable_centros_costo')
                .select('id, nombre, activo')
                .eq('tenant_id', tenant!.id).eq('activo', true).order('nombre'),
            supabase.from('contable_plan_cuentas')
                .select('id, codigo, nombre, nivel, tipo, imputable, padre_id')
                .eq('tenant_id', tenant!.id).eq('activo', true).order('codigo'),
        ]);
        setProductos((prods || []) as any);
        setCentros((ccs || []) as any);
        setCuentas((pcs || []) as any);
        setLoading(false);
    }

    function toggleCuenta(id: string) {
        setExpandedCuentas(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    // Centros CRUD
    function openNewCentro() {
        setEditandoCentro(null);
        setFormCentro({ nombre: '' });
        setShowModal(true);
    }
    function openEditCentro(c: CentroCosto) {
        setEditandoCentro(c);
        setFormCentro({ nombre: c.nombre });
        setShowModal(true);
    }
    async function saveCentro() {
        const payload = { tenant_id: tenant!.id, nombre: formCentro.nombre.trim() };
        if (editandoCentro) {
            await supabase.from('contable_centros_costo').update(payload).eq('id', editandoCentro.id);
        } else {
            await supabase.from('contable_centros_costo').insert(payload);
        }
        setShowModal(false);
        loadAll();
    }
    async function deleteCentro(id: string) {
        if (!confirm('¿Desactivar este centro de costo?')) return;
        await supabase.from('contable_centros_costo').update({ activo: false }).eq('id', id);
        loadAll();
    }

    // Grouped products
    const filteredProductos = filtroTipo === 'todos' ? productos : productos.filter(p => p.tipo === filtroTipo);
    const productosByGrupo = filteredProductos.reduce((acc, p) => {
        const g = p.grupo || 'Sin grupo';
        if (!acc[g]) acc[g] = [];
        acc[g].push(p);
        return acc;
    }, {} as Record<string, ProductoServicio[]>);

    // Tree cuentas
    const rootCuentas = cuentas.filter(c => !c.padre_id);
    const childrenOf = (parentId: string) => cuentas.filter(c => c.padre_id === parentId);

    function renderCuenta(c: CuentaContable, depth: number = 0): React.ReactNode {
        const children = childrenOf(c.id);
        const isExpanded = expandedCuentas.has(c.id);
        const hasChildren = children.length > 0;
        const tipoColor: Record<string, string> = {
            activo: 'var(--info)', pasivo: 'var(--danger)', patrimonio_neto: 'var(--brand-accent)',
            ingreso: 'var(--success)', egreso: 'var(--warning)',
        };

        return (
            <div key={c.id}>
                <div
                    onClick={() => hasChildren && toggleCuenta(c.id)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 1rem',
                        paddingLeft: `${1 + depth * 1.5}rem`, cursor: hasChildren ? 'pointer' : 'default',
                        borderBottom: '1px solid var(--border)', transition: 'background 0.15s',
                        background: depth === 0 ? '#f8f9fc' : 'transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.025)')}
                    onMouseLeave={e => (e.currentTarget.style.background = depth === 0 ? '#f8f9fc' : 'transparent')}
                >
                    {hasChildren ? (
                        isExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />
                    ) : (
                        <span style={{ width: 14 }} />
                    )}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 110 }}>
                        {c.codigo}
                    </span>
                    <span style={{ fontWeight: depth < 2 ? 600 : 400, fontSize: depth < 2 ? '0.875rem' : '0.8125rem', flex: 1 }}>
                        {c.nombre}
                    </span>
                    {c.imputable && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 9999, background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                            IMPUTABLE
                        </span>
                    )}
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tipoColor[c.tipo] || 'var(--text-faint)' }} />
                </div>
                {isExpanded && children.map(ch => renderCuenta(ch, depth + 1))}
            </div>
        );
    }

    const tabStyle = (t: Tab) => ({
        padding: '0.5rem 1.25rem', borderRadius: 9999, fontWeight: tab === t ? 600 : 500, fontSize: '0.8125rem',
        cursor: 'pointer' as const, border: 'none', fontFamily: 'inherit',
        background: tab === t ? 'var(--brand)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-muted)',
        boxShadow: tab === t ? 'var(--shadow-brand)' : 'none',
        transition: 'all 0.2s ease',
    });

    return (
        <div>
            <div className="page-header">
                <h1>Catálogos</h1>
                <p>Productos/Servicio, Centros de Costo y Plan de Cuentas</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 9999, padding: 4, marginBottom: '1.5rem', width: 'fit-content' }}>
                <button style={tabStyle('productos')} onClick={() => setTab('productos')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Package size={14} /> Productos/Servicio ({productos.length})</span>
                </button>
                <button style={tabStyle('centros')} onClick={() => setTab('centros')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={14} /> Centros de Costo ({centros.length})</span>
                </button>
                <button style={tabStyle('cuentas')} onClick={() => setTab('cuentas')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Plan de Cuentas ({cuentas.length})</span>
                </button>
            </div>

            {loading ? (
                <SkeletonTable rows={5} columns={3} />
            ) : tab === 'productos' ? (
                <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        {['todos', 'compra', 'venta'].map(t => (
                            <button key={t} className={`btn ${filtroTipo === t ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.35rem 1rem', fontSize: '0.8125rem' }}
                                onClick={() => setFiltroTipo(t)}>
                                {t === 'todos' ? 'Todos' : t === 'compra' ? 'Compras' : 'Ventas'}
                            </button>
                        ))}
                    </div>
                    {Object.entries(productosByGrupo).map(([grupo, prods]) => (
                        <div key={grupo} className="card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                                {grupo} ({prods.length})
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {prods.map(p => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                                        <span className={`badge ${p.tipo === 'compra' ? 'badge-danger' : p.tipo === 'venta' ? 'badge-success' : 'badge-info'}`}
                                            style={{ fontSize: '0.6rem', minWidth: 52, textAlign: 'center' as const }}>
                                            {p.tipo === 'compra' ? 'COMPRA' : p.tipo === 'venta' ? 'VENTA' : 'AMBOS'}
                                        </span>
                                        <span style={{ flex: 1, fontSize: '0.875rem' }}>{p.nombre}</span>
                                        {(p.cuenta_contable as any)?.codigo && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                {(p.cuenta_contable as any).codigo}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : tab === 'centros' ? (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button className="btn btn-primary" onClick={openNewCentro}><Plus size={16} /> Nuevo Centro</button>
                    </div>
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr><th>Nombre</th><th style={{ width: 80 }}></th></tr>
                                </thead>
                                <tbody>
                                    {centros.map(c => (
                                        <tr key={c.id}>
                                            <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button onClick={() => openEditCentro(c)} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}><Edit2 size={14} /></button>
                                                    <button onClick={() => deleteCentro(c.id)} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {cuentas.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>Plan de Cuentas vacío</p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Sincronizá el plan desde Xubio en Configuración</p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                            {rootCuentas.map(c => renderCuenta(c))}
                        </div>
                    )}
                    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--info)' }} /> Activo</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} /> Pasivo</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-accent)' }} /> PN</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} /> Ingreso</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} /> Egreso</span>
                    </div>
                </div>
            )}

            {/* Modal centros */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
                    <div className="card" style={{ width: 400, margin: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="card-title">{editandoCentro ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo'}</h3>
                            <button className="btn btn-secondary" style={{ padding: '0.3rem' }} onClick={() => setShowModal(false)}><X size={16} /></button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nombre *</label>
                            <input className="form-input" value={formCentro.nombre} onChange={e => setFormCentro({ nombre: e.target.value })} placeholder="Ej: Licencia" />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={saveCentro} disabled={!formCentro.nombre.trim()}>
                                <Save size={16} /> {editandoCentro ? 'Guardar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
