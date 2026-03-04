import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export type AgentTaskStatus = 'running' | 'done' | 'error' | 'queued';
export type AfipApiStatus = 'ok' | 'pending' | 'error' | 'offline';

export interface AgentTask {
    id: string;
    label: string;
    detail?: string;
    status: AgentTaskStatus;
    created_at: string;
}

function upsertTask(prev: AgentTask[], next: AgentTask): AgentTask[] {
    const idx = prev.findIndex(t => t.id === next.id);
    if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = next;
        return updated;
    }
    // Keep only last 20 tasks
    return [next, ...prev].slice(0, 20);
}

export function useAgentStream() {
    const [tasks, setTasks] = useState<AgentTask[]>([
        // Demo tasks visible before realtime connects
        {
            id: 'demo-1',
            label: 'Clasificación IA activa',
            detail: 'Analizando comprobantes pendientes...',
            status: 'running',
            created_at: new Date().toISOString(),
        },
        {
            id: 'demo-2',
            label: 'AFIP WSFE',
            detail: 'API online · última sync hace 4 min',
            status: 'done',
            created_at: new Date(Date.now() - 240000).toISOString(),
        },
    ]);

    const [afipStatus] = useState<AfipApiStatus>('ok');

    useEffect(() => {
        // We try to subscribe to an `agent_tasks` table if it exists.
        // If not, we gracefully stay with the demo data.
        const channel = supabase
            .channel('neura-agent-tasks')
            .on(
                'postgres_changes' as any,
                { event: '*', schema: 'public', table: 'agent_tasks' },
                (payload: any) => {
                    if (payload.new) {
                        setTasks(prev => upsertTask(prev, payload.new as AgentTask));
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    // Connected — could load recent tasks here
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const activeCount = tasks.filter(t => t.status === 'running' || t.status === 'queued').length;

    return { tasks, afipStatus, activeCount };
}
