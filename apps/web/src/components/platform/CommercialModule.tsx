import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PageHeader, ErrorState } from './PlatformUi.js';
import { httpClient } from '../../lib/http.js';
import { CommercialManagersTab } from './CommercialManagersTab.js';
import { CommercialRegionsTab } from './CommercialRegionsTab.js';

type CommercialTab = 'managers' | 'regions' | 'payments' | 'commissions';

const paymentsSchema = z.object({
  data: z.array(z.object({
    publicId: z.string(),
    tenant: z.object({ publicId: z.string(), name: z.string() }),
    manager: z.object({ publicId: z.string(), email: z.string() }),
    amountCents: z.number(),
    status: z.string(),
    createdAt: z.string(),
  })),
  pagination: z.object({ page: z.number(), limit: z.number(), total: z.number() }),
});

const commissionsSchema = z.object({
  commissions: z.array(z.object({
    publicId: z.string(),
    commercialAccountId: z.bigint(),
    tenant: z.object({ publicId: z.string(), displayName: z.string() }),
    subscription: z.object({ publicId: z.string() }),
    baseAmountCents: z.bigint(),
    percentageBpsSnapshot: z.number(),
    commissionAmountCents: z.bigint(),
    roleSnapshot: z.string(),
    paymentSource: z.string().optional(),
    paymentId: z.string().optional(),
    status: z.string(),
    createdAt: z.string(),
  })),
});

interface CommercialModuleProps {
  initialTab?: CommercialTab;
}

export function CommercialModule({ initialTab = 'managers' }: CommercialModuleProps) {
  const [activeTab, setActiveTab] = useState<CommercialTab>(initialTab);
  const [reversalId, setReversalId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const queryClient = useQueryClient();

  const payments = useQuery({
    queryKey: ['admin', 'payments'],
    queryFn: () =>
      httpClient.request('/platform/commercial/manual-payments?limit=50&page=1', {
        schema: paymentsSchema,
      }),
    enabled: activeTab === 'payments',
  });

  const commissions = useQuery({
    queryKey: ['admin', 'commissions'],
    queryFn: () =>
      httpClient.request('/platform/commercial/commissions?limit=100', {
        schema: commissionsSchema,
      }),
    enabled: activeTab === 'commissions',
  });

  const handleReverse = async () => {
    if (!reversalId || !reversalReason.trim()) return;

    try {
      await httpClient.request(`/platform/commercial/manual-payments/${reversalId}/reverse`, {
        method: 'POST',
        body: { reason: reversalReason },
      });
      setReversalId(null);
      setReversalReason('');
      await payments.refetch();
    } catch (error) {
      console.error('Reversal error:', error);
    }
  };

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
        <button
          className={`tab-button ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Pagamentos
        </button>
        <button
          className={`tab-button ${activeTab === 'commissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('commissions')}
        >
          Comissões
        </button>
      </div>

      <div className="module-content">
        {activeTab === 'managers' && <CommercialManagersTab />}
        {activeTab === 'regions' && <CommercialRegionsTab />}
        {activeTab === 'payments' && (
          <div className="payments-section">
            <h3>Pagamentos Manuais</h3>
            {payments.isPending && <div>Carregando...</div>}
            {payments.error && <ErrorState message="Erro ao carregar pagamentos" />}
            {payments.data && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Manager</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Data</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.data.map((p) => (
                    <tr key={p.publicId}>
                      <td>{p.tenant.name}</td>
                      <td>{p.manager.email}</td>
                      <td>R$ {(p.amountCents / 100).toFixed(2)}</td>
                      <td>
                        <span className={`status-badge status-${p.status.toLowerCase()}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td>
                        {p.status !== 'REVERSED' && (
                          <button
                            className="btn-reverse"
                            onClick={() => setReversalId(p.publicId)}
                          >
                            Estornar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {activeTab === 'commissions' && (
          <div className="commissions-section">
            <h3>Comissões por Origem</h3>
            {commissions.isPending && <div>Carregando...</div>}
            {commissions.error && <ErrorState message="Erro ao carregar comissões" />}
            {commissions.data && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Papel</th>
                    <th>Origem</th>
                    <th>Payment ID</th>
                    <th>Valor Base</th>
                    <th>Percentual</th>
                    <th>Comissão</th>
                    <th>Status</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.data.commissions.map((c) => (
                    <tr key={c.publicId}>
                      <td>{c.tenant.displayName}</td>
                      <td>{c.roleSnapshot}</td>
                      <td>
                        {c.paymentSource
                          ? {
                              GATEWAY: 'Gateway',
                              PIX: 'PIX',
                              CARD: 'Cartão',
                              COMMERCIAL_WALLET: 'Carteira Comercial',
                              MANUAL_ADMIN: 'Manual Admin',
                            }[c.paymentSource] || c.paymentSource
                          : '—'}
                      </td>
                      <td className="mono">{c.paymentId || '—'}</td>
                      <td>R$ {(Number(c.baseAmountCents) / 100).toFixed(2)}</td>
                      <td>{(c.percentageBpsSnapshot / 100).toFixed(2)}%</td>
                      <td>R$ {(Number(c.commissionAmountCents) / 100).toFixed(2)}</td>
                      <td>
                        <span className={`status-badge status-${c.status.toLowerCase()}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {reversalId && (
        <div className="modal-overlay" onClick={() => setReversalId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Estornar Pagamento</h2>
            <div className="modal-body">
              <div className="form-group">
                <label>Motivo do Estorno</label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Descreva o motivo do estorno..."
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setReversalId(null)}>Cancelar</button>
              <button
                onClick={handleReverse}
                disabled={!reversalReason.trim()}
                className="btn-confirm"
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

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

        .data-table {
          width: 100%;
          border-collapse: collapse;
          background: var(--bg-secondary);
          border-radius: 8px;
        }

        .data-table thead th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          font-size: 13px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .data-table tbody td {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
          font-size: 13px;
        }

        .data-table tbody tr:hover {
          background: var(--bg-primary);
        }

        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .status-badge.status-processed {
          background: rgba(34, 197, 94, 0.1);
          color: rgb(34, 197, 94);
        }

        .status-badge.status-reversed {
          background: rgba(107, 114, 128, 0.1);
          color: rgb(107, 114, 128);
        }

        .btn-reverse {
          padding: 6px 12px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: var(--bg-primary);
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          width: 90%;
          max-width: 500px;
          padding: 20px;
        }

        .modal-content h2 {
          margin: 0 0 20px 0;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .form-group textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-family: inherit;
          min-height: 100px;
          box-sizing: border-box;
        }

        .modal-footer {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .modal-footer button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .modal-footer button:first-child {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .btn-confirm {
          background: var(--primary);
          color: white;
        }

        .btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
