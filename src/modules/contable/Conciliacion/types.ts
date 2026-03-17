export type MatchStatus = 'matched' | 'review' | 'unmatched';

export interface ArcaRow {
    id: string;
    tipo: 'compra' | 'venta';
    fecha: string;                // YYYY-MM-DD
    numero_comprobante: string;   // "0001-00001234"
    tipo_comprobante: string;     // "FAC", "NCC", "NDC", etc.
    cuit_contraparte: string;
    denominacion: string;
    neto_gravado: number;
    total_iva: number;
    monto_total: number;
    matchStatus: MatchStatus;
    matchedBankId: string | null;
    matchScore: number;
}

export interface BankRow {
    id: string;
    date: string;                 // YYYY-MM-DD
    concept: string;
    detail: string;
    debit: number;
    credit: number;
    nombre: string;
    documento: string;
    cheque: string;
    matchStatus: MatchStatus;
    matchedArcaId: string | null;
    matchScore: number;
}

export type BankFormat = 'supervielle' | 'generico';
