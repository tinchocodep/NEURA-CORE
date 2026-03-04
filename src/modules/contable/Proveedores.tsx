import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Search, Plus, Edit2, AlertTriangle, X, Save, Trash2, Loader, Globe, ChevronDown, ChevronRight, Download, Clock, FileText, Filter, Eye } from 'lucide-react';

// --- Types ---

interface Proveedor {
    id: string;
    cuit: string | null;
    razon_social: string;
    es_caso_rojo: boolean;
    activo: boolean;
    producto_servicio_default: { id: string; nombre: string; grupo: string } | null;
    condicion_fiscal: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    observaciones: string | null;
}

interface ProductoServicio {
    id: string;
    nombre: string;
    grupo: string | null;
    tipo: string;
}

interface ProviderStats {
    proveedor_id: string;
    ultima_actividad: string | null;
    total_comprobantes: number;
    monto_total: number;
}

interface ComprobanteResumen {
    id: string;
    fecha: string;
    tipo_comprobante: string;
    numero_comprobante: string;
    monto_ars: number;
    estado: string;
    descripcion: string | null;
    pdf_url: string | null;
}

/** Shape returned by the ARCA n8n webhook */
interface ArcaPersona {
    name: string;
    address: string;
    taxCondition: string;
    jurisdiction: string;
}

interface ProveedorForm {
    razon_social: string;
    cuit: string;
    producto_servicio_default_id: string;
    es_caso_rojo: boolean;
    condicion_fiscal: string;
    telefono: string;
    email: string;
    direccion: string;
    observaciones: string;
}

// --- Constants ---

const ARCA_WEBHOOK_URL = '/api/arca';

const CONDICIONES_FISCALES = [
    'Responsable Inscripto',
    'Monotributista',
    'Exento',
    'Consumidor Final',
    'No Responsable',
] as const;

const INITIAL_FORM: ProveedorForm = {
    razon_social: '',
    cuit: '',
    producto_servicio_default_id: '',
    es_caso_rojo: false,
    condicion_fiscal: '',
    telefono: '',
    email: '',
    direccion: '',
    observaciones: '',
};

/** Invoice type suggestion based on fiscal conditions */
function sugerirTipoFactura(condEmisor: string | null, condReceptor: string | null): { tipo: string; label: string; color: string } | null {
    if (!condEmisor || !condReceptor) return null;
    const e = condEmisor.toLowerCase();
    const r = condReceptor.toLowerCase();
    if (e.includes('monotribut')) return { tipo: 'C', label: 'Factura C', color: '#0d9488' };
    if (e.includes('exento')) return { tipo: 'B', label: 'Factura B', color: '#f59e0b' };
    if (e.includes('responsable inscripto') || e.includes('resp.')) {
        if (r.includes('consumidor final')) return { tipo: 'B', label: 'Factura B', color: '#f59e0b' };
        return { tipo: 'A', label: 'Factura A', color: '#1958E0' };
    }
    return null;
}

// --- Component ---

