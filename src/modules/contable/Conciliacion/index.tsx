import { useState } from 'react';
import { useConciliacion } from './useConciliacion';
import ArcaPanel from './ArcaPanel';
import BancoPanel from './BancoPanel';
import MatchSummaryBar from './MatchSummaryBar';

export default function Conciliacion() {
    const {
        arcaRows,
        bankRows,
        bankAccounts,
        selectedBankAccountId,
        setSelectedBankAccountId,
        bankFormat,
        setBankFormat,
        saving,
        loadArcaFile,
        loadBankFile,
        manualMatch,
        unlinkMatch,
        validateAndSave,
        clearArca,
        clearBank,
        stats,
    } = useConciliacion();

    // Selected item on each panel for manual matching
    const [selectedArcaId, setSelectedArcaId] = useState<string | null>(null);
    const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

    // When user selects on one side, check if the other side already has a selection
    const handleSelectArca = (id: string | null) => {
        setSelectedArcaId(id);
        if (id && selectedBankId) {
            manualMatch(id, selectedBankId);
            setSelectedArcaId(null);
            setSelectedBankId(null);
        }
    };

    const handleSelectBank = (id: string | null) => {
        setSelectedBankId(id);
        if (id && selectedArcaId) {
            manualMatch(selectedArcaId, id);
            setSelectedArcaId(null);
            setSelectedBankId(null);
        }
    };

    const handleClearArca = () => {
        setSelectedArcaId(null);
        setSelectedBankId(null);
        clearArca();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', paddingBottom: '1.5rem' }}>
            {/* Page header */}
            <div className="page-header" style={{ marginBottom: 0, flexShrink: 0 }}>
                <div>
                    <h1>Conciliación ARCA + Banco</h1>
                    <p>Cruzá los comprobantes de ARCA con los movimientos bancarios antes de guardarlos en el sistema.</p>
                </div>
            </div>

            {/* Manual match hint banner */}
            {(selectedArcaId || selectedBankId) && (
                <div style={{
                    padding: '0.6rem 1rem',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid var(--brand)',
                    borderRadius: 'var(--r-md)',
                    fontSize: '0.82rem',
                    color: 'var(--brand)',
                    fontWeight: 600,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <span>
                        {selectedArcaId && !selectedBankId && '← Comprobante ARCA seleccionado. Hacé click en un movimiento bancario para conciliar.'}
                        {selectedBankId && !selectedArcaId && '→ Movimiento bancario seleccionado. Hacé click en un comprobante ARCA para conciliar.'}
                        {selectedArcaId && selectedBankId && 'Conciliando...'}
                    </span>
                    <button
                        onClick={() => { setSelectedArcaId(null); setSelectedBankId(null); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 700, fontSize: '0.85rem' }}
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {/* Split screen */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                flex: 1,
                minHeight: 0,
            }}>
                {/* Left: ARCA */}
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <ArcaPanel
                        rows={arcaRows}
                        selectedId={selectedArcaId}
                        onSelectRow={handleSelectArca}
                        onUnlink={unlinkMatch}
                        onFileLoad={loadArcaFile}
                        onClear={handleClearArca}
                    />
                </div>

                {/* Right: Bank */}
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <BancoPanel
                        rows={bankRows}
                        bankAccounts={bankAccounts}
                        selectedAccountId={selectedBankAccountId}
                        onSelectAccount={setSelectedBankAccountId}
                        bankFormat={bankFormat}
                        onBankFormatChange={setBankFormat}
                        selectedId={selectedBankId}
                        onSelectRow={handleSelectBank}
                        onFileLoad={loadBankFile}
                        onClear={() => { setSelectedArcaId(null); setSelectedBankId(null); clearBank(); }}
                    />
                </div>
            </div>

            {/* Summary bar + save */}
            <MatchSummaryBar
                stats={stats}
                saving={saving}
                canSave={stats.total > 0 && !saving}
                onSave={validateAndSave}
            />
        </div>
    );
}
