import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import StyledSelect from '../../shared/components/StyledSelect';
import type { ObraFicha } from './types';

interface ObraResumen {
  obra: ObraFicha;
  presupuestado: number;
  certificado: number;
  costoMateriales: number;
  costoContratistas: number;
  avance: number;
}

export default function ObrasReportes() {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [obras, setObras] = useState<ObraResumen[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('activa');

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  const loadData = async () => {
    setLoading(true);

    const { data: obrasData } = await supabase.from('obras_fichas').select('*').eq('tenant_id', tenant!.id).order('nombre');

    const resumenes: ObraResumen[] = [];

    for (const obra of (obrasData || [])) {
      // Presupuesto: última versión
      const { data: presData } = await supabase.from('obras_presupuestos').select('id').eq('obra_id', obra.id).order('version', { ascending: false }).limit(1);
      let presupuestado = 0;
      if (presData && presData.length > 0) {
        const { data: itemsData } = await supabase.from('obras_presupuesto_items').select('subtotal').eq('presupuesto_id', presData[0].id);
        presupuestado = (itemsData || []).reduce((s, i) => s + (i.subtotal || 0), 0);
      }

      // Certificado acumulado: último certificado
      const { data: certData } = await supabase.from('obras_certificados').select('id').eq('obra_id', obra.id).order('numero', { ascending: false }).limit(1);
      let certificado = 0;
      if (certData && certData.length > 0) {
        const { data: detData } = await supabase.from('obras_certificado_detalle').select('monto_acumulado').eq('certificado_id', certData[0].id);
        certificado = (detData || []).reduce((s, d) => s + (d.monto_acumulado || 0), 0);
      }

      // Materiales: pedidos recibidos
      const { data: matData } = await supabase.from('obras_materiales_pedidos').select('total').eq('obra_id', obra.id).in('estado', ['recibido', 'recibido_parcial']);
      const costoMateriales = (matData || []).reduce((s, m) => s + (m.total || 0), 0);

      // Contratistas: cartas oferta aceptadas
      const { data: cartasData } = await supabase.from('obras_cartas_oferta').select('monto_total').eq('obra_id', obra.id).eq('estado', 'aceptada');
      const costoContratistas = (cartasData || []).reduce((s, c) => s + (c.monto_total || 0), 0);

      const avance = presupuestado > 0 ? (certificado / presupuestado) * 100 : 0;

      resumenes.push({ obra, presupuestado, certificado, costoMateriales, costoContratistas, avance });
    }

    setObras(resumenes);
    setLoading(false);
  };

  const filtered = obras.filter(o => !filtroEstado || o.obra.estado === filtroEstado);
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const totalPresupuestado = filtered.reduce((s, o) => s + o.presupuestado, 0);
  const totalCertificado = filtered.reduce((s, o) => s + o.certificado, 0);
  const totalCostos = filtered.reduce((s, o) => s + o.costoMateriales + o.costoContratistas, 0);
  const totalRentabilidad = totalCertificado - totalCostos;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Reportes</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: 4 }}>Comparativo presupuesto vs costo real por obra</p>
        </div>
        <StyledSelect value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todas</option>
          <option value="activa">Activas</option>
          <option value="pausada">Pausadas</option>
          <option value="finalizada">Finalizadas</option>
        </StyledSelect>
      </div>

      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Presupuestado', value: `$ ${fmt(totalPresupuestado)}`, icon: DollarSign, color: '#3b82f6' },
          { label: 'Certificado', value: `$ ${fmt(totalCertificado)}`, icon: TrendingUp, color: '#10b981' },
          { label: 'Costos Reales', value: `$ ${fmt(totalCostos)}`, icon: TrendingDown, color: '#f59e0b' },
          { label: 'Rentabilidad', value: `$ ${fmt(totalRentabilidad)}`, icon: BarChart3, color: totalRentabilidad >= 0 ? '#10b981' : '#ef4444' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ padding: '16px 20px', borderTop: `3px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={16} style={{ color }} />
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabla comparativa */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Obra', 'Presupuesto', 'Certificado', 'Materiales', 'Contratistas', 'Costo Total', 'Rentabilidad', 'Avance'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Obra' ? 'left' : 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No hay datos</td></tr>
            ) : filtered.map(o => {
              const costoTotal = o.costoMateriales + o.costoContratistas;
              const rentabilidad = o.certificado - costoTotal;
              return (
                <tr key={o.obra.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{o.obra.nombre}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>$ {fmt(o.presupuestado)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#10b981' }}>$ {fmt(o.certificado)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>$ {fmt(o.costoMateriales)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>$ {fmt(o.costoContratistas)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>$ {fmt(costoTotal)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: rentabilidad >= 0 ? '#10b981' : '#ef4444' }}>$ {fmt(rentabilidad)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--color-bg-surface-2)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(o.avance, 100)}%`, height: '100%', borderRadius: 3, background: o.avance > 100 ? '#ef4444' : '#10b981' }} />
                      </div>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{o.avance.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
