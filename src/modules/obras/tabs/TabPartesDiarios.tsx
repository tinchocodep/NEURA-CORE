import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Plus, Trash2, Calendar, X, Check } from 'lucide-react';
import StyledSelect from '../../../shared/components/StyledSelect';
import type { ParteDiario, Clima, SeTrabajo } from '../types';
import { CLIMA_LABEL, CLIMA_ICON, SE_TRABAJO_LABEL, SE_TRABAJO_COLOR } from '../types';

const EMPTY: Partial<ParteDiario> = {
  fecha: new Date().toISOString().slice(0, 10), autor: '', clima: 'soleado',
  se_trabajo: 'si', motivo_no_trabajo: '', personal_presente: null,
  tareas_realizadas: '', incidentes: '', observaciones: '',
};

export default function TabPartesDiarios({ obraId }: { obraId: string }) {
  const { tenant } = useTenant();
  const [items, setItems] = useState<ParteDiario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ParteDiario>>(EMPTY);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('obras_partes_diarios').select('*').eq('obra_id', obraId).eq('tenant_id', tenant!.id).order('fecha', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.fecha) return;
    await supabase.from('obras_partes_diarios').insert({
      tenant_id: tenant!.id, obra_id: obraId,
      fecha: form.fecha, autor: form.autor || null,
      clima: form.clima || null, se_trabajo: form.se_trabajo || 'si',
      motivo_no_trabajo: form.motivo_no_trabajo || null,
      personal_presente: form.personal_presente || null,
      tareas_realizadas: form.tareas_realizadas || null,
      incidentes: form.incidentes || null,
      observaciones: form.observaciones || null,
    });
    setShowForm(false);
    setForm(EMPTY);
    loadData();
  };

  const removeParte = async (id: string) => {
    await supabase.from('obras_partes_diarios').delete().eq('id', id);
    setItems(prev => prev.filter(p => p.id !== id));
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando partes diarios...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={16} style={{ color: '#8b5cf6' }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Partes Diarios</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>({items.length})</span>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>
          <Plus size={14} /> Nuevo Parte
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ padding: 16, borderRadius: 12, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Nuevo Parte</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Fecha *</label>
              <input className="form-input" type="date" value={form.fecha || ''} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Autor</label>
              <input className="form-input" value={form.autor || ''} onChange={e => setForm(p => ({ ...p, autor: e.target.value }))} placeholder="Quién carga" />
            </div>
            <div>
              <label className="form-label">Clima</label>
              <StyledSelect value={form.clima || ''} onChange={e => setForm(p => ({ ...p, clima: e.target.value as Clima }))} style={{ width: '100%' }}>
                {(Object.keys(CLIMA_LABEL) as Clima[]).map(c => <option key={c} value={c}>{CLIMA_ICON[c]} {CLIMA_LABEL[c]}</option>)}
              </StyledSelect>
            </div>
            <div>
              <label className="form-label">¿Se trabajó?</label>
              <StyledSelect value={form.se_trabajo || 'si'} onChange={e => setForm(p => ({ ...p, se_trabajo: e.target.value as SeTrabajo }))} style={{ width: '100%' }}>
                {(Object.keys(SE_TRABAJO_LABEL) as SeTrabajo[]).map(s => <option key={s} value={s}>{SE_TRABAJO_LABEL[s]}</option>)}
              </StyledSelect>
            </div>
          </div>
          {form.se_trabajo !== 'si' && (
            <div>
              <label className="form-label">Motivo</label>
              <input className="form-input" value={form.motivo_no_trabajo || ''} onChange={e => setForm(p => ({ ...p, motivo_no_trabajo: e.target.value }))} placeholder="Lluvia, paro, falta de materiales..." />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 10 }}>
            <div>
              <label className="form-label">Personal presente</label>
              <input className="form-input" type="number" value={form.personal_presente ?? ''} onChange={e => setForm(p => ({ ...p, personal_presente: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div>
              <label className="form-label">Tareas realizadas</label>
              <input className="form-input" value={form.tareas_realizadas || ''} onChange={e => setForm(p => ({ ...p, tareas_realizadas: e.target.value }))} placeholder="Descripción de las tareas del día" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Incidentes</label>
              <input className="form-input" value={form.incidentes || ''} onChange={e => setForm(p => ({ ...p, incidentes: e.target.value }))} placeholder="Accidentes, problemas..." />
            </div>
            <div>
              <label className="form-label">Observaciones</label>
              <input className="form-input" value={form.observaciones || ''} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' }}>
              <Check size={14} /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>No hay partes diarios registrados</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(p => {
            const trabajoColor = SE_TRABAJO_COLOR[p.se_trabajo];
            return (
              <div key={p.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{p.fecha}</span>
                  {p.clima && <span style={{ fontSize: '1rem', marginTop: 2 }}>{CLIMA_ICON[p.clima]}</span>}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${trabajoColor}18`, color: trabajoColor }}>
                      {SE_TRABAJO_LABEL[p.se_trabajo]}
                    </span>
                    {p.personal_presente !== null && (
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{p.personal_presente} personas</span>
                    )}
                    {p.autor && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>por {p.autor}</span>}
                  </div>
                  {p.se_trabajo !== 'si' && p.motivo_no_trabajo && (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic' }}>Motivo: {p.motivo_no_trabajo}</span>
                  )}
                  {p.tareas_realizadas && <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{p.tareas_realizadas}</span>}
                  {p.incidentes && <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Incidentes: {p.incidentes}</span>}
                  {p.observaciones && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{p.observaciones}</span>}
                </div>
                <button onClick={() => removeParte(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, alignSelf: 'flex-start' }}><Trash2 size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
