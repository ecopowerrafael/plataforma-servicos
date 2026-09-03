import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import {
  BusinessUnitOperatingHoursResponseSchema,
  BusinessUnitDateOverridesResponseSchema,
  ProfessionalScheduleResponseSchema,
  ProfessionalUnavailabilityListResponseSchema,
} from '@plataforma/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { platformScheduleRoutes } from './platform.schedule-routes.js';
import { PlatformService, type PlatformAuthContext } from './platform.service.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const unitPublicId = '22222222-2222-4222-8222-222222222222';
const professionalPublicId = '33333333-3333-4333-8333-333333333333';
const apps: FastifyInstance[] = [];

async function fixture() {
  const client = {
    businessUnitOperatingHours: { findMany: vi.fn(), findUnique: vi.fn() },
    professionalSchedule: { findMany: vi.fn(), findUnique: vi.fn() },
    professionalUnavailability: { findMany: vi.fn() },
    businessUnitDateOverride: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };

  const businessUnitOperatingHoursService = {
    list: vi.fn().mockResolvedValue({
      publicId: unitPublicId,
      items: [{ dayOfWeek: 1, startsAt: '08:00', endsAt: '18:00' }],
    }),
    replace: vi.fn().mockResolvedValue({
      publicId: unitPublicId,
      items: [],
    }),
    repository: { audit: vi.fn() },
  };

  const professionalScheduleService = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ items: [] }),
    replace: vi.fn().mockResolvedValue({ items: [] }),
    update: vi.fn().mockResolvedValue({ items: [] }),
    remove: vi.fn().mockResolvedValue({ items: [] }),
    repository: { audit: vi.fn() },
  };

  const professionalUnavailabilityService = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ items: [] }),
    update: vi.fn().mockResolvedValue({ items: [] }),
    remove: vi.fn().mockResolvedValue({ items: [] }),
    repository: { audit: vi.fn() },
  };

  const businessUnitDateOverridesService = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    replace: vi.fn().mockResolvedValue({ items: [] }),
    remove: vi.fn().mockResolvedValue({ items: [] }),
    repository: { audit: vi.fn() },
  };

  const platformService = new PlatformService(client as never);
  vi.spyOn(platformService, 'resolveTenantId').mockResolvedValue(1n);
  vi.spyOn(platformService, 'requirePermission').mockReturnValue(undefined);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);

  app.addHook('preHandler', async (request: FastifyRequest) => {
    (request as any).platformAuth = {
      administrator: { id: 1n, publicId: 'admin-123', status: 'ACTIVE' },
      user: { id: 100n, publicId: 'user-456', email: 'admin@example.com', status: 'ACTIVE' },
      session: { id: 200n, publicId: 'session-789', expiresAt: new Date(Date.now() + 3600000) },
      permissions: ['platform.tenant.read', 'platform.tenant.update'],
    } as PlatformAuthContext;
  });

  await app.register(platformScheduleRoutes, {
    service: platformService,
    businessUnitOperatingHoursService,
    professionalScheduleService,
    professionalUnavailabilityService,
    businessUnitDateOverridesService,
  });

  apps.push(app);
  return {
    app,
    businessUnitOperatingHoursService,
    professionalScheduleService,
    professionalUnavailabilityService,
    businessUnitDateOverridesService,
    platformService,
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('platform schedule routes - corrected tenant/actor', () => {
  describe('operating hours', () => {
    it('GET passes correct tenantId to service', async () => {
      const { app, businessUnitOperatingHoursService, platformService } = await fixture();

      await app.inject({
        method: 'GET',
        url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/operating-hours`,
      });

      expect(platformService.resolveTenantId).toHaveBeenCalledWith(tenantPublicId);
      expect(businessUnitOperatingHoursService.list).toHaveBeenCalledWith(1n, unitPublicId);
    });

    it('PUT passes resolved tenantId and correct actor', async () => {
      const { app, businessUnitOperatingHoursService } = await fixture();

      await app.inject({
        method: 'PUT',
        url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/operating-hours`,
        payload: { periods: [] },
      });

      const call = businessUnitOperatingHoursService.replace.mock.calls[0];
      expect(call[0]).toBe(1n); // tenantId resolved correctly
      expect(call[3]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });
  });

  describe('professional schedule', () => {
    it('POST passes resolved tenantId and correct actor', async () => {
      const { app, professionalScheduleService } = await fixture();

      const response = await app.inject({
        method: 'POST',
        url: `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/schedule`,
        payload: { periods: [{ weekday: 1, startsAt: '08:00', endsAt: '18:00', active: true }] },
      });

      if (professionalScheduleService.create.mock.calls.length === 0) {
        expect.fail(`POST not called, status: ${response.statusCode}, body: ${response.body}`);
      }

      const call = professionalScheduleService.create.mock.calls[0];
      expect(call[0]).toBe(1n); // tenantId resolved correctly
      expect(call[3]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });

    it('PATCH passes resolved tenantId and correct actor', async () => {
      const { app, professionalScheduleService } = await fixture();
      const periodId = '44444444-4444-4444-8444-444444444444';

      await app.inject({
        method: 'PATCH',
        url: `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/schedule/${periodId}`,
        payload: { weekday: 1, startsAt: '08:00', endsAt: '12:00', active: true },
      });

      const call = professionalScheduleService.update.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[4]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });

    it('DELETE passes resolved tenantId and correct actor', async () => {
      const { app, professionalScheduleService } = await fixture();
      const periodId = '44444444-4444-4444-8444-444444444444';

      await app.inject({
        method: 'DELETE',
        url: `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/schedule/${periodId}`,
      });

      const call = professionalScheduleService.remove.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[3]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });
  });

  describe('unavailabilities', () => {
    it('POST passes resolved tenantId and correct actor', async () => {
      const { app, professionalUnavailabilityService } = await fixture();

      await app.inject({
        method: 'POST',
        url: `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/unavailabilities`,
        payload: {
          type: 'BLOCK',
          title: 'Test',
          startsAt: '2026-09-05T08:00:00Z',
          endsAt: '2026-09-05T17:00:00Z',
          allDay: false,
          repeatsWeekly: false,
        },
      });

      const call = professionalUnavailabilityService.create.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[3]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });

    it('PATCH unavailability passes resolved tenantId and correct actor', async () => {
      const { app, professionalUnavailabilityService } = await fixture();
      const unavailId = '55555555-5555-5555-8555-555555555555';

      await app.inject({
        method: 'PATCH',
        url: `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/unavailabilities/${unavailId}`,
        payload: { type: 'BLOCK', title: 'Updated', startsAt: '2026-09-05T08:00:00Z', endsAt: '2026-09-05T17:00:00Z', allDay: false, repeatsWeekly: false },
      });

      const call = professionalUnavailabilityService.update.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[4]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });

    it('DELETE passes resolved tenantId and correct actor', async () => {
      const { app, professionalUnavailabilityService } = await fixture();
      const unavailId = '55555555-5555-5555-8555-555555555555';

      await app.inject({
        method: 'DELETE',
        url: `/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/unavailabilities/${unavailId}`,
      });

      const call = professionalUnavailabilityService.remove.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[3]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });
  });

  describe('date overrides', () => {
    it('GET uses querystring for from/to, not params', async () => {
      const { app, businessUnitDateOverridesService } = await fixture();

      await app.inject({
        method: 'GET',
        url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides?from=2026-09-01&to=2026-09-30`,
      });

      const call = businessUnitDateOverridesService.list.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[2]).toBe('2026-09-01'); // from parameter
      expect(call[3]).toBe('2026-09-30'); // to parameter
    });

    it('PUT HOLIDAY passes resolved tenantId and correct actor', async () => {
      const { app, businessUnitDateOverridesService } = await fixture();

      await app.inject({
        method: 'PUT',
        url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides/2026-09-05`,
        payload: { type: 'HOLIDAY', closed: true, title: 'Holiday' },
      });

      const call = businessUnitDateOverridesService.replace.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[4]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });

    it('PUT EXCEPTION passes resolved tenantId and correct actor', async () => {
      const { app, businessUnitDateOverridesService } = await fixture();

      await app.inject({
        method: 'PUT',
        url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides/2026-09-05`,
        payload: {
          type: 'EXCEPTION',
          closed: false,
          periods: [{ startsAt: '09:00', endsAt: '13:00' }],
        },
      });

      const call = businessUnitDateOverridesService.replace.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[4]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });

    it('DELETE passes resolved tenantId and correct actor', async () => {
      const { app, businessUnitDateOverridesService } = await fixture();

      await app.inject({
        method: 'DELETE',
        url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides/2026-09-05`,
      });

      const call = businessUnitDateOverridesService.remove.mock.calls[0];
      expect(call[0]).toBe(1n);
      expect(call[3]).toEqual({
        userId: 100n,
        sessionId: null,
      });
    });
  });
});
