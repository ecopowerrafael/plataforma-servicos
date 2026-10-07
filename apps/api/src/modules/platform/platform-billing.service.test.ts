import { describe, expect, it, vi } from 'vitest';

import { PlatformBillingService } from './platform-billing.service.js';

const subscription = {
  id: 1n,
  publicId: '11111111-1111-4111-8111-111111111111',
  tenantId: 2n,
  status: 'ACTIVE',
  currentPeriodStartsAt: new Date('2026-10-01T00:00:00.000Z'),
  currentPeriodEndsAt: new Date('2026-11-01T00:00:00.000Z'),
  trialEndsAt: null,
  graceEndsAt: null,
  planId: 3n,
  billingCycle: 'MONTHLY',
  priceCents: 4900n,
  currency: 'BRL',
  plan: {
    name: 'Plano Essencial',
    billingOptions: [{ billingCycle: 'MONTHLY', active: true, priceCents: 4900n }],
  },
};

const config = { active: true, credentialsCiphertext: 'encrypted', environment: 'SANDBOX' };

function charge(publicId: string, idempotencyKey: string, overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(publicId.replaceAll('-', '').slice(0, 8) || '1'),
    publicId,
    subscriptionId: subscription.id,
    provider: 'pix-local',
    environment: 'SANDBOX',
    externalId: 'gateway-charge-1',
    status: 'PENDING',
    amountCents: 4900n,
    currency: 'BRL',
    idempotencyKey,
    pixCopyPaste: null,
    paidAt: null,
    createdAt: new Date('2026-10-07T12:00:00.000Z'),
    subscription: { publicId: subscription.publicId },
    ...overrides,
  };
}

function billingClient(existing: ReturnType<typeof charge> | null = null) {
  const created = charge(
    '22222222-2222-4222-8222-222222222222',
    'platform:22222222-2222-4222-8222-222222222222',
    { externalId: null },
  );
  const updated = charge(created.publicId, created.idempotencyKey);
  return {
    tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
    platformPaymentConfig: { findUnique: vi.fn().mockResolvedValue(config) },
    platformSubscriptionCharge: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue(created),
      update: vi.fn().mockResolvedValue(updated),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function service(
  client: ReturnType<typeof billingClient>,
  createCharge = vi.fn().mockResolvedValue({
    externalId: 'gateway-charge-1',
    status: 'PENDING',
    pixCopyPaste: undefined,
  }),
) {
  return {
    service: new PlatformBillingService(
      client as never,
      { get: vi.fn().mockReturnValue({ createCharge }) } as never,
      { decrypt: vi.fn().mockReturnValue({ key: 'test' }) } as never,
    ),
    createCharge,
  };
}

describe('PlatformBillingService charge idempotency', () => {
  it('reuses the persisted intent and sends the same key on retry', async () => {
    const client = billingClient();
    const persisted = charge(
      '22222222-2222-4222-8222-222222222222',
      'platform:22222222-2222-4222-8222-222222222222',
      { externalId: null },
    );
    client.platformSubscriptionCharge.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persisted);
    const { service: billing, createCharge } = service(client);

    await billing.createCharge(subscription.publicId, 'pix-local');
    await billing.createCharge(subscription.publicId, 'pix-local');

    expect(createCharge).toHaveBeenCalledTimes(2);
    expect(createCharge.mock.calls[0]?.[2]?.idempotencyKey).toBe(
      'platform:22222222-2222-4222-8222-222222222222',
    );
    expect(createCharge.mock.calls[1]?.[2]?.idempotencyKey).toBe(
      'platform:22222222-2222-4222-8222-222222222222',
    );
  });

  it('uses a different key for a new logical charge', async () => {
    const client = billingClient();
    const first = charge(
      '22222222-2222-4222-8222-222222222222',
      'platform:22222222-2222-4222-8222-222222222222',
      { externalId: null },
    );
    const second = charge(
      '33333333-3333-4333-8333-333333333333',
      'platform:33333333-3333-4333-8333-333333333333',
      { externalId: null },
    );
    client.platformSubscriptionCharge.findFirst.mockResolvedValue(null);
    client.platformSubscriptionCharge.create
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { service: billing, createCharge } = service(client);

    await billing.createCharge(subscription.publicId, 'pix-local');
    await billing.createCharge(subscription.publicId, 'pix-local');

    expect(createCharge).toHaveBeenCalledTimes(2);
    expect(createCharge.mock.calls[0]?.[2]?.idempotencyKey).not.toBe(
      createCharge.mock.calls[1]?.[2]?.idempotencyKey,
    );
  });
});

describe('PlatformBillingService payment confirmation locking', () => {
  it('locks the charge row before checking PAID', async () => {
    const chargeRow = charge(
      '44444444-4444-4444-8444-444444444444',
      'platform:44444444-4444-4444-8444-444444444444',
      { externalId: 'gateway-charge-4' },
    );
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: chargeRow.id }]),
      platformSubscriptionCharge: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(chargeRow),
        update: vi.fn(),
      },
      platformLedgerEntry: { findFirst: vi.fn().mockResolvedValue({ id: 10n }), create: vi.fn() },
      tenantSubscription: { update: vi.fn() },
      subscriptionHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const client = billingClient();
    client.platformSubscriptionCharge.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue(chargeRow) as never;
    client.$transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ) as never;
    const { service: billing } = service(client);

    await (
      billing as unknown as {
        markPaid: (
          id: bigint,
          actor: { userId: bigint | null; sessionId: bigint | null },
          reason: string,
        ) => Promise<void>;
      }
    ).markPaid(chargeRow.id, { userId: null, sessionId: null }, 'teste');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.platformSubscriptionCharge.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
  });
});
