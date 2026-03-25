import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { Upload, Search, Filter, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, X, Check, ArrowUpRight, ArrowDownRight, FileText, Users, Building2, Landmark, Receipt, Wallet, Briefcase, HelpCircle } from 'lucide-react';

// ── Types ──
interface MovBancario {
    id: string; fecha: string; concepto: string; detalle: string;
    debito: number; credito: number; saldo: number;
    estado: 'auto' | 'parcial' | 'pendiente' | 'clasificado';
    clasificacion_id: string | null; tipo_destino: string | null;
    destino_id: string | null; destino_nombre: string | null;
    comprobante_id: string | null; match_score: number;
    nota: string | null; periodo_fiscal: string | null;
    banco_origen: string | null; import_batch_id: string | null;
}

interface DiccionarioRule {
    id: string; tipo_movimiento: string; concepto: string;
    texto_extracto: string; destino: string; cuenta_contable: string | null;
    cuenta_contable_nombre: string | null; accion: string; subconcepto: string | null;
}

// ── CSV Parser ──
function parseCSV(text: string): Array<{ fecha: string; concepto: string; detalle: string; debito: number; credito: number; saldo: number }> {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const header = lines[0].toLowerCase();
    // Detect separator
    const sep = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ',';

    const cols = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/['"]/g, ''));
    const iF = cols.findIndex(c => c.includes('fecha'));
    const iC = cols.findIndex(c => c.includes('concepto'));
    const iD = cols.findIndex(c => c.includes('detalle') || c.includes('descripci'));
    const iDeb = cols.findIndex(c => c.includes('bito') || c.includes('debito') || c.includes('debe'));
    const iCre = cols.findIndex(c => c.includes('dito') || c.includes('credito') || c.includes('haber'));
    const iS = cols.findIndex(c => c.includes('saldo'));

    if (iF === -1 || iDeb === -1) return [];

    const parseMonto = (s: string): number => {
        if (!s) return 0;
        const clean = s.replace(/['"$\s]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(clean) || 0;
    };

    const rows: Array<{ fecha: string; concepto: string; detalle: string; debito: number; credito: number; saldo: number }> = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle quoted fields with commas inside
        const fields: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const ch of lines[i]) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === sep[0] && !inQuotes) { fields.push(current.trim()); current = ''; }
            else { current += ch; }
        }
        fields.push(current.trim());

        if (fields.length < 3) continue;

        const fecha = fields[iF]?.replace(/['"]/g, '').trim() || '';
        if (!fecha || fecha.length < 8) continue;

        rows.push({
            fecha,
            concepto: iC >= 0 ? (fields[iC]?.replace(/['"]/g, '').trim() || '') : '',
            detalle: iD >= 0 ? (fields[iD]?.replace(/['"]/g, '').trim() || '') : '',
            debito: iDeb >= 0 ? parseMonto(fields[iDeb]) : 0,
            credito: iCre >= 0 ? parseMonto(fields[iCre]) : 0,
            saldo: iS >= 0 ? parseMonto(fields[iS]) : 0,
        });
    }
    return rows;
}

// ── Hash for dedup ──
function hashMov(r: { fecha: string; concepto: string; debito: number; credito: number; saldo: number }): string {
    return `${r.fecha}|${r.concepto}|${r.debito}|${r.credito}|${r.saldo}`;
}

// ── Component ──
export default function ConciliacionBancaria() {
    const { tenant } = useTenant();
    const { addToast } = useToast();

    const [tab, setTab] = useState<'upload' | 'conciliar'>('conciliar');
    const [movimientos, setMovimientos] = useState<MovBancario[]>([]);
    const [diccionario, setDiccionario] = useState<DiccionarioRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);

    // Filters
    const [filtroEstado, setFiltroEstado] = useState<'todos' | 'auto' | 'parcial' | 'pendiente' | 'clasificado'>('todos');
    const [filtroBusqueda, setFiltroBusqueda] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Upload preview
    const [preview, setPreview] = useState<Array<{ fecha: string; concepto: string; detalle: string; debito: number; credito: number; saldo: number }>>([]);
    const [fileName, setFileName] = useState('');
    const [dragOver, setDragOver] = useState(false);

    // Classification panel
    const [classifying, setClassifying] = useState<MovBancario | null>(null);
    const [classTipo, setClassTipo] = useState('');
    const [classNota, setClassNota] = useState('');
    const [classDestinoNombre, setClassDestinoNombre] = useState('');

    // Load data
    useEffect(() => {
        if (!tenant) return;
        loadData();
    }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const [movRes, dicRes] = await Promise.all([
            supabase.from('movimientos_bancarios').select('*').eq('tenant_id', tenant!.id).order('fecha', { ascending: false }).limit(500),
            supabase.from('diccionario_clasificacion').select('*').eq('tenant_id', tenant!.id),
        ]);
        if (movRes.data) setMovimientos(movRes.data);
        if (dicRes.data) setDiccionario(dicRes.data);
        setLoading(false);
    };

    // ── File handling ──
    const handleFile = useCallback((file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const rows = parseCSV(text);
            setPreview(rows);
            if (rows.length === 0) addToast('error', 'Error', 'No se pudieron parsear movimientos del archivo');
            else {
                setTab('upload');
                addToast('success', 'Archivo leído', `${rows.length} movimientos detectados`);
            }
        };
        // Try latin1 first for bank CSVs
        reader.readAsText(file, 'windows-1252');
    }, [addToast]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    // ── Auto-classify ──
    const autoClassify = (concepto: string, detalle: string): { rule: DiccionarioRule | null; estado: 'auto' | 'parcial' | 'pendiente' } => {
        const fullText = `${concepto} ${detalle}`.toUpperCase();
        // Try exact match first, then partial
        let bestRule: DiccionarioRule | null = null;
        let bestLen = 0;
        for (const rule of diccionario) {
            const ruleText = rule.texto_extracto.toUpperCase().trim();
            if (fullText.includes(ruleText) && ruleText.length > bestLen) {
                bestRule = rule;
                bestLen = ruleText.length;
            }
        }
        if (bestRule) {
            if (bestRule.accion === 'clasificar') return { rule: bestRule, estado: 'parcial' }; // needs manual assignment
            return { rule: bestRule, estado: 'auto' };
        }
        return { rule: null, estado: 'pendiente' };
    };

    // ── Score against comprobantes ──
    const scoreComprobante = async (mov: { fecha: string; debito: number; credito: number; detalle: string }) => {
        const monto = mov.debito || mov.credito;
        if (!monto || monto < 100) return null;

        const { data: comps } = await supabase.from('contable_comprobantes')
            .select('id, monto_original, monto_ars, cuit_emisor, fecha, numero_comprobante, proveedor:contable_proveedores!proveedor_id(razon_social, cuit)')
            .eq('tenant_id', tenant!.id)
            .gte('monto_original', monto * 0.95)
            .lte('monto_original', monto * 1.05)
            .limit(5);

        if (!comps || comps.length === 0) return null;

        let bestScore = 0;
        let bestComp: any = null;
        const detailUpper = mov.detalle.toUpperCase();

        for (const comp of comps) {
            let score = 0;
            const compMonto = comp.monto_original || comp.monto_ars || 0;

            // Exact amount match
            if (Math.abs(compMonto - monto) < 1) score += 40;
            else score += 20; // within 5%

            // CUIT match in detail
            if (comp.cuit_emisor && detailUpper.includes(comp.cuit_emisor.replace(/[-\s]/g, ''))) score += 30;
            // Name match
            const provName = (comp.proveedor as any)?.razon_social?.toUpperCase();
            if (provName && detailUpper.includes(provName.substring(0, Math.min(10, provName.length)))) score += 15;

            // Date proximity (±7 days)
            const movDate = new Date(mov.fecha);
            const compDate = new Date(comp.fecha);
            const daysDiff = Math.abs((movDate.getTime() - compDate.getTime()) / 86400000);
            if (daysDiff <= 7) score += 10;

            // Type match
            if (mov.debito > 0 && comp.monto_original > 0) score += 5; // debito = compra

            if (score > bestScore) { bestScore = score; bestComp = comp; }
        }

        return bestScore >= 50 ? { comprobante: bestComp, score: bestScore } : null;
    };

    // ── Import ──
    const doImport = async () => {
        if (preview.length === 0) return;
        setImporting(true);

        // Get existing hashes for dedup
        const { data: existing } = await supabase.from('movimientos_bancarios')
            .select('hash').eq('tenant_id', tenant!.id);
        const existingHashes = new Set((existing || []).map((e: any) => e.hash));

        const batchId = crypto.randomUUID();
        let imported = 0;
        let duplicates = 0;
        let autoClassified = 0;

        const toInsert: any[] = [];

        for (const row of preview) {
            const h = hashMov(row);
            if (existingHashes.has(h)) { duplicates++; continue; }

            const { rule, estado } = autoClassify(row.concepto, row.detalle);

            // Extract name from detail for transfers
            let destinoNombre: string | null = null;
            const nombreMatch = row.detalle.match(/NOMBRE:\s*([^,\n]+)/i);
            if (nombreMatch) destinoNombre = nombreMatch[1].trim();

            const record: any = {
                tenant_id: tenant!.id,
                fecha: row.fecha.replace(/\//g, '-'),
                concepto: row.concepto,
                detalle: row.detalle,
                debito: row.debito,
                credito: row.credito,
                saldo: row.saldo,
                estado,
                hash: h,
                import_batch_id: batchId,
                banco_origen: fileName.split('_')[1] || 'Desconocido',
            };

            if (rule) {
                record.clasificacion_id = rule.id;
                record.tipo_destino = rule.destino === 'ventas' ? 'cliente'
                    : rule.destino === 'compras' ? 'proveedor'
                    : rule.destino === 'impuesto' ? 'impuesto'
                    : rule.destino === 'gasto_bancario' ? 'gasto_bancario'
                    : rule.destino === 'caja' || rule.destino === 'ingreso_dinero' ? 'caja'
                    : rule.destino === 'fci' ? 'fci'
                    : rule.destino === 'sueldo' ? 'sueldo'
                    : rule.destino === 'prestamo' ? 'prestamo'
                    : null;
                if (destinoNombre) record.destino_nombre = destinoNombre;
                if (estado === 'auto') autoClassified++;
            }

            toInsert.push(record);
            imported++;
        }

        // Batch insert (chunks of 500)
        for (let i = 0; i < toInsert.length; i += 500) {
            const chunk = toInsert.slice(i, i + 500);
            const { error } = await supabase.from('movimientos_bancarios').insert(chunk);
            if (error) {
                console.error('Insert error:', error);
                addToast('error', 'Error', `Error al importar: ${error.message}`);
                setImporting(false);
                return;
            }
        }

        addToast('success', 'Importación completada',
            `${imported} importados, ${autoClassified} auto-clasificados, ${duplicates} duplicados ignorados`);
        setPreview([]);
        setFileName('');
        setTab('conciliar');
        setImporting(false);
        loadData();
    };

    // ── Classify single movement ──
    const classifyMovimiento = async (mov: MovBancario, tipoDestino: string, destinoNombre: string, nota: string) => {
        const { error } = await supabase.from('movimientos_bancarios')
            .update({
                estado: 'clasificado',
                tipo_destino: tipoDestino,
                destino_nombre: destinoNombre || null,
                nota: nota || null,
            })
            .eq('id', mov.id);

        if (error) { addToast('error', 'Error', error.message); return; }

        // Post-classification action: create impuesto record if applicable
        if (tipoDestino === 'impuesto') {
            const monto = mov.debito || mov.credito;
            const periodo = mov.periodo_fiscal || mov.fecha.substring(0, 7);
            await supabase.from('impuestos_acumulados').insert({
                tenant_id: tenant!.id,
                tipo_impuesto: mov.concepto,
                periodo_fiscal: periodo,
                monto,
                movimiento_bancario_id: mov.id,
                fecha_movimiento: mov.fecha,
            });
        }

        // Create cuenta corriente record if client/provider
        if (tipoDestino === 'cliente' || tipoDestino === 'proveedor') {
            const monto = mov.debito || mov.credito;
            await supabase.from('contable_cuentas_corrientes').insert({
                tenant_id: tenant!.id,
                tipo: tipoDestino,
                entidad_id: mov.destino_id || '00000000-0000-0000-0000-000000000000',
                entidad_nombre: destinoNombre,
                fecha: mov.fecha,
                concepto: mov.concepto,
                monto,
                tipo_movimiento: mov.credito > 0 ? 'credito' : 'debito',
                movimiento_bancario_id: mov.id,
            });
        }

        addToast('success', 'Clasificado', `Movimiento clasificado como ${tipoDestino}`);
        setClassifying(null);
        loadData();
    };

    // ── Batch classify ──
    const batchClassifyAuto = async () => {
        const autos = movimientos.filter(m => m.estado === 'auto');
        if (autos.length === 0) return;

        // For auto-classified with action 'impuesto' or 'gasto_auto', mark as classified
        const ids = autos.map(m => m.id);
        await supabase.from('movimientos_bancarios')
            .update({ estado: 'clasificado' })
            .in('id', ids);

        // Create impuesto records for auto-classified impuestos
        const impuestos = autos.filter(m => m.tipo_destino === 'impuesto');
        if (impuestos.length > 0) {
            const impRecords = impuestos.map(m => ({
                tenant_id: tenant!.id,
                tipo_impuesto: m.concepto,
                periodo_fiscal: m.periodo_fiscal || m.fecha.substring(0, 7),
                monto: m.debito || m.credito,
                movimiento_bancario_id: m.id,
                fecha_movimiento: m.fecha,
            }));
            await supabase.from('impuestos_acumulados').insert(impRecords);
        }

        addToast('success', 'Confirmados', `${autos.length} movimientos auto-clasificados confirmados`);
        loadData();
    };

    // ── Helpers ──
    const fmtMoney = (n: number) => n ? `$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '$0';
    const estadoColor = (e: string) => e === 'auto' ? '#10B981' : e === 'parcial' ? '#F59E0B' : e === 'clasificado' ? '#6366F1' : '#EF4444';
    const estadoLabel = (e: string) => e === 'auto' ? 'Auto' : e === 'parcial' ? 'Parcial' : e === 'clasificado' ? 'Clasificado' : 'Pendiente';
    const estadoIcon = (e: string) => e === 'auto' ? <CheckCircle size={14} /> : e === 'parcial' ? <AlertTriangle size={14} /> : e === 'clasificado' ? <Check size={14} /> : <XCircle size={14} />;

    const destinoIcon = (tipo: string | null) => {
        if (!tipo) return <HelpCircle size={14} />;
        const map: Record<string, JSX.Element> = {
            cliente: <Users size={14} />, proveedor: <Building2 size={14} />,
            impuesto: <Landmark size={14} />, gasto_bancario: <Receipt size={14} />,
            caja: <Wallet size={14} />, fci: <Briefcase size={14} />,
            sueldo: <Users size={14} />, prestamo: <Landmark size={14} />,
        };
        return map[tipo] || <HelpCircle size={14} />;
    };

    // ── Filtered list ──
    const filtered = movimientos.filter(m => {
        if (filtroEstado !== 'todos' && m.estado !== filtroEstado) return false;
        if (filtroBusqueda) {
            const q = filtroBusqueda.toLowerCase();
            return m.concepto.toLowerCase().includes(q) || (m.detalle || '').toLowerCase().includes(q) || (m.destino_nombre || '').toLowerCase().includes(q);
        }
        return true;
    });

    // KPIs
    const total = movimientos.length;
    const autoCount = movimientos.filter(m => m.estado === 'auto').length;
    const parcialCount = movimientos.filter(m => m.estado === 'parcial').length;
    const pendienteCount = movimientos.filter(m => m.estado === 'pendiente').length;
    const clasificadoCount = movimientos.filter(m => m.estado === 'clasificado').length;

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando conciliación...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Conciliación Bancaria</h1>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button className={`btn ${tab === 'conciliar' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '0.8rem' }} onClick={() => setTab('conciliar')}>
                        Conciliar
                    </button>
                    <label className="btn btn-ghost" style={{ fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Upload size={14} /> Importar CSV
                        <input type="file" accept=".csv,.txt,.xls,.xlsx" hidden onChange={handleFileInput} />
                    </label>
                </div>
            </div>

            {/* KPIs */}
            {total > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                    {[
                        { label: 'Total', value: total, color: 'var(--color-text-primary)' },
                        { label: 'Auto', value: autoCount, color: '#10B981' },
                        { label: 'Parcial', value: parcialCount, color: '#F59E0B' },
                        { label: 'Pendiente', value: pendienteCount, color: '#EF4444' },
                        { label: 'Clasificados', value: clasificadoCount, color: '#6366F1' },
                    ].map(k => (
                        <div key={k.label} onClick={() => setFiltroEstado(k.label.toLowerCase() === 'total' ? 'todos' : k.label.toLowerCase() as any)}
                            style={{
                                flex: 1, padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                                background: 'var(--color-bg-card)', border: `1.5px solid ${filtroEstado === k.label.toLowerCase() || (filtroEstado === 'todos' && k.label === 'Total') ? k.color : 'var(--color-border-subtle)'}`,
                            }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Batch confirm button */}
            {autoCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#10B98110', borderRadius: 8, border: '1px solid #10B98130' }}>
                    <CheckCircle size={16} color="#10B981" />
                    <span style={{ fontSize: '0.8rem', flex: 1 }}>{autoCount} movimientos auto-clasificados listos para confirmar</span>
                    <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={batchClassifyAuto}>
                        Confirmar todos
                    </button>
                </div>
            )}

            {/* ── TAB: UPLOAD ── */}
            {tab === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Drop zone */}
                    {preview.length === 0 && (
                        <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            style={{
                                padding: '3rem 2rem', textAlign: 'center', borderRadius: 12,
                                border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                                background: dragOver ? 'rgba(37,99,235,0.04)' : 'var(--color-bg-card)',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            onClick={() => document.getElementById('csv-file-input')?.click()}
                        >
                            <Upload size={32} color="var(--color-text-muted)" style={{ margin: '0 auto 8px' }} />
                            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Arrastrá el extracto bancario o hacé click</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>CSV, TXT — Supervielle, Galicia, y otros</div>
                            <input id="csv-file-input" type="file" accept=".csv,.txt" hidden onChange={handleFileInput} />
                        </div>
                    )}

                    {/* Preview */}
                    {preview.length > 0 && (
                        <div style={{ background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>📄 {fileName}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{preview.length} movimientos detectados</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => { setPreview([]); setFileName(''); }}>
                                        Cancelar
                                    </button>
                                    <button className="btn btn-primary" style={{ fontSize: '0.75rem' }} onClick={doImport} disabled={importing}>
                                        {importing ? 'Importando...' : `Importar ${preview.length} movimientos`}
                                    </button>
                                </div>
                            </div>

                            {/* Preview table - first 20 rows */}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-bg-surface-2)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', fontSize: '0.625rem', letterSpacing: '0.05em' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Fecha</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Concepto</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Débito</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Crédito</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.slice(0, 20).map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                                                <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>{r.fecha}</td>
                                                <td style={{ padding: '6px 12px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.concepto}</td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right', color: r.debito > 0 ? '#EF4444' : 'var(--color-text-muted)' }}>{r.debito > 0 ? fmtMoney(r.debito) : '—'}</td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right', color: r.credito > 0 ? '#10B981' : 'var(--color-text-muted)' }}>{r.credito > 0 ? fmtMoney(r.credito) : '—'}</td>
                                                <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMoney(r.saldo)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {preview.length > 20 && (
                                    <div style={{ padding: '8px 12px', fontSize: '0.7rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                        ... y {preview.length - 20} movimientos más
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: CONCILIAR ── */}
            {tab === 'conciliar' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Search + filters */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                            <input type="text" placeholder="Buscar por concepto, detalle o nombre..." value={filtroBusqueda}
                                onChange={e => setFiltroBusqueda(e.target.value)}
                                className="form-input" style={{ paddingLeft: 30, height: 34, fontSize: '0.8rem' }} />
                        </div>
                    </div>

                    {/* Movements list */}
                    {filtered.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            {total === 0 ? (
                                <div>
                                    <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Sin movimientos importados</div>
                                    <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Importá un extracto bancario CSV para empezar</div>
                                </div>
                            ) : (
                                <div>No hay movimientos que coincidan con los filtros</div>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
                            {/* Table header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '32px 90px 1fr 200px 100px 100px 80px', padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span></span>
                                <span>Fecha</span>
                                <span>Concepto</span>
                                <span>Destino</span>
                                <span style={{ textAlign: 'right' }}>Débito</span>
                                <span style={{ textAlign: 'right' }}>Crédito</span>
                                <span style={{ textAlign: 'center' }}>Estado</span>
                            </div>

                            {/* Rows */}
                            {filtered.slice(0, 100).map(m => {
                                const isExpanded = expandedId === m.id;
                                return (
                                    <div key={m.id}>
                                        <div
                                            onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                            style={{
                                                display: 'grid', gridTemplateColumns: '32px 90px 1fr 200px 100px 100px 80px',
                                                padding: '10px 12px', borderBottom: '1px solid var(--color-border-subtle)',
                                                alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s',
                                                borderLeft: `3px solid ${estadoColor(m.estado)}`,
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <span>{destinoIcon(m.tipo_destino)}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                            </span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto}</div>
                                                {m.destino_nombre && <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{m.destino_nombre}</div>}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.tipo_destino ? m.tipo_destino.replace('_', ' ') : '—'}
                                            </div>
                                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: m.debito > 0 ? '#EF4444' : 'var(--color-text-muted)' }}>
                                                {m.debito > 0 ? fmtMoney(m.debito) : '—'}
                                            </div>
                                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: m.credito > 0 ? '#10B981' : 'var(--color-text-muted)' }}>
                                                {m.credito > 0 ? fmtMoney(m.credito) : '—'}
                                            </div>
                                            <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                                <span style={{ color: estadoColor(m.estado) }}>{estadoIcon(m.estado)}</span>
                                                <span style={{ fontSize: '0.6rem', color: estadoColor(m.estado), fontWeight: 600 }}>{estadoLabel(m.estado)}</span>
                                            </div>
                                        </div>

                                        {/* Expanded detail */}
                                        {isExpanded && (
                                            <div style={{ padding: '12px 16px 12px 47px', background: 'var(--color-bg-surface-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                                                    <strong>Detalle:</strong> {m.detalle || '(sin detalle)'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                                                    <strong>Saldo:</strong> {fmtMoney(m.saldo)} | <strong>Banco:</strong> {m.banco_origen || 'Desconocido'}
                                                </div>
                                                {m.estado !== 'clasificado' && (
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                        {['cliente', 'proveedor', 'impuesto', 'gasto_bancario', 'caja', 'sueldo'].map(tipo => (
                                                            <button key={tipo}
                                                                className="btn btn-ghost"
                                                                style={{ fontSize: '0.7rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 3 }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setClassifying(m);
                                                                    setClassTipo(tipo);
                                                                    setClassNota('');
                                                                    setClassDestinoNombre(m.destino_nombre || '');
                                                                }}>
                                                                {destinoIcon(tipo)}
                                                                {tipo.replace('_', ' ')}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {filtered.length > 100 && (
                                <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    Mostrando 100 de {filtered.length} movimientos
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── CLASSIFICATION MODAL ── */}
            {classifying && (
                <div className="wizard-overlay" onClick={() => setClassifying(null)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="wizard-header">
                            <h3>Clasificar movimiento</h3>
                            <button className="wizard-close" onClick={() => setClassifying(null)}><X size={18} /></button>
                        </div>
                        <div className="wizard-body">
                            <div style={{ background: 'var(--color-bg-surface-2)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{classifying.concepto}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{classifying.detalle?.substring(0, 100)}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)', color: classifying.debito > 0 ? '#EF4444' : '#10B981' }}>
                                    {classifying.debito > 0 ? `-${fmtMoney(classifying.debito)}` : `+${fmtMoney(classifying.credito)}`}
                                </div>
                            </div>

                            <div className="wizard-field">
                                <label className="form-label">Tipo de destino</label>
                                <select className="form-input" value={classTipo} onChange={e => setClassTipo(e.target.value)}>
                                    <option value="cliente">Cliente (cobro)</option>
                                    <option value="proveedor">Proveedor (pago)</option>
                                    <option value="impuesto">Impuesto</option>
                                    <option value="gasto_bancario">Gasto bancario</option>
                                    <option value="caja">Caja</option>
                                    <option value="sueldo">Sueldo</option>
                                    <option value="fci">FCI</option>
                                    <option value="prestamo">Préstamo</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>

                            <div className="wizard-field">
                                <label className="form-label">Nombre / Entidad</label>
                                <input className="form-input" value={classDestinoNombre} onChange={e => setClassDestinoNombre(e.target.value)}
                                    placeholder="Ej: Juan Pérez, AFIP, Banco Supervielle..." />
                            </div>

                            <div className="wizard-field">
                                <label className="form-label">Nota (opcional)</label>
                                <input className="form-input" value={classNota} onChange={e => setClassNota(e.target.value)}
                                    placeholder="Nota adicional..." />
                            </div>
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left" />
                            <div className="wizard-footer-right">
                                <button className="wizard-btn-next" onClick={() => classifyMovimiento(classifying, classTipo, classDestinoNombre, classNota)}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> Clasificar</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
