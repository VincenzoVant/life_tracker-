# Stage 1 — Foundation + Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working local Life Tracker. When this stage is done, the user can log in with a PIN and do the following:
- create blocks by hand
- manage courses, startup tasks, workouts and top lifts, saved meals and meal logs, and goals
- complete the daily review
- see this week's progress against goals

**Architecture:**
- An npm-workspaces monorepo with three packages: `shared` (zod schemas, types, time helpers, category metadata), `server` (Hono + better-sqlite3/Drizzle) and `web` (React + Vite).
- The server is organized by domain. Each domain has a `service.ts` (pure functions over a `Ctx`) and a `routes.ts` (thin Hono wrappers).
- Every change to a block goes through the blocks service, which emits on a `BlockEventBus`. Stage 3 hooks Google sync into this bus.

**Tech Stack:** Node ≥ 22 (dev machine: 26.8.2), TypeScript 7, Hono 4 + @hono/node-server 2, better-sqlite3 13, drizzle-orm 0.45 + drizzle-kit 0.31, zod 4, date-fns 4 + date-fns-tz 3, ulid 3, @node-rs/argon2 2, React 19, react-router 8, @tanstack/react-query 5, Vite 8, Vitest 5, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-life-tracker-design.md`. Sections covered by this stage: §2, §3 (minus fixed events, plans, sync and calendar tables), §4.4, §4.6 "This week", §7 screens 1/3/4/5/6 (stage-1 parts), §8 PIN/CSRF/binding, §9, §10, §11 stage 1.

## Global Constraints

These apply to every stage plan, not only this one.

- **Packages.** ESM everywhere (`"type": "module"`). TypeScript `strict: true`. Workspace package names: `@life-tracker/shared`, `@life-tracker/server`, `@life-tracker/web`.
- **Times and dates.**
  - Every timestamp is stored and sent as a UTC ISO-8601 string (`Date#toISOString()`).
  - Local dates are `YYYY-MM-DD`; times of day are `HH:mm`. Both are interpreted in the configured IANA timezone.
  - A week runs from Monday 00:00 local to the next Monday 00:00 local.
- **IDs** are ULIDs from the `ulid` package.
- **Server runtime.**
  - Binds to **127.0.0.1 only**.
  - Port: `LT_PORT`, default `4280`.
  - Data dir: `LT_DATA_DIR`, default `~/LifeTracker`. It contains `data.db`, `secrets/`, `logs/` and `backups/`.
  - The default timezone is the system timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). The user can override it with the `timezone` setting.
- **API.**
  - All routes live under `/api`.
  - Error responses use exactly `{ "error": { "code": string, "message": string, "fields"?: Record<string,string> } }`.
  - Codes: `VALIDATION` 400, `UNAUTHORIZED` 401, `FORBIDDEN_ORIGIN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `INVALID_TRANSITION` 409, `LOCKED_OUT` 429, `INTERNAL` 500.
  - Every request body and query is validated with zod schemas exported from `@life-tracker/shared`.
- **Auth.**
  - The PIN is 4–8 digits (`/^\d{4,8}$/`), stored as an argon2 hash.
  - The session cookie is named `lt_session`: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=2592000` (30 days).
  - The cookie gets `Secure` **only when** the request `Host` is not `localhost`/`127.0.0.1`/`[::1]` (with any port).
  - Lockout: 5 failed logins within 15 minutes locks login for 15 minutes.
- **CSRF.** Requests with POST/PUT/PATCH/DELETE must carry an `Origin` header found in `config.allowedOrigins`. In dev that list is `http://localhost:4280`, `http://127.0.0.1:4280` and `http://localhost:5173`, plus `LT_PUBLIC_ORIGIN` if set.
- **Category metadata** is fixed and shared by the UI, charts and (in Stage 3) Google `colorId`:

  | category | label | color | gcalColorId |
  |---|---|---|---|
  | study | Study | `#3f51b5` | 9 |
  | work | Work | `#616161` | 8 |
  | startup | Startup | `#8e24aa` | 3 |
  | workout | Workout | `#d50000` | 11 |
  | meal | Meal | `#f6bf26` | 5 |
  | meal_prep | Meal prep | `#f4511e` | 6 |
  | rest | Rest | `#33b679` | 2 |
  | social | Social | `#039be5` | 7 |
  | errand | Errand | `#7986cb` | 1 |
  | appointment | Appointment | `#e67c73` | 4 |
  | other | Other | `#0b8043` | 10 |

- **Defaults** until Stage 2 introduces preferences: `EVENING_START_DEFAULT = "19:00"`, `SLEEP_START_DEFAULT = "23:30"`, `REVIEW_PROMPT_TIME_DEFAULT = "20:00"`.
- **Tests.**
  - Server tests use in-memory SQLite with all migrations applied.
  - The default test timezone is `America/Los_Angeles`. The default test clock is `2026-10-14T19:00:00.000Z`, which is Wednesday 12:00 local in the week starting Monday `2026-10-12`.
- **Commits.**
  - Conventional prefixes (`feat:`, `test:`, `chore:`, `docs:`).
  - The author is the repo-configured user.
  - **No `Co-Authored-By` or other AI attribution lines.**
- **Decisions this plan makes where the spec leaves room** (they bind later stages too):
  - **Study goals.** The goal is stored on `courses.weekly_goal_minutes`. The `goals` table holds the other kinds: `startup_minutes`, `workouts_total`, `workouts_by_type`, `free_evenings`, `daily_kcal`, `daily_protein_g`.
  - **`daily_reviews(date, completed_at)` table** records completed reviews; streaks in Stage 5 use it.
  - **Blocks created by hand** (`source = manual`) start as `committed`.
  - **Day attribution.** A block belongs to the local date its `start` falls on, for review, progress and weeks.
  - **Archiving instead of deleting.** Saved meals are archived, not deleted. Courses are archived (`active = false`). A lift that has top sets can't be deleted (409 `CONFLICT`).
  - **Free evenings.** The free-evening window runs from evening start to sleep start. `planned` counts all 7 days of the week; `actual` counts only days up to and including today.

## Review Focus

These are the input classes most likely to bite the user. Each one has a pinning test in its owning task.

