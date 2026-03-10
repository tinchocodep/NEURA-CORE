import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { Upload, RefreshCw, ChevronDown, ChevronUp, Trash2, Clock, Link2 } from 'lucide-react';

// ── Parse Argentinian number format ──────────────────────────────────────────
function parseArgNum(s: string): number {
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

// ── Extract NOMBRE and DOCUMENTO (CUIT/DNI) from Supervielle detail string ────
function extractFromDetail(detail: string): { nombre: string; documento: string; cheque: string } {
    const nombreMatch = detail.match(/NOMBRE:\s*([^\n,]+?)(?:\s+DOCUMENTO|\s+CBU|\s+ID_DEBIN|$)/i);
    const docMatch = detail.match(/DOCUMENTO:\s*([\d]+)/i);
    const chequeMatch = detail.match(/N[úu]mero Cheque:\s*([\d]+)/i);
    return {
        nombre: nombreMatch?.[1]?.trim().toUpperCase() ?? '',
        documento: docMatch?.[1]?.trim() ?? '',
        cheque: chequeMatch?.[1]?.trim() ?? '',
    };
}

// ── Normalize text for fuzzy comparison ──────────────────────────────────────
function normalize(s: string): string {
    return s.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// ── Check if two names share at least one meaningful word ────────────────────
function namesOverlap(a: string, b: string): boolean {
    if (!a || !b) return false;
    const STOP = new Set(['DE', 'LA', 'EL', 'LOS', 'LAS', 'S', 'A', 'SA', 'SRL', 'SH', 'Y']);
    const wordsA = normalize(a).split(' ').filter(w => w.length > 2 && !STOP.has(w));
    const wordsB = normalize(b).split(' ').filter(w => w.length > 2 && !STOP.has(w));
    return wordsA.some(w => wordsB.includes(w));
}

// ── Scoring system ────────────────────────────────────────────────────────────
// Max possible score: 115 pts
// matched  ≥ 70 pts  (auto-concilia)
// review   ≥ 30 pts  (requiere confirmación)
function scoreMatch(
    bankAmt: number,
    bankDate: string,
    bankNombre: string,
    bankDocumento: string,
    bankCheque: string,
    tx: any
): number {
    let score = 0;

    // ── IMPORTE (hasta 50 pts) ────────────────────────────────────────────────
    const txAmt = Math.abs(tx.amount);
    const diff = Math.abs(txAmt - Math.abs(bankAmt));
    if (diff < 0.01) score += 50;   // exacto
    else if (diff / txAmt < 0.01) score += 40;   // < 1%
    else if (diff / txAmt < 0.03) score += 30;   // < 3%
    else if (diff / txAmt < 0.05) score += 20;   // < 5%
    else if (diff / txAmt < 0.10) score += 5;    // < 10% — indicio débil

    // ── FECHA (hasta 20 pts) ─────────────────────────────────────────────────
    const dateDiff = Math.abs(new Date(tx.date).getTime() - new Date(bankDate).getTime()) / 86400000;
    if (dateDiff === 0) score += 20;
    else if (dateDiff <= 1) score += 18;
    else if (dateDiff <= 3) score += 12;
    else if (dateDiff <= 7) score += 6;

    // ── CUIT / DOCUMENTO (hasta 20 pts) ──────────────────────────────────────
    if (bankDocumento) {
        // Compare against contact_name field or description that may contain CUIT
        const txDesc = (tx.description || '').replace(/[^0-9]/g, '');
        const txContact = (tx.contact_name || '').replace(/[^0-9]/g, '');
        if (txDesc.includes(bankDocumento) || txContact.includes(bankDocumento)) score += 20;
    }

    // ── NOMBRE (hasta 10 pts) ────────────────────────────────────────────────
    if (bankNombre) {
        if (namesOverlap(bankNombre, tx.contact_name || '')) score += 10;
        else if (namesOverlap(bankNombre, tx.description || '')) score += 7;
    }

    // ── NÚMERO DE CHEQUE (hasta 15 pts) ──────────────────────────────────────
    if (bankCheque && tx.check_number && bankCheque === String(tx.check_number)) score += 15;

    return score;
}

// ── Parse Supervielle CSV ─────────────────────────────────────────────────────
function parseSupervielleCSV(text: string): Array<{
    date: string; concept: string; detail: string;
    debit: number; credit: number; balance: number;
    nombre: string; documento: string; cheque: string;
}> {
    const lines = text.trim().split('\n');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts: string[] = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
        parts.push(cur.trim());
        if (parts.length < 6) continue;
        const rawDate = parts[0].split(' ')[0];
        const date = rawDate.replace(/\//g, '-');
        const detail = parts[2] || '';
        const { nombre, documento, cheque } = extractFromDetail(detail);
        rows.push({
            date,
            concept: parts[1] || '',
            detail,
            debit: parseArgNum(parts[3]),
            credit: parseArgNum(parts[4]),
            balance: parseArgNum(parts[5]),
            nombre,
            documento,
            cheque,
        });
    }
    return rows;
}

// ── Parse Generic CSV ─────────────────────────────────────────────────────────
function parseGenericCSV(text: string): Array<{
    date: string; concept: string; detail: string;
    debit: number; credit: number; balance: number;
    nombre: string; documento: string; cheque: string;
}> {
    const lines = text.trim().split('\n');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts: string[] = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
        parts.push(cur.trim());
        if (parts.length < 3) continue; // Expects Date, Concept, Amount

        const rawDate = parts[0].split(' ')[0];
        const date = rawDate.replace(/\//g, '-');
        const concept = parts[1] || '';
        const amountStr = parts[2] || '0';

        let amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0;
        // fallback parsing if dot is used for decimals and no thousands separator
        if (Number.isNaN(amount) || amount === 0) {
            amount = parseFloat(amountStr) || 0;
        }

        const isIncome = amount > 0;
        const absAmount = Math.abs(amount);

        rows.push({
            date,
            concept: concept,
            detail: '',
            debit: isIncome ? 0 : absAmount,
            credit: isIncome ? absAmount : 0,
            balance: 0,
            nombre: '',
            documento: '',
            cheque: '',
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
    const { addToast } = useToast();

    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [statements, setStatements] = useState<any[]>([]);
    const [pendingTx, setPendingTx] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [importing, setImporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'import' | 'reconcile'>('import');
    const [collapsed, setCollapsed] = useState<Record<MatchStatus, boolean>>({ matched: true, review: false, unmatched: false, registered: true });
    const [selectedLine, setSelectedLine] = useState<string | null>(null);
    const [selectedPending, setSelectedPending] = useState<string | null>(null);
    const [categoryModal, setCategoryModal] = useState<any | null>(null);
    const [categoryId, setCategoryId] = useState('');
    const [bankFormat, setBankFormat] = useState<'supervielle' | 'generico'>('supervielle');
    const [deletingLine, setDeletingLine] = useState<string | null>(null);
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
        if (!file || !tenant) return;
        if (!selectedAccountId) {
            addToast('error', 'Sin cuenta', 'Seleccioná una cuenta bancaria primero.');
            return;
        }
        setImporting(true);
        const text = await file.text();
        const rows = bankFormat === 'supervielle'
            ? parseSupervielleCSV(text)
            : parseGenericCSV(text);
        if (rows.length === 0) { addToast('error', 'Error', 'No se pudo parsear el CSV o está vacío.'); setImporting(false); return; }

        // ── Auto-match por scoring ──────────────────────────────────────────
        const pendingSnap = [...pendingTx];
        const toInsert = rows.map(row => {
            const amount = row.credit > 0 ? row.credit : -row.debit;

            // Calcular score para cada transacción pendiente
            const scored = pendingSnap.map(tx => ({
                tx,
                score: scoreMatch(amount, row.date, row.nombre, row.documento, row.cheque, tx),
            })).sort((a, b) => b.score - a.score);

            const best = scored[0];
            let status: MatchStatus = 'unmatched';
            let matched_transaction_id = null;
            let match_score = 0;

            if (best && best.score >= 70) {
                status = 'matched';
                matched_transaction_id = best.tx.id;
                match_score = best.score;
            } else if (best && best.score >= 30) {
                status = 'review';
                matched_transaction_id = best.tx.id;
                match_score = best.score;
            }

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
                match_score,
            };
        });

        // Upsert (avoid duplicates by date+concept+amount)
        const { error } = await supabase.from('bank_statement_lines').insert(toInsert);
        if (error) { addToast('error', 'Error al importar', error.message); }
        else {
            // Mark auto-matched pending transactions as completado
            const autoMatched = toInsert.filter(r => r.status === 'matched' && r.matched_transaction_id);
            const reviewMatched = toInsert.filter(r => r.status === 'review');
            const unmatched = toInsert.filter(r => r.status === 'unmatched');

            for (const r of autoMatched) {
                await supabase.from('treasury_transactions').update({ status: 'completado' }).eq('id', r.matched_transaction_id!);
            }

            addToast('success', 'Extracto importado',
                `Se procesaron ${rows.length} líneas: ${autoMatched.length} auto-conciliadas, ${reviewMatched.length} en revisión y ${unmatched.length} sin coincidencias.`);

            await fetchStatements();
            setActiveTab('reconcile');
        }
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    // ── Delete Statement Line ───────────────────────────────────────────────
    const handleDeleteLine = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Estás seguro de que querés eliminar permanentemente este registro del banco?')) return;
        setDeletingLine(id);
        const { error } = await supabase.from('bank_statement_lines').delete().eq('id', id);
        setDeletingLine(null);
        if (error) {
            addToast('error', 'Error', 'No se pudo eliminar el registro.');
        } else {
            addToast('success', 'Eliminado', 'El registro fue borrado correctamente.');
            fetchStatements(); // refrescar
        }
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
                    <h3 style={{ marginBottom: '0.5rem' }}>Importar extracto bancario</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Subí el CSV descargado desde el home banking. El sistema lo parsea automáticamente y cruza con tus proyecciones.
                    </p>

                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Formato del Banco</label>
                        <select className="form-input" value={bankFormat} onChange={e => setBankFormat(e.target.value as any)}>
                            <option value="supervielle">Banco Supervielle</option>
                            <option value="generico">Formato Genérico Estándar</option>
                        </select>
                    </div>

                    <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
                    <button className="btn btn-primary" style={{ gap: '0.5rem', width: '100%', justifyContent: 'center' }} disabled={importing} onClick={() => fileRef.current?.click()}>
                        <Upload size={17} />
                        {importing ? 'Procesando archivo...' : `Seleccionar CSV (${bankFormat === 'supervielle' ? 'Supervielle' : 'Genérico'})`}
                    </button>

                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>
                            Formato esperado:
                        </span>
                        {bankFormat === 'supervielle' ? (
                            <code>Fecha, Concepto, Detalle, Débito, Crédito, Saldo</code>
                        ) : (
                            <div>
                                <code style={{ display: 'block', marginBottom: 4 }}>Fecha, Concepto, Monto</code>
                                <em>Nota: El monto debe ser negativo para gastos/retiros y positivo para ingresos/depósitos.</em>
                            </div>
                        )}
                    </div>
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
                                                                {line.matched_transaction && (
                                                                    <div style={{ fontSize: '0.72rem', color: 'var(--brand)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                        ↔ {line.matched_transaction.description}
                                                                        {line.match_score != null && (
                                                                            <span style={{
                                                                                background: line.match_score >= 70 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                                                                                color: line.match_score >= 70 ? 'var(--success)' : 'var(--warning)',
                                                                                borderRadius: '999px', padding: '0.05rem 0.4rem', fontWeight: 700, fontSize: '0.65rem'
                                                                            }}>score {line.match_score}</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{line.debit > 0 ? fmt(line.debit) : '—'}</td>
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{line.credit > 0 ? fmt(line.credit) : '—'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                                    {st === 'unmatched' && (
                                                                        <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }} onClick={e => { e.stopPropagation(); setCategoryModal(line); }}>
                                                                            Registrar
                                                                        </button>
                                                                    )}
                                                                    {st === 'review' && (
                                                                        <span style={{ fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 600 }}>Seleccionar</span>
                                                                    )}
                                                                    {(st === 'unmatched' || st === 'review') && (
                                                                        <button
                                                                            className="btn"
                                                                            style={{ padding: '0.35rem', color: 'var(--danger)', background: 'transparent', border: 'none', opacity: deletingLine === line.id ? 0.5 : 1 }}
                                                                            title="Eliminar este registro"
                                                                            onClick={e => handleDeleteLine(line.id, e)}
                                                                            disabled={deletingLine === line.id}
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    )}
                                                                </div>
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
