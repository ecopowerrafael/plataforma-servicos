import { ErrorResponseSchema, type ErrorResponse } from '@plataforma/shared';
import { type ZodType } from 'zod';

import { environment } from '../config/environment.js';

export class HttpError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema: ZodType<T>;
  tenantPublicId?: string;
}

async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const response = await fetch(`${environment.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined || options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.tenantPublicId === undefined ? {} : { 'X-Tenant-Id': options.tenantPublicId }),
    },
    credentials: 'include',
    ...(options.body === undefined
      ? {}
      : { body: options.body instanceof FormData ? options.body : JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    let payload: ErrorResponse | undefined;
    try {
      payload = ErrorResponseSchema.parse(await response.json());
    } catch {
      payload = undefined;
    }
    throw new HttpError(
      payload?.error.message ?? 'Não foi possível concluir a solicitação.',
      response.status,
      payload?.error.code ?? 'HTTP_ERROR',
    );
  }

  return options.schema.parse(await response.json());
}

export const httpClient = Object.freeze({ request });
