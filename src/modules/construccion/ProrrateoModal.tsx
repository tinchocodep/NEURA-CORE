import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import StyledSelect from '../../shared/components/StyledSelect';
import { X, Plus, Trash2, Check, Split, AlertTriangle } from 'lucide-react';

interface Centro {
    id: string;
    name: string;
    is_global: boolean | null;
}

interface ProrrateoLinea {
    proyecto_id: string;
    porcentaje: number | null;
    monto: number | null;
}

interface Gasto {
    id: string;
    source: 'comprobante' | 'movimiento';
    monto_ars: number;
    descripcion: string | null;
    proveedor_nombre: string | null;
    fecha: string;
    prorrateo: ProrrateoLinea[];
}

interface LineaForm {
    id: string;
    proyecto_id: string;
    porcentaje: string;
    monto: string;
}

function fmt(n: number): string {
    return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ProrrateoModal({
    gasto, centros, tenantId, onClose, onSaved,
}: {
    gasto: Gasto;
    centros: Centro[];
    tenantId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    // Solo obras (no la global)
    const obras = useMemo(() => centros.filter(c => !c.is_global), [centros]);

    // Inicializar líneas desde el prorrateo existente o vacío
    const [lineas, setLineas] = useState<LineaForm[]>(() => {
        if (gasto.prorrateo.length > 0) {
            return gasto.prorrateo.map((l, idx) => ({
                id: `existing-${idx}`,
                proyecto_id: l.proyecto_id,
                porcentaje: l.porcentaje !== null ? String(l.porcentaje) : '',
                monto: l.monto !== null ? String(l.monto) : '',
            }));
        }
        return [{ id: 'new-0', proyecto_id: '', porcentaje: '', monto: '' }];
    });

    const [modo, setModo] = useState<'porcentaje' | 'monto'>('porcentaje');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Suma total
    const sumas = useMemo(() => {
        let totalPct = 0;
        let totalMonto = 0;
        for (const l of lineas) {
            const pct = parseFloat(l.porcentaje) || 0;
            const mnt = parseFloat(l.monto) || 0;
            totalPct += pct;
            totalMonto += mnt;
        }
        return { totalPct, totalMonto };
    }, [lineas]);

    const sumaCorrecta = modo === 'porcentaje'
        ? Math.abs(sumas.totalPct - 100) < 0.01
        : Math.abs(sumas.totalMonto - gasto.monto_ars) < 1;

    const restante = modo === 'porcentaje'
        ? 100 - sumas.totalPct
        : gasto.monto_ars - sumas.totalMonto;

    const agregarLinea = () => {
        setLineas(prev => [...prev, { id: `new-${Date.now()}`, proyecto_id: '', porcentaje: '', monto: '' }]);
    };

    const quitarLinea = (id: string) => {
        setLineas(prev => prev.filter(l => l.id !== id));
    };

    const actualizar = (id: string, campo: 'proyecto_id' | 'porcentaje' | 'monto', valor: string) => {
        setLineas(prev => prev.map(l => {
            if (l.id !== id) return l;
            const nueva = { ...l, [campo]: valor };
            // Si edita porcentaje, calcular monto auto y viceversa
            if (campo === 'porcentaje' && valor) {
                const pct = parseFloat(valor) || 0;
                nueva.monto = (gasto.monto_ars * pct / 100).toFixed(0);
            } else if (campo === 'monto' && valor) {
                const mnt = parseFloat(valor) || 0;
                nueva.porcentaje = (mnt / gasto.monto_ars * 100).toFixed(2);
            }
            return nueva;
        }));
    };

    const handleSave = async () => {
        setError(null);

        // Validaciones
        const validas = lineas.filter(l => l.proyecto_id && (l.porcentaje || l.monto));
        if (validas.length === 0) {
            setError('Agregá al menos una línea con obra y porcentaje/monto.');
            return;
        }
        if (!sumaCorrecta) {
            setError(modo === 'porcentaje'
                ? `La suma de porcentajes debe ser 100% (actual: ${sumas.totalPct.toFixed(2)}%).`
                : `La suma de montos debe ser ${fmt(gasto.monto_ars)} (actual: ${fmt(sumas.totalMonto)}).`);
            return;
        }
        // Validar que no haya obras duplicadas
        const obraIds = new Set();
        for (const l of validas) {
            if (obraIds.has(l.proyecto_id)) {
                setError('No podés repetir la misma obra en varias líneas. Sumá los porcentajes en una sola.');
                return;
            }
            obraIds.add(l.proyecto_id);
        }

        setSaving(true);
        const tabla = gasto.source === 'comprobante' ? 'contable_comprobante_centros' : 'treasury_transaction_centros';
        const colId = gasto.source === 'comprobante' ? 'comprobante_id' : 'transaction_id';

        // Borrar prorrateo previo de este gasto
        await supabase.from(tabla).delete().eq(colId, gasto.id);

        // Insertar nuevas líneas
        const inserts = validas.map(l => ({
            tenant_id: tenantId,
            [colId]: gasto.id,
            proyecto_id: l.proyecto_id,
            porcentaje: parseFloat(l.porcentaje) || null,
            monto: parseFloat(l.monto) || null,
        }));
        const { error: e } = await supabase.from(tabla).insert(inserts);
        setSaving(false);
        if (e) {
            setError('Error al guardar: ' + e.message);
            return;
        }
        onSaved();
    };

    const handleEliminarProrrateo = async () => {
        setSaving(true);
        const tabla = gasto.source === 'comprobante' ? 'contable_comprobante_centros' : 'treasury_transaction_centros';
        const colId = gasto.source === 'comprobante' ? 'comprobante_id' : 'transaction_id';
        await supabase.from(tabla).delete().eq(colId, gasto.id);
        setSaving(false);
        onSaved();
    };

    return (
        <div className="wizard-overlay" onClick={onClose}>
            <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '90%' }}>
                <div className="wizard-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Split size={16} /> Prorratear gasto entre obras
                    </h3>
                    <button className="wizard-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Resumen del gasto */}
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--color-bg-surface-2, rgba(0,0,0,0.025))', border: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                    {gasto.proveedor_nombre || gasto.descripcion || 'Gasto'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                    {new Date(gasto.fecha).toLocaleDateString('es-AR')} · {gasto.source === 'comprobante' ? 'Factura' : 'Movimiento'}
                                </div>
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                                {fmt(gasto.monto_ars)}
                            </div>
                        </div>
                    </div>

                    {/* Toggle modo */}
                    <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-bg-surface-2, rgba(0,0,0,0.04))', borderRadius: 8 }}>
                        <button
                            onClick={() => setModo('porcentaje')}
                            style={{
                                flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                fontSize: '0.78rem', fontWeight: 600,
                                background: modo === 'porcentaje' ? 'var(--color-bg-surface)' : 'transparent',
                                color: modo === 'porcentaje' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                boxShadow: modo === 'porcentaje' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                            }}
                        >
                            Por porcentaje
                        </button>
                        <button
                            onClick={() => setModo('monto')}
                            style={{
                                flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                fontSize: '0.78rem', fontWeight: 600,
                                background: modo === 'monto' ? 'var(--color-bg-surface)' : 'transparent',
                                color: modo === 'monto' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                boxShadow: modo === 'monto' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                            }}
                        >
                            Por monto
                        </button>
                    </div>

                    {/* Líneas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px 32px', gap: 8, fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>
                            <span>Obra</span>
                            <span style={{ textAlign: 'right' }}>Porcentaje</span>
                            <span style={{ textAlign: 'right' }}>Monto</span>
                            <span></span>
                        </div>
                        {lineas.map(l => (
                            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px 32px', gap: 8, alignItems: 'center' }}>
                                <StyledSelect className="form-input" value={l.proyecto_id} onChange={e => actualizar(l.id, 'proyecto_id', e.target.value)} style={{ height: 34, fontSize: '0.8rem' }}>
                                    <option value="">Elegir obra...</option>
                                    {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </StyledSelect>
                                <input
                                    type="number" step="0.01" min="0" max="100"
                                    className="form-input"
                                    value={l.porcentaje}
                                    onChange={e => actualizar(l.id, 'porcentaje', e.target.value)}
                                    placeholder="0.00"
                                    style={{ height: 34, fontSize: '0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                                    disabled={modo === 'monto'}
                                />
                                <input
                                    type="number" step="1" min="0"
                                    className="form-input"
                                    value={l.monto}
                                    onChange={e => actualizar(l.id, 'monto', e.target.value)}
                                    placeholder="0"
                                    style={{ height: 34, fontSize: '0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                                    disabled={modo === 'porcentaje'}
                                />
                                <button
                                    onClick={() => quitarLinea(l.id)}
                                    style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: '1px solid #EF444420', background: 'var(--color-bg-surface)',
                                        color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                    disabled={lineas.length === 1}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={agregarLinea}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '8px 12px', borderRadius: 8,
                                border: '1px dashed var(--color-border-subtle)', background: 'transparent',
                                color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                marginTop: 4,
                            }}
                        >
                            <Plus size={13} /> Agregar otra obra
                        </button>
                    </div>

                    {/* Resumen / validación */}
                    <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: sumaCorrecta ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                        border: '1px solid ' + (sumaCorrecta ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'),
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {sumaCorrecta ? <Check size={14} color="#10B981" /> : <AlertTriangle size={14} color="#F59E0B" />}
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: sumaCorrecta ? '#10B981' : '#92400E' }}>
                                {sumaCorrecta
                                    ? '¡Suma correcta!'
                                    : `Falta ${modo === 'porcentaje' ? restante.toFixed(2) + '%' : fmt(Math.abs(restante))}`}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {modo === 'porcentaje'
                                ? `${sumas.totalPct.toFixed(2)} / 100%`
                                : `${fmt(sumas.totalMonto)} / ${fmt(gasto.monto_ars)}`}
                        </div>
                    </div>

                    {error && (
                        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem' }}>
                            {error}
                        </div>
                    )}
                </div>
                <div className="wizard-footer">
                    <div className="wizard-footer-left">
                        {gasto.prorrateo.length > 0 && (
                            <button className="wizard-btn-danger" onClick={handleEliminarProrrateo} disabled={saving}>
                                Quitar prorrateo
                            </button>
                        )}
                    </div>
                    <div className="wizard-footer-right">
                        <button className="wizard-btn-back" onClick={onClose}>Cancelar</button>
                        <button className="wizard-btn-next" onClick={handleSave} disabled={saving || !sumaCorrecta}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {saving ? 'Guardando...' : 'Confirmar'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
