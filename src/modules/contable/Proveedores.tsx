import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Search, Plus, Edit2, AlertTriangle, X, Save, Trash2, Loader, Globe, ChevronDown, ChevronRight, Download, Clock, FileText, Filter, Eye, Send, Star, MoreVertical, RefreshCw } from 'lucide-react';
import { SkeletonTable } from '../../shared/components/SkeletonKit';
import { DocumentViewer } from '../../shared/components/DocumentViewer';

// --- Types ---

interface Proveedor {
    id: string;
    cuit: string | null;
    razon_social: string;
    es_caso_rojo: boolean;
    es_favorito: boolean;
    activo: boolean;
    producto_servicio_default: { id: string; nombre: string; grupo: string } | null;
    condicion_fiscal: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    observaciones: string | null;
    categoria_default: { id: string; nombre: string; color: string; tipo: string; } | null;
}

interface ProductoServicio {
    id: string;
    nombre: string;
    grupo: string | null;
    tipo: string;
}

interface Categoria {
    id: string;
    nombre: string;
    tipo: 'ingreso' | 'gasto' | 'ambos';
    color: string;
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
    monto_original: number;
    estado: string;
    descripcion: string | null;
    pdf_url: string | null;
    cuit_emisor: string | null;
    cuit_receptor: string | null;
    source: string | null;
    created_at: string;
    observaciones: string | null;
    is_op?: boolean;
    op_monto_retenciones?: number;
    op_monto_bruto?: number;
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
    categoria_default_id: string;
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
    categoria_default_id: '',
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
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [productos, setProductos] = useState<ProductoServicio[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
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
    const [detailContactos, setDetailContactos] = useState<{ id: string; nombre: string; apellido: string | null; email: string | null; telefono: string | null; cargo: string | null }[]>([]);
    const [syncingProveedores, setSyncingProveedores] = useState(false);
    const tenantModules = (tenant?.enabled_modules as string[]) || [];
    const hasErpModule = tenantModules.includes('erp_colppy') || tenantModules.includes('erp_xubio');
    const [expandedComprobante, setExpandedComprobante] = useState<string | null>(null);
    const [docPreview, setDocPreview] = useState<string | null>(null);
    const [activityFilter, setActivityFilter] = useState<'all' | 'recent' | 'month' | 'dormant' | 'none'>('all');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
    const [productoFilter, setProductoFilter] = useState<string>('');
    const [showProdFilterDrop, setShowProdFilterDrop] = useState(false);
    const [prodFilterSearch, setProdFilterSearch] = useState('');
    const [condicionFilter, setCondicionFilter] = useState<string>('');
    const [casoRojoFilter, setCasoRojoFilter] = useState<'all' | 'si' | 'no'>('all');
    const [categoriaFilter, setCategoriaFilter] = useState<string>('');

    // Pagination state
    const [visibleCount, setVisibleCount] = useState(50);

    // Reset pagination on filter change
    useEffect(() => {
        setVisibleCount(50);
    }, [busqueda, productoFilter, condicionFilter, casoRojoFilter, activityFilter, categoriaFilter]);



    useEffect(() => {
        if (!tenant) return;
        load();
    }, [tenant]);

    // Auto-open detail if navigated with ?id=
    useEffect(() => {
        const idParam = searchParams.get('id');
        if (idParam && proveedores.length > 0 && !selectedProvider) {
            const p = proveedores.find(x => x.id === idParam);
            if (p) {
                openDetail(p);
                // Clear the id from URL so it doesn't reopen on close
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('id');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [searchParams, proveedores, selectedProvider, setSearchParams]);

    async function load() {
        setLoading(true);
        const [{ data: provs }, { data: prods }, { data: cats }] = await Promise.all([
            supabase.from('contable_proveedores')
                .select('id, cuit, razon_social, es_caso_rojo, es_favorito, activo, condicion_fiscal, telefono, email, direccion, observaciones, producto_servicio_default:contable_productos_servicio(id, nombre, grupo), categoria_default:contable_categorias(id, nombre, color, tipo)')
                .eq('tenant_id', tenant!.id)
                .eq('activo', true)
                .order('es_favorito', { ascending: false })
                .order('razon_social'),
            supabase.from('contable_productos_servicio')
                .select('id, nombre, grupo, tipo')
                .eq('tenant_id', tenant!.id)
                .eq('activo', true)
                .order('grupo', { nullsFirst: false })
                .order('nombre'),
            supabase.from('contable_categorias')
                .select('id, nombre, tipo, color')
                .eq('tenant_id', tenant!.id)
                .order('nombre')
        ]);
        setProveedores((provs || []) as unknown as Proveedor[]);
        setProductos((prods || []) as ProductoServicio[]);
        setCategorias((cats || []) as Categoria[]);

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
        const [{ data: facturas }, { data: ordenes }] = await Promise.all([
            supabase
                .from('contable_comprobantes')
                .select('id, fecha, tipo_comprobante, numero_comprobante, monto_ars, monto_original, estado, descripcion, pdf_url, cuit_emisor, cuit_receptor, source, created_at, observaciones')
                .eq('proveedor_id', p.id)
                .order('fecha', { ascending: false })
                .limit(20),
            
            supabase
                .from('tesoreria_ordenes_pago')
                .select('id, numero_op, fecha, estado, monto_neto, monto_bruto, monto_retenciones, archivo_url, created_at')
                .eq('proveedor_id', p.id)
                .order('fecha', { ascending: false })
                .limit(20)
        ]);

        let combined: ComprobanteResumen[] = [];
        
        if (facturas) {
            combined = combined.concat(facturas.map(f => ({ ...f, is_op: false })));
        }
        
        if (ordenes) {
            combined = combined.concat(ordenes.map(o => ({
                id: o.id,
                fecha: o.fecha,
                tipo_comprobante: 'Orden de Pago',
                numero_comprobante: o.numero_op,
                monto_ars: o.monto_neto,
                monto_original: o.monto_neto,
                estado: o.estado,
                descripcion: 'Pago a Proveedor',
                pdf_url: o.archivo_url,
                cuit_emisor: null,
                cuit_receptor: null,
                source: null,
                created_at: o.created_at,
                observaciones: null,
                is_op: true,
                op_monto_retenciones: o.monto_retenciones,
                op_monto_bruto: o.monto_bruto
            })));
        }

        combined.sort((a, b) => {
            if (a.fecha !== b.fecha) return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setDetailComprobantes(combined.slice(0, 30));

        // Load linked contacts
        const { data: contactos } = await supabase
            .from('crm_contactos')
            .select('id, nombre, apellido, email, telefono, cargo')
            .eq('proveedor_id', p.id)
            .eq('activo', true)
            .order('nombre');
        setDetailContactos(contactos || []);
        setDetailLoading(false);
    }

    function formatTimeAgo(dateStr: string | null): { text: string; color: string } {
        if (!dateStr) return { text: 'Sin actividad', color: '#f43f5e' };
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) return { text: `Hoy`, color: '#10b981' };
        if (diff === 0) return { text: `Hoy`, color: '#10b981' };
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
            categoria_default_id: p.categoria_default?.id || '',
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
            categoria_default_id: form.categoria_default_id || null,
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

    async function toggleFavorito(id: string, current: boolean) {
        await supabase.from('contable_proveedores').update({ es_favorito: !current }).eq('id', id);
        setProveedores(prev => prev.map(p => p.id === id ? { ...p, es_favorito: !current } : p));
    }

    // --- Derived data ---

    const hasActiveFilters = productoFilter !== '' || condicionFilter !== '' || casoRojoFilter !== 'all' || activityFilter !== 'all';

    const filtered = proveedores.filter(p => {
        // Text search
        if (busqueda) {
            const q = busqueda.toLowerCase();
            if (!p.razon_social.toLowerCase().includes(q) && !(p.cuit || '').includes(busqueda)) return false;
        }
        // Producto/Servicio filter
        if (productoFilter) {
            const prod = p.producto_servicio_default as ProductoServicio | null;
            if (productoFilter === '__none__') {
                if (prod) return false;
            } else {
                if (!prod || prod.id !== productoFilter) return false;
            }
        }
        // Condición fiscal filter
        if (condicionFilter) {
            if (condicionFilter === '__none__') {
                if (p.condicion_fiscal) return false;
            } else {
                if (p.condicion_fiscal !== condicionFilter) return false;
            }
        }
        // Categoria filter
        if (categoriaFilter) {
            if (categoriaFilter === '__none__') {
                if (p.categoria_default) return false;
            } else {
                if (p.categoria_default?.id !== categoriaFilter) return false;
            }
        }
        // Caso rojo filter
        if (casoRojoFilter === 'si' && !p.es_caso_rojo) return false;
        if (casoRojoFilter === 'no' && p.es_caso_rojo) return false;
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
    }).sort((a, b) => {
        // Favorites first, then alphabetical
        if (a.es_favorito && !b.es_favorito) return -1;
        if (!a.es_favorito && b.es_favorito) return 1;
        return a.razon_social.localeCompare(b.razon_social);
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

    // --- Sync proveedores ---
    const [showSyncMenu, setShowSyncMenu] = useState(false);
    const hasColppy = tenantModules.includes('erp_colppy');
    const hasXubio = tenantModules.includes('erp_xubio');
    const hasBothErps = hasColppy && hasXubio;

    const handleSyncProveedores = async (source?: 'colppy' | 'xubio') => {
        if (!tenant) return;

        // If both ERPs and no source selected, show menu
        if (hasBothErps && !source) {
            setShowSyncMenu(!showSyncMenu);
            return;
        }

        // If only one ERP, auto-select
        const selectedSource = source || (hasColppy ? 'colppy' : 'xubio');
        setShowSyncMenu(false);
        setSyncingProveedores(true);

        try {
            if (selectedSource === 'colppy') {
                const { getColpyService } = await import('../../services/ColpyService');
                const colpy = getColpyService(tenant.id);
                await colpy.loadConfig();
                if (!colpy.isConfigured) { alert('Colppy no está configurado.'); setSyncingProveedores(false); return; }
                const result = await colpy.syncProveedoresFromColpy();
                alert(`Colppy: ${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} errores` : ''}`);
            } else {
                const { getXubioService } = await import('../../services/XubioService');
                const xubio = getXubioService(tenant.id);
                await xubio.loadConfig();
                if (!xubio.isConfigured) { alert('Xubio no está configurado.'); setSyncingProveedores(false); return; }
                const result = await xubio.syncProveedoresFromXubio();
                alert(`Xubio: ${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} errores` : ''}`);
            }
            load();
        } catch (err: any) {
            console.error('Sync error:', err);
            alert('Error al sincronizar: ' + (err.message || 'Error desconocido'));
        }
        setSyncingProveedores(false);
    };

    // --- Render ---

    return (
        <>
            <div>
                {/* Header — standardized */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Proveedores</h1>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{proveedores.length} activos</span>
                    <div style={{ flex: 1 }} />
                    {hasErpModule && (
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-ghost" onClick={() => handleSyncProveedores()} disabled={syncingProveedores}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.8rem', borderRadius: 10 }}>
                                <RefreshCw size={14} className={syncingProveedores ? 'spin' : ''} />
                                {syncingProveedores ? 'Sincronizando...' : 'Sincronizar'}
                            </button>
                            {showSyncMenu && hasBothErps && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
                                    <button onClick={() => handleSyncProveedores('colppy')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Colppy
                                    </button>
                                    <button onClick={() => handleSyncProveedores('xubio')} style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                        Desde Xubio
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <button className="btn btn-secondary" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.8rem', borderRadius: 10 }}>
                        <Download size={14} /> CSV
                    </button>
                    <button className="btn btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: '0.8rem', borderRadius: 10 }}>
                        <Plus size={16} /> Nuevo proveedor
                    </button>
                </div>

                {/* Search & Filters */}
                <div className="card" style={{ padding: '0.75rem 1.25rem', marginBottom: '1.25rem' }}>
                    <div style={{ position: 'relative', marginBottom: '0.625rem' }}>
                        <Search size={14} color="var(--color-text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            className="form-input"
                            placeholder="Buscar por razón social o CUIT..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            style={{ paddingLeft: 32, height: 36, fontSize: '0.8rem' }}
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
                                        border: isActive ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                                        background: isActive ? 'var(--color-accent-dim)' : 'var(--color-bg-surface)',
                                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                        cursor: 'pointer', transition: 'all 0.15s ease',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    {f.icon && <span style={{ fontSize: '0.6rem' }}>{f.icon}</span>}
                                    {f.label}
                                    <span style={{
                                        fontSize: '0.65rem', fontWeight: 600,
                                        color: isActive ? '#fff' : 'var(--color-text-muted)',
                                        background: isActive ? 'var(--color-accent)' : 'var(--color-bg-surface-2)',
                                        padding: '0 0.35rem', borderRadius: 99, minWidth: 18, textAlign: 'center',
                                    }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Advanced filters row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {/* Producto/Servicio custom folder dropdown */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => { setShowProdFilterDrop(!showProdFilterDrop); setProdFilterSearch(''); }}
                                style={{
                                    height: 32, fontSize: '0.75rem', padding: '0 0.75rem', minWidth: 200,
                                    borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                    border: productoFilter ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                                    background: productoFilter ? 'var(--color-accent-dim)' : 'var(--color-bg-surface)',
                                    color: productoFilter ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                    fontWeight: productoFilter ? 600 : 400,
                                }}
                            >
                                📦 {productoFilter
                                    ? productoFilter === '__none__'
                                        ? 'Sin asignar'
                                        : (productos.find(p => p.id === productoFilter)?.nombre || 'Producto')
                                    : 'Producto/Servicio'
                                }
                                <ChevronDown size={12} style={{ marginLeft: 'auto' }} />
                            </button>

                            {showProdFilterDrop && (
                                <>
                                    <div onClick={() => setShowProdFilterDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, marginTop: 4,
                                        width: 300, maxHeight: 360, overflowY: 'auto',
                                        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 12,
                                        boxShadow: 'var(--shadow-md)', zIndex: 100,
                                    }}>
                                        {/* Search */}
                                        <div style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                                            <div style={{ position: 'relative' }}>
                                                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                <input
                                                    className="form-input"
                                                    placeholder="Buscar..."
                                                    value={prodFilterSearch}
                                                    onChange={e => setProdFilterSearch(e.target.value)}
                                                    autoFocus
                                                    style={{ paddingLeft: 28, height: 30, fontSize: '0.75rem' }}
                                                />
                                            </div>
                                        </div>

                                        {/* "Todos" option */}
                                        <div
                                            onClick={() => { setProductoFilter(''); setShowProdFilterDrop(false); }}
                                            style={{
                                                padding: '0.5rem 0.75rem', cursor: 'pointer',
                                                fontWeight: !productoFilter ? 700 : 400, fontSize: '0.8rem',
                                                background: !productoFilter ? 'rgba(25,88,224,0.06)' : 'transparent',
                                                color: !productoFilter ? '#1958E0' : '#334155',
                                                borderBottom: '1px solid #f1f5f9',
                                            }}
                                        >📦 Todos</div>

                                        {/* "Sin asignar" option */}
                                        <div
                                            onClick={() => { setProductoFilter('__none__'); setShowProdFilterDrop(false); }}
                                            style={{
                                                padding: '0.5rem 0.75rem', cursor: 'pointer',
                                                fontWeight: productoFilter === '__none__' ? 700 : 400, fontSize: '0.8rem',
                                                background: productoFilter === '__none__' ? 'rgba(25,88,224,0.06)' : 'transparent',
                                                color: productoFilter === '__none__' ? '#1958E0' : '#334155',
                                                borderBottom: '1px solid #e2e8f0',
                                            }}
                                        >⚠️ Sin asignar</div>

                                        {/* Folder groups */}
                                        {productFolders.map((folder, idx) => {
                                            const matchingItems = folder.items.filter(p =>
                                                !prodFilterSearch || p.nombre.toLowerCase().includes(prodFilterSearch.toLowerCase())
                                            );
                                            if (matchingItems.length === 0) return null;
                                            const isOpen = expandedFolders.has(folder.label) || !!prodFilterSearch;
                                            const hasSelected = matchingItems.some(p => p.id === productoFilter);
                                            return (
                                                <div key={folder.label}>
                                                    {idx > 0 && <div style={{ height: 1, background: '#e2e8f0' }} />}
                                                    <div
                                                        onClick={() => toggleFolder(folder.label)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '0.5rem 0.75rem', cursor: 'pointer',
                                                            background: hasSelected ? 'rgba(25,88,224,0.06)' : 'transparent',
                                                            transition: 'background 0.15s',
                                                        }}
                                                    >
                                                        {isOpen
                                                            ? <ChevronDown size={13} style={{ color: '#1958E0', flexShrink: 0 }} />
                                                            : <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                        }
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>{folder.label}</span>
                                                        <span style={{
                                                            marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600,
                                                            color: '#fff', background: hasSelected ? '#1958E0' : '#94a3b8',
                                                            padding: '0 0.4rem', borderRadius: 99, minWidth: 18, textAlign: 'center',
                                                        }}>{matchingItems.length}</span>
                                                    </div>
                                                    {isOpen && (
                                                        <div style={{ padding: '0.25rem 0.75rem 0.5rem 2rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', background: '#fafbfc', borderTop: '1px solid #f1f5f9' }}>
                                                            {matchingItems.map(p => {
                                                                const sel = productoFilter === p.id;
                                                                return (
                                                                    <button
                                                                        key={p.id} type="button"
                                                                        onClick={() => { setProductoFilter(sel ? '' : p.id); setShowProdFilterDrop(false); }}
                                                                        style={{
                                                                            padding: '0.2rem 0.55rem', borderRadius: 14,
                                                                            fontSize: '0.72rem', fontWeight: sel ? 600 : 400,
                                                                            border: sel ? '2px solid #1958E0' : '1px solid #cbd5e1',
                                                                            background: sel ? '#1958E0' : '#f1f5f9',
                                                                            color: sel ? '#fff' : '#334155',
                                                                            cursor: 'pointer', transition: 'all 0.15s',
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
                                            .filter(p => !prodFilterSearch || p.nombre.toLowerCase().includes(prodFilterSearch.toLowerCase()))
                                            .map((p, idx) => {
                                                const sel = productoFilter === p.id;
                                                return (
                                                    <div key={p.id}>
                                                        {(productFolders.length > 0 || idx > 0) && <div style={{ height: 1, background: '#f1f5f9' }} />}
                                                        <div
                                                            onClick={() => { setProductoFilter(sel ? '' : p.id); setShowProdFilterDrop(false); }}
                                                            style={{
                                                                padding: '0.45rem 0.75rem', cursor: 'pointer',
                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                background: sel ? 'rgba(25,88,224,0.06)' : 'transparent',
                                                                transition: 'background 0.15s',
                                                                fontSize: '0.78rem', fontWeight: sel ? 600 : 400,
                                                                color: sel ? '#1958E0' : '#334155',
                                                            }}
                                                        >{p.nombre}</div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </>
                            )}
                        </div>

                        <select
                            className="form-input"
                            value={condicionFilter}
                            onChange={e => setCondicionFilter(e.target.value)}
                            style={{ height: 32, fontSize: '0.75rem', padding: '0 0.5rem', minWidth: 180, maxWidth: 220, borderRadius: 8 }}
                        >
                            <option value="">Cond. Fiscal: Todas</option>
                            <option value="__none__">⚠️ Sin definir</option>
                            {CONDICIONES_FISCALES.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>

                        <select
                            className="form-input"
                            value={categoriaFilter}
                            onChange={e => setCategoriaFilter(e.target.value)}
                            style={{ height: 32, fontSize: '0.75rem', padding: '0 0.5rem', minWidth: 160, maxWidth: 220, borderRadius: 8, border: categoriaFilter ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', background: categoriaFilter ? 'var(--color-accent-dim)' : 'var(--color-bg-surface)', color: categoriaFilter ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
                        >
                            <option value="">Categoría: Todas</option>
                            <option value="__none__">⚠️ Sin asignar</option>
                            {categorias.filter(c => c.tipo !== 'ingreso').map(c => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                        </select>

                        <select
                            className="form-input"
                            value={casoRojoFilter}
                            onChange={e => setCasoRojoFilter(e.target.value as 'all' | 'si' | 'no')}
                            style={{ height: 32, fontSize: '0.75rem', padding: '0 0.5rem', minWidth: 130, maxWidth: 160, borderRadius: 8 }}
                        >
                            <option value="all">Caso Rojo: Todos</option>
                            <option value="si">🔴 Solo caso rojo</option>
                            <option value="no">✅ Sin caso rojo</option>
                        </select>

                        {hasActiveFilters && (
                            <button
                                onClick={() => { setActivityFilter('all'); setProductoFilter(''); setCondicionFilter(''); setCasoRojoFilter('all'); }}
                                style={{
                                    padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600,
                                    border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                <X size={12} /> Limpiar filtros
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {loading ? (
                        <SkeletonTable rows={6} columns={4} />
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                {busqueda ? 'Sin resultados' : 'Sin proveedores aún'}
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {busqueda ? 'Probá con otra búsqueda' : 'Agregá proveedores manualmente o sincronizá desde tu ERP (Xubio/Colpy)'}
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
                                        <th>Cond. Fiscal</th>
                                        <th>Contacto</th>
                                        <th>Actividad</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.slice(0, visibleCount).map(p => {
                                        const stats = providerStats.get(p.id);
                                        const activity = formatTimeAgo(stats?.ultima_actividad ?? null);
                                        return (
                                            <tr key={p.id} style={{ cursor: 'default' }}>
                                                <td style={{ fontWeight: 600 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleFavorito(p.id, p.es_favorito); }}
                                                            style={{
                                                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                                color: p.es_favorito ? '#f59e0b' : '#d1d5db',
                                                                transition: 'color 0.15s', flexShrink: 0,
                                                            }}
                                                            title={p.es_favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                                        >
                                                            <Star size={14} fill={p.es_favorito ? '#f59e0b' : 'none'} />
                                                        </button>
                                                        {p.es_caso_rojo && <AlertTriangle size={14} color="var(--warning)" style={{ flexShrink: 0 }} />}
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.razon_social}</span>
                                                        {p.es_caso_rojo && (
                                                            <span className="badge badge-warning" style={{ fontSize: '0.6rem', flexShrink: 0 }}>ROJO</span>
                                                        )}
                                                        {(p.producto_servicio_default as ProductoServicio | null)?.grupo && (
                                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 99, background: 'rgba(13, 148, 136, 0.1)', color: '#0d9488', border: '1px solid rgba(13, 148, 136, 0.2)', flexShrink: 0 }}>
                                                                {(p.producto_servicio_default as ProductoServicio | null)!.grupo}
                                                            </span>
                                                        )}
                                                        {p.categoria_default && (
                                                            <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: 99, background: `${p.categoria_default.color}15`, color: p.categoria_default.color, border: `1px solid ${p.categoria_default.color}30`, flexShrink: 0 }}>
                                                                {p.categoria_default.nombre}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: p.cuit ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                                    {p.cuit || 'Sin CUIT'}
                                                </td>
                                                <td style={{ fontSize: '0.8rem', color: p.condicion_fiscal ? 'var(--text-sub)' : 'var(--text-faint)' }}>
                                                    {p.condicion_fiscal || '—'}
                                                </td>
                                                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {p.email || p.telefono || '—'}
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
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                console.log('[Proveedores] 3-dot clicked for:', p.razon_social, 'current menuOpenId:', menuOpenId);
                                                                if (menuOpenId === p.id) { setMenuOpenId(null); return; }
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const top = rect.bottom + 4;
                                                                const left = rect.right - 200; // align menu right edge with button right edge
                                                                console.log('[Proveedores] Opening menu at:', { top, left });
                                                                setMenuPos({ top, left });
                                                                setMenuOpenId(p.id);
                                                            }}
                                                            style={{ padding: '0.4rem', borderRadius: 8, border: 'none', background: menuOpenId === p.id ? '#f1f5f9' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                                        >
                                                            <MoreVertical size={16} />
                                                        </button>
                                                        {menuOpenId === p.id && createPortal(
                                                            <>
                                                                <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setMenuOpenId(null)} />
                                                                <div style={{
                                                                    position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999,
                                                                    background: '#ffffff', borderRadius: 12,
                                                                    border: '1px solid #e2e8f0',
                                                                    boxShadow: '0 12px 32px rgba(0,0,0,0.18)', minWidth: 200,
                                                                    padding: '0.4rem',
                                                                }}>
                                                                    <button
                                                                        onClick={() => { setMenuOpenId(null); openDetail(p); }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                                            padding: '0.55rem 0.75rem', border: 'none', background: 'none',
                                                                            cursor: 'pointer', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
                                                                            color: '#1e293b', fontFamily: 'var(--font-sans)',
                                                                        }}
                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                                    >
                                                                        <Eye size={15} color="#6366f1" /> Ver detalle
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setMenuOpenId(null); openEdit(p); }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                                            padding: '0.55rem 0.75rem', border: 'none', background: 'none',
                                                                            cursor: 'pointer', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
                                                                            color: '#1e293b', fontFamily: 'var(--font-sans)',
                                                                        }}
                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                                    >
                                                                        <Edit2 size={15} color="#3b82f6" /> Editar proveedor
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setMenuOpenId(null); navigate(`/contable/comprobantes?tab=upload&proveedor_id=${p.id}`); }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                                            padding: '0.55rem 0.75rem', border: 'none', background: 'none',
                                                                            cursor: 'pointer', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
                                                                            color: '#1e293b', fontFamily: 'var(--font-sans)',
                                                                        }}
                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                                    >
                                                                        <Send size={15} color="#10b981" /> Cargar factura
                                                                    </button>
                                                                    <div style={{ height: 1, background: '#e2e8f0', margin: '0.25rem 0.5rem' }} />
                                                                    <button
                                                                        onClick={() => { setMenuOpenId(null); handleDelete(p.id); }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                                            padding: '0.55rem 0.75rem', border: 'none', background: 'none',
                                                                            cursor: 'pointer', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
                                                                            color: '#ef4444', fontFamily: 'var(--font-sans)',
                                                                        }}
                                                                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                                    >
                                                                        <Trash2 size={15} /> Eliminar
                                                                    </button>
                                                                </div>
                                                            </>,
                                                            document.body
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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

                {/* Modal: Nuevo / Editar Proveedor */}
                {showModal && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    }} onClick={() => setShowModal(false)}>
                        <div
                            style={{
                                width: 680, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                                background: 'var(--bg-main, #fff)', borderRadius: 16, overflow: 'hidden',
                                boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* ── Sticky Header ── */}
                            <div style={{
                                padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                            }}>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main, #0f172a)', margin: 0, letterSpacing: '-0.01em' }}>
                                        {editando ? '✏️ Editar Proveedor' : '➕ Nuevo Proveedor'}
                                    </h3>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', marginTop: 2, margin: 0 }}>
                                        {editando ? `Editando: ${editando.razon_social}` : 'Completá los datos del proveedor'}
                                    </p>
                                </div>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)} style={{ borderRadius: 99 }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* ── Scrollable Body ── */}
                            <div className="modal-scroll-body" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

                                {/* ARCA Search — only for new */}
                                {!editando && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(59,130,246,0.06))',
                                        border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12,
                                        padding: '1rem 1.25rem', marginBottom: '1.25rem',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                                            <Globe size={16} color="#6366f1" />
                                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>Buscar en ARCA</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>Autocompletar datos fiscales</span>
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
                                        {arcaError && (
                                            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.78rem', color: '#dc2626' }}>
                                                {arcaError}
                                            </div>
                                        )}
                                        {arcaResult && (
                                            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem', color: 'var(--text-main)' }}>{arcaResult.name}</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                                                    <div>📍 {arcaResult.address}</div>
                                                    <div>🏛️ {arcaResult.jurisdiction}</div>
                                                    <div style={{ gridColumn: '1 / -1' }}>📋 {arcaResult.taxCondition}</div>
                                                </div>
                                                {form.razon_social !== arcaResult.name && (
                                                    <button className="btn btn-primary" onClick={applyArcaData} style={{ marginTop: '0.5rem', fontSize: '0.72rem', padding: '0.25rem 0.7rem' }}>
                                                        Usar esta razón social
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Section: Identidad ── */}
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                                        Identidad
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group" style={{ marginBottom: 0, gridColumn: editando ? '1' : '1 / -1' }}>
                                            <label className="form-label">Razón Social *</label>
                                            <input className="form-input" value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} placeholder="Ej: GOOGLE CLOUD ARGENTINA SRL" />
                                        </div>
                                        {editando && (
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <label className="form-label">CUIT</label>
                                                <input className="form-input" value={form.cuit} onChange={e => setForm({ ...form, cuit: e.target.value })} placeholder="Ej: 30-12345678-9" style={{ fontFamily: 'monospace' }} />
                                            </div>
                                        )}
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Condición Fiscal</label>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <select className="form-input" value={form.condicion_fiscal} onChange={e => setForm({ ...form, condicion_fiscal: e.target.value })} style={{ flex: 1 }}>
                                                    <option value="">Sin definir</option>
                                                    {CONDICIONES_FISCALES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                {(() => {
                                                    const sug = sugerirTipoFactura('Responsable Inscripto', form.condicion_fiscal);
                                                    if (!sug) return null;
                                                    return (
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem', borderRadius: 99, fontSize: '0.68rem',
                                                            fontWeight: 700, background: `${sug.color}15`, color: sug.color,
                                                            border: `1.5px solid ${sug.color}40`, whiteSpace: 'nowrap', flexShrink: 0,
                                                        }}>
                                                            {sug.label}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input type="checkbox" id="caso-rojo-modal" checked={form.es_caso_rojo} onChange={e => setForm({ ...form, es_caso_rojo: e.target.checked })} />
                                            <label htmlFor="caso-rojo-modal" style={{ fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                                                <AlertTriangle size={14} color="var(--warning)" /> Caso rojo
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Section: Clasificación ── */}
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                                        Clasificación Contable
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">Categoría Default</label>
                                        <select
                                            className="form-input"
                                            value={form.categoria_default_id}
                                            onChange={e => setForm({ ...form, categoria_default_id: e.target.value })}
                                        >
                                            <option value="">Seleccione una categoría</option>
                                            {categorias.filter(c => c.tipo !== 'ingreso').map(c => (
                                                <option key={c.id} value={c.id}>{c.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Producto/Servicio Default</label>
                                        <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
                                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input
                                                className="form-input"
                                                placeholder="Buscar producto/servicio..."
                                                value={prodFilter}
                                                onChange={e => setProdFilter(e.target.value)}
                                                style={{ paddingLeft: 32, height: 36, fontSize: '0.78rem' }}
                                            />
                                        </div>
                                        <div style={{
                                            maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-subtle, #cbd5e1)',
                                            borderRadius: 10, background: 'var(--bg-subtle, #f8f9fc)',
                                        }}>
                                            {productFolders.map((folder, idx) => {
                                                const matchingItems = folder.items.filter(p =>
                                                    !prodFilter || p.nombre.toLowerCase().includes(prodFilter.toLowerCase())
                                                );
                                                if (matchingItems.length === 0) return null;
                                                const isOpen = expandedFolders.has(folder.label) || !!prodFilter;
                                                const hasSelected = matchingItems.some(p => p.id === form.producto_servicio_default_id);
                                                return (
                                                    <div key={folder.label}>
                                                        {idx > 0 && <div style={{ height: 1, background: 'var(--border-subtle, #e2e8f0)' }} />}
                                                        <div
                                                            onClick={() => toggleFolder(folder.label)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                padding: '0.5rem 0.75rem', cursor: 'pointer',
                                                                background: hasSelected ? 'rgba(25,88,224,0.06)' : 'transparent',
                                                                transition: 'background 0.15s',
                                                            }}
                                                        >
                                                            {isOpen
                                                                ? <ChevronDown size={13} style={{ color: '#1958E0', flexShrink: 0 }} />
                                                                : <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                            }
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{folder.label}</span>
                                                            <span style={{
                                                                marginLeft: 'auto', fontSize: '0.62rem', fontWeight: 600,
                                                                color: '#fff', background: hasSelected ? '#1958E0' : '#94a3b8',
                                                                padding: '0 0.4rem', borderRadius: 99, minWidth: 18, textAlign: 'center',
                                                            }}>{matchingItems.length}</span>
                                                        </div>
                                                        {isOpen && (
                                                            <div style={{
                                                                padding: '0.3rem 0.75rem 0.4rem 2rem',
                                                                display: 'flex', flexWrap: 'wrap', gap: '0.25rem',
                                                                background: 'var(--bg-main, #fff)', borderTop: '1px solid var(--border-subtle, #e2e8f0)',
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
                                                                                padding: '0.2rem 0.55rem', borderRadius: 12,
                                                                                fontSize: '0.72rem', fontWeight: sel ? 600 : 400,
                                                                                border: sel ? '2px solid var(--brand, #1958E0)' : '1px solid var(--border-subtle, #cbd5e1)',
                                                                                background: sel ? 'var(--brand, #1958E0)' : 'var(--bg-subtle, #f1f5f9)',
                                                                                color: sel ? '#fff' : 'var(--text-main, #334155)',
                                                                                cursor: 'pointer', transition: 'all 0.15s',
                                                                            }}
                                                                        >{p.nombre}</button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {productStandalones
                                                .filter(p => !prodFilter || p.nombre.toLowerCase().includes(prodFilter.toLowerCase()))
                                                .map((p, idx) => {
                                                    const sel = form.producto_servicio_default_id === p.id;
                                                    return (
                                                        <div key={p.id}>
                                                            {(productFolders.length > 0 || idx > 0) && <div style={{ height: 1, background: 'var(--border-subtle, #e2e8f0)' }} />}
                                                            <div
                                                                onClick={() => setForm(prev => ({
                                                                    ...prev,
                                                                    producto_servicio_default_id: sel ? '' : p.id,
                                                                }))}
                                                                style={{
                                                                    padding: '0.5rem 0.75rem', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                                    background: sel ? 'rgba(25,88,224,0.06)' : 'transparent',
                                                                    transition: 'background 0.15s',
                                                                }}
                                                            >
                                                                {sel
                                                                    ? <div style={{ width: 14, height: 14, borderRadius: 99, background: 'var(--brand, #1958E0)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        <div style={{ width: 6, height: 6, borderRadius: 99, background: '#fff' }} />
                                                                    </div>
                                                                    : <div style={{ width: 14, height: 14, borderRadius: 99, border: '2px solid var(--border-subtle, #cbd5e1)', flexShrink: 0 }} />
                                                                }
                                                                <span style={{
                                                                    fontSize: '0.78rem', fontWeight: sel ? 600 : 400,
                                                                    color: sel ? 'var(--brand, #1958E0)' : 'var(--text-main, #334155)',
                                                                }}>{p.nombre}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            }
                                            {productos.length === 0 && (
                                                <div style={{ padding: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                                                    No hay productos/servicios configurados
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── Section: Contacto ── */}
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                                        Contacto
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Teléfono</label>
                                            <input className="form-input" placeholder="+54 11 1234-5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Email</label>
                                            <input className="form-input" type="email" placeholder="proveedor@mail.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                                            <label className="form-label">Dirección</label>
                                            <input className="form-input" placeholder="Domicilio fiscal" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                {/* ── Section: Notas ── */}
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                                        Notas
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <textarea
                                            className="form-input"
                                            placeholder="Notas internas sobre este proveedor..."
                                            value={form.observaciones}
                                            onChange={e => setForm({ ...form, observaciones: e.target.value })}
                                            rows={2}
                                            style={{ resize: 'vertical' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* ── Sticky Footer ── */}
                            <div style={{
                                padding: '1rem 1.5rem', borderTop: '1px solid var(--border-subtle, #e2e8f0)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                                background: 'var(--bg-subtle, #f8fafc)',
                            }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    {editando ? 'Los cambios se aplican inmediatamente' : 'Se creará con estado activo'}
                                </span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                                    <button className="btn btn-primary" onClick={handleSave} disabled={!form.razon_social.trim()} style={{ gap: 6 }}>
                                        <Save size={14} /> {editando ? 'Guardar cambios' : 'Crear proveedor'}
                                    </button>
                                </div>
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
                            width: 480, maxWidth: '90vw', height: '100vh', background: 'var(--color-bg-surface)',
                            boxShadow: 'var(--shadow-lg)', overflowY: 'auto',
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
                                            {selectedProvider.telefono && <span style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard.writeText(selectedProvider!.telefono!); }} title="Click para copiar">📞 {selectedProvider.telefono}</span>}
                                            {selectedProvider.email && <span style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard.writeText(selectedProvider!.email!); }} title="Click para copiar">✉️ {selectedProvider.email}</span>}
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
                                            <div style={{ padding: '0.75rem', borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border)' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 4 }}>COMPROBANTES</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{stats?.total_comprobantes || 0}</div>
                                            </div>
                                            <div style={{ padding: '0.75rem', borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border)' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 600, marginBottom: 4 }}>TOTAL ARS</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                    ${Number(stats?.monto_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                                                </div>
                                            </div>
                                            <div style={{ padding: '0.75rem', borderRadius: 10, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border)' }}>
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
                                                    {detailComprobantes.map(c => {
                                                        const expanded = expandedComprobante === c.id;
                                                        const isOp = !!c.is_op;
                                                        
                                                        // Styles based on type
                                                        const iconContainerBg = isOp ? '#fdf4ff' : (c.estado === 'pagado' ? '#f0fdf4' : c.estado === 'aprobado' ? '#eff6ff' : c.estado === 'pendiente' ? '#fffbeb' : '#f8f9fc');
                                                        const iconColor = isOp ? '#d946ef' : (c.estado === 'pagado' ? '#10b981' : c.estado === 'aprobado' ? '#3B82F6' : c.estado === 'pendiente' ? '#F59E0B' : '#94a3b8');
                                                        const itemBg = isOp ? (expanded ? '#faf5ff' : '#fdfbff') : (expanded ? '#f0f4ff' : '#fafbfd');
                                                        
                                                        return (
                                                            <div key={`${c.id}-${isOp ? 'op' : 'comp'}`} style={{ borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                                <div
                                                                    onClick={() => setExpandedComprobante(expanded ? null : c.id)}
                                                                    style={{
                                                                        padding: '0.75rem', background: itemBg,
                                                                        display: 'flex', alignItems: 'center', gap: 12,
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    <div style={{
                                                                        width: 36, height: 36, borderRadius: 8,
                                                                        background: iconContainerBg,
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        flexShrink: 0,
                                                                    }}>
                                                                        {isOp ? <Send size={16} color={iconColor} /> : <FileText size={16} color={iconColor} />}
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                                                                            {c.tipo_comprobante || (isOp ? 'Orden de Pago' : 'Comprobante')} {c.numero_comprobante && `#${c.numero_comprobante}`}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                                            {new Date(c.fecha).toLocaleDateString('es-AR')} · <span style={{ color: isOp ? '#d946ef' : '' }}>{c.estado}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', flexShrink: 0 }}>
                                                                        {isOp ? '-' : ''}${Number(c.monto_ars || c.monto_original || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                                    </div>
                                                                    {c.pdf_url && (
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); setDocPreview(c.pdf_url!.trim()); }}
                                                                            style={{
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                                                                background: '#eff6ff', border: '1px solid #bfdbfe',
                                                                                cursor: 'pointer',
                                                                            }}
                                                                            title="Ver documento adjunto"
                                                                        >
                                                                            <Eye size={14} color="#2563eb" />
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            const tipoStr = isOp ? 'Orden de Pago' : 'Comprobante';
                                                                            if (!confirm(`¿Eliminar ${tipoStr} ${c.numero_comprobante || ''}? Esta acción no se puede deshacer.`)) return;
                                                                            
                                                                            if (isOp) {
                                                                                await supabase.from('tesoreria_ordenes_pago').delete().eq('id', c.id);
                                                                            } else {
                                                                                await supabase.from('contable_comprobantes').delete().eq('id', c.id);
                                                                            }
                                                                            setDetailComprobantes(prev => prev.filter(x => x.id !== c.id));
                                                                        }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                                                            background: '#fef2f2', border: '1px solid #fecaca',
                                                                            cursor: 'pointer', transition: 'background 0.15s',
                                                                        }}
                                                                        title={isOp ? "Eliminar Orden de Pago" : "Eliminar comprobante"}
                                                                    >
                                                                        <X size={14} color="#ef4444" />
                                                                    </button>
                                                                    <ChevronDown size={16} color="#94a3b8" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                                </div>
                                                                {expanded && (
                                                                    <div style={{
                                                                        padding: '0.75rem 1rem', background: '#f8fafc',
                                                                        borderTop: '1px solid #e2e8f0',
                                                                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem',
                                                                        fontSize: '0.78rem',
                                                                    }}>
                                                                        {c.descripcion && (
                                                                            <div style={{ gridColumn: '1 / -1' }}>
                                                                                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Descripción</span>
                                                                                <div style={{ color: '#0f172a', marginTop: 1 }}>{c.descripcion}</div>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {isOp && (
                                                                             <>
                                                                                <div>
                                                                                    <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Monto Bruto</span>
                                                                                    <div style={{ color: '#0f172a', marginTop: 1 }}>${Number(c.op_monto_bruto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                                                                                </div>
                                                                                <div>
                                                                                    <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Total Retenciones</span>
                                                                                    <div style={{ color: '#ef4444', marginTop: 1 }}>-${Number(c.op_monto_retenciones || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                                                                                </div>
                                                                             </>
                                                                        )}

                                                                        {c.cuit_emisor && !isOp && (
                                                                            <div>
                                                                                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>CUIT Emisor</span>
                                                                                <div style={{ color: '#0f172a', fontFamily: 'monospace', marginTop: 1 }}>{c.cuit_emisor}</div>
                                                                            </div>
                                                                        )}
                                                                        {c.cuit_receptor && !isOp && (
                                                                            <div>
                                                                                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>CUIT Receptor</span>
                                                                                <div style={{ color: '#0f172a', fontFamily: 'monospace', marginTop: 1 }}>{c.cuit_receptor}</div>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {c.source && (
                                                                            <div>
                                                                                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Source</span>
                                                                                <div style={{ marginTop: 1 }}>
                                                                                    <span style={{
                                                                                        padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                                                                                        background: c.source === 'pdf_upload' ? '#eff6ff' : c.source === 'manual' ? '#f0fdf4' : '#fef3c7',
                                                                                        color: c.source === 'pdf_upload' ? '#2563eb' : c.source === 'manual' ? '#16a34a' : '#d97706',
                                                                                    }}>{c.source}</span>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Fecha Carga</span>
                                                                            <div style={{ color: '#0f172a', marginTop: 1 }}>{new Date(c.created_at).toLocaleString('es-AR')}</div>
                                                                        </div>
                                                                        {c.observaciones && (
                                                                            <div style={{ gridColumn: '1 / -1' }}>
                                                                                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Observaciones</span>
                                                                                <div style={{ color: '#0f172a', marginTop: 1, whiteSpace: 'pre-line' }}>{c.observaciones}</div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Contactos vinculados */}
                                        <div style={{ marginTop: '1.5rem' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Contactos ({detailContactos.length})
                                            </div>
                                            {detailContactos.length === 0 ? (
                                                <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
                                                    Sin contactos vinculados
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {detailContactos.map(ct => (
                                                        <div key={ct.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fafafa' }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
                                                                {ct.nombre} {ct.apellido || ''}
                                                            </div>
                                                            {ct.cargo && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>{ct.cargo}</div>}
                                                            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.75rem', color: '#64748b' }}>
                                                                {ct.email && <a href={`mailto:${ct.email}`} style={{ color: '#2563EB', textDecoration: 'none' }}>{ct.email}</a>}
                                                                {ct.telefono && <a href={`tel:${ct.telefono}`} style={{ color: '#2563EB', textDecoration: 'none' }}>{ct.telefono}</a>}
                                                            </div>
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
            </div >

            {/* Document Preview Modal */}
            {
                docPreview && (
                    <div
                        onClick={() => setDocPreview(null)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '2rem',
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                width: '90%', maxWidth: 900, height: '85vh',
                                background: 'var(--color-bg-surface)', borderRadius: 12,
                                display: 'flex', flexDirection: 'column',
                                boxShadow: 'var(--shadow-lg)',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{
                                padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: '#f8fafc',
                            }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>Vista previa de documento</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <a
                                        href={encodeURI(docPreview)}
                                        download
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', gap: 4 }}
                                    >
                                        <Download size={14} /> Descargar
                                    </a>
                                    <button
                                        onClick={() => setDocPreview(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            <DocumentViewer
                                url={docPreview}
                                style={{ flex: 1, width: '100%', height: '100%', background: '#fff' }}
                            />
                        </div>
                    </div>
                )
            }
        </>
    );
}
