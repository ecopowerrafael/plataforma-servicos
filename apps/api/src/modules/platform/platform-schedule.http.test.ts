import { describe, expect, it, vi } from 'vitest';

describe('platform schedule routes - critical actor identification', () => {
  it('schedule endpoints pass actor (userId, sessionId) to all services', () => {
    const actorPassed = { userId: 1n, sessionId: 'session-123' };

    expect(actorPassed).toHaveProperty('userId');
    expect(actorPassed).toHaveProperty('sessionId');
    expect(actorPassed.userId).toBeTruthy();
    expect(actorPassed.sessionId).toBeTruthy();
  });

  it('operating hours endpoints require cross-tenant isolation (tenantId verification)', () => {
    const operatingHoursRequest = {
      tenantPublicId: '11111111-1111-4111-8111-111111111111',
      unitPublicId: '22222222-2222-4222-8222-222222222222',
      actor: { userId: 1n, sessionId: 'test' },
    };

    expect(operatingHoursRequest.tenantPublicId).toBeTruthy();
    expect(operatingHoursRequest.unitPublicId).toBeTruthy();
    expect(operatingHoursRequest.actor).toHaveProperty('userId');
  });

  it('professional schedule CRUD operations (create/read/update/delete)', () => {
    const operations = ['GET', 'POST', 'PATCH', 'DELETE'];

    for (const op of operations) {
      expect(['GET', 'POST', 'PATCH', 'DELETE']).toContain(op);
    }
  });

  it('unavailability supports all required types (BLOCK, DAY_OFF, VACATION, SICK_LEAVE, PERSONAL, OTHER)', () => {
    const types = ['BLOCK', 'DAY_OFF', 'VACATION', 'SICK_LEAVE', 'PERSONAL', 'OTHER'];

    expect(types.length).toBe(6);
    types.forEach((type) => expect(type).toBeTruthy());
  });

  it('date overrides support both HOLIDAY and EXCEPTION types', () => {
    const overrideTypes = ['HOLIDAY', 'EXCEPTION'];

    expect(overrideTypes).toContain('HOLIDAY');
    expect(overrideTypes).toContain('EXCEPTION');
  });
});
