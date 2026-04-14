import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDelete({ message, onConfirm, onCancel }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    onConfirm();
  };

  return (
    <div className="wizard-overlay" onClick={onCancel} style={{ zIndex: 300 }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, background: 'var(--color-bg-surface)', borderRadius: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)', border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
      }}>
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

        <div style={{ padding: '1.25rem 1.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {armed
            ? <>Hacé click en <strong style={{ color: '#EF4444' }}>Confirmar eliminación</strong> para confirmar. Se cancela en 5 segundos.</>
            : <>Esta acción no se puede deshacer. Tenés que hacer click dos veces en el botón rojo.</>}
        </div>

        <div style={{ padding: '0 1.5rem 1.25rem', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="wizard-btn-back" style={{ padding: '8px 20px' }}>Cancelar</button>
          <button onClick={handleClick}
            style={{
              padding: '8px 20px', borderRadius: 12, border: 'none',
              background: '#EF4444', color: '#fff',
              fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', transition: 'background 0.12s',
              boxShadow: armed ? '0 0 0 3px rgba(239, 68, 68, 0.35)' : 'none',
            }}>
            {armed ? 'Confirmar eliminación' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
