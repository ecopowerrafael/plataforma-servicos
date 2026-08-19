import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerErrorHandlers } from '../../errors/error-handler.js';
import { platformRoutes } from './platform.routes.js';
import { PlatformService } from './platform.service.js';

const policy = {
  publicId: '11111111-1111-4111-8111-111111111111',
  defaultTrialDays: 7,
  graceDays: 7,
  autoSuspendAfterGrace: true,
  allowAdminLoginWhileBlocked: true,
  allowCalendarReadWhileBlocked: true,
  allowAdminChangesWhileBlocked: false,
  allowInternalBookingWhileBlocked: false,
  allowPublicBookingWhileBlocked: false,
  publicSiteBehaviorWhileBlocked: 'HIDE_BOOKING' as const,
  adminMessage: 'Mensagem administrativa.',
  publicMessage: 'Mensagem pública.',
  commercialWhatsapp: null,
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
};
const apps: FastifyInstance[] = [];

async function fixture() {
  const update = vi.fn().mockImplementation(async (input) => ({ policy: { ...policy, ...input } }));
  const platformService = new PlatformService({} as never);
  vi.spyOn(platformService, 'resolveAuth').mockResolvedValue({
    administrator: { id: 1n, publicId: policy.publicId, status: 'ACTIVE' },
    user: { id: 2n, publicId: policy.publicId, email: 'admin@agendei.com', status: 'ACTIVE' },
    permissions: ['platform.commercial_policy.read', 'platform.commercial_policy.manage'],
  });
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);
  await app.register(cookie);
  await app.register(platformRoutes, {
    service: platformService,
    authService: { authenticate: vi.fn().mockResolvedValue({}) } as never,
    cookieName: 'ps_session',
    commercialPolicyService: { get: vi.fn().mockResolvedValue(policy), update } as never,
  });
  apps.push(app);
  return { app, update };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('commercial policy HTTP contract', () => {
  it('normalizes the commercial WhatsApp and reports its field when invalid', async () => {
    const { app, update } = await fixture();
    const valid = await app.inject({
      method: 'PATCH',
      url: '/platform/commercial-policy',
      headers: { cookie: 'ps_session=test' },
      payload: { commercialWhatsapp: '+55 (15) 99711-8125' },
    });
    expect(valid.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ commercialWhatsapp: '5515997118125' }),
      expect.anything(),
      expect.anything(),
    );

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/platform/commercial-policy',
      headers: { cookie: 'ps_session=test' },
      payload: { commercialWhatsapp: '5515' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [
          { path: '/commercialWhatsapp', message: 'Informe um número válido com DDI e DDD.' },
        ],
      },
    });
  });

  it('accepts the exact editable values returned by GET without read-only fields', async () => {
    const { app, update } = await fixture();
    const received = (
      await app.inject({
        method: 'GET',
        url: '/platform/commercial-policy',
        headers: { cookie: 'ps_session=test' },
      })
    ).json();
    const {
      publicId: _publicId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...payload
    } = received;
    const response = await app.inject({
      method: 'PATCH',
      url: '/platform/commercial-policy',
      headers: { cookie: 'ps_session=test' },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({
        publicId: expect.anything(),
        createdAt: expect.anything(),
        updatedAt: expect.anything(),
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});
