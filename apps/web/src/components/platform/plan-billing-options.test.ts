/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  deriveLegacyBillingFields,
  normalizeBillingOptions,
  setBillingOptionEnabled,
  setRecommendedBillingOption,
  type PlanBillingOptions,
} from './plan-billing-options.js';

const options = normalizeBillingOptions([]);

function enabledCycles(value: PlanBillingOptions) {
  return value.filter((option) => option.active).map((option) => option.billingCycle);
}

describe('periodicidades do plano', () => {
  it('mantém Mensal e Anual ativos simultaneamente', () => {
    const monthly = setBillingOptionEnabled(options, 'MONTHLY', true);
    const annual = setBillingOptionEnabled(monthly, 'ANNUAL', true);

    expect(enabledCycles(annual)).toEqual(['MONTHLY', 'ANNUAL']);
  });

  it('ativar Trimestral não desativa Mensal', () => {
    const monthly = setBillingOptionEnabled(options, 'MONTHLY', true);
    const quarterly = setBillingOptionEnabled(monthly, 'QUARTERLY', true);

    expect(enabledCycles(quarterly)).toEqual(['MONTHLY', 'QUARTERLY']);
  });

  it('desativar Semestral não altera os demais ciclos', () => {
    const allEnabled = options.map((option) => ({ ...option, active: true }));
    const result = setBillingOptionEnabled(allEnabled, 'SEMIANNUAL', false);

    expect(enabledCycles(result)).toEqual(['MONTHLY', 'QUARTERLY', 'ANNUAL']);
  });

  it('mantém exclusividade somente na recomendação', () => {
    const allEnabled = options.map((option) => ({ ...option, active: true }));
    const monthly = setRecommendedBillingOption(allEnabled, 'MONTHLY', true);
    const annual = setRecommendedBillingOption(monthly, 'ANNUAL', true);

    expect(enabledCycles(annual)).toHaveLength(4);
    expect(
      annual.filter((option) => option.recommended).map((option) => option.billingCycle),
    ).toEqual(['ANNUAL']);
  });

  it('preserva preços independentes ao alterar estados', () => {
    const priced = options.map((option, index) => ({ ...option, priceCents: (index + 1) * 1000 }));
    const result = setBillingOptionEnabled(priced, 'QUARTERLY', true);

    expect(result.map((option) => option.priceCents)).toEqual([1000, 2000, 3000, 4000]);
  });

  it('deriva compatibilidade legada sem remover opções do payload de salvamento', () => {
    const priced = options.map((option, index) => ({
      ...option,
      active: true,
      recommended: option.billingCycle === 'ANNUAL',
      priceCents: (index + 1) * 1000,
    }));

    const legacy = deriveLegacyBillingFields(priced, {
      billingCycle: 'MONTHLY',
      priceCents: 0,
    });

    expect(priced).toHaveLength(4);
    expect(legacy).toEqual({
      billingCycle: 'ANNUAL',
      priceCents: 4000,
      monthlyPriceCents: 1000,
      annualPriceCents: 4000,
    });
  });
});

describe('estrutura visual da edição de plano', () => {
  const formSource = readFileSync(new URL('./PlanEditForm.tsx', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../../app-design-system.css', import.meta.url), 'utf8');

  it('não usa checkbox nativo nem mostra escapes de acentuação', () => {
    expect(formSource).not.toContain('type="checkbox"');
    expect(formSource).not.toMatch(/\\u00(?:e7|e9|e3)/u);
  });

  it('mantém cards em 2x2 e quebra para uma coluna no mobile', () => {
    expect(cssSource).toContain('.app-shell .plan-billing-options');
    expect(cssSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(cssSource).toContain('.app-shell .plan-editor-grid');
    expect(cssSource).toContain('grid-template-columns: 1fr;');
  });
});
