import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useConfirmDelete } from '../../shared/components/ConfirmDelete';
import { ClipboardList, Plus, ChevronDown, ChevronRight, Trash2, ExternalLink } from 'lucide-react';
import type { F931, F931Detalle } from './types';

export default function ObrasF931() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<F931[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<F931Detalle[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [periodo, setPeriodo] = useState('');
  const [notas, setNotas] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Manual entry rows
  const [manualRows, setManualRows] = useState<Partial<F931Detalle>[]>([{ empleado_nombre: '', empleado_cuil: '', remuneracion_imponible: 0, aportes_personales: 0, contribuciones_patronales: 0, obra_social: 0, sindicato: 0 }]);
  const { requestDelete, ConfirmModal } = useConfirmDelete();

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('obras_f931').select('*').eq('tenant_id', tenant!.id).order('periodo', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    const { data } = await supabase.from('obras_f931_detalle').select('*').eq('f931_id', id).order('empleado_nombre');
    setDetalle(data || []);
    setExpanded(id);
  };

  const handleSave = async () => {
    if (!periodo.trim()) return;
    setUploading(true);

    let archivoUrl: string | null = null;
    if (archivo) {
      const path = `f931/${tenant!.id}/${Date.now()}_${archivo.name}`;
      const { error } = await supabase.storage.from('documentos').upload(path, archivo);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(path);
        archivoUrl = publicUrl;
      }
    }

    const { data: f931 } = await supabase.from('obras_f931').insert({
      tenant_id: tenant!.id, periodo, archivo_url: archivoUrl, notas: notas || null,
    }).select().single();

    if (f931) {
      const validRows = manualRows.filter(r => r.empleado_nombre?.trim() || r.empleado_cuil?.trim());
      if (validRows.length > 0) {
        await supabase.from('obras_f931_detalle').insert(
          validRows.map(r => ({
            tenant_id: tenant!.id, f931_id: f931.id,
            empleado_nombre: r.empleado_nombre || null, empleado_cuil: r.empleado_cuil || null,
            remuneracion_imponible: r.remuneracion_imponible || 0, aportes_personales: r.aportes_personales || 0,
            contribuciones_patronales: r.contribuciones_patronales || 0, obra_social: r.obra_social || 0, sindicato: r.sindicato || 0,
          }))
        );
      }
    }

    setShowModal(false);
    setPeriodo('');
    setNotas('');
    setArchivo(null);
    setManualRows([{ empleado_nombre: '', empleado_cuil: '', remuneracion_imponible: 0, aportes_personales: 0, contribuciones_patronales: 0, obra_social: 0, sindicato: 0 }]);
    setUploading(false);
    loadData();
  };

  const handleDelete = (f: F931) => {
    requestDelete(`¿Eliminar F931 período ${f.periodo}?`, async () => {
      await supabase.from('obras_f931_detalle').delete().eq('f931_id', f.id);
      await supabase.from('obras_f931').delete().eq('id', f.id);
      setItems(prev => prev.filter(e => e.id !== f.id));
      if (expanded === f.id) setExpanded(null);
    });
  };

  const updateRow = (idx: number, field: string, value: any) => {
    setManualRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>F931 — DDJJ AFIP</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Carga y visualización de formularios 931</p>
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8125rem' }}>
          <Plus size={16} /> Cargar F931
        </button>
      </div>

      {/* Lista de períodos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>No hay F931 cargados</div>
        ) : items.map(f => (
          <div key={f.id} className="card" style={{ overflow: 'hidden' }}>
            <div onClick={() => toggleExpand(f.id)}
              style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              {expanded === f.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <ClipboardList size={16} style={{ color: '#0ea5e9' }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Período {f.periodo}</span>
                {f.notas && <span style={{ marginLeft: 12, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{f.notas}</span>}
              </div>
              {f.archivo_url && (
                <a href={f.archivo_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--color-accent)', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Archivo
                </a>
              )}
              <button onClick={e => { e.stopPropagation(); handleDelete(f); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}><Trash2 size={14} /></button>
            </div>

            {expanded === f.id && (
              <div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                {detalle.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin detalle cargado</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {['Empleado', 'CUIL', 'Rem. Imponible', 'Aportes', 'Contribuciones', 'Obra Social', 'Sindicato'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Empleado' || h === 'CUIL' ? 'left' : 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{d.empleado_nombre || '—'}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{d.empleado_cuil || '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>$ {fmt(d.remuneracion_imponible)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>$ {fmt(d.aportes_personales)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>$ {fmt(d.contribuciones_patronales)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>$ {fmt(d.obra_social)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>$ {fmt(d.sindicato)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal carga */}
      {showModal && (
        <div className="wizard-overlay" onClick={() => setShowModal(false)}>
          <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="wizard-header">
              <h3>Cargar F931</h3>
              <button className="wizard-close" onClick={() => setShowModal(false)}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>&times;</span>
              </button>
            </div>

            <div className="wizard-body">
              <div className="wizard-row">
                <div className="wizard-field">
                  <label className="form-label">Período (YYYY-MM) *</label>
                  <input className="form-input" value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="2026-03" />
                </div>
                <div className="wizard-field">
                  <label className="form-label">Archivo (Excel/PDF)</label>
                  <input type="file" accept=".xlsx,.xls,.pdf,.csv" onChange={e => setArchivo(e.target.files?.[0] || null)}
                    style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} />
                </div>
              </div>
              <div className="wizard-field">
                <label className="form-label">Notas</label>
                <input className="form-input" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones" />
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="wizard-section-title">Detalle por empleado (carga manual)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, overflowX: 'auto' }}>
                  {manualRows.map((r, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 32px', gap: 6, alignItems: 'end', minWidth: 700 }}>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Nombre</label>}
                        <input className="form-input" value={r.empleado_nombre || ''} onChange={e => updateRow(idx, 'empleado_nombre', e.target.value)} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">CUIL</label>}
                        <input className="form-input" value={r.empleado_cuil || ''} onChange={e => updateRow(idx, 'empleado_cuil', e.target.value)} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Rem.</label>}
                        <input className="form-input" type="number" value={r.remuneracion_imponible || ''} onChange={e => updateRow(idx, 'remuneracion_imponible', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Aportes</label>}
                        <input className="form-input" type="number" value={r.aportes_personales || ''} onChange={e => updateRow(idx, 'aportes_personales', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Contrib.</label>}
                        <input className="form-input" type="number" value={r.contribuciones_patronales || ''} onChange={e => updateRow(idx, 'contribuciones_patronales', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">O.S.</label>}
                        <input className="form-input" type="number" value={r.obra_social || ''} onChange={e => updateRow(idx, 'obra_social', Number(e.target.value))} />
                      </div>
                      <div className="wizard-field" style={{ marginBottom: 0 }}>
                        {idx === 0 && <label className="form-label">Sind.</label>}
                        <input className="form-input" type="number" value={r.sindicato || ''} onChange={e => updateRow(idx, 'sindicato', Number(e.target.value))} />
                      </div>
                      <button onClick={() => setManualRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, marginBottom: 2 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setManualRows(prev => [...prev, { empleado_nombre: '', empleado_cuil: '', remuneracion_imponible: 0, aportes_personales: 0, contribuciones_patronales: 0, obra_social: 0, sindicato: 0 }])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--color-border)', background: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 600, marginTop: 8 }}>
                  <Plus size={14} /> Agregar empleado
                </button>
              </div>
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left" />
              <div className="wizard-footer-right">
                <button className="wizard-btn-back" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="wizard-btn-next" onClick={handleSave} disabled={!periodo.trim() || uploading}>
                  {uploading ? 'Guardando...' : 'Guardar'}
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