export default function Proveedores() {
    const { tenant } = useTenant();
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [productos, setProductos] = useState<ProductoServicio[]>([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editando, setEditando] = useState<Proveedor | null>(null);
    const [form, setForm] = useState<ProveedorForm>(INITIAL_FORM);

    // ARCA search state
    const [arcaSearching, setArcaSearching] = useState(false);
    const [arcaResult, setArcaResult] = useState<ArcaPersona | null>(null);
    const [arcaError, setArcaError] = useState<string | null>(null);

    // Product/service filter state
    const [prodFilter, setProdFilter] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // Provider stats & detail panel
    const [providerStats, setProviderStats] = useState<Map<string, ProviderStats>>(new Map());
    const [selectedProvider, setSelectedProvider] = useState<Proveedor | null>(null);
    const [detailComprobantes, setDetailComprobantes] = useState<ComprobanteResumen[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activityFilter, setActivityFilter] = useState<'all' | 'recent' | 'month' | 'dormant' | 'none'>('all');

    useEffect(() => {
        if (!tenant) return;
        load();
    }, [tenant]);

    async function load() {
        setLoading(true);
        const [{ data: provs }, { data: prods }] = await Promise.all([
            supabase.from('contable_proveedores')
                .select('id, cuit, razon_social, es_caso_rojo, activo, condicion_fiscal, telefono, email, direccion, observaciones, producto_servicio_default:contable_productos_servicio(id, nombre, grupo)')
                .eq('tenant_id', tenant!.id)
                .eq('activo', true)
                .order('razon_social'),
            supabase.from('contable_productos_servicio')
                .select('id, nombre, grupo, tipo')
                .eq('tenant_id', tenant!.id)
                .eq('activo', true)
                .order('grupo', { nullsFirst: false })
                .order('nombre'),
        ]);
        setProveedores((provs || []) as Proveedor[]);
        setProductos((prods || []) as ProductoServicio[]);

        // Load activity stats
        if (provs && provs.length > 0) {
            const { data: stats } = await supabase.rpc('get_provider_stats', { p_tenant_id: tenant!.id });
            if (stats) {
                const map = new Map<string, ProviderStats>();
                (stats as ProviderStats[]).forEach(s => map.set(s.proveedor_id, s));
                setProviderStats(map);
            }
        }
        setLoading(false);
    }

    function exportCSV() {
        const sep = ';';
        const esc = (v: string | number | null | undefined) => {
            const s = String(v ?? '');
            return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = ['Razón Social', 'CUIT', 'Producto/Servicio', 'Grupo', 'Última Actividad', 'Comprobantes', 'Monto Total ARS', 'Caso Rojo'].join(sep);
        const rows = filtered.map(p => {
            const prod = p.producto_servicio_default as ProductoServicio | null;
            const stats = providerStats.get(p.id);
            const lastDate = stats?.ultima_actividad
                ? new Date(stats.ultima_actividad).toLocaleDateString('es-AR')
                : 'Sin actividad';
            return [
                esc(p.razon_social),
                esc(p.cuit),
                esc(prod?.nombre),
                esc(prod?.grupo),
                esc(lastDate),
                stats?.total_comprobantes || 0,
                Number(stats?.monto_total || 0).toFixed(2),
                p.es_caso_rojo ? 'SÍ' : '',
            ].join(sep);
        });
        // Summary row
        const totalComp = filtered.reduce((a, p) => a + (providerStats.get(p.id)?.total_comprobantes || 0), 0);
        const totalMonto = filtered.reduce((a, p) => a + Number(providerStats.get(p.id)?.monto_total || 0), 0);
        const summary = ['TOTAL', '', '', '', '', totalComp, totalMonto.toFixed(2), ''].join(sep);

        const bom = '\uFEFF';
        const csv = bom + [header, ...rows, '', summary].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proveedores_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function openDetail(p: Proveedor) {
        setSelectedProvider(p);
        setDetailLoading(true);
        const { data } = await supabase
            .from('contable_comprobantes')
            .select('id, fecha, tipo_comprobante, numero_comprobante, monto_ars, estado, descripcion, pdf_url')
            .eq('proveedor_id', p.id)
            .order('fecha', { ascending: false })
            .limit(20);
        setDetailComprobantes((data || []) as ComprobanteResumen[]);
        setDetailLoading(false);
    }

    function formatTimeAgo(dateStr: string | null): { text: string; color: string } {
        if (!dateStr) return { text: 'Sin actividad', color: '#f43f5e' };
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
        if (diff <= 7) return { text: `Hace ${diff}d`, color: '#10b981' };
        if (diff <= 30) return { text: `Hace ${Math.floor(diff / 7)}sem`, color: '#10b981' };
        if (diff <= 90) return { text: `Hace ${Math.floor(diff / 30)}m`, color: '#f59e0b' };
        return { text: `Hace ${Math.floor(diff / 30)}m`, color: '#f43f5e' };
    }

    function resetProductFilters() {
        setProdFilter('');
        setExpandedFolders(new Set());
    }

    function openNew() {
        setEditando(null);
        setForm({ ...INITIAL_FORM });
        resetArcaState();
        resetProductFilters();
        setShowModal(true);
    }

    function openEdit(p: Proveedor) {
        setEditando(p);
        const selectedProd = p.producto_servicio_default as ProductoServicio | null;
        setForm({
            razon_social: p.razon_social,
            cuit: p.cuit || '',
            producto_servicio_default_id: selectedProd?.id || '',
            es_caso_rojo: p.es_caso_rojo,
            condicion_fiscal: p.condicion_fiscal || '',
            telefono: p.telefono || '',
            email: p.email || '',
            direccion: p.direccion || '',
            observaciones: p.observaciones || '',
        });
        resetArcaState();
        setProdFilter('');
        // Auto-expand the folder containing the selected product
        if (selectedProd?.nombre) {
            const firstWord = selectedProd.nombre.split(/[\s\-\/]/)[0].trim().toLowerCase();
            const folderLabel = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
            setExpandedFolders(new Set([folderLabel]));
        } else {
            setExpandedFolders(new Set());
        }
        setShowModal(true);
    }

    function resetArcaState() {
        setArcaResult(null);
        setArcaError(null);
        setArcaSearching(false);
    }

    // --- ARCA Search ---

    async function handleArcaSearch() {
        const cuitClean = form.cuit.replace(/[-\s]/g, '').trim();
        if (!cuitClean) {
            setArcaError('Ingresá un CUIT para buscar');
            return;
        }

        setArcaSearching(true);
        setArcaError(null);
        setArcaResult(null);

        try {
            const response = await fetch(ARCA_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cuit: cuitClean }),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const raw = await response.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                // Response is not JSON — could be plain text from n8n
                throw new Error(`Respuesta inesperada de ARCA: ${raw.substring(0, 120)}`);
            }

            // Normalize: webhook may return a single object or an array
            const items: ArcaPersona[] = Array.isArray(parsed) ? parsed : [parsed as ArcaPersona];

            if (items.length === 0 || !items[0]?.name) {
                setArcaError('No se encontró información para ese CUIT en ARCA');
                return;
            }

            const persona = items[0];
            setArcaResult(persona);

            // Auto-fill razon_social only if the field is empty (don't overwrite user edits)
            if (!form.razon_social.trim()) {
                setForm(prev => ({ ...prev, razon_social: persona.name }));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            setArcaError(`Error al buscar en ARCA: ${message}`);
        } finally {
            setArcaSearching(false);
        }
    }

    function applyArcaData() {
        if (!arcaResult) return;
        const condMap: Record<string, string> = {
            'IVA Responsable Inscripto': 'Responsable Inscripto',
            'Responsable Inscripto': 'Responsable Inscripto',
            'IVA Responsable No Inscripto': 'No Responsable',
            'IVA Sujeto Exento': 'Exento',
            'Responsable Monotributo': 'Monotributista',
            'Monotributista Social': 'Monotributista',
            'Consumidor Final': 'Consumidor Final',
        };
        setForm(prev => ({
            ...prev,
            razon_social: arcaResult.name,
            direccion: arcaResult.address || prev.direccion,
            condicion_fiscal: condMap[arcaResult.taxCondition] || arcaResult.taxCondition || prev.condicion_fiscal,
        }));
    }

    // --- Save / Delete ---

    async function handleSave() {
        const payload = {
            tenant_id: tenant!.id,
            razon_social: form.razon_social.trim(),
            cuit: form.cuit.trim() || null,
            producto_servicio_default_id: form.producto_servicio_default_id || null,
            es_caso_rojo: form.es_caso_rojo,
            condicion_fiscal: form.condicion_fiscal || null,
            telefono: form.telefono.trim() || null,
            email: form.email.trim() || null,
            direccion: form.direccion.trim() || null,
            observaciones: form.observaciones.trim() || null,
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

    // --- Derived data ---

    const filtered = proveedores.filter(p => {
        // Text search
        if (busqueda) {
            const q = busqueda.toLowerCase();
            if (!p.razon_social.toLowerCase().includes(q) && !(p.cuit || '').includes(busqueda)) return false;
        }
        // Activity filter
        if (activityFilter !== 'all') {
            const stats = providerStats.get(p.id);
            const lastDate = stats?.ultima_actividad ? new Date(stats.ultima_actividad) : null;
            const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : Infinity;
            switch (activityFilter) {
                case 'recent': return daysSince <= 30;
                case 'month': return daysSince <= 90;
                case 'dormant': return daysSince > 90 && daysSince < Infinity;
                case 'none': return daysSince === Infinity;
            }
        }
        return true;
    });
    // Smart prefix-based auto-grouping
    const productFolders: { label: string; items: ProductoServicio[] }[] = [];
    const productStandalones: ProductoServicio[] = [];

    (() => {
        const prefixMap = new Map<string, ProductoServicio[]>();
        for (const p of productos) {
            const firstWord = p.nombre.split(/[\s\-\/]/)[0].trim();
            if (!firstWord) continue;
            const key = firstWord.toLowerCase();
            if (!prefixMap.has(key)) prefixMap.set(key, []);
            prefixMap.get(key)!.push(p);
        }

        const assigned = new Set<string>();
        const sortedPrefixes = [...prefixMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        for (const [prefix, items] of sortedPrefixes) {
            if (items.length >= 2) {
                const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
                productFolders.push({ label, items: items.sort((a, b) => a.nombre.localeCompare(b.nombre)) });
                items.forEach(i => assigned.add(i.id));
            }
        }

        productos
            .filter(p => !assigned.has(p.id))
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .forEach(p => productStandalones.push(p));
    })();

    function toggleFolder(label: string) {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    }

    // --- Render ---

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Proveedores</h1>
                    <p>Gestión de proveedores y clasificación de compras · {proveedores.length} activos</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={exportCSV} style={{ gap: 6 }}>
                        <Download size={16} /> CSV
                    </button>
                    <button className="btn btn-primary" onClick={openNew}>
                        <Plus size={16} /> Nuevo Proveedor
                    </button>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="card" style={{ padding: '0.75rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative', marginBottom: '0.625rem' }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        className="form-input"
                        placeholder="Buscar por razón social o CUIT..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        style={{ paddingLeft: 38, height: 40 }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                    <Filter size={14} color="#94a3b8" style={{ marginRight: 2 }} />
                    {[
                        { key: 'all' as const, label: 'Todos', icon: '' },
                        { key: 'recent' as const, label: 'Último mes', icon: '🟢' },
                        { key: 'month' as const, label: 'Últimos 3 meses', icon: '🟡' },
                        { key: 'dormant' as const, label: 'Dormidos', icon: '🔴' },
                        { key: 'none' as const, label: 'Sin actividad', icon: '⚫' },
                    ].map(f => {
                        const isActive = activityFilter === f.key;
                        const count = f.key === 'all' ? proveedores.length : proveedores.filter(p => {
                            const stats = providerStats.get(p.id);
                            const d = stats?.ultima_actividad ? Math.floor((Date.now() - new Date(stats.ultima_actividad).getTime()) / 86400000) : Infinity;
                            switch (f.key) {
                                case 'recent': return d <= 30;
                                case 'month': return d <= 90;
                                case 'dormant': return d > 90 && d < Infinity;
                                case 'none': return d === Infinity;
                                default: return true;
                            }
                        }).length;
                        return (
                            <button
                                key={f.key}
                                onClick={() => setActivityFilter(f.key)}
                                style={{
                                    padding: '0.25rem 0.6rem', borderRadius: 99,
                                    fontSize: '0.75rem', fontWeight: isActive ? 600 : 400,
                                    border: isActive ? '2px solid #1958E0' : '1px solid #e2e8f0',
                                    background: isActive ? 'rgba(25, 88, 224, 0.08)' : '#fff',
                                    color: isActive ? '#1958E0' : '#64748b',
                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                {f.icon && <span style={{ fontSize: '0.6rem' }}>{f.icon}</span>}
                                {f.label}
                                <span style={{
                                    fontSize: '0.65rem', fontWeight: 600,
                                    color: isActive ? '#fff' : '#94a3b8',
                                    background: isActive ? '#1958E0' : '#f1f5f9',
                                    padding: '0 0.35rem', borderRadius: 99, minWidth: 18, textAlign: 'center',
                                }}>{count}</span>
                            </button>
                        );
                    })}
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
                        <table style={{ tableLayout: 'fixed', width: '100%' }}>
                            <colgroup>
                                <col style={{ width: '28%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '24%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '14%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Razón Social</th>
                                    <th>CUIT</th>
                                    <th>Producto/Servicio</th>
                                    <th>Grupo</th>
                                    <th>Actividad</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const stats = providerStats.get(p.id);
                                    const activity = formatTimeAgo(stats?.ultima_actividad ?? null);
                                    return (
                                        <tr key={p.id} onClick={() => openDetail(p)} style={{ cursor: 'pointer' }}>
                                            <td style={{ fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {p.es_caso_rojo && <AlertTriangle size={14} color="var(--warning)" style={{ flexShrink: 0 }} />}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.razon_social}</span>
                                                    {p.es_caso_rojo && (
                                                        <span className="badge badge-warning" style={{ fontSize: '0.6rem', flexShrink: 0 }}>ROJO</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: p.cuit ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                                {p.cuit || 'Sin CUIT'}
                                            </td>
                                            <td>
                                                {(p.producto_servicio_default as ProductoServicio | null)?.nombre
                                                    ? <span style={{
                                                        display: 'inline-block', maxWidth: '100%',
                                                        padding: '0.2rem 0.6rem', borderRadius: 99,
                                                        fontSize: '0.75rem', fontWeight: 600,
                                                        background: 'rgba(25, 88, 224, 0.1)',
                                                        color: '#1958E0',
                                                        border: '1px solid rgba(25, 88, 224, 0.2)',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>{(p.producto_servicio_default as ProductoServicio | null)!.nombre}</span>
                                                    : <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.2rem 0.6rem', borderRadius: 99,
                                                        fontSize: '0.75rem', fontWeight: 500,
                                                        color: '#94a3b8',
                                                        border: '1px dashed #cbd5e1',
                                                    }}>Sin asignar</span>
                                                }
                                            </td>
                                            <td>
                                                {(p.producto_servicio_default as ProductoServicio | null)?.grupo && (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.2rem 0.6rem', borderRadius: 99,
                                                        fontSize: '0.7rem', fontWeight: 600,
                                                        background: 'rgba(13, 148, 136, 0.1)',
                                                        color: '#0d9488',
                                                        border: '1px solid rgba(13, 148, 136, 0.2)',
                                                    }}>{(p.producto_servicio_default as ProductoServicio | null)!.grupo}</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Clock size={12} style={{ color: activity.color, flexShrink: 0 }} />
                                                    <span style={{
                                                        fontSize: '0.75rem', fontWeight: 600, color: activity.color,
                                                    }}>{activity.text}</span>
                                                </div>
                                                {stats && stats.total_comprobantes > 0 && (
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 2 }}>
                                                        {stats.total_comprobantes} comp · ${Number(stats.monto_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                    <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}>
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal: Nuevo / Editar Proveedor */}
            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setShowModal(false)}>
                    <div className="card" style={{ width: 560, maxHeight: '85vh', overflow: 'auto', margin: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="card-title">{editando ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
                            <button className="btn btn-secondary" style={{ padding: '0.3rem' }} onClick={() => setShowModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* ARCA Search Section — only for new providers */}
                        {!editando && (
                            <div style={{
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: '1rem 1.25rem',
                                marginBottom: '1.25rem',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                                    <Globe size={16} color="var(--primary)" />
                                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Buscar en ARCA</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        className="form-input"
                                        value={form.cuit}
                                        onChange={e => setForm({ ...form, cuit: e.target.value })}
                                        placeholder="Ingresá el CUIT (ej: 30712345678)"
                                        style={{ flex: 1, height: 40, fontFamily: 'monospace' }}
                                        onKeyDown={e => { if (e.key === 'Enter') handleArcaSearch(); }}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleArcaSearch}
                                        disabled={arcaSearching || !form.cuit.trim()}
                                        style={{ whiteSpace: 'nowrap', height: 40, gap: 6 }}
                                    >
                                        {arcaSearching
                                            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Buscando...</>
                                            : <><Search size={14} /> Buscar</>
                                        }
                                    </button>
                                </div>

                                {/* ARCA Error */}
                                {arcaError && (
                                    <div style={{
                                        marginTop: '0.75rem', padding: '0.625rem 0.875rem',
                                        background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                                        borderRadius: 6, fontSize: '0.8125rem', color: 'var(--danger)',
                                    }}>
                                        {arcaError}
                                    </div>
                                )}

                                {/* ARCA Result Card */}
                                {arcaResult && (
                                    <div style={{
                                        marginTop: '0.75rem', padding: '0.875rem',
                                        background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                                        borderRadius: 6,
                                    }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                                            {arcaResult.name}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-sub)' }}>
                                            <div>📍 {arcaResult.address}</div>
                                            <div>🏛️ {arcaResult.jurisdiction}</div>
                                            <div style={{ gridColumn: '1 / -1' }}>📋 {arcaResult.taxCondition}</div>
                                        </div>
                                        {form.razon_social !== arcaResult.name && (
                                            <button
                                                className="btn btn-primary"
                                                onClick={applyArcaData}
                                                style={{ marginTop: '0.625rem', fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
                                            >
                                                Usar esta razón social
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Form Fields */}
                        <div className="form-group">
                            <label className="form-label">Razón Social *</label>
                            <input className="form-input" value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} placeholder="Ej: GOOGLE CLOUD ARGENTINA SRL" />
                        </div>

                        {/* Show CUIT field only when editing (for new, it's in the ARCA search section) */}
                        {editando && (
                            <div className="form-group">
                                <label className="form-label">CUIT</label>
                                <input className="form-input" value={form.cuit} onChange={e => setForm({ ...form, cuit: e.target.value })} placeholder="Ej: 30-12345678-9" />
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Producto/Servicio Default</label>

                            {/* Search */}
                            <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    className="form-input"
                                    placeholder="Buscar producto/servicio..."
                                    value={prodFilter}
                                    onChange={e => setProdFilter(e.target.value)}
                                    style={{ paddingLeft: 32, height: 36, fontSize: '0.8125rem' }}
                                />
                            </div>

                            {/* Accordion list */}
                            <div style={{
                                maxHeight: 300, overflowY: 'auto',
                                border: '1px solid #cbd5e1', borderRadius: 10,
                                background: '#f8f9fc',
                            }}>
                                {/* Folder groups */}
                                {productFolders.map((folder, idx) => {
                                    const matchingItems = folder.items.filter(p =>
                                        !prodFilter || p.nombre.toLowerCase().includes(prodFilter.toLowerCase())
                                    );
                                    if (matchingItems.length === 0) return null;
                                    const isOpen = expandedFolders.has(folder.label) || !!prodFilter;
                                    const hasSelected = matchingItems.some(p => p.id === form.producto_servicio_default_id);
                                    return (
                                        <div key={folder.label}>
                                            {idx > 0 && <div style={{ height: 1, background: '#e2e8f0' }} />}
                                            {/* Accordion header */}
                                            <div
                                                onClick={() => toggleFolder(folder.label)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '0.6rem 0.75rem', cursor: 'pointer',
                                                    background: hasSelected ? 'rgba(25,88,224,0.08)' : 'transparent',
                                                    transition: 'background 0.15s ease',
                                                }}
                                            >
                                                {isOpen
                                                    ? <ChevronDown size={14} style={{ color: '#1958E0', flexShrink: 0 }} />
                                                    : <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                }
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                                                    {folder.label}
                                                </span>
                                                <span style={{
                                                    marginLeft: 'auto', fontSize: '0.6875rem', fontWeight: 500,
                                                    color: '#fff', background: hasSelected ? '#1958E0' : '#94a3b8',
                                                    padding: '0.1rem 0.45rem', borderRadius: 99, minWidth: 20, textAlign: 'center',
                                                }}>
                                                    {matchingItems.length}
                                                </span>
                                            </div>
                                            {/* Accordion body */}
                                            {isOpen && (
                                                <div style={{
                                                    padding: '0.375rem 0.75rem 0.5rem 2rem',
                                                    display: 'flex', flexWrap: 'wrap', gap: '0.3rem',
                                                    background: '#fff',
                                                    borderTop: '1px solid #e2e8f0',
                                                }}>
                                                    {matchingItems.map(p => {
                                                        const sel = form.producto_servicio_default_id === p.id;
                                                        return (
                                                            <button
                                                                key={p.id} type="button"
                                                                onClick={() => setForm(prev => ({
                                                                    ...prev,
                                                                    producto_servicio_default_id: sel ? '' : p.id,
                                                                }))}
                                                                style={{
                                                                    padding: '0.25rem 0.6rem', borderRadius: 14,
                                                                    fontSize: '0.75rem', fontWeight: sel ? 600 : 400,
                                                                    border: sel ? '2px solid #1958E0' : '1px solid #cbd5e1',
                                                                    background: sel ? '#1958E0' : '#f1f5f9',
                                                                    color: sel ? '#fff' : '#334155',
                                                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                                                }}
                                                            >{p.nombre}</button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {/* Standalone items */}
                                {productStandalones
                                    .filter(p => !prodFilter || p.nombre.toLowerCase().includes(prodFilter.toLowerCase()))
                                    .map((p, idx) => {
                                        const sel = form.producto_servicio_default_id === p.id;
                                        return (
                                            <div key={p.id}>
                                                {(productFolders.length > 0 || idx > 0) && <div style={{ height: 1, background: '#e2e8f0' }} />}
                                                <div
                                                    onClick={() => setForm(prev => ({
                                                        ...prev,
                                                        producto_servicio_default_id: sel ? '' : p.id,
                                                    }))}
                                                    style={{
                                                        padding: '0.6rem 0.75rem', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        background: sel ? 'rgba(25,88,224,0.08)' : 'transparent',
                                                        transition: 'background 0.15s ease',
                                                    }}
                                                >
                                                    {sel
                                                        ? <div style={{ width: 14, height: 14, borderRadius: 99, background: '#1958E0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <div style={{ width: 6, height: 6, borderRadius: 99, background: '#fff' }} />
                                                        </div>
                                                        : <div style={{ width: 14, height: 14, borderRadius: 99, border: '2px solid #cbd5e1', flexShrink: 0 }} />
                                                    }
                                                    <span style={{
                                                        fontSize: '0.8125rem', fontWeight: sel ? 600 : 400,
                                                        color: sel ? '#1958E0' : '#334155',
                                                    }}>{p.nombre}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                                {productos.length === 0 && (
                                    <div style={{ padding: '1rem', fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                                        No hay productos/servicios configurados
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Condición Fiscal + Invoice suggestion */}
                        <div className="form-group">
                            <label>Condición Fiscal</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <select
                                    className="form-input"
                                    value={form.condicion_fiscal}
                                    onChange={e => setForm({ ...form, condicion_fiscal: e.target.value })}
                                    style={{ flex: 1 }}
                                >
                                    <option value="">Sin definir</option>
                                    {CONDICIONES_FISCALES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                {(() => {
                                    const sug = sugerirTipoFactura('Responsable Inscripto', form.condicion_fiscal);
                                    if (!sug) return null;
                                    return (
                                        <span style={{
                                            padding: '0.3rem 0.6rem', borderRadius: 99, fontSize: '0.75rem',
                                            fontWeight: 700, background: `${sug.color}15`, color: sug.color,
                                            border: `1.5px solid ${sug.color}40`, whiteSpace: 'nowrap',
                                        }}>
                                            📋 {sug.label}
                                        </span>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Contact info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="form-group">
                                <label>Teléfono</label>
                                <input className="form-input" placeholder="Ej: +54 11 1234-5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input className="form-input" type="email" placeholder="proveedor@mail.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Dirección</label>
                            <input className="form-input" placeholder="Domicilio fiscal" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label>Observaciones</label>
                            <textarea
                                className="form-input"
                                placeholder="Notas internas sobre este proveedor..."
                                value={form.observaciones}
                                onChange={e => setForm({ ...form, observaciones: e.target.value })}
                                rows={2}
                                style={{ resize: 'vertical' }}
                            />
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

            {/* Detail Side Panel */}
            {selectedProvider && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)',
                    display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
                }} onClick={() => setSelectedProvider(null)}>
                    <div style={{
                        width: 480, maxWidth: '90vw', height: '100vh', background: '#fff',
                        boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', overflowY: 'auto',
                        animation: 'slideIn 0.2s ease-out',
                    }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{
                            padding: '1.5rem', borderBottom: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                        }}>
                            <div>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                    {selectedProvider.razon_social}
                                </h2>
                                <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '0.25rem 0 0', fontFamily: 'monospace' }}>
                                    {selectedProvider.cuit || 'Sin CUIT'}
                                </p>
                                {selectedProvider.condicion_fiscal && (() => {
                                    const sug = sugerirTipoFactura('Responsable Inscripto', selectedProvider.condicion_fiscal);
                                    return (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                                                borderRadius: 99, background: '#f1f5f9', color: '#475569',
                                            }}>{selectedProvider.condicion_fiscal}</span>
                                            {sug && <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                                                borderRadius: 99, background: `${sug.color}15`, color: sug.color,
                                                border: `1px solid ${sug.color}40`,
                                            }}>📋 {sug.label}</span>}
                                        </div>
                                    );
                                })()}
                                {(selectedProvider.telefono || selectedProvider.email || selectedProvider.direccion) && (
                                    <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {selectedProvider.telefono && <span>📞 {selectedProvider.telefono}</span>}
                                        {selectedProvider.email && <span>✉️ {selectedProvider.email}</span>}
                                        {selectedProvider.direccion && <span>📍 {selectedProvider.direccion}</span>}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSelectedProvider(null)} className="btn btn-secondary" style={{ padding: '0.3rem' }}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Stats cards */}
                        {(() => {
                            const stats = providerStats.get(selectedProvider.id);
                            const activity = formatTimeAgo(stats?.ultima_actividad ?? null);
                            const prod = selectedProvider.producto_servicio_default as ProductoServicio | null;
                            return (
                                <div style={{ padding: '1rem 1.5rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                        <div style={{ padding: '0.75rem', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#0284c7', fontWeight: 600, marginBottom: 4 }}>COMPROBANTES</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{stats?.total_comprobantes || 0}</div>
                                        </div>
                                        <div style={{ padding: '0.75rem', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>TOTAL ARS</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                                                ${Number(stats?.monto_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                                            </div>
                                        </div>
                                        <div style={{ padding: '0.75rem', borderRadius: 10, background: activity.color === '#10b981' ? '#f0fdf4' : activity.color === '#f59e0b' ? '#fffbeb' : '#fef2f2', border: `1px solid ${activity.color}22` }}>
                                            <div style={{ fontSize: '0.7rem', color: activity.color, fontWeight: 600, marginBottom: 4 }}>ACTIVIDAD</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 700, color: activity.color }}>{activity.text}</div>
                                        </div>
                                    </div>

                                    {/* Assigned product */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto/Servicio Asignado</div>
                                        {prod ? (
                                            <span style={{
                                                display: 'inline-block', padding: '0.3rem 0.75rem', borderRadius: 99,
                                                fontSize: '0.8125rem', fontWeight: 600,
                                                background: 'rgba(25, 88, 224, 0.1)', color: '#1958E0',
                                                border: '1px solid rgba(25, 88, 224, 0.2)',
                                            }}>{prod.nombre}</span>
                                        ) : (
                                            <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>Sin asignar</span>
                                        )}
                                    </div>

                                    {/* Comprobantes list */}
                                    <div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Últimos Comprobantes</div>
                                        {detailLoading ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                                <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                            </div>
                                        ) : detailComprobantes.length === 0 ? (
                                            <div style={{
                                                padding: '2rem', textAlign: 'center', borderRadius: 10,
                                                border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: '0.8125rem',
                                            }}>Sin comprobantes registrados</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {detailComprobantes.map(c => (
                                                    <div key={c.id} style={{
                                                        padding: '0.75rem', borderRadius: 10,
                                                        border: '1px solid #e2e8f0', background: '#fafbfd',
                                                        display: 'flex', alignItems: 'center', gap: 12,
                                                    }}>
                                                        <div style={{
                                                            width: 36, height: 36, borderRadius: 8,
                                                            background: c.estado === 'inyectado' ? '#f0fdf4' : c.estado === 'aprobado' ? '#eff6ff' : '#f8f9fc',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0,
                                                        }}>
                                                            <FileText size={16} color={c.estado === 'inyectado' ? '#10b981' : c.estado === 'aprobado' ? '#1958E0' : '#94a3b8'} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                                                                {c.tipo_comprobante || 'Comprobante'} {c.numero_comprobante && `#${c.numero_comprobante}`}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                                {new Date(c.fecha).toLocaleDateString('es-AR')} · {c.estado}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', flexShrink: 0 }}>
                                                            ${Number(c.monto_ars || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                        </div>
                                                        {c.pdf_url && (
                                                            <a
                                                                href={c.pdf_url.trim()}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                                                    background: '#eff6ff', border: '1px solid #bfdbfe',
                                                                }}
                                                                title="Ver PDF"
                                                            >
                                                                <Eye size={14} color="#2563eb" />
                                                            </a>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Animations */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
