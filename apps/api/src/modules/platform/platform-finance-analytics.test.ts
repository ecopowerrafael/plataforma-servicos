import { describe, expect, it } from 'vitest';

import {
  bucketOfDays,
  csvField,
  monthKey,
  monthlyCentsFrom,
  resolvePlanIdAt,
  startOfMonthUtc,
  toCsv,
  PlatformBillingService,
} from './platform-billing.service.js';

describe('financial helpers — pure math (no DB)', () => {
  it('converts contracted price to a monthly value per billing cycle', () => {
    expect(monthlyCentsFrom(30_000n, 'MONTHLY')).toBe(30_000n);
    expect(monthlyCentsFrom(90_000n, 'QUARTERLY')).toBe(30_000n);
    expect(monthlyCentsFrom(180_000n, 'SEMIANNUAL')).toBe(30_000n);
    expect(monthlyCentsFrom(360_000n, 'ANNUAL')).toBe(30_000n);
  });

  it('falls back to the raw amount for an unknown billing cycle instead of throwing', () => {
    expect(monthlyCentsFrom(1_000n, 'SOMETHING_UNKNOWN')).toBe(1_000n);
  });

  it('formats a UTC month key as YYYY-MM regardless of local timezone', () => {
    expect(monthKey(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01');
    expect(monthKey(new Date(Date.UTC(2025, 11, 31, 23, 59)))).toBe('2025-12');
  });

  it('computes the first day of a UTC month with an offset', () => {
    const base = new Date(Date.UTC(2026, 5, 20)); // 2026-06-20
    expect(startOfMonthUtc(base).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(startOfMonthUtc(base, 1).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(startOfMonthUtc(base, -1).toISOString()).toBe('2026-05-01T00:00:00.000Z');
    // Crossing a year boundary must not leak into the wrong year.
    expect(startOfMonthUtc(base, -11).toISOString()).toBe('2025-07-01T00:00:00.000Z');
  });

  it('classifies days-since-period-end into the four delinquency buckets, boundaries included', () => {
    expect(bucketOfDays(1)).toBe('1-7');
    expect(bucketOfDays(7)).toBe('1-7');
    expect(bucketOfDays(8)).toBe('8-15');
    expect(bucketOfDays(15)).toBe('8-15');
    expect(bucketOfDays(16)).toBe('16-30');
    expect(bucketOfDays(30)).toBe('16-30');
    expect(bucketOfDays(31)).toBe('30+');
    expect(bucketOfDays(0)).toBe('1-7');
  });

  it('escapes CSV fields containing the ";" separator, quotes and newlines per RFC 4180', () => {
    // The separator is ";" (not ","): pt-BR Windows/Excel uses "," as the
    // decimal separator, so its default CSV list separator is ";" — opening
    // a comma-delimited export by double-click there crams every row into
    // column A instead of splitting into columns. A plain comma is
    // therefore no longer a field that needs quoting.
    expect(csvField('Studio Bella Hair')).toBe('Studio Bella Hair');
    expect(csvField('Preço: R$ 30,00')).toBe('Preço: R$ 30,00');
    expect(csvField('Nome; com ponto e vírgula')).toBe('"Nome; com ponto e vírgula"');
    expect(csvField('Aspas "internas"')).toBe('"Aspas ""internas"""');
    expect(csvField('Linha 1\nLinha 2')).toBe('"Linha 1\nLinha 2"');
  });

  it('builds a ";"-separated CSV, prefixed with a UTF-8 BOM, with header row and escaped data rows', () => {
    const csv = toCsv(
      ['nome', 'valor'],
      [
        ['Estabelecimento A', '1000'],
        ['Estabelecimento; B', '2000'],
      ],
    );
    // The leading ﻿ is the UTF-8 BOM Excel needs to detect encoding on
    // a plain double-click-open, instead of guessing the system codepage
    // and mangling accented characters (e.g. "não" -> "nÃ£o").
    expect(csv).toBe('﻿nome;valor\nEstabelecimento A;1000\n"Estabelecimento; B";2000');
    expect(csv.codePointAt(0)).toBe(0xfeff);
  });
});

describe('resolvePlanIdAt — historical plan resolution from SubscriptionHistory events (no DB)', () => {
  // TenantSubscription.planId is mutated in place on every plan change
  // (changeSubscriptionPlan() in platform.service.ts updates the same row),
  // so a charge's `subscription.plan` relation always reflects the CURRENT
  // plan, never the plan in effect when the charge was actually paid. This
  // is the exact scenario the finance "receita por plano" audit flagged:
  // resolvePlanIdAt() must walk SubscriptionHistory.newPlanId events
  // instead, so a receipt stays attributed to the plan the tenant was on
  // at the time, even after a later upgrade/downgrade.
  const basicPlanId = 10n;
  const proPlanId = 20n;

  it('falls back to the current plan when there is no history at all', () => {
    const resolved = resolvePlanIdAt(undefined, new Date('2026-03-01T00:00:00Z'), proPlanId);
    expect(resolved).toBe(proPlanId);
  });

  it('resolves to the plan that was active at the charge time, not the plan active today', () => {
    const events = [
      { createdAt: new Date('2026-01-01T00:00:00Z'), newPlanId: basicPlanId }, // CREATED on Básico
      { createdAt: new Date('2026-03-15T00:00:00Z'), newPlanId: proPlanId }, // upgraded to Pro
    ];
    // A charge paid in February, before the upgrade, must still be
    // attributed to Básico — even though the subscription is on Pro today.
    const chargeBeforeUpgrade = new Date('2026-02-10T00:00:00Z');
    expect(resolvePlanIdAt(events, chargeBeforeUpgrade, proPlanId)).toBe(basicPlanId);

    // A charge paid after the upgrade is correctly attributed to Pro.
    const chargeAfterUpgrade = new Date('2026-04-01T00:00:00Z');
    expect(resolvePlanIdAt(events, chargeAfterUpgrade, proPlanId)).toBe(proPlanId);
  });

  it('treats a charge at the exact instant of a plan-change event as already on the new plan', () => {
    const changeAt = new Date('2026-03-15T00:00:00Z');
    const events = [
      { createdAt: new Date('2026-01-01T00:00:00Z'), newPlanId: basicPlanId },
      { createdAt: changeAt, newPlanId: proPlanId },
    ];
    expect(resolvePlanIdAt(events, changeAt, proPlanId)).toBe(proPlanId);
  });

  it('falls back to the current plan when the charge predates the earliest known history event', () => {
    const events = [{ createdAt: new Date('2026-06-01T00:00:00Z'), newPlanId: proPlanId }];
    const chargeBeforeAnyHistory = new Date('2026-01-01T00:00:00Z');
    // No reliable historical answer exists before genesis — falling back to
    // the current plan is a known, documented limitation, not silent data
    // loss: it only affects charges older than the subscription's own
    // SubscriptionHistory trail (which in practice always starts at
    // CREATED/TRIAL_STARTED, so this path is for malformed/legacy data).
    expect(resolvePlanIdAt(events, chargeBeforeAnyHistory, proPlanId)).toBe(proPlanId);
  });
});

describe('PlatformBillingService.financeDashboard — aggregation with a mocked Prisma client', () => {
  function buildService(overrides: {
    paidThisMonthCents?: bigint;
    paidLastMonthCents?: bigint;
    paymentsThisMonth?: number;
    pastDue?: number;
    suspended?: number;
    newThisMonth?: number;
    canceledThisMonth?: number;
    effectiveSubscriptions?: {
      priceCents: bigint;
      billingCycle: string;
      status: string;
      plan: { publicId: string; name: string };
    }[];
    paidChargesLast12Months?: { amountCents: bigint; paidAt: Date }[];
    paidChargesThisMonthByPlan?: {
      amountCents: bigint;
      createdAt: Date;
      subscriptionId: bigint;
      subscription: { planId: bigint };
    }[];
    recentCharges?: {
      subscriptionId: bigint;
      subscription: { planId: bigint; plan: { publicId: string; name: string } };
    }[];
    subscriptionHistory?: { subscriptionId: bigint; createdAt: Date; newPlanId: bigint }[];
    plans?: { id: bigint; publicId: string; name: string }[];
  }) {
    // financeDashboard() issues "this month" aggregate before "last month"
    // (fixed order inside its own Promise.all array), so a call counter
    // reliably tells them apart without needing to parse the where clause.
    let aggregateCallCount = 0;
    const mockClient = {
      platformSubscriptionCharge: {
        aggregate: async () => {
          aggregateCallCount += 1;
          const amount = aggregateCallCount === 1 ? (overrides.paidThisMonthCents ?? 0n) : (overrides.paidLastMonthCents ?? 0n);
          return { _sum: { amountCents: amount } };
        },
        count: async () => overrides.paymentsThisMonth ?? 0,
        findMany: async (args: { select?: { subscription?: unknown }; take?: number }) => {
          if (args.select && 'subscription' in (args.select ?? {})) return overrides.paidChargesThisMonthByPlan ?? [];
          if (args.take === 8) return overrides.recentCharges ?? [];
          return overrides.paidChargesLast12Months ?? [];
        },
      },
      tenantSubscription: {
        count: async ({ where }: { where: Record<string, unknown> }) => {
          if ('status' in where && where.status === 'PAST_DUE') return overrides.pastDue ?? 0;
          if ('status' in where && where.status === 'SUSPENDED') return overrides.suspended ?? 0;
          if ('createdAt' in where) return overrides.newThisMonth ?? 0;
          if ('canceledAt' in where) return overrides.canceledThisMonth ?? 0;
          return 0;
        },
        findMany: async () => overrides.effectiveSubscriptions ?? [],
      },
      subscriptionHistory: {
        findMany: async () => overrides.subscriptionHistory ?? [],
      },
      commercialPlan: {
        findMany: async () => overrides.plans ?? [],
      },
    };
    return new PlatformBillingService(mockClient as never, undefined as never, undefined);
  }

  it('returns null month-over-month change when last month received nothing (no division by zero)', async () => {
    const service = buildService({ paidThisMonthCents: 5_000n, paidLastMonthCents: 0n, effectiveSubscriptions: [] });
    const result = await service.financeDashboard();
    expect(result.receivedLastMonthCents).toBe('0');
    expect(result.monthOverMonthChangePercent).toBeNull();
  });

  it('computes month-over-month growth percentage correctly', async () => {
    // 15000 vs 10000 = +50.00%
    const service = buildService({ paidThisMonthCents: 15_000n, paidLastMonthCents: 10_000n, effectiveSubscriptions: [] });
    const result = await service.financeDashboard();
    expect(result.monthOverMonthChangePercent).toBe(50);
  });

  it('computes average ticket as null when there were no payments this month', async () => {
    const service = buildService({ paymentsThisMonth: 0, paidThisMonthCents: 0n, effectiveSubscriptions: [] });
    const result = await service.financeDashboard();
    expect(result.averageTicketCents).toBeNull();
  });

  it('computes average ticket as received / payment count', async () => {
    const service = buildService({ paymentsThisMonth: 4, paidThisMonthCents: 40_000n, effectiveSubscriptions: [] });
    const result = await service.financeDashboard();
    expect(result.averageTicketCents).toBe('10000');
  });

  it('computes contracted MRR from effective subscriptions regardless of status (TRIALING included)', async () => {
    const service = buildService({
      effectiveSubscriptions: [
        { priceCents: 30_000n, billingCycle: 'MONTHLY', status: 'ACTIVE', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
        { priceCents: 90_000n, billingCycle: 'QUARTERLY', status: 'TRIALING', plan: { publicId: '00000000-0000-4000-8000-000000000002', name: 'Pro' } },
      ],
    });
    const result = await service.financeDashboard();
    // 30000 (monthly) + 30000 (90000/3 quarterly-normalized) = 60000
    expect(result.mrrContractedCents).toBe('60000');
  });

  it('separates "active" count (status=ACTIVE only) from contracted MRR (any effective status) per plan', async () => {
    const service = buildService({
      effectiveSubscriptions: [
        { priceCents: 30_000n, billingCycle: 'MONTHLY', status: 'ACTIVE', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
        { priceCents: 30_000n, billingCycle: 'MONTHLY', status: 'TRIALING', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
      ],
    });
    const result = await service.financeDashboard();
    const plan = result.byPlan.find((entry) => entry.planPublicId === '00000000-0000-4000-8000-000000000001');
    expect(plan?.activeSubscriptions).toBe(1); // only the ACTIVE one counts as "ativas"
    expect(plan?.mrrContractedCents).toBe('60000'); // both count toward contracted MRR
  });

  it('splits mrrAtRiskCents out of mrrContractedCents for PAST_DUE/SUSPENDED, without removing them from the total', async () => {
    const service = buildService({
      effectiveSubscriptions: [
        { priceCents: 30_000n, billingCycle: 'MONTHLY', status: 'ACTIVE', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
        { priceCents: 20_000n, billingCycle: 'MONTHLY', status: 'PAST_DUE', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
        { priceCents: 10_000n, billingCycle: 'MONTHLY', status: 'SUSPENDED', plan: { publicId: '00000000-0000-4000-8000-000000000002', name: 'Pro' } },
      ],
    });
    const result = await service.financeDashboard();
    expect(result.mrrContractedCents).toBe('60000');
    expect(result.mrrAtRiskCents).toBe('30000');
  });

  it('reports mrrAtRiskCents as zero when no subscription is PAST_DUE or SUSPENDED', async () => {
    const service = buildService({
      effectiveSubscriptions: [
        { priceCents: 30_000n, billingCycle: 'MONTHLY', status: 'ACTIVE', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
        { priceCents: 30_000n, billingCycle: 'MONTHLY', status: 'TRIALING', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Essencial' } },
      ],
    });
    const result = await service.financeDashboard();
    expect(result.mrrAtRiskCents).toBe('0');
  });

  it('attributes "recebido por plano" to the plan in effect at charge time, not the tenant\'s current plan (post-upgrade)', async () => {
    // Tenant started on Básico (id 10), then upgraded to Pro (id 20) mid-month.
    // The subscription row itself was mutated in place — planId is now 20 —
    // but a charge paid BEFORE the upgrade must still count toward Básico.
    const basicPlanId = 10n;
    const proPlanId = 20n;
    const subscriptionId = 555n;
    const chargeBeforeUpgrade = new Date('2026-01-05T00:00:00Z');
    const service = buildService({
      paidChargesThisMonthByPlan: [
        {
          amountCents: 20_000n,
          createdAt: chargeBeforeUpgrade,
          subscriptionId,
          subscription: { planId: proPlanId }, // current plan is Pro today
        },
      ],
      subscriptionHistory: [
        { subscriptionId, createdAt: new Date('2026-01-01T00:00:00Z'), newPlanId: basicPlanId },
        { subscriptionId, createdAt: new Date('2026-01-20T00:00:00Z'), newPlanId: proPlanId },
      ],
      plans: [
        { id: basicPlanId, publicId: '00000000-0000-4000-8000-000000000001', name: 'Básico' },
        { id: proPlanId, publicId: '00000000-0000-4000-8000-000000000002', name: 'Pro' },
      ],
      effectiveSubscriptions: [
        { priceCents: 20_000n, billingCycle: 'MONTHLY', status: 'ACTIVE', plan: { publicId: '00000000-0000-4000-8000-000000000002', name: 'Pro' } },
      ],
    });
    const result = await service.financeDashboard();
    const basico = result.byPlan.find((entry) => entry.planPublicId === '00000000-0000-4000-8000-000000000001');
    const pro = result.byPlan.find((entry) => entry.planPublicId === '00000000-0000-4000-8000-000000000002');
    // Received this month is attributed to Básico (the plan at charge time)...
    expect(basico?.receivedThisMonthCents).toBe('20000');
    // ...even though Pro is the only plan with a currently-effective subscription.
    expect(pro?.receivedThisMonthCents).toBe('0');
    expect(pro?.activeSubscriptions).toBe(1);
    // Básico has zero active subscriptions today, but must still appear in
    // the table because it has historical receipts this month — dropping it
    // would silently hide real money received under that plan.
    expect(basico?.activeSubscriptions).toBe(0);
  });

  it('always returns exactly 12 months of receipts, zero-filled where no payment landed', async () => {
    const now = new Date();
    const thisMonthKey = monthKey(now);
    const service = buildService({
      paidChargesLast12Months: [{ amountCents: 12_345n, paidAt: now }],
    });
    const result = await service.financeDashboard();
    expect(result.monthlyReceipts).toHaveLength(12);
    const current = result.monthlyReceipts.find((entry) => entry.month === thisMonthKey);
    expect(current?.amountCents).toBe('12345');
    const zeroFilledCount = result.monthlyReceipts.filter((entry) => entry.amountCents === '0').length;
    expect(zeroFilledCount).toBe(11);
  });

  it('never labels contracted MRR as received, and vice-versa (schema field names stay distinct)', async () => {
    const service = buildService({
      paidThisMonthCents: 1_000n,
      effectiveSubscriptions: [
        { priceCents: 99_999n, billingCycle: 'MONTHLY', status: 'ACTIVE', plan: { publicId: '00000000-0000-4000-8000-000000000001', name: 'X' } },
      ],
    });
    const result = await service.financeDashboard();
    expect(result.receivedThisMonthCents).toBe('1000');
    expect(result.mrrContractedCents).toBe('99999');
    expect(result.receivedThisMonthCents).not.toBe(result.mrrContractedCents);
  });
});

describe('PlatformBillingService.delinquency — bucket/summary logic with a mocked Prisma client', () => {
  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 86_400_000);
  }

  function buildService(
    rows: {
      publicId: string;
      status: 'PAST_DUE' | 'SUSPENDED';
      priceCents: bigint;
      currency: string;
      currentPeriodEndsAt: Date;
      graceEndsAt: Date | null;
      tenant: { publicId: string; displayName: string };
      plan: { publicId: string; name: string };
    }[],
  ) {
    const mockClient = {
      tenantSubscription: { findMany: async () => rows },
    };
    return new PlatformBillingService(mockClient as never, undefined as never, undefined);
  }

  const tenant = { publicId: '00000000-0000-4000-8000-000000000010', displayName: 'Studio Bella Hair' };
  const plan = { publicId: '00000000-0000-4000-8000-000000000020', name: 'Essencial' };

  it('separates contracted value by status (PAST_DUE vs SUSPENDED) without mixing the two totals', async () => {
    const service = buildService([
      { publicId: '00000000-0000-4000-8000-000000000030', status: 'PAST_DUE', priceCents: 10_000n, currency: 'BRL', currentPeriodEndsAt: daysAgo(3), graceEndsAt: null, tenant, plan },
      { publicId: '00000000-0000-4000-8000-000000000031', status: 'SUSPENDED', priceCents: 25_000n, currency: 'BRL', currentPeriodEndsAt: daysAgo(40), graceEndsAt: null, tenant, plan },
    ]);
    const result = await service.delinquency({ page: 1, limit: 20, format: 'json' });
    expect(result.summary.pastDueCount).toBe(1);
    expect(result.summary.suspendedCount).toBe(1);
    expect(result.summary.pastDueContractedCents).toBe('10000');
    expect(result.summary.suspendedContractedCents).toBe('25000');
  });

  it('places each subscription in exactly one age bucket based on days since period end', async () => {
    const service = buildService([
      { publicId: '00000000-0000-4000-8000-000000000030', status: 'PAST_DUE', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(3), graceEndsAt: null, tenant, plan },
      { publicId: '00000000-0000-4000-8000-000000000031', status: 'PAST_DUE', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(10), graceEndsAt: null, tenant, plan },
      { publicId: '00000000-0000-4000-8000-000000000032', status: 'PAST_DUE', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(20), graceEndsAt: null, tenant, plan },
      { publicId: '00000000-0000-4000-8000-000000000033', status: 'SUSPENDED', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(45), graceEndsAt: null, tenant, plan },
    ]);
    const result = await service.delinquency({ page: 1, limit: 20, format: 'json' });
    expect(result.summary.buckets).toEqual({ d1_7: 1, d8_15: 1, d16_30: 1, d30Plus: 1 });
  });

  it('filters items by bucket while keeping the summary reflecting the full unfiltered set', async () => {
    const service = buildService([
      { publicId: '00000000-0000-4000-8000-000000000030', status: 'PAST_DUE', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(3), graceEndsAt: null, tenant, plan },
      { publicId: '00000000-0000-4000-8000-000000000031', status: 'SUSPENDED', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(45), graceEndsAt: null, tenant, plan },
    ]);
    const result = await service.delinquency({ page: 1, limit: 20, bucket: '30+', format: 'json' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe('SUSPENDED');
    // Summary counts both rows even though only one matches the bucket filter.
    expect(result.summary.pastDueCount).toBe(1);
    expect(result.summary.suspendedCount).toBe(1);
  });

  it('never calls a subscription in arrears a "fatura vencida" — status stays PAST_DUE/SUSPENDED verbatim', async () => {
    const service = buildService([
      { publicId: '00000000-0000-4000-8000-000000000030', status: 'PAST_DUE', priceCents: 1n, currency: 'BRL', currentPeriodEndsAt: daysAgo(1), graceEndsAt: daysAgo(-5), tenant, plan },
    ]);
    const result = await service.delinquency({ page: 1, limit: 20, format: 'json' });
    expect(result.items[0]?.status).toBe('PAST_DUE');
    expect(Object.values(result.items[0] ?? {})).not.toContain('fatura vencida');
  });
});
