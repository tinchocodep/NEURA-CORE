import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { useSync } from '../../contexts/SyncContext';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Search, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

/* ── Types ─── */
interface ComprobanteAFIP {
    fechaEmision: string;
    tipoComprobante: string;
    puntoVenta: string;
    numeroDesde: string;
    numeroHasta: string;
    codAutorizacion: string;
    tipoDocReceptor: string;
    nroDocReceptor: string;
    denominacionReceptor: string;
    tipoCambio: string;
    moneda: string;
    netoGravado: number;
    netoNoGravado: number;
    exentas: number;
    otrosTributos: number;
    iva: number;
    total: number;
    tipo: 'venta' | 'compra'; // Derivado de la consulta (E=venta, R=compra)
}

interface ComprobanteLocal {
    id: string;
    tipo: string;
    tipo_comprobante: string;
    numero_comprobante: string;
    fecha: string;
    monto_original: number;
    neto_gravado: number | null;
    total_iva: number | null;
    cuit_emisor: string | null;
    cuit_receptor: string | null;
    estado: string;
    descripcion: string | null;
    source?: string | null;
    xubio_id?: string | null;
    cliente_nombre?: string;
    proveedor_nombre?: string;
}

type MatchStatus =
    | 'conciliado_total'   // A + S + X (misma clave, mismos montos)
    | 'falta_xubio'        // A + S, no X
    | 'falta_sistema'      // A + X, no S
    | 'falta_afip'         // S + X, no A
    | 'solo_afip'
    | 'solo_sistema'
    | 'solo_xubio'
    | 'diferencia';        // dos o tres lados matchean por clave pero difieren montos

type FilterGroup = 'todos' | 'conciliado' | 'parcial' | 'solo_uno' | 'diferencia';

interface ComprobanteMatch {
    afip: ComprobanteAFIP | null;
    sistema: ComprobanteLocal | null;
    xubio: ComprobanteLocal | null;
    status: MatchStatus;
    diferencias?: string[];
    key: string;
}

type TipoFiltro = 'todos' | 'venta' | 'compra';

function matchGroup(s: MatchStatus): Exclude<FilterGroup, 'todos'> {
    if (s === 'conciliado_total') return 'conciliado';
    if (s === 'falta_xubio' || s === 'falta_sistema' || s === 'falta_afip') return 'parcial';
    if (s === 'solo_afip' || s === 'solo_sistema' || s === 'solo_xubio') return 'solo_uno';
    return 'diferencia';
}

const TIPOS_COMPROBANTE_AFIP: Record<string, string> = {
    '1': 'Factura A', '2': 'Nota de Débito A', '3': 'Nota de Crédito A',
    '6': 'Factura B', '7': 'Nota de Débito B', '8': 'Nota de Crédito B',
    '11': 'Factura C', '12': 'Nota de Débito C', '13': 'Nota de Crédito C',
    '51': 'Factura M', '201': 'Factura de Crédito Electrónica A',
};

