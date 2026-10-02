import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { treatmentPlanReminderRoutes } from '../src/modules/appointments/treatment-plan-reminder.routes.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';

describe('treatment plan reminder route wiring', () => {
  it('registers and serves GET/PATCH reminder-config routes', async () => {
    const app: FastifyInstance = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(cookie);

    const repository = {
      getConfig: vi.fn().mockResolvedValue(null),
      updateConfig: vi.fn().mockResolvedValue({
        enabled: false,
        channel: 'WHATSAPP',
        sequence: [],
      }),
    };
    const authService = {
      authenticate: vi.fn().mockResolvedValue({}),
      resolveTenant: vi.fn().mockResolvedValue({
        id: 1n,
        publicId: tenantPublicId,
        membership: { permissions: ['appointment.read'] },
      }),
      requirePermission: vi.fn(),
    };

    await app.register(treatmentPlanReminderRoutes, {
      service: {} as never,
      repository: repository as never,
      authService: authService as never,
      cookieName: 'test-cookie',
    });

    const headers = { 'x-tenant-id': tenantPublicId };
    const getResponse = await app.inject({
      method: 'GET',
      url: `/platform/tenants/${tenantPublicId}/reminder-config`,
      headers,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(repository.getConfig).toHaveBeenCalledWith(1n);

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/platform/tenants/${tenantPublicId}/reminder-config`,
      headers,
      payload: { enabled: false, channel: 'WHATSAPP', sequence: [] },
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(repository.updateConfig).toHaveBeenCalledWith(1n, {
      enabled: false,
      channel: 'WHATSAPP',
      sequence: [],
    });

    await app.close();
  });
});
