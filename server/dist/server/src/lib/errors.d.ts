import type { ErrorCode } from '@life-tracker/shared';
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly fields?: Record<string, string> | undefined;
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500;
    constructor(code: ErrorCode, message: string, fields?: Record<string, string> | undefined);
}
export declare const notFound: (what: string) => AppError;
