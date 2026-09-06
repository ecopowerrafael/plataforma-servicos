import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient, HttpError } from '../../lib/http.js';
import { PageHeader, ErrorState } from '../platform/PlatformUi.js';
import { CommercialDashboardTab } from './CommercialDashboardTab.js';
import { CommercialClientsTab } from './CommercialClientsTab.js';
import { CommercialTeamTab } from './CommercialTeamTab.js';

type CommercialTab = 'dashboard' | 'clients' | 'team';

export function CommercialManagerModule() {
  const [activeTab, setActiveTab] = useState<CommercialTab>('dashboard');

  const me = useQuery({
    queryKey: ['commercial', 'me'],
    queryFn: () =>
      httpClient.request('/commercial/me', {
        schema: z.object({
          publicId: z.string(),
          email: z.string(),
          role: z.string(),
          active: z.boolean(),
          defaultCommissionBps: z.number(),
        }),
      }),
    retry: false,
  });

  const deniedStatus = me.error instanceof HttpError ? me.error.status : undefined;
  if (deniedStatus === 403) {
    return <ErrorState message="Você não tem acesso ao painel comercial" />;
  }

  if (me.isPending) {
    return (
      <div className="loading">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );
  }

  if (me.error instanceof Error || me.data === undefined) {
    return <ErrorState message="Erro ao carregar dados comerciais" />;
  }

  const account = me.data;

  return (
    <div className="module-container">
      <PageHeader
        title={`Painel Comercial - ${account.role}`}
        subtitle={`Gerenciado por ${account.email}`}
      />

      <div className="account-info">
        <div className="info-item">
          <span className="label">Função:</span>
          <span className="value">{account.role}</span>
        </div>
        <div className="info-item">
          <span className="label">Comissão Padrão:</span>
          <span className="value">{(account.defaultCommissionBps / 100).toFixed(2)}%</span>
        </div>
        <div className="info-item">
          <span className="label">Status:</span>
          <span className={`status-badge ${account.active ? 'active' : 'inactive'}`}>
            {account.active ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      <div className="module-tabs">
        <button
          className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-button ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          Clientes
        </button>
        <button
          className={`tab-button ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          Equipe
        </button>
      </div>

      <div className="module-content">
        {activeTab === 'dashboard' && <CommercialDashboardTab role={account.role} />}
        {activeTab === 'clients' && <CommercialClientsTab />}
        {activeTab === 'team' && <CommercialTeamTab role={account.role} />}
      </div>

      <style>{`
        .module-container {
          padding: 20px;
          background: var(--bg-primary);
        }

        .account-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin: 20px 0;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border-left: 4px solid var(--primary);
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .info-item .label {
          font-weight: 500;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .info-item .value {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 14px;
        }

        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.active {
          background: rgba(34, 197, 94, 0.1);
          color: rgb(34, 197, 94);
        }

        .status-badge.inactive {
          background: rgba(239, 68, 68, 0.1);
          color: rgb(239, 68, 68);
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

        .loading {
          padding: 20px;
        }

        .skeleton-line {
          height: 20px;
          background: var(--bg-secondary);
          border-radius: 4px;
          margin-bottom: 10px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
