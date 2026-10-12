import { AppError } from './errors.js';
export function parse(schema, data) {
    const result = schema.safeParse(data);
    if (result.success)
        return result.data;
    const fields = {};
    for (const issue of result.error.issues) {
        const key = issue.path.join('.');
        if (!(key in fields))
            fields[key] = issue.message;
    }
    throw new AppError('VALIDATION', 'Invalid input', fields);
}
