import { useEffect, useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import {
    X, FileText, Eye, ChevronDown, DollarSign,
    TrendingUp, Calendar, Phone, Mail, MapPin, Hash, Building2,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────── */

interface ComprobanteResumen {
    id: string;
    fecha: string;
    tipo_comprobante: string;
    numero_comprobante: string;
    monto_ars: number;
    monto_original: number;
    estado: string;
    descripcion: string | null;
    pdf_url: string | null;
    source: string | null;
    created_at: string;
}

interface EntityInfo {
    id: string;
    razon_social: string;
    cuit: string | null;
    condicion_fiscal?: string | null;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    segmento?: string | null;
    observaciones?: string | null;
}

interface Entity360PanelProps {
    entity: EntityInfo;
    entityType: 'proveedor' | 'cliente';
    onClose: () => void;
    onPdfPreview?: (url: string) => void;
}

/* ─── Helpers ────────────────────────────────────────── */

function formatTimeAgo(dateStr: string | null): { text: string; color: string } {
    if (!dateStr) return { text: 'Sin actividad', color: 'var(--color-danger)' };
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 7) return { text: `Hace ${diff}d`, color: 'var(--color-success)' };
    if (diff <= 30) return { text: `Hace ${Math.floor(diff / 7)}sem`, color: 'var(--color-success)' };
    if (diff <= 90) return { text: `Hace ${Math.floor(diff / 30)}m`, color: 'var(--color-warning)' };
    return { text: `Hace ${Math.floor(diff / 30)}m`, color: 'var(--color-danger)' };
}

const estadoBadge = (estado: string) => {
    const map: Record<string, { bg: string; color: string }> = {
        pendiente: { bg: 'var(--color-warning-dim)', color: 'var(--color-warning)' },
        clasificado: { bg: 'var(--color-info-dim)', color: 'var(--color-info)' },
        aprobado: { bg: 'var(--color-success-dim)', color: 'var(--color-success)' },
        rechazado: { bg: 'var(--color-danger-dim)', color: 'var(--color-danger)' },
        inyectado: { bg: 'var(--color-accent-dim)', color: 'var(--color-accent)' },
    };
    const st = map[estado] || { bg: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)' };
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 99, fontSize: '0.6875rem',
            fontWeight: 600, background: st.bg, color: st.color,
        }}>{estado}</span>
    );
};

/* ─── Component ─────────────────────────────────────── */

