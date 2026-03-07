import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';

/* ─── Types ─────────────────────────────────────────── */
export type ComprobanteEstado = 'pendiente' | 'clasificado' | 'aprobado' | 'inyectado' | 'error' | 'rechazado';

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
    proveedor: { razon_social: string; producto_servicio_default_id: string | null } | null;
    cliente: { razon_social: string } | null;
    producto_servicio: { nombre: string; grupo: string } | null;
    categoria: { nombre: string; color: string } | null;
    centro_costo: { nombre: string } | null;
}

const SELECT_FIELDS = `
  id, tipo, fecha, numero_comprobante, tipo_comprobante,
  monto_original, monto_ars, moneda, tipo_cambio,
  estado, clasificacion_score, descripcion, observaciones,
  pdf_url, source, cuit_emisor, cuit_receptor, created_at,
  proveedor:contable_proveedores(razon_social, producto_servicio_default_id),
  cliente:contable_clientes(razon_social),
  producto_servicio:contable_productos_servicio(nombre, grupo),
  categoria:contable_categorias(nombre, color),
  centro_costo:contable_centros_costo(nombre)
`;

const PAGE_SIZE = 50;

export interface ComprobantesFilters {
    tipo: string;
    estado: string;
    busqueda: string;
    fechaDesde: string;
    fechaHasta: string;
}

export function useComprobantes(filters: ComprobantesFilters) {
    const { tenant } = useTenant();
    const [pages, setPages] = useState<Comprobante[][]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);

    const data = useMemo(() => pages.flat(), [pages]);

    const reset = useCallback(async () => {
        if (!tenant) return;
        setIsLoading(true);
        setPages([]);
        setLastCreatedAt(null);
        setHasMore(true);

        let query = supabase
            .from('contable_comprobantes')
            .select(SELECT_FIELDS, { count: 'exact' })
            .eq('tenant_id', tenant.id)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

        if (filters.tipo !== 'todos') query = query.eq('tipo', filters.tipo);
        if (filters.estado !== 'todos') query = query.eq('estado', filters.estado);
        if (filters.busqueda) {
            query = query.or(
                `numero_comprobante.ilike.%${filters.busqueda}%`
            );
        }
        if (filters.fechaDesde) query = query.gte('fecha', filters.fechaDesde);
        if (filters.fechaHasta) query = query.lte('fecha', filters.fechaHasta);

        const { data: rows, count, error } = await query;
        setIsLoading(false);
        if (error) { console.error('useComprobantes:', error); return; }

        const freshRows = (rows || []) as unknown as Comprobante[];
        setPages([freshRows]);
        setTotalCount(count || 0);
        if (freshRows.length < PAGE_SIZE) setHasMore(false);
        if (freshRows.length > 0) setLastCreatedAt(freshRows[freshRows.length - 1].created_at);

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
            ).then(() => {
                // Silently re-fetch to show linked products
                supabase
                    .from('contable_comprobantes')
                    .select(SELECT_FIELDS, { count: 'exact' })
                    .eq('tenant_id', tenant.id)
                    .order('fecha', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(PAGE_SIZE)
                    .then(({ data: refreshed }) => {
                        if (refreshed) setPages([(refreshed as unknown as Comprobante[])]);
                    });
            });
        }
    }, [tenant, filters.tipo, filters.estado, filters.busqueda, filters.fechaDesde, filters.fechaHasta]);

    const loadMore = useCallback(async () => {
        if (!tenant || isLoading || !hasMore || !lastCreatedAt) return;
        setIsLoading(true);

        let query = supabase
            .from('contable_comprobantes')
            .select(SELECT_FIELDS)
            .eq('tenant_id', tenant.id)
            .lt('created_at', lastCreatedAt)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

        if (filters.tipo !== 'todos') query = query.eq('tipo', filters.tipo);
        if (filters.estado !== 'todos') query = query.eq('estado', filters.estado);
        if (filters.fechaDesde) query = query.gte('fecha', filters.fechaDesde);
        if (filters.fechaHasta) query = query.lte('fecha', filters.fechaHasta);

        const { data: rows, error } = await query;
        setIsLoading(false);
        if (error) { console.error('loadMore:', error); return; }

        const newRows = (rows || []) as unknown as Comprobante[];
        if (newRows.length < PAGE_SIZE) setHasMore(false);
        if (newRows.length > 0) {
            setPages(prev => [...prev, newRows]);
            setLastCreatedAt(newRows[newRows.length - 1].created_at);
        }
    }, [tenant, isLoading, hasMore, lastCreatedAt, filters.tipo, filters.estado, filters.fechaDesde, filters.fechaHasta]);

    const updateEstado = useCallback(async (id: string, estado: ComprobanteEstado) => {
        const payload: Record<string, unknown> = { estado };
        if (estado === 'inyectado') payload.inyectado_at = new Date().toISOString();
        const { error } = await supabase.from('contable_comprobantes').update(payload).eq('id', id);
        if (error) { console.error('updateEstado:', error); return false; }
        // Optimistically update in-place
        setPages(prev => prev.map(page =>
            page.map(c => c.id === id ? { ...c, estado } : c)
        ));
        return true;
    }, []);

    const eliminarComprobante = useCallback(async (id: string) => {
        const { error } = await supabase.from('contable_comprobantes').delete().eq('id', id);
        if (error) { console.error('eliminarComprobante:', error); return false; }
        // Optimistically remove from state
        setPages(prev => prev.map(page => page.filter(c => c.id !== id)));
        return true;
    }, []);

    const resetRef = useRef(reset);
    useEffect(() => { resetRef.current = reset; }, [reset]);

    // Listen for real-time changes
    useEffect(() => {
        if (!tenant?.id) return;

        const channel = supabase.channel('use-comprobantes-list')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contable_comprobantes', filter: `tenant_id=eq.${tenant.id}` },
                () => {
                    resetRef.current();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tenant?.id]);

    return { data, totalCount, isLoading, hasMore, loadMore, reset, updateEstado, eliminarComprobante };
}
