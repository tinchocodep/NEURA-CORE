import { useEffect, useState } from 'react';
import { Search, Plus, X, Phone, Mail, MoreVertical, Edit2, Trash2, FileText, ChevronUp, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface Proveedor {
  id: string; nombre: string; rubro: string; contacto_nombre: string | null;
  telefono: string | null; email: string | null; cuit: string | null;
  direccion: string | null; notas: string | null; activo: boolean;
}

interface Comprobante {
  id: string;
  fecha: string;
  tipo_comprobante: string;
  numero_comprobante: string;
  monto_original: number;
  monto_ars: number;
  estado: string;
  descripcion: string | null;
  pdf_url: string | null;
}

const RUBROS = ['plomeria', 'electricidad', 'gas', 'pintura', 'limpieza', 'cerrajeria', 'fumigacion', 'albañileria', 'mudanza', 'general'];
const RUBRO_LABEL: Record<string, string> = {
  plomeria: 'Plomería', electricidad: 'Electricidad', gas: 'Gas', pintura: 'Pintura',
  limpieza: 'Limpieza', cerrajeria: 'Cerrajería', fumigacion: 'Fumigación',
  'albañileria': 'Albañilería', mudanza: 'Mudanza', general: 'General',
};
const RUBRO_COLOR: Record<string, string> = {
  plomeria: '#3B82F6', electricidad: '#F59E0B', gas: '#EF4444', pintura: '#8B5CF6',
  limpieza: '#10B981', cerrajeria: '#6B7280', fumigacion: '#0D9488',
  'albañileria': '#F97316', mudanza: '#EC4899', general: '#6366F1',
};

const emptyProv = { nombre: '', rubro: 'general', contacto_nombre: '', telefono: '', email: '', cuit: '', direccion: '', notas: '', activo: true };

function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => { const h = () => setM(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return m;
}

const ESTADO_COLORS: Record<string, { bg: string; text: string }> = {
  pendiente: { bg: '#FEF3C7', text: '#92400E' },
  aprobado: { bg: '#D1FAE5', text: '#065F46' },
  pagado: { bg: '#DBEAFE', text: '#1E40AF' },
  rechazado: { bg: '#FEE2E2', text: '#991B1B' },
};

export default function ProveedoresInmob() {
  const { tenant } = useTenant();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRubro, setFilterRubro] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form, setForm] = useState(emptyProv);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loadingComp, setLoadingComp] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inmobiliaria_proveedores').select('*').eq('tenant_id', tenant!.id).order('nombre');
    if (data) setItems(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(emptyProv); setShowModal(true); };
  const openEdit = (p: Proveedor) => { setEditing(p); setForm(p as any); setShowModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return;
    const payload = { ...form, tenant_id: tenant!.id };
    if (editing) {
      await supabase.from('inmobiliaria_proveedores').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('inmobiliaria_proveedores').insert(payload);
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proveedor?')) return;
    await supabase.from('inmobiliaria_proveedores').delete().eq('id', id);
    loadData();
  };

  const toggleDetail = async (p: Proveedor) => {
    if (expandedId === p.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(p.id);
    setLoadingComp(true);
    // Try to find comprobantes by CUIT match
    if (p.cuit) {
      const { data } = await supabase
        .from('contable_comprobantes')
        .select('id, fecha, tipo_comprobante, numero_comprobante, monto_original, monto_ars, estado, descripcion, pdf_url')
        .eq('tenant_id', tenant!.id)
        .eq('cuit_emisor', p.cuit)
        .order('fecha', { ascending: false })
        .limit(10);
      setComprobantes(data || []);
    } else {
      setComprobantes([]);
    }
    setLoadingComp(false);
  };

  const filtered = items.filter(p => {
    if (filterRubro && p.rubro !== filterRubro) return false;
    if (search && !p.nombre.toLowerCase().includes(search.toLowerCase()) && !(p.contacto_nombre || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando proveedores...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 38, fontSize: '0.8125rem', borderRadius: 10 }} />
        </div>
        <button onClick={openNew} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-cta, #2563EB)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={18} />
        </button>
      </div>

      {/* Rubro filter chips */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
        <button onClick={() => setFilterRubro('')} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)', background: !filterRubro ? 'var(--color-text-primary)' : 'var(--color-bg-surface)', color: !filterRubro ? '#fff' : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>Todos ({items.length})</button>
        {RUBROS.filter(r => items.some(p => p.rubro === r)).map(r => (
          <button key={r} onClick={() => setFilterRubro(filterRubro === r ? '' : r)}
            style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${filterRubro === r ? (RUBRO_COLOR[r] || '#6B7280') : 'var(--color-border-subtle)'}`, background: filterRubro === r ? `${RUBRO_COLOR[r]}15` : 'var(--color-bg-surface)', color: filterRubro === r ? RUBRO_COLOR[r] : 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
            {RUBRO_LABEL[r] || r}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(p => {
          const color = RUBRO_COLOR[p.rubro] || '#6B7280';
          const isExpanded = expandedId === p.id;
          return (
            <div key={p.id} style={{ borderRadius: 12, background: 'var(--color-bg-card)', border: `1px solid ${isExpanded ? color + '40' : 'var(--color-border-subtle)'}`, transition: 'border-color 0.2s' }}>
              {/* Card header */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{p.nombre}</div>
                    {p.contacto_nombre && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{p.contacto_nombre}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${color}15`, color, textTransform: 'capitalize' }}>
                      {RUBRO_LABEL[p.rubro] || p.rubro}
                    </span>
                    {/* 3-dot menu */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? null : p.id); }}
                        style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: menuOpenId === p.id ? 'var(--color-bg-hover, #f1f5f9)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === p.id && (() => {
                        const menuItems = [
                          { icon: FileText, label: 'Ver comprobantes', color: '#6366f1', action: () => { setMenuOpenId(null); toggleDetail(p); } },
                          { icon: Edit2, label: 'Editar', color: '#3b82f6', action: () => { setMenuOpenId(null); openEdit(p); } },
                          { icon: Trash2, label: 'Eliminar', color: '#ef4444', action: () => { setMenuOpenId(null); handleDelete(p.id); } },
                        ];
                        return (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setMenuOpenId(null)} />
                            <div style={{
                              position: 'absolute', right: 0, top: '100%', zIndex: 100,
                              background: 'var(--color-bg-card, #fff)', borderRadius: 12,
                              border: '1px solid var(--color-border-subtle, #e2e8f0)',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 170,
                              padding: '0.3rem',
                            }}>
                              {menuItems.map((item, i) => (
                                <div key={item.label}>
                                  {i === menuItems.length - 1 && (
                                    <div style={{ height: 1, background: 'var(--color-border-subtle, #e2e8f0)', margin: '0.2rem 0.5rem' }} />
                                  )}
                                  <button onClick={item.action}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                      padding: '0.55rem 0.75rem', border: 'none', background: 'none',
                                      cursor: 'pointer', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
                                      color: item.color === '#ef4444' ? '#ef4444' : 'var(--color-text-primary)',
                                      fontFamily: 'var(--font-sans)',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = item.color === '#ef4444' ? '#fef2f2' : 'var(--color-bg-hover, #f1f5f9)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                  >
                                    <item.icon size={15} color={item.color} /> {item.label}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                  {p.telefono && (
                    <a href={`tel:${p.telefono}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-cta, #2563EB)', textDecoration: 'none' }}>
                      <Phone size={12} /> {p.telefono}
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                      <Mail size={12} /> {p.email}
                    </a>
                  )}
                </div>
                {p.notas && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4, fontStyle: 'italic' }}>{p.notas}</div>}
              </div>

              {/* Expanded detail: comprobantes */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--color-border-subtle, #e2e8f0)', padding: '12px 14px', background: 'var(--color-bg-subtle, #f8fafc)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Comprobantes
                    </span>
                    <button onClick={() => setExpandedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}>
                      <ChevronUp size={16} />
                    </button>
                  </div>

                  {loadingComp ? (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Cargando...</div>
                  ) : !p.cuit ? (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)', background: '#FEF3C7', borderRadius: 8, border: '1px solid #FDE68A' }}>
                      Este proveedor no tiene CUIT cargado. Editalo para vincular comprobantes.
                    </div>
                  ) : comprobantes.length === 0 ? (
                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Sin comprobantes para este proveedor
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {comprobantes.map(c => {
                        const monto = c.monto_ars || c.monto_original || 0;
                        const estado = ESTADO_COLORS[c.estado] || ESTADO_COLORS.pendiente;
                        const isImage = c.pdf_url && /\.(jpg|jpeg|png|webp)$/i.test(c.pdf_url);
                        return (
                          <div key={c.id} style={{
                            borderRadius: 8, background: 'var(--color-bg-card, #fff)',
                            border: '1px solid var(--color-border-subtle, #e2e8f0)', overflow: 'hidden',
                          }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 10px',
                            }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  {c.tipo_comprobante} #{c.numero_comprobante}
                                  <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: estado.bg, color: estado.text, textTransform: 'uppercase' }}>
                                    {c.estado}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                  {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                                  {c.descripcion && ` · ${c.descripcion}`}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                  ${monto.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                                </div>
                                {c.pdf_url && (
                                  <button
                                    onClick={() => setPreviewUrl(c.pdf_url)}
                                    style={{
                                      width: 28, height: 28, borderRadius: 6, border: 'none',
                                      background: '#6366f115', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                    title="Ver comprobante"
                                  >
                                    <ExternalLink size={13} color="#6366f1" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* Thumbnail preview for images */}
                            {isImage && (
                              <div
                                onClick={() => setPreviewUrl(c.pdf_url)}
                                style={{ padding: '0 10px 10px', cursor: 'pointer' }}
                              >
                                <img
                                  src={c.pdf_url!}
                                  alt="Comprobante"
                                  style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-subtle, #e2e8f0)' }}
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin proveedores</div>}
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', borderRadius: isMobile ? '20px 20px 0 0' : 'var(--radius-xl)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--color-border-subtle)' }}>
            {isMobile && <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 12px' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">Nombre / Empresa *</label><input className="form-input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Rubro</label><select className="form-input" value={form.rubro} onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))}>{RUBROS.map(r => <option key={r} value={r}>{RUBRO_LABEL[r] || r}</option>)}</select></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Contacto</label><input className="form-input" value={form.contacto_nombre || ''} onChange={e => setForm(f => ({ ...f, contacto_nombre: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Teléfono</label><input className="form-input" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                <div className="form-group" style={{ flex: 1 }}><label className="form-label">Email</label><input className="form-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">CUIT</label><input className="form-input" value={form.cuit || ''} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Dirección</label><input className="form-input" value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Notas</label><textarea className="form-input" rows={2} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={save} className="btn btn-primary" disabled={!form.nombre.trim()}>Guardar</button>
            </div>
          </div>
        </div>
      )}
      {/* Preview Modal */}
      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <button onClick={() => setPreviewUrl(null)} style={{
            position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 301,
          }}>
            <X size={20} />
          </button>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            {/\.(jpg|jpeg|png|webp)$/i.test(previewUrl) ? (
              <img src={previewUrl} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} />
            ) : (
              <iframe src={previewUrl} style={{ width: '90vw', height: '85vh', border: 'none', borderRadius: 8, background: '#fff' }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
