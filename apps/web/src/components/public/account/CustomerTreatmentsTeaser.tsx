import { IconArrowRight } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';

import { accountPath } from './customer-account.js';
import {
  money,
  planPath,
  primaryAction,
  stateLabel,
  useCustomerTreatments,
} from './customer-treatments.js';

/**
 * Resumo na home da conta: mostra o tratamento mais relevante e leva para a
 * página dedicada. Não repete a lista inteira.
 */
export function CustomerTreatmentsTeaser({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const plans = useCustomerTreatments(slug);
  if (plans.error instanceof Error) return null;
  const active = (plans.data?.items ?? []).filter(
    (plan) => plan.status !== 'CANCELED' && plan.status !== 'COMPLETED',
  );
  const highlight = active.find((plan) => plan.status === 'PENDING') ?? active[0];
  if (highlight === undefined) return null;
  const action = primaryAction(highlight);

  return (
    <section className="customer-home-treatments" aria-label="Meus tratamentos">
      <header>
        <span>Meus tratamentos</span>
        <Link to={accountPath(slug, 'treatments')}>Ver todos</Link>
      </header>
      <article>
        <div>
          <strong>{highlight.title}</strong>
          <small>{stateLabel(highlight)}</small>
        </div>
        <p>
          {highlight.billingMode === 'TOTAL'
            ? `${money(highlight.amountCents)} total`
            : `${money(highlight.amountCents)} por sessão`}
          {highlight.sessionsPlanned === null
            ? null
            : ` · ${String(highlight.sessionsCompleted)} de ${String(highlight.sessionsPlanned)} sessões`}
        </p>
        <button
          className="customer-home-secondary-cta"
          type="button"
          onClick={() => {
            void navigate(planPath(slug, highlight.publicId));
          }}
        >
          {action.kind === 'approve' ? 'Aprovar' : action.label}{' '}
          <IconArrowRight aria-hidden="true" size={16} />
        </button>
      </article>
    </section>
  );
}
