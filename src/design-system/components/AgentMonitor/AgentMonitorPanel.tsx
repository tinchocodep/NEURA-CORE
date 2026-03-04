import { Zap, ChevronLeft, ChevronRight, ShieldCheck, Clock, ShieldX, WifiOff, Activity } from 'lucide-react';
import { useAgentStream } from './useAgentStream';
import type { AfipApiStatus } from './useAgentStream';

const AFIP_ICON: Record<AfipApiStatus, { icon: typeof ShieldCheck; color: string; label: string }> = {
    ok: { icon: ShieldCheck, color: 'var(--color-afip-ok)', label: 'AFIP Online' },
    pending: { icon: Clock, color: 'var(--color-afip-pending)', label: 'AFIP Procesando' },
    error: { icon: ShieldX, color: 'var(--color-afip-error)', label: 'AFIP Error' },
    offline: { icon: WifiOff, color: 'var(--color-afip-offline)', label: 'AFIP Offline' },
};

const STATUS_COLORS: Record<string, string> = {
    running: 'var(--color-accent)',
    done: 'var(--color-success)',
    error: 'var(--color-danger)',
    queued: 'var(--color-warning)',
};

interface Props {
    collapsed: boolean;
    onToggle: () => void;
}

export default function AgentMonitorPanel({ collapsed, onToggle }: Props) {
    const { tasks, afipStatus, activeCount } = useAgentStream();
    const afipCfg = AFIP_ICON[afipStatus];
    const AfipIcon = afipCfg.icon;

    return (
        <aside
            className={`agent-panel${collapsed ? ' collapsed' : ''}`}
            role="complementary"
            aria-label="Neura Agent Monitor"
        >
            {/* Toggle header */}
            <div
                className="agent-panel-header"
                onClick={onToggle}
                title={collapsed ? 'Expandir Monitor (⌘J)' : 'Colapsar Monitor (⌘J)'}
                style={{ cursor: 'pointer' }}
            >
                <span className={`agent-pulse${activeCount === 0 ? ' idle' : ''}`} />
                {!collapsed && (
                    <>
                        <span className="agent-panel-title">Neura Orkesta</span>
                        <kbd>⌘J</kbd>
                    </>
                )}
                <span style={{ marginLeft: collapsed ? 0 : 'auto', color: 'var(--color-text-muted)' }}>
                    {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </span>
            </div>

            {/* Task Feed (only when expanded) */}
            {!collapsed && (
                <>
                    <div className="agent-feed">
                        {tasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                <Activity size={20} style={{ margin: '0 auto 0.5rem', display: 'block', opacity: 0.4 }} />
                                Sin actividad reciente
                            </div>
                        ) : (
                            tasks.map(task => (
                                <div key={task.id} className={`agent-task ${task.status}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{
                                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                            background: STATUS_COLORS[task.status] ?? 'var(--color-text-muted)',
                                        }} />
                                        <span className="agent-task-label">{task.label}</span>
                                    </div>
                                    {task.detail && (
                                        <span className="agent-task-detail">{task.detail}</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="agent-status-bar">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AfipIcon size={12} color={afipCfg.color} />
                            <span style={{ color: afipCfg.color, fontSize: '0.6875rem' }}>{afipCfg.label}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6875rem' }}>
                            <Zap size={10} color="var(--color-accent)" />
                            {activeCount} activos
                        </span>
                    </div>
                </>
            )}
        </aside>
    );
}
