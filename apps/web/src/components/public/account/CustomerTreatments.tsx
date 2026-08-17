import { TreatmentPlanListResponseSchema, type TreatmentPlanPublic } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { httpClient } from '../../../lib/http.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

const STATUS_LABEL: Record<TreatmentPlanPublic['status'], string> = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
};

/** Bolinhas de progresso; sem previsão de sessões mostra só o realizado. */
function Progress({ plan }: { plan: TreatmentPlanPublic }) {
  if (plan.sessionsPlanned === null)
    return (
      <p className="customer-treatment__progress">
        {`${String(plan.sessionsCompleted)} ${plan.sessionsCompleted === 1 ? 'sessão realizada' : 'sessões realizadas'}`}
      </p>
    );
  return (
    <p className="customer-treatment__progress">
      <span aria-hidden="true">
        {Array.from({ length: plan.sessionsPlanned }, (_, index) =>
          index < plan.sessionsCompleted ? '●' : '○',
        ).join(' ')}
      </span>
      {`${String(plan.sessionsCompleted)} de ${String(plan.sessionsPlanned)} realizadas`}
    </p>
  );
}

/**
 * Tratamentos do cliente. É leitura: agendar continua sendo o mesmo fluxo
 * público de sempre.
 */
export function CustomerTreatments({ slug }: { slug: string }) {
  const plans = useQuery({
    queryKey: ['public', slug, 'customer', 'treatment-plans'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/treatment-plans`, {
        schema: TreatmentPlanListResponseSchema,
      }),
    retry: false,
  });

  if (plans.isPending) return <p className="customer-skeleton" aria-busy="true" />;
  if (plans.error instanceof Error)
    return <p className="public-form-error">Não foi possível carregar seus tratamentos.</p>;
  const items = plans.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="customer-treatments" aria-label="Meus tratamentos">
      <header>
        <span>Meus tratamentos</span>
      </header>
      {items.map((plan) => (
        <article key={plan.publicId} className="customer-treatment">
          <div className="customer-treatment__head">
            <strong>{plan.serviceName}</strong>
            <span className="ds-badge">{STATUS_LABEL[plan.status]}</span>
          </div>
          <p className="customer-treatment__amount">
            {plan.billingMode === 'TOTAL'
              ? `${money(plan.amountCents)} total`
              : `${money(plan.amountCents)} por sessão`}
            {plan.sessionsPlanned === null
              ? null
              : ` · ${String(plan.sessionsPlanned)} sessões`}
          </p>
          <Progress plan={plan} />
          {/* Antes da primeira sessão concluída não existe "próxima sessão". */}
          {plan.sessionsCompleted === 0 ? (
            plan.status === 'APPROVED' ? (
              <p className="customer-treatment__hint">
                Seu orçamento foi aprovado. Agora agende sua primeira sessão.
              </p>
            ) : null
          ) : plan.recommendedNextDate === null ? null : (
            <p className="customer-treatment__next">
              Próxima sessão recomendada
              <strong>{day(plan.recommendedNextDate)}</strong>
            </p>
          )}
          {plan.status === 'PENDING' ? (
            <p className="customer-treatment__hint">
              Assim que o orçamento for aprovado você poderá agendar a primeira sessão.
            </p>
          ) : plan.status === 'CANCELED' || plan.status === 'COMPLETED' ? null : (
            <Link className="customer-home-secondary-cta" to={`/public/${slug}`}>
              {plan.sessionsCompleted === 0 && plan.sessions.length === 0
                ? 'Agendar primeira sessão'
                : 'Agendar próxima sessão'}
            </Link>
          )}
        </article>
      ))}
    </section>
  );
}
