import { resolve } from 'node:path';

import { config } from 'dotenv';
import { z } from 'zod';

import { buildDatabaseUrl } from './database-url.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    // Diretório com o frontend Vite já compilado (apps/web/dist). Quando definido,
    // a própria API serve os arquivos estáticos e faz o fallback SPA — usado no
    // deploy single-origin (ex.: Node.js compartilhado da Hostinger). Opcional:
    // em desenvolvimento o Vite serve o frontend separadamente.
    WEB_DIST_DIR: z.string().trim().min(1).optional(),
    DATABASE_URL: z.url().superRefine((value, context) => {
      const databaseUrl = new URL(value);

      if (databaseUrl.protocol !== 'mysql:') {
        context.addIssue({ code: 'custom', message: 'O protocolo deve ser mysql.' });
      }

      if (
        databaseUrl.hostname.length === 0 ||
        databaseUrl.username.length === 0 ||
        databaseUrl.pathname.length <= 1
      ) {
        context.addIssue({ code: 'custom', message: 'A URL do banco está incompleta.' });
      }
    }),
    CORS_ORIGINS: z
      .string()
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(z.url()).min(1)),
    LOG_LEVEL: z.enum(logLevels),
    OBSERVABILITY_SLOW_REQUEST_MS: z.coerce.number().int().min(1).max(120_000).default(1_000),
    APP_WEB_URL: z.url().default('http://localhost:5173'),
    PUBLIC_BASE_DOMAIN: z.string().trim().toLowerCase().optional(),
    GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
    GOOGLE_SEARCH_CONSOLE_SITE_URL: z.string().trim().min(1).optional(),
    GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON: z.string().trim().min(2).optional(),
    GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: z.string().trim().min(1).optional(),
    INDEXNOW_KEY: z.string().trim().regex(/^[A-Za-z0-9-]{8,128}$/u).optional(),
    INDEXNOW_ENDPOINT: z.url().optional(),
    DIRECTORY_IMPORT_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
    DIRECTORY_IMPORT_MAX_XML_MB: z.coerce.number().int().min(1).max(100).default(20),
    DIRECTORY_LOCAL_MIN_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
    GEOAPIFY_API_KEY: z.string().trim().min(1).optional(),
    /**
     * Chave mestra da W-API (API Integration). Fica só no backend: nunca é
     * devolvida por rota nem registrada em log — serve apenas para criar e
     * administrar instâncias dos tenants.
     */
    WAPI_MASTER_API_KEY: z.string().trim().min(8).optional(),
    /** Base opcional; o cliente da W-API já usa a URL oficial por padrão. */
    WAPI_BASE_URL: z.url().optional(),
    AUTH_COOKIE_NAME: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,64}$/u)
      .default('ps_session'),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    AUTH_MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(20).default(5),
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PASSWORD_ARGON2_MEMORY_COST: z.coerce.number().int().min(19_456).max(1_048_576).default(65_536),
    PASSWORD_ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
    PASSWORD_ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(2).max(100).default(5),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(48),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASS: z.string().trim().min(1).optional(),
    SMTP_FROM: z.email().trim().optional(),
    // Mail API oficial da Hostinger: preferida ao SMTP quando configurada.
    HOSTINGER_MAIL_API_TOKEN: z.string().trim().min(1).optional(),
    MAIL_FROM: z.email().trim().optional(),
    HOSTINGER_MAIL_DISPLAY_NAME: z.string().trim().min(1).optional(),
    HOSTINGER_MAIL_MAILBOX_ID: z.string().trim().min(1).optional(),
    HOSTINGER_MAIL_API_BASE_URL: z.url().trim().optional(),
    VAPID_PUBLIC_KEY: z.string().trim().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().trim().min(1).optional(),
    VAPID_SUBJECT: z.string().trim().min(1).optional(),
    PAYMENT_GATEWAY_ENCRYPTION_KEY: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{64}$/iu, 'Deve ser uma chave hexadecimal de 32 bytes (64 caracteres).')
      .optional(),
    // Provisionamento do primeiro administrador da plataforma (Super Admin).
    // Opcional e temporário: quando ambos são definidos, o servidor garante, no
    // start, que exista um administrador com esse e-mail (cria o usuário com a
    // senha informada, apenas com hash, se ainda não existir). Remova a senha do
    // ambiente após o primeiro acesso.
    PLATFORM_ADMIN_EMAIL: z.email().trim().optional(),
    PLATFORM_ADMIN_PASSWORD: z.string().min(12).max(200).optional(),
    PROSPECTING_DRY_RUN: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    PROSPECTING_FLOW_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PROSPECTING_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PROSPECTING_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    PROSPECTING_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(10),
    PROSPECTING_LOCK_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
    PROSPECTING_SENDING_STALE_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    PROSPECTING_MAX_SEND_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
    PROSPECTING_TIMEZONE: z.string().default('America/Sao_Paulo'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Origem universal não é permitida em produção.',
      });
    }

    if (value.NODE_ENV === 'production' && !value.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'Cookies de produção devem utilizar Secure.',
      });
    }

    if (value.NODE_ENV === 'production' && !value.APP_WEB_URL.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['APP_WEB_URL'],
        message: 'A URL web de produção deve utilizar HTTPS.',
      });
    }
  });

