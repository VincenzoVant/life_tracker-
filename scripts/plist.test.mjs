import { describe, expect, test } from 'vitest';
import { renderPlist, parsePlistOptions } from './plist.mjs';

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
