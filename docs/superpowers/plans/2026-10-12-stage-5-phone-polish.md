# Stage 5 — Phone Access & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Life Tracker a dependable daily tool:
- it runs as a background service on the Mac that starts at login
- the phone reaches it anywhere through `tailscale serve` and can install it to the home screen as a PWA (with Quick-add and Review shortcuts)
- it shows a friendly screen when the Mac is unreachable
- the database is backed up every night
- the dashboard gains trends and streaks

**Architecture:**
- The launchd agent runs the same `server/src/index.ts` (via `tsx`) with `NODE_ENV=production`. It serves the built PWA from `web/dist`.
- `vite-plugin-pwa` produces the manifest and a service worker that caches only the app shell, never `/api`.
- Backups use SQLite's online backup API from an in-process daily job.
- Logging moves to `pino`, rotated by `pino-roll`.
- Trends and streaks are computed by reusing `getWeekProgress` and `daily_reviews`.

**Tech Stack:** Stages 1–4 stack, plus:
- server: `pino@^10.4.0`, `pino-roll@^4.0.0`
- web: `vite-plugin-pwa@^2.0.0`, `@vite-pwa/assets-generator@^2.0.0` (dev)
- `tsx` moves from devDependencies to dependencies in `server`

**Spec:** `docs/superpowers/specs/2026-10-12-life-tracker-design.md`. Sections covered: §7 offline screen, Dashboard trends/streaks, Settings → Backups; §8 runtime/launchd/logs/backups/`tailscale serve`; §3.3 streaks; §4.6 trends; §11 stage 5; §12 "Mac must be awake".

**Builds on:** Stages 1–4 (`createScheduler`, `getWeekProgress`, `daily_reviews`, `getGoals`, `getSetting`/`setSetting`, `loadConfig`, `AppConfig.allowedOrigins`, `sessionCookie`, `Layout`, `DashboardPage`, `SettingsPage`, `mockApi`).

## Global Constraints

All Global Constraints from Stages 1–4 apply. In addition:

- **launchd:**
  - Label `com.lifetracker.server`, plist at `~/Library/LaunchAgents/com.lifetracker.server.plist`.
  - `RunAtLoad` and `KeepAlive` are both true.
  - stdout and stderr go to `<dataDir>/logs/launchd.out.log` and `launchd.err.log`.
  - Environment: `NODE_ENV=production`, `LT_DATA_DIR`, `LT_PORT`, optional `LT_PUBLIC_ORIGIN`, and `PATH` (the directory of the node binary plus `/usr/bin:/bin`).
- **Production origins.** With `NODE_ENV=production`, `allowedOrigins` is exactly `http://127.0.0.1:<port>`, `http://localhost:<port>` and `LT_PUBLIC_ORIGIN` if set. The Vite dev origin is excluded.
- **Secure cookie.** Also set `Secure` when the request header `X-Forwarded-Proto: https` is present, in addition to the Stage 1 Host rule.
- **Logs.**
  - File: `<dataDir>/logs/server.log`, rotated at 5 MB, keeping 5 files.
  - Request log lines contain method, path (without the query string), status and duration in ms. They **never** contain bodies, cookies or query strings.
- **Backups.**
  - Folder: the setting `backupDir`, default `<dataDir>/backups`; a leading `~` expands to the home directory.
  - File name: `data-YYYY-MM-DD.db` (local date). A second run on the same date overwrites that file.
  - Only files matching `^data-\d{4}-\d{2}-\d{2}\.db$` are pruned, keeping the newest 14. `pre-migrate-*.db` and other files are never touched.
  - Runs daily at `03:00` local, plus on demand. `secrets/` is never copied.
- **Offline screen.**
  - The text is exactly "Life Tracker is offline — your Mac may be asleep or disconnected.", with a **Retry** button.
  - It shows after 2 consecutive failed `/api/health` checks.
  - Checks run every 30 s, plus on window `focus` and `online`.
- **PWA.**
  - Manifest: name and short_name `Life Tracker`, `display: standalone`, `start_url: /`, `theme_color: #3f51b5`, background colors from the tokens.
  - Shortcuts:
    - `{ name: 'Something came up', url: '/quick-add' }`
    - `{ name: 'Daily review', url: '/review' }`
  - The service worker caches only precached build assets. It has `navigateFallback: '/index.html'` and `navigateFallbackDenylist: [/^\/api\//]`, and no runtime caching for `/api`.
