import { AuthMeResponseSchema, type CommercialPlanPublicSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type z } from 'zod';

import { annualSavingsCents } from './pricing.js';
import { httpClient } from '../lib/http.js';

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
  const availableCycles = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;
  const [cycle, setCycle] = useState<(typeof availableCycles)[number]>('MONTHLY');
  const session = useQuery({ queryKey: ['auth', 'me', 'marketing'], queryFn: () => httpClient.request('/auth/me', { schema: AuthMeResponseSchema }), retry: false });
  if (plans.length === 0)
    return (
      <div className="pricing-empty">
        <p className="marketing-eyebrow">Planos dinâmicos</p>
        <h3>Os planos comerciais serão exibidos aqui.</h3>
        <p>Nomes, preços, períodos e limites virão diretamente da configuração da plataforma.</p>
      </div>
    );

  return (
    <>
      <div className="pricing-toggle" role="group" aria-label="Periodicidade">{availableCycles.filter((candidate) => plans.some((plan) => plan.billingOptions.some((option) => option.active && option.billingCycle === candidate) || (plan.billingOptions.length === 0 && (candidate === 'MONTHLY' || candidate === 'ANNUAL')))).map((candidate) => <button className={cycle === candidate ? 'nav-active' : ''} key={candidate} onClick={() => { setCycle(candidate); }} type="button">{{ MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' }[candidate]}</button>)}</div>
    <div className={compact ? 'pricing-grid pricing-grid--compact' : 'pricing-grid'}>
      {plans.slice(0, compact ? 3 : undefined).map((plan) => {
        const option = plan.billingOptions.find((item) => item.active && item.billingCycle === cycle);
        if (plan.billingOptions.length > 0 && option === undefined) return null;
        // O card mostra apenas os itens comerciais cadastrados, na ordem
        // definida pelo Super Admin. Nada é derivado de features/limites.
        const enabledBenefits = [...plan.benefits]
          .filter((benefit) => benefit.enabled)
          .sort((left, right) => left.sortOrder - right.sortOrder)
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
              <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: plan.currency }).format(Number(option?.priceCents ?? (cycle === 'ANNUAL' ? plan.annualPriceCents : plan.monthlyPriceCents) ?? plan.priceCents) / 100)}</strong>
              <span>{cycle === 'ANNUAL' ? 'por ano' : 'por mês'}</span>
            </p>
            {cycle === 'ANNUAL' && annualSavingsCents(plan.monthlyPriceCents, plan.annualPriceCents) > 0 ? (
              <p className="pricing-savings">Economize {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: plan.currency }).format(annualSavingsCents(plan.monthlyPriceCents, plan.annualPriceCents) / 100)} por ano</p>
            ) : null}
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
            <Link className="marketing-button marketing-button--full" to={`${session.data === undefined ? '/cadastro' : '/app'}?plan=${encodeURIComponent(plan.publicId)}&billing=${encodeURIComponent(cycle)}`}>
              {plan.ctaText ?? 'Começar grátis'}
            </Link>
          </article>
        );
      })}
    </div></>
  );
}
