import { describe, expect, it } from 'vitest';

import {
  annualSavingsCents,
  brazilianMoneyToCents,
  centsToBrazilianMoney,
} from '../../web/src/marketing/pricing.js';

describe('apresentação comercial de preços', () => {
  it('converte 59,90 para 5990 e devolve 5990 como 59,90 na edição', () => {
    expect(brazilianMoneyToCents('59,90')).toBe(5990);
    expect(centsToBrazilianMoney(5990)).toBe('59,90');
  });

  it('calcula a economia anual a partir dos dois preços do mesmo plano', () => {
    expect(annualSavingsCents('5990', '59900')).toBe(11980);
  });
});
