import {
  CreateCustomerMembershipBenefitRequestSchema,
  capabilitiesFor,
  hasCapability,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const servicePublicId = '11111111-1111-4111-8111-111111111111';

describe('customer membership plan contract', () => {
  it.each([
    {
      servicePublicId,
      type: 'QUANTITY',
      quantityPerCycle: 4,
      discountPercent: null,
    },
    {
      servicePublicId,
      type: 'UNLIMITED',
      quantityPerCycle: null,
      discountPercent: null,
    },
    {
      servicePublicId,
      type: 'DISCOUNT',
      quantityPerCycle: null,
      discountPercent: 10,
    },
  ])('accepts the valid $type invariant', (input) => {
    expect(CreateCustomerMembershipBenefitRequestSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { type: 'QUANTITY', quantityPerCycle: 0, discountPercent: null },
    { type: 'QUANTITY', quantityPerCycle: 2, discountPercent: 10 },
    { type: 'UNLIMITED', quantityPerCycle: 1, discountPercent: null },
    { type: 'UNLIMITED', quantityPerCycle: null, discountPercent: 10 },
    { type: 'DISCOUNT', quantityPerCycle: null, discountPercent: 0 },
    { type: 'DISCOUNT', quantityPerCycle: 1, discountPercent: 10 },
    { type: 'DISCOUNT', quantityPerCycle: null, discountPercent: 101 },
  ])('rejects an invalid benefit invariant: $type', (input) => {
    expect(
      CreateCustomerMembershipBenefitRequestSchema.safeParse({
        servicePublicId,
        ...input,
      }).success,
    ).toBe(false);
  });

  it('keeps membership capabilities isolated from SERVICE_PRICING tenants', () => {
    expect(hasCapability('SERVICE_PRICING', 'memberships.manage')).toBe(false);
    expect(hasCapability('MEMBERSHIP', 'memberships.manage')).toBe(true);
    expect(capabilitiesFor('MEMBERSHIP')).toContain('memberships.benefits');
  });
});
