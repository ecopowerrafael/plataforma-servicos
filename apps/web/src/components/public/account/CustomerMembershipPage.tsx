import {
  CustomerMembershipAccountResponseSchema,
  type CustomerMembershipAccountItem,
} from '@plataforma/shared';
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCreditCard,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../../lib/http.js';

const STATUS_LABELS = {
  ACTIVE: 'Mensalidade ativa',
  PENDING: 'Aguardando pagamento',
  PAST_DUE: 'Mensalidade pendente',
  PAUSED: 'Mensalidade pausada',
  CANCELED: 'Mensalidade cancelada',
  EXPIRED: 'Mensalidade expirada',
} as const;

const CHARGE_LABELS = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  FAILED: 'Falhou',
  CANCELED: 'Cancelada',
  REFUNDED: 'Estornada',
} as const;

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const date = (value: string | null) =>
  value === null ? 'Não informado' : new Date(value).toLocaleDateString('pt-BR');

const intervalLabel = (value: string) =>
  value === 'MONTHLY'
    ? 'por mês'
    : value === 'QUARTERLY'
      ? 'por trimestre'
      : value === 'ANNUAL'
        ? 'por ano'
        : 'por semestre';

export function CustomerMembershipPage({ slug }: { slug: string }) {
  const membership = useQuery({
    queryKey: ['public', slug, 'customer', 'membership'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/membership`, {
        schema: CustomerMembershipAccountResponseSchema,
      }),
    retry: false,
  });

  if (membership.isPending)
    return (
      <section className="customer-section" aria-busy="true">
        <p className="customer-skeleton">Carregando sua mensalidade…</p>
      </section>
    );

  if (membership.error instanceof Error)
    return (
      <section className="customer-section" role="alert">
        <h1>Minha mensalidade</h1>
        <div className="customer-membership-error">
          <IconAlertCircle aria-hidden="true" size={22} />
          <p>Não foi possível carregar sua mensalidade.</p>
          <button
            className="public-primary-button"
            type="button"
            onClick={() => void membership.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );

  if (membership.data === undefined)
    return (
      <section className="customer-section" role="alert">
        <h1>Minha mensalidade</h1>
        <p>Não foi possível carregar sua mensalidade.</p>
      </section>
    );

  const data = membership.data;
  const current = data.current;
  return (
    <section className="customer-section customer-membership-page">
      <header className="customer-membership-page__header">
        <div>
          <span className="customer-home-hero__eyebrow">
            <IconCreditCard aria-hidden="true" size={16} /> Área do cliente
          </span>
          <h1>Minha mensalidade</h1>
          <p>Consulte seu plano, benefícios e histórico.</p>
        </div>
      </header>

      {current === null ? (
        <div className="customer-membership-empty">
          <IconCreditCard aria-hidden="true" size={34} />
          <h2>Você ainda não possui uma mensalidade.</h2>
          <p>Quando houver uma mensalidade vinculada à sua conta, ela aparecerá aqui.</p>
        </div>
      ) : (
        <MembershipCard membership={current} />
      )}

      {data.history.length > 0 ? (
        <section className="customer-membership-card" aria-labelledby="customer-membership-history">
          <header>
            <div>
              <span>Registros anteriores</span>
              <h2 id="customer-membership-history">Histórico</h2>
            </div>
          </header>
          <div className="customer-membership-history">
            {data.history.map((item) => (
              <article key={item.publicId}>
                <div>
                  <strong>{item.planName}</strong>
                  <span>
                    {date(item.currentPeriodStart)} — {date(item.currentPeriodEnd)}
                  </span>
                </div>
                <div>
                  <span>
                    {money(item.priceCents)} {intervalLabel(item.billingInterval)}
                  </span>
                  <span
                    className={`customer-membership-status customer-membership-status--${item.status.toLowerCase()}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function MembershipCard({ membership }: { membership: CustomerMembershipAccountItem }) {
  const charge = membership.charges[0] ?? null;
  const hasBenefits = membership.benefits.length > 0;
  return (
    <>
      <section
        className={`customer-membership-card customer-membership-card--${membership.status.toLowerCase()}`}
        aria-labelledby="customer-membership-status"
      >
        <header>
          <div>
            <span>Status atual</span>
            <h2 id="customer-membership-status">{STATUS_LABELS[membership.status]}</h2>
          </div>
          <span
            className={`customer-membership-status customer-membership-status--${membership.status.toLowerCase()}`}
          >
            {membership.status === 'ACTIVE' ? (
              <IconCheck aria-hidden="true" size={15} />
            ) : (
              <IconClock aria-hidden="true" size={15} />
            )}
            {STATUS_LABELS[membership.status]}
          </span>
        </header>
        <div className="customer-membership-plan-summary">
          <div>
            <span>Plano</span>
            <strong>{membership.planName}</strong>
            {membership.planDescription !== null ? <p>{membership.planDescription}</p> : null}
          </div>
          <div>
            <span>Valor</span>
            <strong>{money(membership.priceCents)}</strong>
            <small>{intervalLabel(membership.billingInterval)}</small>
          </div>
        </div>
        {membership.status === 'PAST_DUE' ? (
          <p className="customer-membership-notice customer-membership-notice--danger">
            Regularize sua mensalidade para voltar a utilizar novos benefícios. Agendamentos já
            reservados não são cancelados por este status.
          </p>
        ) : null}
        {membership.status === 'PENDING' ? (
          <p className="customer-membership-notice">
            A cobrança inicial está aguardando pagamento.
          </p>
        ) : null}
        {membership.cancelAtPeriodEnd ? (
          <p className="customer-membership-notice">
            Cancelamento programado para o fim do período atual.
          </p>
        ) : null}
        <dl className="customer-membership-facts">
          <div>
            <dt>
              <IconCalendarEvent aria-hidden="true" size={15} /> Período atual
            </dt>
            <dd>
              {date(membership.currentPeriodStart)} — {date(membership.currentPeriodEnd)}
            </dd>
          </div>
          <div>
            <dt>Próxima cobrança</dt>
            <dd>{date(membership.nextBillingAt)}</dd>
          </div>
        </dl>
      </section>

      {charge !== null ? (
        <section className="customer-membership-card" aria-labelledby="customer-membership-charge">
          <header>
            <div>
              <span>{membership.status === 'ACTIVE' ? 'Próxima cobrança' : 'Cobrança atual'}</span>
              <h2 id="customer-membership-charge">{CHARGE_LABELS[charge.status]}</h2>
            </div>
            <strong>{money(charge.amountCents)}</strong>
          </header>
          <dl className="customer-membership-facts">
            <div>
              <dt>Vencimento</dt>
              <dd>{date(charge.dueAt)}</dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>{date(charge.paidAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="customer-membership-card" aria-labelledby="customer-membership-benefits">
        <header>
          <div>
            <span>O que está incluído</span>
            <h2 id="customer-membership-benefits">Seus benefícios</h2>
          </div>
        </header>
        {membership.status === 'PAST_DUE' || !membership.benefitsAvailable ? (
          <p className="customer-membership-notice">
            Os novos benefícios estão temporariamente indisponíveis neste status.
          </p>
        ) : !hasBenefits ? (
          <p className="customer-membership-notice">Nenhum benefício disponível neste ciclo.</p>
        ) : (
          <div className="customer-membership-benefits">
            {membership.benefits.map((benefit) => (
              <article key={benefit.serviceName}>
                <div>
                  <strong>{benefit.serviceName}</strong>
                  {benefit.type === 'UNLIMITED' ? (
                    <span>Ilimitado</span>
                  ) : benefit.type === 'DISCOUNT' ? (
                    <span>{benefit.discountPercent}% de desconto</span>
                  ) : (
                    <span>{benefit.limit} por ciclo</span>
                  )}
                </div>
                {benefit.type === 'QUANTITY' ? (
                  <div>
                    <span>{benefit.consumed} consumido(s)</span>
                    <span>{benefit.reserved} reservado(s)</span>
                    <strong>{benefit.available} disponível(is)</strong>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
