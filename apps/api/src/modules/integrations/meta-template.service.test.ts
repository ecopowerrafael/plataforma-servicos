import { describe, expect, it, vi } from 'vitest';

import { MetaTemplateService } from './meta-template.service.js';
import { MetaWhatsAppClient } from './meta-whatsapp-client.js';

const metaConfig = (tenantId = 7n) => ({
  id: tenantId,
  tenantId,
  provider: 'META',
  businessAccountId: `waba-${tenantId}`,
  encryptedAccessToken: `enc:{"accessToken":"token-${tenantId}"}`,
  apiVersion: 'v23.0',
});

function subject(remote: Array<Record<string, unknown>> = []) {
  const local: Record<string, any>[] = [];
  const tenantWhatsAppConfig = {
    findUnique: vi.fn(({ where }) => Promise.resolve(where.tenantId_provider.tenantId === 999n ? null : metaConfig(where.tenantId_provider.tenantId))),
  };
  const tenantWhatsAppMetaTemplate = {
    findMany: vi.fn(({ where }) => Promise.resolve(local.filter((item) => item.tenantId === where.tenantId))),
    findFirst: vi.fn(({ where }) => Promise.resolve(local.find((item) => item.tenantId === where.tenantId && item.purpose === where.purpose && item.templateName === where.templateName) ?? null)),
    upsert: vi.fn(({ where, create, update }) => {
      const found = local.find((item) => item.tenantId === where.tenantId_purpose_templateName.tenantId && item.purpose === where.tenantId_purpose_templateName.purpose && item.templateName === where.tenantId_purpose_templateName.templateName);
      if (found) Object.assign(found, update);
      else local.push({ id: BigInt(local.length + 1), ...create });
      return Promise.resolve(found ?? local.at(-1));
    }),
    update: vi.fn(({ where, data }) => {
      const found = local.find((item) => item.id === where.id);
      if (found) Object.assign(found, data);
      return Promise.resolve(found);
    }),
  };
  const client = { tenantWhatsAppConfig, tenantWhatsAppMetaTemplate };
  const cipher = { decrypt: vi.fn((value: string) => JSON.parse(value.replace(/^enc:/u, '')) as Record<string, unknown>) };
  const metaClient = {
    listTemplates: vi.fn().mockResolvedValue({ ok: true, status: 200, payload: { data: remote } }),
    createTemplate: vi.fn().mockResolvedValue({ ok: true, status: 200, payload: { id: 'new-id', status: 'PENDING' } }),
  };
  return { service: new MetaTemplateService(client as never, cipher as never, metaClient as never), client, metaClient, local };
}

