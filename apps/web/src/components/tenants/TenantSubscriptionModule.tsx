import { TenantSubscriptionResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

const statusLabels: Record<string, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  SUSPENDED: 'Suspensa',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
};

const cycleLabels: Record<string, string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

const formatMoney = (cents: string, currency: string) =>
  `${currency} ${(Number(cents) / 100).toFixed(2)}`;

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

const limitLabels: Record<string, string> = {
  'units.max': 'Unidades',
  'members.max': 'Membros',
  'professionals.max': 'Profissionais',
  'monthly_appointments.max': 'Agendamentos por mês',
  'storage.megabytes': 'Armazenamento (MB)',
  'branding.customization.enabled': 'Personalização de marca',
  'custom_domain.enabled': 'Domínio próprio',
  'advanced_reports.enabled': 'Relatórios avançados',
  'priority_support.enabled': 'Suporte prioritário',
};

const formatLimitValue = (limit: {
  valueType: 'INTEGER' | 'BOOLEAN' | 'STRING';
  integerValue: string | null;
  booleanValue: boolean | null;
  stringValue: string | null;
}) => {
  if (limit.valueType === 'INTEGER') return limit.integerValue ?? 'Ilimitado';
  if (limit.valueType === 'BOOLEAN') return limit.booleanValue === true ? 'Sim' : 'Não';
  return limit.stringValue ?? '—';
};

export function TenantSubscriptionModule({ tenantPublicId }: { tenantPublicId: string }) {
  const query = useQuery({
    queryKey: ['tenant', tenantPublicId, 'subscription'],
    queryFn: () =>
      httpClient.request('/tenant/subscription', {
        schema: TenantSubscriptionResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Plano e assinatura">
      <h3>Plano e assinatura</h3>
      {query.isPending ? <p>Carregando…</p> : null}
      {query.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar o plano e a assinatura.</p>
      ) : null}
      {query.data !== undefined && (
        <>
          <p>
            <strong>Plano:</strong> {query.data.plan.name}
          </p>
          <p>
            <strong>Status:</strong>{' '}
            {statusLabels[query.data.subscription.status] ?? query.data.subscription.status}
          </p>
          <p>
            <strong>Ciclo:</strong>{' '}
            {cycleLabels[query.data.subscription.billingCycle] ??
              query.data.subscription.billingCycle}
          </p>
          <p>
            <strong>Preço:</strong>{' '}
            {formatMoney(query.data.subscription.priceCents, query.data.subscription.currency)}
          </p>
          <p>
            <strong>Início:</strong> {formatDate(query.data.subscription.startsAt)}
          </p>
          {query.data.subscription.trialEndsAt !== null && (
            <p>
              <strong>Teste até:</strong> {formatDate(query.data.subscription.trialEndsAt)}
            </p>
          )}
          <p>
            <strong>Próximo período até:</strong>{' '}
            {formatDate(query.data.subscription.currentPeriodEndsAt)}
          </p>

          <h4>Limites do plano</h4>
          <ul>
            {query.data.limits.map((limit) => (
              <li key={limit.key}>
                <strong>{limitLabels[limit.key] ?? limit.key}:</strong> {formatLimitValue(limit)}
                {limit.usage !== null && ` — consumo atual: ${String(limit.usage)}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
