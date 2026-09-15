import { describe, expect, it } from 'vitest';

import { validatePaymentOrigin } from './payment-origin-validator.js';

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? null;
  }
}

describe('validatePaymentOrigin', () => {
  it('APPOINTMENT exige appointmentId', () => {
    expect(codeOf(() => validatePaymentOrigin('APPOINTMENT', null, null))).toBe('PAYMENT_ORIGIN_APPOINTMENT_REQUIRES_ID');
  });

  it('APPOINTMENT proíbe membershipChargeId', () => {
    expect(codeOf(() => validatePaymentOrigin('APPOINTMENT', 1n, 2n))).toBe('PAYMENT_ORIGIN_APPOINTMENT_FORBIDS_MEMBERSHIP');
  });

  it('APPOINTMENT proíbe debtId', () => {
    expect(codeOf(() => validatePaymentOrigin('APPOINTMENT', 1n, null, 3n))).toBe('PAYMENT_ORIGIN_APPOINTMENT_FORBIDS_DEBT');
  });

  it('MEMBERSHIP_CHARGE exige membershipChargeId', () => {
    expect(codeOf(() => validatePaymentOrigin('MEMBERSHIP_CHARGE', null, null))).toBe('PAYMENT_ORIGIN_MEMBERSHIP_REQUIRES_ID');
  });

  it('MEMBERSHIP_CHARGE proíbe debtId', () => {
    expect(codeOf(() => validatePaymentOrigin('MEMBERSHIP_CHARGE', null, 2n, 3n))).toBe('PAYMENT_ORIGIN_MEMBERSHIP_FORBIDS_DEBT');
  });

  it('DEBT exige debtId', () => {
    expect(codeOf(() => validatePaymentOrigin('DEBT', null, null, null))).toBe('PAYMENT_ORIGIN_DEBT_REQUIRES_ID');
  });

  it('DEBT proíbe appointmentId', () => {
    expect(codeOf(() => validatePaymentOrigin('DEBT', 1n, null, 3n))).toBe('PAYMENT_ORIGIN_DEBT_FORBIDS_APPOINTMENT');
  });

  it('DEBT proíbe membershipChargeId', () => {
    expect(codeOf(() => validatePaymentOrigin('DEBT', null, 2n, 3n))).toBe('PAYMENT_ORIGIN_DEBT_FORBIDS_MEMBERSHIP');
  });

  it('combinações válidas não lançam', () => {
    expect(codeOf(() => validatePaymentOrigin('APPOINTMENT', 1n, null))).toBeNull();
    expect(codeOf(() => validatePaymentOrigin('MEMBERSHIP_CHARGE', null, 2n))).toBeNull();
    expect(codeOf(() => validatePaymentOrigin('DEBT', null, null, 3n))).toBeNull();
  });

  it('debtId é opcional e default para null (chamadas existentes continuam funcionando)', () => {
    expect(codeOf(() => validatePaymentOrigin('APPOINTMENT', 1n, null))).toBeNull();
  });
});