function parseAFIPNumber(s: string): number {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatDate(d: string): string {
    if (!d) return '';
    if (d.includes('-')) return d;
    const [dd, mm, yyyy] = d.split('/');
    return `${yyyy}-${mm}-${dd}`;
}

function formatCurrency(n: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
}

const AFIPSDK_API_KEY = '3zZiVxOJP4zPQbK5mEc6FXQOa34hOPAPTSu3bl2S51LewxPc15xUb63Dm43s4BiL';

/* ── Component ─── */
export default function ConciliacionComprobantes() {
    const { tenant } = useTenant();
    const { addToast } = useToast();
    const navigate = useNavigate();

    // Config
    const [config, setConfig] = useState<{ arca_cuit: string; arca_username: string; arca_password: string; punto_venta: number } | null>(null);
    const [configLoading, setConfigLoading] = useState(true);
    const [erpType, setErpType] = useState<string>('xubio');
    const [xubioConfigured, setXubioConfigured] = useState(false);

    // Filters
    const [filtroTipo, setFiltroTipo] = useState<TipoFiltro>('todos');
    const [fechaDesde, setFechaDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // Sync global (para que sobreviva navegacion)
    const sync = useSync();
    const cachedResult = sync.lastResult as { matches: ComprobanteMatch[]; afipCount: number; sistemaCount: number; xubioCount: number } | null;
    const isThisSyncRunning = sync.status === 'running' && sync.kind === 'conciliacion';
    const loading = isThisSyncRunning;
    const syncStep = isThisSyncRunning ? sync.step : null;

    // Results
    const [matches, setMatches] = useState<ComprobanteMatch[]>(cachedResult?.matches || []);
    const [consulted, setConsulted] = useState(!!cachedResult);
    const [filterGroup, setFilterGroup] = useState<FilterGroup>('todos');

    // Si el sync global termina mientras estamos en otra pantalla y volvemos, recuperar resultados
    useEffect(() => {
        if (sync.status === 'success' && sync.kind === 'conciliacion' && cachedResult) {
            setMatches(cachedResult.matches);
            setConsulted(true);
        }
    }, [sync.status, sync.kind]);

    // Modal detalle y estados de acciones
    const [detailMatch, setDetailMatch] = useState<ComprobanteMatch | null>(null);
    const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

    // Load config
    useEffect(() => {
        if (!tenant?.id) return;
        setConfigLoading(true);
        supabase.from('contable_config')
            .select('arca_cuit, arca_username, arca_password, punto_venta, erp_type, xubio_client_id')
            .eq('tenant_id', tenant.id)
            .maybeSingle()
            .then(({ data }) => {
                if (data) {
                    setConfig(data as any);
                    setErpType((data as any).erp_type || 'xubio');
                    setXubioConfigured(!!(data as any).xubio_client_id);
                }
                setConfigLoading(false);
            });
    }, [tenant?.id]);

    const isConfigured = config?.arca_cuit && config?.arca_username && config?.arca_password;
    // Demo mode: activo si el tenant no tiene credenciales ARCA. Simula la respuesta de AFIP
    // mutando los comprobantes locales para generar diferentes estados de conciliación.
    const isDemoMode = !isConfigured;

    function generateDemoAfip(sistemaList: ComprobanteLocal[], xubioList: ComprobanteLocal[] = []): ComprobanteAFIP[] {
        const afip: ComprobanteAFIP[] = [];
        const tipoAfipCode: Record<string, string> = {
            'Factura A': '1', 'Factura B': '6', 'Factura C': '11',
            'Nota de Crédito A': '3', 'Nota de Crédito B': '8', 'Nota de Crédito C': '13',
            'Nota de Débito A': '2', 'Nota de Débito B': '7', 'Nota de Débito C': '12',
        };

        // Combinamos sistema + xubio para el demo (con tag de origen para variar el patrón)
        const combined = [
            ...sistemaList.map((c, i) => ({ c, origin: 's' as const, i })),
            ...xubioList.map((c, i) => ({ c, origin: 'x' as const, i: i + sistemaList.length })),
        ];

        // 85% se matchean en AFIP (algunos con diferencia)
        combined.forEach(({ c: loc, i: idx }) => {
            // Skip ~15% para simular "solo sistema/xubio" (no está en AFIP)
            if (idx % 7 === 3) return;

            const totalLocal = Number(loc.monto_original) || 0;
            const netoLocal = Number(loc.neto_gravado) || totalLocal * 0.826;
            const ivaLocal = Number(loc.total_iva) || totalLocal * 0.174;

            // Cada 5to con diferencia pequeña en monto (simulando error de carga)
            const hasDiff = idx % 5 === 2;
            const factorDiff = hasDiff ? 1.02 : 1;

            const { pv, nro, letra } = parseLocalNumero(loc.numero_comprobante);
            const tipoCanon = canonicalizeTipoComp(loc.tipo_comprobante, letra);
            const tipoCode = tipoAfipCode[tipoCanon] || '6';

            afip.push({
                fechaEmision: loc.fecha.split('-').reverse().join('/'),
                tipoComprobante: tipoCode,
                puntoVenta: pv.replace(/^0+/, '') || '1',
                numeroDesde: nro.replace(/^0+/, '') || '1',
                numeroHasta: nro.replace(/^0+/, '') || '1',
                codAutorizacion: String(70000000000000 + idx * 137),
                tipoDocReceptor: '80',
                nroDocReceptor: loc.cuit_receptor || loc.cuit_emisor || '20000000000',
                denominacionReceptor: loc.cliente_nombre || loc.proveedor_nombre || '',
                tipoCambio: '1,00',
                moneda: 'PES',
                netoGravado: Math.round(netoLocal * factorDiff * 100) / 100,
                netoNoGravado: 0,
                exentas: 0,
                otrosTributos: 0,
                iva: Math.round(ivaLocal * factorDiff * 100) / 100,
                total: Math.round(totalLocal * factorDiff * 100) / 100,
            });
        });

        // Agregar 3 comprobantes "fantasma" que solo están en AFIP (no en el sistema)
        const base = new Date();
        for (let i = 0; i < 3; i++) {
            const d = new Date(base);
            d.setDate(d.getDate() - (i * 3 + 2));
            const monto = 45000 + i * 23000;
            const neto = Math.round(monto / 1.21 * 100) / 100;
            afip.push({
                fechaEmision: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
                tipoComprobante: '6',
                puntoVenta: '1',
                numeroDesde: String(9900 + i),
                numeroHasta: String(9900 + i),
                codAutorizacion: String(70999990000000 + i),
                tipoDocReceptor: '80',
                nroDocReceptor: '20123456789',
                denominacionReceptor: ['Proveedor AFIP sin carga', 'Factura extra AFIP', 'Consumidor Final AFIP'][i],
                tipoCambio: '1,00',
                moneda: 'PES',
                netoGravado: neto,
                netoNoGravado: 0,
                exentas: 0,
                otrosTributos: 0,
                iva: Math.round((monto - neto) * 100) / 100,
                total: monto,
            });
        }

        return afip;
    }

    async function executeAfipAutomation(params: Record<string, any>): Promise<any[]> {
        const createRes = await fetch('/api/afipsdk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFIPSDK_API_KEY}` },
            body: JSON.stringify({ automation: 'mis-comprobantes', params }),
        });
        if (!createRes.ok) {
            const err = await createRes.text();
            throw new Error(`AFIP SDK error: ${err}`);
        }
        const created = await createRes.json();
        const automationId = created.id;
        if (!automationId) throw new Error('AFIP SDK no devolvió ID de automatización');

        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const pollRes = await fetch(`/api/afipsdk/${automationId}`, {
                headers: { 'Authorization': `Bearer ${AFIPSDK_API_KEY}` },
            });
            if (!pollRes.ok) continue;
            const result = await pollRes.json();
            if (result.status === 'in_process') continue;
            if (result.status === 'complete' && Array.isArray(result.data)) return result.data;
            if (result.status === 'error') throw new Error(result.message || 'Error en automatización AFIP');
            return result.data || [];
        }
        throw new Error('Timeout esperando respuesta de AFIP SDK');
    }

    async function fetchAFIPOne(t: 'E' | 'R'): Promise<ComprobanteAFIP[]> {
        if (!config) return [];
        const fromDate = fechaDesde.split('-').reverse().join('/');
        const toDate = fechaHasta.split('-').reverse().join('/');
        const tipo = t === 'E' ? 'venta' : 'compra';
        const data = await executeAfipAutomation({
            cuit: config.arca_cuit.replace(/-/g, ''),
            username: config.arca_username.replace(/-/g, ''),
            password: config.arca_password,
            filters: {
                t,
                fechaEmision: `${fromDate} - ${toDate}`,
                ...(config.punto_venta && t === 'E' ? { puntosVenta: [config.punto_venta] } : {}),
            },
        });
        return data.map((r: any) => ({
            fechaEmision: r['Fecha de Emisión'] || '',
            tipoComprobante: r['Tipo de Comprobante'] || '',
            puntoVenta: r['Punto de Venta'] || '',
            numeroDesde: r['Número Desde'] || '',
            numeroHasta: r['Número Hasta'] || '',
            codAutorizacion: r['Cód. Autorización'] || '',
            tipoDocReceptor: r['Tipo Doc. Receptor'] || '',
            nroDocReceptor: r['Nro. Doc. Receptor'] || '',
            denominacionReceptor: r['Denominación Receptor'] || '',
            tipoCambio: r['Tipo Cambio'] || '1,00',
            moneda: r['Moneda'] || 'PES',
            netoGravado: parseAFIPNumber(r['Imp. Neto Gravado'] || '0'),
            netoNoGravado: parseAFIPNumber(r['Imp. Neto No Gravado'] || '0'),
            exentas: parseAFIPNumber(r['Imp. Op. Exentas'] || '0'),
            otrosTributos: parseAFIPNumber(r['Otros Tributos'] || '0'),
            iva: parseAFIPNumber(r['IVA'] || '0'),
            total: parseAFIPNumber(r['Imp. Total'] || '0'),
            tipo,
        }));
    }

    async function fetchAFIP(): Promise<ComprobanteAFIP[]> {
        if (!config) return [];
        const [emitidos, recibidos] = await Promise.all([
            fetchAFIPOne('E').catch(e => { console.error('AFIP E error:', e); return [] as ComprobanteAFIP[]; }),
            fetchAFIPOne('R').catch(e => { console.error('AFIP R error:', e); return [] as ComprobanteAFIP[]; }),
        ]);
        return [...emitidos, ...recibidos];
    }

    async function fetchLocalBuckets(): Promise<{ sistema: ComprobanteLocal[]; xubio: ComprobanteLocal[] }> {
        if (!tenant?.id) return { sistema: [], xubio: [] };

        const { data } = await supabase
            .from('contable_comprobantes')
            .select('id, tipo, tipo_comprobante, numero_comprobante, fecha, monto_original, neto_gravado, total_iva, cuit_emisor, cuit_receptor, estado, descripcion, source, xubio_id, cliente:contable_clientes!cliente_id(razon_social), proveedor:contable_proveedores!proveedor_id(razon_social)')
            .eq('tenant_id', tenant.id)
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
            .order('fecha', { ascending: false });

        const sistema: ComprobanteLocal[] = [];
        const xubio: ComprobanteLocal[] = [];
        for (const c of (data || []) as any[]) {
            const mapped: ComprobanteLocal = {
                ...c,
                cliente_nombre: c.cliente?.razon_social || undefined,
                proveedor_nombre: c.proveedor?.razon_social || undefined,
            };
            if (c.source === 'xubio' || c.xubio_id) xubio.push(mapped);
            else sistema.push(mapped);
        }
        return { sistema, xubio };
    }

    // --- Claves canónicas para cruzar los 3 sets ---

    function normalizeCuit(raw: string | null | undefined): string {
        const d = (raw || '').toString().replace(/\D/g, '');
        if (d.length !== 11) return d;
        return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
    }

    function parseLocalNumero(numero: string | null | undefined): { pv: string; nro: string; letra: string } {
        const raw = (numero || '').trim();
        // Formato Xubio: "A-00007-00000904" (letra-pv-nro)
        const xubioMatch = raw.match(/^([A-Za-z])-(\d+)-(\d+)$/);
        if (xubioMatch) {
            const [, letra, pv, nro] = xubioMatch;
            return { letra: letra.toUpperCase(), pv: pv.padStart(5, '0'), nro: nro.padStart(8, '0') };
        }
        // Formato estándar: "00001-00000012"
        if (raw.includes('-')) {
            const parts = raw.split('-');
            return { letra: '', pv: (parts[0] || '').replace(/\D/g, '').padStart(5, '0'), nro: (parts[1] || '').replace(/\D/g, '').padStart(8, '0') };
        }
        return { letra: '', pv: '00000', nro: raw.replace(/\D/g, '').padStart(8, '0') };
    }

    function canonicalizeTipoComp(tipo: string | null | undefined, letra: string): string {
        const t = (tipo || '').trim();
        if (!t) return letra ? `Factura ${letra}` : '';
        // Si ya termina con letra (A/B/C/E/M), devolver normalizado
        const endsWithLetter = /\s([ABCEMabcem])$/.exec(t);
        if (endsWithLetter) return t.slice(0, -1) + endsWithLetter[1].toUpperCase();
        // Si no tiene letra pero tenemos una de numero_comprobante → combinar
        if (letra) return `${t} ${letra}`;
        return t;
    }

    function afipToKey(a: ComprobanteAFIP): string {
        const tipoComp = TIPOS_COMPROBANTE_AFIP[a.tipoComprobante] || `Tipo ${a.tipoComprobante}`;
        const pv = (a.puntoVenta || '').replace(/\D/g, '').padStart(5, '0');
        const nro = (a.numeroDesde || '').replace(/\D/g, '').padStart(8, '0');
        const cuit = normalizeCuit(a.nroDocReceptor);
        return `${a.tipo}|${tipoComp}|${pv}-${nro}|${cuit}`;
    }

    function localToKey(l: ComprobanteLocal): string {
        const { pv, nro, letra } = parseLocalNumero(l.numero_comprobante);
        const tipoComp = canonicalizeTipoComp(l.tipo_comprobante, letra);
        const cuitRaw = l.tipo === 'venta' ? l.cuit_receptor : l.cuit_emisor;
        const cuit = normalizeCuit(cuitRaw);
        return `${l.tipo}|${tipoComp}|${pv}-${nro}|${cuit}`;
    }

    function conciliar(
        afipList: ComprobanteAFIP[],
        sistemaList: ComprobanteLocal[],
        xubioList: ComprobanteLocal[]
    ): ComprobanteMatch[] {
        const buckets = new Map<string, { afip?: ComprobanteAFIP; sistema?: ComprobanteLocal; xubio?: ComprobanteLocal }>();

        for (const a of afipList) {
            const k = afipToKey(a);
            if (!buckets.has(k)) buckets.set(k, {});
            if (!buckets.get(k)!.afip) buckets.get(k)!.afip = a;
        }
        for (const l of sistemaList) {
            const k = localToKey(l);
            if (!buckets.has(k)) buckets.set(k, {});
            if (!buckets.get(k)!.sistema) buckets.get(k)!.sistema = l;
        }
        for (const l of xubioList) {
            const k = localToKey(l);
            if (!buckets.has(k)) buckets.set(k, {});
            if (!buckets.get(k)!.xubio) buckets.get(k)!.xubio = l;
        }

        const result: ComprobanteMatch[] = [];
        for (const [key, { afip, sistema, xubio }] of buckets) {
            const hasA = !!afip, hasS = !!sistema, hasX = !!xubio;

            let status: MatchStatus;
            if (hasA && hasS && hasX) status = 'conciliado_total';
            else if (hasA && hasS) status = 'falta_xubio';
            else if (hasA && hasX) status = 'falta_sistema';
            else if (hasS && hasX) status = 'falta_afip';
            else if (hasA) status = 'solo_afip';
            else if (hasS) status = 'solo_sistema';
            else status = 'solo_xubio';

            const difs: string[] = [];
            const totals: Array<[string, number]> = [];
            if (afip) totals.push(['AFIP', afip.total]);
            if (sistema) totals.push(['Sistema', Number(sistema.monto_original)]);
            if (xubio) totals.push(['Xubio', Number(xubio.monto_original)]);
            if (totals.length >= 2) {
                const values = totals.map(t => t[1]);
                const min = Math.min(...values), max = Math.max(...values);
                if (max - min >= 0.01) {
                    difs.push(`Montos: ${totals.map(([l, v]) => `${l} ${formatCurrency(v)}`).join(' · ')}`);
                    status = 'diferencia';
                }
            }

            result.push({
                afip: afip || null,
                sistema: sistema || null,
                xubio: xubio || null,
                status,
                diferencias: difs.length > 0 ? difs : undefined,
                key,
            });
        }

        return result;
    }

    async function handleConciliar() {
        if (!tenant?.id) return;
        if (sync.status === 'running') {
            addToast('info', 'Proceso en curso', 'Ya hay una conciliación corriendo.');
            return;
        }
        setConsulted(false);

        const out = await sync.run('conciliacion', async (setStep) => {
            // Paso 1: sync Xubio (si está configurado) para traer lo último del ERP
            if (erpType === 'xubio' && xubioConfigured) {
                setStep('Sincronizando Xubio...');
                try {
                    const { getXubioService } = await import('../../services/XubioService');
                    const xubio = getXubioService(tenant.id);
                    await xubio.loadConfig();
                    if (xubio.isConfigured) {
                        const res = await xubio.syncComprobantes(fechaDesde || undefined, fechaHasta || undefined);
                        console.log('[Xubio sync]', res);
                    }
                } catch (e: any) {
                    console.error('Xubio sync error:', e);
                    addToast('warning', 'Xubio sync falló', 'Seguimos con lo que ya está en la base. ' + (e.message || ''));
                }
            }

            // Paso 2: leer comprobantes locales (sistema + xubio separados)
            setStep('Leyendo sistema...');
            const { sistema, xubio } = await fetchLocalBuckets();

            // Paso 3: AFIP (solo si hay credenciales configuradas)
            let afipList: ComprobanteAFIP[] = [];
            if (isConfigured) {
                setStep('Consultando AFIP...');
                afipList = await fetchAFIP();
            }

            // Paso 4: cruzar los sets
            setStep('Cruzando datos...');
            const matches = conciliar(afipList, sistema, xubio);
            return { matches, afipCount: afipList.length, sistemaCount: sistema.length, xubioCount: xubio.length };
        });

        if (out) {
            setMatches(out.matches);
            setConsulted(true);
            addToast('success', 'Conciliación completa',
                isConfigured
                    ? `${out.afipCount} AFIP · ${out.sistemaCount} Sistema · ${out.xubioCount} Xubio`
                    : `${out.sistemaCount} Sistema · ${out.xubioCount} Xubio (ARCA sin configurar)`);
        } else if (sync.status === 'error') {
            addToast('error', 'Error', sync.error || 'Error al conciliar');
        }
    }

    // Helper: recalcula status de un match después de mutar uno de sus lados
    function recomputeStatus(m: ComprobanteMatch): MatchStatus {
        const hasA = !!m.afip, hasS = !!m.sistema, hasX = !!m.xubio;
        if (hasA && hasS && hasX) return 'conciliado_total';
        if (hasA && hasS) return 'falta_xubio';
        if (hasA && hasX) return 'falta_sistema';
        if (hasS && hasX) return 'falta_afip';
        if (hasA) return 'solo_afip';
        if (hasS) return 'solo_sistema';
        return 'solo_xubio';
    }

    function updateMatch(key: string, mutator: (m: ComprobanteMatch) => ComprobanteMatch) {
        setMatches(prev => prev.map(m => m.key === key ? { ...mutator(m), status: recomputeStatus(mutator(m)) } : m));
    }

    async function handleInyectarAXubio(m: ComprobanteMatch) {
        if (!tenant?.id || !m.sistema) return;
        const comp = m.sistema;
        setImportingIds(prev => new Set(prev).add(m.key));
        try {
            const { getXubioService } = await import('../../services/XubioService');
            const xubio = getXubioService(tenant.id);
            await xubio.loadConfig();
            if (!xubio.isConfigured) {
                addToast('error', 'Xubio no configurado', 'Cargá credenciales de Xubio en Configuración.');
                return;
            }

            // Buscar xubio_id de la contraparte (cliente o proveedor) en nuestra DB
            const table = comp.tipo === 'venta' ? 'contable_clientes' : 'contable_proveedores';
            const cuitContraparte = comp.tipo === 'venta' ? comp.cuit_receptor : comp.cuit_emisor;
            if (!cuitContraparte) {
                addToast('error', 'Falta CUIT', 'El comprobante no tiene CUIT de contraparte.');
                return;
            }
            const { data: entidad } = await supabase.from(table)
                .select('xubio_id, razon_social')
                .eq('tenant_id', tenant.id)
                .eq('cuit', cuitContraparte)
                .maybeSingle();
            const xubioIdContraparte = (entidad as any)?.xubio_id;
            if (!xubioIdContraparte) {
                addToast('error', comp.tipo === 'venta' ? 'Cliente sin xubio_id' : 'Proveedor sin xubio_id',
                    `${(entidad as any)?.razon_social || cuitContraparte} no está sincronizado con Xubio. Sincronizá primero en el módulo.`);
                return;
            }

            // Armar 1 línea sintética a partir de monto + IVA
            const montoTotal = Number(comp.monto_original) || 0;
            const netoGravado = Number(comp.neto_gravado) || 0;
            const totalIva = Number(comp.total_iva) || 0;
            const netoCalc = netoGravado > 0 ? netoGravado : montoTotal / 1.21;
            const ivaPct = netoGravado > 0 && totalIva > 0
                ? Math.round((totalIva / netoGravado) * 100)
                : 21;

            const result = await xubio.injectComprobante({
                tipo: comp.tipo as 'venta' | 'compra',
                tipo_comprobante: comp.tipo_comprobante,
                fecha: comp.fecha,
                numero_comprobante: comp.numero_comprobante,
                moneda: 'ARS',
                [comp.tipo === 'venta' ? 'cliente_xubio_id' : 'proveedor_xubio_id']: Number(xubioIdContraparte),
                lineas: [{
                    descripcion: comp.descripcion || `Comprobante ${comp.numero_comprobante}`,
                    cantidad: 1,
                    precio_unitario: Math.round(netoCalc * 100) / 100,
                    iva_porcentaje: ivaPct || 21,
                }],
            });

            if (result.success) {
                const nowIso = new Date().toISOString();
                await supabase.from('contable_comprobantes').update({
                    xubio_id: String(result.xubioId),
                    xubio_synced_at: nowIso,
                }).eq('id', comp.id);
                addToast('success', 'Inyectado en Xubio', `Comprobante ${comp.numero_comprobante} enviado (xubio_id ${result.xubioId}).`);
                // Actualización local: el mismo comprobante ahora también cuenta como "xubio"
                updateMatch(m.key, (cur) => ({
                    ...cur,
                    xubio: { ...comp, xubio_id: String(result.xubioId), source: 'xubio' } as any,
                }));
            } else {
                addToast('error', 'Xubio rechazó', result.error || 'Error desconocido');
            }
        } catch (err: any) {
            addToast('error', 'Error al inyectar', err.message || 'No se pudo inyectar a Xubio');
        } finally {
            setImportingIds(prev => {
                const s = new Set(prev);
                s.delete(m.key);
                return s;
            });
        }
    }

    async function handleImportarDesdeXubio(m: ComprobanteMatch) {
        if (!tenant?.id || !m.xubio) return;
        const xubio = m.xubio;
        setImportingIds(prev => new Set(prev).add(m.key));
        try {
            // Clonar la fila de Xubio como una nueva fila "del sistema" (sin xubio_id)
            const { data: inserted, error } = await supabase.from('contable_comprobantes').insert({
                tenant_id: tenant.id,
                tipo: xubio.tipo,
                tipo_comprobante: xubio.tipo_comprobante,
                numero_comprobante: xubio.numero_comprobante,
                fecha: xubio.fecha,
                monto_original: xubio.monto_original,
                monto_ars: xubio.monto_original,
                neto_gravado: xubio.neto_gravado ?? 0,
                total_iva: xubio.total_iva ?? 0,
                cuit_emisor: xubio.cuit_emisor,
                cuit_receptor: xubio.cuit_receptor,
                descripcion: xubio.descripcion,
                estado: 'pendiente',
                source: 'import_xubio',
                origen: 'manual',
            }).select().single();
            if (error) throw error;
            addToast('success', 'Importado', `Comprobante ${xubio.numero_comprobante} copiado al sistema`);
            // Actualización local: ahora existe en sistema
            const nuevoSistema: ComprobanteLocal = {
                ...(inserted as any),
                cliente_nombre: xubio.cliente_nombre,
                proveedor_nombre: xubio.proveedor_nombre,
            };
            updateMatch(m.key, (cur) => ({ ...cur, sistema: nuevoSistema }));
        } catch (err: any) {
            addToast('error', 'Error al importar', err.message || 'No se pudo importar');
        } finally {
            setImportingIds(prev => {
                const s = new Set(prev);
                s.delete(m.key);
                return s;
            });
        }
    }

    function matchTipo(m: ComprobanteMatch): 'venta' | 'compra' | null {
        return (m.afip?.tipo || m.sistema?.tipo || m.xubio?.tipo || null) as 'venta' | 'compra' | null;
    }

    const filtered = matches.filter(m => {
        if (filterGroup !== 'todos' && matchGroup(m.status) !== filterGroup) return false;
        if (filtroTipo !== 'todos' && matchTipo(m) !== filtroTipo) return false;
        return true;
    });

    const stats = {
        conciliado: matches.filter(m => matchGroup(m.status) === 'conciliado').length,
        parcial: matches.filter(m => matchGroup(m.status) === 'parcial').length,
        soloUno: matches.filter(m => matchGroup(m.status) === 'solo_uno').length,
        diferencia: matches.filter(m => matchGroup(m.status) === 'diferencia').length,
    };

    if (configLoading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando configuración...</div>;

    return (
        <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Conciliación de Comprobantes</h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cruzá comprobantes de ARCA con los del sistema</p>
                </div>
            </div>

            {/* Banner sin ARCA configurado */}
            {isDemoMode && (
                <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderLeft: '4px solid #3B82F6', background: 'rgba(59, 130, 246, 0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={20} color="#3B82F6" />
                        <div>
                            <p style={{ fontWeight: 600 }}>ARCA sin configurar</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cruzando solo <strong>Sistema</strong> y <strong>Xubio</strong>. Para incluir AFIP cargá credenciales ARCA en la configuración del tenant.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Desde</label>
                        <input className="form-input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Hasta</label>
                        <input className="form-input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Mostrar</label>
                        <select className="form-input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoFiltro)} style={{ width: 140 }}>
                            <option value="todos">Todos</option>
                            <option value="venta">Solo ventas</option>
                            <option value="compra">Solo compras</option>
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={handleConciliar} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {loading ? <RefreshCw size={14} className="spinning" /> : <Search size={14} />}
                        {loading ? (syncStep || 'Procesando...') : 'Conciliar todo'}
                    </button>
                </div>
            </div>

            {/* Stats KPIs */}
            {consulted && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <button onClick={() => setFilterGroup('todos')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterGroup === 'todos' ? '2px solid var(--primary)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{matches.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</div>
                    </button>
                    <button onClick={() => setFilterGroup('conciliado')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterGroup === 'conciliado' ? '2px solid var(--success)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{stats.conciliado}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Conciliado (3/3)</div>
                    </button>
                    <button onClick={() => setFilterGroup('parcial')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterGroup === 'parcial' ? '2px solid #f59e0b' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{stats.parcial}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Falta en un lado</div>
                    </button>
                    <button onClick={() => setFilterGroup('solo_uno')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterGroup === 'solo_uno' ? '2px solid var(--danger)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>{stats.soloUno}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solo en uno</div>
                    </button>
                    <button onClick={() => setFilterGroup('diferencia')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterGroup === 'diferencia' ? '2px solid var(--warning)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{stats.diferencia}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Diferencias</div>
                    </button>
                </div>
            )}

            {/* Results table */}
            {consulted && (
                <div className="card" style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-subtle)', textAlign: 'left' }}>
                                <th style={{ padding: '0.75rem' }}>Estado</th>
                                <th style={{ padding: '0.75rem' }}>V/C</th>
                                <th style={{ padding: '0.75rem' }}>Tipo</th>
                                <th style={{ padding: '0.75rem' }}>Número</th>
                                <th style={{ padding: '0.75rem' }}>Fecha</th>
                                <th style={{ padding: '0.75rem' }}>Contraparte</th>
                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>AFIP</th>
                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Sistema</th>
                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Xubio</th>
                                <th style={{ padding: '0.75rem' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay resultados para este filtro</td></tr>
                            )}
                            {filtered.map((m, i) => {
                                const statusIcon = m.status === 'conciliado_total' ? <CheckCircle size={16} color="var(--success)" />
                                    : m.status === 'diferencia' ? <AlertTriangle size={16} color="var(--warning)" />
                                    : matchGroup(m.status) === 'parcial' ? <AlertTriangle size={16} color="#f59e0b" />
                                    : <XCircle size={16} color="var(--danger)" />;

                                const statusLabels: Record<MatchStatus, string> = {
                                    conciliado_total: 'Conciliado',
                                    falta_xubio: 'Falta Xubio',
                                    falta_sistema: 'Falta Sistema',
                                    falta_afip: 'Falta AFIP',
                                    solo_afip: 'Solo AFIP',
                                    solo_sistema: 'Solo Sistema',
                                    solo_xubio: 'Solo Xubio',
                                    diferencia: 'Diferencia',
                                };

                                const tipoNombre = m.afip ? (TIPOS_COMPROBANTE_AFIP[m.afip.tipoComprobante] || `Tipo ${m.afip.tipoComprobante}`)
                                    : (m.sistema?.tipo_comprobante || m.xubio?.tipo_comprobante || '-');
                                const numero = m.afip ? `${m.afip.puntoVenta.padStart(5, '0')}-${m.afip.numeroDesde.padStart(8, '0')}`
                                    : (m.sistema?.numero_comprobante || m.xubio?.numero_comprobante || '-');
                                const fecha = m.afip ? m.afip.fechaEmision
                                    : (m.sistema?.fecha || m.xubio?.fecha || '-');
                                const contraparte = m.afip ? m.afip.denominacionReceptor
                                    : (m.sistema?.cliente_nombre || m.sistema?.proveedor_nombre
                                        || m.xubio?.cliente_nombre || m.xubio?.proveedor_nombre || '-');

                                const cell = (hasIt: boolean, value: number | null) => hasIt
                                    ? <span style={{ color: 'var(--success)', fontWeight: 500 }}>✓ {value != null ? formatCurrency(value) : ''}</span>
                                    : <span style={{ color: 'var(--text-muted)' }}>✗</span>;

                                const tipoVC = matchTipo(m);
                                const vcBadge = tipoVC === 'venta'
                                    ? <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Venta</span>
                                    : tipoVC === 'compra'
                                        ? <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>Compra</span>
                                        : <span style={{ color: 'var(--text-muted)' }}>-</span>;

                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td style={{ padding: '0.6rem 0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {statusIcon}
                                                <span style={{ fontSize: '0.7rem' }}>{statusLabels[m.status]}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.75rem' }}>{vcBadge}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>{tipoNombre}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{numero}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>{fecha}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contraparte}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>{cell(!!m.afip, m.afip?.total ?? null)}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>{cell(!!m.sistema, m.sistema ? Number(m.sistema.monto_original) : null)}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.75rem' }}>{cell(!!m.xubio, m.xubio ? Number(m.xubio.monto_original) : null)}</td>
                                        <td style={{ padding: '0.6rem 0.75rem' }}>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => setDetailMatch(m)}
                                                    className="btn btn-secondary"
                                                    style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                                                    title="Ver comparación completa"
                                                >
                                                    Ver
                                                </button>
                                                {m.xubio && !m.sistema && (
                                                    <button
                                                        onClick={() => handleImportarDesdeXubio(m)}
                                                        disabled={importingIds.has(m.key)}
                                                        className="btn btn-primary"
                                                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                                                        title="Copiar este comprobante de Xubio al sistema"
                                                    >
                                                        {importingIds.has(m.key) ? '...' : 'Importar'}
                                                    </button>
                                                )}
                                                {m.sistema && !m.xubio && (
                                                    <button
                                                        onClick={() => handleInyectarAXubio(m)}
                                                        disabled={importingIds.has(m.key)}
                                                        className="btn btn-primary"
                                                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                                                        title="Inyectar a Xubio"
                                                    >
                                                        {importingIds.has(m.key) ? '...' : '→ Xubio'}
                                                    </button>
                                                )}
                                                {!m.afip && tipoVC === 'venta' && (
                                                    <button
                                                        onClick={() => navigate('/agro/facturar')}
                                                        className="btn btn-secondary"
                                                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                                                        title="Emitir factura en ARCA"
                                                    >
                                                        Emitir ARCA
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de detalle */}
            {detailMatch && (
                <div
                    onClick={() => setDetailMatch(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className="card"
                        style={{ maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Detalle de comparación</h3>
                            <button onClick={() => setDetailMatch(null)} className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }}>✕</button>
                        </div>
                        {detailMatch.diferencias && detailMatch.diferencias.length > 0 && (
                            <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.08)', borderLeft: '3px solid #f59e0b', marginBottom: '1rem', fontSize: '0.8rem' }}>
                                {detailMatch.diferencias.map((d, i) => <div key={i}>⚠ {d}</div>)}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                            {/* AFIP */}
                            <div className="card" style={{ padding: '1rem' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>AFIP</div>
                                {detailMatch.afip ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Tipo:</span> {TIPOS_COMPROBANTE_AFIP[detailMatch.afip.tipoComprobante] || `Tipo ${detailMatch.afip.tipoComprobante}`}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Nro:</span> {detailMatch.afip.puntoVenta.padStart(5, '0')}-{detailMatch.afip.numeroDesde.padStart(8, '0')}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Fecha:</span> {detailMatch.afip.fechaEmision}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>CUIT:</span> {detailMatch.afip.nroDocReceptor}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Contraparte:</span> {detailMatch.afip.denominacionReceptor}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Neto:</span> {formatCurrency(detailMatch.afip.netoGravado)}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>IVA:</span> {formatCurrency(detailMatch.afip.iva)}</div>
                                        <div style={{ fontWeight: 600 }}><span style={{ color: 'var(--text-muted)' }}>Total:</span> {formatCurrency(detailMatch.afip.total)}</div>
                                    </div>
                                ) : <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No está en AFIP</div>}
                            </div>
                            {/* Sistema */}
                            <div className="card" style={{ padding: '1rem' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>Sistema</div>
                                {detailMatch.sistema ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Tipo:</span> {detailMatch.sistema.tipo_comprobante}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Nro:</span> {detailMatch.sistema.numero_comprobante}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Fecha:</span> {detailMatch.sistema.fecha}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>CUIT emisor:</span> {detailMatch.sistema.cuit_emisor || '-'}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>CUIT receptor:</span> {detailMatch.sistema.cuit_receptor || '-'}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Contraparte:</span> {detailMatch.sistema.cliente_nombre || detailMatch.sistema.proveedor_nombre || '-'}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Neto:</span> {formatCurrency(Number(detailMatch.sistema.neto_gravado || 0))}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>IVA:</span> {formatCurrency(Number(detailMatch.sistema.total_iva || 0))}</div>
                                        <div style={{ fontWeight: 600 }}><span style={{ color: 'var(--text-muted)' }}>Total:</span> {formatCurrency(Number(detailMatch.sistema.monto_original))}</div>
                                    </div>
                                ) : <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No está en el sistema</div>}
                            </div>
                            {/* Xubio */}
                            <div className="card" style={{ padding: '1rem' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>Xubio</div>
                                {detailMatch.xubio ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Tipo:</span> {detailMatch.xubio.tipo_comprobante}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Nro:</span> {detailMatch.xubio.numero_comprobante}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Fecha:</span> {detailMatch.xubio.fecha}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>CUIT emisor:</span> {detailMatch.xubio.cuit_emisor || '-'}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>CUIT receptor:</span> {detailMatch.xubio.cuit_receptor || '-'}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Contraparte:</span> {detailMatch.xubio.cliente_nombre || detailMatch.xubio.proveedor_nombre || '-'}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Neto:</span> {formatCurrency(Number(detailMatch.xubio.neto_gravado || 0))}</div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>IVA:</span> {formatCurrency(Number(detailMatch.xubio.total_iva || 0))}</div>
                                        <div style={{ fontWeight: 600 }}><span style={{ color: 'var(--text-muted)' }}>Total:</span> {formatCurrency(Number(detailMatch.xubio.monto_original))}</div>
                                    </div>
                                ) : <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No está en Xubio</div>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
                            {detailMatch.xubio && !detailMatch.sistema && (
                                <button
                                    onClick={() => { handleImportarDesdeXubio(detailMatch); setDetailMatch(null); }}
                                    disabled={importingIds.has(detailMatch.key)}
                                    className="btn btn-primary"
                                >
                                    Importar de Xubio al sistema
                                </button>
                            )}
                            {detailMatch.sistema && !detailMatch.xubio && (
                                <button
                                    onClick={() => { handleInyectarAXubio(detailMatch); setDetailMatch(null); }}
                                    disabled={importingIds.has(detailMatch.key)}
                                    className="btn btn-primary"
                                >
                                    Inyectar a Xubio
                                </button>
                            )}
                            {!detailMatch.afip && matchTipo(detailMatch) === 'venta' && (
                                <button
                                    onClick={() => { navigate('/agro/facturar'); setDetailMatch(null); }}
                                    className="btn btn-secondary"
                                >
                                    Emitir en ARCA
                                </button>
                            )}
                            <button onClick={() => setDetailMatch(null)} className="btn btn-secondary">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!consulted && !loading && isConfigured && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <Search size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Seleccioná el rango de fechas y hacé clic en "Conciliar" para cruzar comprobantes</p>
                </div>
            )}
        </div>
    );
}
