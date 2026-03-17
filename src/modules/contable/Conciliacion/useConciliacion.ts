import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { useToast } from '../../../contexts/ToastContext';
import {
    parseSupervielleCSV,
    parseGenericCSV,
    parseArgNum,
    namesOverlap,
} from '../../../utils/bankParsers';
import type { ArcaRow, BankRow, BankFormat, MatchStatus } from './types';

// ── Scoring: ArcaRow ↔ BankRow ───────────────────────────────────────────────
// Max 100 pts: monto(50) + fecha(20) + cuit(20) + nombre(10)
function scoreArcaBank(arca: ArcaRow, bank: BankRow): number {
    let score = 0;

    // Monto (hasta 50 pts)
    const bankAmt = bank.credit > 0 ? bank.credit : bank.debit;
    const diff = Math.abs(arca.monto_total - bankAmt);
    const base = arca.monto_total || 1;
    if (diff < 0.01) score += 50;
    else if (diff / base < 0.01) score += 40;
    else if (diff / base < 0.03) score += 30;
    else if (diff / base < 0.05) score += 20;
    else if (diff / base < 0.10) score += 5;

    // Fecha (hasta 20 pts)
    const dateDiff = Math.abs(new Date(arca.fecha).getTime() - new Date(bank.date).getTime()) / 86400000;
    if (dateDiff === 0) score += 20;
    else if (dateDiff <= 1) score += 18;
    else if (dateDiff <= 3) score += 12;
    else if (dateDiff <= 7) score += 6;

    // CUIT (hasta 20 pts)
    if (bank.documento && arca.cuit_contraparte) {
        const cleanDoc = bank.documento.replace(/[^0-9]/g, '');
        const cleanCuit = arca.cuit_contraparte.replace(/[^0-9]/g, '');
        if (cleanDoc && cleanCuit && (cleanDoc.includes(cleanCuit) || cleanCuit.includes(cleanDoc))) {
            score += 20;
        }
    }

    // Nombre (hasta 10 pts)
    if (bank.nombre && arca.denominacion) {
        if (namesOverlap(bank.nombre, arca.denominacion)) score += 10;
    }

    return score;
}

// ── Parse ARCA CSV/TXT export ─────────────────────────────────────────────────
// ARCA portal exports with ; or , separator.
// Expected columns: Fecha;Tipo;Punto Venta;Número;CUIT Contraparte;Denominación;Imp. Neto Gravado;IVA;Imp. Total
function parseArcaCSV(text: string): Omit<ArcaRow, 'matchStatus' | 'matchedBankId' | 'matchScore'>[] {
    const sep = text.includes(';') ? ';' : ',';
    const lines = text.trim().split('\n');
    const rows: Omit<ArcaRow, 'matchStatus' | 'matchedBankId' | 'matchScore'>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(sep).map(p => p.replace(/^"|"$/g, '').trim());
        if (parts.length < 9) continue;

        // Fecha: DD/MM/YYYY or YYYY-MM-DD
        const rawDate = parts[0];
        let fecha = rawDate;
        if (rawDate.includes('/')) {
            const [d, m, y] = rawDate.split('/');
            fecha = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        const tipoComp = parts[1]?.trim().toUpperCase();
        const puntoVenta = parts[2]?.trim().padStart(4, '0');
        const numero = parts[3]?.trim().padStart(8, '0');
        const numero_comprobante = `${puntoVenta}-${numero}`;
        const cuit_contraparte = parts[4]?.trim().replace(/[^0-9]/g, '');
        const denominacion = parts[5]?.trim();
        const neto_gravado = parseArgNum(parts[6]);
        const total_iva = parseArgNum(parts[7]);
        const monto_total = parseArgNum(parts[8]);

        // Determinar tipo: si el comprobante es de compra (recibido) o venta (emitido)
        // ARCA portal distingue por sección; en ausencia de esa info usamos heurística:
        // FAC de proveedor = compra; FAC a cliente = venta
        // El archivo de ARCA normalmente tiene una columna de tipo o se descarga por sección.
        // Aquí usamos el campo extra parts[9] si existe, sino defaulteamos a 'compra'.
        const tipoRaw = parts[9]?.trim().toLowerCase() ?? '';
        const tipo: 'compra' | 'venta' = tipoRaw.includes('venta') ? 'venta' : 'compra';

        rows.push({
            id: crypto.randomUUID(),
            tipo,
            fecha,
            numero_comprobante,
            tipo_comprobante: tipoComp,
            cuit_contraparte,
            denominacion,
            neto_gravado,
            total_iva,
            monto_total,
        });
    }
    return rows;
}

