import { describe, expect, it, vi } from 'vitest';
import { IntegrationRepository } from './integration.repository.js';

const buildRepository = () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  return { findFirst, repository: new IntegrationRepository({ whatsAppInboundEvent: { findFirst } } as never) };
};

describe('IntegrationRepository inbound dedupe lookup', () => {
  it.each(['LIST_RESPONSE', 'BUTTON_REPLY'])('processes distinct null-ID events and deduplicates exact re-delivery for %s', async (eventType) => {
    const rows: Array<{ provider: string; instanceId: string; fingerprint: string; externalMessageId: string | null; eventType: string }> = [];
    const findFirst = vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => rows.find((row) =>
      Object.entries(where).filter(([key]) => key !== 'tenantId').every(([key, value]) => row[key as keyof typeof row] === value),
    ) ?? null);
    const repository = new IntegrationRepository({ whatsAppInboundEvent: { findFirst } } as never);
    const lookup = (fingerprint: string, externalMessageId: string | null) => repository.inboundEventByFingerprint(1n, fingerprint, { provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId, eventType });
    const ingest = async (fingerprint: string, externalMessageId: string | null) => {
      const duplicate = await lookup(fingerprint, externalMessageId);
      if (duplicate !== null) return 'DUPLICATED';
      rows.push({ provider: 'EVOLUTION', instanceId: 'instance-1', fingerprint, externalMessageId, eventType });
      return 'PROCESSED';
    };

    await expect(ingest('A', null)).resolves.toBe('PROCESSED');
    await expect(ingest('B', null)).resolves.toBe('PROCESSED');
    await expect(ingest('A', null)).resolves.toBe('DUPLICATED');
    await expect(ingest('C', 'id-123')).resolves.toBe('PROCESSED');
    await expect(ingest('D', 'id-123')).resolves.toBe('DUPLICATED');
  });

  it('uses fingerprint for null external IDs and does not match other null-ID events', async () => {
    const { findFirst, repository } = buildRepository();

    await repository.inboundEventByFingerprint(1n, 'fingerprint-a', {
      provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: null, eventType: 'MESSAGE_ACTION',
    });
    await repository.inboundEventByFingerprint(1n, 'fingerprint-b', {
      provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: null, eventType: 'MESSAGE_ACTION',
    });

    expect(findFirst).toHaveBeenNthCalledWith(1, { where: {
      tenantId: 1n, provider: 'EVOLUTION', instanceId: 'instance-1', eventType: 'MESSAGE_ACTION', fingerprint: 'fingerprint-a',
    } });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: {
      tenantId: 1n, provider: 'EVOLUTION', instanceId: 'instance-1', eventType: 'MESSAGE_ACTION', fingerprint: 'fingerprint-b',
    } });
  });

  it('uses the provider event ID when present and treats its re-delivery as the same event', async () => {
    const { findFirst, repository } = buildRepository();

    await repository.inboundEventByFingerprint(1n, 'fingerprint-a', {
      provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: 'id-123', eventType: 'MESSAGE_ACTION',
    });
    await repository.inboundEventByFingerprint(1n, 'fingerprint-b', {
      provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: 'id-123', eventType: 'MESSAGE_ACTION',
    });

    expect(findFirst).toHaveBeenNthCalledWith(1, { where: {
      tenantId: 1n, provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: 'id-123', eventType: 'MESSAGE_ACTION',
    } });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: {
      tenantId: 1n, provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: 'id-123', eventType: 'MESSAGE_ACTION',
    } });
  });

  it('applies the same null-ID rule to BUTTON and LIST_RESPONSE', async () => {
    const { findFirst, repository } = buildRepository();

    await repository.inboundEventByFingerprint(1n, 'button-fingerprint', {
      provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: null, eventType: 'BUTTON_REPLY',
    });
    await repository.inboundEventByFingerprint(1n, 'list-fingerprint', {
      provider: 'EVOLUTION', instanceId: 'instance-1', externalMessageId: null, eventType: 'LIST_RESPONSE',
    });

    expect(findFirst).toHaveBeenNthCalledWith(1, { where: expect.objectContaining({ fingerprint: 'button-fingerprint' }) });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: expect.objectContaining({ fingerprint: 'list-fingerprint' }) });
  });
});
