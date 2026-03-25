import { useState } from 'react';
import OrdenesPagoList from './OrdenesPagoList';
import NuevaOrdenPago from './NuevaOrdenPago';

export default function OrdenesPagoIndex() {
    const [showNueva, setShowNueva] = useState(false);

    return (
        <>
            <OrdenesPagoList onNueva={() => setShowNueva(true)} />

            {showNueva && (
                <div className="wizard-overlay" onClick={() => setShowNueva(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        width: '100%', maxWidth: 800, maxHeight: '92vh', overflowY: 'auto',
                        background: 'var(--color-bg-surface)', borderRadius: 20,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.15)', border: '1px solid var(--color-border-subtle)',
                    }}>
                        <NuevaOrdenPago onAceptar={() => setShowNueva(false)} />
                    </div>
                </div>
            )}
        </>
    );
}
