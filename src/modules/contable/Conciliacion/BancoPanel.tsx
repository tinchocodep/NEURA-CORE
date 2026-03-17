import { useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { fmt } from '../../../utils/bankParsers';
import type { BankRow, BankFormat } from './types';

interface Props {
    rows: BankRow[];
    bankAccounts: { id: string; name: string; balance: number }[];
    selectedAccountId: string;
    onSelectAccount: (id: string) => void;
    bankFormat: BankFormat;
    onBankFormatChange: (f: BankFormat) => void;
    selectedId: string | null;
    onSelectRow: (id: string | null) => void;
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

export default function BancoPanel({ rows, bankAccounts, selectedAccountId, onSelectAccount, bankFormat, onBankFormatChange, selectedId, onSelectRow, onFileLoad, onClear }: Props) {
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexShrink: 0 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Movimientos Banco
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {rows.length > 0 ? `${rows.length} movimientos cargados` : 'Subí el extracto bancario en CSV'}
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

            {/* Account selector + format */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexShrink: 0 }}>
                <select
                    className="form-input"
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    value={selectedAccountId}
                    onChange={e => onSelectAccount(e.target.value)}
                >
                    {bankAccounts.length === 0 && <option value="">Sin cuentas bancarias</option>}
                    {bankAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>
                    ))}
                </select>
                <select
                    className="form-input"
                    style={{ fontSize: '0.8rem', minWidth: 110 }}
                    value={bankFormat}
                    onChange={e => onBankFormatChange(e.target.value as BankFormat)}
                >
                    <option value="supervielle">Supervielle</option>
                    <option value="generico">Genérico</option>
                </select>
            </div>

            {/* Upload area or list */}
            {rows.length === 0 ? (
                <>
                    <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFileLoad(f); e.target.value = ''; }} />
                    <button
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', border: '2px dashed var(--border)', background: 'var(--bg-main)', marginBottom: '0.75rem' }}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={16} />
                        Subir extracto banco (.csv)
                    </button>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: 4 }}>
                            {bankFormat === 'supervielle' ? 'Formato Supervielle:' : 'Formato Genérico:'}
                        </strong>
                        {bankFormat === 'supervielle'
                            ? <code>Fecha, Concepto, Detalle, Débito, Crédito, Saldo</code>
                            : <code>Fecha, Concepto, Monto (negativo=gasto, positivo=ingreso)</code>
                        }
                    </div>
                </>
            ) : (
                <>
                    <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFileLoad(f); e.target.value = ''; }} />
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
                            const amount = row.credit > 0 ? row.credit : row.debit;
                            const isIncome = row.credit > 0;
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
                                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                                                    {row.concept}
                                                </span>
                                                <span style={{ fontSize: '0.72rem' }}>{STATUS_ICONS[row.matchStatus]}</span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                {row.date}
                                                {row.nombre && <span> · {row.nombre}</span>}
                                            </div>
                                            {row.matchStatus === 'matched' && row.matchedArcaId && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--success)', marginTop: '0.1rem' }}>
                                                    ↔ match ARCA
                                                    {row.matchScore < 100 && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>score {row.matchScore}</span>}
                                                </div>
                                            )}
                                            {row.matchStatus === 'review' && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--warning)', marginTop: '0.1rem' }}>
                                                    Confirmá el comprobante ARCA
                                                </div>
                                            )}
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isIncome ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}>
                                            {isIncome ? '+' : '-'}{fmt(amount)}
                                        </span>
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
