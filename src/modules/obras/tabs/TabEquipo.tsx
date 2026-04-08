import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { Plus, Trash2, Users, UserCheck } from 'lucide-react';
import StyledSelect from '../../../shared/components/StyledSelect';
import type { ObraRol, ObraEmpleado } from '../types';

export default function TabEquipo({ obraId }: { obraId: string }) {
  const { tenant } = useTenant();
  const [roles, setRoles] = useState<ObraRol[]>([]);
  const [empleadosAsignados, setEmpleadosAsignados] = useState<ObraEmpleado[]>([]);
  const [configRoles, setConfigRoles] = useState<{ id: string; nombre: string }[]>([]);
  const [empleados, setEmpleados] = useState<{ id: string; nombre: string; apellido: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Nuevo rol form
  const [newRol, setNewRol] = useState({ rol_id: '', persona_nombre: '', empleado_id: '', desde: '', hasta: '' });
  const [newEmp, setNewEmp] = useState({ empleado_id: '', desde: '', hasta: '' });

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);
    const [rolesRes, empAsigRes, configRes, empRes] = await Promise.all([
      supabase.from('obras_fichas_roles').select('*, config_rol:obras_config_roles(*)').eq('obra_id', obraId).eq('tenant_id', tenant!.id).order('created_at'),
      supabase.from('obras_fichas_empleados').select('*, empleado:liq_empleados(id, nombre, apellido, dni)').eq('obra_id', obraId).eq('tenant_id', tenant!.id).order('created_at'),
      supabase.from('obras_config_roles').select('id, nombre').eq('tenant_id', tenant!.id).order('orden'),
      supabase.from('liq_empleados').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('estado', 'activo').order('apellido'),
    ]);
    setRoles(rolesRes.data || []);
    setEmpleadosAsignados(empAsigRes.data || []);
    setConfigRoles(configRes.data || []);
    setEmpleados(empRes.data || []);
    setLoading(false);
  };

  const addRol = async () => {
    if (!newRol.persona_nombre.trim() && !newRol.empleado_id) return;
    await supabase.from('obras_fichas_roles').insert({
      tenant_id: tenant!.id, obra_id: obraId,
      rol_id: newRol.rol_id || null,
      persona_nombre: newRol.persona_nombre || null,
      empleado_id: newRol.empleado_id || null,
      desde: newRol.desde || null, hasta: newRol.hasta || null,
    });
    setNewRol({ rol_id: '', persona_nombre: '', empleado_id: '', desde: '', hasta: '' });
    loadData();
  };

  const removeRol = async (id: string) => {
    await supabase.from('obras_fichas_roles').delete().eq('id', id);
    setRoles(prev => prev.filter(r => r.id !== id));
  };

  const addEmpleado = async () => {
    if (!newEmp.empleado_id) return;
    await supabase.from('obras_fichas_empleados').insert({
      tenant_id: tenant!.id, obra_id: obraId,
      empleado_id: newEmp.empleado_id,
      desde: newEmp.desde || null, hasta: newEmp.hasta || null,
    });
    setNewEmp({ empleado_id: '', desde: '', hasta: '' });
    loadData();
  };

  const removeEmpleado = async (id: string) => {
    await supabase.from('obras_fichas_empleados').delete().eq('id', id);
    setEmpleadosAsignados(prev => prev.filter(e => e.id !== id));
  };

  const addConfigRol = async (nombre: string) => {
    if (!nombre.trim()) return;
    await supabase.from('obras_config_roles').insert({ tenant_id: tenant!.id, nombre, orden: configRoles.length });
    const { data } = await supabase.from('obras_config_roles').select('id, nombre').eq('tenant_id', tenant!.id).order('orden');
    setConfigRoles(data || []);
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando equipo...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Roles jerárquicos */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <UserCheck size={16} style={{ color: '#8b5cf6' }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Roles Jerárquicos</span>
        </div>

        {roles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {roles.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#8b5cf620', color: '#8b5cf6', textTransform: 'uppercase' }}>
                  {r.config_rol?.nombre || 'Sin rol'}
                </span>
                <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {r.persona_nombre || '—'}
                </span>
                {r.desde && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>desde {r.desde}</span>}
                {r.hasta && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>hasta {r.hasta}</span>}
                <button onClick={() => removeRol(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444' }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="form-label">Rol</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <StyledSelect value={newRol.rol_id} onChange={e => setNewRol(p => ({ ...p, rol_id: e.target.value }))} style={{ width: '100%' }}>
                <option value="">—</option>
                {configRoles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </StyledSelect>
            </div>
          </div>
          <div>
            <label className="form-label">Persona</label>
            <input className="form-input" value={newRol.persona_nombre} onChange={e => setNewRol(p => ({ ...p, persona_nombre: e.target.value }))} placeholder="Nombre libre" />
          </div>
          <div>
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={newRol.desde} onChange={e => setNewRol(p => ({ ...p, desde: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={newRol.hasta} onChange={e => setNewRol(p => ({ ...p, hasta: e.target.value }))} />
          </div>
          <button onClick={addRol} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> Agregar
          </button>
        </div>

        {configRoles.length === 0 && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--color-bg-surface-2)', border: '1px dashed var(--color-border)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No hay roles configurados. </span>
            <button onClick={() => {
              const nombre = prompt('Nombre del rol (ej: Director de Obra, Jefe de Obra, Sobrestante, Capataz):');
              if (nombre) addConfigRol(nombre);
            }} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Crear rol</button>
          </div>
        )}
      </div>

      {/* Empleados asignados */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Users size={16} style={{ color: '#3b82f6' }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Empleados Asignados</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>({empleadosAsignados.length})</span>
        </div>

        {empleadosAsignados.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {empleadosAsignados.map(ea => (
              <div key={ea.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)' }}>
                <Users size={14} style={{ color: '#3b82f6' }} />
                <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {ea.empleado ? `${ea.empleado.apellido}, ${ea.empleado.nombre}` : '—'}
                </span>
                {ea.desde && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>desde {ea.desde}</span>}
                {ea.hasta && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>hasta {ea.hasta}</span>}
                <button onClick={() => removeEmpleado(ea.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444' }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label className="form-label">Empleado</label>
            <StyledSelect value={newEmp.empleado_id} onChange={e => setNewEmp(p => ({ ...p, empleado_id: e.target.value }))} style={{ width: '100%' }}>
              <option value="">Seleccionar...</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={newEmp.desde} onChange={e => setNewEmp(p => ({ ...p, desde: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={newEmp.hasta} onChange={e => setNewEmp(p => ({ ...p, hasta: e.target.value }))} />
          </div>
          <button onClick={addEmpleado} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> Asignar
          </button>
        </div>
      </div>
    </div>
  );
}
