import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  message: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDelete({ message, confirmText = 'ELIMINAR', onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const match = typed.toUpperCase() === confirmText.toUpperCase();

  return (
    <div className="wizard-overlay" onClick={onCancel} style={{ zIndex: 300 }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, background: 'var(--color-bg-surface)', borderRadius: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EF44440f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} color="#EF4444" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>¿Estás seguro?</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{message}</div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            Escribí <span style={{ fontWeight: 700, color: '#EF4444', fontFamily: 'var(--font-mono)' }}>{confirmText}</span> para confirmar:
          </div>
          <input
            type="text"
            className="form-input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={confirmText}
            style={{ borderRadius: 12, borderColor: match ? '#10B981' : typed ? '#EF4444' : undefined }}
            autoFocus
          />
        </div>

        {/* Footer */}
        <div style={{ padding: '0 1.5rem 1.25rem', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="wizard-btn-back" style={{ padding: '8px 20px' }}>Cancelar</button>
          <button onClick={onConfirm} disabled={!match}
            style={{
              padding: '8px 20px', borderRadius: 12, border: 'none',
              background: match ? '#EF4444' : '#EF444440', color: '#fff',
              fontSize: '0.875rem', fontWeight: 600, cursor: match ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)', transition: 'background 0.12s',
            }}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for easy usage
export function useConfirmDelete() {
  const [state, setState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const requestDelete = (message: string, onConfirm: () => void) => {
    setState({ message, onConfirm });
  };

  const ConfirmModal = state ? (
    <ConfirmDelete
      message={state.message}
      onConfirm={() => { state.onConfirm(); setState(null); }}
      onCancel={() => setState(null)}
    />
  ) : null;

  return { requestDelete, ConfirmModal };
}
