import {
  ErrorResponseSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  type HealthResponse,
  type ReadyResponse,
} from '@plataforma/shared';
import { type FastifyPluginCallbackZod } from 'fastify-type-provider-zod';

import { AppError } from '../errors/AppError.js';

const readinessTimeoutMilliseconds = 5_000;

async function checkDatabaseReadiness(app: Parameters<FastifyPluginCallbackZod>[0]): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('O banco excedeu o prazo da verificação de prontidão.'));
    }, readinessTimeoutMilliseconds);
  });

  try {
    await Promise.race([app.database.ping(), timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export const technicalRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  app.get(
    '/health',
    {
      schema: {
        response: { 200: HealthResponseSchema },
      },
    },
    (): HealthResponse => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }),
  );

  app.get(
    '/ready',
    {
      schema: {
        response: {
          200: ReadyResponseSchema,
          503: ErrorResponseSchema,
        },
      },
    },
    async (request): Promise<ReadyResponse> => {
      try {
        await checkDatabaseReadiness(app);
      } catch (error) {
        request.log.error({ err: error }, 'Banco de dados indisponível');
        throw new AppError({
          code: 'SERVICE_NOT_READY',
          message: 'O serviço não está pronto para receber tráfego.',
          statusCode: 503,
          cause: error,
        });
      }

      return {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    },
  );

  done();
};
