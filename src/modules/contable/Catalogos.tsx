import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { Search, Plus, Trash2, Eye, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';

interface CentroCosto {
    id: string;
    nombre: string;
    color: string;
    tipo: 'ingreso' | 'gasto' | 'ambos';
}

const TIPO_LABEL: Record<string, string> = { ingreso: 'Ingreso', gasto: 'Gasto', ambos: 'Ambos' };
const TIPO_COLOR: Record<string, string> = { ingreso: '#10B981', gasto: '#EF4444', ambos: '#3B82F6' };
const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#0D9488', '#F97316', '#6366F1', '#6B7280'];

export default function CentrosDeCosto() {
    const { tenant } = useTenant();
    const [items, setItems] = useState<CentroCosto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<CentroCosto | null>(null);
    const [wizardStep, setWizardStep] = useState(0);

    // Form
    const [formNombre, setFormNombre] = useState('');
    const [formColor, setFormColor] = useState('#3B82F6');
    const [formTipo, setFormTipo] = useState<'ingreso' | 'gasto' | 'ambos'>('ambos');
    const { requestDelete, ConfirmModal } = useConfirmDelete();

    useEffect(() => { if (tenant) loadData(); }, [tenant]);

    const loadData = async () => {
        setLoading(true);
        const { data } = await supabase.from('contable_categorias').select('*').eq('tenant_id', tenant!.id).order('nombre');
        if (data) setItems(data as any);
        setLoading(false);
    };

    const openNew = () => {
        setEditing(null); setFormNombre(''); setFormColor('#3B82F6'); setFormTipo('ambos');
        setWizardStep(0); setShowModal(true);
    };
    const openEdit = (c: CentroCosto) => {
        setEditing(c); setFormNombre(c.nombre); setFormColor(c.color); setFormTipo(c.tipo);
        setWizardStep(0); setShowModal(true);
    };

    const save = async () => {
        if (!formNombre.trim()) return;
        if (editing) {
            await supabase.from('contable_categorias').update({ nombre: formNombre.trim(), color: formColor, tipo: formTipo }).eq('id', editing.id);
        } else {
            await supabase.from('contable_categorias').insert({ tenant_id: tenant!.id, nombre: formNombre.trim(), color: formColor, tipo: formTipo });
        }
        setShowModal(false); loadData();
    };

    const remove = (c: CentroCosto) => {
        requestDelete('Esta acción eliminará el centro de costos y no se puede deshacer.', async () => {
            await supabase.from('contable_categorias').delete().eq('id', c.id);
            setItems(prev => prev.filter(x => x.id !== c.id));
        });
    };

    const filtered = items.filter(c => {
        if (filterTipo && c.tipo !== filterTipo) return false;
        if (search && !c.nombre.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    // Counts
    const ingresoCount = items.filter(c => c.tipo === 'ingreso').length;
    const gastoCount = items.filter(c => c.tipo === 'gasto').length;
    const ambosCount = items.filter(c => c.tipo === 'ambos').length;

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando centros de costos...</div>;

    const iconBtn: React.CSSProperties = {
        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Centro de Costos</h1>
                <div style={{ flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input type="text" placeholder="Buscar centro..." value={search} onChange={e => setSearch(e.target.value)}
                        className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
                </div>
                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
                    <option value="">Todos los tipos</option>
                    <option value="ingreso">Ingreso ({ingresoCount})</option>
                    <option value="gasto">Gasto ({gastoCount})</option>
                    <option value="ambos">Ambos ({ambosCount})</option>
                </select>
                <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                    <Plus size={14} /> Nuevo
                </button>
            </div>

            {/* Grid table */}
            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
                    <span>Centro de costos</span><span>Tipo</span><span style={{ textAlign: 'right' }}>Acciones</span>
                </div>
                {filtered.map(c => (
                    <div key={c.id}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        {/* Nombre + color */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => openEdit(c)}>
                            <div style={{ width: 12, height: 12, borderRadius: 4, background: c.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.nombre}</span>
                        </div>
                        {/* Tipo */}
                        <div>
                            <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${TIPO_COLOR[c.tipo]}15`, color: TIPO_COLOR[c.tipo], textTransform: 'capitalize' }}>
                                {TIPO_LABEL[c.tipo]}
                            </span>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <div className="row-action-wrap">
                                <button onClick={e => { e.stopPropagation(); openEdit(c); }}
                                    style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                                    <Eye size={14} />
                                </button>
                                <span className="row-action-tooltip">Editar</span>
                            </div>
                            <div className="row-action-wrap">
                                <button onClick={e => { e.stopPropagation(); remove(c); }}
                                    style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                                    <Trash2 size={14} />
                                </button>
                                <span className="row-action-tooltip">Eliminar</span>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin centros de costos</div>}
            </div>

            {/* ─── WIZARD MODAL ─── */}
            {showModal && (() => {
                const STEPS = [{ label: 'Datos' }, { label: 'Tipo' }];
                const isLast = wizardStep === STEPS.length - 1;
                const canNext = wizardStep === 0 ? !!formNombre.trim() : true;

                return (
                    <div className="wizard-overlay" onClick={() => setShowModal(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()}>
                        <div className="wizard-header">
                            <h3>{editing ? 'Editar centro de costos' : 'Nuevo centro de costos'}</h3>
                            <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-steps">
                            {STEPS.map((s, i) => (
                                <div key={i} className="wizard-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        {i > 0 && <div className={`wizard-step-line${i <= wizardStep ? ' done' : ''}`} />}
                                        <div className={`wizard-step-dot${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ' pending'}`}
                                            onClick={() => i < wizardStep && setWizardStep(i)} style={{ cursor: i < wizardStep ? 'pointer' : 'default' }}>
                                            {i < wizardStep ? <Check size={14} /> : i + 1}
                                        </div>
                                    </div>
                                    <div className={`wizard-step-label${i === wizardStep ? ' active' : i < wizardStep ? ' done' : ''}`}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="wizard-body">
                            {wizardStep === 0 && (<>
                                <div className="wizard-field">
                                    <label className="form-label">Nombre *</label>
                                    <input className="form-input" value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: Mantenimiento, Servicios, Alquiler..." />
                                </div>
                                <div className="wizard-field">
                                    <div className="wizard-section-title">Color</div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                        {COLORES.map(c => (
                                            <button key={c} onClick={() => setFormColor(c)}
                                                style={{ width: 32, height: 32, borderRadius: 8, background: c, border: formColor === c ? '3px solid var(--color-text-primary)' : '2px solid transparent', cursor: 'pointer', transition: 'border 0.12s' }} />
                                        ))}
                                    </div>
                                </div>
                            </>)}
                            {wizardStep === 1 && (<>
                                <div className="wizard-field">
                                    <div className="wizard-section-title">Tipo de centro de costos</div>
                                    <div className="wizard-card-options" style={{ marginTop: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                        {(['ingreso', 'gasto', 'ambos'] as const).map(t => (
                                            <div key={t} className={`wizard-card-option${formTipo === t ? ' selected' : ''}`}
                                                onClick={() => setFormTipo(t)}
                                                style={formTipo === t ? { borderColor: TIPO_COLOR[t], background: `${TIPO_COLOR[t]}08` } : {}}>
                                                <div style={{ width: 12, height: 12, borderRadius: 3, background: TIPO_COLOR[t], margin: '0 auto 6px' }} />
                                                <div className="card-label">{TIPO_LABEL[t]}</div>
                                                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                    {t === 'ingreso' ? 'Solo entradas' : t === 'gasto' ? 'Solo salidas' : 'Entradas y salidas'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Preview */}
                                <div style={{ padding: '1rem', borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 16, height: 16, borderRadius: 4, background: formColor, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{formNombre || 'Nombre del centro'}</span>
                                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${TIPO_COLOR[formTipo]}15`, color: TIPO_COLOR[formTipo], marginLeft: 'auto' }}>{TIPO_LABEL[formTipo]}</span>
                                </div>
                            </>)}
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left">
                                {editing && <button className="wizard-btn-danger" onClick={() => { remove(editing); setShowModal(false); }}>Eliminar</button>}
                            </div>
                            <div className="wizard-footer-right">
                                {wizardStep > 0 && (
                                    <button className="wizard-btn-back" onClick={() => setWizardStep(s => s - 1)}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={16} /> Anterior</span>
                                    </button>
                                )}
                                {isLast ? (
                                    <button className="wizard-btn-next" onClick={save} disabled={!formNombre.trim()}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={16} /> {editing ? 'Guardar' : 'Crear'}</span>
                                    </button>
                                ) : (
                                    <button className="wizard-btn-next" onClick={() => setWizardStep(s => s + 1)} disabled={!canNext}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Siguiente <ChevronRight size={16} /></span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                );
            })()}
            {ConfirmModal}
        </div>
    );
}
