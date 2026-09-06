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
  pagination: z.object({ total: z.number(), limit: z.number() }).optional(),
});

export function WalletTab() {
  const wallet = useQuery({
    queryKey: ['commercial', 'wallet'],
    queryFn: () => httpClient.request('/commercial/wallet', { schema: walletSchema }),
  });

  const entries = useQuery({
    queryKey: ['commercial', 'wallet', 'entries'],
    queryFn: () =>
      httpClient.request('/commercial/wallet/entries?limit=50', { schema: entriesSchema }),
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
      </div>
    </div>
  );
}
