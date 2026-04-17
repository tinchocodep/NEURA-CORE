import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

export interface FacturacionEmisorLite {
    id: string;
    cuit: string;
    razon_social: string;
    alias: string | null;
    punto_venta: number;
    condicion_iva: string | null;
    is_default: boolean;
}

export function useFacturacionEmisores() {
    const { tenant } = useTenant();
    const [emisores, setEmisores] = useState<FacturacionEmisorLite[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenant?.id) return;
        setLoading(true);
        supabase
            .from('facturacion_emisores')
            .select('id, cuit, razon_social, alias, punto_venta, condicion_iva, is_default')
            .eq('tenant_id', tenant.id)
            .eq('activo', true)
            .order('is_default', { ascending: false })
            .order('razon_social')
            .then(({ data }) => {
                const list = (data || []) as FacturacionEmisorLite[];
                setEmisores(list);
                const def = list.find(e => e.is_default) || list[0];
                if (def) setSelectedId(def.id);
                setLoading(false);
            });
    }, [tenant?.id]);

    const selected = emisores.find(e => e.id === selectedId) || null;

    return { emisores, selected, selectedId, setSelectedId, loading };
}
