import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { Upload, CheckCircle2, Clock, HelpCircle, RefreshCw, ChevronDown, ChevronUp, Link2 } from 'lucide-react';

// ── Parse Argentinian number format ──────────────────────────────────────────
function parseArgNum(s: string): number {
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

// ── Parse Supervielle CSV ─────────────────────────────────────────────────────
function parseSupervielleCSV(text: string): Array<{
    date: string; concept: string; detail: string;
    debit: number; credit: number; balance: number;
}> {
    const lines = text.trim().split('\n');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Handle quoted fields with commas inside
        const parts: string[] = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
        parts.push(cur.trim());
        if (parts.length < 6) continue;
        const rawDate = parts[0].split(' ')[0]; // "2026/02/24"
        const date = rawDate.replace(/\//g, '-'); // "2026-02-24"
        rows.push({
            date,
            concept: parts[1] || '',
            detail: parts[2] || '',
            debit: parseArgNum(parts[3]),
            credit: parseArgNum(parts[4]),
            balance: parseArgNum(parts[5]),
        });
    }
    return rows;
}

// ── Match status helpers ──────────────────────────────────────────────────────
type MatchStatus = 'matched' | 'review' | 'unmatched' | 'registered';

function statusLabel(s: MatchStatus) {
    if (s === 'matched') return { label: '✅ Conciliado', color: 'var(--success)' };
    if (s === 'review') return { label: '⏳ En revisión', color: 'var(--warning)' };
    if (s === 'registered') return { label: '📝 Registrado', color: 'var(--brand)' };
    return { label: '❓ Sin match', color: 'var(--danger)' };
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);

// ── Main Component ────────────────────────────────────────────────────────────
export default function Bancos() {
    const { tenant } = useTenant();
    const { user } = useAuth() as any;
    const { addToast } = useToast();

    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [statements, setStatements] = useState<any[]>([]);
    const [pendingTx, setPendingTx] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'import' | 'reconcile'>('import');
    const [collapsed, setCollapsed] = useState<Record<MatchStatus, boolean>>({ matched: true, review: false, unmatched: false, registered: true });
    const [selectedLine, setSelectedLine] = useState<string | null>(null);
    const [selectedPending, setSelectedPending] = useState<string | null>(null);
    const [categoryModal, setCategoryModal] = useState<any | null>(null);
    const [categoryId, setCategoryId] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const fetchData = useCallback(async () => {
        if (!tenant) return;
        const [{ data: accs }, { data: cats }] = await Promise.all([
            supabase.from('treasury_accounts').select('*').eq('tenant_id', tenant.id).is('assigned_user_id', null).order('name'),
            supabase.from('treasury_categories').select('*').eq('tenant_id', tenant.id).order('name'),
        ]);
        if (accs) setAccounts(accs);
        if (cats) setCategories(cats);
        if (accs && accs.length > 0 && !selectedAccountId) setSelectedAccountId(accs[0].id);
    }, [tenant]);

    const fetchStatements = useCallback(async () => {
        if (!tenant || !selectedAccountId) return;
        const [{ data: stmts }, { data: txs }] = await Promise.all([
            supabase.from('bank_statement_lines').select('*, matched_transaction:treasury_transactions(description,amount,date)')
                .eq('tenant_id', tenant.id).eq('account_id', selectedAccountId).order('date', { ascending: false }),
            supabase.from('treasury_transactions').select('*')
                .eq('tenant_id', tenant.id).eq('account_id', selectedAccountId).eq('status', 'pendiente').order('date'),
        ]);
        if (stmts) setStatements(stmts);
        if (txs) setPendingTx(txs);
    }, [tenant, selectedAccountId]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { fetchStatements(); }, [fetchStatements]);

    // ── Import CSV ──────────────────────────────────────────────────────────
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !tenant || !selectedAccountId) return;
        setImporting(true);
        const text = await file.text();
        const rows = parseSupervielleCSV(text);
        if (rows.length === 0) { addToast('error', 'Error', 'No se pudo parsear el CSV'); setImporting(false); return; }

        // Auto-match against pending transactions
        const pendingSnap = [...pendingTx];
        const toInsert = rows.map(row => {
            const amount = row.credit > 0 ? row.credit : -row.debit;
            const absAmt = Math.abs(amount);
            // Try to find exact match in pending
            const exact = pendingSnap.find(tx => {
                const txAmt = tx.type === 'income' ? tx.amount : tx.amount;
                const dateDiff = Math.abs(new Date(tx.date).getTime() - new Date(row.date).getTime()) / 86400000;
                return Math.abs(txAmt - absAmt) < 0.01 && dateDiff <= 3;
            });
            // Try to find close match (within 5%)
            const close = !exact ? pendingSnap.find(tx => {
                const txAmt = tx.amount;
                const pct = Math.abs(txAmt - absAmt) / txAmt;
                const dateDiff = Math.abs(new Date(tx.date).getTime() - new Date(row.date).getTime()) / 86400000;
                return pct <= 0.05 && dateDiff <= 7;
            }) : null;

            let status: MatchStatus = 'unmatched';
            let matched_transaction_id = null;
            if (exact) { status = 'matched'; matched_transaction_id = exact.id; }
            else if (close) { status = 'review'; matched_transaction_id = close.id; }

            return {
                tenant_id: tenant.id,
                account_id: selectedAccountId,
                date: row.date,
                concept: row.concept,
                detail: row.detail,
                debit: row.debit,
                credit: row.credit,
                balance: row.balance,
                status,
                matched_transaction_id,
            };
        });

        // Upsert (avoid duplicates by date+concept+amount)
        const { error } = await supabase.from('bank_statement_lines').insert(toInsert);
        if (error) { addToast('error', 'Error al importar', error.message); }
        else {
            // Mark auto-matched pending transactions as completado
            const autoMatched = toInsert.filter(r => r.status === 'matched' && r.matched_transaction_id);
            for (const r of autoMatched) {
                await supabase.from('treasury_transactions').update({ status: 'completado' }).eq('id', r.matched_transaction_id!);
            }
            addToast('success', 'Extracto importado', `${rows.length} líneas procesadas. ${autoMatched.length} conciliadas automáticamente.`);
            await fetchStatements();
            setActiveTab('reconcile');
        }
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    // ── Manual match ────────────────────────────────────────────────────────
    const handleManualMatch = async () => {
        if (!selectedLine || !selectedPending) return;
        await supabase.from('bank_statement_lines').update({ status: 'matched', matched_transaction_id: selectedPending }).eq('id', selectedLine);
        await supabase.from('treasury_transactions').update({ status: 'completado' }).eq('id', selectedPending);
        addToast('success', 'Conciliado', 'Movimiento conciliado correctamente.');
        setSelectedLine(null); setSelectedPending(null);
        await fetchStatements();
    };

    // ── Register unmatched as new transaction ───────────────────────────────
    const handleRegister = async () => {
        if (!categoryModal || !categoryId || !tenant) return;
        const line = categoryModal;
        const amount = line.credit > 0 ? line.credit : line.debit;
        const type = line.credit > 0 ? 'income' : 'expense';
        const { data: tx } = await supabase.from('treasury_transactions').insert({
            tenant_id: tenant.id, account_id: selectedAccountId,
            type, amount, description: line.concept + (line.detail ? ` — ${line.detail}` : ''),
            date: line.date, status: 'completado', payment_method: 'transferencia',
            category_id: categoryId,
        }).select().single();
        if (tx) {
            await supabase.from('bank_statement_lines').update({ status: 'registered', matched_transaction_id: tx.id }).eq('id', line.id);
            // Update account balance
            const acc = accounts.find(a => a.id === selectedAccountId);
            if (acc) await supabase.from('treasury_accounts').update({ balance: acc.balance + (type === 'income' ? amount : -amount) }).eq('id', acc.id);
            addToast('success', 'Registrado', 'Movimiento registrado en tesorería.');
        }
        setCategoryModal(null); setCategoryId('');
        await fetchStatements();
    };

    // ── Group by status ─────────────────────────────────────────────────────
    const groups: Record<MatchStatus, any[]> = { matched: [], review: [], unmatched: [], registered: [] };
    for (const s of statements) groups[s.status as MatchStatus]?.push(s);

    const tabs = [{ k: 'import', label: '📤 Importar extracto' }, { k: 'reconcile', label: '🔄 Conciliar' }] as const;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '2.5rem' }}>
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <h1>Conciliación Bancaria</h1>
                <p>Importá extractos de tus bancos y cruzalos con las proyecciones.</p>
            </div>

            {/* Account selector */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <select className="form-input" style={{ maxWidth: '280px' }} value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
                </select>
                <button className="btn btn-secondary" onClick={fetchStatements} style={{ gap: '0.4rem' }}>
                    <RefreshCw size={15} /> Actualizar
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.25rem', marginBottom: '1.5rem', width: 'fit-content' }}>
                {tabs.map(t => (
                    <button key={t.k} onClick={() => setActiveTab(t.k)}
                        style={{ padding: '0.4rem 1rem', borderRadius: 'calc(var(--r-md) - 2px)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, background: activeTab === t.k ? 'var(--brand)' : 'transparent', color: activeTab === t.k ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── IMPORT TAB ── */}
            {activeTab === 'import' && (
                <div className="card" style={{ padding: '2rem', maxWidth: '560px' }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>Importar extracto de Supervielle</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Subí el CSV descargado desde el home banking. El sistema lo parsea automáticamente y cruza con tus proyecciones.
                    </p>
                    <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
                    <button className="btn btn-primary" style={{ gap: '0.5rem' }} disabled={importing || !selectedAccountId} onClick={() => fileRef.current?.click()}>
                        <Upload size={17} />
                        {importing ? 'Procesando...' : 'Seleccionar CSV de Supervielle'}
                    </button>
                    <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Formato: <code>Fecha, Concepto, Detalle, Débito, Crédito, Saldo</code>
                    </p>
                </div>
            )}

            {/* ── RECONCILE TAB ── */}
            {activeTab === 'reconcile' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
                    {/* Left: statement lines grouped by status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {(['review', 'unmatched', 'matched', 'registered'] as MatchStatus[]).map(st => {
                            const lines = groups[st];
                            if (lines.length === 0) return null;
                            const { label, color } = statusLabel(st);
                            const isOpen = !collapsed[st];
                            return (
                                <div key={st} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                    <button onClick={() => setCollapsed(p => ({ ...p, [st]: !p[st] }))}
                                        style={{ width: '100%', padding: '0.85rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', borderLeft: `4px solid ${color}` }}>
                                        <span style={{ fontWeight: 700, color, fontSize: '0.875rem' }}>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({lines.length})</span></span>
                                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    {isOpen && (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--bg-main)' }}>
                                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Fecha</th>
                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Concepto</th>
                                                    <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>Débito</th>
                                                    <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>Crédito</th>
                                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lines.map((line: any) => {
                                                    const isSelected = selectedLine === line.id;
                                                    return (
                                                        <tr key={line.id} style={{ borderTop: '1px solid var(--border)', background: isSelected ? 'rgba(99,102,241,0.06)' : undefined, cursor: st === 'unmatched' || st === 'review' ? 'pointer' : 'default' }}
                                                            onClick={() => (st === 'unmatched' || st === 'review') && setSelectedLine(isSelected ? null : line.id)}>
                                                            <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{line.date}</td>
                                                            <td style={{ padding: '0.6rem 0.5rem', maxWidth: '300px' }}>
                                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{line.concept}</div>
                                                                {line.detail && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>{line.detail}</div>}
                                                                {line.matched_transaction && <div style={{ fontSize: '0.72rem', color: 'var(--brand)', marginTop: '0.2rem' }}>↔ {line.matched_transaction.description}</div>}
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{line.debit > 0 ? fmt(line.debit) : '—'}</td>
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{line.credit > 0 ? fmt(line.credit) : '—'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                                                                {st === 'unmatched' && (
                                                                    <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }} onClick={e => { e.stopPropagation(); setCategoryModal(line); }}>
                                                                        Registrar
                                                                    </button>
                                                                )}
                                                                {st === 'review' && (
                                                                    <span style={{ fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 600 }}>Seleccionar</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            );
                        })}
                        {statements.length === 0 && (
                            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Upload size={32} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                                <p>No hay líneas de extracto. Importá un CSV en la pestaña anterior.</p>
                            </div>
                        )}
                    </div>

                    {/* Right: pending projected transactions for manual matching */}
                    <div className="card" style={{ padding: '1.25rem' }}>
                        <h4 style={{ marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 700 }}>
                            <Clock size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                            Proyecciones pendientes
                        </h4>
                        {selectedLine && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--brand)', marginBottom: '0.75rem', fontWeight: 600 }}>
                                ← Línea seleccionada. Hacé click en una proyección para conciliar.
                            </p>
                        )}
                        {pendingTx.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No hay proyecciones pendientes para esta cuenta.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {pendingTx.map((tx: any) => {
                                    const isSelP = selectedPending === tx.id;
                                    return (
                                        <div key={tx.id} onClick={() => setSelectedPending(isSelP ? null : tx.id)}
                                            style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--r-md)', border: `1px solid ${isSelP ? 'var(--brand)' : 'var(--border)'}`, cursor: 'pointer', background: isSelP ? 'rgba(99,102,241,0.06)' : 'var(--bg-main)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                                                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tx.date} · {tx.description}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {selectedLine && selectedPending && (
                            <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', justifyContent: 'center', gap: '0.4rem' }} onClick={handleManualMatch}>
                                <Link2 size={15} /> Conciliar seleccionados
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Category modal for unmatched lines ── */}
            {categoryModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ padding: '1.75rem', width: '420px', maxWidth: '90vw' }}>
                        <h3 style={{ marginBottom: '0.25rem' }}>Registrar movimiento sin match</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                            <strong>{categoryModal.concept}</strong> — {fmt(categoryModal.credit > 0 ? categoryModal.credit : categoryModal.debit)} ({categoryModal.date})
                        </p>
                        <div className="form-group">
                            <label className="form-label">Categoría</label>
                            <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                                <option value="">Seleccioná una categoría</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!categoryId} onClick={handleRegister}>
                                Registrar
                            </button>
                            <button className="btn btn-secondary" onClick={() => { setCategoryModal(null); setCategoryId(''); }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
