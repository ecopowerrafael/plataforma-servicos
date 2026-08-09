import { type ErrorDetail, type ErrorResponse } from '@plataforma/shared';
import { type FastifyError, type FastifyInstance } from 'fastify';

import { AppError } from './AppError.js';

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

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
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
