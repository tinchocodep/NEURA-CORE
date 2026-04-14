import { useCallback, useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';

/* ─── Types ─────────────────────────────────────────── */
export type ComprobanteEstado = 'pendiente' | 'clasificado' | 'aprobado' | 'inyectado' | 'error' | 'rechazado' | 'pagado';

export interface Comprobante {
    id: string;
    tipo: 'compra' | 'venta';
    fecha: string;
    numero_comprobante: string;
    tipo_comprobante: string;
    monto_original: number;
    monto_ars: number;
    moneda: string;
    tipo_cambio: number | null;
    estado: ComprobanteEstado;
    clasificacion_score: number;
    descripcion: string | null;
    observaciones: string | null;
    pdf_url: string | null;
    source: string | null;
    cuit_emisor: string | null;
    cuit_receptor: string | null;
    created_at: string;
    fecha_vencimiento?: string | null;
    neto_gravado?: number | null;
    neto_no_gravado?: number | null;
    total_iva?: number | null;
    percepciones_iibb?: number | null;
    percepciones_iva?: number | null;
    colpy_synced_at?: string | null;
    proveedor_id: string | null;
    cliente_id: string | null;
    categoria_id?: string | null;
    centro_costo_id?: string | null;
    proyecto_id?: string | null;
    proveedor: { razon_social: string; producto_servicio_default_id: string | null; colpy_id?: string | null; xubio_id?: string | null; cuit?: string | null } | null;
    cliente: { razon_social: string; xubio_id?: string | null } | null;
    producto_servicio: { nombre: string; grupo: string } | null;
    categoria: { nombre: string; color: string } | null;
    centro_costo: { nombre: string } | null;
    proyecto: { name: string } | null;
}

const SELECT_FIELDS = `
  id, tipo, fecha, numero_comprobante, tipo_comprobante,
  monto_original, monto_ars, moneda, tipo_cambio,
  estado, clasificacion_score, descripcion, observaciones,
  pdf_url, source, cuit_emisor, cuit_receptor, created_at,
  fecha_vencimiento, neto_gravado, neto_no_gravado, total_iva,
  percepciones_iibb, percepciones_iva, colpy_synced_at,
  proveedor_id, cliente_id, categoria_id, centro_costo_id, proyecto_id,
  proveedor:contable_proveedores(razon_social, producto_servicio_default_id, colpy_id, xubio_id, cuit),
  cliente:contable_clientes(razon_social),
  producto_servicio:contable_productos_servicio(nombre, grupo),
  categoria:contable_categorias(nombre, color),
  centro_costo:contable_centros_costo(nombre),
  proyecto:treasury_projects(name)
`;

const DEFAULT_PAGE_SIZE = 25;

export interface ComprobantesFilters {
    tipo: string;
    estado: string;
    busqueda: string;
    fechaDesde: string;
    fechaHasta: string;
    sortCol?: string | null;
    sortDir?: 'asc' | 'desc';
    pageSize?: number;
}

export function useComprobantes(filters: ComprobantesFilters) {
    const { tenant } = useTenant();
    const [data, setData] = useState<Comprobante[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);

    const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const hasMore = currentPage < totalPages - 1;

    const buildQuery = useCallback(async (page: number) => {
        if (!tenant) return null;

        const from = page * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('contable_comprobantes')
            .select(SELECT_FIELDS, { count: 'exact' })
            .eq('tenant_id', tenant.id)
            .range(from, to);

        // Apply dynamic sorting
        if (filters.sortCol === 'fecha') {
            query = query.order('fecha', { ascending: filters.sortDir === 'asc' });
        }
        // Always fallback to created_at for stable pagination
        query = query.order('created_at', { ascending: false });

        if (filters.tipo && filters.tipo !== 'todos') query = query.eq('tipo', filters.tipo);
        if (filters.estado && filters.estado !== 'todos') query = query.eq('estado', filters.estado);
        if (filters.fechaDesde) query = query.gte('fecha', filters.fechaDesde);
        if (filters.fechaHasta) query = query.lte('fecha', filters.fechaHasta);

        if (filters.busqueda) {
            const searchTerm = `%${filters.busqueda}%`;

            // 1. Search matching entities first
            const [provRes, cliRes] = await Promise.all([
                supabase.from('contable_proveedores')
                    .select('id').eq('tenant_id', tenant.id).ilike('razon_social', searchTerm),
                supabase.from('contable_clientes')
                    .select('id').eq('tenant_id', tenant.id).ilike('razon_social', searchTerm)
            ]);

            const provIds = provRes.data?.map(p => p.id) || [];
            const cliIds = cliRes.data?.map(c => c.id) || [];

            // 2. Build the OR condition combining numero_comprobante and matching entity IDs
            const orConditions = [`numero_comprobante.ilike.${searchTerm}`];

            if (provIds.length > 0) {
                orConditions.push(`proveedor_id.in.(${provIds.join(',')})`);
            }
            if (cliIds.length > 0) {
                orConditions.push(`cliente_id.in.(${cliIds.join(',')})`);
            }

            query = query.or(orConditions.join(','));
        }

        return query;
    }, [tenant, filters.tipo, filters.estado, filters.busqueda, filters.fechaDesde, filters.fechaHasta, filters.sortCol, filters.sortDir, pageSize]);

    const isFetchingRef = useRef(false);

    const fetchPage = useCallback(async (page: number) => {
        if (!tenant || isFetchingRef.current) return;
        isFetchingRef.current = true;
        setIsLoading(true);

        const query = await buildQuery(page);
        if (!query) {
            setIsLoading(false);
            isFetchingRef.current = false;
            return;
        }

        const { data: rows, count, error } = await query;
        setIsLoading(false);
        isFetchingRef.current = false;

        if (error) { console.error('useComprobantes/fetchPage:', error); return; }

        const freshRows = (rows || []) as unknown as Comprobante[];
        setData(freshRows);
        setTotalCount(count || 0);
        setCurrentPage(page);

        // Background backfill: link producto_servicio from proveedor's default for comprobantes missing it
        const toBackfill = freshRows.filter(
            c => !c.producto_servicio && c.proveedor && (c.proveedor as any).producto_servicio_default_id
        );
        if (toBackfill.length > 0) {
            Promise.all(
                toBackfill.map(c =>
                    supabase
                        .from('contable_comprobantes')
                        .update({ producto_servicio_id: (c.proveedor as any).producto_servicio_default_id })
                        .eq('id', c.id)
                )
            ).then(async () => {
                const q = await buildQuery(page);
                if (q) {
                    const { data: refreshed } = await q;
                    if (refreshed) setData(refreshed as unknown as Comprobante[]);
                }
            });
        }
    }, [tenant, buildQuery]);

    const reset = useCallback(() => {
        setCurrentPage(0);
        fetchPage(0);
    }, [fetchPage]);

    const goToPage = useCallback((page: number) => {
        if (page < 0 || page >= totalPages) return;
        fetchPage(page);
    }, [fetchPage, totalPages]);

    const updateEstado = useCallback(async (id: string, estado: ComprobanteEstado) => {
        const payload: Record<string, unknown> = { estado };
        if (estado === 'inyectado') payload.inyectado_at = new Date().toISOString();
        const { error } = await supabase.from('contable_comprobantes').update(payload).eq('id', id);
        if (error) { console.error('updateEstado:', error); return false; }
        // Optimistically update in-place
        setData(prev => prev.map(c => c.id === id ? { ...c, estado } : c));
        return true;
    }, []);

    const updateClasificacion = useCallback(async (
        id: string,
        changes: { proyecto_id?: string | null; centro_costo_id?: string | null; categoria_id?: string | null }
    ) => {
        const { error } = await supabase.from('contable_comprobantes').update(changes).eq('id', id);
        if (error) { console.error('updateClasificacion:', error); return false; }
        const page = currentPageRef.current;
        const q = await buildQuery(page);
        if (q) {
            const { data: refreshed } = await q;
            if (refreshed) setData(refreshed as unknown as Comprobante[]);
        }
        return true;
    }, [buildQuery]);

    const eliminarComprobante = useCallback(async (id: string) => {
        const { error } = await supabase.from('contable_comprobantes').delete().eq('id', id);
        if (error) { console.error('eliminarComprobante:', error); return false; }
        // Optimistically remove and re-fetch current page
        setData(prev => prev.filter(c => c.id !== id));
        return true;
    }, []);

    const fetchPageRef = useRef(fetchPage);
    useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);
    const currentPageRef = useRef(currentPage);
    useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

    // Listen for real-time changes
    useEffect(() => {
        if (!tenant?.id) return;

        const channel = supabase.channel('use-comprobantes-list')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contable_comprobantes', filter: `tenant_id=eq.${tenant.id}` },
                () => {
                    fetchPageRef.current(currentPageRef.current);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tenant?.id]);

    return { data, totalCount, isLoading, hasMore, currentPage, totalPages, pageSize, goToPage, reset, updateEstado, eliminarComprobante, updateClasificacion };
}
