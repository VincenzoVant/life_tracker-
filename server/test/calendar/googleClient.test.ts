import { describe, expect, test } from 'vitest';
import { CalendarApiError } from '../../src/calendar/client.js';
import { toCalendarApiError } from '../../src/calendar/googleClient.js';

describe('toCalendarApiError', () => {
  test('maps invalid_grant → 401 reason invalid_grant; network → 0; 410 → 410', () => {
    const grant = toCalendarApiError({ message: 'invalid_grant', response: { status: 400, data: { error: 'invalid_grant' } } });
    expect(grant).toBeInstanceOf(CalendarApiError);
    expect(grant).toMatchObject({ status: 401, reason: 'invalid_grant' });

    const net = toCalendarApiError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    expect(net.status).toBe(0);

    const gone = toCalendarApiError({
      message: 'Sync token is no longer valid',
      response: { status: 410, data: { error: { code: 410, errors: [{ reason: 'fullSyncRequired' }] } } },
    });
    expect(gone).toMatchObject({ status: 410, reason: 'fullSyncRequired' });
  });

  test('keeps rate-limit reason and passes CalendarApiError through', () => {
    const rl = toCalendarApiError({
      message: 'Rate Limit Exceeded',
      response: { status: 403, data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } },
    });
    expect(rl).toMatchObject({ status: 403, reason: 'rateLimitExceeded' });
    const own = new CalendarApiError(404);
    expect(toCalendarApiError(own)).toBe(own);
  });
});