describe('MetaTemplateService', () => {
  it('rejects provision when tenant has no Meta config', async () => {
    const { service } = subject();
    await expect(service.provisionDefaults(999n)).rejects.toMatchObject({ code: 'META_WHATSAPP_NOT_CONFIGURED' });
  });

  it('lists the 6 standard tenant templates without secrets', async () => {
    const { service } = subject();
    const result = await service.list(7n);
    expect(result.items).toHaveLength(6);
    expect(JSON.stringify(result)).not.toContain('token-7');
  });

  it('creates 6 templates when none exist in Meta', async () => {
    const { service, metaClient } = subject();
    const result = await service.provisionDefaults(7n);
    expect(metaClient.createTemplate).toHaveBeenCalledTimes(6);
    expect(result.summary).toMatchObject({ requested: 6, created: 6, existing: 0, failed: 0 });
  });

  it('creates only 3 missing templates when 3 already exist', async () => {
    const existing = [
      'agendei_appointment_reminder_v1',
      'agendei_appointment_confirmation_v1',
      'agendei_appointment_changed_v1',
    ].map((name, index) => ({ id: `existing-${index}`, name, language: 'pt_BR', category: 'UTILITY', status: 'APPROVED' }));
    const { service, metaClient } = subject(existing);
    const result = await service.provisionDefaults(7n);
    expect(metaClient.createTemplate).toHaveBeenCalledTimes(3);
    expect(result.summary).toMatchObject({ requested: 6, created: 3, existing: 3, failed: 0 });
  });

  it('creates 0 when all templates already exist', async () => {
    const names = [
      'agendei_appointment_reminder_v1',
      'agendei_appointment_confirmation_v1',
      'agendei_appointment_changed_v1',
      'agendei_appointment_cancelled_v1',
      'agendei_payment_reminder_v1',
      'agendei_customer_reactivation_v1',
    ];
    const { service, metaClient } = subject(names.map((name) => ({ id: name, name, language: 'pt_BR', category: name.includes('reactivation') ? 'MARKETING' : 'UTILITY', status: 'APPROVED' })));
    const result = await service.provisionDefaults(7n);
    expect(metaClient.createTemplate).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({ requested: 6, created: 0, existing: 6, failed: 0 });
  });

  it('imports a remote Meta template when local database does not know it yet', async () => {
    const { service, local } = subject([{ id: 'remote-id', name: 'agendei_payment_reminder_v1', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED' }]);
    await service.provisionDefaults(7n);
    expect(local.some((item) => item.templateName === 'agendei_payment_reminder_v1' && item.metaTemplateId === 'remote-id')).toBe(true);
  });

  it('does not duplicate a standard template returned from a later Meta page', async () => {
    const { service, metaClient } = subject([
      { id: 'page-1-template', name: 'external_template', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED' },
      { id: 'page-2-payment', name: 'agendei_payment_reminder_v1', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED' },
    ]);
    const result = await service.provisionDefaults(7n);
    const createdNames = metaClient.createTemplate.mock.calls.map((call) => call[3]?.name);
    expect(createdNames).not.toContain('agendei_payment_reminder_v1');
    expect(result.summary).toMatchObject({ requested: 6, created: 5, existing: 1, failed: 0 });
  });

  it('refresh updates PENDING to APPROVED and then REJECTED with reason', async () => {
    const remote = [{ id: 'remote-id', name: 'agendei_payment_reminder_v1', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED' }];
    const { service, local, metaClient } = subject(remote);
    local.push({ id: 1n, publicId: 'local', tenantId: 7n, purpose: 'PAYMENT_REMINDER', templateName: 'agendei_payment_reminder_v1', language: 'pt_BR', category: 'UTILITY', status: 'PENDING', metaTemplateId: 'remote-id', rejectionReason: null, lastCheckedAt: null });
    await service.refresh(7n);
    expect(local[0].status).toBe('APPROVED');
    metaClient.listTemplates.mockResolvedValueOnce({ ok: true, status: 200, payload: { data: [{ ...remote[0], status: 'REJECTED', rejected_reason: 'Categoria incorreta' }] } });
    await service.refresh(7n);
    expect(local[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'Categoria incorreta' });
  });

  it('keeps tenant A templates scoped away from tenant B', async () => {
    const { service, local } = subject();
    local.push({ id: 1n, publicId: 'tenant-b', tenantId: 8n, purpose: 'PAYMENT_REMINDER', templateName: 'agendei_payment_reminder_v1', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED', metaTemplateId: 'b', rejectionReason: null, lastCheckedAt: null });
    const result = await service.list(7n);
    expect(result.items.find((item) => item.templateName === 'agendei_payment_reminder_v1')?.publicId).toBeNull();
  });

  it('maps 429 rate limit to a sanitized AppError', async () => {
    const { service, metaClient } = subject();
    metaClient.listTemplates.mockResolvedValueOnce({ ok: false, status: 429, payload: { error: { message: 'secret-ish' } } });
    await expect(service.provisionDefaults(7n)).rejects.toMatchObject({ code: 'META_RATE_LIMIT', statusCode: 429 });
  });

  it('returns partial summary when one remote create fails', async () => {
    const { service, metaClient } = subject();
    metaClient.createTemplate.mockResolvedValueOnce({ ok: false, status: 500, payload: {} });
    const result = await service.provisionDefaults(7n);
    expect(result.summary).toMatchObject({ requested: 6, created: 5, existing: 0, failed: 1 });
    expect(JSON.stringify(result)).not.toContain('token-7');
    expect(JSON.stringify(result)).not.toContain('Authorization');
  });

  it.each([
    [401, 'META_AUTH_FAILED', 'Credenciais Meta sem permissão para criar templates.'],
    [403, 'META_AUTH_FAILED', 'Credenciais Meta sem permissão para criar templates.'],
    [429, 'META_RATE_LIMIT', 'Limite temporário da Meta atingido.'],
    [400, 'META_TEMPLATE_INVALID', 'Meta rejeitou a criação do template.'],
    [422, 'META_TEMPLATE_INVALID', 'Meta rejeitou a criação do template.'],
    [500, 'META_UNAVAILABLE', 'Meta indisponível temporariamente.'],
  ])('maps create status %i to sanitized local failure %s', async (status, _code, message) => {
    const { service, metaClient, local } = subject();
    metaClient.createTemplate.mockResolvedValueOnce({ ok: false, status, payload: { error: { message: 'raw token secret Authorization' } } });
    const result = await service.provisionDefaults(7n);
    expect(result.summary).toMatchObject({ requested: 6, created: 5, existing: 0, failed: 1 });
    expect(local[0].rejectionReason).toBe(message);
    expect(JSON.stringify(result)).not.toContain('raw token secret Authorization');
    expect(local.some((item) => item.rejectionReason === 'raw token secret Authorization')).toBe(false);
  });
});

describe('MetaWhatsAppClient templates pagination', () => {
  const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('returns templates from two Graph pages', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'a', name: 'template_a', language: 'pt_BR' }],
        paging: { next: 'https://graph.facebook.com/v23.0/waba/message_templates?after=page-2' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'b', name: 'agendei_payment_reminder_v1', language: 'pt_BR' }],
      }));
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result.ok).toBe(true);
    expect(result.payload.data).toEqual([
      { id: 'a', name: 'template_a', language: 'pt_BR' },
      { id: 'b', name: 'agendei_payment_reminder_v1', language: 'pt_BR' },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('tenant-token');
  });

  it('accepts a trusted https graph.facebook.com paging.next URL', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'a', name: 'template_a', language: 'pt_BR' }],
        paging: { next: 'https://graph.facebook.com/v23.0/waba/message_templates?after=page-2' },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'b', name: 'template_b', language: 'pt_BR' }] }));
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://graph.facebook.com/v23.0/waba/message_templates?after=page-2', expect.anything());
  });

  it('rejects http graph paging.next before fetching it', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [],
        paging: { next: 'http://graph.facebook.com/v23.0/waba/message_templates?after=page-2' },
      }));
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result).toMatchObject({ ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_UNTRUSTED_URL' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects external paging.next before fetching it', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [],
        paging: { next: 'https://evil.example/v23.0/waba/message_templates?after=page-2' },
      }));
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result).toMatchObject({ ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_UNTRUSTED_URL' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.some(([url, init]) => String(url).includes('evil.example') && JSON.stringify(init).includes('tenant-token'))).toBe(false);
  });

  it('rejects invalid paging.next URLs', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [],
        paging: { next: 'not a valid url' },
      }));
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result).toMatchObject({ ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_INVALID_URL' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('interrupts repeated paging.next URLs with a safe error', async () => {
    const next = 'https://graph.facebook.com/v23.0/waba/message_templates?after=same';
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: [], paging: { next } })));
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result).toMatchObject({ ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_LOOP' } });
    expect(JSON.stringify(result)).not.toContain('tenant-token');
  });

  it('interrupts pagination above the defensive page limit', async () => {
    let page = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      page += 1;
      return Promise.resolve(jsonResponse({ data: [], paging: { next: `https://graph.facebook.com/v23.0/waba/message_templates?after=${page}` } }));
    });
    const client = new MetaWhatsAppClient(fetcher as never);
    const result = await client.listTemplates('v23.0', 'waba', 'tenant-token');
    expect(result).toMatchObject({ ok: false, status: 508, payload: { error: 'META_TEMPLATE_PAGING_LIMIT' } });
    expect(fetcher).toHaveBeenCalledTimes(100);
  });
});
