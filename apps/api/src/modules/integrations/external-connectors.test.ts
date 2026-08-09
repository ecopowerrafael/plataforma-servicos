import { UpsertExternalIntegrationSchema, UpsertWhatsAppConfigSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { privateAddress } from './integration-delivery.js';

describe('external integration security', () => {
  it('requires HTTPS webhook endpoints', () => {
    expect(
      UpsertExternalIntegrationSchema.safeParse({
        name: 'CRM',
        endpoint: 'http://example.com/hook',
        events: ['notification.queued'],
        active: true,
      }).success,
    ).toBe(false);
    expect(
      UpsertExternalIntegrationSchema.safeParse({
        name: 'CRM',
        endpoint: 'https://example.com/hook',
        events: ['notification.queued'],
        active: true,
      }).success,
    ).toBe(true);
  });
  it('recognizes private and loopback destinations', () => {
    expect(privateAddress('127.0.0.1')).toBe(true);
    expect(privateAddress('192.168.1.2')).toBe(true);
    expect(privateAddress('8.8.8.8')).toBe(false);
  });
  it('rejects malformed WhatsApp tokens when provided', () => {
    expect(
      UpsertWhatsAppConfigSchema.safeParse({
        active: true,
        phoneNumberId: '1',
        businessAccountId: '2',
        accessToken: 'short',
        apiVersion: 'v23.0',
      }).success,
    ).toBe(false);
  });
});
