import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, List, Receipt } from 'lucide-react';
import OrdenesPagoList from './OrdenesPagoList';
import NuevaOrdenPago from './NuevaOrdenPago';

type TabKey = 'listado' | 'nueva';

export default function OrdenesPagoIndex() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as TabKey) || 'listado';
    const [activeTab, setActiveTab] = useState<TabKey>(tabParam);

    const handleTabChange = (tab: TabKey) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    const tabs = [
        { key: 'listado' as TabKey, label: 'Historial', icon: <List size={13} /> },
        { key: 'nueva' as TabKey, label: 'Emitir Orden de Pago', icon: <Plus size={13} /> }
    ];

    return (
        <div style={{ padding: '0 2rem 2rem 2rem' }}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="module-icon-box">
                            <Receipt size={24} />
                        </div>
                        <div>
                            <h1>Órdenes de Pago</h1>
                            <p>Gestión de facturas a pagar, retenciones y emisión de OPs.</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleTabChange('nueva')}
                        >
                            <Plus size={13} /> Nueva OP
                        </button>
                    </div>
                </div>
            </div>

            <div className="tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`tab - btn${activeTab === tab.key ? ' active' : ''}`}
                        onClick={() => handleTabChange(tab.key)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <main style={{ marginTop: '1rem' }}>
                {activeTab === 'listado' && (
                    <OrdenesPagoList />
                )}

                {activeTab === 'nueva' && (
                    <NuevaOrdenPago onAceptar={() => handleTabChange('listado')} />
                )}
            </main>
        </div>
    );
}
