import { describe, expect, it, vi } from 'vitest';

import { PlatformService } from '../src/modules/platform/platform.service.js';

const planPublicId = '11111111-1111-4111-8111-111111111111';
const tenantPublicId = '22222222-2222-4222-8222-222222222222';
const actor = {
  administrator: { id: 90n, publicId: '33333333-3333-4333-8333-333333333333', status: 'ACTIVE' as const },
  user: { id: 91n, publicId: '44444444-4444-4444-8444-444444444444', email: 'admin@test.invalid', status: 'ACTIVE' as const },
  permissions: [],
};
const metadata = { ipAddress: null, userAgent: null };
type SubscriptionCreateData = Record<string, unknown> & { startsAt: Date };

function fixture() {
  const plan = {
    id: 7n,
    publicId: planPublicId,
    code: 'PRO',
    name: 'Profissional',
    status: 'ACTIVE' as const,
    billingCycle: 'MONTHLY' as const,
    priceCents: 5990n,
    monthlyPriceCents: 5990n,
    annualPriceCents: 59900n,
    currency: 'BRL',
    trialDays: null,
  };
  const tenant = { id: 8n, publicId: tenantPublicId };
  let createdData: Record<string, unknown> | undefined;
  const transaction = {
    tenant: { findUnique: vi.fn().mockResolvedValue(tenant) },
    commercialPlan: { findUnique: vi.fn().mockResolvedValue(plan) },
    tenantSubscription: {
      create: vi.fn().mockImplementation(({ data }: { data: SubscriptionCreateData }) => {
        createdData = data;
        const now = data.startsAt;
        return {
          ...data,
          publicId: '55555555-5555-4555-8555-555555555555',
          trialEndsAt: null,
          canceledAt: null,
          suspendedAt: null,
          endsAt: null,
          createdAt: now,
          updatedAt: now,
          tenant,
          plan,
        };
      }),
    },
    subscriptionHistory: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const client = {
    $transaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
  };
  const service = Object.create(PlatformService.prototype) as PlatformService;
  Object.assign(service as object, {
    client,
    commercialPolicyService: { getOrCreateRaw: vi.fn().mockResolvedValue({ defaultTrialDays: 0 }) },
  });
  return { service, plan, getCreatedData: () => createdData };
}

describe('preço contratado da assinatura', () => {
  it('cria assinaturas mensal e anual do mesmo plano com o preço contratado correspondente', async () => {
    const monthly = fixture();
    const monthlyResult = await monthly.service.createSubscription(
      tenantPublicId,
      { planPublicId, billingCycle: 'MONTHLY', trial: false, reason: 'Criação mensal.' },
      actor,
      metadata,
    );
    expect(monthlyResult.subscription.billingCycle).toBe('MONTHLY');
    expect(monthlyResult.subscription.priceCents).toBe('5990');
    expect(monthly.getCreatedData()?.priceCents).toBe(5990n);

    const annual = fixture();
    const annualResult = await annual.service.createSubscription(
      tenantPublicId,
      { planPublicId, billingCycle: 'ANNUAL', trial: false, reason: 'Criação anual.' },
      actor,
      metadata,
    );
    expect(annualResult.subscription.billingCycle).toBe('ANNUAL');
    expect(annualResult.subscription.priceCents).toBe('59900');
    expect(annual.getCreatedData()?.priceCents).toBe(59900n);
  });

  it('mantém o snapshot contratado quando o preço atual do plano muda depois da criação', async () => {
    const value = fixture();
    await value.service.createSubscription(
      tenantPublicId,
      { planPublicId, billingCycle: 'MONTHLY', trial: false, reason: 'Snapshot inicial.' },
      actor,
      metadata,
    );
    const contracted = value.getCreatedData()?.priceCents;
    value.plan.monthlyPriceCents = 7990n;
    expect(contracted).toBe(5990n);
    expect(value.plan.monthlyPriceCents).toBe(7990n);
  });
});
