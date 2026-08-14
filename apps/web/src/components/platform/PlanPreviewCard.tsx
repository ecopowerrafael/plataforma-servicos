import { billingCycleLabels, planLimitLabels } from '../../marketing/marketing-data.js';

import type { BillingCycleSchema, PlanLimitKeySchema } from '@plataforma/shared';
import type { z } from 'zod';

type BillingCycle = z.infer<typeof BillingCycleSchema>;
type PlanLimitKey = z.infer<typeof PlanLimitKeySchema>;

export interface PlanPreviewLimit {
  key?: string;
  valueType?: 'INTEGER' | 'BOOLEAN' | 'STRING';
  integerValue?: number;
  booleanValue?: boolean;
  stringValue?: string;
}

/** Loosely-typed mirror of PlanFormInput's live (possibly-invalid, unsaved) watch values. */
export interface PlanPreviewValue {
  name?: string;
  subtitle?: string | null;
  shortDescription?: string | null;
  priceCents?: number;
  currency?: string;
  billingCycle?: BillingCycle;
  trialDays?: number | null;
  highlighted?: boolean;
  badge?: string | null;
  ctaText?: string | null;
  limits?: PlanPreviewLimit[];
}

function formatMoneyFromCents(priceCents: number | undefined, currency: string | undefined) {
  const safeCents = typeof priceCents === 'number' && Number.isFinite(priceCents) ? priceCents : 0;
  const safeCurrency = currency?.trim().length === 3 ? currency : 'BRL';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
    }).format(safeCents / 100);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(safeCents / 100);
  }
}

function formatLimitPreview(limit: PlanPreviewLimit) {
  if (limit.valueType === 'BOOLEAN')
    return limit.booleanValue === true ? 'Incluído' : 'Não incluído';
  if (limit.valueType === 'INTEGER') {
    if (limit.integerValue === undefined) return 'Ilimitado';
    if (limit.key === 'storage.megabytes') {
      const megabytes = limit.integerValue;
      return megabytes >= 1024
        ? `${new Intl.NumberFormat('pt-BR').format(megabytes / 1024)} GB`
        : `${new Intl.NumberFormat('pt-BR').format(megabytes)} MB`;
    }
    return new Intl.NumberFormat('pt-BR').format(limit.integerValue);
  }
  if (limit.valueType === 'STRING') return limit.stringValue ?? '';
  return '';
}

/**
 * Live, client-side preview of how a plan will render on the public /planos page.
 * Mirrors the visual structure of apps/web/src/marketing/PricingCards.tsx without
 * depending on server-shaped data, since it reflects unsaved form state.
 */
export function PlanPreviewCard({
  value,
  defaultTrialDays,
  benefitTexts,
}: {
  value: PlanPreviewValue;
  defaultTrialDays: number | undefined;
  benefitTexts: string[];
}) {
  const trialDays = value.trialDays ?? defaultTrialDays;
  const billingCycle = value.billingCycle ?? 'MONTHLY';
  const cycleLabel = billingCycleLabels[billingCycle];

  return (
    <div className="plan-preview">
      <p className="eyebrow">{'Prévia pública'}</p>
      <article
        className={value.highlighted ? 'pricing-card pricing-card--highlighted' : 'pricing-card'}
      >
        {value.badge !== null && value.badge !== undefined && value.badge.trim() !== '' ? (
          <span className="pricing-badge">{value.badge}</span>
        ) : null}
        <div>
          <p className="marketing-eyebrow">
            {billingCycle === 'CUSTOM' ? 'Plano comercial' : 'Assinatura'}
          </p>
          <h3>{value.name !== '' ? value.name : 'Nome do plano'}</h3>
          {value.subtitle !== null &&
          value.subtitle !== undefined &&
          value.subtitle.trim() !== '' ? (
            <p className="pricing-subtitle">{value.subtitle}</p>
          ) : null}
          {value.shortDescription !== null &&
          value.shortDescription !== undefined &&
          value.shortDescription.trim() !== '' ? (
            <p className="pricing-description">{value.shortDescription}</p>
          ) : null}
        </div>
        <p className="pricing-price">
          <strong>{formatMoneyFromCents(value.priceCents, value.currency)}</strong>
          <span>{cycleLabel}</span>
        </p>
        {trialDays !== undefined && trialDays > 0 ? (
          <span className="pricing-trial">{`${String(trialDays)} dias grátis`}</span>
        ) : null}
        {benefitTexts.length > 0 ? (
          <ul className="pricing-benefits">
            {benefitTexts.map((text, index) => (
              <li key={`${String(index)}-${text}`}>{text}</li>
            ))}
          </ul>
        ) : null}
        <ul>
          {(value.limits ?? []).map((limit) => {
            const key = limit.key;
            if (key === undefined) return null;
            return (
              <li key={key}>
                <span>{planLimitLabels[key as PlanLimitKey]}</span>
                <strong>{formatLimitPreview(limit)}</strong>
              </li>
            );
          })}
        </ul>
        <span className="marketing-button marketing-button--full">
          {value.ctaText !== null && value.ctaText !== undefined && value.ctaText.trim() !== ''
            ? value.ctaText
            : 'Começar grátis'}
        </span>
      </article>
    </div>
  );
}
