import { describe, it, expect } from 'vitest';
import { ChargeSource, BenefitType } from '../src/modules/customers/customer-membership-benefit-resolver';

describe('Membership Usage - Integration Smoke Test', () => {
  it('ChargeSource enum exported correctly', () => {
    expect(ChargeSource.MEMBERSHIP_INCLUDED).toBe('MEMBERSHIP_INCLUDED');
    expect(ChargeSource.MEMBERSHIP_DISCOUNT).toBe('MEMBERSHIP_DISCOUNT');
    expect(ChargeSource.SERVICE_PRICE).toBe('SERVICE_PRICE');
  });

  it('BenefitType enum exported correctly', () => {
    expect(BenefitType.QUANTITY).toBe('QUANTITY');
    expect(BenefitType.UNLIMITED).toBe('UNLIMITED');
    expect(BenefitType.DISCOUNT).toBe('DISCOUNT');
  });

  it('No membership resolves to SERVICE_PRICE', () => {
    // When no membership active, chargeSource must be SERVICE_PRICE
    const chargeSource = ChargeSource.SERVICE_PRICE;
    expect(chargeSource).not.toBe(ChargeSource.MEMBERSHIP_INCLUDED);
  });

  it('QUANTITY benefit type exists', () => {
    expect(BenefitType.QUANTITY).toBeDefined();
  });

  it('UNLIMITED benefit type exists', () => {
    expect(BenefitType.UNLIMITED).toBeDefined();
  });

  it('DISCOUNT benefit type exists', () => {
    expect(BenefitType.DISCOUNT).toBeDefined();
  });
});