export default function Entity360Panel({ entity, entityType, onClose, onPdfPreview }: Entity360PanelProps) {
    const { tenant } = useTenant();
    const [comprobantes, setComprobantes] = useState<ComprobanteResumen[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        loadComprobantes();

        if (!tenant?.id || !entity?.id) return;

        const columnId = entityType === 'proveedor' ? 'proveedor_id' : 'cliente_id';
        const channel = supabase.channel(`entity360-${entity.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contable_comprobantes',
                    filter: `tenant_id=eq.${tenant.id}`
                },
                (payload) => {
                    // Only reload if the changed row belongs to this entity
                    const record = (payload.new || payload.old) as any;
                    if (record && record[columnId] === entity.id) {
                        loadComprobantes();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [entity.id, tenant?.id]);

    async function loadComprobantes() {
        setLoading(true);
        const columnId = entityType === 'proveedor' ? 'proveedor_id' : 'cliente_id';
        const { data } = await supabase
            .from('contable_comprobantes')
            .select('id, fecha, tipo_comprobante, numero_comprobante, monto_ars, monto_original, estado, descripcion, pdf_url, source, created_at')
            .eq(columnId, entity.id)
            .eq('tenant_id', tenant!.id)
            .order('fecha', { ascending: false })
            .limit(30);
        setComprobantes((data || []) as ComprobanteResumen[]);
        setLoading(false);
    }

    // Computed stats
    const totalComprobantes = comprobantes.length;
    const montoTotal = comprobantes.reduce((sum, c) => sum + Number(c.monto_ars || c.monto_original || 0), 0);
    const lastDate = comprobantes.length > 0 ? comprobantes[0].fecha : null;
    const activity = formatTimeAgo(lastDate);

    // Group by estado
    const byEstado: Record<string, number> = {};
    comprobantes.forEach(c => { byEstado[c.estado] = (byEstado[c.estado] || 0) + 1; });

    const hasContactInfo = entity.telefono || entity.email || entity.direccion;
    const entityLabel = entityType === 'proveedor' ? 'Proveedor' : 'Cliente';

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)',
            display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
        }} onClick={onClose}>
            <div style={{
                width: 520, maxWidth: '92vw', height: '100vh',
                background: 'var(--color-bg-surface)', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
                overflowY: 'auto', display: 'flex', flexDirection: 'column',
                animation: 'slideIn 0.2s ease-out',
            }} onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div style={{
                    padding: '1.5rem', borderBottom: '1px solid var(--color-border-subtle)',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    background: 'var(--color-bg-surface)',
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                                fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.08em', color: 'var(--color-accent)',
                                padding: '2px 8px', borderRadius: 99,
                                background: 'var(--color-accent-dim)', border: '1px solid var(--color-accent-border)',
                            }}>{entityLabel} 360°</span>
                            {entity.segmento && (
                                <span style={{
                                    fontSize: '0.625rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                                    background: entity.segmento === 'corp' ? 'var(--color-info-dim)' : 'rgba(168, 85, 247, 0.1)',
                                    color: entity.segmento === 'corp' ? 'var(--color-info)' : '#a855f7',
                                }}>{entity.segmento === 'corp' ? 'Corporativo' : 'PyME'}</span>
                            )}
                        </div>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.3 }}>
                            {entity.razon_social}
                        </h2>
                        {entity.cuit && (
                            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontFamily: 'var(--font-mono)' }}>
                                <Hash size={11} style={{ display: 'inline', marginRight: 2 }} />
                                {entity.cuit}
                            </p>
                        )}
                        {entity.condicion_fiscal && (
                            <span style={{
                                display: 'inline-block', marginTop: 6, fontSize: '0.6875rem', fontWeight: 600,
                                padding: '2px 8px', borderRadius: 99,
                                background: 'var(--color-bg-surface-2)', color: 'var(--color-text-secondary)',
                            }}>{entity.condicion_fiscal}</span>
                        )}
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-icon" style={{ flexShrink: 0 }}>
                        <X size={16} />
                    </button>
                </div>

                {/* ── Stats Cards ── */}
                <div style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem' }}>
                        <div style={{
                            padding: '0.75rem', borderRadius: 'var(--radius-lg)',
                            background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-info)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <FileText size={11} /> Comprobantes
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {totalComprobantes}
                            </div>
                        </div>
                        <div style={{
                            padding: '0.75rem', borderRadius: 'var(--radius-lg)',
                            background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-success)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <DollarSign size={11} /> Total ARS
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                                ${montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                            </div>
                        </div>
                        <div style={{
                            padding: '0.75rem', borderRadius: 'var(--radius-lg)',
                            background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 600, color: activity.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <TrendingUp size={11} /> Actividad
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: activity.color }}>
                                {activity.text}
                            </div>
                        </div>
                    </div>

                    {/* Estado breakdown */}
                    {Object.keys(byEstado).length > 0 && (
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                            {Object.entries(byEstado).map(([estado, count]) => (
                                <span key={estado} style={{
                                    fontSize: '0.6875rem', fontWeight: 600,
                                    padding: '2px 8px', borderRadius: 99,
                                    background: 'var(--color-bg-surface-2)', color: 'var(--color-text-secondary)',
                                    border: '1px solid var(--color-border-subtle)',
                                }}>
                                    {estado}: {count}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Contact Info ── */}
                {hasContactInfo && (
                    <div style={{
                        margin: '0 1.5rem', padding: '0.875rem',
                        borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-subtle)',
                        background: 'var(--color-bg-surface-2)',
                    }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Contacto
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                            {entity.telefono && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Phone size={12} color="var(--color-text-muted)" /> {entity.telefono}
                                </div>
                            )}
                            {entity.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Mail size={12} color="var(--color-text-muted)" />
                                    <a href={`mailto:${entity.email}`} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{entity.email}</a>
                                </div>
                            )}
                            {entity.direccion && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <MapPin size={12} color="var(--color-text-muted)" /> {entity.direccion}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Observaciones ── */}
                {entity.observaciones && (
                    <div style={{
                        margin: '0.75rem 1.5rem 0', padding: '0.75rem',
                        borderRadius: 'var(--radius-md)', background: 'var(--color-warning-dim)',
                        border: '1px solid var(--color-warning)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)',
                    }}>
                        <strong style={{ fontSize: '0.6875rem', color: 'var(--color-warning)' }}>Observaciones:</strong>
                        <div style={{ marginTop: 2 }}>{entity.observaciones}</div>
                    </div>
                )}

                {/* ── Comprobantes List ── */}
                <div style={{ padding: '1rem 1.5rem', flex: 1 }}>
                    <div style={{
                        fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)',
                        marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <FileText size={12} /> Historial de Comprobantes
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
                                    <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div className="skeleton skeleton-text" style={{ width: '70%' }} />
                                        <div className="skeleton skeleton-text" style={{ width: '40%', height: 9 }} />
                                    </div>
                                    <div className="skeleton skeleton-text" style={{ width: 80 }} />
                                </div>
                            ))}
                        </div>
                    ) : comprobantes.length === 0 ? (
                        <div style={{
                            padding: '2.5rem 1rem', textAlign: 'center', borderRadius: 'var(--radius-lg)',
                            border: '1px dashed var(--color-border-subtle)', color: 'var(--color-text-muted)',
                        }}>
                            <Building2 size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                            <div style={{ fontSize: '0.8125rem' }}>Sin comprobantes registrados</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {comprobantes.map(c => {
                                const isExpanded = expandedId === c.id;
                                return (
                                    <div key={c.id} style={{
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--color-border-subtle)', overflow: 'hidden',
                                    }}>
                                        <div
                                            onClick={() => setExpandedId(isExpanded ? null : c.id)}
                                            style={{
                                                padding: '0.75rem', background: isExpanded ? 'var(--color-accent-dim)' : 'var(--color-bg-surface)',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                cursor: 'pointer', transition: 'background 0.12s',
                                            }}
                                        >
                                            {/* Icon */}
                                            <div style={{
                                                width: 34, height: 34, borderRadius: 'var(--radius-md)',
                                                background: c.estado === 'inyectado' ? 'var(--color-success-dim)'
                                                    : c.estado === 'aprobado' ? 'var(--color-info-dim)'
                                                        : 'var(--color-bg-surface-2)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            }}>
                                                <FileText size={15} color={
                                                    c.estado === 'inyectado' ? 'var(--color-success)'
                                                        : c.estado === 'aprobado' ? 'var(--color-info)'
                                                            : 'var(--color-text-muted)'
                                                } />
                                            </div>

                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                    {c.tipo_comprobante || 'Comprobante'}{c.numero_comprobante && ` #${c.numero_comprobante}`}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                    <Calendar size={10} />
                                                    {new Date(c.fecha).toLocaleDateString('es-AR')}
                                                    <span style={{ margin: '0 2px' }}>·</span>
                                                    {estadoBadge(c.estado)}
                                                </div>
                                            </div>

                                            {/* Amount */}
                                            <div style={{
                                                fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)',
                                                fontFamily: 'var(--font-mono)', flexShrink: 0,
                                            }}>
                                                ${Number(c.monto_ars || c.monto_original || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                            </div>

                                            {/* PDF */}
                                            {c.pdf_url && onPdfPreview && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); onPdfPreview(c.pdf_url!.trim()); }}
                                                    className="btn btn-ghost btn-icon"
                                                    title="Ver PDF"
                                                    style={{ flexShrink: 0 }}
                                                >
                                                    <Eye size={14} color="var(--color-accent)" />
                                                </button>
                                            )}

                                            <ChevronDown size={14} color="var(--color-text-muted)" style={{
                                                transform: isExpanded ? 'rotate(180deg)' : 'none',
                                                transition: 'transform 0.2s', flexShrink: 0,
                                            }} />
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div style={{
                                                padding: '0.75rem 1rem', background: 'var(--color-bg-surface-2)',
                                                borderTop: '1px solid var(--color-border-subtle)',
                                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem',
                                                fontSize: '0.78rem',
                                            }}>
                                                {c.descripcion && (
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Descripción</span>
                                                        <div style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>{c.descripcion}</div>
                                                    </div>
                                                )}
                                                {c.source && (
                                                    <div>
                                                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Origen</span>
                                                        <div style={{ marginTop: 2 }}>
                                                            <span className="badge badge-muted">{c.source}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div>
                                                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Fecha Carga</span>
                                                    <div style={{ color: 'var(--color-text-primary)', marginTop: 2 }}>
                                                        {new Date(c.created_at).toLocaleString('es-AR')}
                                                    </div>
                                                </div>
                                                {c.monto_original !== c.monto_ars && c.monto_original > 0 && (
                                                    <div>
                                                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Monto Original</span>
                                                        <div style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                                            ${Number(c.monto_original).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
