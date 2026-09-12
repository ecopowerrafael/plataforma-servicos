import { describe, expect, it, vi } from 'vitest';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { NotificationCampaignService } from './notification-campaign.service.js';
import { notificationRoutes } from './notification.routes.js';

const tenantId = 9n;
const key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const personId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function build(people: Array<{ accepts?: boolean; subscriptions?: string[] }>) {
  let next = 1n;
  const campaigns: any[] = [];
  const recipients: any[] = [];
  const enqueue = vi.fn().mockResolvedValue(undefined);
  let activeLogs = 0;
  const customerById = new Map(people.map((person, index) => [personId(index), {
    phone: '11999999999', whatsapp: null, acceptsCommunications: person.accepts ?? true,
    pushSubscriptions: (person.subscriptions ?? []).map((publicId) => ({ publicId })),
  }]));
  const client: any = {
    customer: {
      findMany: vi.fn().mockResolvedValue([...customerById.keys()].map((publicId) => ({ publicId }))),
      findFirst: vi.fn().mockImplementation(({ where }: any) => customerById.get(where.publicId) ?? null),
    },
    professional: { findMany: vi.fn(), findFirst: vi.fn() },
    tenantWhatsAppConfig: { findUnique: vi.fn().mockResolvedValue({ active: true }) },
    notificationCampaign: {
      findFirst: vi.fn().mockImplementation(({ where }: any) => campaigns.find((item) => item.tenantId === where.tenantId && item.idempotencyKey === where.idempotencyKey) ?? campaigns.find((item) => ['QUEUED', 'PROCESSING'].includes(item.status)) ?? null),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const { recipients: snapshot, ...campaignData } = data;
        const item = { ...campaignData, id: next++, status: 'QUEUED', eligibleCount: 0, skippedCount: 0, deliveryCount: 0, materializedCount: 0, startedAt: null, createdAt: new Date(), updatedAt: new Date() };
        campaigns.push(item);
        recipients.push(...snapshot.createMany.data.map((row: any) => ({ ...row, campaignId: item.id, id: next++, status: 'PENDING', createdAt: new Date(), updatedAt: new Date() })));
        return item;
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const item = campaigns.find((candidate) => candidate.id === where.id)!;
        for (const [field, value] of Object.entries(data)) {
          item[field] = typeof value === 'object' && value !== null && 'increment' in value
            ? item[field] + Number((value as { increment: number }).increment)
            : value;
        }
        return item;
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
        const item = campaigns.find((candidate) => candidate.id === where.id && candidate.status === where.status && candidate.updatedAt === where.updatedAt);
        if (!item) return { count: 0 };
        Object.assign(item, data, { updatedAt: new Date() });
        return { count: 1 };
      }),
      findMany: vi.fn().mockImplementation(({ where }: any = {}) => campaigns.filter((item) => !where?.tenantId || item.tenantId === where.tenantId)),
    },
    notificationCampaignRecipient: {
      createMany: vi.fn().mockImplementation(({ data }: any) => { recipients.push(...data.map((item: any) => ({ ...item, id: next++, status: 'PENDING', createdAt: new Date(), updatedAt: new Date() }))); return { count: data.length }; }),
      findMany: vi.fn().mockImplementation(({ where, take, select }: any) => {
        const rows = recipients.filter((item) =>
          item.campaignId === where.campaignId &&
          (!where.OR
            ? (!where.status || item.status === where.status)
            : where.OR.some((term: any) =>
                term.status === item.status &&
                (term.updatedAt === undefined || item.updatedAt <= term.updatedAt.lte),
              )),
        );
        const result = take === undefined ? rows : rows.slice(0, take);
        return select ? result.map((item) => ({ publicId: item.publicId })) : result.map((item) => ({ ...item }));
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: any) => {
        const item = recipients.find((candidate) => candidate.id === where.id && candidate.status === where.status && candidate.updatedAt === where.updatedAt);
        if (!item) return { count: 0 };
        Object.assign(item, data, { updatedAt: new Date() });
        return { count: 1 };
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => { const item = recipients.find((candidate) => candidate.id === where.id)!; Object.assign(item, data, { updatedAt: new Date() }); return item; }),
      count: vi.fn().mockImplementation(({ where }: any) => recipients.filter((item) => item.campaignId === where.campaignId && (typeof where.status === 'string' ? item.status === where.status : where.status.in.includes(item.status))).length),
    },
    notificationLog: { groupBy: vi.fn().mockResolvedValue([]), count: vi.fn().mockImplementation(() => activeLogs) },
  };
  return { client, service: new NotificationCampaignService(client, { enqueue } as never, { assertFeatureEnabledForTenant: vi.fn() }), enqueue, campaigns, recipients, setActiveLogs: (value: number) => { activeLogs = value; } };
}