1. **Blocks that cross midnight** (e.g. 23:30–00:30 local) are counted on the day they start, both in the review and in progress. Neither day gets them twice and neither drops them. *Task 11 and Task 12 tests.*
2. **Partial-minute review values that are out of range** (`0`, a negative number, or more than the block's duration) are rejected with 400 `VALIDATION` and a `fields` entry, not silently clamped. *Task 11 test.*
3. **Re-reviewing a block** (done → skipped, or partial 30 → done) updates the totals without double counting. It doesn't duplicate the linked workout session, and a skip deletes that session. *Task 11 test.*
4. **Deleting things that history refers to:**
   - Archiving a meal keeps past meal logs intact, including their copied nutrition.
   - Deleting a lift that has top sets returns 409.
   - Archiving a course keeps its past study minutes in progress for that week.

   *Task 7, Task 8 and Task 9 tests.*
5. **Logging in over plain HTTP on the Mac** (`http://127.0.0.1:4280`) must get a cookie **without** `Secure`, otherwise Safari drops it and login silently fails. Through the Tailscale host the cookie must have `Secure`. *Task 4 test.*

---

## File Structure

```
package.json                     workspaces, root scripts
tsconfig.base.json
vitest.config.ts                 test.projects = [shared, server, web]
.gitignore
shared/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts                   re-exports everything below
  src/categories.ts              CATEGORIES, CATEGORY_META, constants
  src/time.ts                    timezone/week helpers
  src/errors.ts                  ErrorCode, ErrorBody
  src/schemas/blocks.ts          Block, BlockCreateInput, BlockUpdateInput, enums
  src/schemas/review.ts          ReviewSubmission, ReviewEntry, UnplannedEntry, WorkoutDetails
  src/schemas/courses.ts
  src/schemas/startup.ts
  src/schemas/workouts.ts
  src/schemas/food.ts
  src/schemas/goals.ts           GoalSet, WeekProgress
  src/schemas/settings.ts
  src/schemas/auth.ts
  test/*.test.ts
server/
  package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts
  drizzle/                       generated SQL migrations (committed)
  src/index.ts                   process entry
  src/app.ts                     createApp(ctx)
  src/config.ts                  loadConfig(env)
  src/ctx.ts                     Ctx type, createCtx()
  src/db/client.ts  src/db/schema.ts  src/db/migrate.ts
  src/lib/errors.ts  src/lib/validate.ts  src/lib/clock.ts
  src/auth/{pin.ts,sessions.ts,lockout.ts,middleware.ts,routes.ts}
  src/domains/settings/{service.ts,routes.ts}
  src/domains/blocks/{service.ts,status.ts,events.ts,routes.ts}
  src/domains/studies/{service.ts,routes.ts}
  src/domains/startup/{service.ts,routes.ts}
  src/domains/workouts/{service.ts,prs.ts,routes.ts}
  src/domains/food/{service.ts,routes.ts}
  src/domains/goals/{service.ts,progress.ts,routes.ts}
  src/domains/review/{service.ts,routes.ts}
  test/helpers.ts                createTestCtx, createTestClient
  test/**/*.test.ts
web/
  package.json  tsconfig.json  vite.config.ts  vitest.config.ts  index.html
  src/main.tsx  src/App.tsx
  src/styles/tokens.css  src/styles/global.css
  src/api/client.ts              apiFetch, ApiError
  src/api/hooks/*.ts             TanStack Query hooks per domain
  src/components/                Layout, TabBar, Sidebar, CategoryDot, ProgressBar, Field, Modal, Toast
  src/features/auth/  today/  review/  areas/{studies,work,startup,workouts,food}/  dashboard/  settings/
  test/setup.ts  test/render.tsx  test/mockApi.ts
```

---

### Task 1: Workspace scaffold + shared package (categories, time, errors)

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/vitest.config.ts`
- Create: `shared/src/index.ts`, `shared/src/categories.ts`, `shared/src/time.ts`, `shared/src/errors.ts`
- Test: `shared/test/time.test.ts`, `shared/test/categories.test.ts`

**Interfaces:**
- Produces (from `@life-tracker/shared`):
  - `CATEGORIES` (readonly tuple from the Global Constraints table)
  - `type Category`
  - `CATEGORY_META: Record<Category, { label: string; color: string; gcalColorId: string }>`
  - `EVENING_START_DEFAULT`, `SLEEP_START_DEFAULT`, `REVIEW_PROMPT_TIME_DEFAULT`
  - `type ErrorCode`, `interface ErrorBody`
  - Time helpers (all pure; the `tz` parameter is an IANA string):
    - `localDateOf(instant: Date, tz: string): string`
    - `localTimeOf(instant: Date, tz: string): string` (`HH:mm`)
    - `zonedToUtc(date: string, time: string, tz: string): Date`
    - `dayRangeUtc(date: string, tz: string): { start: Date; end: Date }`: local midnight to the next local midnight
    - `weekStartOf(instant: Date, tz: string): string`: the Monday's local date
    - `weekRangeUtc(weekStart: string, tz: string): { start: Date; end: Date }`
    - `weekDates(weekStart: string): string[]`: 7 dates
    - `addDays(date: string, n: number): string`
    - `isoWeekday(date: string): 1|2|3|4|5|6|7`: Monday = 1
    - `minutesBetween(a: Date | string, b: Date | string): number`

- [ ] **Step 1: Create the root workspace files**

**Root `package.json`:**
- `"private": true`, `"type": "module"`
- `"workspaces": ["shared","server","web"]`
- `"engines": {"node": ">=22"}`
- devDependencies: `typescript@^7.0.2`, `vitest@^5.0.4`, `concurrently@^10.0.6`
- scripts:
  - `"test": "vitest run"`
  - `"typecheck": "tsc -b shared server web"`
  - `"dev": "concurrently -n server,web \"npm run dev -w server\" \"npm run dev -w web\""`
  - `"build": "npm run build -w shared && npm run build -w web && npm run build -w server"`

**`tsconfig.base.json`:**
- `strict`, `target ES2023`, `module NodeNext`, `moduleResolution NodeNext`
- `composite true`, `declaration true`, `skipLibCheck true`

**Root `vitest.config.ts`:** `test.projects = ['shared','server','web']`.

**`.gitignore`:** `node_modules/`, `dist/`, `*.db`, `.DS_Store`, `coverage/`.

**`shared/package.json`:**
- name `@life-tracker/shared`
- dependencies: `zod@^4.6.7`, `date-fns@^4.4.0`, `date-fns-tz@^3.2.0`
- `"exports": {".": "./src/index.ts"}` (consumed as source by server via tsx and by web via Vite)

- [ ] **Step 2: Write the failing tests**

```ts
// shared/test/time.test.ts
const TZ = 'America/Los_Angeles';
test('localDateOf uses the timezone, not UTC', () => {
  expect(localDateOf(new Date('2026-10-15T05:30:00Z'), TZ)).toBe('2026-10-14');
});
test('weekStartOf returns Monday local date', () => {
  expect(weekStartOf(new Date('2026-10-14T19:00:00Z'), TZ)).toBe('2026-10-12');
  expect(weekStartOf(new Date('2026-10-19T06:59:00Z'), TZ)).toBe('2026-10-12'); // Sun 23:59 local
});
test('zonedToUtc converts local wall time', () => {
  expect(zonedToUtc('2026-10-14', '19:00', TZ).toISOString()).toBe('2026-10-15T02:00:00.000Z');
});
test('dayRangeUtc spans 25h on DST fall-back day', () => {
  const { start, end } = dayRangeUtc('2026-11-01', TZ);
  expect(minutesBetween(start, end)).toBe(25 * 60);
});
test('weekRangeUtc and weekDates', () => {
  const r = weekRangeUtc('2026-10-12', TZ);
  expect(r.start.toISOString()).toBe('2026-10-12T07:00:00.000Z');
  expect(r.end.toISOString()).toBe('2026-10-19T07:00:00.000Z');
  expect(weekDates('2026-10-12')).toEqual(['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
});
test('isoWeekday and addDays', () => {
  expect(isoWeekday('2026-10-12')).toBe(1);
  expect(isoWeekday('2026-10-18')).toBe(7);
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
});
```

```ts
// shared/test/categories.test.ts
test('every category has meta with a hex color and gcal color id 1..11', () => {
  for (const c of CATEGORIES) {
    expect(CATEGORY_META[c].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(Number(CATEGORY_META[c].gcalColorId)).toBeGreaterThanOrEqual(1);
    expect(Number(CATEGORY_META[c].gcalColorId)).toBeLessThanOrEqual(11);
  }
  expect(CATEGORY_META.study).toEqual({ label: 'Study', color: '#3f51b5', gcalColorId: '9' });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm install && npx vitest run --project shared`
Expected: FAIL. The imports can't be resolved.

- [ ] **Step 4: Implement `categories.ts`, `time.ts`, `errors.ts` and `index.ts`**

- Use `fromZonedTime`, `toZonedTime` and `formatInTimeZone` from `date-fns-tz`.
- Do date-only arithmetic (`addDays`, `isoWeekday`) on `YYYY-MM-DD` strings at UTC noon, so it never depends on a timezone.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project shared`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore shared
git commit -m "chore: scaffold workspace and shared time/category helpers"
```

---

### Task 2: Server foundation — config, DB, migrations, errors, app, test helpers

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/drizzle.config.ts`
- Create: `server/src/config.ts`, `server/src/ctx.ts`, `server/src/app.ts`, `server/src/lib/errors.ts`, `server/src/lib/validate.ts`, `server/src/lib/clock.ts`
- Create: `server/src/db/client.ts`, `server/src/db/schema.ts` (only the `settings` table for now), `server/src/db/migrate.ts`
- Create: `server/src/domains/settings/service.ts`, `server/src/domains/settings/routes.ts`, `shared/src/schemas/settings.ts`
- Create: `server/test/helpers.ts`
- Test: `server/test/foundation.test.ts`

**Interfaces:**
- Produces:
  - `interface AppConfig { dataDir: string; port: number; defaultTimezone: string; allowedOrigins: string[]; webDist: string | null }`
  - `loadConfig(env: NodeJS.ProcessEnv): AppConfig`
  - `type Db = BetterSQLite3Database<typeof schema>`
  - `openDb(file: string | ':memory:'): { sqlite: Database.Database; db: Db }` (sets `journal_mode=WAL` when the target is a file, and `foreign_keys=ON`)
  - `runMigrations(handle: { sqlite; db }, opts: { backupDir?: string }): { applied: number }`: when migrations are pending, the target is a file, and `backupDir` is given, it first writes `pre-migrate-<ISO timestamp>.db` with `sqlite.backup()`
  - `interface Clock { now(): Date }`
  - `fixedClock(iso: string): Clock & { set(iso: string): void }`
  - `systemClock: Clock`
  - `interface Ctx { db: Db; sqlite: Database.Database; clock: Clock; config: AppConfig; events: BlockEventBus }`
    - `events` is a no-op bus until Task 5 provides the real one; `createCtx` constructs it.
  - `createCtx(handle, config, clock?): Ctx`
  - `class AppError extends Error { constructor(code: ErrorCode, message: string, fields?: Record<string,string>) }`, with HTTP status derived from the code
  - `notFound(what: string): AppError`
  - `parse<T>(schema: z.ZodType<T>, data: unknown): T`: throws `VALIDATION` with `fields` keyed by `issue.path.join('.')`
  - `createApp(ctx: Ctx): Hono`:
    - mounts `/api/health` (returns `{ ok: true, time: ctx.clock.now().toISOString() }`) and `/api/settings`
    - has an `onError` handler that maps `AppError` to its code's status and anything else to 500 `INTERNAL`
    - has a `notFound` handler for `/api/*` that returns 404 `NOT_FOUND`
  - Settings service:
    - `getSetting<T>(ctx, key: string, fallback: T): T`
    - `setSetting(ctx, key: string, value: unknown): void`
    - `getTimezone(ctx): string`: returns the setting `timezone`, or `config.defaultTimezone`
  - Settings API:
    - `GET /api/settings` → `{ timezone }`
    - `PUT /api/settings` with body `SettingsInput { timezone: string }` (validated: `Intl.supportedValuesOf('timeZone')` must contain it)
  - Test helpers (`server/test/helpers.ts`):
    - `createTestCtx(opts?: { now?: string; timezone?: string }): Ctx & { clock: ReturnType<typeof fixedClock> }` (in-memory, migrated; `timezone` defaults to `America/Los_Angeles`, stored as the setting)
    - `request(app, method, path, body?, headers?): Promise<{ status: number; body: any; headers: Headers }>`, which always sends `Origin: http://127.0.0.1:4280`

**`server/package.json`:**
- dependencies: `hono@^4.13.13`, `@hono/node-server@^2.1.4`, `better-sqlite3@^13.0.3`, `drizzle-orm@^0.45.4`, `ulid@^3.0.2`, `@node-rs/argon2@^2.2.2`, `@life-tracker/shared@*`
- devDependencies: `drizzle-kit@^0.31.11`, `tsx@^4.23.15`, `@types/better-sqlite3@^9.6.0`
- scripts:
  - `"dev": "tsx watch src/index.ts"`
  - `"build": "tsc -p tsconfig.json"`
  - `"db:generate": "drizzle-kit generate"`

**`drizzle.config.ts`:** `dialect: 'sqlite'`, `schema: './src/db/schema.ts'`, `out: './drizzle'`.

**Schema conventions (all tables, all stages):**
- SQL column names are snake_case; Drizzle property names are camelCase.
- Timestamps are `text`.
- Booleans use `integer({ mode: 'boolean' })`.
- Every table except `settings` and `daily_reviews` has `created_at` and `updated_at` text columns. Services set them from `ctx.clock`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/test/foundation.test.ts
test('health returns ok', async () => {
  const ctx = createTestCtx();
  const res = await request(createApp(ctx), 'GET', '/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, time: '2026-10-14T19:00:00.000Z' });
});
test('unknown api route returns NOT_FOUND error shape', async () => {
  const res = await request(createApp(createTestCtx()), 'GET', '/api/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
});
test('settings timezone round-trips and rejects invalid zones', async () => {
  const app = createApp(createTestCtx());
  expect((await request(app, 'PUT', '/api/settings', { timezone: 'Europe/Brussels' })).status).toBe(200);
  expect((await request(app, 'GET', '/api/settings')).body).toEqual({ timezone: 'Europe/Brussels' });
  const bad = await request(app, 'PUT', '/api/settings', { timezone: 'Mars/Base' });
  expect(bad.status).toBe(400);
  expect(bad.body.error.fields.timezone).toBeDefined();
});
test('runMigrations backs up an existing file db before applying pending migrations', () => {
  // tmp dir → open file db, run migrations once (applied > 0, no backup because db was empty/new),
  // reopen and run again → applied 0, no backup; then simulate pending by deleting
  // the last row of __drizzle_migrations → backup file pre-migrate-*.db exists in backupDir
});
test('loadConfig defaults', () => {
  const c = loadConfig({ HOME: '/Users/x' } as any);
  expect(c.dataDir).toBe('/Users/x/LifeTracker');
  expect(c.port).toBe(4280);
  expect(c.allowedOrigins).toContain('http://127.0.0.1:4280');
});
```

*(Auth isn't added until Task 4, so these routes are reachable without a session for now. Task 4 changes `request` usage to authenticated clients.)*

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project server`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement the files listed above, then generate the first migration**

Run: `npm run db:generate -w server`
Expected: creates `server/drizzle/0000_*.sql` containing `CREATE TABLE settings`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server shared/src/schemas/settings.ts shared/src/index.ts package-lock.json
git commit -m "feat(server): config, sqlite+drizzle, migrations, error handling, settings API"
```

---

### Task 3: Server entry point + static web serving

**Files:**
- Create: `server/src/index.ts`, `server/src/static.ts`
- Test: `server/test/static.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `openDb`, `runMigrations`, `createCtx`, `createApp` (Task 2).
- Produces:
  - `mountStatic(app: Hono, webDist: string): void`: serves files from `webDist`. Any non-`/api` GET that doesn't match a file returns `index.html` (SPA fallback). Unknown `/api/*` routes are left to the 404 handler.
  - `main(): Promise<void>`:
    1. Creates `dataDir`, `dataDir/secrets` (mode 0700), `dataDir/logs` and `dataDir/backups`.
    2. Opens `dataDir/data.db`.
    3. Runs migrations with `backupDir = dataDir/backups`.
    4. Serves on `127.0.0.1:port`.
    5. Logs `Life Tracker listening on http://127.0.0.1:<port>`.

`webDist` resolves to `<repo>/web/dist` when that directory exists; otherwise it's `null` and nothing is mounted.

- [ ] **Step 1: Write the failing test**

```ts
test('serves index.html for SPA routes but 404 JSON for unknown api routes', async () => {
  // tmp dir with index.html "<html>LT</html>" and assets/app.js
  const app = createApp(createTestCtx()); mountStatic(app, tmp);
  expect((await app.request('/today')).status).toBe(200);
  expect(await (await app.request('/today')).text()).toContain('LT');
  expect((await app.request('/assets/app.js')).status).toBe(200);
  expect((await app.request('/api/missing')).status).toBe(404);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/test/static.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `mountStatic` and `main`**

- `mountStatic` uses `serveStatic` from `@hono/node-server/serve-static` for files, plus a GET fallback that returns `index.html`.
- `index.ts` calls `main()` only when run directly (`import.meta.url === pathToFileURL(process.argv[1]).href`).

- [ ] **Step 4: Run the test to verify it passes, then smoke-test the server**

Run: `npx vitest run server/test/static.test.ts` → PASS.
Run: `LT_DATA_DIR=$(mktemp -d) npm run dev -w server`, then `curl -s http://127.0.0.1:4280/api/health`
Expected: `{"ok":true,"time":"..."}`. Stop the server afterwards.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/static.ts server/test/static.test.ts
git commit -m "feat(server): process entry and SPA static serving"
```

---

### Task 4: PIN auth, sessions, lockout, origin check

**Files:**
- Create: `shared/src/schemas/auth.ts`
- Create: `server/src/auth/pin.ts`, `server/src/auth/sessions.ts`, `server/src/auth/lockout.ts`, `server/src/auth/middleware.ts`, `server/src/auth/routes.ts`
- Modify: `server/src/db/schema.ts` (add `sessions`), `server/src/app.ts` (mount auth; protect `/api/*`)
- Modify: `server/test/helpers.ts` (add `createTestClient`)
- Test: `server/test/auth.test.ts`

**Interfaces:**
- Produces:
  - Shared:
    - `PinSchema = z.string().regex(/^\d{4,8}$/)`
    - `SetupInput { pin }`
    - `LoginInput { pin }`
    - `ChangePinInput { currentPin, newPin }`
    - `AuthStatus { pinSet: boolean; authenticated: boolean }`
  - Table `sessions(id text pk /* sha256 hex of token */, created_at, expires_at, last_seen_at)`.
  - Functions:
    - `hashPin(pin): Promise<string>`, `verifyPin(hash, pin): Promise<boolean>`: argon2 via `@node-rs/argon2`
    - `createSession(ctx): { token: string; expiresAt: Date }`: the token is 32 random bytes as hex; only its sha256 is stored
    - `findSession(ctx, token): { id } | null`: null when the session has expired
    - `deleteSession(ctx, token): void`
    - `deleteAllSessions(ctx): void`
    - `createLockout(clock): { check(): void /* throws LOCKED_OUT */; recordFailure(): void; reset(): void }`: in-memory and global (one shared counter for all clients)
    - `sessionCookie(token, host: string): string`: builds the Set-Cookie value per the Global Constraints
    - `requireOrigin(config)` middleware: for mutating methods, a missing or unlisted `Origin` → 403 `FORBIDDEN_ORIGIN`
    - `requireSession(ctx)` middleware: everything under `/api` except `/api/health` and `/api/auth/*` → 401 `UNAUTHORIZED` without a valid `lt_session` cookie
  - Routes:
    - `GET /api/auth/status` → `AuthStatus`
    - `POST /api/auth/setup`: 409 `CONFLICT` if a PIN is already set. Stores the hash as the setting `pin_hash`, starts a session and sets the cookie.
    - `POST /api/auth/login`: 401 on a wrong PIN, and the failure is recorded. 429 while locked out.
    - `POST /api/auth/logout`
    - `POST /api/auth/change-pin`: requires a session. Ends all other sessions and issues a new one.
  - Test helper `createTestClient(ctx?): Promise<{ ctx; app; get(path); post(path, body?); put(path, body?); patch(path, body?); del(path) }>`. It sets PIN `1234`, logs in, and sends the cookie and Origin automatically. **All later server tests use this client.**

- [ ] **Step 1: Write the failing tests**

```ts
test('protected route requires session', async () => {
  const app = createApp(createTestCtx());
  expect((await request(app, 'GET', '/api/settings')).status).toBe(401);
});
test('setup → status authenticated; second setup is 409', async () => { /* ... */ });
test('wrong pin 5x in 15 min locks out for 15 min even with right pin', async () => {
  const ctx = createTestCtx(); const app = createApp(ctx);
  await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  for (let i = 0; i < 5; i++) expect((await request(app, 'POST', '/api/auth/login', { pin: '0000' })).status).toBe(401);
  expect((await request(app, 'POST', '/api/auth/login', { pin: '1234' })).status).toBe(429);
  ctx.clock.set('2026-10-14T19:15:01.000Z');
  expect((await request(app, 'POST', '/api/auth/login', { pin: '1234' })).status).toBe(200);
});
test('cookie is not Secure on 127.0.0.1 but Secure on tailscale host', async () => {
  const local = await request(app, 'POST', '/api/auth/login', { pin: '1234' }, { Host: '127.0.0.1:4280' });
  expect(local.headers.get('set-cookie')).not.toMatch(/Secure/);
  expect(local.headers.get('set-cookie')).toMatch(/HttpOnly; .*SameSite=Strict/);
  const ts = await request(app, 'POST', '/api/auth/login', { pin: '1234' }, { Host: 'mac.tail1234.ts.net', Origin: 'https://mac.tail1234.ts.net' });
  // config built with LT_PUBLIC_ORIGIN=https://mac.tail1234.ts.net for this test
  expect(ts.headers.get('set-cookie')).toMatch(/Secure/);
});
test('mutating request with foreign Origin is 403 FORBIDDEN_ORIGIN', async () => {
  const res = await request(app, 'POST', '/api/auth/login', { pin: '1234' }, { Origin: 'https://evil.example' });
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
});
test('expired session is rejected', async () => { /* advance clock 31 days → 401 */ });
test('pin must be 4-8 digits', async () => { /* setup with '12a4' → 400 fields.pin */ });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/test/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement auth, run `npm run db:generate -w server`, and update `foundation.test.ts` to use `createTestClient` for `/api/settings`**

- [ ] **Step 4: Run the server tests**

Run: `npx vitest run --project server`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add shared/src/schemas/auth.ts server
git commit -m "feat(server): PIN auth with sessions, lockout and origin check"
```

---

### Task 5: Blocks domain — model, status machine, event bus, API

**Files:**
- Create: `shared/src/schemas/blocks.ts`
- Create: `server/src/domains/blocks/status.ts`, `events.ts`, `service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `blocks`), `server/src/ctx.ts` (real bus), `server/src/app.ts` (mount)
- Test: `server/test/blocks.test.ts`, `shared/test/blocks-schema.test.ts`

**Interfaces:**
- Produces (shared):
  - Enums:
    - `BLOCK_STATUSES = ['proposed','committed','done','partial','skipped','removed']`
    - `BLOCK_SOURCES = ['planner','fixed','manual','quick_add','unplanned']`
    - `WORKOUT_TYPES = ['gym','cardio','sport']`
    - `MEAL_SLOTS = ['breakfast','lunch','dinner','snack']`
    - plus a type for each
  - `interface Block`: the spec §3.1 fields in camelCase. `start`/`end`/`createdAt`/`updatedAt`/`gcalSyncedAt` are ISO strings; `actualMinutes: number | null`; `locked: boolean`; nullable links.
  - `BlockCreateInput`, a zod object:
    - Fields: `{ category, title (1..120 chars, trimmed), start, end (ISO datetime), courseId?, startupTaskId?, workoutType?, mealSlot?, notes? (≤ 2000) }`.
    - Refinements:
      - `end > start`; otherwise `fields.end = "End must be after start"`.
      - The duration is at most 24 h.
      - `workout` requires `workoutType`.
      - `meal` requires `mealSlot`.
      - The link fields are only allowed on their category: `courseId` with study, `startupTaskId` with startup, `workoutType` with workout, `mealSlot` with meal.
  - `BlockUpdateInput`: a partial of the create fields with the same refinements applied to the merged result. The server re-validates the merged block.
  - `BlockListQuery { from: ISO; to: ISO; includeRemoved?: 'true' }`
  - `blockMinutes(b: Pick<Block,'start'|'end'>): number`
- Produces (server):
  - `canTransition(from: BlockStatus, to: BlockStatus): boolean`, implementing:
    - `proposed` → `committed` or `removed`
    - `committed` → `done`, `partial`, `skipped` or `removed`
    - `done`/`partial`/`skipped` → `done`, `partial` or `skipped`
    - `removed` → nothing
  - `type BlockChange = { blockId: string; kind: 'created' | 'updated' | 'removed' }`
  - `interface BlockEventBus { emit(change: BlockChange): void; subscribe(fn: (c: BlockChange) => void): () => void }`
  - `createBlockEventBus(): BlockEventBus`: listeners run synchronously, so they share the caller's transaction
  - Service:
    - `listBlocks(ctx, q: { from: Date; to: Date; includeRemoved?: boolean }): Block[]`: blocks that overlap `[from, to)`, ordered by `start`, then `id`
    - `getBlock(ctx, id): Block`: throws `NOT_FOUND`
    - `createBlock(ctx, input: BlockCreateInput, opts?: { source?: BlockSource; status?: BlockStatus; locked?: boolean; planId?: string | null; fixedEventId?: string | null; actualMinutes?: number | null }): Block`
      - Defaults: `source 'manual'`, `status 'committed'`, `locked false`.
      - Emits `created`.
      - Validates that `courseId`/`startupTaskId` exist; otherwise `VALIDATION` with field errors.
    - `updateBlock(ctx, id, patch: BlockUpdateInput): Block`
      - Throws `CONFLICT` when the block has `source = 'fixed'` and the patch changes `start`/`end`/`category`.
      - Throws `INVALID_TRANSITION` when the block is `removed`.
      - Emits `updated`.
    - `setBlockStatus(ctx, id, to: BlockStatus, actualMinutes?: number | null): Block`
      - Throws `INVALID_TRANSITION` if `!canTransition`.
      - Emits `removed` when `to === 'removed'`, otherwise `updated`.
    - `deleteProposedBlocks(ctx, ids: string[]): void`: hard delete, only for blocks with `status = 'proposed'`. Emits nothing (proposed blocks never reach Google).
  - Routes:
    - `GET /api/blocks?from&to[&includeRemoved=true]`
    - `POST /api/blocks` → 201
    - `PATCH /api/blocks/:id`
    - `DELETE /api/blocks/:id` → status `removed`, returns the block

Table `blocks`: all §3.1 columns. Indexes on `start` and `fixed_event_id`. `course_id` and `startup_task_id` are plain text columns here; Tasks 6 and 7 add foreign keys with `ON DELETE SET NULL` when their tables are created.

- [ ] **Step 1: Write the failing tests**

```ts
// shared/test/blocks-schema.test.ts
test('rejects end before start with field error', () => {
  const r = BlockCreateInput.safeParse({ category: 'rest', title: 'x', start: '2026-10-14T20:00:00.000Z', end: '2026-10-14T19:00:00.000Z' });
  expect(r.success).toBe(false);
  expect(r.error!.issues[0].path).toEqual(['end']);
});
test('workout requires workoutType; courseId only allowed on study', () => { /* two safeParse failures */ });
test('blockMinutes', () => {
  expect(blockMinutes({ start: '2026-10-14T19:00:00.000Z', end: '2026-10-14T20:30:00.000Z' })).toBe(90);
});
```

```ts
// server/test/blocks.test.ts
test('create manual block defaults to committed/manual/unlocked and emits created', async () => {
  const c = await createTestClient(); const seen: BlockChange[] = []; c.ctx.events.subscribe(e => seen.push(e));
  const res = await c.post('/api/blocks', { category: 'rest', title: 'Walk', start: '2026-10-14T22:00:00.000Z', end: '2026-10-14T23:00:00.000Z' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'committed', source: 'manual', locked: false, actualMinutes: null });
  expect(seen).toEqual([{ blockId: res.body.id, kind: 'created' }]);
});
test('list returns overlapping blocks ordered by start, excludes removed by default', async () => { /* ... */ });
test('delete sets removed and emits removed; removed block cannot be patched', async () => { /* PATCH → 409 INVALID_TRANSITION */ });
test('canTransition table', () => {
  expect(canTransition('proposed', 'done')).toBe(false);
  expect(canTransition('done', 'skipped')).toBe(true);
  expect(canTransition('removed', 'committed')).toBe(false);
});
test('fixed blocks reject time changes', () => { /* createBlock(..., {source:'fixed'}) then updateBlock start → CONFLICT */ });
test('unknown courseId → 400 fields.courseId', async () => { /* ... */ });
test('block 23:30-00:30 local is returned for both days ranges but belongs to start day', async () => {
  // listBlocks for Thu local day range includes it (overlap); localDateOf(start) === Wed
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run blocks`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `npm run db:generate -w server`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server --project shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared server
git commit -m "feat: unified block model with status machine, event bus and API"
```

---

### Task 6: Studies domain — courses

**Files:**
- Create: `shared/src/schemas/courses.ts`, `server/src/domains/studies/service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `courses` and the FK from `blocks.course_id`), `server/src/app.ts`
- Test: `server/test/studies.test.ts`

**Interfaces:**
- Produces:
  - `Course { id, name, color, weeklyGoalMinutes, active, createdAt, updatedAt }`
  - `CourseInput { name: 1..80, color: /^#[0-9a-f]{6}$/i, weeklyGoalMinutes: int 0..6000 }`
  - `listCourses(ctx, opts?: { includeArchived?: boolean }): Course[]`, ordered by name
  - `createCourse(ctx, input): Course`
  - `updateCourse(ctx, id, input: Partial<CourseInput> & { active?: boolean }): Course`
  - `archiveCourse(ctx, id): Course` (sets `active = false`)
  - Routes:
    - `GET /api/courses[?includeArchived=true]`
    - `POST /api/courses` → 201
    - `PATCH /api/courses/:id`
    - `DELETE /api/courses/:id` → archives

- [ ] **Step 1: Write the failing tests**

```ts
test('create/list/update course', async () => { /* weeklyGoalMinutes 360 round-trips */ });
test('archive hides from default list but keeps it with includeArchived', async () => { /* ... */ });
test('duplicate active course names → 409 CONFLICT', async () => { /* ... */ });
test('rejects weeklyGoalMinutes > 6000 and bad color', async () => { /* 400 fields */ });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run studies`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): courses for study tracking"`

---

### Task 7: Startup domain — tasks and milestones

**Files:**
- Create: `shared/src/schemas/startup.ts`, `server/src/domains/startup/service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `startup_milestones`, `startup_tasks`, and the FK from `blocks.startup_task_id`), `server/src/app.ts`
- Test: `server/test/startup.test.ts`

**Interfaces:**
- Produces:
  - Types and inputs:
    - `StartupTask { id, title, status: 'todo'|'doing'|'done', milestoneId: string|null, sortOrder: number, doneAt: string|null }`
    - `Milestone { id, title, targetDate: string|null, doneAt: string|null, sortOrder }`
    - `TaskInput { title 1..200, milestoneId?: string|null, status? }`
    - `MilestoneInput { title 1..200, targetDate?: 'YYYY-MM-DD'|null, done?: boolean }`
  - Task functions:
    - `listTasks(ctx, opts?: { status?: TaskStatus }): StartupTask[]`, ordered by `sortOrder`
    - `createTask(ctx, input)`: appended at the end of the order
    - `updateTask(ctx, id, input)`: moving to `done` sets `doneAt = now`; moving away from `done` clears it
    - `deleteTask(ctx, id)`: blocks linked to the task keep their history, with `startupTaskId` set to null by the FK
    - `reorderTasks(ctx, ids: string[])`: `ids` must be a permutation of all task IDs, else 400
    - `listOpenTasks(ctx): StartupTask[]`: status ≠ done, ordered by `sortOrder` (Stage 2's planner uses this)
  - Milestone functions: `listMilestones`, `createMilestone`, `updateMilestone`, `deleteMilestone` (tasks keep `milestoneId = null`)
  - Routes:
    - `/api/startup/tasks` (GET, POST)
    - `/api/startup/tasks/:id` (PATCH, DELETE)
    - `POST /api/startup/tasks/reorder { ids }`
    - `/api/startup/milestones` (GET, POST)
    - `/api/startup/milestones/:id` (PATCH, DELETE)

- [ ] **Step 1: Write the failing tests**

```ts
test('new tasks append; reorder persists order', async () => { /* create a,b,c; reorder [c,a,b]; list → c,a,b */ });
test('reorder with missing id → 400', async () => {});
test('status done sets doneAt from clock; back to todo clears it', async () => {
  // doneAt === '2026-10-14T19:00:00.000Z'
});
test('deleting a task linked to a startup block keeps block with startupTaskId null', async () => {});
test('deleting milestone detaches its tasks', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run startup`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): startup tasks and milestones"`

---

### Task 8: Workouts domain — sessions, lifts, top sets, PRs

**Files:**
- Create: `shared/src/schemas/workouts.ts`, `server/src/domains/workouts/prs.ts`, `service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `workout_sessions`, `lifts`, `top_sets`), `server/src/app.ts`
- Test: `server/test/workouts.test.ts`, `server/test/prs.test.ts`

**Interfaces:**
- Produces:
  - Shared types and inputs:
    - `WorkoutDetails { intensity?: 1..5; notes?: string; gymFocus?: string; cardioKind?: string; distanceKm?: number (>0, ≤500); sportName?: string }`. This is reused by the review in Task 11.
    - `WorkoutSession { id, blockId: string|null, type: WorkoutType, date, durationMinutes, intensity, notes, gymFocus, cardioKind, distanceKm, sportName, paceSecPerKm: number|null }`
      - `paceSecPerKm` is computed and never stored: `round(durationMinutes*60/distanceKm)` when `type === 'cardio'` and `distanceKm` is set.
    - `SessionInput { type, date, durationMinutes: int 1..600 } & WorkoutDetails`
    - `Lift { id, name, sortOrder }`
    - `TopSet { id, liftId, date, weightKg: >0 ≤1000, reps: int 1..100, notes }`
    - `LiftSummary { lift: Lift; prs: PRs; lastSet: TopSet | null }`
  - `prs.ts` (pure):
    - `epley1rm(weightKg, reps): number` = `weightKg * (1 + reps / 30)`, rounded to 0.1
    - `computePRs(sets: TopSet[]): PRs`
      - Returns `{ heaviest: TopSet | null; bestE1rm: { value: number; set: TopSet } | null }`.
      - Tie on heaviest weight: more reps wins, then the earlier date.
  - Service:
    - Sessions: `listSessions(ctx, { from: string; to: string /* local dates, inclusive */ })`, `createSession(ctx, input)`, `updateSession`, `deleteSession`
    - Linked sessions (used by the review, Task 11):
      - `upsertSessionForBlock(ctx, block: Block, minutes: number, details: WorkoutDetails): WorkoutSession`: exactly one session per `blockId`. `date` = local date of `block.start`; `type` = `block.workoutType`.
      - `deleteSessionForBlock(ctx, blockId): void`
    - Lifts: `listLiftSummaries(ctx)`, `createLift`, `renameLift`, `deleteLift`
      - `deleteLift` throws `CONFLICT` if the lift has top sets.
    - Top sets: `addTopSet(ctx, liftId, input)`, `deleteTopSet`, `liftHistory(ctx, liftId): TopSet[]` (newest first)
  - Routes:
    - Sessions: `/api/workouts/sessions?from&to` (GET, POST), `/api/workouts/sessions/:id` (PATCH, DELETE)
    - Lifts: `/api/lifts` (GET summaries, POST), `/api/lifts/:id` (PATCH, DELETE)
    - Top sets: `/api/lifts/:id/sets` (GET history, POST), `/api/lifts/:id/sets/:setId` (DELETE)

Constraint: `workout_sessions.block_id` is UNIQUE, with an FK to `blocks` (`ON DELETE SET NULL`).

- [ ] **Step 1: Write the failing tests**

```ts
// prs.test.ts
test('epley', () => { expect(epley1rm(100, 3)).toBe(110); expect(epley1rm(80, 10)).toBe(106.7); });
test('computePRs picks heaviest and best e1rm separately', () => {
  const sets = [set(100, 3, '2026-09-01'), set(105, 1, '2026-09-08'), set(90, 8, '2026-09-15')];
  const p = computePRs(sets);
  expect(p.heaviest!.weightKg).toBe(105);
  expect(p.bestE1rm!.value).toBe(114); // 90*(1+8/30)
});
test('computePRs of empty is nulls', () => { expect(computePRs([])).toEqual({ heaviest: null, bestE1rm: null }); });
```

```ts
// workouts.test.ts
test('cardio session returns pace', async () => { /* 30 min, 5 km → paceSecPerKm 360 */ });
test('upsertSessionForBlock keeps one session per block', () => { /* call twice → 1 row, second values win */ });
test('lift summaries include PRs and last set', async () => {});
test('delete lift with sets → 409; without sets → 200', async () => {});
test('rejects reps 0 and weight 0', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run workouts prs`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): workout sessions, lifts, top sets and PRs"`

---

### Task 9: Food domain — saved meals and meal log

**Files:**
- Create: `shared/src/schemas/food.ts`, `server/src/domains/food/service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `meals`, `meal_logs`), `server/src/app.ts`
- Test: `server/test/food.test.ts`

**Interfaces:**
- Produces:
  - `Meal { id, name, kcal, proteinG, carbsG: number|null, fatG: number|null, notes, archived }`. Values are per serving.
  - `MealInput { name 1..120, kcal 0..5000, proteinG 0..500, carbsG?, fatG?, notes? }`
  - `MealLog { id, date, slot: MealSlot, mealId: string|null, freeText: string|null, servings, kcal, proteinG, carbsG, fatG }`
  - `MealLogInput`, a union of two shapes:
    - `{ date, slot, mealId, servings: >0 ≤20 }`: the server copies the meal's nutrition multiplied by `servings` (rounded to 0.1)
    - `{ date, slot, freeText 1..200, kcal, proteinG, carbsG?, fatG? }`: `servings = 1`
  - Meal functions:
    - `listMeals(ctx, { includeArchived? })`
    - `createMeal`, `updateMeal`
    - `archiveMeal(ctx, id)`
  - Meal log functions:
    - `logMeal(ctx, input): MealLog`
    - `deleteMealLog(ctx, id)`
    - `listMealLogs(ctx, date): MealLog[]`
    - `dailyTotals(ctx, dates: string[]): Record<string, { kcal; proteinG; carbsG; fatG }>`: every date is present, zero when there are no logs
  - Routes:
    - Meals: `/api/meals` (GET, POST), `/api/meals/:id` (PATCH, DELETE → archive)
    - Meal log: `/api/meal-logs?date` (GET), `/api/meal-logs` (POST), `/api/meal-logs/:id` (DELETE)

- [ ] **Step 1: Write the failing tests**

```ts
test('logging a saved meal copies nutrition × servings', async () => {
  // meal 600 kcal / 45 g protein, servings 1.5 → kcal 900, proteinG 67.5
});
test('editing or archiving the meal does not change past logs', async () => {
  // update meal kcal to 700, archive → log still 900 and mealId still set
});
test('archived meals hidden from library and cannot be newly logged (400 fields.mealId)', async () => {});
test('free-text log', async () => {});
test('dailyTotals returns zeros for empty days', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run food`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): saved meals and meal log with copied nutrition"`

---

### Task 10: Goals + weekly progress

**Files:**
- Create: `shared/src/schemas/goals.ts`, `server/src/domains/goals/service.ts`, `progress.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `goals`), `server/src/app.ts`
- Test: `server/test/goals.test.ts`, `server/test/progress.test.ts`

**Interfaces:**
- Consumes: `listBlocks`, `blockMinutes`, `listCourses`, `listSessions`, `dailyTotals`, `getTimezone`, and the time helpers.
- Produces:
  - `GoalSet`, the API shape. `null` means no goal.
    ```ts
    {
      startupMinutes: number|null;
      workoutsTotal: number|null;
      workoutsByType: { gym: number|null; cardio: number|null; sport: number|null };
      freeEvenings: number|null; // 0..7
      dailyKcal: { target: number; tolerancePct: number } | null; // tolerancePct default 10
      dailyProteinG: number|null;
    }
    ```
    Stored as `goals` rows (§3.2 columns); a `null` goal has no active row.
  - `getGoals(ctx): GoalSet`
  - `saveGoals(ctx, input: GoalSet): GoalSet`: replaces the whole set in one transaction
  - `type Metric = { goal: number | null; planned: number; actual: number }`
  - `WeekProgress`:
    ```ts
    {
      weekStart: string;
      study: Array<{ courseId: string; name: string; color: string } & Metric>; // minutes
      startup: Metric;                                                           // minutes
      work: { planned: number; actual: number };                                 // minutes
      workouts: { total: Metric; byType: Record<WorkoutType, Metric> };          // counts
      freeEvenings: Metric & { freeDates: string[] };                            // counts
      nutrition: Array<{ date: string; kcal: number; proteinG: number; kcalTarget: number|null;
                         proteinTarget: number|null; kcalOk: boolean|null; proteinOk: boolean|null }>;
    }
    ```
  - `getWeekProgress(ctx, weekStart: string, opts?: { classesCountTowardStudy?: boolean /* default false */; eveningStart?: string; sleepStart?: string }): WeekProgress`
  - Routes:
    - `GET /api/goals`, `PUT /api/goals`
    - `GET /api/progress/week?weekStart=YYYY-MM-DD` (400 if the date isn't a Monday)

**Progress rules.** Only blocks whose **local start date** falls in the week count.
- **planned** = the sum of `blockMinutes` over blocks with status `committed`/`done`/`partial`/`skipped` and `source ≠ 'unplanned'`.
- **actual** = the sum of `actualMinutes` over `done`/`partial` blocks.
- **Study:** split per `courseId`. When `classesCountTowardStudy` is false, `source = 'fixed'` blocks are excluded. The `study` list contains every active course plus any archived course that has blocks this week. Study blocks without a course are excluded from the list.
- **Workouts:**
  - planned = the count of workout blocks with status `committed`/`done`/`partial`/`skipped`.
  - actual = the count of `done`/`partial` workout blocks, plus sessions in the week with `blockId = null`.
  - Both are counted in total and per type.
- **Free evenings:**
  - A date is free when no `study`/`startup`/`work` block with status `committed`/`done`/`partial` overlaps `[zonedToUtc(date, eveningStart), zonedToUtc(date, sleepStart))`.
  - planned = the count of free dates among all 7 days.
  - actual = the count of free dates `≤ today` (local).
  - `freeDates` = the free dates `≤ today`.
- **Nutrition:**
  - `kcalOk = |kcal − target| ≤ target × tolerancePct / 100`.
  - `proteinOk = proteinG ≥ target`.
  - Both are `null` when there's no goal **or** the date is after today.

- [ ] **Step 1: Write the failing tests**

```ts
// goals.test.ts
test('GoalSet round-trips and null removes a goal', async () => {});
test('freeEvenings must be 0..7, dailyKcal tolerance defaults to 10', async () => {});
```

```ts
// progress.test.ts  (week 2026-10-12, today = Wed 2026-10-14)
test('study planned vs actual per course', () => {
  // course A goal 360; blocks: Mon 120 done(120), Tue 90 partial(60), Thu 60 committed, Fri 60 skipped
  // → planned 330, actual 180, goal 360
});
test('unplanned blocks count toward actual but not planned', () => {});
test('block 23:30-00:30 starting Sunday counts in this week, starting the next Monday does not', () => {
  // Sun 2026-10-18 23:30 local done 60 → counts; Mon 2026-10-19 00:15 → excluded
});
test('fixed class blocks are excluded from study unless classesCountTowardStudy', () => {});
test('workouts actual includes standalone sessions; byType split', () => {});
test('free evenings: work block 19:30 Tue makes Tue not free; social block does not', () => {
  // freeEvenings.actual counts Mon..Wed only
});
test('nutrition ok flags with tolerance; future days null', () => {
  // target 2400 ±10%: 2200 → ok, 2000 → not ok; Thu → kcalOk null
});
test('archived course with activity this week still listed', () => {});
test('weekStart that is not a Monday → 400', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run goals progress`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): goals and weekly progress calculation"`

---

### Task 11: Daily review

**Files:**
- Create: `shared/src/schemas/review.ts`, `server/src/domains/review/service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `daily_reviews(date text pk, completed_at text)`), `server/src/app.ts`
- Test: `server/test/review.test.ts`

**Interfaces:**
- Consumes: `listBlocks`, `getBlock`, `setBlockStatus`, `createBlock`, `upsertSessionForBlock`, `deleteSessionForBlock`, `updateTask`, `getWeekProgress`.
- Produces:
  - `ReviewEntry`:
    ```ts
    { blockId: string; outcome: 'done'|'partial'|'skipped'; actualMinutes?: number;
      workout?: WorkoutDetails; completeStartupTask?: boolean }
    ```
  - `UnplannedEntry = BlockCreateInput & { actualMinutes?: number; workout?: WorkoutDetails }`
  - `ReviewSubmission { date: 'YYYY-MM-DD'; entries: ReviewEntry[]; unplanned: UnplannedEntry[] }`
  - `PendingReview { date; pending: Block[] /* committed, start < end of date, oldest first */; reviewed: Block[] /* done|partial|skipped with local start date == date */; completedAt: string|null }`
  - `getPendingReview(ctx, date): PendingReview`
  - `submitReview(ctx, s: ReviewSubmission): { date: string; progress: WeekProgress }`. Everything runs in **one transaction**:
    1. For each entry, set the status and actual minutes:
       - `done` → `actualMinutes = blockMinutes`
       - `partial` → `actualMinutes` is required and must be an integer in `1..blockMinutes`, else `VALIDATION` with `fields["entries.<i>.actualMinutes"]`
       - `skipped` → 0
    2. For a workout block:
       - `done`/`partial` → upsert its session using the actual minutes and `entry.workout`.
       - `skipped` → delete its session.
    3. `completeStartupTask` combined with the block's `startupTaskId` sets that task to `done`.
    4. Each unplanned entry becomes `createBlock(..., { source: 'unplanned', status: actualMinutes < duration ? 'partial' : 'done', actualMinutes: actualMinutes ?? duration })`. A workout entry also gets a session.
    5. Upsert `daily_reviews(date, completed_at = now)`.
    6. Return the progress for the week that contains `date`.
  - Routes:
    - `GET /api/review?date=YYYY-MM-DD` → `PendingReview`
    - `POST /api/review` → `{ date, progress }`

- [ ] **Step 1: Write the failing tests**

```ts
test('pending lists today and older unreviewed committed blocks, oldest first', async () => {});
test('done/partial/skipped set actualMinutes; progress returned', async () => {});
test('partial with 0, negative, or > duration → 400 with fields["entries.0.actualMinutes"] and nothing written', async () => {
  // second valid entry in the same submission is NOT applied (transaction)
});
test('re-review done → skipped updates totals and deletes the workout session', async () => {
  // review workout block done → 1 session; re-review skipped → 0 sessions; progress.workouts.total.actual 0
});
test('re-review partial 30 → done keeps a single session with full minutes', async () => {});
test('completeStartupTask marks linked task done', async () => {});
test('unplanned entries create unplanned done blocks', async () => {});
test('review of a proposed or removed block → 409 INVALID_TRANSITION', async () => {});
test('block 23:30–00:30 starting Wed shows in Wed review, not Thu reviewed list', async () => {});
test('completedAt recorded', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run review`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): transactional daily review"`

---

### Task 12: Web foundation — Vite app, theme, layout, API client, auth screens

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/index.html`
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles/tokens.css`, `web/src/styles/global.css`
- Create: `web/src/api/client.ts`, `web/src/api/hooks/auth.ts`, `web/src/api/hooks/settings.ts`
- Create: `web/src/components/Layout.tsx`, `TabBar.tsx`, `Sidebar.tsx`, `CategoryDot.tsx`, `ProgressBar.tsx`, `Field.tsx`, `Modal.tsx`, `Toast.tsx`
- Create: `web/src/features/auth/PinScreen.tsx`, `web/src/features/auth/AuthGate.tsx`
- Create: `web/test/setup.ts`, `web/test/render.tsx`, `web/test/mockApi.ts`
- Test: `web/test/auth.test.tsx`, `web/test/client.test.ts`

**Interfaces:**
- Produces:
  - API client:
    - `apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>`: sends JSON, `credentials: 'same-origin'`; on a non-2xx response it throws `ApiError`
    - `class ApiError extends Error { status: number; code: ErrorCode; fields?: Record<string,string> }`
    - A 401 from any route except `/api/auth/*` invalidates the `['auth']` query, so the PIN screen comes back.
  - Hooks:
    - `useAuthStatus()`, `useSetupPin()`, `useLogin()`, `useLogout()`, `useChangePin()`
    - `useSettings()`, `useSaveSettings()`
    - `useTimezone(): string`: the server setting, falling back to the browser zone
  - `<AuthGate>`: shows `PinScreen` in setup mode (enter the PIN twice) when `pinSet` is false, in login mode when not authenticated, otherwise its children. A lockout shows "Too many attempts — try again in 15 minutes".
  - `<Layout>`:
    - Under 768 px wide: a bottom `TabBar` with Today `/`, Review `/review`, Areas `/areas`, Dashboard `/dashboard`, and a header gear linking to Settings `/settings`.
    - At 768 px and up: a `Sidebar` with the same items.
    - Stage 2 inserts Week `/week` second.
  - `tokens.css`: CSS variables on `:root` (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--danger`, `--radius`, spacing scale), redefined under `@media (prefers-color-scheme: dark)`. Category colors come from `CATEGORY_META` through inline style variables.
  - Test helpers:
    - `renderWithProviders(ui, { route?: string })`: wraps in a `QueryClientProvider` (retry off) and a `MemoryRouter`
    - `mockApi(handlers: Record<string /* "GET /api/x" */, (body: any, url: URL) => unknown | { status: number; body: unknown }>)`: stubs `fetch`; unmatched calls fail the test; returns `calls: Array<{ method; path; body }>`

**`web/package.json`:**
- dependencies: `react@^19.3.0`, `react-dom@^19.3.0`, `react-router@^8.4.0`, `@tanstack/react-query@^5.104.2`, `@life-tracker/shared@*`
- devDependencies: `vite@^8.3.4`, `@vitejs/plugin-react@^6.1.2`, `jsdom@^30.1.2`, `@testing-library/react@^16.3.3`, `@testing-library/user-event@^14.6.7`, `@testing-library/jest-dom@^7.0.1`, `@types/react`, `@types/react-dom`
- Vite dev server: port 5173, proxying `/api` to `http://127.0.0.1:4280`.

- [ ] **Step 1: Write the failing tests**

```ts
// client.test.ts
test('apiFetch throws ApiError with code and fields', async () => {
  mockApi({ 'POST /api/courses': () => ({ status: 400, body: { error: { code: 'VALIDATION', message: 'bad', fields: { name: 'Required' } } } }) });
  await expect(apiFetch('/api/courses', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 400, code: 'VALIDATION', fields: { name: 'Required' } });
});
```

```tsx
// auth.test.tsx
test('shows setup when no pin, requires matching confirmation', async () => {
  mockApi({ 'GET /api/auth/status': () => ({ pinSet: false, authenticated: false }), 'POST /api/auth/setup': () => ({ pinSet: true, authenticated: true }) });
  // type 1234 / 1235 → "PINs don't match"; 1234/1234 → POST called with { pin: '1234' }
});
test('login error shows message; lockout shows 15 minute message', async () => {});
test('authenticated renders children inside layout with Today tab', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project web`
Expected: FAIL.

- [ ] **Step 3: Implement the files**

- [ ] **Step 4: Run the tests and check the app by hand**

Run: `npx vitest run --project web` → PASS.
Run: `npm run dev`, then open `http://localhost:5173`. Expected: the setup screen appears; after setup you see the empty layout.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): app shell, theme, layout, API client and PIN screens"`

---

### Task 13: Web — Today screen + manual blocks

**Files:**
- Create: `web/src/api/hooks/blocks.ts`, `web/src/api/hooks/food.ts` (only `useMealLogs` and `useMeals`), `web/src/api/hooks/progress.ts`
- Create: `web/src/features/today/TodayPage.tsx`, `Timeline.tsx`, `NextUpCard.tsx`, `MacroSummary.tsx`, `web/src/features/blocks/BlockForm.tsx`
- Test: `web/test/today.test.tsx`, `web/test/blockForm.test.tsx`

**Interfaces:**
- Consumes: `GET /api/blocks`, `POST/PATCH/DELETE /api/blocks`, `GET /api/meal-logs`, `GET /api/progress/week`, `GET /api/courses`, `GET /api/startup/tasks`.
- Produces:
  - Hooks:
    - `useBlocks(range: { from: string; to: string })`
    - `useCreateBlock()`, `useUpdateBlock()`, `useRemoveBlock()`: on success they invalidate `['blocks']`, `['progress']` and `['review']`
    - `useWeekProgress(weekStart)`
  - `<BlockForm initial?: Partial<Block> onDone />`, reused in Stage 2:
    - Fields: category select, title, date, start time, end time, plus the conditional link field for the category: course, startup task, workout type or meal slot.
    - Converts local inputs to UTC with `zonedToUtc` and `useTimezone()`.
    - Shows server `fields` errors next to the inputs.
  - `TodayPage`:
    - Timeline of today's non-removed blocks: colored bar, time range, title, status icon.
    - `NextUpCard`: the first committed block whose end is after now.
    - `MacroSummary`: kcal and protein against the goals.
    - An "Add block" button that opens `BlockForm`.
    - An "End-of-day review" link to `/review`, with an emphasized style when the local time is at or after `REVIEW_PROMPT_TIME_DEFAULT`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('today shows blocks in time order with category label and next up', async () => {});
test('review button is emphasized at/after 20:00 local', async () => { /* vi.setSystemTime */ });
test('macro summary shows 1450 / 2400 kcal and 98 / 150 g protein', async () => {});
test('BlockForm converts local 19:00 LA to 02:00Z next day and posts courseId only for study', async () => {});
test('BlockForm shows server field error under End', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run today blockForm`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): Today screen and manual block form"`

---

### Task 14: Web — Review screen

**Files:**
- Create: `web/src/api/hooks/review.ts`, `web/src/features/review/ReviewPage.tsx`, `ReviewRow.tsx`, `UnplannedForm.tsx`, `WorkoutDetailsFields.tsx`
- Test: `web/test/review.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/review`, `BlockForm` field components, `WorkoutDetails`.
- Produces:
  - Hooks: `usePendingReview(date)`, `useSubmitReview()` (invalidates blocks, progress, review, workouts and startup).
  - `ReviewPage`:
    - A date selector (defaults to today; previous days are allowed).
    - For each pending block, a row with ✅ Done / ◐ Partly / ✗ Skipped:
      - Partly reveals a minutes input, prefilled with half the duration.
      - Workout blocks reveal `WorkoutDetailsFields`: cardio → kind + distance; gym → focus; sport → sport name; all → intensity 1–5 and notes.
      - Startup blocks with a linked task show a "Mark task done" checkbox.
    - "Add unplanned activity" opens `UnplannedForm`.
    - Already-reviewed blocks appear in a "Reviewed" section and can be changed.
    - Submit is disabled until every pending row has an outcome.
    - After submitting, it shows a summary built from the returned `progress`: study, startup and workouts as actual/goal.

- [ ] **Step 1: Write the failing tests**

```tsx
test('submit disabled until all rows have an outcome; payload matches selections', async () => {
  // expect calls[0].body toEqual { date: '2026-10-14', entries: [{ blockId: 'b1', outcome: 'done' }, { blockId: 'b2', outcome: 'partial', actualMinutes: 45 }], unplanned: [] }
});
test('partial minutes > duration shows server field error inline', async () => {});
test('cardio workout details are included', async () => {});
test('after submit shows totals vs goals', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run review --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): end-of-day review flow"`

---

### Task 15: Web — Areas: Studies, Work, Startup

**Files:**
- Create: `web/src/api/hooks/courses.ts`, `web/src/api/hooks/startup.ts`
- Create: `web/src/features/areas/AreasPage.tsx` (index of area cards linking to the sub-pages), `areas/studies/StudiesPage.tsx`, `areas/work/WorkPage.tsx`, `areas/startup/StartupPage.tsx`
- Test: `web/test/studies.test.tsx`, `web/test/startup.test.tsx`, `web/test/work.test.tsx`

**Interfaces:**
- Consumes: the courses and startup APIs, `useWeekProgress`, `useBlocks`.
- Produces:
  - Routes: `/areas`, `/areas/studies`, `/areas/work`, `/areas/startup`. Stage 1 adds `/areas/workouts` and `/areas/food` in Tasks 16 and 17.
  - **Studies:** a list of courses, each with color, a progress bar (actual/goal minutes shown as hours, e.g. "3.0 / 6.0 h") and the planned value. Add, edit (name, color, weekly hours) and archive. The weekly goal is entered in hours and sent as minutes.
  - **Work:** this week's work blocks (date, time, status) with planned and actual hours.
  - **Startup:**
    - Tasks grouped by milestone, plus "No milestone".
    - Three status columns: to do, doing, done. Changing status is a select on each task.
    - Reorder with ↑/↓ buttons that call `reorder` (drag-and-drop isn't needed in Stage 1).
    - Add and edit tasks and milestones.
    - This week's startup hours against the goal.

- [ ] **Step 1: Write the failing tests**

```tsx
test('studies shows hours progress per course and saves weekly hours as minutes', async () => { /* 6 h → weeklyGoalMinutes 360 */ });
test('archive course asks confirmation and calls DELETE', async () => {});
test('startup move task down calls reorder with new order', async () => {});
test('startup task status change to done calls PATCH', async () => {});
test('work page sums planned and actual hours', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run studies startup work --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): studies, work and startup area pages"`

---

### Task 16: Web — Workouts + Top Lifts

**Files:**
- Create: `web/src/api/hooks/workouts.ts`, `web/src/features/areas/workouts/WorkoutsPage.tsx`, `SessionForm.tsx`, `TopLiftsPage.tsx`, `LiftHistoryChart.tsx`
- Test: `web/test/workouts.test.tsx`, `web/test/topLifts.test.tsx`

**Interfaces:**
- Consumes: the workouts and lifts APIs.
- Produces:
  - Routes: `/areas/workouts`, `/areas/workouts/lifts`.
  - **Workouts:**
    - Session history for the last 8 weeks, newest first.
    - Filter chips: All / Gym / Cardio / Sport.
    - Cardio rows show distance and pace (`m:ss /km`).
    - "Log session" opens `SessionForm` (fields depend on the type).
    - This week's count by type against the goals.
  - **Top Lifts:**
    - One card per lift: name, heaviest set (`100 kg × 3`), best estimated 1RM (`e1RM 110.0 kg`), last set date.
    - "Add top set" opens a modal with date (default today), weight, reps and notes.
    - Selecting a lift opens its history: a newest-first list plus `LiftHistoryChart`, an inline SVG line of e1RM over time with no chart library.
    - Add, rename and delete lifts. Deleting is disabled when the lift has sets, with the hint "Delete its sets first".

- [ ] **Step 1: Write the failing tests**

```tsx
test('cardio session shows pace 6:00 /km for 5 km in 30 min', async () => {});
test('filter chips filter sessions by type', async () => {});
test('lift card shows heaviest and e1RM; add top set posts weightKg and reps', async () => {});
test('delete lift disabled when it has sets', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run workouts topLifts --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): workout sessions and top lifts pages"`

---

### Task 17: Web — Food: saved meals library + meal log

**Files:**
- Modify: `web/src/api/hooks/food.ts` (add mutations)
- Create: `web/src/features/areas/food/FoodPage.tsx`, `MealLibrary.tsx`, `MealLogDay.tsx`, `MealForm.tsx`
- Test: `web/test/food.test.tsx`

**Interfaces:**
- Consumes: the meals and meal-logs APIs, `useGoals` (Task 18 creates `useGoals`; if Task 18 isn't done yet, create `web/src/api/hooks/goals.ts` here with `useGoals` only).
- Produces:
  - Route `/areas/food` with two tabs: **Log** and **Library**. Stage 2 adds **Plan**.
  - **Log:**
    - A date selector.
    - Four slots (breakfast, lunch, dinner, snack), each listing its logs with kcal and protein.
    - "Add" offers "pick saved meal + servings" or "free text + kcal/protein".
    - Daily totals against targets, shown as a ProgressBar for kcal and protein.
  - **Library:** a searchable list of saved meals (name, kcal, protein, carbs/fat if set). Add, edit and archive.

- [ ] **Step 1: Write the failing tests**

```tsx
test('logging saved meal with 1.5 servings posts mealId and servings', async () => {});
test('free text log posts kcal and proteinG', async () => {});
test('daily totals vs targets render', async () => {});
test('library search filters by name; archive calls DELETE', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run food --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): meal library and meal log"`

---

### Task 18: Web — Dashboard + Settings (goals, timezone, PIN)

**Files:**
- Create: `web/src/api/hooks/goals.ts` (or extend it), `web/src/features/dashboard/DashboardPage.tsx`, `AreaProgressRow.tsx`
- Create: `web/src/features/settings/SettingsPage.tsx`, `GoalsForm.tsx`, `TimezoneForm.tsx`, `ChangePinForm.tsx`
- Test: `web/test/dashboard.test.tsx`, `web/test/settings.test.tsx`

**Interfaces:**
- Consumes: `useWeekProgress`, `useGoals`, `useSaveGoals`, `useSettings`, `useSaveSettings`, `useChangePin`, `useLogout`.
- Produces:
  - **Dashboard** (`/dashboard`):
    - A week switcher: ◀ this week ▶, using `weekStartOf` and `addDays(±7)`.
    - Rows for each course, Startup, Work, Workouts (total plus by type), Free evenings, and Nutrition (7 daily dots for kcal and protein: green ok, red not ok, grey null).
    - Each row draws a three-part bar: actual (solid), planned (outline) and goal (marker).
    - Stage 5 adds trends and streaks below.
  - **Settings** (`/settings`), with sections Goals, Timezone (a select of `Intl.supportedValuesOf('timeZone')`), Security (change PIN, log out), and About (version).
    - Stage 2 adds Fixed schedule and Planner preferences; Stage 3 adds Google; Stage 5 adds Backups.
  - `GoalsForm`:
    - Edits the `GoalSet`. Startup is entered in hours, sent as minutes.
    - Every goal has a "no goal" toggle that sends `null`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('dashboard renders course rows with actual/planned/goal hours and nutrition dots', async () => {});
test('week switcher requests previous week progress', async () => { /* GET /api/progress/week?weekStart=2026-10-05 */ });
test('goals form sends startupMinutes from hours and null when toggled off', async () => {});
test('timezone save calls PUT /api/settings', async () => {});
test('change pin mismatched confirmation blocks submit', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run dashboard settings --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the full suite, typecheck, and check by hand**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

Then do a manual check in `npm run dev`:
1. Set up the PIN.
2. Add a course and goals.
3. Add blocks for today.
4. Complete the review.
5. Check that the dashboard shows the numbers.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): dashboard and settings (goals, timezone, PIN)"`

---

### Task 19: README for Stage 1

**Files:**
- Create: `README.md`. Replace the existing one-line README, keeping its title.

- [ ] **Step 1: Write the README**

Sections:
- What Life Tracker is, in 2–3 sentences, with a link to the spec.
- Requirements: Node ≥ 22.
- `npm install`
- `npm run dev`, which serves at `http://localhost:5173` (the API is on 4280).
- `npm test`
- `npm run build && node --import tsx server/src/index.ts` for a production run on `http://127.0.0.1:4280`.
- The data directory and the `LT_DATA_DIR`/`LT_PORT` variables.
- Project layout.
- The stage roadmap, linking the five plan files.

- [ ] **Step 2: Verify that the build works**

Run: `npm run build && LT_DATA_DIR=$(mktemp -d) node --import tsx server/src/index.ts`
Then open `http://127.0.0.1:4280`. Expected: the app loads from `web/dist`, and the setup screen appears. Stop the server.

- [ ] **Step 3: Commit** — `git commit -m "docs: README for stage 1"`

---

## Self-Review Notes

- **Spec coverage, Stage 1 scope:**
  - §2 → Tasks 1–3
  - §3.1 → Task 5
  - §3.2 courses/startup/workouts/lifts/top_sets/meals/meal_logs/goals → Tasks 6–10
  - §3.3 derived values → Task 10 (streaks deferred to Stage 5 per §11)
  - §4.4 → Tasks 11, 14
  - §4.6 "This week" → Tasks 10, 18
  - §7 Today/Review/Areas/Dashboard/Settings (stage-1 parts) → Tasks 12–18
  - §8 binding/PIN/CSRF/cookies → Tasks 3–4
  - §9 validation, error shape, transactions, pre-migration backup → Tasks 2, 5, 11
  - §10 domain and API tests → each task
- **Deferred by design:**
  - Fixed schedule, preferences, planner, meal plan → Stage 2
  - Google → Stage 3
  - Quick-add/replan → Stage 4
  - launchd, PWA manifest and service worker, backups, trends, streaks → Stage 5
