const STATUS = {
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
    code;
    fields;
    status;
    constructor(code, message, fields) {
        super(message);
        this.code = code;
        this.fields = fields;
        this.name = 'AppError';
        this.status = STATUS[code];
    }
}
export const notFound = (what) => new AppError('NOT_FOUND', `${what} not found`);
