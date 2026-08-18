import { type TreatmentPlanPublic } from '@plataforma/shared';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  day,
  money,
  planPath,
  primaryAction,
  stateLabel,
  upcomingSession,
  useCustomerTreatments,
} from './customer-treatments.js';

type Filter = 'active' | 'done' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'Ativos' },
  { id: 'done', label: 'Concluídos' },
  { id: 'all', label: 'Todos' },
];

const isActive = (plan: TreatmentPlanPublic) =>
  plan.status === 'PENDING' || plan.status === 'APPROVED' || plan.status === 'IN_PROGRESS';

/** Progresso em bolinhas; sem previsão, só o realizado. */
export function TreatmentProgress({ plan }: { plan: TreatmentPlanPublic }) {
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
      {`${String(plan.sessionsCompleted)} de ${String(plan.sessionsPlanned)} sessões realizadas`}
    </p>
  );
}

export function TreatmentAmount({ plan }: { plan: TreatmentPlanPublic }) {
  return (
    <p className="customer-treatment__amount">
      {plan.billingMode === 'TOTAL'
        ? `${money(plan.amountCents)} total`
        : `${money(plan.amountCents)} por sessão`}
      {plan.sessionsPlanned === null ? null : ` · ${String(plan.sessionsPlanned)} sessões`}
    </p>
  );
}

/** Página dedicada: lista os tratamentos do cliente autenticado. */
export function CustomerTreatmentsPage({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const plans = useCustomerTreatments(slug);

  if (plans.isPending) return <p className="customer-skeleton" aria-busy="true" />;
  if (plans.error instanceof Error)
    return <p className="public-form-error">Não foi possível carregar seus tratamentos.</p>;

  const items = (plans.data?.items ?? []).filter((plan) =>
    filter === 'all' ? true : filter === 'active' ? isActive(plan) : !isActive(plan),
  );

  return (
    <section className="customer-treatments-page" aria-label="Meus tratamentos">
      <header className="customer-treatments-page__head">
        <span className="customer-home-hero__eyebrow">
          <IconSparkles aria-hidden="true" size={16} /> Seus tratamentos
        </span>
        <h1>Meus tratamentos</h1>
      </header>

      <div className="customer-treatments-filters" role="tablist" aria-label="Filtrar tratamentos">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? 'is-selected' : undefined}
            onClick={() => {
              setFilter(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="customer-home-appointment__empty">
          <strong>Nenhum tratamento por aqui</strong>
          <p>Quando o profissional definir um orçamento, ele aparece nesta página.</p>
          <Link to={`/public/${slug}`}>Conhecer os serviços</Link>
        </div>
      ) : null}

      {items.map((plan) => {
        const action = primaryAction(plan);
        const upcoming = upcomingSession(plan);
        return (
          <article key={plan.publicId} className="customer-treatment customer-treatment--card">
            <div className="customer-treatment__head">
              <div>
                <strong>{plan.title}</strong>
                <small>{plan.serviceName}</small>
              </div>
              <span className="ds-badge">{stateLabel(plan)}</span>
            </div>
            <p className="customer-treatment__professional">{plan.professionalName}</p>
            <TreatmentAmount plan={plan} />
            <TreatmentProgress plan={plan} />
            {plan.paidCents === '0' ? null : (
              <p className="customer-treatment__paid">{`Recebido: ${money(plan.paidCents)}`}</p>
            )}
            {upcoming === undefined ? (
              plan.recommendedNextDate === null || plan.sessionsCompleted === 0 ? null : (
                <p className="customer-treatment__next">
                  Próxima sessão recomendada
                  <strong>{day(plan.recommendedNextDate)}</strong>
                </p>
              )
            ) : (
              <p className="customer-treatment__next">
                Próxima sessão
                <strong>{day(upcoming.startsAt)}</strong>
              </p>
            )}
            <div className="customer-treatment__actions">
              <button
                className="customer-home-primary-cta"
                type="button"
                onClick={() => {
                  void navigate(planPath(slug, plan.publicId));
                }}
              >
                {action.label} <IconArrowRight aria-hidden="true" size={17} />
              </button>
              {action.kind === 'details' || action.kind === 'history' ? null : (
                <Link className="customer-home-secondary-cta" to={planPath(slug, plan.publicId)}>
                  Ver detalhes
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
