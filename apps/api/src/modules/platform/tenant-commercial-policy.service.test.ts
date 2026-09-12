import {
  TenantCommercialPolicySchema,
  UpdateTenantCommercialPolicyRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { TenantCommercialPolicyService } from './tenant-commercial-policy.service.js';

const publicId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-08-18T12:00:00.000Z');
const policy = {
  id: 1n,
  publicId,
  singleton: true,
  defaultTrialDays: 7,
  graceDays: 7,
  autoSuspendAfterGrace: true,
  allowAdminLoginWhileBlocked: true,
  allowCalendarReadWhileBlocked: true,
  allowAdminChangesWhileBlocked: false,
  allowInternalBookingWhileBlocked: false,
  allowPublicBookingWhileBlocked: false,
  publicSiteBehaviorWhileBlocked: 'HIDE_BOOKING' as const,
  adminMessage: 'Mensagem para a equipe.',
  publicMessage: 'Mensagem para clientes.',
  commercialWhatsapp: null,
  createdAt: now,
  updatedAt: now,
};

function updatePayload(value: unknown) {
  return UpdateTenantCommercialPolicyRequestSchema.parse(value);
}

describe('TenantCommercialPolicyService update contract', () => {
  it('accepts and normalizes a formatted Brazilian commercial WhatsApp', () => {
    expect(updatePayload({ commercialWhatsapp: '5515997118125' })).toEqual({
      commercialWhatsapp: '5515997118125',
    });
    expect(updatePayload({ commercialWhatsapp: '+55 (15) 99711-8125' })).toEqual({
      commercialWhatsapp: '5515997118125',
    });
    expect(updatePayload({ commercialWhatsapp: '' })).toEqual({ commercialWhatsapp: null });
  });

  it('rejects an invalid commercial WhatsApp with a field-specific message', () => {
    const result = UpdateTenantCommercialPolicyRequestSchema.safeParse({
      commercialWhatsapp: '5515',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]).toMatchObject({
      path: ['commercialWhatsapp'],
      message: 'Informe um número válido com DDI e DDD.',
    });
  });

  it('persists only the normalized WhatsApp when no other policy is changed', async () => {
    const update = vi.fn().mockResolvedValue({ ...policy, commercialWhatsapp: '5515997118125' });
    const auditLog = { create: vi.fn().mockResolvedValue({}) };
    const client = {
      tenantCommercialPolicy: { findUnique: vi.fn().mockResolvedValue(policy) },
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ tenantCommercialPolicy: { update }, auditLog }),
    };
    const service = new TenantCommercialPolicyService(client as never);

    await service.update(
      updatePayload({ commercialWhatsapp: '+55 (15) 99711-8125' }),
      { user: { id: 9n } } as never,
      { ipAddress: null, userAgent: null },
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { commercialWhatsapp: '5515997118125' },
    });
    expect(auditLog.create).toHaveBeenCalledOnce();
  });

  it('round-trips a GET policy into a valid PATCH payload without read-only fields', () => {
    const received = TenantCommercialPolicySchema.parse({
      ...policy,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    const previousPayload = UpdateTenantCommercialPolicyRequestSchema.safeParse(received);
    expect(previousPayload.success).toBe(false);
    if (!previousPayload.success) {
      expect(previousPayload.error.issues[0]).toMatchObject({
        code: 'unrecognized_keys',
        keys: expect.arrayContaining(['publicId', 'createdAt', 'updatedAt']),
      });
    }
    const {
      publicId: _publicId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...payload
    } = received;

    expect(UpdateTenantCommercialPolicyRequestSchema.parse(payload)).toMatchObject({
      defaultTrialDays: 7,
      graceDays: 7,
      commercialWhatsapp: null,
      publicSiteBehaviorWhileBlocked: 'HIDE_BOOKING',
    });
  });
});
