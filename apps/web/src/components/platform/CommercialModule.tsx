import { useState } from 'react';
import { PageHeader } from './PlatformUi.js';
import { CommercialManagersTab } from './CommercialManagersTab.js';
import { CommercialRegionsTab } from './CommercialRegionsTab.js';

type CommercialTab = 'managers' | 'regions';

interface CommercialModuleProps {
  initialTab?: CommercialTab;
}

export function CommercialModule({ initialTab = 'managers' }: CommercialModuleProps) {
  const [activeTab, setActiveTab] = useState<CommercialTab>(initialTab);

  return (
    <div className="module-container">
      <PageHeader title="Hierarquia Comercial" subtitle="Gerenciar gerentes, representantes e vendedores" />

      <div className="module-tabs">
        <button
          className={`tab-button ${activeTab === 'managers' ? 'active' : ''}`}
          onClick={() => setActiveTab('managers')}
        >
          Gerentes
        </button>
        <button
          className={`tab-button ${activeTab === 'regions' ? 'active' : ''}`}
          onClick={() => setActiveTab('regions')}
        >
          Regiões
        </button>
      </div>

      <div className="module-content">
        {activeTab === 'managers' && <CommercialManagersTab />}
        {activeTab === 'regions' && <CommercialRegionsTab />}
      </div>

      <style>{`
        .module-container {
          padding: 20px;
          background: var(--bg-primary);
        }

        .module-tabs {
          display: flex;
          gap: 8px;
          margin: 20px 0;
          border-bottom: 1px solid var(--border-color);
        }

        .tab-button {
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-button:hover {
          color: var(--text-primary);
        }

        .tab-button.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }

        .module-content {
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
}