- **Streaks** (spec §3.3):
  - `reviewDays` = the number of consecutive local dates with a `daily_reviews` row, counting back from today if today is reviewed, otherwise from yesterday.
  - `workoutWeeks` = the number of consecutive weeks in which every set workout goal (total and per type) has `actual ≥ goal`. It counts back from the current week if that week already meets its goals, otherwise from last week. It's 0 when there are no workout goals.

## Review Focus

1. **A backup taken while the server is writing (WAL mode)** must be a consistent, openable database containing the latest committed rows. *Task 3 test.*
2. **The backup folder is missing or unwritable** (e.g. iCloud isn't signed in) → the job records `lastError`, Settings shows it, and the server keeps running. A missing folder is created. *Task 3 test.*
3. **The service worker must never serve cached `/api` responses**, otherwise the phone shows stale plans. *Task 5 test on the exported Workbox config.*
4. **The Mac falls asleep mid-session** → the phone shows the offline screen instead of a blank page or a flood of error toasts, and recovers by itself on focus once the Mac wakes. *Task 6 test.*
5. **Not having reviewed today yet** must not reset the review streak to 0. *Task 7 test.*

---

## File Structure

```
server/src/logger.ts                 createLogger, requestLogger middleware
server/src/domains/backups/{service.ts,routes.ts}
server/src/domains/goals/{trends.ts,streaks.ts}   (+ routes in goals/routes.ts)
scripts/service.mjs                  install | uninstall | status | restart
scripts/plist.mjs                    renderPlist (pure)
web/public/icon.svg                  source icon; PNGs generated into web/public
web/pwa-assets.config.ts
web/src/pwa.ts                       pwaOptions (exported for test)
web/src/hooks/useServerHealth.ts
web/src/components/OfflineScreen.tsx
web/src/features/dashboard/{TrendsSection,StreakTiles,Sparkline}.tsx
web/src/features/settings/BackupsSection.tsx
docs/setup-phone.md
```

---

### Task 1: Production config + structured logging

**Files:**
- Create: `server/src/logger.ts`
- Modify: `server/package.json` (add `pino`, `pino-roll`; move `tsx` to dependencies), `server/src/config.ts` (production origins), `server/src/auth/sessions.ts` (`sessionCookie` takes the forwarded proto), `server/src/app.ts` (request logger), `server/src/index.ts` (use the logger; pass `log` to `createScheduler`)
- Test: `server/test/logger.test.ts`, `server/test/config.test.ts`, `server/test/auth.test.ts` (extend)

**Interfaces:**
- Produces:
  - `createLogger(opts: { dataDir: string; toFile: boolean }): pino.Logger`
    - With `toFile`, it writes through the `pino-roll` transport (`file: <dataDir>/logs/server.log`, `size: '5m'`, `limit: { count: 5 }`). Otherwise it writes to stdout.
    - Tests use `toFile: false`.
  - `requestLogger(log: pino.Logger): MiddlewareHandler`: logs `{ method, path, status, ms }` for `/api/*`
  - `loadConfig(env)`: production `allowedOrigins` per the Global Constraints
  - `sessionCookie(token, host, forwardedProto?: string | null)`

- [ ] **Step 1: Write the failing tests**

```ts
test('production allowedOrigins exclude vite dev origin and include LT_PUBLIC_ORIGIN', () => {
  const c = loadConfig({ HOME: '/u', NODE_ENV: 'production', LT_PUBLIC_ORIGIN: 'https://mac.tail1.ts.net' } as any);
  expect(c.allowedOrigins).toEqual(['http://127.0.0.1:4280', 'http://localhost:4280', 'https://mac.tail1.ts.net']);
});
test('request log line has method/path/status/ms but no query, body or cookie', async () => {
  // capture pino destination stream; GET /api/blocks?from=...&to=... with cookie → line has path '/api/blocks', no 'from=', no 'lt_session'
});
test('cookie Secure when X-Forwarded-Proto https even on 127.0.0.1 host', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run logger config auth`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): production origins, forwarded-proto cookies and rotated logs"`

