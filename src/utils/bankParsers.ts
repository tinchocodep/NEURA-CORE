// ── Shared bank/ARCA parsing utilities ───────────────────────────────────────
// Extracted from Bancos.tsx for reuse in the Conciliacion module.

// ── Parse Argentinian number format ─────────────────────────────────────────
export function parseArgNum(s: string): number {
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

// ── Extract NOMBRE and DOCUMENTO (CUIT/DNI) from Supervielle detail ──────────
export function extractFromDetail(detail: string): { nombre: string; documento: string; cheque: string } {
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
export function normalize(s: string): string {
    return s.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// ── Check if two names share at least one meaningful word ────────────────────
export function namesOverlap(a: string, b: string): boolean {
    if (!a || !b) return false;
    const STOP = new Set(['DE', 'LA', 'EL', 'LOS', 'LAS', 'S', 'A', 'SA', 'SRL', 'SH', 'Y']);
    const wordsA = normalize(a).split(' ').filter(w => w.length > 2 && !STOP.has(w));
    const wordsB = normalize(b).split(' ').filter(w => w.length > 2 && !STOP.has(w));
    return wordsA.some(w => wordsB.includes(w));
}

export type ParsedBankRow = {
    date: string;
    concept: string;
    detail: string;
    debit: number;
    credit: number;
    balance: number;
    nombre: string;
    documento: string;
    cheque: string;
};

// ── Parse Supervielle CSV ─────────────────────────────────────────────────────
export function parseSupervielleCSV(text: string): ParsedBankRow[] {
    const lines = text.trim().split('\n');
    const rows: ParsedBankRow[] = [];
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
export function parseGenericCSV(text: string): ParsedBankRow[] {
    const lines = text.trim().split('\n');
    const rows: ParsedBankRow[] = [];
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
        if (parts.length < 3) continue;
        const rawDate = parts[0].split(' ')[0];
        const date = rawDate.replace(/\//g, '-');
        const concept = parts[1] || '';
        const amountStr = parts[2] || '0';
        let amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0;
        if (Number.isNaN(amount) || amount === 0) {
            amount = parseFloat(amountStr) || 0;
        }
        const isIncome = amount > 0;
        const absAmount = Math.abs(amount);
        rows.push({
            date,
            concept,
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

// ── Currency formatter ────────────────────────────────────────────────────────
export const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
