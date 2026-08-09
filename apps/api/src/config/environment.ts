import { resolve } from 'node:path';

import { config } from 'dotenv';
import { z } from 'zod';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    API_HOST: z.string().trim().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65_535),
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
    APP_WEB_URL: z.url().default('http://localhost:5173'),
    PUBLIC_BASE_DOMAIN: z.string().trim().toLowerCase().optional(),
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
    VAPID_PUBLIC_KEY: z.string().trim().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().trim().min(1).optional(),
    VAPID_SUBJECT: z.string().trim().min(1).optional(),
    PAYMENT_GATEWAY_ENCRYPTION_KEY: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{64}$/iu, 'Deve ser uma chave hexadecimal de 32 bytes (64 caracteres).')
      .optional(),
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

  public constructor(issues: z.core.$ZodIssue[]) {
    super('As variáveis de ambiente são inválidas.');
    this.name = 'EnvironmentValidationError';
    this.fields = [...new Set(issues.map((issue) => issue.path.join('.') || 'environment'))];
  }
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return Object.freeze(result.data);
}
