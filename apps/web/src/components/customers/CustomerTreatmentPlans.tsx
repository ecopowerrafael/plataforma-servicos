import { TreatmentPlanListResponseSchema, type TreatmentPlanPublic } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';
import { SectionCard } from '../ui/AppUi.js';

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

/**
 * Orçamentos e tratamentos do cliente. Os valores vêm dos mesmos pagamentos do
 * financeiro: o recebido é o que já entrou, e a previsão é sempre rotulada.
 */
export function CustomerTreatmentPlans({
  tenantPublicId,
  customerPublicId,
}: {
  tenantPublicId: string;
  customerPublicId: string;
}) {
  const plans = useQuery({
    queryKey: ['tenant', tenantPublicId, 'treatment-plans', customerPublicId],
    queryFn: () =>
      httpClient.request(`/tenant/treatment-plans?customerPublicId=${customerPublicId}`, {
        schema: TreatmentPlanListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  if (plans.error instanceof Error || (plans.data?.items.length ?? 0) === 0) return null;

  return (
    <SectionCard
      title="Orçamentos e tratamentos"
      description="Planos definidos após uma avaliação."
    >
      <ul className="crm-treatment-list">
        {(plans.data?.items ?? []).map((plan) => (
          <li key={plan.publicId} className="crm-treatment">
            <div className="crm-treatment__head">
              {/* O título definido no orçamento manda; o serviço é secundário. */}
              <div>
                <strong>{plan.title}</strong>
                <small>{plan.serviceName}</small>
              </div>
              <span className="ds-badge">{STATUS_LABEL[plan.status]}</span>
            </div>
            <dl className="crm-facts">
              <div>
                <dt>Valor</dt>
                <dd>
                  {plan.billingMode === 'TOTAL'
                    ? `${money(plan.amountCents)} total`
                    : `${money(plan.amountCents)} / sessão`}
                </dd>
              </div>
              <div>
                <dt>Sessões</dt>
                <dd>
                  {plan.sessionsPlanned === null
                    ? `${String(plan.sessionsCompleted)} realizadas`
                    : `${String(plan.sessionsCompleted)} de ${String(plan.sessionsPlanned)} realizadas`}
                </dd>
              </div>
              <div>
                <dt>Recebido</dt>
                <dd>{money(plan.paidCents)}</dd>
              </div>
              {plan.estimatedTotalCents === null ? null : (
                <div>
                  <dt>Total estimado</dt>
                  <dd>{money(plan.estimatedTotalCents)}</dd>
                </div>
              )}
              {plan.recommendedNextDate === null ? null : (
                <div>
                  <dt>Próxima recomendação</dt>
                  <dd>{day(plan.recommendedNextDate)}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
