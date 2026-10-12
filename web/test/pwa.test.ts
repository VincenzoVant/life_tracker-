import { expect, test } from 'vitest';
import { pwaOptions } from '../src/pwa';

test('service worker never caches /api', () => {
  expect(pwaOptions.workbox!.navigateFallbackDenylist!.some((r) => r.test('/api/blocks'))).toBe(true);
  expect(pwaOptions.workbox!.runtimeCaching ?? []).toHaveLength(0);
});

test('manifest has name, standalone display and both shortcuts', () => {
  const m = pwaOptions.manifest as any;
  expect(m.name).toBe('Life Tracker');
  expect(m.display).toBe('standalone');
  expect(m.shortcuts.map((s: any) => s.url)).toEqual(['/quick-add', '/review']);
});
