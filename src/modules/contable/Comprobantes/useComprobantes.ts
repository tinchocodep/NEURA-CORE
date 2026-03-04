import { useCallback, useState, useMemo } from 'react';
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
  centro_costo:contable_centros_costo(nombre)
`;

const PAGE_SIZE = 30;

export interface ComprobantesFilters {
    tipo: string;
    estado: string;
    busqueda: string;
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

        const { data: rows, count, error } = await query;
        setIsLoading(false);
        if (error) { console.error('useComprobantes:', error); return; }

        const freshRows = (rows || []) as unknown as Comprobante[];
        setPages([freshRows]);
        setTotalCount(count || 0);
        if (freshRows.length < PAGE_SIZE) setHasMore(false);
        if (freshRows.length > 0) setLastCreatedAt(freshRows[freshRows.length - 1].created_at);
    }, [tenant, filters.tipo, filters.estado, filters.busqueda]);

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

        const { data: rows, error } = await query;
        setIsLoading(false);
        if (error) { console.error('loadMore:', error); return; }

        const newRows = (rows || []) as unknown as Comprobante[];
        if (newRows.length < PAGE_SIZE) setHasMore(false);
        if (newRows.length > 0) {
            setPages(prev => [...prev, newRows]);
            setLastCreatedAt(newRows[newRows.length - 1].created_at);
        }
    }, [tenant, isLoading, hasMore, lastCreatedAt, filters.tipo, filters.estado]);

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

    return { data, totalCount, isLoading, hasMore, loadMore, reset, updateEstado };
}
