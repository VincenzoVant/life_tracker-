export type ErrorCode = 'VALIDATION' | 'UNAUTHORIZED' | 'FORBIDDEN_ORIGIN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID_TRANSITION' | 'LOCKED_OUT' | 'INTERNAL';
export interface ErrorBody {
    error: {
        code: ErrorCode;
        message: string;
        fields?: Record<string, string>;
    };
}
