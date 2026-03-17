import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useToast } from '../../../contexts/ToastContext';

export type MessagingProvider = 'telegram' | 'whatsapp' | 'slack';
export type ConnectionStatus = 'pending' | 'active' | 'inactive';

export interface MessagingConnection {
    id: string;
    tenant_id: string;
    provider: MessagingProvider;
    name: string;
    external_id: string | null;
    external_name: string | null;
    status: ConnectionStatus;
    connection_code: string | null;
    code_expires_at: string | null;
    created_at: string;
    updated_at: string;
}

// Genera un código legible tipo "ANTI-4X7K"
function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part(4)}-${part(4)}`;
}

export function useMessagingConnections(provider: MessagingProvider) {
    const { tenant } = useTenant();
    const { addToast } = useToast();

    const [connections, setConnections] = useState<MessagingConnection[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    // ── Fetch ────────────────────────────────────────────────────────────────
    const fetchConnections = useCallback(async () => {
        if (!tenant) return;
        const { data, error } = await supabase
            .from('messaging_connections')
            .select('*')
            .eq('tenant_id', tenant.id)
            .eq('provider', provider)
            .order('created_at', { ascending: false });

        if (error) { console.error('messaging_connections fetch error:', error); return; }
        setConnections(data ?? []);
        setLoading(false);
    }, [tenant, provider]);

    useEffect(() => { fetchConnections(); }, [fetchConnections]);

    // ── Realtime: detecta cuando n8n activa una conexión pending ─────────────
    useEffect(() => {
        if (!tenant) return;

        const channel = supabase
            .channel(`messaging-${tenant.id}-${provider}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messaging_connections',
                    filter: `tenant_id=eq.${tenant.id}`,
                },
                (payload) => {
                    const updated = payload.new as MessagingConnection;
                    if (updated.provider !== provider) return;

                    setConnections(prev =>
                        prev.map(c => c.id === updated.id ? updated : c)
                    );

                    if (updated.status === 'active') {
                        addToast('success', 'Cuenta conectada',
                            `${updated.external_name ?? updated.external_id} vinculada correctamente.`);
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tenant, provider, addToast]);

    // ── Crear nueva conexión (genera código y espera vinculación) ─────────────
    const createConnection = useCallback(async (name: string): Promise<MessagingConnection | null> => {
        if (!tenant) return null;
        setCreating(true);

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

        const { data, error } = await supabase
            .from('messaging_connections')
            .insert({
                tenant_id: tenant.id,
                provider,
                name,
                status: 'pending',
                connection_code: code,
                code_expires_at: expiresAt,
            })
            .select()
            .single();

        setCreating(false);

        if (error) {
            addToast('error', 'Error', 'No se pudo crear la conexión.');
            return null;
        }

        setConnections(prev => [data, ...prev]);
        return data;
    }, [tenant, provider, addToast]);

    // ── Desactivar / eliminar ────────────────────────────────────────────────
    const deleteConnection = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('messaging_connections')
            .delete()
            .eq('id', id);

        if (error) {
            addToast('error', 'Error', 'No se pudo eliminar la conexión.');
            return;
        }
        setConnections(prev => prev.filter(c => c.id !== id));
        addToast('success', 'Eliminada', 'Conexión eliminada correctamente.');
    }, [addToast]);

    const toggleConnection = useCallback(async (id: string, currentStatus: ConnectionStatus) => {
        const newStatus: ConnectionStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const { error } = await supabase
            .from('messaging_connections')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) { addToast('error', 'Error', 'No se pudo actualizar el estado.'); return; }
        setConnections(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    }, [addToast]);

    // ── Renovar código si expiró (sin perder el registro) ───────────────────
    const renewCode = useCallback(async (id: string) => {
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('messaging_connections')
            .update({ connection_code: code, code_expires_at: expiresAt, status: 'pending' })
            .eq('id', id)
            .select()
            .single();

        if (error) { addToast('error', 'Error', 'No se pudo renovar el código.'); return; }
        setConnections(prev => prev.map(c => c.id === id ? data : c));
    }, [addToast]);

    return {
        connections,
        loading,
        creating,
        createConnection,
        deleteConnection,
        toggleConnection,
        renewCode,
        refresh: fetchConnections,
    };
}
