import { CheckCircle, AlertCircle, HelpCircle, Save } from 'lucide-react';

interface Stats {
    matched: number;
    review: number;
    arcaUnmatched: number;
    bankUnmatched: number;
    total: number;
}

interface Props {
    stats: Stats;
    saving: boolean;
    canSave: boolean;
    onSave: () => void;
}

export default function MatchSummaryBar({ stats, saving, canSave, onSave }: Props) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            flexShrink: 0,
            flexWrap: 'wrap',
        }}>
            {/* Stats chips */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <StatChip
                    icon={<CheckCircle size={13} />}
                    label={`${stats.matched} conciliados`}
                    color="var(--success)"
                />
                {stats.review > 0 && (
                    <StatChip
                        icon={<HelpCircle size={13} />}
                        label={`${stats.review} a revisar`}
                        color="var(--warning)"
                    />
                )}
                {stats.arcaUnmatched > 0 && (
                    <StatChip
                        icon={<AlertCircle size={13} />}
                        label={`${stats.arcaUnmatched} ARCA sin match`}
                        color="var(--danger)"
                    />
                )}
                {stats.bankUnmatched > 0 && (
                    <StatChip
                        icon={<AlertCircle size={13} />}
                        label={`${stats.bankUnmatched} banco sin match`}
                        color="var(--danger)"
                    />
                )}
                {stats.total === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Cargá comprobantes ARCA y el extracto bancario para comenzar
                    </span>
                )}
            </div>

            {/* Save button */}
            <button
                className="btn btn-primary"
                style={{ gap: '0.45rem', flexShrink: 0, opacity: canSave ? 1 : 0.5 }}
                disabled={!canSave || saving}
                onClick={onSave}
            >
                <Save size={15} />
                {saving ? 'Guardando...' : 'Validar y Guardar en el sistema'}
            </button>
        </div>
    );
}

function StatChip({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.25rem 0.6rem',
            background: `${color}18`,
            color,
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: 600,
        }}>
            {icon}
            {label}
        </div>
    );
}
