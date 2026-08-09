import { type ErrorDetail } from '@plataforma/shared';

interface AppErrorOptions {
  code: string;
  message: string;
  statusCode: number;
  details?: ErrorDetail[];
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: ErrorDetail[] | undefined;
  public readonly operational = true;

  public constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}