---

### Task 2: launchd service scripts

**Files:**
- Create: `scripts/plist.mjs`, `scripts/service.mjs`
- Modify: root `package.json` (scripts `service:install`, `service:uninstall`, `service:status`, `service:restart`)
- Test: `scripts/plist.test.mjs` (added to the root vitest projects as a `scripts` project)

**Interfaces:**
- Produces:
  - `renderPlist(o: { label: string; nodePath: string; repoDir: string; dataDir: string; port: number; publicOrigin?: string }): string`
    - A valid plist XML string with every value XML-escaped.
    - `ProgramArguments` = `[nodePath, '--import', 'tsx', '<repoDir>/server/src/index.ts']`
    - `WorkingDirectory` = `repoDir`
    - The environment and log paths per the Global Constraints.
  - `scripts/service.mjs <command> [--port 4280] [--data-dir ~/LifeTracker] [--public-origin https://…]`:

    | Command | Steps |
    |---|---|
    | `install` | 1. `npm run build`<br>2. write the plist<br>3. `launchctl bootout gui/<uid>/com.lifetracker.server` (errors ignored)<br>4. `launchctl bootstrap gui/<uid> <plist>`<br>5. poll `http://127.0.0.1:<port>/api/health` for up to 20 s<br>6. print "Life Tracker is running at http://127.0.0.1:<port>" or the last 20 lines of `launchd.err.log` |
    | `uninstall` | bootout, then delete the plist |
    | `status` | `launchctl print gui/<uid>/com.lifetracker.server`, summarized to running/not running, plus the PID and the health check result |
    | `restart` | `launchctl kickstart -k gui/<uid>/com.lifetracker.server` |

    Previous options are remembered by reading the existing plist, so `restart` and a re-install keep `--public-origin`.

- [ ] **Step 1: Write the failing tests**

