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
    <section className="customer-section" aria-label="Fidelidade">
      <h1 className="client-page-title">Pontos de fidelidade</h1>
      {summary.isPending ? (
        <div className="customer-skeleton-list" aria-busy="true">
          <span />
          <span />
        </div>
      ) : null}
      {summary.error instanceof Error ? (
        <p className="public-form-error" role="alert">
          Não foi possível carregar seu saldo de fidelidade.
        </p>
      ) : null}
      {summary.data !== undefined && (
        <>
          <div className="customer-balance-grid">
            {summary.data.balances.map((item) => (
              <article className="customer-balance" key={item.type}>
                <small>{typeLabels[item.type] ?? item.type}</small>
                <strong>{formatBalance(item.type, item.balance)}</strong>
              </article>
            ))}
          </div>
          <section className="customer-card" aria-label="Histórico recente">
            <header>
              <strong>Histórico recente</strong>
            </header>
            {summary.data.recentEntries.length === 0 ? (
              <p className="customer-empty">Nenhuma movimentação ainda.</p>
            ) : (
              <div className="customer-entry-list">
                {summary.data.recentEntries.map((entry) => (
                  <article className="customer-entry" key={entry.publicId}>
                    <strong className={entry.direction === 'CREDIT' ? 'is-credit' : 'is-debit'}>
                      {`${entry.direction === 'CREDIT' ? '+' : '−'}${entry.amount}`}
                    </strong>
                    <span>
                      <b>{typeLabels[entry.type] ?? entry.type}</b>
                      <small>{entry.reason}</small>
                    </span>
                    <small>{new Date(entry.createdAt).toLocaleDateString('pt-BR')}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
