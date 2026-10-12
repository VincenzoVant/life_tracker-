import { expect, test } from 'vitest';
import { mockApi, takeUnmatchedCalls } from './mockApi';

test('unmatched calls are recorded even when the caller swallows the error', async () => {
  mockApi({ 'GET /api/known': () => ({}) });
  await fetch('/api/known');
  await fetch('/api/nope?x=1', { method: 'POST' }).catch(() => undefined);
  expect(takeUnmatchedCalls()).toEqual(['POST /api/nope']);
  expect(takeUnmatchedCalls()).toEqual([]);
});
