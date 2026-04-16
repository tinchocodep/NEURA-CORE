import { supabase } from '../lib/supabase';

export type ComprobanteSource = 'arca' | 'xubio' | 'colppy' | 'sistema' | 'manual' | 'ocr';

export interface ComprobantePayload {
    tenant_id: string;
    tipo: 'venta' | 'compra';
    tipo_comprobante: string;
    numero_comprobante: string;
    fecha: string;
    monto_original: number;
    monto_ars?: number;
    moneda?: string;
    neto_gravado?: number | null;
    neto_no_gravado?: number | null;
    total_iva?: number | null;
    estado?: string;
    descripcion?: string | null;
    cuit_emisor?: string | null;
    cuit_receptor?: string | null;
    proveedor_id?: string | null;
    cliente_id?: string | null;
    categoria_id?: string | null;
    proyecto_id?: string | null;
    xubio_id?: string | null;
    [key: string]: any;
}

export interface UpsertResult {
    id: string;
    action: 'inserted' | 'merged';
    sources: string[];
}

/**
 * Upsertea un comprobante con deduplicacion por (tenant_id, tipo, tipo_comprobante, numero_comprobante, cuit_emisor, cuit_receptor).
 *
 * - Si el comprobante ya existe: agrega `source` al array `sources` (sin duplicar) y devuelve el id existente.
 *   NO sobreescribe campos del comprobante original.
 * - Si no existe: inserta nuevo con `sources: [source]`.
 *
 * Esta funcion es el unico camino valido para meter un comprobante en la base.
 * Evita que ARCA sync + Xubio sync + carga manual creen duplicados.
 */
export async function upsertComprobante(
    payload: ComprobantePayload,
    source: ComprobanteSource,
): Promise<UpsertResult | null> {
    const { tenant_id, tipo, tipo_comprobante, numero_comprobante, cuit_emisor, cuit_receptor } = payload;

    let query = supabase
        .from('contable_comprobantes')
        .select('id, sources')
        .eq('tenant_id', tenant_id)
        .eq('tipo', tipo)
        .eq('tipo_comprobante', tipo_comprobante)
        .eq('numero_comprobante', numero_comprobante);

    query = cuit_emisor ? query.eq('cuit_emisor', cuit_emisor) : query.is('cuit_emisor', null);
    query = cuit_receptor ? query.eq('cuit_receptor', cuit_receptor) : query.is('cuit_receptor', null);

    const { data: existing } = await query.maybeSingle();

    if (existing) {
        const currentSources: string[] = Array.isArray(existing.sources) ? existing.sources : [];
        if (currentSources.includes(source)) {
            return { id: existing.id, action: 'merged', sources: currentSources };
        }
        const newSources = [...currentSources, source];
        const { error } = await supabase
            .from('contable_comprobantes')
            .update({ sources: newSources })
            .eq('id', existing.id);
        if (error) {
            console.error('[upsertComprobante] update sources error:', error);
            return null;
        }
        return { id: existing.id, action: 'merged', sources: newSources };
    }

    const insertPayload = {
        ...payload,
        source,
        sources: [source],
    };
    const { data: inserted, error } = await supabase
        .from('contable_comprobantes')
        .insert(insertPayload)
        .select('id')
        .single();
    if (error || !inserted) {
        console.error('[upsertComprobante] insert error:', error);
        return null;
    }
    return { id: inserted.id, action: 'inserted', sources: [source] };
}
