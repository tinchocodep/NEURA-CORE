import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { fmt } from '../../../utils/bankParsers';
import type { ArcaRow } from './types';

interface Props {
    rows: ArcaRow[];
    selectedId: string | null;
    onSelectRow: (id: string | null) => void;
    onUnlink: (arcaId: string) => void;
    onFileLoad: (file: File) => void;
    onClear: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    matched: 'var(--success)',
    review: 'var(--warning)',
    unmatched: 'var(--danger)',
};

const STATUS_ICONS: Record<string, string> = {
    matched: '✅',
    review: '🟡',
    unmatched: '❌',
};

export default function ArcaPanel({ rows, selectedId, onSelectRow, onUnlink, onFileLoad, onClear }: Props) {
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexShrink: 0 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Comprobantes ARCA
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {rows.length > 0 ? `${rows.length} comprobantes cargados` : 'Exportá desde el portal ARCA → Mis Comprobantes'}
                    </p>
                </div>
                {rows.length > 0 && (
                    <button
                        onClick={onClear}
                        title="Limpiar panel"
                        style={{ padding: '0.25rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                        <X size={15} />
                    </button>
                )}
            </div>

            {/* Upload area or list */}
            {rows.length === 0 ? (
                <>
                    <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFileLoad(f); e.target.value = ''; }} />
                    <button
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', border: '2px dashed var(--border)', background: 'var(--bg-main)', marginBottom: '0.75rem' }}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={16} />
                        Subir export ARCA (.csv)
                    </button>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: 4 }}>Formato esperado:</strong>
                        <code>Fecha;Tipo;Pto.Venta;Número;CUIT;Denominación;Neto Gravado;IVA;Total</code>
                    </div>
                </>
            ) : (
                <>
                    <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFileLoad(f); e.target.value = ''; }} />
                    <button
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center', gap: '0.4rem', fontSize: '0.78rem', marginBottom: '0.5rem', flexShrink: 0 }}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={13} /> Reemplazar archivo
                    </button>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {rows.map(row => {
                            const isSelected = selectedId === row.id;
                            const color = STATUS_COLORS[row.matchStatus];
                            return (
                                <div
                                    key={row.id}
                                    onClick={() => row.matchStatus !== 'matched' && onSelectRow(isSelected ? null : row.id)}
                                    style={{
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: 'var(--r-md)',
                                        border: `1px solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`,
                                        background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-main)',
                                        cursor: row.matchStatus !== 'matched' ? 'pointer' : 'default',
                                        borderLeft: `3px solid ${color}`,
                                        transition: 'border-color 0.1s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color, background: `${color}22`, padding: '0.1rem 0.35rem', borderRadius: 4 }}>
                                                    {row.tipo_comprobante}
                                                </span>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                                    {row.numero_comprobante}
                                                </span>
                                                <span style={{ fontSize: '0.72rem' }}>{STATUS_ICONS[row.matchStatus]}</span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.fecha} · {row.denominacion || row.cuit_contraparte}
                                            </div>
                                            {row.matchStatus === 'matched' && row.matchedBankId && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--success)', marginTop: '0.1rem' }}>
                                                    ↔ match bancario
                                                    {row.matchScore < 100 && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>score {row.matchScore}</span>}
                                                </div>
                                            )}
                                            {row.matchStatus === 'review' && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--warning)', marginTop: '0.1rem' }}>
                                                    Seleccioná el movimiento bancario para confirmar
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: row.tipo === 'compra' ? 'var(--danger)' : 'var(--success)' }}>
                                                {fmt(row.monto_total)}
                                            </span>
                                            {row.matchStatus === 'matched' && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); onUnlink(row.id); }}
                                                    title="Deshacer match"
                                                    style={{ padding: '0.15rem 0.35rem', fontSize: '0.65rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
                                                >
                                                    ✕ unlink
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