```js
test('renderPlist contains program args, env and KeepAlive', () => {
  const xml = renderPlist({ label: 'com.lifetracker.server', nodePath: '/opt/homebrew/bin/node', repoDir: '/Users/v/life-tracker', dataDir: '/Users/v/LifeTracker', port: 4280, publicOrigin: 'https://mac.tail1.ts.net' });
  expect(xml).toContain('<string>/Users/v/life-tracker/server/src/index.ts</string>');
  expect(xml).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
  expect(xml).toContain('<key>LT_PUBLIC_ORIGIN</key>');
  expect(xml).toContain('<key>NODE_ENV</key>\n\t\t<string>production</string>');
});
test('renderPlist escapes XML special characters in paths', () => {
  expect(renderPlist({ ...base, repoDir: '/Users/v/A&B' })).toContain('/Users/v/A&amp;B');
});
test('renderPlist omits LT_PUBLIC_ORIGIN when not given', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests, then do a manual install**

Run: `npx vitest run scripts` → PASS.
Run: `npm run service:install -- --data-dir ~/LifeTracker`
Expected: "Life Tracker is running at http://127.0.0.1:4280".
Log out of macOS and back in; `npm run service:status` should still show it running.

- [ ] **Step 5: Commit** — `git commit -m "feat: launchd service install/uninstall/status/restart"`

---

### Task 3: Nightly backups

**Files:**
- Create: `server/src/domains/backups/service.ts`, `routes.ts`, plus `BackupStatus` and `BackupSettingsInput` in `shared/src/schemas/settings.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts` (`scheduler.dailyAt('backup', '03:00', tz, () => runBackup(ctx))`)
- Test: `server/test/backups.test.ts`

**Interfaces:**
- Produces:
  - `BackupStatus { dir: string; files: Array<{ name: string; size: number; modifiedAt: string }>; lastBackupAt: string|null; lastError: string|null }`
  - `BackupSettingsInput { dir: string }`: absolute, or starting with `~/`
  - `resolveBackupDir(ctx): string`
  - `runBackup(ctx): Promise<{ file: string }>`
    1. `mkdirSync(dir, { recursive: true })`
    2. `await ctx.sqlite.backup(join(dir, 'data-<localDate>.db'))`
    3. Prune per the Global Constraints.
    4. Record `backup_last_at` or `backup_last_error` in settings.
    5. On error, rethrow so the scheduler logs it.
  - `getBackupStatus(ctx): BackupStatus`: lists the matching files, newest first
  - `saveBackupSettings(ctx, input)`: checks the folder can be created and written to (a write+delete probe file), else 400 `fields.dir`
  - Routes:
    - `GET /api/backups` → `BackupStatus`
    - `POST /api/backups/run` → `{ file }`, or 500 with the message
    - `PUT /api/backups/settings`
- Test helper: these tests need a **file** database, not `:memory:`. Use `createTestCtx({ file: <tmp>/data.db })`. **Change:** Stage 1's `createTestCtx` gains an optional `file` option.

- [ ] **Step 1: Write the failing tests**

```ts
test('backup of a WAL file db is openable and contains latest rows', async () => {
  // insert course, runBackup, open backup with better-sqlite3 readonly → course present; integrity_check === 'ok'
});
test('same-day backup overwrites; keeps newest 14 data-*.db and never deletes pre-migrate-*.db or other files', async () => {
  // seed 20 dated files + pre-migrate-x.db + notes.txt → after run: 14 data files, pre-migrate and notes intact
});
test('missing folder is created; unwritable folder records lastError and status shows it', async () => {
  // chmod 0o500 dir → run rejects; GET /api/backups lastError set; server still answers /api/health
});
test('~/ in dir expands to home', () => {});
test('saveBackupSettings rejects unwritable dir with fields.dir', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run backups`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): nightly SQLite backups with pruning"`

---

### Task 4: Trends + streaks API

**Files:**
- Create: `server/src/domains/goals/trends.ts`, `streaks.ts`; add `WeekTrend` and `Streaks` to `shared/src/schemas/goals.ts`
- Modify: `server/src/domains/goals/routes.ts`
- Test: `server/test/trends.test.ts`, `server/test/streaks.test.ts`

**Interfaces:**
- Produces:
  - `WeekTrend`:
    ```ts
    {
      weekStart: string;
      studyMinutes: { goal: number|null; actual: number };      // summed over courses; goal null if no course goals
      startupMinutes: { goal: number|null; actual: number };
      workMinutes: { actual: number };
      workouts: { goal: number|null; actual: number };
      freeEvenings: { goal: number|null; actual: number };
      avgKcal: number|null; avgProteinG: number|null;           // over days with ≥1 meal log, ≤ today
      daysKcalOk: number; daysProteinOk: number;
    }
    ```
  - `getTrends(ctx, weeks: 4 | 12 | 26): WeekTrend[]`: oldest first, ending with the current week. Built from `getWeekProgress(ctx, weekStart, { prefs })` for each week.
  - `Streaks { reviewDays: number; workoutWeeks: number }`
  - `getStreaks(ctx): Streaks`: per the Global Constraints
  - Routes:
    - `GET /api/progress/trends?weeks=4|12|26` (anything else → 400)
    - `GET /api/streaks`

- [ ] **Step 1: Write the failing tests**

```ts
test('trends returns N weeks oldest→newest ending this week with summed study', () => {});
test('avgKcal ignores days without logs and future days', () => {});
test('weeks=5 → 400', async () => {});
test('reviewDays: reviewed Mon–Tue, today Wed not yet reviewed → 2; after reviewing Wed → 3', () => {});
test('reviewDays gap resets', () => {});
test('workoutWeeks counts consecutive weeks meeting total and per-type goals; current week counted only when met', () => {});
test('no workout goals → workoutWeeks 0', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run trends streaks`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): weekly trends and streaks"`

---

### Task 5: PWA — manifest, icons, shortcuts, service worker

**Files:**
- Create: `web/public/icon.svg`, `web/pwa-assets.config.ts`, `web/src/pwa.ts`
- Modify: `web/package.json` (dependencies plus a `"pwa:icons": "pwa-assets-generator"` script), `web/vite.config.ts` (`VitePWA(pwaOptions)`), `web/index.html` (`apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color` meta), `web/src/main.tsx` (`registerSW({ immediate: true })` from `virtual:pwa-register`)
- Generated and committed: `web/public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`
- Test: `web/test/pwa.test.ts`

