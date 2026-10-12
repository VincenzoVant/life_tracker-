import { expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

test('production allowedOrigins exclude vite dev origin and include LT_PUBLIC_ORIGIN', () => {
  const c = loadConfig({ HOME: '/u', NODE_ENV: 'production', LT_PUBLIC_ORIGIN: 'https://mac.tail1.ts.net' } as any);
  expect(c.allowedOrigins).toEqual(['http://127.0.0.1:4280', 'http://localhost:4280', 'https://mac.tail1.ts.net']);
});

test('production allowedOrigins without public origin', () => {
  const c = loadConfig({ HOME: '/u', NODE_ENV: 'production', LT_PORT: '5000' } as any);
  expect(c.allowedOrigins).toEqual(['http://127.0.0.1:5000', 'http://localhost:5000']);
});

test('non-production keeps vite dev origin', () => {
  expect(loadConfig({ HOME: '/u' } as any).allowedOrigins).toContain('http://localhost:5173');
});
