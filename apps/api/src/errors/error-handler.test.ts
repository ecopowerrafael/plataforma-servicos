import { ErrorResponseSchema } from '@plataforma/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerErrorHandlers } from './error-handler.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('white-label global diagnostic', () => {
  it('returns safe Prisma metadata for failures outside the service', async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    registerErrorHandlers(app);
    app.get('/tenant/white-label', () => {
      throw Object.assign(new Error('Unknown column tenant_branding.primary_color'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2022',
        meta: {
          modelName: 'TenantBranding',
          driverAdapterError: {
            cause: {
              originalCode: '1054',
              originalMessage: "Unknown column 'tenant_branding.primary_color' in 'field list'",
              kind: 'ColumnNotFound',
            },
          },
        },
      });
    });

    const response = await app.inject({ method: 'GET', url: '/tenant/white-label' });

    expect(response.statusCode).toBe(500);
    const payload = ErrorResponseSchema.parse(JSON.parse(response.body) as unknown);
    expect(payload.error.code).toBe('TENANT_WHITE_LABEL_GLOBAL_DIAGNOSTIC');
    expect(payload.error.details).toEqual(
      expect.arrayContaining([
        { path: 'error.code', message: 'P2022' },
        { path: 'error.meta.modelName', message: 'TenantBranding' },
        { path: 'error.meta.driver.originalCode', message: '1054' },
      ]),
    );
  });
});
