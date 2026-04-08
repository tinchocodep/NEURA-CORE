import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { FolderOpen, Plus, Trash2, ExternalLink, Upload } from 'lucide-react';
import type { ObraDocumento, ConfigCategoriaDoc } from '../types';

export default function TabDocumentacion({ obraId }: { obraId: string }) {
  const { tenant } = useTenant();
  const [docs, setDocs] = useState<ObraDocumento[]>([]);
  const [categorias, setCategorias] = useState<ConfigCategoriaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [docsRes, catRes] = await Promise.all([
      supabase.from('obras_documentos').select('*, categoria:obras_config_categorias_doc(*)').eq('obra_id', obraId).eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
      supabase.from('obras_config_categorias_doc').select('*').eq('tenant_id', tenant!.id).order('orden'),
    ]);
    setDocs(docsRes.data || []);
    setCategorias(catRes.data || []);
    setLoading(false);
  };

  const handleUpload = async (file: File, categoriaId: string | null) => {
    setUploading(true);
    const path = `obras-docs/${tenant!.id}/${obraId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('documentos').upload(path, file);
    let url: string | null = null;
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(path);
      url = publicUrl;
    }
    await supabase.from('obras_documentos').insert({
      tenant_id: tenant!.id, obra_id: obraId,
      categoria_id: categoriaId, descripcion: file.name,
      archivo_url: url, archivo_nombre: file.name,
      fecha: new Date().toISOString().slice(0, 10),
    });
    setUploading(false);
    loadData();
  };

  const removeDoc = async (id: string) => {
    await supabase.from('obras_documentos').delete().eq('id', id);
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  const addCategoria = async () => {
    const nombre = prompt('Nombre de la categoría (ej: Planos, Permisos, Pólizas, Fotos):');
    if (!nombre?.trim()) return;
    await supabase.from('obras_config_categorias_doc').insert({ tenant_id: tenant!.id, nombre, orden: categorias.length });
    loadData();
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando documentación...</div>;

  // Group by category
  const groups = new Map<string, ObraDocumento[]>();
  groups.set('sin_categoria', []);
  categorias.forEach(c => groups.set(c.id, []));
  docs.forEach(d => {
    const key = d.categoria_id || 'sin_categoria';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpen size={16} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Documentación</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>({docs.length} archivos)</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addCategoria}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            + Categoría
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>
            <Upload size={14} /> {uploading ? 'Subiendo...' : 'Subir archivo'}
            <input type="file" hidden onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], null); }} />
          </label>
        </div>
      </div>

      {/* Categories grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {categorias.map(cat => {
          const catDocs = groups.get(cat.id) || [];
          return (
            <div key={cat.id} style={{ borderRadius: 10, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'var(--color-bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderOpen size={14} style={{ color: '#f59e0b' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{cat.nombre}</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>({catDocs.length})</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px dashed var(--color-border)', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-accent)' }}>
                  <Plus size={12} /> Subir
                  <input type="file" hidden onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], cat.id); }} />
                </label>
              </div>
              {catDocs.length > 0 && (
                <div style={{ padding: '8px 16px' }}>
                  {catDocs.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{d.archivo_nombre || d.descripcion || 'Sin nombre'}</span>
                      {d.fecha && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{d.fecha}</span>}
                      {d.archivo_url && (
                        <a href={d.archivo_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', padding: 2 }}><ExternalLink size={12} /></a>
                      )}
                      <button onClick={() => removeDoc(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Sin categoría */}
        {(groups.get('sin_categoria') || []).length > 0 && (
          <div style={{ borderRadius: 10, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--color-bg-surface-2)' }}>
              <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Sin categoría</span>
            </div>
            <div style={{ padding: '8px 16px' }}>
              {(groups.get('sin_categoria') || []).map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{d.archivo_nombre || d.descripcion || 'Sin nombre'}</span>
                  {d.archivo_url && <a href={d.archivo_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', padding: 2 }}><ExternalLink size={12} /></a>}
                  <button onClick={() => removeDoc(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {docs.length === 0 && categorias.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
          No hay documentación. Creá una categoría y subí archivos.
        </div>
      )}
    </div>
  );
}
