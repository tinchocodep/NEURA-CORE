import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal, FileText, CreditCard, Check, XCircle, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import StyledSelect from '../../../shared/components/StyledSelect';

interface ComprobanteMin {
  id: string; tipo: 'compra' | 'venta'; fecha: string; numero_comprobante: string;
  tipo_comprobante: string; monto_ars: number; monto_original: number; moneda: string; estado: string;
  pdf_url: string | null; descripcion: string | null;
  proveedor: { razon_social: string } | null;
  cliente: { razon_social: string } | null;
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#F59E0B', clasificado: '#3B82F6', aprobado: '#3B82F6',
  pagado: '#10B981', error: '#EF4444', rechazado: '#EF4444', vencido: '#EF4444',
};

export default function ComprobantesMobile() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<ComprobanteMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [opModal, setOpModal] = useState<ComprobanteMin | null>(null);
  const [generandoOp, setGenerandoOp] = useState(false);

  useEffect(() => { if (tenant) loadData(); }, [tenant]);

  // Realtime: reload when comprobantes change (e.g. after n8n OCR creates one)
  useEffect(() => {
    if (!tenant) return;
    const channel = supabase.channel('comprobantes-mobile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contable_comprobantes', filter: `tenant_id=eq.${tenant.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contable_comprobantes')
      .select('id, tipo, fecha, numero_comprobante, tipo_comprobante, monto_ars, monto_original, moneda, estado, pdf_url, descripcion, proveedor:contable_proveedores(razon_social), cliente:contable_clientes(razon_social)')
      .eq('tenant_id', tenant!.id)
      .order('fecha', { ascending: false })
      .limit(100);
    if (data) setItems(data as any);
    setLoading(false);
  };

  const getMonto = (c: ComprobanteMin) => Math.abs(c.monto_ars) || Math.abs(c.monto_original) || 0;

  const filtered = items.filter(c => {
    if (filterEstado && c.estado !== filterEstado) return false;
    if (filterTipo && c.tipo !== filterTipo) return false;
    if (search) {
      const entity = (c.tipo === 'compra' ? c.proveedor?.razon_social : c.cliente?.razon_social) || '';
      const num = c.numero_comprobante || '';
      if (!entity.toLowerCase().includes(search.toLowerCase()) && !num.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const getEntity = (c: ComprobanteMin) => c.tipo === 'compra' ? c.proveedor?.razon_social || '—' : c.cliente?.razon_social || '—';

  const updateEstado = async (id: string, estado: string) => {
    setUpdatingId(id);
    const { error } = await supabase.from('contable_comprobantes').update({ estado }).eq('id', id);
    if (!error) setItems(prev => prev.map(c => c.id === id ? { ...c, estado } : c));
    setUpdatingId(null);
  };

  const generarOP = async (comp: ComprobanteMin) => {
    if (!tenant) return;
    setGenerandoOp(true);
    try {
      // Get next OP number
      const { data: lastOp } = await supabase.from('tesoreria_ordenes_pago')
        .select('numero_op').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(1);
      const lastNum = lastOp?.[0]?.numero_op ? parseInt(lastOp[0].numero_op.replace(/\D/g, '')) : 0;
      const nOp = `OP-${String(lastNum + 1).padStart(5, '0')}`;

      const monto = getMonto(comp);
      const proveedorId = (comp as any).proveedor_id || null;

      // Create OP
      const { data: op, error } = await supabase.from('tesoreria_ordenes_pago').insert({
        tenant_id: tenant.id,
        numero_op: nOp,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'aprobada',
        monto_bruto: monto,
        monto_retenciones: 0,
        monto_neto: monto,
        proveedor_id: proveedorId,
      }).select('id').single();

      if (error) throw error;

      // Link comprobante to OP and mark as pagado
      if (op) {
        await supabase.from('contable_comprobantes')
          .update({ estado: 'pagado' })
          .eq('id', comp.id);
        setItems(prev => prev.map(c => c.id === comp.id ? { ...c, estado: 'pagado' } : c));
      }

      setOpModal(null);
      alert(`Orden de Pago ${nOp} generada por $${monto.toLocaleString('es-AR')}`);
    } catch (err) {
      console.error('Error generando OP:', err);
      alert('Error al generar la orden de pago');
    } finally {
      setGenerandoOp(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Cargando comprobantes...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ paddingLeft: 34, height: 42, fontSize: '0.9rem', borderRadius: 10 }} />
        </div>
        <button onClick={() => setShowFilters(f => !f)}
          style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: showFilters ? 'var(--color-accent)' : 'var(--color-bg-card)', color: showFilters ? '#fff' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <SlidersHorizontal size={18} />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', animation: 'fadeIn 0.15s ease' }}>
          <StyledSelect value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="form-input" style={{ height: 36, fontSize: '0.8rem', width: 'auto', borderRadius: 8 }}>
            <option value="">Todos los estados</option>
            {['pendiente', 'clasificado', 'aprobado', 'inyectado', 'pagado', 'error', 'rechazado'].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </StyledSelect>
          <StyledSelect value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="form-input" style={{ height: 36, fontSize: '0.8rem', width: 'auto', borderRadius: 8 }}>
            <option value="">Compras y ventas</option>
            <option value="compra">Compras</option>
            <option value="venta">Ventas</option>
          </StyledSelect>
          {(filterEstado || filterTipo) && (
            <button onClick={() => { setFilterEstado(''); setFilterTipo(''); }} style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-card)', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Count */}
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '2px 0' }}>
        {filtered.length} comprobante{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* List — expandable cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(c => {
          const isExpanded = expandedId === c.id;
          const monto = getMonto(c);
          return (
            <div key={c.id} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Compact row — always visible */}
              <div onClick={() => setExpandedId(isExpanded ? null : c.id)}
                style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.tipo === 'venta' ? '#10B981' : '#EF4444', flexShrink: 0, marginRight: 10 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getEntity(c)}
                    </span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${ESTADO_COLOR[c.estado] || '#6B7280'}15`, color: ESTADO_COLOR[c.estado] || '#6B7280', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase' }}>
                      {c.estado}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.tipo_comprobante || c.tipo} {c.numero_comprobante ? `#${c.numero_comprobante}` : ''} · {new Date(c.fecha).toLocaleDateString('es-AR')}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, color: c.tipo === 'venta' ? '#10B981' : 'var(--color-text-primary)', marginRight: 4 }}>
                  ${monto.toLocaleString('es-AR')}
                </div>
                <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--color-border-subtle)', animation: 'fadeIn 0.15s ease' }}>
                  {/* Details */}
                  <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                    {c.descripcion && (
                      <div style={{ color: 'var(--color-text-muted)' }}>{c.descripcion}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Tipo</span>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{c.tipo}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Monto</span>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>${monto.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Fecha</span>
                      <span>{new Date(c.fecha).toLocaleDateString('es-AR')}</span>
                    </div>
                    {c.numero_comprobante && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Número</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{c.numero_comprobante}</span>
                      </div>
                    )}
                  </div>

                  {/* Preview factura */}
                  {c.pdf_url && (
                    <a href={c.pdf_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginBottom: 10, textDecoration: 'none' }}>
                      {/\.(jpg|jpeg|png|gif|webp)$/i.test(c.pdf_url) ? (
                        <img src={c.pdf_url} alt="Factura" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', fontSize: '0.8rem', color: 'var(--color-cta, #2563EB)', fontWeight: 500 }}>
                          <FileText size={16} /> Ver factura
                        </div>
                      )}
                    </a>
                  )}

                  {/* Action buttons based on estado */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(c.estado === 'pendiente' || c.estado === 'clasificado') && (
                      <>
                        <button onClick={() => updateEstado(c.id, 'aprobado')} disabled={updatingId === c.id}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: '1px solid #10B981', background: '#10B98110', color: '#10B981', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                          <Check size={16} /> Aprobar
                        </button>
                        <button onClick={() => updateEstado(c.id, 'rechazado')} disabled={updatingId === c.id}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: '1px solid #EF4444', background: '#EF444410', color: '#EF4444', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                          <XCircle size={16} /> Rechazar
                        </button>
                      </>
                    )}
                    {c.estado === 'aprobado' && (
                      <button onClick={() => setOpModal(c)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--color-cta, #2563EB)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                        <CreditCard size={16} /> Generar Orden de Pago
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border-subtle)' }}>Sin comprobantes</div>
        )}
      </div>

      {/* Modal: Generar Orden de Pago */}
      {opModal && (
        <div onClick={() => !generandoOp && setOpModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--color-bg-card)', borderRadius: '16px 16px 0 0', padding: '20px', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Generar Orden de Pago</h3>

            {/* Comprobante details */}
            <div style={{ background: 'var(--color-bg-surface)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Proveedor</span>
                <span style={{ fontWeight: 600 }}>{getEntity(opModal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Comprobante</span>
                <span>{opModal.tipo_comprobante} {opModal.numero_comprobante ? `#${opModal.numero_comprobante}` : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Fecha</span>
                <span>{new Date(opModal.fecha).toLocaleDateString('es-AR')}</span>
              </div>
              {opModal.descripcion && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Concepto</span>
                  <span>{opModal.descripcion}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Monto a pagar</span>
                <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>${getMonto(opModal).toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setOpModal(null)} disabled={generandoOp}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                Cancelar
              </button>
              <button onClick={() => generarOP(opModal)} disabled={generandoOp}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--color-cta, #2563EB)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-sans)', opacity: generandoOp ? 0.6 : 1 }}>
                {generandoOp ? 'Generando...' : 'Confirmar OP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
