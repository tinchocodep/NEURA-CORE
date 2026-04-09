import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import StyledSelect from '../../shared/components/StyledSelect';
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface Categoria {
    id: string;
    nombre: string;
    color: string;
    tipo: string;
    parent_id: string | null;
    orden: number | null;
}

interface NodoArbol {
    cat: Categoria;
    children: NodoArbol[];
    nivel: number;
}

const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#0D9488', '#F97316', '#6366F1', '#6B7280', '#A855F7', '#14B8A6', '#22C55E', '#D97706', '#1D4ED8', '#94A3B8', '#78716C', '#0EA5E9'];
const NIVELES_LABEL = ['Categoría', 'Subcategoría', 'Sub-subcategoría'];

export default function PlanCuentasCons({
    categorias, onChange,
}: {
    categorias: Categoria[];
    onChange: () => void;
}) {
    const { tenant } = useTenant();
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categorias.filter(c => !c.parent_id).map(c => c.id)));
    const [filtroTipo, setFiltroTipo] = useState<'gasto' | 'ingreso' | 'todos'>('gasto');

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [parentForNew, setParentForNew] = useState<Categoria | null>(null);
    const [formNombre, setFormNombre] = useState('');
    const [formColor, setFormColor] = useState('#3B82F6');
    const [formTipo, setFormTipo] = useState<'gasto' | 'ingreso'>('gasto');
    const [saving, setSaving] = useState(false);

    const { requestDelete, ConfirmModal } = useConfirmDelete();

    /* ─── Construir árbol ─── */
    const arbol = useMemo<NodoArbol[]>(() => {
        const byParent = new Map<string | null, Categoria[]>();
        for (const cat of categorias) {
            if (filtroTipo !== 'todos' && cat.tipo !== filtroTipo) continue;
            const k = cat.parent_id;
            if (!byParent.has(k)) byParent.set(k, []);
            byParent.get(k)!.push(cat);
        }

        function build(parentId: string | null, nivel: number): NodoArbol[] {
            const hijos = byParent.get(parentId) || [];
            return hijos
                .map(cat => ({ cat, children: build(cat.id, nivel + 1), nivel }))
                .sort((a, b) => (a.cat.orden ?? 0) - (b.cat.orden ?? 0));
        }
        return build(null, 0);
    }, [categorias, filtroTipo]);

    const nivelDe = (cat: Categoria | null): number => {
        if (!cat) return 0;
        let n = 0;
        let cur: Categoria | undefined = cat;
        while (cur?.parent_id) {
            cur = categorias.find(c => c.id === cur!.parent_id);
            n += 1;
        }
        return n;
    };

    const toggle = (id: string) => {
        setExpanded(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    };

    /* ─── CRUD ─── */
    const openNew = (parent: Categoria | null) => {
        setEditingId(null);
        setParentForNew(parent);
        setFormNombre('');
        setFormColor(parent?.color || '#3B82F6');
        setFormTipo((parent?.tipo as 'gasto' | 'ingreso') || 'gasto');
        setShowModal(true);
    };
    const openEdit = (cat: Categoria) => {
        setEditingId(cat.id);
        setParentForNew(null);
        setFormNombre(cat.nombre);
        setFormColor(cat.color);
        setFormTipo(cat.tipo as 'gasto' | 'ingreso');
        setShowModal(true);
    };
    const save = async () => {
        if (!tenant || !formNombre.trim()) return;
        setSaving(true);
        if (editingId) {
            await supabase.from('contable_categorias').update({
                nombre: formNombre.trim(),
                color: formColor,
                tipo: formTipo,
            }).eq('id', editingId);
        } else {
            // Calcular siguiente orden
            const sameParent = categorias.filter(c => c.parent_id === (parentForNew?.id ?? null));
            const nextOrden = sameParent.length > 0
                ? Math.max(...sameParent.map(c => c.orden ?? 0)) + 1
                : 1;
            await supabase.from('contable_categorias').insert({
                tenant_id: tenant.id,
                nombre: formNombre.trim(),
                color: formColor,
                tipo: formTipo,
                parent_id: parentForNew?.id ?? null,
                orden: nextOrden,
            });
            // Auto-expandir el padre
            if (parentForNew) {
                setExpanded(prev => new Set(prev).add(parentForNew.id));
            }
        }
        setSaving(false);
        setShowModal(false);
        onChange();
    };
    const remove = (cat: Categoria) => {
        const tieneHijos = categorias.some(c => c.parent_id === cat.id);
        const msg = tieneHijos
            ? `Se eliminará "${cat.nombre}" y todas sus subcategorías. Esta acción no se puede deshacer.`
            : `Se eliminará la categoría "${cat.nombre}". Esta acción no se puede deshacer.`;
        requestDelete(msg, async () => {
            await supabase.from('contable_categorias').delete().eq('id', cat.id);
            onChange();
        });
    };

    const editingCat = editingId ? categorias.find(c => c.id === editingId) : null;
    const nivelActual = editingCat ? nivelDe(editingCat) : (parentForNew ? nivelDe(parentForNew) + 1 : 0);
    const canSave = formNombre.trim().length > 0 && nivelActual <= 2;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Header */}
            <div className="module-header-desktop">
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Plan de Cuentas</h1>
                <StyledSelect
                    value={filtroTipo}
                    onChange={e => setFiltroTipo(e.target.value as any)}
                    className="form-input"
                    style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}
                >
                    <option value="gasto">Solo gastos</option>
                    <option value="ingreso">Solo ingresos</option>
                    <option value="todos">Todos</option>
                </StyledSelect>
                <button onClick={() => openNew(null)} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                    <Plus size={14} /> Nueva categoría
                </button>
            </div>

            {/* Árbol */}
            <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {arbol.length} {arbol.length === 1 ? 'categoría raíz' : 'categorías raíz'} · 3 niveles máximo
                </div>
                {arbol.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Sin categorías. Creá la primera con el botón "Nueva categoría".
                    </div>
                )}
                {arbol.map(nodo => (
                    <NodoEditable
                        key={nodo.cat.id}
                        nodo={nodo}
                        expanded={expanded}
                        onToggle={toggle}
                        onAddChild={openNew}
                        onEdit={openEdit}
                        onRemove={remove}
                    />
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="wizard-overlay" onClick={() => setShowModal(false)}>
                    <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="wizard-header">
                            <h3>
                                {editingId
                                    ? `Editar ${NIVELES_LABEL[nivelActual] || 'categoría'}`
                                    : parentForNew
                                        ? `Nueva ${NIVELES_LABEL[nivelActual]} dentro de "${parentForNew.nombre}"`
                                        : 'Nueva categoría raíz'}
                            </h3>
                            <button className="wizard-close" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {nivelActual > 2 && (
                                <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem' }}>
                                    Llegaste al nivel máximo (3). No se pueden anidar más subcategorías.
                                </div>
                            )}
                            <div className="wizard-field">
                                <label className="form-label">Nombre *</label>
                                <input className="form-input" value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: Hormigón" autoFocus />
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Tipo</label>
                                <div className="wizard-pills" style={{ marginTop: 4 }}>
                                    {(['gasto', 'ingreso'] as const).map(t => (
                                        <button key={t}
                                            disabled={!!parentForNew || (!!editingCat && !!editingCat.parent_id)}
                                            className={`wizard-pill${formTipo === t ? ' selected' : ''}`}
                                            onClick={() => setFormTipo(t)}
                                            style={formTipo === t ? { background: t === 'gasto' ? '#EF4444' : '#10B981', borderColor: t === 'gasto' ? '#EF4444' : '#10B981' } : {}}>
                                            {t === 'gasto' ? 'Gasto' : 'Ingreso'}
                                        </button>
                                    ))}
                                </div>
                                {(parentForNew || (editingCat && editingCat.parent_id)) && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                        Las subcategorías heredan el tipo del padre.
                                    </div>
                                )}
                            </div>
                            <div className="wizard-field">
                                <label className="form-label">Color</label>
                                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                    {COLORES.map(c => (
                                        <button key={c} onClick={() => setFormColor(c)}
                                            style={{ width: 28, height: 28, borderRadius: 8, background: c, border: formColor === c ? '3px solid var(--color-text-primary)' : '2px solid transparent', cursor: 'pointer', transition: 'border 0.12s' }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="wizard-footer">
                            <div className="wizard-footer-left">
                                {editingId && editingCat && (
                                    <button className="wizard-btn-danger" onClick={() => { remove(editingCat); setShowModal(false); }}>Eliminar</button>
                                )}
                            </div>
                            <div className="wizard-footer-right">
                                <button className="wizard-btn-back" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button className="wizard-btn-next" onClick={save} disabled={!canSave || saving}>
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

function NodoEditable({
    nodo, expanded, onToggle, onAddChild, onEdit, onRemove,
}: {
    nodo: NodoArbol;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onAddChild: (parent: Categoria) => void;
    onEdit: (cat: Categoria) => void;
    onRemove: (cat: Categoria) => void;
}) {
    const isOpen = expanded.has(nodo.cat.id);
    const tieneHijos = nodo.children.length > 0;
    const padding = 16 + nodo.nivel * 24;
    const puedeAgregarHijo = nodo.nivel < 2;

    const iconBtn: React.CSSProperties = {
        width: 26, height: 26, borderRadius: 6, border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all 0.12s', flexShrink: 0,
    };

    return (
        <>
            <div
                style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr 110px',
                    padding: `9px 16px 9px ${padding}px`,
                    borderBottom: '1px solid var(--color-border-subtle)',
                    alignItems: 'center', transition: 'background 0.1s',
                    background: nodo.nivel === 0 ? 'var(--color-bg-surface-2, rgba(0,0,0,0.015))' : undefined,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = nodo.nivel === 0 ? 'var(--color-bg-surface-2, rgba(0,0,0,0.015))' : '')}
            >
                <div style={{ cursor: tieneHijos ? 'pointer' : 'default' }} onClick={() => tieneHijos && onToggle(nodo.cat.id)}>
                    {tieneHijos && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: nodo.cat.color, flexShrink: 0 }} />
                    <span style={{ fontSize: nodo.nivel === 0 ? '0.85rem' : '0.78rem', fontWeight: nodo.nivel === 0 ? 700 : nodo.nivel === 1 ? 600 : 500, color: 'var(--color-text-primary)' }}>
                        {nodo.cat.nombre}
                    </span>
                    {tieneHijos && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 4 }}>
                            ({nodo.children.length})
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {puedeAgregarHijo && (
                        <button onClick={() => onAddChild(nodo.cat)} title="Agregar sub-categoría"
                            style={{ ...iconBtn, color: '#2563EB', borderColor: 'rgba(37,99,235,0.25)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                            <Plus size={13} />
                        </button>
                    )}
                    <button onClick={() => onEdit(nodo.cat)} title="Editar"
                        style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                        <Pencil size={12} />
                    </button>
                    <button onClick={() => onRemove(nodo.cat)} title="Eliminar"
                        style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
            {isOpen && nodo.children.map(hijo => (
                <NodoEditable
                    key={hijo.cat.id}
                    nodo={hijo}
                    expanded={expanded}
                    onToggle={onToggle}
                    onAddChild={onAddChild}
                    onEdit={onEdit}
                    onRemove={onRemove}
                />
            ))}
        </>
    );
}
