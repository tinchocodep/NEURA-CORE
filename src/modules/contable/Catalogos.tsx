import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import { Tag, Trash2, RefreshCw } from 'lucide-react';

interface Categoria {
    id: string;
    nombre: string;
    color: string;
    tipo: 'ingreso' | 'gasto' | 'ambos';
}

export default function Categorias() {
    const { tenant } = useTenant();

    // Categorias management state
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [loadingCategorias, setLoadingCategorias] = useState(false);
    const [newCatNombre, setNewCatNombre] = useState('');
    const [newCatColor, setNewCatColor] = useState('#6366f1');
    const [newCatTipo, setNewCatTipo] = useState<'ingreso' | 'gasto' | 'ambos'>('ambos');
    const [savingCat, setSavingCat] = useState(false);

    useEffect(() => {
        if (!tenant) return;
        loadCategorias();
    }, [tenant]);

    async function loadCategorias() {
        if (!tenant) return;
        setLoadingCategorias(true);
        const { data } = await supabase.from('contable_categorias').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
        setCategorias((data || []) as any);
        setLoadingCategorias(false);
    }

    async function handleSaveCategoria() {
        if (!tenant || !newCatNombre.trim()) return;
        setSavingCat(true);
        const { data, error } = await supabase.from('contable_categorias').insert({
            tenant_id: tenant.id,
            nombre: newCatNombre.trim(),
            color: newCatColor,
            tipo: newCatTipo
        }).select().single();
        if (data && !error) {
            setCategorias([data, ...categorias]);
            setNewCatNombre('');
        }
        setSavingCat(false);
    }

    async function handleDeleteCategoria(id: string) {
        if (!confirm('¿Eliminar esta categoría? Los comprobantes asociados podrían quedar sin categoría.')) return;
        await supabase.from('contable_categorias').delete().eq('id', id);
        setCategorias(categorias.filter(c => c.id !== id));
    }

    return (
        <div>
            <div className="page-header">
                <h1>Categorías</h1>
                <p>Gestión de categorías para clasificación manual o automática vía IA</p>
            </div>

            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Tag size={20} color="var(--brand)" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Nueva Categoría</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Crear una nueva categoría para tus comprobantes.</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.75rem', alignItems: 'end', marginBottom: '1.5rem', background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--r-md)' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Nombre de Categoría</label>
                        <input className="form-input" value={newCatNombre} onChange={e => setNewCatNombre(e.target.value)} placeholder="Ej: Combustible, Sueldos..." />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Tipo</label>
                        <select className="form-input" value={newCatTipo} onChange={e => setNewCatTipo(e.target.value as any)}>
                            <option value="ambos">Ambos</option>
                            <option value="gasto">Gasto (Salida)</option>
                            <option value="ingreso">Ingreso (Entrada)</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Color</label>
                        <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={{ width: 42, height: 38, padding: 0, cursor: 'pointer', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-subtle)' }} />
                    </div>
                    <button className="btn btn-primary" onClick={handleSaveCategoria} disabled={savingCat || !newCatNombre.trim()} style={{ height: 38 }}>
                        {savingCat ? 'Guardando...' : '+ Crear'}
                    </button>
                </div>

                {loadingCategorias ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><RefreshCw className="spinning" size={20} /></div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {categorias.map(cat => (
                            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: cat.color }} />
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cat.nombre}</span>
                                    <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 4, color: 'var(--text-muted)' }}>
                                        {cat.tipo.toUpperCase()}
                                    </span>
                                </div>
                                <button onClick={() => handleDeleteCategoria(cat.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        {categorias.length === 0 && <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No hay categorías creadas.</div>}
                    </div>
                )}
            </div>
        </div>
    );
} 
