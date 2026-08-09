import pino from 'pino';

import { buildApp } from './app.js';
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
  const database = createDatabaseConnection(environment.DATABASE_URL, {
    passwordArgon2: {
      memoryCost: environment.PASSWORD_ARGON2_MEMORY_COST,
      timeCost: environment.PASSWORD_ARGON2_TIME_COST,
      parallelism: environment.PASSWORD_ARGON2_PARALLELISM,
    },
    sessionTtlHours: environment.AUTH_SESSION_TTL_HOURS,
    ...(environment.SMTP_HOST === undefined || environment.SMTP_FROM === undefined
      ? {}
      : {
          smtp: {
            host: environment.SMTP_HOST,
            port: environment.SMTP_PORT,
            secure: environment.SMTP_SECURE,
            user: environment.SMTP_USER,
            pass: environment.SMTP_PASS,
            from: environment.SMTP_FROM,
          },
        }),
    ...(environment.VAPID_PUBLIC_KEY === undefined ||
    environment.VAPID_PRIVATE_KEY === undefined ||
    environment.VAPID_SUBJECT === undefined
      ? {}
      : {
          vapid: {
            publicKey: environment.VAPID_PUBLIC_KEY,
            privateKey: environment.VAPID_PRIVATE_KEY,
            subject: environment.VAPID_SUBJECT,
          },
        }),
    ...(environment.PAYMENT_GATEWAY_ENCRYPTION_KEY === undefined
      ? {}
      : { paymentGatewayEncryptionKey: environment.PAYMENT_GATEWAY_ENCRYPTION_KEY }),
  });
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
