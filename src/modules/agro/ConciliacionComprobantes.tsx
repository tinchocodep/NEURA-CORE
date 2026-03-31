import { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Search, CheckCircle, AlertTriangle, XCircle, Filter, Download } from 'lucide-react';

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
    cliente_nombre?: string;
    proveedor_nombre?: string;
}

interface ComprobanteMatch {
    afip: ComprobanteAFIP | null;
    local: ComprobanteLocal | null;
    status: 'conciliado' | 'diferencia' | 'solo_afip' | 'solo_sistema';
    diferencias?: string[];
}

type TipoConsulta = 'E' | 'R';

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

    // Config
    const [config, setConfig] = useState<{ arca_cuit: string; arca_username: string; arca_password: string; punto_venta: number } | null>(null);
    const [configLoading, setConfigLoading] = useState(true);

    // Filters
    const [tipoConsulta, setTipoConsulta] = useState<TipoConsulta>('E');
    const [fechaDesde, setFechaDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // Results
    const [matches, setMatches] = useState<ComprobanteMatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [consulted, setConsulted] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('todos');

    // Load config
    useEffect(() => {
        if (!tenant?.id) return;
        setConfigLoading(true);
        supabase.from('contable_config')
            .select('arca_cuit, arca_username, arca_password, punto_venta')
            .eq('tenant_id', tenant.id)
            .maybeSingle()
            .then(({ data }) => {
                if (data) setConfig(data as any);
                setConfigLoading(false);
            });
    }, [tenant?.id]);

    const isConfigured = config?.arca_cuit && config?.arca_username && config?.arca_password;

    async function fetchAFIP(): Promise<ComprobanteAFIP[]> {
        if (!config) return [];

        const fromDate = fechaDesde.split('-').reverse().join('/');
        const toDate = fechaHasta.split('-').reverse().join('/');

        const res = await fetch('https://app.afipsdk.com/api/v1/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AFIPSDK_API_KEY}`,
            },
            body: JSON.stringify({
                automation: 'mis-comprobantes',
                params: {
                    cuit: config.arca_cuit.replace(/-/g, ''),
                    username: config.arca_username.replace(/-/g, ''),
                    password: config.arca_password,
                    filters: {
                        t: tipoConsulta,
                        fechaEmision: `${fromDate} - ${toDate}`,
                        ...(config.punto_venta && tipoConsulta === 'E' ? { puntosVenta: [config.punto_venta] } : {}),
                    },
                },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`AFIP SDK error: ${err}`);
        }

        const json = await res.json();

        if (json.status !== 'complete' || !Array.isArray(json.data)) {
            throw new Error('Respuesta inesperada de AFIP SDK');
        }

        return json.data.map((r: any) => ({
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
        }));
    }

    async function fetchLocal(): Promise<ComprobanteLocal[]> {
        if (!tenant?.id) return [];

        const tipoLocal = tipoConsulta === 'E' ? 'venta' : 'compra';
        const { data } = await supabase
            .from('contable_comprobantes')
            .select('id, tipo, tipo_comprobante, numero_comprobante, fecha, monto_original, neto_gravado, total_iva, cuit_emisor, cuit_receptor, estado, descripcion, cliente:contable_clientes!cliente_id(razon_social), proveedor:contable_proveedores!proveedor_id(razon_social)')
            .eq('tenant_id', tenant.id)
            .eq('tipo', tipoLocal)
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
            .order('fecha', { ascending: false });

        return (data || []).map((c: any) => ({
            ...c,
            cliente_nombre: c.cliente?.razon_social || null,
            proveedor_nombre: c.proveedor?.razon_social || null,
        }));
    }

    function buildKey(pv: string, tipo: string, num: string): string {
        return `${pv.padStart(5, '0')}-${tipo}-${num.padStart(8, '0')}`;
    }

    function conciliar(afipList: ComprobanteAFIP[], localList: ComprobanteLocal[]): ComprobanteMatch[] {
        const result: ComprobanteMatch[] = [];
        const localMap = new Map<string, ComprobanteLocal>();

        // Index local by numero_comprobante (format: "00001-00000036" or similar)
        for (const loc of localList) {
            if (loc.numero_comprobante) {
                localMap.set(loc.numero_comprobante.replace(/\s/g, ''), loc);
            }
        }

        const matchedLocalIds = new Set<string>();

        for (const afip of afipList) {
            const tipoNombre = TIPOS_COMPROBANTE_AFIP[afip.tipoComprobante] || `Tipo ${afip.tipoComprobante}`;
            const key = buildKey(afip.puntoVenta, afip.tipoComprobante, afip.numeroDesde);

            // Try multiple match strategies
            let found: ComprobanteLocal | undefined;

            // Strategy 1: exact match on numero_comprobante
            for (const [nroComp, loc] of localMap) {
                if (matchedLocalIds.has(loc.id)) continue;
                // Compare padded numbers
                const localNum = nroComp.replace(/[^0-9-]/g, '');
                const afipNum = `${afip.puntoVenta.padStart(5, '0')}-${afip.numeroDesde.padStart(8, '0')}`;
                if (localNum === afipNum || nroComp.includes(afip.numeroDesde)) {
                    found = loc;
                    break;
                }
            }

            // Strategy 2: match by date + amount + type
            if (!found) {
                const afipDate = formatDate(afip.fechaEmision);
                for (const loc of localList) {
                    if (matchedLocalIds.has(loc.id)) continue;
                    if (loc.fecha === afipDate && Math.abs(Number(loc.monto_original) - afip.total) < 0.01) {
                        found = loc;
                        break;
                    }
                }
            }

            if (found) {
                matchedLocalIds.add(found.id);
                const difs: string[] = [];
                const montoLocal = Number(found.monto_original);
                if (Math.abs(montoLocal - afip.total) >= 0.01) {
                    difs.push(`Monto: AFIP ${formatCurrency(afip.total)} vs Sistema ${formatCurrency(montoLocal)}`);
                }
                if (found.neto_gravado != null && Math.abs(Number(found.neto_gravado) - afip.netoGravado) >= 0.01) {
                    difs.push(`Neto gravado: AFIP ${formatCurrency(afip.netoGravado)} vs Sistema ${formatCurrency(Number(found.neto_gravado))}`);
                }
                if (found.total_iva != null && Math.abs(Number(found.total_iva) - afip.iva) >= 0.01) {
                    difs.push(`IVA: AFIP ${formatCurrency(afip.iva)} vs Sistema ${formatCurrency(Number(found.total_iva))}`);
                }

                result.push({
                    afip,
                    local: found,
                    status: difs.length > 0 ? 'diferencia' : 'conciliado',
                    diferencias: difs.length > 0 ? difs : undefined,
                });
            } else {
                result.push({ afip, local: null, status: 'solo_afip' });
            }
        }

        // Local without AFIP match
        for (const loc of localList) {
            if (!matchedLocalIds.has(loc.id)) {
                result.push({ afip: null, local: loc, status: 'solo_sistema' });
            }
        }

        return result;
    }

    async function handleConciliar() {
        if (!isConfigured) {
            addToast('Configurá las credenciales de ARCA en Configuración → Integraciones', 'error');
            return;
        }
        setLoading(true);
        setConsulted(false);
        try {
            const [afipList, localList] = await Promise.all([fetchAFIP(), fetchLocal()]);
            const result = conciliar(afipList, localList);
            setMatches(result);
            setConsulted(true);
            addToast(`Conciliación completada: ${afipList.length} de AFIP, ${localList.length} del sistema`, 'success');
        } catch (err: any) {
            addToast(err.message || 'Error al consultar AFIP', 'error');
        } finally {
            setLoading(false);
        }
    }

    const filtered = filterStatus === 'todos' ? matches : matches.filter(m => m.status === filterStatus);

    const stats = {
        conciliados: matches.filter(m => m.status === 'conciliado').length,
        diferencias: matches.filter(m => m.status === 'diferencia').length,
        soloAfip: matches.filter(m => m.status === 'solo_afip').length,
        soloSistema: matches.filter(m => m.status === 'solo_sistema').length,
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

            {/* Config warning */}
            {!isConfigured && (
                <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={20} color="var(--warning)" />
                        <div>
                            <p style={{ fontWeight: 600 }}>Credenciales ARCA no configuradas</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Andá a Configuración → Integraciones → ARCA y completá CUIT, clave fiscal y API Key de AFIP SDK</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Tipo</label>
                        <select className="form-input" value={tipoConsulta} onChange={e => setTipoConsulta(e.target.value as TipoConsulta)} style={{ width: 150 }}>
                            <option value="E">Emitidos</option>
                            <option value="R">Recibidos</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Desde</label>
                        <input className="form-input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Hasta</label>
                        <input className="form-input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={handleConciliar} disabled={loading || !isConfigured} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {loading ? <RefreshCw size={14} className="spinning" /> : <Search size={14} />}
                        {loading ? 'Consultando AFIP...' : 'Conciliar'}
                    </button>
                </div>
            </div>

            {/* Stats KPIs */}
            {consulted && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <button onClick={() => setFilterStatus('todos')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterStatus === 'todos' ? '2px solid var(--primary)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{matches.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</div>
                    </button>
                    <button onClick={() => setFilterStatus('conciliado')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterStatus === 'conciliado' ? '2px solid var(--success)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{stats.conciliados}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Conciliados</div>
                    </button>
                    <button onClick={() => setFilterStatus('diferencia')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterStatus === 'diferencia' ? '2px solid var(--warning)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{stats.diferencias}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Con diferencias</div>
                    </button>
                    <button onClick={() => setFilterStatus('solo_afip')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterStatus === 'solo_afip' ? '2px solid var(--danger)' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>{stats.soloAfip}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solo en AFIP</div>
                    </button>
                    <button onClick={() => setFilterStatus('solo_sistema')} className="card" style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', border: filterStatus === 'solo_sistema' ? '2px solid #8b5cf6' : undefined }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6' }}>{stats.soloSistema}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solo en sistema</div>
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
                                <th style={{ padding: '0.75rem' }}>Tipo</th>
                                <th style={{ padding: '0.75rem' }}>Número</th>
                                <th style={{ padding: '0.75rem' }}>Fecha</th>
                                <th style={{ padding: '0.75rem' }}>Receptor/Emisor</th>
                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total AFIP</th>
                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Sistema</th>
                                <th style={{ padding: '0.75rem' }}>Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay resultados para este filtro</td></tr>
                            )}
                            {filtered.map((m, i) => {
                                const statusIcon = m.status === 'conciliado' ? <CheckCircle size={16} color="var(--success)" />
                                    : m.status === 'diferencia' ? <AlertTriangle size={16} color="var(--warning)" />
                                    : m.status === 'solo_afip' ? <XCircle size={16} color="var(--danger)" />
                                    : <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />;

                                const statusLabel = m.status === 'conciliado' ? 'OK' : m.status === 'diferencia' ? 'Dif.' : m.status === 'solo_afip' ? 'Solo AFIP' : 'Solo sistema';

                                const tipoNombre = m.afip ? (TIPOS_COMPROBANTE_AFIP[m.afip.tipoComprobante] || `Tipo ${m.afip.tipoComprobante}`) : (m.local?.tipo_comprobante || '-');
                                const numero = m.afip ? `${m.afip.puntoVenta.padStart(5, '0')}-${m.afip.numeroDesde.padStart(8, '0')}` : (m.local?.numero_comprobante || '-');
                                const fecha = m.afip ? m.afip.fechaEmision : (m.local?.fecha || '-');
                                const receptor = m.afip ? m.afip.denominacionReceptor : (m.local?.cliente_nombre || m.local?.proveedor_nombre || '-');

                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td style={{ padding: '0.6rem 0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {statusIcon}
                                                <span style={{ fontSize: '0.7rem' }}>{statusLabel}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>{tipoNombre}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{numero}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>{fecha}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receptor}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{m.afip ? formatCurrency(m.afip.total) : '-'}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{m.local ? formatCurrency(Number(m.local.monto_original)) : '-'}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.7rem', color: 'var(--warning)' }}>
                                            {m.diferencias?.map((d, j) => <div key={j}>{d}</div>)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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
