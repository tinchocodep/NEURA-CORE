import { useNavigate } from 'react-router-dom';
import { FileText, Upload, Building2, Zap, FileSignature, Wrench, Wallet, CreditCard, DollarSign, CalendarClock, UserPlus, Users } from 'lucide-react';

export default function AccionesRapidasWidget() {
    const navigate = useNavigate();

    const sections = [
        {
            title: 'Operaciones',
            actions: [
                { label: 'Nueva propiedad', icon: Building2, path: '/inmobiliaria/propiedades?action=crear', color: '#2563EB' },
                { label: 'Nuevo contrato', icon: FileSignature, path: '/inmobiliaria/contratos?action=crear', color: '#185FA5' },
                { label: 'Crear orden de trabajo', icon: Wrench, path: '/inmobiliaria/ordenes?action=crear', color: '#7C3AED' },
                { label: 'Nueva liquidación', icon: Wallet, path: '/inmobiliaria/liquidaciones?action=crear', color: '#EC4899' },
            ],
        },
        {
            title: 'Facturación',
            actions: [
                { label: 'Emitir factura', icon: FileText, path: '/contable/comprobantes?tab=crear', color: '#BA7517' },
                { label: 'Cargar factura', icon: Upload, path: '/contable/comprobantes?tab=upload', color: '#534AB7' },
                { label: 'Nueva orden de pago', icon: CreditCard, path: '/tesoreria/ordenes-pago?tab=nueva', color: '#059669' },
                { label: 'Registrar cobro', icon: DollarSign, path: '/tesoreria/movimientos', color: '#1D9E75' },
            ],
        },
        {
            title: 'Gestión',
            actions: [
                { label: 'Nuevo vencimiento', icon: CalendarClock, path: '/inmobiliaria/agenda?action=crear', color: '#F59E0B' },
                { label: 'Nuevo contacto', icon: UserPlus, path: '/crm/contactos?action=crear', color: '#8B5CF6' },
                { label: 'Nuevo prospecto', icon: Users, path: '/crm/prospectos?action=crear', color: '#6366F1' },
                { label: 'Nuevo proveedor', icon: Building2, path: '/contable/proveedores?action=crear', color: '#0EA5E9' },
            ],
        },
    ];

    return (
        <div className="card" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--brand) 1.5%, var(--bg-card))', height: '100%' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={13} /> Acceso rápido
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sections.map(section => (
                    <div key={section.title}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                            {section.title}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {section.actions.map(a => (
                                <button
                                    key={a.label}
                                    onClick={() => navigate(a.path)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '0.5rem 0.65rem', borderRadius: 10, border: 'none',
                                        background: 'var(--bg-subtle)', cursor: 'pointer',
                                        transition: 'background 0.15s, transform 0.1s',
                                        textAlign: 'left', width: '100%',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                                >
                                    <div style={{
                                        width: 26, height: 26, borderRadius: 7,
                                        background: a.color + '15', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <a.icon size={13} color={a.color} />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>{a.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