// ── Run matching algorithm ────────────────────────────────────────────────────
function computeMatches(arcaRows: ArcaRow[], bankRows: BankRow[]): { newArca: ArcaRow[]; newBank: BankRow[] } {
    // Reset all statuses
    const arca: ArcaRow[] = arcaRows.map(r => ({ ...r, matchStatus: 'unmatched' as MatchStatus, matchedBankId: null, matchScore: 0 }));
    const bank: BankRow[] = bankRows.map(r => ({ ...r, matchStatus: 'unmatched' as MatchStatus, matchedArcaId: null, matchScore: 0 }));

    // For each arca row, find best available bank row
    const usedBankIds = new Set<string>();

    // Sort arca by descending monto (greedy: match big amounts first to reduce ambiguity)
    const arcaOrder = [...arca].sort((a, b) => b.monto_total - a.monto_total);

    for (const arcaItem of arcaOrder) {
        const candidates = bank
            .filter(b => !usedBankIds.has(b.id))
            .map(b => ({ bank: b, score: scoreArcaBank(arcaItem, b) }))
            .filter(c => c.score > 0)
            .sort((a, b) => b.score - a.score);

        const best = candidates[0];
        if (!best) continue;

        const arcaIdx = arca.findIndex(r => r.id === arcaItem.id);
        const bankIdx = bank.findIndex(r => r.id === best.bank.id);

        let status: MatchStatus = 'unmatched';
        if (best.score >= 70) status = 'matched';
        else if (best.score >= 30) status = 'review';

        if (status !== 'unmatched') {
            arca[arcaIdx] = { ...arca[arcaIdx], matchStatus: status, matchedBankId: best.bank.id, matchScore: best.score };
            bank[bankIdx] = { ...bank[bankIdx], matchStatus: status, matchedArcaId: arcaItem.id, matchScore: best.score };
            usedBankIds.add(best.bank.id);
        }
    }

    return { newArca: arca, newBank: bank };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useConciliacion() {
    const { tenant } = useTenant();
    const { addToast } = useToast();

    const [arcaRows, setArcaRows] = useState<ArcaRow[]>([]);
    const [bankRows, setBankRows] = useState<BankRow[]>([]);
    const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; balance: number }[]>([]);
    const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
    const [bankFormat, setBankFormat] = useState<BankFormat>('supervielle');
    const [saving, setSaving] = useState(false);
    const [loadingAccounts, setLoadingAccounts] = useState(false);

    // Fetch bank accounts for tenant
    const fetchAccounts = useCallback(async () => {
        if (!tenant) return;
        setLoadingAccounts(true);
        const { data } = await supabase
            .from('treasury_accounts')
            .select('id, name, balance')
            .eq('tenant_id', tenant.id)
            .is('assigned_user_id', null)
            .order('name');
        if (data) {
            setBankAccounts(data);
            if (data.length > 0 && !selectedBankAccountId) setSelectedBankAccountId(data[0].id);
        }
        setLoadingAccounts(false);
    }, [tenant, selectedBankAccountId]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

    // Re-run matching whenever either side changes
    const reMatch = useCallback((arca: ArcaRow[], bank: BankRow[]) => {
        if (arca.length === 0 || bank.length === 0) {
            setArcaRows(arca.map(r => ({ ...r, matchStatus: 'unmatched', matchedBankId: null, matchScore: 0 })));
            setBankRows(bank.map(r => ({ ...r, matchStatus: 'unmatched', matchedArcaId: null, matchScore: 0 })));
            return;
        }
        const { newArca, newBank } = computeMatches(arca, bank);
        setArcaRows(newArca);
        setBankRows(newBank);
    }, []);

    // Load ARCA file
    const loadArcaFile = useCallback(async (file: File) => {
        const text = await file.text();
        const parsed = parseArcaCSV(text);
        if (parsed.length === 0) {
            addToast('error', 'Error', 'No se pudo parsear el archivo de ARCA o está vacío. Verificá el formato.');
            return;
        }
        const newArca: ArcaRow[] = parsed.map(r => ({ ...r, matchStatus: 'unmatched', matchedBankId: null, matchScore: 0 }));
        reMatch(newArca, bankRows);
        addToast('success', 'ARCA cargado', `${parsed.length} comprobantes importados.`);
    }, [bankRows, reMatch, addToast]);

    // Load bank CSV file
    const loadBankFile = useCallback(async (file: File) => {
        const text = await file.text();
        const parsed = bankFormat === 'supervielle' ? parseSupervielleCSV(text) : parseGenericCSV(text);
        if (parsed.length === 0) {
            addToast('error', 'Error', 'No se pudo parsear el CSV bancario o está vacío.');
            return;
        }
        const newBank: BankRow[] = parsed.map(r => ({
            id: crypto.randomUUID(),
            ...r,
            matchStatus: 'unmatched' as MatchStatus,
            matchedArcaId: null,
            matchScore: 0,
        }));
        reMatch(arcaRows, newBank);
        addToast('success', 'Banco cargado', `${parsed.length} movimientos importados.`);
    }, [arcaRows, bankFormat, reMatch, addToast]);

    // Manual match: force link between one arca and one bank row
    const manualMatch = useCallback((arcaId: string, bankId: string) => {
        setArcaRows(prev => prev.map(r => r.id === arcaId
            ? { ...r, matchStatus: 'matched', matchedBankId: bankId, matchScore: 100 }
            : r.matchedBankId === bankId ? { ...r, matchStatus: 'unmatched', matchedBankId: null, matchScore: 0 } : r
        ));
        setBankRows(prev => prev.map(r => r.id === bankId
            ? { ...r, matchStatus: 'matched', matchedArcaId: arcaId, matchScore: 100 }
            : r.matchedArcaId === arcaId ? { ...r, matchStatus: 'unmatched', matchedArcaId: null, matchScore: 0 } : r
        ));
    }, []);

    // Unlink a match
    const unlinkMatch = useCallback((arcaId: string) => {
        const arca = arcaRows.find(r => r.id === arcaId);
        if (!arca?.matchedBankId) return;
        const bankId = arca.matchedBankId;
        setArcaRows(prev => prev.map(r => r.id === arcaId
            ? { ...r, matchStatus: 'unmatched', matchedBankId: null, matchScore: 0 } : r
        ));
        setBankRows(prev => prev.map(r => r.id === bankId
            ? { ...r, matchStatus: 'unmatched', matchedArcaId: null, matchScore: 0 } : r
        ));
    }, [arcaRows]);

    // Validate and persist to Supabase
    const validateAndSave = useCallback(async () => {
        if (!tenant) return;
        if (!selectedBankAccountId) {
            addToast('error', 'Sin cuenta', 'Seleccioná una cuenta bancaria antes de guardar.');
            return;
        }
        setSaving(true);

        let matchedCount = 0;
        let arcaUnmatched = 0;
        let bankUnmatched = 0;
        const errors: string[] = [];

        // 1. Matched pairs
        for (const arca of arcaRows.filter(r => r.matchStatus === 'matched' && r.matchedBankId)) {
            const bank = bankRows.find(b => b.id === arca.matchedBankId);
            if (!bank) continue;

            const bankAmt = bank.credit > 0 ? bank.credit : bank.debit;
            const txType = bank.credit > 0 ? 'income' : 'expense';

            const [{ error: e1 }, { error: e2 }] = await Promise.all([
                supabase.from('contable_comprobantes').insert({
                    tenant_id: tenant.id,
                    tipo: arca.tipo,
                    fecha: arca.fecha,
                    numero_comprobante: arca.numero_comprobante,
                    tipo_comprobante: arca.tipo_comprobante,
                    ...(arca.tipo === 'compra' ? { cuit_emisor: arca.cuit_contraparte } : { cuit_receptor: arca.cuit_contraparte }),
                    monto_ars: arca.monto_total,
                    neto_gravado: arca.neto_gravado,
                    total_iva: arca.total_iva,
                    estado: 'pendiente',
                    origen: 'arca',
                    descripcion: `Conciliado — mov. banco: ${bank.concept} ${bank.date}`,
                }),
                supabase.from('treasury_transactions').insert({
                    tenant_id: tenant.id,
                    account_id: selectedBankAccountId,
                    type: txType,
                    amount: bankAmt,
                    date: bank.date,
                    status: 'completado',
                    description: `Conciliado — ${arca.tipo_comprobante} ${arca.numero_comprobante} · ${arca.denominacion}`,
                    payment_method: 'transferencia',
                }),
            ]);

            if (e1) errors.push(e1.message);
            if (e2) errors.push(e2.message);
            else matchedCount++;
        }

        // 2. ARCA sin match
        const arcaUnmatchedRows = arcaRows.filter(r => r.matchStatus === 'unmatched' || r.matchStatus === 'review');
        for (const arca of arcaUnmatchedRows) {
            const { error } = await supabase.from('contable_comprobantes').insert({
                tenant_id: tenant.id,
                tipo: arca.tipo,
                fecha: arca.fecha,
                numero_comprobante: arca.numero_comprobante,
                tipo_comprobante: arca.tipo_comprobante,
                ...(arca.tipo === 'compra' ? { cuit_emisor: arca.cuit_contraparte } : { cuit_receptor: arca.cuit_contraparte }),
                monto_ars: arca.monto_total,
                neto_gravado: arca.neto_gravado,
                total_iva: arca.total_iva,
                estado: 'pendiente',
                origen: 'arca',
                descripcion: 'Sin match bancario',
            });
            if (error) errors.push(error.message);
            else arcaUnmatched++;
        }

        // 3. Bank sin match
        const bankUnmatchedRows = bankRows.filter(r => r.matchStatus === 'unmatched' || r.matchStatus === 'review');
        for (const bank of bankUnmatchedRows) {
            const bankAmt = bank.credit > 0 ? bank.credit : bank.debit;
            const txType = bank.credit > 0 ? 'income' : 'expense';
            const { error } = await supabase.from('treasury_transactions').insert({
                tenant_id: tenant.id,
                account_id: selectedBankAccountId,
                type: txType,
                amount: bankAmt,
                date: bank.date,
                status: 'pendiente',
                description: `Sin match ARCA — ${bank.concept}`,
                payment_method: 'transferencia',
            });
            if (error) errors.push(error.message);
            else bankUnmatched++;
        }

        setSaving(false);

        if (errors.length > 0) {
            addToast('error', 'Errores al guardar', errors.slice(0, 2).join(' | '));
        } else {
            addToast('success', 'Guardado exitoso', `${matchedCount} pares conciliados guardados.`);
            if (arcaUnmatched > 0) addToast('warning', 'Sin match bancario', `${arcaUnmatched} comprobante(s) ARCA guardados sin movimiento bancario.`);
            if (bankUnmatched > 0) addToast('warning', 'Sin match ARCA', `${bankUnmatched} movimiento(s) bancarios guardados sin comprobante ARCA.`);
            // Clear session after successful save
            setArcaRows([]);
            setBankRows([]);
        }
    }, [tenant, arcaRows, bankRows, selectedBankAccountId, addToast]);

    // Computed stats
    const stats = useMemo(() => ({
        matched: arcaRows.filter(r => r.matchStatus === 'matched').length,
        review: arcaRows.filter(r => r.matchStatus === 'review').length,
        arcaUnmatched: arcaRows.filter(r => r.matchStatus === 'unmatched').length,
        bankUnmatched: bankRows.filter(r => r.matchStatus === 'unmatched').length,
        total: arcaRows.length + bankRows.length,
    }), [arcaRows, bankRows]);

    const clearArca = useCallback(() => {
        setArcaRows([]);
        setBankRows(prev => prev.map(r => ({ ...r, matchStatus: 'unmatched' as MatchStatus, matchedArcaId: null, matchScore: 0 })));
    }, []);

    const clearBank = useCallback(() => {
        setBankRows([]);
        setArcaRows(prev => prev.map(r => ({ ...r, matchStatus: 'unmatched' as MatchStatus, matchedBankId: null, matchScore: 0 })));
    }, []);

    return {
        arcaRows,
        bankRows,
        bankAccounts,
        selectedBankAccountId,
        setSelectedBankAccountId,
        bankFormat,
        setBankFormat,
        saving,
        loadingAccounts,
        loadArcaFile,
        loadBankFile,
        manualMatch,
        unlinkMatch,
        validateAndSave,
        clearArca,
        clearBank,
        stats,
    };
}
