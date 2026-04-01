import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { Plus, Search, Pencil, Trash2, X, Check, HardHat } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';

interface Obra {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'activa', label: 'Activa', color: '#10B981' },
  { value: 'pausada', label: 'Pausada', color: '#F59E0B' },
  { value: 'finalizada', label: 'Finalizada', color: '#94A3B8' },
];

export default function CentroCostos() {
  const { tenant } = useTenant();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStatus, setFormStatus] = useState('activa');
  const [saving, setSaving] = useState(false);

  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('treasury_projects')
      .select('*')
      .eq('tenant_id', tenant!.id)
      .order('name');
    setObras((data as any) || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditId(null); setFormName(''); setFormDesc(''); setFormStatus('activa');
    setShowForm(true);
  };

  const openEdit = (o: Obra) => {
    setEditId(o.id); setFormName(o.name); setFormDesc(o.description || ''); setFormStatus(o.status || 'activa');
    setShowForm(true);
  };

  const save = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    if (editId) {
      await supabase.from('treasury_projects').update({
        name: formName.trim(), description: formDesc.trim() || null, status: formStatus,
      }).eq('id', editId);
    } else {
      await supabase.from('treasury_projects').insert({
        tenant_id: tenant!.id, name: formName.trim(),
        description: formDesc.trim() || null, status: formStatus,
      });
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  };

  const remove = (o: Obra) => {
    requestDelete(`Se eliminará la obra "${o.name}". Esta acción no se puede deshacer.`, async () => {
      await supabase.from('treasury_projects').delete().eq('id', o.id);
      loadData();
    });
  };

  const filtered = obras.filter(o => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (search && !o.name.toLowerCase().includes(search.toLowerCase()) && !(o.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const countByStatus = (s: string) => obras.filter(o => o.status === s).length;

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando obras...</div>;

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
          <input type="text" placeholder="Buscar obra..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.8rem' }} />
        </div>
        <StyledSelect value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-input" style={{ height: 32, fontSize: '0.8rem', width: 'auto' }}>
          <option value="">Todas</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </StyledSelect>
        <button onClick={openNew} className="btn btn-primary" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
          <Plus size={14} /> Nueva obra
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{obras.length}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Total obras</div>
        </div>
        {STATUS_OPTIONS.map(s => (
          <div key={s.value} style={{ flex: 1, padding: '12px 10px', borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>{countByStatus(s.value)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{s.label}s</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px 80px', padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignItems: 'center' }}>
          <span>Nombre</span><span>Descripción</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
        </div>
        {filtered.map(o => {
          const st = STATUS_OPTIONS.find(s => s.value === o.status) || STATUS_OPTIONS[0];
          return (
            <div key={o.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px 80px', padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HardHat size={14} color="var(--color-text-muted)" />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{o.name}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.description || '—'}
              </div>
              <div>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${st.color}15`, color: st.color, textTransform: 'capitalize' }}>{st.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <div className="row-action-wrap">
                  <button onClick={() => openEdit(o)}
                    style={{ ...iconBtn, color: 'var(--color-text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; }}>
                    <Pencil size={13} />
                  </button>
                  <span className="row-action-tooltip">Editar</span>
                </div>
                <div className="row-action-wrap">
                  <button onClick={() => remove(o)}
                    style={{ ...iconBtn, color: '#EF4444', borderColor: '#EF444420' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#EF44440a'; e.currentTarget.style.borderColor = '#EF4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-surface)'; e.currentTarget.style.borderColor = '#EF444420'; }}>
                    <Trash2 size={14} />
                  </button>
                  <span className="row-action-tooltip">Eliminar</span>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Sin obras registradas</div>}
      </div>

      {/* ─── MODAL ─── */}
      {showForm && (
        <div className="wizard-overlay" onClick={() => setShowForm(false)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="wizard-header">
              <h3>{editId ? 'Editar obra' : 'Nueva obra'}</h3>
              <button className="wizard-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <div className="wizard-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="wizard-field">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Obra Av. Corrientes 1234" autoFocus />
              </div>
              <div className="wizard-field">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={2} value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Detalle de la obra..." />
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
                <button className="wizard-btn-back" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="wizard-btn-next" onClick={save} disabled={!formName.trim() || saving}>
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
