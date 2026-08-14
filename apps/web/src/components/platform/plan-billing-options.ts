import type { PlanFormInput } from './PlanEditForm.js';

export const billingCycles = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;
export type PlanBillingCycle = (typeof billingCycles)[number];
export type PlanBillingOptions = NonNullable<PlanFormInput['billingOptions']>;
export type PlanBillingOption = PlanBillingOptions[number];

export const billingCycleLabels: Record<PlanBillingCycle, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

export function normalizeBillingOptions(options: PlanBillingOptions) {
  return billingCycles.map((billingCycle, sortOrder) => {
    const option = options.find((item) => item.billingCycle === billingCycle);
    return (
      option ?? {
        billingCycle,
        priceCents: 0,
        active: false,
        recommended: false,
        sortOrder,
      }
    );
  });
}

export function setBillingOptionEnabled(
  options: PlanBillingOptions,
  billingCycle: PlanBillingCycle,
  active: boolean,
) {
  return options.map((option) =>
    option.billingCycle === billingCycle ? { ...option, active } : option,
  );
}

export function setRecommendedBillingOption(
  options: PlanBillingOptions,
  billingCycle: PlanBillingCycle,
  recommended: boolean,
) {
  return options.map((option) => ({
    ...option,
    recommended: recommended ? option.billingCycle === billingCycle : false,
  }));
}

export function deriveLegacyBillingFields(
  options: readonly {
    billingCycle: PlanBillingCycle;
    priceCents: number;
    active: boolean;
    recommended: boolean;
  }[],
  fallback: { billingCycle: PlanBillingCycle | 'CUSTOM'; priceCents: number },
) {
  const active = options.filter((option) => option.active);
  const primary = active.find((option) => option.recommended) ?? active[0];
  const monthly = options.find((option) => option.billingCycle === 'MONTHLY');
  const annual = options.find((option) => option.billingCycle === 'ANNUAL');
  return {
    billingCycle: primary?.billingCycle ?? fallback.billingCycle,
    priceCents: primary?.priceCents ?? fallback.priceCents,
    monthlyPriceCents: monthly?.priceCents,
    annualPriceCents: annual?.priceCents,
  };
}
