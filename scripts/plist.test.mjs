import { describe, expect, test } from 'vitest';
import { renderPlist, parsePlistOptions, resolveNodePath, mergeOptions } from './plist.mjs';

const base = {
  label: 'com.lifetracker.server',
  nodePath: '/opt/homebrew/bin/node',
  repoDir: '/Users/v/life-tracker',
  dataDir: '/Users/v/LifeTracker',
  port: 4280,
  publicOrigin: 'https://mac.tail1.ts.net',
};

describe('renderPlist', () => {
  test('contains program args, env and KeepAlive', () => {
    const xml = renderPlist(base);
    expect(xml).toContain('<string>/Users/v/life-tracker/server/src/index.ts</string>');
    expect(xml).toContain('<string>--import</string>');
    expect(xml).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(xml).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(xml).toContain('<key>LT_PUBLIC_ORIGIN</key>');
    expect(xml).toContain('<key>NODE_ENV</key>\n\t\t<string>production</string>');
    expect(xml).toContain('<key>PATH</key>\n\t\t<string>/opt/homebrew/bin:/usr/bin:/bin</string>');
    expect(xml).toContain('<string>/Users/v/LifeTracker/logs/launchd.out.log</string>');
    expect(xml).toContain('<string>/Users/v/LifeTracker/logs/launchd.err.log</string>');
    expect(xml).toContain('<key>WorkingDirectory</key>\n\t<string>/Users/v/life-tracker</string>');
  });

  test('escapes XML special characters in paths', () => {
    expect(renderPlist({ ...base, repoDir: '/Users/v/A&B' })).toContain('/Users/v/A&amp;B');
    expect(renderPlist({ ...base, publicOrigin: 'https://x/<a>' })).toContain('https://x/&lt;a&gt;');
  });

  test('omits LT_PUBLIC_ORIGIN when not given', () => {
    const { publicOrigin: _omit, ...rest } = base;
    expect(renderPlist(rest)).not.toContain('LT_PUBLIC_ORIGIN');
  });
});

describe('resolveNodePath', () => {
  const cellar = '/opt/homebrew/Cellar/node/26.8.2/bin/node';
  const fake = (map) => (p) => {
    if (!(p in map)) throw new Error('ENOENT');
    return map[p];
  };

  test('prefers a stable symlink resolving to the same binary', () => {
    const rp = fake({ [cellar]: cellar, '/opt/homebrew/bin/node': cellar });
    expect(resolveNodePath(cellar, undefined, rp)).toBe('/opt/homebrew/bin/node');
  });

  test('falls back to execPath when no candidate matches or exists', () => {
    expect(resolveNodePath(cellar, undefined, fake({ [cellar]: cellar, '/opt/homebrew/bin/node': '/other' }))).toBe(cellar);
    expect(resolveNodePath(cellar, undefined, fake({ [cellar]: cellar }))).toBe(cellar);
    expect(resolveNodePath(cellar, undefined, fake({}))).toBe(cellar);
  });
});

describe('mergeOptions', () => {
  const ctx = { home: '/h', repoDir: '/r', nodePath: '/n' };

  test('defaults, then existing plist, then CLI values win', () => {
    expect(mergeOptions(ctx)).toMatchObject({ port: 4280, dataDir: '/h/LifeTracker', publicOrigin: undefined });
    const existing = { port: 5000, dataDir: '/d', publicOrigin: 'https://a' };
    expect(mergeOptions({ ...ctx, existing })).toMatchObject({ port: 5000, dataDir: '/d', publicOrigin: 'https://a' });
    expect(mergeOptions({ ...ctx, existing, values: { port: '6000', 'public-origin': 'https://b' } })).toMatchObject({
      port: 6000,
      dataDir: '/d',
      publicOrigin: 'https://b',
    });
  });

  test('invalid port names its source', () => {
    expect(() => mergeOptions({ ...ctx, values: { port: 'abc' } })).toThrow(/abc.*--port/);
    expect(() => mergeOptions({ ...ctx, existing: { port: 99999 } })).toThrow(/99999.*installed plist/);
  });
});

describe('parsePlistOptions', () => {
  test('round-trips what renderPlist wrote, including escaped values', () => {
    const o = { ...base, dataDir: '/Users/v/Life&Tracker' };
    expect(parsePlistOptions(renderPlist(o))).toEqual({
      dataDir: o.dataDir,
      port: 4280,
      publicOrigin: o.publicOrigin,
    });
  });

  test('returns undefined publicOrigin when absent', () => {
    const { publicOrigin: _omit, ...rest } = base;
    expect(parsePlistOptions(renderPlist(rest)).publicOrigin).toBeUndefined();
  });
});
