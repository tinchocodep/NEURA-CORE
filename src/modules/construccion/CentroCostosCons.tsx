import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import StyledSelect from '../../shared/components/StyledSelect';
import {
    Plus, Search, Pencil, Trash2, X, Check, HardHat, Building2,
    ChevronLeft, ChevronRight, ChevronDown, FileText, Receipt, Split,
} from 'lucide-react';
import PlanCuentasCons from './PlanCuentasCons';
import ProrrateoModal from './ProrrateoModal';

/* ─── Types ─────────────────────────────────────────────── */

interface Centro {
    id: string;
    name: string;
    description: string | null;
    status: string | null;
    is_global: boolean | null;
}

interface Categoria {
    id: string;
    nombre: string;
    color: string;
    tipo: string;
    parent_id: string | null;
    orden: number | null;
}

interface ProrrateoLinea {
    proyecto_id: string;
    porcentaje: number | null;
    monto: number | null;
}

interface Gasto {
    id: string;
    source: 'comprobante' | 'movimiento';
    fecha: string;
    proyecto_id: string | null;
    categoria_id: string | null;
    monto_ars: number;
    descripcion: string | null;
    numero_comprobante: string | null;
    tipo: 'gasto' | 'ingreso';
    proveedor_nombre: string | null;
    prorrateo: ProrrateoLinea[]; // si vacío → 100% al proyecto_id
}

const STATUS_OPTIONS = [
    { value: 'active', label: 'Activa', color: '#10B981' },
    { value: 'paused', label: 'Pausada', color: '#F59E0B' },
    { value: 'finished', label: 'Finalizada', color: '#94A3B8' },
];

const PERIODOS = [
    { value: 'mes', label: 'Este mes' },
    { value: 'mes_anterior', label: 'Mes anterior' },
    { value: 'anio', label: 'Este año' },
    { value: 'todo', label: 'Todo el período' },
];

/* ─── Utils ─────────────────────────────────────────────── */

