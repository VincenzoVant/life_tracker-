import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { mountStatic } from '../src/static.js';
import { createApp } from '../src/app.js';
import { createTestCtx, request } from './helpers.js';

test('serves index.html for SPA routes but 404 JSON for unknown api routes', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lt-static-'));
  writeFileSync(join(tmp, 'index.html'), '<html>LT</html>');
  mkdirSync(join(tmp, 'assets'));
  writeFileSync(join(tmp, 'assets', 'app.js'), 'console.log(1)');
  const app = createApp(createTestCtx());
  mountStatic(app, tmp);

  expect((await app.request('/today')).status).toBe(200);
  expect(await (await app.request('/today')).text()).toContain('LT');
  expect(await (await app.request('/')).text()).toContain('LT');
  const js = await app.request('/assets/app.js');
  expect(js.status).toBe(200);
  expect(await js.text()).toContain('console.log');
  const setup = await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  const cookie = setup.headers.get('set-cookie')!.split(';')[0]!;
  const missing = await request(app, 'GET', '/api/missing', undefined, { Cookie: cookie });
  expect(missing.status).toBe(404);
  expect(missing.body.error.code).toBe('NOT_FOUND');
  expect((await app.request('/api/health')).status).toBe(200);
});
