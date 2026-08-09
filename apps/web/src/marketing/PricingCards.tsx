import { CommercialPlanPublicSchema } from '@plataforma/shared';
import { Link } from 'react-router-dom';
import { type z } from 'zod';

import { billingCycleLabels, planLimitLabels } from './marketing-data.js';

type CommercialPlan = z.infer<typeof CommercialPlanPublicSchema>;

export function formatMoney(plan: CommercialPlan) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: 2,
  }).format(Number(plan.priceCents) / 100);
}

export function formatPlanLimit(limit: CommercialPlan['limits'][number]) {
  if (limit.valueType === 'BOOLEAN')
    return limit.booleanValue === true ? 'Incluído' : 'Não incluído';
  if (limit.integerValue === null) return 'Ilimitado';
  if (limit.key === 'storage.megabytes') {
    const megabytes = Number(limit.integerValue);
    return megabytes >= 1024
      ? `${new Intl.NumberFormat('pt-BR').format(megabytes / 1024)} GB`
      : `${new Intl.NumberFormat('pt-BR').format(megabytes)} MB`;
  }
  return new Intl.NumberFormat('pt-BR').format(Number(limit.integerValue));
}

export function trialMessage(plans: CommercialPlan[] | undefined, defaultTrialDays?: number) {
  const trialDays = new Set((plans ?? []).map((plan) => plan.trialDays ?? defaultTrialDays ?? 0));
  if (trialDays.size === 1) {
    const days = [...trialDays][0] ?? 0;
    return days > 0 ? `${String(days)} dias grátis` : 'Condições conforme o plano';
  }
  if ((plans?.length ?? 0) === 0 && defaultTrialDays !== undefined && defaultTrialDays > 0)
    return `${String(defaultTrialDays)} dias grátis`;
  return 'Período gratuito conforme o plano';
}

export function PricingCards({
  plans,
  compact = false,
}: {
  plans: CommercialPlan[];
  compact?: boolean;
}) {
  if (plans.length === 0)
    return (
      <div className="pricing-empty">
        <p className="marketing-eyebrow">Planos dinâmicos</p>
        <h3>Os planos comerciais serão exibidos aqui.</h3>
        <p>Nomes, preços, períodos e limites virão diretamente da configuração da plataforma.</p>
      </div>
    );

  return (
    <div className={compact ? 'pricing-grid pricing-grid--compact' : 'pricing-grid'}>
      {plans.slice(0, compact ? 3 : undefined).map((plan) => {
        const enabledBenefits = plan.benefits
          .filter((benefit) => benefit.enabled)
          .slice(0, compact ? 5 : undefined);
        return (
          <article
            className={plan.highlighted ? 'pricing-card pricing-card--highlighted' : 'pricing-card'}
            key={plan.publicId}
          >
            {plan.badge === null ? null : <span className="pricing-badge">{plan.badge}</span>}
            <div>
              <p className="marketing-eyebrow">
                {plan.billingCycle === 'CUSTOM' ? 'Plano comercial' : 'Assinatura'}
              </p>
              <h3>{plan.name}</h3>
              {plan.subtitle === null ? null : (
                <p className="pricing-subtitle">{plan.subtitle}</p>
              )}
              {plan.shortDescription === null ? null : (
                <p className="pricing-description">{plan.shortDescription}</p>
              )}
            </div>
            <p className="pricing-price">
              <strong>{formatMoney(plan)}</strong>
              <span>{billingCycleLabels[plan.billingCycle]}</span>
            </p>
            {plan.trialDays !== null && plan.trialDays > 0 ? (
              <span className="pricing-trial">{`${String(plan.trialDays)} dias grátis`}</span>
            ) : null}
            {enabledBenefits.length > 0 ? (
              <ul className="pricing-benefits">
                {enabledBenefits.map((benefit) => (
                  <li key={benefit.publicId}>{benefit.text}</li>
                ))}
              </ul>
            ) : null}
            <ul>
              {plan.limits.slice(0, compact ? 4 : 6).map((limit) => (
                <li key={limit.key}>
                  <span>{planLimitLabels[limit.key]}</span>
                  <strong>{formatPlanLimit(limit)}</strong>
                </li>
              ))}
            </ul>
            <Link className="marketing-button marketing-button--full" to="/login">
              {plan.ctaText ?? 'Começar grátis'}
            </Link>
          </article>
        );
      })}
    </div>
  );
}
