import { expect, test } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { createTestClient } from './helpers.js';

test('GET returns defaults, PUT stores and returns merged full object', async () => {
  const c = await createTestClient();
  const got = await c.get('/api/preferences');
  expect(got.status).toBe(200);
  expect(got.body).toEqual(DEFAULT_PREFERENCES);
  const put = await c.put('/api/preferences', { bufferMinutes: 30, studyBlock: { min: 60, max: 90 } });
  expect(put.status).toBe(200);
  expect(put.body.bufferMinutes).toBe(30);
  expect(put.body.eveningStart).toBe('19:00');
  const again = await c.get('/api/preferences');
  expect(again.body).toEqual(put.body);
});
test('PUT invalid returns 400 with fields', async () => {
  const c = await createTestClient();
  const r = await c.put('/api/preferences', { earliestBlock: '23:00', latestBlockEnd: '22:30', studyBlock: { min: 120, max: 60 } });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION');
  expect(r.body.error.fields).toHaveProperty('earliestBlock');
  expect(r.body.error.fields).toHaveProperty('studyBlock.min');
  const stored = await c.get('/api/preferences');
  expect(stored.body).toEqual(DEFAULT_PREFERENCES);
});
