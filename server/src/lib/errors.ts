import type { ErrorCode } from '@life-tracker/shared';

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  LOCKED_OUT: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}

export const notFound = (what: string): AppError => new AppError('NOT_FOUND', `${what} not found`);
