import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Plus, Trash2, Copy, RefreshCw, CheckCircle, Clock, XCircle, ToggleLeft, ToggleRight, Send } from 'lucide-react';
import { useMessagingConnections } from '../hooks/useMessagingConnections';
import type { MessagingConnection, MessagingProvider } from '../hooks/useMessagingConnections';

// Bot username configurado por env — si no existe muestra placeholder
const TELEGRAM_BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '@NeuraBot';

// ── Status helpers ────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: MessagingConnection['status'] }) {
    const map = {
        active:   { label: 'Activa',    color: 'var(--success)', icon: <CheckCircle size={12} /> },
        pending:  { label: 'Pendiente', color: 'var(--warning)', icon: <Clock size={12} /> },
        inactive: { label: 'Inactiva',  color: 'var(--text-muted)', icon: <XCircle size={12} /> },
    };
    const { label, color, icon } = map[status];
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: `${color}18`, color, fontSize: '0.7rem', fontWeight: 700 }}>
            {icon} {label}
        </span>
    );
}

// ── Countdown para el código ──────────────────────────────────────────────────
function Countdown({ expiresAt }: { expiresAt: string }) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        const tick = () => {
            const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setRemaining(diff === 0 ? 'Expirado' : `${m}:${s.toString().padStart(2, '0')}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    const expired = remaining === 'Expirado';
    return (
        <span style={{ fontSize: '0.72rem', color: expired ? 'var(--danger)' : 'var(--text-muted)' }}>
            {expired ? '⚠️ Expirado' : `Expira en ${remaining}`}
        </span>
    );
}

// ── Modal nueva conexión ──────────────────────────────────────────────────────
interface NewConnectionModalProps {
    provider: MessagingProvider;
    onClose: () => void;
    onCreate: (name: string) => Promise<MessagingConnection | null>;
    creating: boolean;
    connections: MessagingConnection[];
}

function NewConnectionModal({ provider, onClose, onCreate, creating, connections }: NewConnectionModalProps) {
    const [name, setName] = useState('');
    const [connection, setConnection] = useState<MessagingConnection | null>(null);
    const [copied, setCopied] = useState(false);

    // Auto-cierre cuando n8n activa la conexión
    useEffect(() => {
        if (!connection) return;
        const updated = connections.find(c => c.id === connection.id);
        if (updated?.status === 'active') onClose();
    }, [connections, connection, onClose]);

    const handleCreate = async () => {
        if (!name.trim()) return;
        const conn = await onCreate(name.trim());
        if (conn) setConnection(conn);
    };

    const copyCommand = () => {
        if (!connection?.connection_code) return;
        navigator.clipboard.writeText(`/vincular ${connection.connection_code}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const providerLabel = provider === 'telegram' ? 'Telegram' : provider === 'whatsapp' ? 'WhatsApp' : provider;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
            <div className="wizard-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <div className="wizard-header">
                    <h3>Nueva conexión de {providerLabel}</h3>
                    <button className="wizard-close" onClick={onClose}>✕</button>
                </div>
                <div className="wizard-body">
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    Vinculá una cuenta de {providerLabel} para recibir facturas desde esa conversación.
                </p>

                {!connection ? (
                    <>
                        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                            <label className="form-label">Nombre de esta conexión</label>
                            <input
                                className="form-input"
                                placeholder='Ej: "Facturación", "Gerencia", "Juan López"'
                                value={name}
                                onChange={e => setName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                autoFocus
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                                Solo para identificar la conexión internamente.
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Pasos */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
                            <Step n={1} text={`Abrí ${providerLabel} y buscá ${TELEGRAM_BOT}`} />
                            <Step n={2} text="Enviá el siguiente comando:" />

                            {/* Comando copiable */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                                <code style={{ flex: 1, fontSize: '1rem', fontWeight: 700, letterSpacing: 1, color: 'var(--brand)' }}>
                                    /vincular {connection.connection_code}
                                </code>
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', gap: '0.35rem' }}
                                    onClick={copyCommand}
                                >
                                    {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                                    {copied ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>

                            {connection.code_expires_at && (
                                <Countdown expiresAt={connection.code_expires_at} />
                            )}

                            <Step n={3} text="Esta ventana se actualiza automáticamente cuando la cuenta se vincule." />
                        </div>

                        {/* Spinner de espera */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', background: 'rgba(99,102,241,0.06)', borderRadius: 'var(--r-md)', marginBottom: '1rem' }}>
                            <RefreshCw size={15} style={{ color: 'var(--brand)', animation: 'spin 1.5s linear infinite' }} />
                            <span style={{ fontSize: '0.82rem', color: 'var(--brand)', fontWeight: 600 }}>
                                Esperando que {connection.name} envíe el comando…
                            </span>
                        </div>

                    </>
                )}
                </div>
                <div className="wizard-footer">
                    <div className="wizard-footer-left" />
                    <div className="wizard-footer-right">
                        {!connection ? (
                            <>
                                <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                                <button className="wizard-btn-next" disabled={!name.trim() || creating} onClick={handleCreate}>
                                    {creating ? 'Generando...' : 'Generar código'}
                                </button>
                            </>
                        ) : (
                            <button className="btn btn-secondary" onClick={onClose}>
                                Cerrar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>, document.body
    );
}

function Step({ n, text }: { n: number; text: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: '#fff', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</span>
            <span style={{ fontSize: '0.83rem', color: 'var(--text-main)', paddingTop: 2 }}>{text}</span>
        </div>
    );
}

// ── Fila de conexión ──────────────────────────────────────────────────────────
interface ConnectionRowProps {
    connection: MessagingConnection;
    onDelete: (id: string) => void;
    onToggle: (id: string, status: MessagingConnection['status']) => void;
    onRenew: (id: string) => void;
}

function ConnectionRow({ connection: c, onDelete, onToggle, onRenew }: ConnectionRowProps) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
            {/* Avatar */}
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageCircle size={16} style={{ color: 'var(--brand)' }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>{c.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {c.external_name
                        ? <span>{c.external_name} · ID {c.external_id}</span>
                        : c.status === 'pending' && c.connection_code
                            ? <span style={{ color: 'var(--warning)' }}>Código: <strong>{c.connection_code}</strong> · <Countdown expiresAt={c.code_expires_at!} /></span>
                            : <span>Sin vincular</span>
                    }
                </div>
            </div>

            <StatusChip status={c.status} />

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                {/* Renovar código si está pending y expirado */}
                {c.status === 'pending' && c.code_expires_at && new Date(c.code_expires_at) < new Date() && (
                    <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', gap: '0.3rem' }} onClick={() => onRenew(c.id)}>
                        <RefreshCw size={12} /> Renovar
                    </button>
                )}

                {/* Toggle activo/inactivo — solo para conexiones ya vinculadas */}
                {(c.status === 'active' || c.status === 'inactive') && (
                    <button
                        title={c.status === 'active' ? 'Desactivar' : 'Activar'}
                        onClick={() => onToggle(c.id, c.status)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.status === 'active' ? 'var(--success)' : 'var(--text-muted)', padding: '0.25rem' }}
                    >
                        {c.status === 'active' ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                )}

                {/* Eliminar */}
                {!confirmDelete ? (
                    <button
                        title="Eliminar conexión"
                        onClick={() => setConfirmDelete(true)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
                    >
                        <Trash2 size={15} />
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button className="btn" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={() => onDelete(c.id)}>
                            Confirmar
                        </button>
                        <button className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }} onClick={() => setConfirmDelete(false)}>
                            Cancelar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Panel por plataforma ──────────────────────────────────────────────────────
interface PlatformPanelProps {
    provider: MessagingProvider;
    label: string;
    icon: React.ReactNode;
    comingSoon?: boolean;
}

function PlatformPanel({ provider, label, icon, comingSoon }: PlatformPanelProps) {
    const { connections, loading, creating, createConnection, deleteConnection, toggleConnection, renewCode } = useMessagingConnections(provider);
    const [showModal, setShowModal] = useState(false);

    const active = connections.filter(c => c.status === 'active').length;
    const pending = connections.filter(c => c.status === 'pending').length;

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: comingSoon ? 0.6 : 1 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {icon}
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {label}
                            {comingSoon && (
                                <span style={{ fontSize: '0.65rem', background: 'var(--bg-subtle)', color: 'var(--text-muted)', padding: '1px 7px', borderRadius: 999, fontWeight: 600 }}>
                                    Próximamente
                                </span>
                            )}
                        </div>
                        {!comingSoon && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                {loading ? '…' : `${active} activa${active !== 1 ? 's' : ''}`}
                                {pending > 0 && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· {pending} pendiente{pending !== 1 ? 's' : ''}</span>}
                            </div>
                        )}
                    </div>
                </div>
                {!comingSoon && (
                    <button
                        className="btn btn-primary"
                        style={{ gap: '0.4rem', fontSize: '0.82rem' }}
                        onClick={() => setShowModal(true)}
                    >
                        <Plus size={14} /> Nueva conexión
                    </button>
                )}
            </div>

            {/* Lista de conexiones */}
            {!comingSoon && (
                <div>
                    {loading ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Cargando…</div>
                    ) : connections.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <MessageCircle size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>Sin conexiones. Creá la primera.</p>
                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>
                                Cada conexión permite que una cuenta de {label} envíe facturas al sistema.
                            </p>
                        </div>
                    ) : (
                        connections.map(c => (
                            <ConnectionRow
                                key={c.id}
                                connection={c}
                                onDelete={deleteConnection}
                                onToggle={toggleConnection}
                                onRenew={renewCode}
                            />
                        ))
                    )}
                </div>
            )}

            {/* Nota informativa para Telegram */}
            {!comingSoon && provider === 'telegram' && (
                <div style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <Send size={12} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>
                        Las cuentas conectadas pueden enviar fotos o PDFs de facturas directamente al bot <strong>{TELEGRAM_BOT}</strong>. El sistema hace OCR y carga el comprobante automáticamente.
                    </span>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <NewConnectionModal
                    provider={provider}
                    onClose={() => setShowModal(false)}
                    onCreate={createConnection}
                    creating={creating}
                    connections={connections}
                />
            )}
        </div>
    );
}

// ── Export principal ──────────────────────────────────────────────────────────
export default function MessagingTab() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Mensajería</h2>
                <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                    Conectá cuentas de mensajería para recibir facturas directamente desde el chat.
                    Cada empresa puede tener múltiples conexiones por plataforma.
                </p>
            </div>

            <PlatformPanel
                provider="telegram"
                label="Telegram"
                icon={<div style={{ width: 32, height: 32, borderRadius: 8, background: '#229ED9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={16} color="#fff" /></div>}
            />

            <PlatformPanel
                provider="whatsapp"
                label="WhatsApp"
                comingSoon
                icon={<div style={{ width: 32, height: 32, borderRadius: 8, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={16} color="#fff" /></div>}
            />
        </div>
    );
}