export type Environment = Readonly<z.infer<typeof environmentSchema>>;

export class EnvironmentValidationError extends Error {
  public readonly fields: string[];

  public constructor(fields: string[], message = 'As variáveis de ambiente são inválidas.') {
    super(message);
    this.name = 'EnvironmentValidationError';
    this.fields = fields;
  }

  public static fromZod(issues: z.core.$ZodIssue[]): EnvironmentValidationError {
    return new EnvironmentValidationError([
      ...new Set(issues.map((issue) => issue.path.join('.') || 'environment')),
    ]);
  }
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const normalized: NodeJS.ProcessEnv = { ...source };

  // Hospedagens Node.js gerenciadas (Hostinger, entre outras) injetam a porta
  // exclusivamente via `PORT`. Reaproveitamos esse valor para `API_PORT` quando
  // este não é definido explicitamente, sem alterar o contrato interno da API.
  if (normalized.API_PORT === undefined && normalized.PORT !== undefined) {
    normalized.API_PORT = normalized.PORT;
  }

  // Quando `DATABASE_URL` não é fornecida, montamos a partir de DB_* — assim o
  // operador configura só DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/
  // DB_CONNECTION_LIMIT (a senha nunca é logada; ver redações do logger).
  if (normalized.DATABASE_URL === undefined || normalized.DATABASE_URL.trim().length === 0) {
    if (
      normalized.NODE_ENV === 'production' &&
      normalized.DB_NAME !== undefined &&
      normalized.DB_USER !== undefined
    ) {
      const missing = (['DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const).filter((key) => {
        const value = normalized[key];
        return value === undefined || value.trim().length === 0;
      });
      if (missing.length > 0) {
        throw new EnvironmentValidationError(
          [...missing],
          'Configuração de banco incompleta: informe DB_NAME, DB_USER e DB_PASSWORD (ou DATABASE_URL).',
        );
      }
    }

    const built = buildDatabaseUrl(normalized);
    if (built !== undefined) {
      normalized.DATABASE_URL = built;
    }
  }

  const result = environmentSchema.safeParse(normalized);

  if (!result.success) {
    throw EnvironmentValidationError.fromZod(result.error.issues);
  }

  // Log seguro: apenas indica se a chave está configurada corretamente
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const encryptionKeyConfigured = Boolean(normalized.PAYMENT_GATEWAY_ENCRYPTION_KEY);
    const encryptionKeyValid =
      normalized.PAYMENT_GATEWAY_ENCRYPTION_KEY !== undefined &&
      /^[0-9a-f]{64}$/iu.test(normalized.PAYMENT_GATEWAY_ENCRYPTION_KEY);
    console.log('[Environment] Encryption key status:', {
      paymentGatewayEncryptionKeyConfigured: encryptionKeyConfigured,
      paymentGatewayEncryptionKeyValid: encryptionKeyValid,
    });
  }

  return Object.freeze(result.data);
}
