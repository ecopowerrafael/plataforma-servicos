import pino from 'pino';

import { buildApp } from './app.js';
import { databaseOptionsFromEnvironment } from './config/database-options.js';
import {
  EnvironmentValidationError,
  loadEnvironment,
  type Environment,
} from './config/environment.js';
import { createDatabaseConnection } from './database/connection.js';
import { PasswordService } from './modules/auth/password.service.js';
import { startNotificationWorker } from './modules/notifications/notification-worker.js';

const bootstrapLogger = pino({
  level: 'info',
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.apiKey', '*.DATABASE_URL'],
    censor: '[REDACTED]',
  },
});

async function start(environment: Environment): Promise<void> {
  const database = createDatabaseConnection(
    environment.DATABASE_URL,
    databaseOptionsFromEnvironment(environment),
  );
  const app = await buildApp({ environment, database });
  let shuttingDown = false;

  const stopNotificationWorker =
    database.appointmentReminders !== undefined && database.notifications !== undefined
      ? startNotificationWorker(
          {
            reminders: database.appointmentReminders,
            notifications: database.notifications,
            ...(database.automations === undefined ? {} : { automations: database.automations }),
            ...(database.customerRecovery === undefined
              ? {}
              : { customerRecovery: database.customerRecovery }),
            ...(database.loyalty === undefined ? {} : { loyalty: database.loyalty }),
            ...(database.commercialSweep === undefined
              ? {}
              : { commercialSweep: database.commercialSweep }),
          },
          { intervalMs: 60_000, logger: app.log },
        )
      : undefined;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, 'Encerramento iniciado');
    stopNotificationWorker?.();

    try {
      await app.close();
      app.log.info('Encerramento concluído');
    } catch (error) {
      app.log.error({ err: error }, 'Falha durante o encerramento');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Provisionamento idempotente do primeiro administrador da plataforma quando
  // PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD estão presentes (primeiro
  // acesso). Não-fatal: falha aqui não impede a API de subir. A senha só é usada
  // para gerar o hash caso o usuário ainda não exista; nunca é registrada.
  if (
    environment.PLATFORM_ADMIN_EMAIL !== undefined &&
    environment.PLATFORM_ADMIN_PASSWORD !== undefined &&
    database.platform !== undefined
  ) {
    const email = environment.PLATFORM_ADMIN_EMAIL;
    const password = environment.PLATFORM_ADMIN_PASSWORD;
    try {
      const passwordService = new PasswordService({
        memoryCost: environment.PASSWORD_ARGON2_MEMORY_COST,
        timeCost: environment.PASSWORD_ARGON2_TIME_COST,
        parallelism: environment.PASSWORD_ARGON2_PARALLELISM,
      });
      const result = await database.platform.ensureInitialAdministrator({
        email,
        hashPassword: () => passwordService.hash(password),
        metadata: { ipAddress: null, userAgent: 'startup-platform-admin-provisioning' },
      });
      app.log.info({ email, result }, 'Provisionamento do administrador da plataforma concluído.');
    } catch (error) {
      app.log.error({ err: error }, 'Falha ao provisionar o administrador da plataforma.');
    }
  }

  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
  app.log.info({ host: environment.API_HOST, port: environment.API_PORT }, 'API inicializada');
}

// Sem `await` de topo: o loader de Node.js da Hostinger (LiteSpeed lsnode)
// carrega o entry file com `require()`, que não aceita um grafo ESM com
// top-level await (ERR_REQUIRE_ASYNC_MODULE). Encapsulamos a inicialização em
// uma função assíncrona disparada sem await no escopo do módulo.
async function bootstrap(): Promise<void> {
  try {
    const environment = loadEnvironment();
    await start(environment);
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      bootstrapLogger.fatal({ fields: error.fields }, error.message);
    } else {
      bootstrapLogger.fatal({ err: error }, 'Falha ao inicializar a API');
    }

    process.exitCode = 1;
  }
}

void bootstrap();
