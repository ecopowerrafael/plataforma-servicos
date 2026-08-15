import pino from 'pino';

import { buildApp } from './app.js';
import { databaseOptionsFromEnvironment } from './config/database-options.js';
import {
  EnvironmentValidationError,
  loadEnvironment,
  type Environment,
} from './config/environment.js';
import { createDatabaseConnection, type DatabaseConnection } from './database/connection.js';
import { PasswordService } from './modules/auth/password.service.js';
import { startNotificationWorker } from './modules/notifications/notification-worker.js';

const bootstrapLogger = pino({
  level: 'info',
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.apiKey', '*.DATABASE_URL'],
    censor: '[REDACTED]',
  },
});

async function start(environment: Environment, startedAt: number): Promise<void> {
  const since = () => `${String(Date.now() - startedAt)}ms`;
  const database = createDatabaseConnection(
    environment.DATABASE_URL,
    databaseOptionsFromEnvironment(environment),
  );
  bootstrapLogger.info({ elapsed: since() }, 'Conexão de banco criada');
  const app = await buildApp({ environment, database });
  bootstrapLogger.info({ elapsed: since() }, 'Aplicação construída');
  let shuttingDown = false;

  const startWorker = () =>
    database.appointmentReminders !== undefined && database.notifications !== undefined
      ? startNotificationWorker(
          {
            reminders: database.appointmentReminders,
            notifications: database.notifications,
            ...(database.notificationCampaigns === undefined
              ? {}
              : { campaigns: database.notificationCampaigns }),
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
  const worker: { stop: (() => void) | undefined } = { stop: undefined };

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, 'Encerramento iniciado');
    worker.stop?.();

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

  // A partir daqui nada mais pode atrasar o listen: o ambiente da Hostinger
  // derruba o processo se o servidor não abrir a porta em poucos segundos.
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
  app.log.info(
    { host: environment.API_HOST, port: environment.API_PORT, elapsed: since() },
    'API inicializada',
  );

  // Tarefas auxiliares só depois que o HTTP já responde.
  void runPostStartTasks(environment, database, app);
  worker.stop = startWorker();
  app.log.info({ elapsed: since() }, 'Tarefas pós-início disparadas');
}

/**
 * Provisionamento idempotente do primeiro administrador da plataforma quando
 * PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD estão presentes. Não-fatal e
 * fora do caminho crítico: roda depois do `listen`, sem bloquear o HTTP.
 */
async function runPostStartTasks(
  environment: Environment,
  database: DatabaseConnection,
  app: Awaited<ReturnType<typeof buildApp>>,
): Promise<void> {
  if (
    environment.PLATFORM_ADMIN_EMAIL === undefined ||
    environment.PLATFORM_ADMIN_PASSWORD === undefined ||
    database.platform === undefined
  )
    return;
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

// Sem `await` de topo: o loader de Node.js da Hostinger (LiteSpeed lsnode)
// carrega o entry file com `require()`, que não aceita um grafo ESM com
// top-level await (ERR_REQUIRE_ASYNC_MODULE). Encapsulamos a inicialização em
// uma função assíncrona disparada sem await no escopo do módulo.
async function bootstrap(): Promise<void> {
  try {
    const startedAt = Date.now();
    const environment = loadEnvironment();
    bootstrapLogger.info({ elapsed: `${String(Date.now() - startedAt)}ms` }, 'Ambiente carregado');
    await start(environment, startedAt);
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
