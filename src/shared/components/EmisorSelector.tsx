import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2 } from 'lucide-react';
import CustomSelect from './CustomSelect';
import type { FacturacionEmisorLite } from '../hooks/useFacturacionEmisores';

interface Props {
    emisores: FacturacionEmisorLite[];
    selectedId: string;
    onChange: (id: string) => void;
    loading?: boolean;
    variant?: 'inline' | 'card';
}

export default function EmisorSelector({ emisores, selectedId, onChange, loading, variant = 'inline' }: Props) {
    const navigate = useNavigate();

    if (loading) {
        return (
            <div style={{ padding: '10px 14px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Cargando emisores...
            </div>
        );
    }

    if (emisores.length === 0) {
        return (
            <div style={{
                padding: '10px 14px',
                background: '#F59E0B15',
                border: '1px solid #F59E0B40',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8rem',
            }}>
                <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#F59E0B' }}>Sin emisor configurado</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Cargá una razón social en Configuración → Facturación para poder emitir.
                    </div>
                </div>
                <button
                    className="btn btn-sm"
                    onClick={() => navigate('/configuracion?tab=facturacion')}
                    style={{ fontSize: '0.7rem' }}
                >
                    Configurar
                </button>
            </div>
        );
    }

    const selected = emisores.find(e => e.id === selectedId);

    // Una sola razón social: mostrar info sin dropdown
    if (emisores.length === 1 && selected) {
        return (
            <div style={{
                padding: '10px 14px',
                background: 'var(--color-bg-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}>
                <Building2 size={16} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selected.alias || selected.razon_social}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        CUIT: {selected.cuit} · Pto. Venta: {String(selected.punto_venta).padStart(5, '0')}
                    </div>
                </div>
            </div>
        );
    }

    // 2+ razones sociales: dropdown en 2 líneas con buscador
    const wrapStyle: React.CSSProperties = variant === 'card'
        ? { padding: '10px 14px', background: 'var(--color-bg-surface-2)', border: '1px solid var(--color-border-subtle)', borderRadius: 8 }
        : {};

    return (
        <div style={wrapStyle}>
            <CustomSelect
                value={selectedId}
                onChange={onChange}
                placeholder="Seleccionar razón social..."
                searchable={emisores.length > 4}
                options={emisores.map(em => ({
                    value: em.id,
                    label: `${em.alias || em.razon_social}${em.is_default ? ' · default' : ''}`,
                    sub: `CUIT ${em.cuit} · PV ${String(em.punto_venta).padStart(5, '0')}`,
                }))}
            />
        </div>
    );
}