function rangoFechas(periodo: string): { from: string | null; to: string | null } {
    const now = new Date();
    if (periodo === 'mes') {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    if (periodo === 'mes_anterior') {
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    if (periodo === 'anio') {
        const from = new Date(now.getFullYear(), 0, 1);
        const to = new Date(now.getFullYear(), 11, 31);
        return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    return { from: null, to: null };
}

function formatARS(n: number): string {
    return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ─── Componente principal ──────────────────────────────── */

export default function CentroCostosCons() {
    const { tenant } = useTenant();
    const [tab, setTab] = useState<'centros' | 'plan'>('centros');
    const [centros, setCentros] = useState<Centro[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [gastos, setGastos] = useState<Gasto[]>([]);
    const [loading, setLoading] = useState(true);

    const [periodo, setPeriodo] = useState('mes');
    const [search, setSearch] = useState('');
    const [centroDetalle, setCentroDetalle] = useState<Centro | null>(null);

    // Modal de prorrateo
    const [gastoProrratear, setGastoProrratear] = useState<Gasto | null>(null);

    // Form centro (modal)
    const [showCentroForm, setShowCentroForm] = useState(false);
    const [editCentro, setEditCentro] = useState<Centro | null>(null);
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formStatus, setFormStatus] = useState('active');
    const [saving, setSaving] = useState(false);

    const { requestDelete, ConfirmModal } = useConfirmDelete();

    useEffect(() => {
        if (tenant) loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenant, periodo]);

    const loadAll = async () => {
        if (!tenant) return;
        setLoading(true);
        const { from, to } = rangoFechas(periodo);

        const compQuery = supabase
            .from('contable_comprobantes')
            .select('id, fecha, proyecto_id, categoria_id, monto_ars, descripcion, numero_comprobante, tipo, contable_proveedores(razon_social)')
            .eq('tenant_id', tenant.id);
        if (from) compQuery.gte('fecha', from);
        if (to) compQuery.lte('fecha', to);

        const txQuery = supabase
            .from('treasury_transactions')
            .select('id, date, proyecto_id, categoria_contable_id, amount, description, contact_name, type, invoice_number')
            .eq('tenant_id', tenant.id);
        if (from) txQuery.gte('date', from);
        if (to) txQuery.lte('date', to);

        const [c1, c2, c3, c4, c5, c6] = await Promise.all([
            supabase.from('treasury_projects').select('id, name, description, status, is_global').eq('tenant_id', tenant.id).order('is_global', { ascending: false }).order('name'),
            supabase.from('contable_categorias').select('id, nombre, color, tipo, parent_id, orden').eq('tenant_id', tenant.id).order('orden'),
            compQuery,
            txQuery,
            supabase.from('contable_comprobante_centros').select('comprobante_id, proyecto_id, porcentaje, monto').eq('tenant_id', tenant.id),
            supabase.from('treasury_transaction_centros').select('transaction_id, proyecto_id, porcentaje, monto').eq('tenant_id', tenant.id),
        ]);

        setCentros((c1.data as any) || []);
        setCategorias((c2.data as any) || []);

        // Indexar prorrateo por id
        const prorrateoComp = new Map<string, ProrrateoLinea[]>();
        for (const r of ((c5.data as any[]) || [])) {
            const arr = prorrateoComp.get(r.comprobante_id) || [];
            arr.push({ proyecto_id: r.proyecto_id, porcentaje: r.porcentaje !== null ? Number(r.porcentaje) : null, monto: r.monto !== null ? Number(r.monto) : null });
            prorrateoComp.set(r.comprobante_id, arr);
        }
        const prorrateoTx = new Map<string, ProrrateoLinea[]>();
        for (const r of ((c6.data as any[]) || [])) {
            const arr = prorrateoTx.get(r.transaction_id) || [];
            arr.push({ proyecto_id: r.proyecto_id, porcentaje: r.porcentaje !== null ? Number(r.porcentaje) : null, monto: r.monto !== null ? Number(r.monto) : null });
            prorrateoTx.set(r.transaction_id, arr);
        }

        // Comprobantes (Sistema A) → Gasto
        const fromComp: Gasto[] = ((c3.data as any[]) || []).map(r => ({
            id: r.id,
            source: 'comprobante' as const,
            fecha: r.fecha,
            proyecto_id: r.proyecto_id,
            categoria_id: r.categoria_id,
            monto_ars: Number(r.monto_ars || 0),
            descripcion: r.descripcion,
            numero_comprobante: r.numero_comprobante,
            tipo: r.tipo === 'venta' ? 'ingreso' : 'gasto',
            proveedor_nombre: r.contable_proveedores?.razon_social || null,
            prorrateo: prorrateoComp.get(r.id) || [],
        }));

        // Movimientos (Sistema B) → Gasto
        const fromTx: Gasto[] = ((c4.data as any[]) || []).map(r => ({
            id: r.id,
            source: 'movimiento' as const,
            fecha: r.date,
            proyecto_id: r.proyecto_id,
            categoria_id: r.categoria_contable_id,
            monto_ars: Number(r.amount || 0),
            descripcion: r.description,
            numero_comprobante: r.invoice_number,
            tipo: r.type === 'income' ? 'ingreso' : 'gasto',
            proveedor_nombre: r.contact_name || null,
            prorrateo: prorrateoTx.get(r.id) || [],
        }));

        setGastos([...fromComp, ...fromTx]);
        setLoading(false);
    };

    /* ─── Cálculos derivados ──────────────────────────────── */

    // Devuelve el monto que le corresponde a un centro dado un gasto
    function montoParaCentro(g: Gasto, centroId: string): number {
        if (g.prorrateo.length === 0) {
            return g.proyecto_id === centroId ? g.monto_ars : 0;
        }
        // Tiene prorrateo: sumar las líneas que apuntan a este centro
        let total = 0;
        for (const linea of g.prorrateo) {
            if (linea.proyecto_id !== centroId) continue;
            if (linea.monto != null) total += linea.monto;
            else if (linea.porcentaje != null) total += g.monto_ars * (linea.porcentaje / 100);
        }
        return total;
    }

    // Total por centro (la global es el total general del tenant — siempre 100%)
    const totalPorCentro = useMemo(() => {
        const m = new Map<string, { total: number; cantidad: number }>();
        for (const c of centros) m.set(c.id, { total: 0, cantidad: 0 });
        const totalGlobal = { total: 0, cantidad: 0 };
        for (const g of gastos) {
            if (g.tipo !== 'gasto') continue; // sólo gastos
            totalGlobal.total += g.monto_ars;
            totalGlobal.cantidad += 1;
            // Atribuir a obras (excepto la global, que se llena aparte)
            for (const c of centros) {
                if (c.is_global) continue;
                const monto = montoParaCentro(g, c.id);
                if (monto > 0) {
                    const x = m.get(c.id)!;
                    x.total += monto;
                    x.cantidad += 1;
                }
            }
        }
        const global = centros.find(c => c.is_global);
        if (global) m.set(global.id, totalGlobal);
        return m;
    }, [centros, gastos]);

    const filteredCentros = centros.filter(c =>
        !search || c.name.toLowerCase().includes(search.toLowerCase())
    );

    /* ─── CRUD centros ────────────────────────────────────── */

    const openNewCentro = () => {
        setEditCentro(null);
        setFormName('');
        setFormDesc('');
        setFormStatus('active');
        setShowCentroForm(true);
    };
    const openEditCentro = (c: Centro) => {
        setEditCentro(c);
        setFormName(c.name);
        setFormDesc(c.description || '');
        setFormStatus(c.status || 'active');
        setShowCentroForm(true);
    };
    const saveCentro = async () => {
        if (!tenant || !formName.trim()) return;
        setSaving(true);
        if (editCentro) {
            await supabase.from('treasury_projects').update({
                name: formName.trim(),
                description: formDesc.trim() || null,
                status: formStatus,
            }).eq('id', editCentro.id);
        } else {
            await supabase.from('treasury_projects').insert({
                tenant_id: tenant.id,
                name: formName.trim(),
                description: formDesc.trim() || null,
                status: formStatus,
                is_global: false,
            });
        }
        setSaving(false);
        setShowCentroForm(false);
        loadAll();
    };
    const removeCentro = (c: Centro) => {
        if (c.is_global) return;
        requestDelete(`Se eliminará el centro "${c.name}". Esta acción no se puede deshacer.`, async () => {
            await supabase.from('treasury_projects').delete().eq('id', c.id);
            loadAll();
        });
    };

    /* ─── Render ──────────────────────────────────────────── */

    if (loading && !centroDetalle) {
        return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando centro de costos...</div>;
    }

    // Vista detalle
    if (centroDetalle) {
        return (
            <>
                <DetalleCentro
                    centro={centroDetalle}
                    centros={centros}
                    gastos={gastos}
                    categorias={categorias}
                    periodo={periodo}
                    onBack={() => setCentroDetalle(null)}
                    onChangePeriodo={setPeriodo}
                    onProrratear={(g) => setGastoProrratear(g)}
                />
                {gastoProrratear && tenant && (
                    <ProrrateoModal
                        gasto={gastoProrratear}
                        centros={centros}
                        tenantId={tenant.id}
                        onClose={() => setGastoProrratear(null)}
                        onSaved={() => { setGastoProrratear(null); loadAll(); }}
                    />
                )}
            </>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* ─── Tabs ─── */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 4 }}>
                <TabButton active={tab === 'centros'} onClick={() => setTab('centros')}>
                    <Building2 size={14} /> Por Centro de Costos
                </TabButton>
                <TabButton active={tab === 'plan'} onClick={() => setTab('plan')}>
                    <FileText size={14} /> Plan de Cuentas
                </TabButton>
            </div>

            {tab === 'plan' ? (
                <PlanCuentasCons
                    categorias={categorias}
                    onChange={loadAll}
                />
            ) : (
                <>
                    {/* Header */}
                    <div className="module-header-desktop">
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Centro de Costos</h1>
                        <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                            <input type="text" placeholder="Buscar centro..." value={search} onChange={e => setSearch(e.target.value)}
                                className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                        </div>
                        <StyledSelect value={periodo} onChange={e => setPeriodo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                            {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </StyledSelect>
                        <button onClick={openNewCentro} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                            <Plus size={14} /> Nuevo Centro
                        </button>
                    </div>

                    {/* KPIs globales */}
                    <KPIsGlobales centros={centros} totalPorCentro={totalPorCentro} />

                    {/* Lista de centros */}
                    <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 140px 140px 80px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
                            <span>Centro</span>
                            <span>Estado</span>
                            <span style={{ textAlign: 'right' }}>Cant. gastos</span>
                            <span style={{ textAlign: 'right' }}>Total período</span>
                            <span style={{ textAlign: 'right' }}>Acciones</span>
                        </div>
                        {filteredCentros.map(c => {
                            const stats = totalPorCentro.get(c.id) || { total: 0, cantidad: 0 };
                            const st = STATUS_OPTIONS.find(s => s.value === c.status) || STATUS_OPTIONS[0];
                            return (
                                <CentroRow
                                    key={c.id}
                                    centro={c}
                                    statusOpt={st}
                                    cantidad={stats.cantidad}
                                    total={stats.total}
                                    onClick={() => setCentroDetalle(c)}
                                    onEdit={() => openEditCentro(c)}
                                    onRemove={() => removeCentro(c)}
                                />
                            );
                        })}
                        {filteredCentros.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin centros registrados</div>
                        )}
                    </div>
                </>
            )}

            {/* ─── MODAL nuevo/editar centro ─── */}
            {showCentroForm && (
                <div className="wizard-overlay" onClick={() => setShowCentroForm(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="wizard-header">
                            <h3>{editCentro ? 'Editar centro' : 'Nuevo centro de costos'}</h3>
                            <button className="wizard-close" onClick={() => setShowCentroForm(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="wizard-field">
                                <label className="form-label">Nombre *</label>
                                <input className="form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: TUCUMAN" autoFocus />
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Descripción</label>
                                <textarea className="form-input" rows={2} value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Detalle del centro..." />
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Estado</label>
                                <div className="wizard-pills" style={{ marginTop: 4 }}>
                                    {STATUS_OPTIONS.map(s => (
                                        <button key={s.value}
                                            className={`wizard-pill${formStatus === s.value ? ' selected' : ''}`}
                                            onClick={() => setFormStatus(s.value)}
                                            style={formStatus === s.value ? { background: s.color, borderColor: s.color } : {}}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left" />
                            <div className="wizard-footer-right">
                                <button className="wizard-btn-back" onClick={() => setShowCentroForm(false)}>Cancelar</button>
                                <button className="wizard-btn-next" onClick={saveCentro} disabled={!formName.trim() || saving}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {saving ? 'Guardando...' : 'Confirmar'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {ConfirmModal}
        </div>
    );
}

/* ─── Sub-componentes ──────────────────────────────────── */

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: '0.8125rem', fontWeight: 600,
                background: 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-brand, #2563EB)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.12s',
                marginBottom: -1,
            }}>
            {children}
        </button>
    );
}

function KPIsGlobales({ centros, totalPorCentro }: { centros: Centro[]; totalPorCentro: Map<string, { total: number; cantidad: number }> }) {
    const global = centros.find(c => c.is_global);
    const globalStats = global ? totalPorCentro.get(global.id) || { total: 0, cantidad: 0 } : { total: 0, cantidad: 0 };
    const obras = centros.filter(c => !c.is_global);
    const obrasActivas = obras.filter(c => c.status === 'active').length;

    return (
        <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatARS(globalStats.total)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Total período</div>
            </div>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{globalStats.cantidad}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Gastos cargados</div>
            </div>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{obras.length}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Obras totales</div>
            </div>
            <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#10B981' }}>{obrasActivas}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Obras activas</div>
            </div>
        </div>
    );
}

function CentroRow({
    centro, statusOpt, cantidad, total, onClick, onEdit, onRemove,
}: {
    centro: Centro;
    statusOpt: { value: string; label: string; color: string };
    cantidad: number;
    total: number;
    onClick: () => void;
    onEdit: () => void;
    onRemove: () => void;
}) {
    const iconBtn: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };
    const isGlobal = !!centro.is_global;

    return (
        <div
            style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 140px 140px 80px',
                padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)',
                alignItems: 'center', transition: 'background 0.1s', cursor: 'pointer',
                background: isGlobal ? 'var(--color-bg-surface-2, rgba(37,99,235,0.04))' : undefined,
            }}
            onClick={onClick}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = isGlobal ? 'var(--color-bg-surface-2, rgba(37,99,235,0.04))' : '')}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isGlobal
                    ? <Building2 size={16} color="#2563EB" />
                    : <HardHat size={14} color="var(--color-text-muted)" />}
                <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: isGlobal ? 800 : 600, color: 'var(--color-text-primary)' }}>
                        {centro.name}
                        {isGlobal && <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(37,99,235,0.12)', color: '#2563EB', marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>GLOBAL</span>}
                    </div>
                    {centro.description && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{centro.description}</div>}
                </div>
            </div>
            <div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${statusOpt.color}15`, color: statusOpt.color, textTransform: 'capitalize' }}>{statusOpt.label}</span>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {cantidad}
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {formatARS(total)}
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                {!isGlobal && (
                    <>
                        <button onClick={onEdit} style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                            <Pencil size={13} />
                        </button>
                        <button onClick={onRemove} style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                            <Trash2 size={14} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

/* ─── Detalle de un centro ─────────────────────────────── */

interface GastoConMonto extends Gasto {
    montoAtribuido: number; // Monto que aplica para el centro siendo visto
}

interface NodoArbol {
    cat: Categoria;
    children: NodoArbol[];
    total: number;
    gastos: GastoConMonto[];
}

function DetalleCentro({
    centro, centros, gastos, categorias, periodo, onBack, onChangePeriodo, onProrratear,
}: {
    centro: Centro;
    centros: Centro[];
    gastos: Gasto[];
    categorias: Categoria[];
    periodo: string;
    onBack: () => void;
    onChangePeriodo: (p: string) => void;
    onProrratear: (g: Gasto) => void;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    function montoParaEsteCentro(g: Gasto): number {
        if (centro.is_global) return g.monto_ars; // global ve el 100%
        if (g.prorrateo.length === 0) return g.proyecto_id === centro.id ? g.monto_ars : 0;
        let total = 0;
        for (const linea of g.prorrateo) {
            if (linea.proyecto_id !== centro.id) continue;
            if (linea.monto != null) total += linea.monto;
            else if (linea.porcentaje != null) total += g.monto_ars * (linea.porcentaje / 100);
        }
        return total;
    }

    // Filtrar gastos que aplican al centro
    const gastosDelCentro = useMemo<GastoConMonto[]>(() => {
        const out: GastoConMonto[] = [];
        for (const g of gastos) {
            if (g.tipo !== 'gasto') continue;
            const monto = montoParaEsteCentro(g);
            if (monto > 0) out.push({ ...g, montoAtribuido: monto });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gastos, centro]);

    // Construir árbol de categorías con totales
    const arbol = useMemo<NodoArbol[]>(() => {
        const byParent = new Map<string | null, Categoria[]>();
        for (const cat of categorias) {
            if (cat.tipo !== 'gasto') continue;
            const k = cat.parent_id;
            if (!byParent.has(k)) byParent.set(k, []);
            byParent.get(k)!.push(cat);
        }

        const gastosPorCat = new Map<string, GastoConMonto[]>();
        for (const g of gastosDelCentro) {
            if (!g.categoria_id) continue;
            if (!gastosPorCat.has(g.categoria_id)) gastosPorCat.set(g.categoria_id, []);
            gastosPorCat.get(g.categoria_id)!.push(g);
        }

        function build(parentId: string | null): NodoArbol[] {
            const hijos = byParent.get(parentId) || [];
            return hijos
                .map(cat => {
                    const children = build(cat.id);
                    const propios = gastosPorCat.get(cat.id) || [];
                    const totalHijos = children.reduce((s, n) => s + n.total, 0);
                    const totalPropios = propios.reduce((s, c) => s + c.montoAtribuido, 0);
                    return {
                        cat,
                        children,
                        gastos: propios,
                        total: totalHijos + totalPropios,
                    };
                })
                .sort((a, b) => (a.cat.orden ?? 0) - (b.cat.orden ?? 0));
        }

        return build(null);
    }, [categorias, gastosDelCentro]);

    // Gastos sin clasificar
    const sinClasificar = useMemo(
        () => gastosDelCentro.filter(g => !g.categoria_id),
        [gastosDelCentro]
    );

    const total = gastosDelCentro.reduce((s, g) => s + g.montoAtribuido, 0);
    const cantidad = gastosDelCentro.length;
    const promedio = cantidad > 0 ? total / cantidad : 0;

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={onBack} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                    <ChevronLeft size={14} /> Volver
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {centro.is_global ? <Building2 size={20} color="#2563EB" /> : <HardHat size={18} color="var(--color-text-muted)" />}
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{centro.name}</h1>
                    {centro.is_global && <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(37,99,235,0.12)', color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>GLOBAL</span>}
                </div>
                <StyledSelect value={periodo} onChange={e => onChangePeriodo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto', marginLeft: 'auto' }}>
                    {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </StyledSelect>
            </div>

            {/* KPIs */}
            <div style={{ display: 'flex', gap: 10 }}>
                <KPI label="Total" value={formatARS(total)} highlight />
                <KPI label="Cant. gastos" value={String(cantidad)} />
                <KPI label="Promedio" value={formatARS(Math.round(promedio))} />
                <KPI label="Sin clasificar" value={String(sinClasificar.length)} color={sinClasificar.length > 0 ? '#F59E0B' : undefined} />
            </div>

            {/* Árbol de gastos */}
            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Gastos agrupados por categoría
                </div>
                {arbol.length === 0 && sinClasificar.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        No hay gastos cargados en este período.
                    </div>
                )}
                {arbol.map(nodo => nodo.total > 0 && (
                    <NodoCategoria
                        key={nodo.cat.id}
                        nodo={nodo}
                        nivel={0}
                        total={total}
                        expanded={expanded}
                        onToggle={toggleExpand}
                        onProrratear={onProrratear}
                        centroEsGlobal={!!centro.is_global}
                    />
                ))}
                {sinClasificar.length > 0 && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)', background: '#FEF3C7' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>⚠ {sinClasificar.length} gasto(s) sin categoría</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatARS(sinClasificar.reduce((s, c) => s + c.monto_ars, 0))}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function NodoCategoria({
    nodo, nivel, total, expanded, onToggle, onProrratear, centroEsGlobal,
}: {
    nodo: NodoArbol;
    nivel: number;
    total: number;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onProrratear: (g: Gasto) => void;
    centroEsGlobal: boolean;
}) {
    const isOpen = expanded.has(nodo.cat.id);
    const tieneHijos = nodo.children.length > 0 || nodo.gastos.length > 0;
    const pct = total > 0 ? (nodo.total / total) * 100 : 0;
    const padding = 16 + nivel * 24;

    return (
        <>
            <div
                onClick={() => tieneHijos && onToggle(nodo.cat.id)}
                style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr 60px 140px',
                    padding: `10px 16px 10px ${padding}px`,
                    borderBottom: '1px solid var(--color-border-subtle)',
                    alignItems: 'center', cursor: tieneHijos ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                    background: nivel === 0 ? 'var(--color-bg-surface-2, rgba(0,0,0,0.015))' : undefined,
                }}
                onMouseEnter={e => { if (tieneHijos) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = nivel === 0 ? 'var(--color-bg-surface-2, rgba(0,0,0,0.015))' : ''; }}
            >
                <div>{tieneHijos && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: nodo.cat.color }} />
                    <span style={{ fontSize: nivel === 0 ? '0.85rem' : '0.78rem', fontWeight: nivel === 0 ? 700 : nivel === 1 ? 600 : 500, color: 'var(--color-text-primary)' }}>
                        {nodo.cat.nombre}
                    </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {pct.toFixed(0)}%
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-text-primary)' }}>
                    {formatARS(nodo.total)}
                </div>
            </div>
            {isOpen && nodo.children.map(hijo => hijo.total > 0 && (
                <NodoCategoria
                    key={hijo.cat.id}
                    nodo={hijo}
                    nivel={nivel + 1}
                    total={total}
                    expanded={expanded}
                    onToggle={onToggle}
                    onProrratear={onProrratear}
                    centroEsGlobal={centroEsGlobal}
                />
            ))}
            {isOpen && nodo.gastos.length > 0 && (
                <div style={{ padding: `8px 16px 8px ${padding + 24}px`, background: 'var(--color-bg-surface)' }}>
                    {nodo.gastos.slice(0, 20).map(g => {
                        const tieneProrrateo = g.prorrateo.length > 0;
                        const distinto = g.montoAtribuido !== g.monto_ars;
                        return (
                            <div key={`${g.source}-${g.id}`} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 110px 100px 32px', gap: 10, padding: '5px 0', fontSize: '0.72rem', alignItems: 'center', borderBottom: '1px dashed var(--color-border-subtle)' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                                    {new Date(g.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                </span>
                                <span style={{ color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: g.source === 'comprobante' ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)', color: g.source === 'comprobante' ? '#6366F1' : '#D97706', textTransform: 'uppercase', flexShrink: 0 }}>
                                        {g.source === 'comprobante' ? 'FAC' : 'MOV'}
                                    </span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {g.proveedor_nombre || g.descripcion || '—'}
                                    </span>
                                    {tieneProrrateo && (
                                        <span title="Gasto prorrateado entre obras" style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10B981', textTransform: 'uppercase', flexShrink: 0 }}>
                                            PRORRATEO
                                        </span>
                                    )}
                                </span>
                                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                                    {g.numero_comprobante || ''}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600 }}>
                                    {formatARS(g.montoAtribuido)}
                                    {distinto && (
                                        <div style={{ fontSize: '0.6rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                                            de {formatARS(g.monto_ars)}
                                        </div>
                                    )}
                                </span>
                                <button
                                    onClick={() => onProrratear(g)}
                                    title={tieneProrrateo ? 'Editar prorrateo' : 'Prorratear entre obras'}
                                    style={{
                                        width: 24, height: 24, borderRadius: 6,
                                        border: '1px solid ' + (tieneProrrateo ? '#10B981' : 'var(--color-border-subtle)'),
                                        background: tieneProrrateo ? 'rgba(16,185,129,0.08)' : 'var(--color-bg-surface)',
                                        color: tieneProrrateo ? '#10B981' : 'var(--color-text-muted)',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <Split size={11} />
                                </button>
                            </div>
                        );
                    })}
                    {nodo.gastos.length > 20 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '6px 0', textAlign: 'center' }}>
                            +{nodo.gastos.length - 20} gastos más
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

function KPI({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
    return (
        <div style={{
            flex: 1, padding: '12px 14px', borderRadius: 10,
            background: highlight ? 'rgba(37,99,235,0.06)' : 'var(--color-bg-card)',
            border: '1px solid ' + (highlight ? 'rgba(37,99,235,0.25)' : 'var(--color-border-subtle)'),
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: color || (highlight ? '#2563EB' : undefined) }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500, marginTop: 2 }}>{label}</div>
        </div>
    );
}

// Receipt aliasing avoids unused-import warning
void Receipt;