async function createHttpApp(service: NotificationCampaignService) {
  const base = Fastify({ logger: false });
  const app = base.withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  const authService = {
    authenticate: vi.fn().mockResolvedValue({ user: { id: 1n }, session: { id: 1n } }),
    resolveTenant: vi.fn().mockResolvedValue({ id: tenantId, publicId: '99999999-9999-4999-8999-999999999999', membership: { permissions: ['automation.manage', 'notification.read'] } }),
    requirePermission: vi.fn(),
  };
  await app.register(notificationRoutes, {
    service: { list: vi.fn(), retry: vi.fn() } as never,
    campaigns: service,
    authService: authService as never,
    cookieName: 'ps_session',
  });
  return base;
}

describe('campaign snapshot → batches → completion', () => {
  it('keeps the POST queued, then materializes a first batch and resumes safely', async () => {
    const { service, enqueue, campaigns, recipients } = build(Array.from({ length: 500 }, () => ({})));
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: true });
    expect(enqueue).not.toHaveBeenCalled();
    await service.materializePending();
    expect(enqueue).toHaveBeenCalledTimes(25);
    expect(recipients.filter((item) => item.status === 'MATERIALIZED')).toHaveLength(25);
    await service.materializePending();
    expect(enqueue).toHaveBeenCalledTimes(50);
    expect(campaigns[0].status).toBe('PROCESSING');
  });

  it('persists skipped people separately from push deliveries', async () => {
    const { service, enqueue, campaigns } = build([{ accepts: false }, { subscriptions: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'] }]);
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'PUSH', title: 'Aviso', message: 'Olá', whatsappRiskAcknowledged: false });
    await service.materializePending(25);
    expect(campaigns[0]).toMatchObject({ recipientCount: 2, eligibleCount: 1, skippedCount: 1, deliveryCount: 3, status: 'COMPLETED' });
    expect(enqueue).toHaveBeenCalledTimes(3);
  });

  it('keeps a 10-person WhatsApp campaign coherent with seven eligible and three skipped', async () => {
    const { service, campaigns, enqueue } = build([
      ...Array.from({ length: 7 }, () => ({})),
      ...Array.from({ length: 3 }, () => ({ accepts: false })),
    ]);
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false });
    await service.materializePending(25);
    expect(campaigns[0]).toMatchObject({ recipientCount: 10, eligibleCount: 7, skippedCount: 3, deliveryCount: 7 });
    expect(enqueue).toHaveBeenCalledTimes(7);
  });

  it('processes all 500 recipients in batches and completes after the final batch', async () => {
    const { service, enqueue, campaigns } = build(Array.from({ length: 500 }, () => ({})));
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: true });
    for (let batch = 0; batch < 20; batch += 1) await service.materializePending();
    expect(enqueue).toHaveBeenCalledTimes(500);
    expect(campaigns[0]).toMatchObject({ materializedCount: 500, deliveryCount: 500, status: 'COMPLETED' });
  });

  it('waits for deliveries but completes when only failed deliveries remain', async () => {
    const { service, campaigns, setActiveLogs } = build([{}]);
    setActiveLogs(1);
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false });
    await service.materializePending();
    expect(campaigns[0].status).toBe('PROCESSING');
    setActiveLogs(0);
    await service.reconcile();
    expect(campaigns[0].status).toBe('COMPLETED');
  });

  it('does not materialize the same recipient twice when two workers overlap', async () => {
    const { service, enqueue, recipients } = build([{}]);
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false });
    await Promise.all([service.materializePending(), service.materializePending()]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(recipients[0].status).toBe('MATERIALIZED');
  });

  it('recovers an expired recipient lease but leaves a current lease untouched', async () => {
    const { service, enqueue, recipients } = build([{}, {}]);
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false });
    recipients[0].status = 'PROCESSING';
    recipients[0].updatedAt = new Date(Date.now() - 11 * 60_000);
    recipients[1].status = 'PROCESSING';
    recipients[1].updatedAt = new Date();
    await service.materializePending();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(recipients.map((item) => item.status)).toEqual(['MATERIALIZED', 'PROCESSING']);
  });

  it('persists through POST, reloads, runs batches and reloads completed counters', async () => {
    const { service } = build(Array.from({ length: 30 }, () => ({})));
    const app = await createHttpApp(service);
    try {
      const post = await app.inject({ method: 'POST', url: '/tenant/notification-campaigns', headers: { cookie: 'ps_session=test', 'x-tenant-id': '99999999-9999-4999-8999-999999999999' }, payload: { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false } });
      expect(post.statusCode).toBe(201);
      expect(JSON.parse(post.body)).toMatchObject({ status: 'QUEUED', recipientCount: 30, deliveryCount: 0 });
      await service.materializePending();
      await service.materializePending();
      const reload = await app.inject({ method: 'GET', url: '/tenant/notification-campaigns', headers: { cookie: 'ps_session=test', 'x-tenant-id': '99999999-9999-4999-8999-999999999999' } });
      expect(reload.statusCode).toBe(200);
      expect(JSON.parse(reload.body).items[0]).toMatchObject({ status: 'COMPLETED', recipientCount: 30, deliveryCount: 30 });
    } finally {
      await app.close();
    }
  });
});
