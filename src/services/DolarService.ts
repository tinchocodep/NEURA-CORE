/**
 * DolarService — Wraps dolarapi.com to fetch real-time ARS/USD exchange rates.
 *
 * We create an abstraction layer so if the upstream API changes or we switch
 * providers (e.g. to BCRA, Ámbito, etc.) only this file needs updating.
 *
 * Endpoints used:
 *   GET https://dolarapi.com/v1/dolares/oficial   → BNA Oficial
 *   GET https://dolarapi.com/v1/dolares/blue       → Blue / informal
 *   GET https://dolarapi.com/v1/dolares/bolsa      → MEP (Bolsa)
 *   GET https://dolarapi.com/v1/dolares/contadoconliqui → CCL
 */

/* ─── Types ─────────────────────────────────────────── */

export interface DolarCotizacion {
    nombre: string;
    compra: number;
    venta: number;
    fechaActualizacion: string;
}

export interface DolarResumen {
    oficial: DolarCotizacion | null;
    blue: DolarCotizacion | null;
    mep: DolarCotizacion | null;
    ccl: DolarCotizacion | null;
    fetchedAt: number;    // Date.now() when fetched
    isStale: boolean;     // true if cache is expired
    error: string | null;
}

/* ─── Constants ─────────────────────────────────────── */

const BASE_URL = 'https://dolarapi.com/v1/dolares';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache to avoid hammering API

/* ─── In-Memory Cache ────────────────────────────────── */

let cachedResumen: DolarResumen | null = null;

/* ─── API Call Wrapper ───────────────────────────────── */

/* fetchCotizacion removed — now using single bulk endpoint in getCotizaciones */

/* ─── Public API ─────────────────────────────────────── */

export const DolarService = {
    /**
     * Fetch all cotizaciones in parallel. Returns cached data if < 5min old.
     */
    async getCotizaciones(forceRefresh = false): Promise<DolarResumen> {
        // Return cache if valid
        if (!forceRefresh && cachedResumen && (Date.now() - cachedResumen.fetchedAt) < CACHE_TTL_MS) {
            return { ...cachedResumen, isStale: false };
        }

        try {
            // Single request to get all quotes
            const response = await fetch(`${BASE_URL}`, { headers: { 'Accept': 'application/json' } });
            let oficial: DolarCotizacion | null = null;
            let blue: DolarCotizacion | null = null;
            let mep: DolarCotizacion | null = null;
            let ccl: DolarCotizacion | null = null;

            if (response.ok) {
                const data = await response.json();
                const arr = Array.isArray(data) ? data : [];
                for (const d of arr) {
                    const cot: DolarCotizacion = { nombre: d.nombre || d.casa, compra: Number(d.compra) || 0, venta: Number(d.venta) || 0, fechaActualizacion: d.fechaActualizacion || '' };
                    if (d.casa === 'oficial') oficial = cot;
                    else if (d.casa === 'blue') blue = cot;
                    else if (d.casa === 'bolsa') mep = cot;
                    else if (d.casa === 'contadoconliqui') ccl = cot;
                }
            }

            const result: DolarResumen = {
                oficial,
                blue,
                mep,
                ccl,
                fetchedAt: Date.now(),
                isStale: false,
                error: (!oficial && !blue) ? 'No se pudo obtener cotizaciones' : null,
            };

            cachedResumen = result;
            return result;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Error desconocido al obtener cotizaciones';
            // Return stale cache if available, otherwise error
            if (cachedResumen) {
                return { ...cachedResumen, isStale: true, error: errorMessage };
            }
            return {
                oficial: null,
                blue: null,
                mep: null,
                ccl: null,
                fetchedAt: Date.now(),
                isStale: true,
                error: errorMessage,
            };
        }
    },

    /**
     * Get BNA oficial venta rate (most common for accounting).
     */
    async getOficialVenta(): Promise<number | null> {
        const data = await this.getCotizaciones();
        return data.oficial?.venta ?? null;
    },

    /**
     * Convert USD → ARS using BNA oficial venta rate.
     */
    async convertUsdToArs(amountUsd: number): Promise<{ ars: number; rate: number } | null> {
        const rate = await this.getOficialVenta();
        if (!rate) return null;
        return { ars: amountUsd * rate, rate };
    },

    /**
     * Clear cache (useful after manual refresh).
     */
    clearCache() {
        cachedResumen = null;
    },
};