**Interfaces:**
- Produces: `pwaOptions: Partial<VitePWAOptions>`
  - `registerType: 'autoUpdate'`
  - `manifest`: per the Global Constraints, with the icons generated above
  - `workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'], runtimeCaching: [] }`
- Icon: a simple mark, a rounded square in `#3f51b5` with a white check/clock glyph. `pwa-assets.config.ts` uses the `minimal2023Preset`.

- [ ] **Step 1: Write the failing tests**

```ts
test('service worker never caches /api', () => {
  expect(pwaOptions.workbox!.navigateFallbackDenylist!.some(r => r.test('/api/blocks'))).toBe(true);
  expect(pwaOptions.workbox!.runtimeCaching ?? []).toHaveLength(0);
});
test('manifest has name, standalone display and both shortcuts', () => {
  const m = pwaOptions.manifest as any;
  expect(m.name).toBe('Life Tracker'); expect(m.display).toBe('standalone');
  expect(m.shortcuts.map((s: any) => s.url)).toEqual(['/quick-add', '/review']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run pwa --project web`
Expected: FAIL.

- [ ] **Step 3: Implement, then generate the icons**

Run: `npm run pwa:icons -w web`
Expected: the PNGs and `favicon.ico` appear in `web/public/`.

- [ ] **Step 4: Run the tests and build**

Run: `npx vitest run --project web && npm run build -w web`
Expected: PASS. `web/dist` contains `sw.js` and `manifest.webmanifest`.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): installable PWA with shortcuts and shell-only service worker"`

---

### Task 6: Offline screen

**Files:**
- Create: `web/src/hooks/useServerHealth.ts`, `web/src/components/OfflineScreen.tsx`
- Modify: `web/src/App.tsx` (render `OfflineScreen` instead of the routes when unreachable; it wraps `AuthGate`), `web/src/api/client.ts` (a network `TypeError` becomes `ApiError { status: 0, code: 'INTERNAL' }`, and no toast is shown for status 0)
- Test: `web/test/offline.test.tsx`

**Interfaces:**
- Produces:
  - `useServerHealth(): { status: 'ok' | 'unreachable'; retry: () => void }`
    - Polls `/api/health` per the Global Constraints, with a 5 s timeout via `AbortController`.
    - Two consecutive failures → `unreachable`; one success → `ok`.
    - Listens to `focus` and `online` and checks right away.
  - `OfflineScreen { onRetry }`: the exact text from the Global Constraints, a **Retry** button, and the smaller hint "Check that your Mac is awake and Tailscale is connected."

- [ ] **Step 1: Write the failing tests**

```tsx
test('two failed health checks show the offline screen with exact text', async () => {
  // fake timers; fetch rejects TypeError twice
  expect(await screen.findByText('Life Tracker is offline — your Mac may be asleep or disconnected.')).toBeInTheDocument();
});
test('one failure does not show offline screen', async () => {});
test('window focus triggers a check and recovers to app when health succeeds', async () => {});
test('network errors during unreachable state do not raise toasts', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run offline --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): offline screen when the Mac is unreachable"`

---

### Task 7: Web — Dashboard trends and streaks, Settings → Backups

**Files:**
- Create: `web/src/features/dashboard/TrendsSection.tsx`, `StreakTiles.tsx`, `Sparkline.tsx`, `web/src/features/settings/BackupsSection.tsx`
- Create: `useTrends(weeks)` and `useStreaks()` in `web/src/api/hooks/progress.ts`; `useBackups()`, `useRunBackup()` and `useSaveBackupSettings()` in `web/src/api/hooks/backups.ts`
- Modify: `web/src/features/dashboard/DashboardPage.tsx`, `web/src/features/settings/SettingsPage.tsx`
- Test: `web/test/trends.test.tsx`, `web/test/backups.test.tsx`

