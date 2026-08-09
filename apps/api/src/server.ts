import pino from 'pino';

import { buildApp } from './app.js';
import { databaseOptionsFromEnvironment } from './config/database-options.js';
import {
  EnvironmentValidationError,
  loadEnvironment,
  type Environment,
} from './config/environment.js';
import { createDatabaseConnection } from './database/connection.js';
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

  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
  app.log.info({ host: environment.API_HOST, port: environment.API_PORT }, 'API inicializada');
}

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
