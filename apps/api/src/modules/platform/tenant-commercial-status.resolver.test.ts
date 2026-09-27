import { describe, expect, it } from 'vitest';
import { TenantCommercialStatusResolver } from './tenant-commercial-status.resolver.js';

const policy = { autoSuspendAfterGrace: true, allowAdminLoginWhileBlocked: false, allowCalendarReadWhileBlocked: false, allowAdminChangesWhileBlocked: false, allowInternalBookingWhileBlocked: false, allowPublicBookingWhileBlocked: false, publicSiteBehaviorWhileBlocked: 'OFFLINE' as const, adminMessage: 'blocked', publicMessage: 'blocked' };
const now = new Date('2026-09-14T12:00:00.000Z');
const sub = (status: any, trialEndsAt: Date | null = null, currentPeriodEndsAt: Date | null = new Date('2026-09-20T00:00:00.000Z'), graceEndsAt: Date | null = null) => ({ status, trialEndsAt, currentPeriodEndsAt, graceEndsAt });

describe('TenantCommercialStatusResolver', () => {
  it.each([
    ['TRIALING', sub('TRIALING', new Date('2026-09-15T00:00:00.000Z')), true],
    ['TRIALING vencido', sub('TRIALING', new Date('2026-09-14T11:00:00.000Z')), false],
    ['ACTIVE', sub('ACTIVE'), true],
    ['ACTIVE vencido', sub('ACTIVE', null, new Date('2026-09-14T11:00:00.000Z')), false],
    ['CANCELED no período', sub('CANCELED'), true],
    ['CANCELED vencido', sub('CANCELED', null, new Date('2026-09-14T11:00:00.000Z')), false],
    ['SUSPENDED', sub('SUSPENDED'), false],
    ['EXPIRED', sub('EXPIRED'), false],
  ])('%s decide acesso corretamente', (_name, subscription, allowed) => {
    expect(new TenantCommercialStatusResolver().resolve(subscription, policy, now).capabilities.canManageData).toBe(allowed);
  });

  it('aplica grace de PAST_DUE conforme a política', () => {
    const result = new TenantCommercialStatusResolver().resolve(sub('PAST_DUE', null, new Date('2026-09-10T00:00:00.000Z'), new Date('2026-09-15T00:00:00.000Z')), { ...policy, allowAdminChangesWhileBlocked: true }, now);
    expect(result.state).toBe('GRACE');
    expect(result.capabilities.canManageData).toBe(true);
  });

  it('bloqueia PAST_DUE sem graceEndsAt, sem fallback silencioso', () => {
    const result = new TenantCommercialStatusResolver().resolve(sub('PAST_DUE', null, new Date('2026-09-10T00:00:00.000Z'), null), { ...policy, allowAdminLoginWhileBlocked: true }, now);
    expect(result.state).toBe('PAST_DUE');
    expect(result.capabilities.canManageData).toBe(false);
    expect(result.capabilities.canAccessAdmin).toBe(true);
  });

  it('falha fechado para status de assinatura inválido', () => {
    expect(() => new TenantCommercialStatusResolver().resolve(sub('UNKNOWN' as never), policy, now)).toThrow();
  });
});