**Interfaces:**
- Produces:
  - `StreakTiles`: two tiles, "🔥 N-day review streak" and "💪 N-week workout streak".
  - `TrendsSection`:
    - Range tabs: 4 / 12 / 26 weeks (default 12).
    - One row per metric: study hours, startup hours, work hours, workouts, free evenings, average kcal, average protein. Each row has a `Sparkline` of actual values per week, with a dashed goal line when goals exist, plus the latest value against its goal.
  - `Sparkline { values: number[]; goal?: (number|null)[]; label: string }`
    - Inline SVG at 120 × 32, colors from tokens.
    - `aria-label` = "<label>: <latest> this week".
    - Consult the `dataviz` skill when implementing it, so the chart colors and marks match the rest of the app.
  - `BackupsSection`:
    - Shows the folder, the last backup time, and any last error (in red).
    - Lists the 14 files with their sizes.
    - **Back up now**.
    - Change the folder (a text input with a placeholder showing the iCloud example path), with server field errors shown inline.

- [ ] **Step 1: Write the failing tests**

```tsx
test('streak tiles render counts', async () => {});
test('trends default 12 weeks and switching to 4 refetches', async () => { /* GET /api/progress/trends?weeks=4 */ });
test('sparkline aria-label reports latest value', () => {});
test('backups shows last error and back up now posts', async () => {});
test('invalid backup dir shows field error', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run trends backups --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): trends, streaks and backup settings"`

---

### Task 8: Phone setup guide, README, final end-to-end pass

**Files:**
- Create: `docs/setup-phone.md`
- Modify: `README.md`, `docs/manual-e2e.md`

- [ ] **Step 1: Write `docs/setup-phone.md`**

1. Install Tailscale on the Mac and the iPhone, signed in to the same account.
2. On the Mac, run `tailscale serve --bg 4280`. Note the `https://<mac>.<tailnet>.ts.net` URL from `tailscale serve status`.
3. Run `npm run service:install -- --public-origin https://<mac>.<tailnet>.ts.net`.
4. On the iPhone, open that URL in Safari → enter the PIN → Share → **Add to Home Screen**.
5. Keep the Mac reachable: System Settings → Battery → Options → "Prevent automatic sleeping on power adapter when the display is off". Optionally run `caffeinate -s` while travelling with the lid open.
6. Note that iOS doesn't show manifest shortcuts. Bookmark `/quick-add` as its own home-screen icon if you want one-tap quick add.

Troubleshooting:
- offline screen → is the Mac awake, is Tailscale connected on both devices
- "Forbidden origin" → reinstall with the exact `--public-origin`
- PIN lockout

- [ ] **Step 2: Update `README.md`**

Add these sections:
- **Run as a service:** install, status, restart, uninstall.
- **Phone access:** link to the guide.
- **Backups & restore:**
  1. `npm run service:uninstall`
  2. Copy `data-YYYY-MM-DD.db` to `~/LifeTracker/data.db`.
  3. Delete `data.db-wal` and `data.db-shm`.
  4. `npm run service:install`

  Note that `secrets/` isn't in backups, so you reconnect Google after restoring on a new Mac.
- **Logs location.**

- [ ] **Step 3: Extend `docs/manual-e2e.md` with a phone section, then run the whole checklist**

The phone section:
1. Install the PWA from Safari.
2. Log in with the PIN.
3. Quick-add from the phone; the change summary appears; Apply; Google is updated.
4. Do the daily review on the phone.
5. Put the Mac to sleep; the phone shows the offline screen; wake the Mac; it recovers on focus.
6. Run a backup now; the file appears in the folder.

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. Then go through every item in `docs/manual-e2e.md` from Stages 3–5 and tick them off. Any failure becomes a test plus a fix in the owning task's files before you move on.

- [ ] **Step 4: Commit** — `git commit -m "docs: phone setup, service, backups and restore"`

---

## Self-Review Notes

- **Spec coverage:**
  - §8 runtime: launchd (Task 2), logs rotated (Task 1), data dir (Stage 1), backups 03:00 + on demand + keep 14 + no secrets (Task 3), `tailscale serve` + HTTPS + PWA install + prevent-sleep note (Tasks 5, 8)
  - §7 offline screen (Task 6); Dashboard trends/streaks (Tasks 4, 7); Settings → Backups (Task 7)
  - §3.3 streaks (Task 4)
  - §4.6 trends 4/12/26 (Tasks 4, 7)
  - §11 stage 5 (all tasks)
- **Spec note:** spec §8 says launchd "starts the server at login". `RunAtLoad` in a LaunchAgent does exactly that, and `KeepAlive` covers crash restarts (§9).
