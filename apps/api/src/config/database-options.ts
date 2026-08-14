import { type Environment } from './environment.js';
import { type CustomerAuthOptions } from '../database/connection.js';

/**
 * Monta as opções da conexão de banco a partir do ambiente validado.
 * Extraído para ser reutilizado pela API (`server.ts`) e pelo worker avulso
 * de cron (`worker/run-once.ts`), garantindo comportamento idêntico entre a
 * execução contínua e a execução agendada — sem duplicar a montagem.
 */
export function databaseOptionsFromEnvironment(environment: Environment): CustomerAuthOptions {
  return {
    ...(environment.PUBLIC_BASE_DOMAIN === undefined
      ? {}
      : { publicBaseDomain: environment.PUBLIC_BASE_DOMAIN }),
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
    ...(environment.HOSTINGER_MAIL_API_TOKEN === undefined || environment.MAIL_FROM === undefined
      ? {}
      : {
          hostingerMail: {
            token: environment.HOSTINGER_MAIL_API_TOKEN,
            from: environment.MAIL_FROM,
            displayName: environment.HOSTINGER_MAIL_DISPLAY_NAME,
            mailboxResourceId: environment.HOSTINGER_MAIL_MAILBOX_ID,
            baseUrl: environment.HOSTINGER_MAIL_API_BASE_URL,
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
  };
}
