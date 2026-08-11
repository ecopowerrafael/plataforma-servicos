import { type ErrorDetail, type ErrorResponse } from '@plataforma/shared';
import { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { AppError } from './AppError.js';

interface ErrorHandlerOptions {
  /**
   * Fallback opcional para navegação SPA. Retorna `true` quando já respondeu
   * (ex.: enviou o index.html do frontend compilado); nesse caso o 404 JSON
   * padrão é suprimido. Usado apenas no deploy single-origin.
   */
  spaFallback?: (request: FastifyRequest, reply: FastifyReply) => boolean;
}

function validationDetails(error: FastifyError): ErrorDetail[] | undefined {
  if (error.validation === undefined) {
    return undefined;
  }

  return error.validation.map((issue) => ({
    path: issue.instancePath || issue.schemaPath,
    message: issue.message ?? 'Valor inválido.',
  }));
}

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'code' in error;
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    error.statusCode === statusCode
  );
}

function createErrorResponse(
  requestId: string,
  code: string,
  message: string,
  details?: ErrorDetail[],
): ErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function diagnosticValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value).slice(0, 500);
  return null;
}

function whiteLabelDiagnosticDetails(error: unknown): ErrorDetail[] {
  const candidate =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const details: ErrorDetail[] = [];
  for (const key of ['name', 'code', 'message']) {
    const value = diagnosticValue(candidate[key]);
    if (value !== null) details.push({ path: `error.${key}`, message: value });
  }
  const meta = candidate.meta;
  if (typeof meta === 'object' && meta !== null) {
    const metaRecord = meta as Record<string, unknown>;
    for (const key of ['modelName', 'field_name', 'column', 'table']) {
      const value = diagnosticValue(metaRecord[key]);
      if (value !== null) details.push({ path: `error.meta.${key}`, message: value });
    }
    const adapter = metaRecord.driverAdapterError;
    if (typeof adapter === 'object' && adapter !== null) {
      const cause = (adapter as Record<string, unknown>).cause;
      if (typeof cause === 'object' && cause !== null) {
        const causeRecord = cause as Record<string, unknown>;
        for (const key of ['originalCode', 'originalMessage', 'kind']) {
          const value = diagnosticValue(causeRecord[key]);
          if (value !== null)
            details.push({ path: `error.meta.driver.${key}`, message: value });
        }
      }
    }
  }
  const issues = candidate.issues;
  if (Array.isArray(issues)) {
    for (const issue of issues.slice(0, 5)) {
      if (typeof issue !== 'object' || issue === null) continue;
      const issueRecord = issue as Record<string, unknown>;
      const path = Array.isArray(issueRecord.path) ? issueRecord.path.join('.') : 'unknown';
      const message = diagnosticValue(issueRecord.message);
      if (message !== null)
        details.push({ path: `validation.${path || 'root'}`, message });
    }
  }
  return details;
}

export function registerErrorHandlers(app: FastifyInstance, options: ErrorHandlerOptions = {}): void {
  app.setNotFoundHandler((request, reply) => {
    if (options.spaFallback?.(request, reply) === true) {
      return;
    }
    void reply
      .status(404)
      .send(
        createErrorResponse(
          request.id,
          'ROUTE_NOT_FOUND',
          'O recurso solicitado não foi encontrado.',
        ),
      );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error, requestId: request.id }, 'Falha operacional na requisição');
      void reply
        .status(error.statusCode)
        .send(createErrorResponse(request.id, error.code, error.message, error.details));
      return;
    }

    const details = isFastifyError(error) ? validationDetails(error) : undefined;
    if (details !== undefined) {
      void reply
        .status(400)
        .send(
          createErrorResponse(
            request.id,
            'VALIDATION_ERROR',
            'Os dados enviados são inválidos.',
            details,
          ),
        );
      return;
    }

    if (isFastifyError(error) && error.statusCode === 413) {
      void reply
        .status(413)
        .send(
          createErrorResponse(
            request.id,
            'PAYLOAD_TOO_LARGE',
            'O conteúdo enviado excede o limite permitido.',
          ),
        );
      return;
    }

    if (hasStatusCode(error, 429)) {
      void reply
        .status(429)
        .send(
          createErrorResponse(
            request.id,
            'RATE_LIMITED',
            'Muitas tentativas. Aguarde antes de tentar novamente.',
          ),
        );
      return;
    }

    if (isFastifyError(error) && error.statusCode === 400) {
      void reply
        .status(400)
        .send(
          createErrorResponse(request.id, 'INVALID_REQUEST', 'A requisição enviada é inválida.'),
        );
      return;
    }

    request.log.error({ err: error, requestId: request.id }, 'Falha interna na requisição');
    if (request.method === 'GET' && request.url.split('?')[0] === '/tenant/white-label') {
      void reply
        .status(500)
        .send(
          createErrorResponse(
            request.id,
            'TENANT_WHITE_LABEL_GLOBAL_DIAGNOSTIC',
            'Falha diagnosticada globalmente ao carregar Marca e aparência.',
            whiteLabelDiagnosticDetails(error),
          ),
        );
      return;
    }
    void reply
      .status(500)
      .send(
        createErrorResponse(
          request.id,
          'INTERNAL_ERROR',
          'Não foi possível processar a requisição.',
        ),
      );
  });
}
