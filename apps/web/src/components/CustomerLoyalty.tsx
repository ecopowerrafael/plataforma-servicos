import { LoyaltyAccountSummarySchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../lib/http.js';

const typeLabels: Record<string, string> = { POINTS: 'Pontos', CASHBACK: 'Cashback' };

const formatBalance = (type: string, balance: string) =>
  type === 'CASHBACK'
    ? `R$ ${(Number(balance) / 100).toFixed(2)}`
    : `${balance} ${Number(balance) === 1 ? 'ponto' : 'pontos'}`;

export function CustomerLoyalty({ slug }: { slug: string }) {
  const summary = useQuery({
    queryKey: ['public', slug, 'customer', 'loyalty'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/loyalty`, {
        schema: LoyaltyAccountSummarySchema,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Fidelidade">
      <h4>Fidelidade</h4>
      {summary.isPending ? <p>Carregando…</p> : null}
      {summary.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar seu saldo de fidelidade.</p>
      ) : null}
      {summary.data !== undefined && (
        <>
          <ul>
            {summary.data.balances.map((item) => (
              <li key={item.type}>
                {`${typeLabels[item.type] ?? item.type}: ${formatBalance(item.type, item.balance)}`}
              </li>
            ))}
          </ul>
          <h5>Histórico recente</h5>
          {summary.data.recentEntries.length === 0 ? <p>Nenhuma movimentação ainda.</p> : null}
          <ul>
            {summary.data.recentEntries.map((entry) => (
              <li key={entry.publicId}>
                {`${entry.direction === 'CREDIT' ? '+' : '-'}${entry.amount} ${typeLabels[entry.type] ?? entry.type} — ${entry.reason} — ${new Date(entry.createdAt).toLocaleDateString('pt-BR')}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
