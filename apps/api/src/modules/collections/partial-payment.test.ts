import { describe, expect, it } from 'vitest';

import { calculatePartialPaymentCents, MIN_PARTIAL_PAYMENT_CENTS } from './partial-payment.js';

describe('calculatePartialPaymentCents', () => {
  it('10000,20 → 2000', () => {
    expect(calculatePartialPaymentCents(10000n, 20)).toBe(2000n);
  });

  it('10000,30 → 3000', () => {
    expect(calculatePartialPaymentCents(10000n, 30)).toBe(3000n);
  });

  it('10000,50 → 5000', () => {
    expect(calculatePartialPaymentCents(10000n, 50)).toBe(5000n);
  });

  it('5001,50 → arredondamento correto (round half up)', () => {
    // 5001 * 0.5 = 2500.5 → 2501
    expect(calculatePartialPaymentCents(5001n, 50)).toBe(2501n);
  });

  it('usa o saldo atual, não o original — 100% do saldo restante depois de um pagamento anterior', () => {
    const remaining = 10000n - 5000n; // saldo já reduzido por um pagamento anterior
    expect(calculatePartialPaymentCents(remaining, 50)).toBe(2500n);
  });

  it('saldo muito pequeno gera 0 (sinaliza "não gerar pagamento de 0 centavos")', () => {
    expect(calculatePartialPaymentCents(1n, 20)).toBe(0n);
  });

  it('saldo zero ou negativo retorna 0', () => {
    expect(calculatePartialPaymentCents(0n, 50)).toBe(0n);
    expect(calculatePartialPaymentCents(-100n, 50)).toBe(0n);
  });

  it('percentual inválido (<=0, >100, NaN) retorna 0', () => {
    expect(calculatePartialPaymentCents(10000n, 0)).toBe(0n);
    expect(calculatePartialPaymentCents(10000n, -10)).toBe(0n);
    expect(calculatePartialPaymentCents(10000n, 101)).toBe(0n);
    expect(calculatePartialPaymentCents(10000n, Number.NaN)).toBe(0n);
  });

  it('resultado nunca é maior que o saldo (percentual 100%)', () => {
    expect(calculatePartialPaymentCents(9999n, 100)).toBe(9999n);
  });

  it('MIN_PARTIAL_PAYMENT_CENTS é R$ 5,00', () => {
    expect(MIN_PARTIAL_PAYMENT_CENTS).toBe(500n);
  });
});
