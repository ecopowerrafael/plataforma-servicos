import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';

const walletSchema = z.object({
  publicId: z.string(),
  balance: z.number(),
});

const entrySchema = z.object({
  publicId: z.string(),
  type: z.string(),
  amountCents: z.number(),
  description: z.string(),
  createdAt: z.string(),
});

const entriesSchema = z.object({
  entries: z.array(entrySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
    hasNextPage: z.boolean(),
  }),
});

export function WalletTab() {
  const [page, setPage] = useState(1);

  const wallet = useQuery({
    queryKey: ['commercial', 'wallet'],
    queryFn: () => httpClient.request('/commercial/wallet', { schema: walletSchema }),
  });

  const entries = useQuery({
    queryKey: ['commercial', 'wallet', 'entries', page],
    queryFn: () =>
      httpClient.request(`/commercial/wallet/entries?page=${page}&limit=50`, {
        schema: entriesSchema,
      }),
  });

  if (wallet.isPending || entries.isPending) {
    return <div className="loading">Carregando carteira...</div>;
  }

  if (wallet.error || entries.error) {
    return <ErrorState message="Erro ao carregar carteira" />;
  }

  const balance = wallet.data?.balance ?? 0;
  const balanceR$ = (balance / 100).toFixed(2);

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = {
      COMMISSION_CREDIT: 'Comissão',
      PLAN_PAYMENT_DEBIT: 'Pagamento de plano',
      ADJUSTMENT_CREDIT: 'Crédito',
      ADJUSTMENT_DEBIT: 'Débito',
      REVERSAL: 'Estorno',
    };
    return labels[type] || type;
  };

  return (
    <div className="wallet-tab">
      <div className="wallet-cards">
        <div className="wallet-card">
          <span className="card-label">Saldo Disponível</span>
          <span className="card-value">R$ {balanceR$}</span>
        </div>
      </div>

      <div className="wallet-ledger">
        <h3>Extrato</h3>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {entries.data?.entries.map((entry) => (
              <tr key={entry.publicId}>
                <td>{new Date(entry.createdAt).toLocaleDateString('pt-BR')}</td>
                <td>{entry.description}</td>
                <td>{typeLabel(entry.type)}</td>
                <td className={entry.amountCents > 0 ? 'positive' : 'negative'}>
                  {entry.amountCents > 0 ? '+' : ''} R$ {Math.abs(entry.amountCents / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {entries.data?.pagination && (
          <div className="pagination-controls">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1 || entries.isPending}
            >
              ← Anterior
            </button>
            <span className="pagination-info">
              Página {entries.data.pagination.page} de {entries.data.pagination.pages}
              ({entries.data.pagination.total} transações)
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={!entries.data.pagination.hasNextPage || entries.isPending}
            >
              Próxima →
            </button>
          </div>
        )}
      </div>

      <style>{`
        .wallet-tab {
          padding: 20px 0;
        }

        .wallet-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 30px;
        }

        .wallet-card {
          padding: 20px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border-left: 4px solid var(--primary);
        }

        .card-label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .card-value {
          display: block;
          font-size: 24px;
          font-weight: 700;
          color: var(--primary);
        }

        .wallet-ledger {
          margin-top: 20px;
        }

        .wallet-ledger h3 {
          margin-bottom: 16px;
          font-size: 18px;
          color: var(--text-primary);
        }

        .ledger-table {
          width: 100%;
          border-collapse: collapse;
          background: var(--bg-secondary);
          border-radius: 8px;
          overflow: hidden;
        }

        .ledger-table thead th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          font-size: 12px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .ledger-table tbody td {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
          font-size: 14px;
        }

        .ledger-table tbody tr:hover {
          background: var(--bg-primary);
        }

        .ledger-table .positive {
          color: rgb(34, 197, 94);
          font-weight: 500;
        }

        .ledger-table .negative {
          color: rgb(239, 68, 68);
          font-weight: 500;
        }

        .pagination-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 12px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
          border-radius: 0 0 8px 8px;
          gap: 12px;
        }

        .pagination-controls button {
          padding: 8px 12px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pagination-controls button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .pagination-controls button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-info {
          font-size: 13px;
          color: var(--text-secondary);
          flex: 1;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
