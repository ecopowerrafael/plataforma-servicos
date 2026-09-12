import { describe, expect, it, vi } from 'vitest';
import { NotificationCampaignService } from './notification-campaign.service.js';

const tenantId = 7n;
const key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const customer = (index: number) => ({ publicId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` });

function build(customers = [customer(1)]) {
  const campaign = { id: 1n, tenantId, publicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', audience: 'CUSTOMERS', channel: 'WHATSAPP', title: '', message: 'Olá', status: 'QUEUED', recipientCount: customers.length, eligibleCount: 0, skippedCount: 0, deliveryCount: 0, createdAt: new Date('2026-08-15T12:00:00.000Z') };
  const client = {
    customer: { findMany: vi.fn().mockResolvedValue(customers) },
    professional: { findMany: vi.fn().mockResolvedValue([]) },
    tenantWhatsAppConfig: { findUnique: vi.fn().mockResolvedValue({ active: true }) },
    notificationCampaign: { create: vi.fn().mockResolvedValue(campaign), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    notificationCampaignRecipient: { createMany: vi.fn().mockResolvedValue({ count: customers.length }), findMany: vi.fn().mockResolvedValue([]) },
    notificationLog: { groupBy: vi.fn().mockResolvedValue([]) },
  };
  const enqueue = vi.fn();
  return { client, enqueue, service: new NotificationCampaignService(client as never, { enqueue } as never, { assertFeatureEnabledForTenant: vi.fn() }) };
}

describe('NotificationCampaignService', () => {
  it('scopes the campaign snapshot query to the current tenant', async () => {
    const { client, service } = build();
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false });
    expect(client.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    );
  });

  it('creates a queued campaign snapshot without materializing NotificationLogs', async () => {
    const { client, enqueue, service } = build(Array.from({ length: 500 }, (_, i) => customer(i)));
    const result = await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: true });
    expect(result).toMatchObject({ status: 'QUEUED', recipientCount: 500, deliveryCount: 0, skippedCount: 0 });
    expect(client.notificationCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipients: expect.any(Object) }) }),
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps idempotency without duplicating campaign snapshot', async () => {
    const { client, service } = build();
    client.notificationCampaign.findFirst.mockResolvedValueOnce({ id: 1n, tenantId, publicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', audience: 'CUSTOMERS', channel: 'WHATSAPP', title: '', message: 'Olá', status: 'QUEUED', recipientCount: 1, eligibleCount: 0, skippedCount: 0, deliveryCount: 0, createdAt: new Date() });
    await service.create(tenantId, { audience: 'CUSTOMERS', recipientMode: 'ALL', recipientPublicIds: [], idempotencyKey: key, channel: 'WHATSAPP', message: 'Olá', whatsappRiskAcknowledged: false });
    expect(client.notificationCampaign.create).not.toHaveBeenCalled();
  });
});
