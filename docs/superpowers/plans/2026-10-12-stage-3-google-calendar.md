# Stage 3 — Google Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Google Calendar.
- Committed blocks are mirrored into a dedicated "Life Tracker" calendar.
- Events from the calendars the user chooses become busy time for the planner.
- Moves and deletes the user makes in Google flow back into the app.
- New outside events that clash with the plan raise conflicts.
- The app stays fully usable when Google is unreachable.

**Architecture:**
- Everything Google-specific lives in `server/src/calendar/`, behind a small `CalendarClient` interface. There's a real implementation (`@googleapis/calendar`) and an in-memory `FakeCalendarClient` used by every test.
- Writes go through a persistent `sync_queue`, filled by a `BlockEventBus` subscriber and drained by a worker with exponential backoff.
- Reads use incremental `syncToken` sync for the Life Tracker calendar and a windowed fetch with diffing for the busy calendars.
- One `runSync` job runs every 5 minutes and on demand.

**Tech Stack:** Stage 1–2 stack, plus `@googleapis/calendar@^20.1.0` and `google-auth-library@^11.2.0`.

**Spec:** `docs/superpowers/specs/2026-10-12-life-tracker-design.md`. Sections covered: §3.2 `sync_queue`, `calendar_state`, `conflicts`; §4.3; §6.1–6.4; §7 banners, the sync badge, the "Changes from Google" feed and Settings → Google; §9; §11 stage 3.

**Builds on:** the Stage 1 and Stage 2 plans: `BlockEventBus`, `getBlock`, `setBlockStatus`, `updateFixedBlockInternal`, `listBlocks`, `BusyProvider`/`BusyInterval`, `createScheduler`, `getTimezone`, `getPreferences`, `createTestClient`, `mockApi`.

## Global Constraints

All Global Constraints from Stages 1–2 apply. In addition:

- **OAuth.**
  - The client is a Google Cloud **Desktop app** OAuth client. Its JSON is downloaded to `<dataDir>/secrets/google-client.json` (Google's `{"installed": {...}}` format).
  - The redirect URI is `http://127.0.0.1:<port>/api/google/callback`, or `http://localhost:<port>/...`, matching the host the user started from.
  - The flow uses PKCE plus a random `state`; pending states expire after 10 minutes.
  - Requests use `access_type=offline` and `prompt=consent`.
  - Connecting is only allowed from a loopback host. On any other host it returns 400 "Connect Google from the Mac (http://127.0.0.1:4280)".
- **Scopes**, exactly:
  - `https://www.googleapis.com/auth/calendar.app.created`
  - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
  - `https://www.googleapis.com/auth/calendar.events.readonly`
- **Tokens** live at `<dataDir>/secrets/google.json`, file mode `0600`, and are never included in backups.
- **The calendar** created on first connect is named exactly `Life Tracker`, in the configured timezone. Its ID is stored in `calendar_state`.
- **Mirroring rule.** A block is mirrored when `source ≠ 'unplanned'` and `status ∈ {committed, done, partial, skipped}`.
  - Moving to `removed` deletes the event.
  - Changing only between `committed/done/partial/skipped` never changes the event. This is enforced by the event-body hash.
- **Event body.**
  - `summary = title`
  - `start`/`end` = `{ dateTime: <ISO>, timeZone: <tz> }`
  - `colorId = CATEGORY_META[category].gcalColorId`
  - `description = "Life Tracker · <appOrigin>/week?block=<id>"`
  - `extendedProperties.private.lifeTrackerBlockId = <id>`
  - `appOrigin` is `LT_PUBLIC_ORIGIN` if set, else `http://127.0.0.1:<port>`.
- **Backoff.** The delay is `min(30 s × 2^(attempts−1), 3600 s)` with no limit on attempts. A 401/`invalid_grant` pauses the queue without counting an attempt.
- **Busy calendars.**
  - Fetched for the window `now − 1 day .. now + 56 days` with `singleEvents=true`.
  - These are ignored:
    - `status = cancelled`
    - `transparency = transparent`
    - events where the user's own attendee entry has `responseStatus = declined`
    - all-day events, unless `includeAllDay` is on (default `false`)
  - The Life Tracker calendar is never a busy calendar.
- **Sync interval.** Every 5 minutes, plus `POST /api/sync/now`.
- **Decision (deviation from spec §6.3, noted):** busy calendars use a windowed fetch with a diff against a local cache, not `syncToken`. Google doesn't allow `syncToken` together with `timeMin`/`timeMax`, and a full unbounded sync of a personal calendar is wasteful. The Life Tracker calendar does use `syncToken`.

## Review Focus

1. **Echo of our own writes.** Events the worker created or patched come back in the next incremental pull. They must **not** create "Changes from Google" entries, queue rows or writes. *Task 6 test.*
2. **Status-only changes**, e.g. marking 20 blocks done in the review, must make **zero** Google calls. *Task 5 test.*
3. **A token revoked halfway through the queue.** The queue is kept, attempts aren't incremented, the "Reconnect Google" state is set, and after reconnecting everything flushes in order. *Task 5 test.*
4. **Recurring, declined, free ("transparent") and all-day events in busy calendars.** Each occurrence of a recurring event counts as busy. Declined, transparent and (by default) all-day events don't. *Task 7 test.*
5. **A block edited in both places between syncs.** The newer change wins (block `updatedAt` vs event `updated`). Losing app-side edits are re-pushed; losing Google-side edits are overwritten. *Task 6 test.*

---

## File Structure

```
shared/src/schemas/google.ts            GoogleStatus, CalendarListItem, BusyCalendarsInput, SyncStatus, Conflict, GoogleChange
server/src/calendar/
  client.ts          CalendarClient interface, GEvent, EventBody, CalendarApiError, toCalendarApiError
  googleClient.ts    real CalendarClient over @googleapis/calendar
  oauth.ts           client credentials, PKCE/state, token store, GoogleIntegration
  state.ts           calendar_state accessors
  eventBody.ts       toGoogleEvent, eventHash, shouldMirror
  enqueue.ts         BlockEventBus subscriber → sync_queue
  worker.ts          processQueue
  pullLifeTracker.ts incremental sync of the Life Tracker calendar
  pullBusy.ts        windowed fetch + diff of busy calendars
  conflicts.ts       detectConflicts, dismissConflict, listConflicts
  busyProvider.ts    cached BusyProvider
  setup.ts           ensureCalendarSetup, recreateCalendar
  runSync.ts         orchestration
  routes.ts          /api/google/*, /api/sync/*, /api/conflicts/*
server/test/fakes/fakeCalendar.ts       FakeCalendarClient, createFakeGoogle
server/test/calendar/*.test.ts
web/src/api/hooks/google.ts
web/src/components/{SyncBadge,Banners}.tsx
web/src/features/today/ChangesFeed.tsx
web/src/features/settings/GoogleSection.tsx
docs/setup-google.md  docs/manual-e2e.md
```

---

### Task 1: CalendarClient interface + FakeCalendarClient

**Files:**
- Create: `server/src/calendar/client.ts`, `server/test/fakes/fakeCalendar.ts`
- Test: `server/test/calendar/fakeCalendar.test.ts`

**Interfaces:**
- Produces (`client.ts`):
  ```ts
  interface GEvent {
    id: string; status: 'confirmed' | 'tentative' | 'cancelled';
    summary?: string; description?: string; colorId?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?:   { dateTime?: string; date?: string; timeZone?: string };
    updated: string; etag: string; transparency?: 'opaque' | 'transparent';
    attendees?: { self?: boolean; responseStatus?: string }[];
    extendedProperties?: { private?: Record<string, string> };
  }
  type EventBody = Pick<GEvent, 'summary' | 'description' | 'colorId' | 'start' | 'end' | 'extendedProperties'>;
  interface ListEventsQuery { syncToken?: string; timeMin?: string; timeMax?: string; singleEvents?: boolean; pageToken?: string; showDeleted?: boolean }
  interface CalendarClient {
    listCalendars(): Promise<{ id: string; summary: string; primary?: boolean; accessRole: string }[]>;
    createCalendar(summary: string, timeZone: string): Promise<{ id: string }>;
    calendarExists(calendarId: string): Promise<boolean>;
    insertEvent(calendarId: string, body: EventBody): Promise<GEvent>;
    patchEvent(calendarId: string, eventId: string, body: EventBody): Promise<GEvent>;
    deleteEvent(calendarId: string, eventId: string): Promise<void>;
    listEvents(calendarId: string, q: ListEventsQuery): Promise<{ items: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>;
  }
  class CalendarApiError extends Error { status: number; reason?: string }  // reason 'invalid_grant' | 'rateLimitExceeded' | ...
  ```
- Produces (`fakeCalendar.ts`): `class FakeCalendarClient implements CalendarClient`, with these extras:
  - `calls: Array<{ method: string; calendarId: string; eventId?: string }>`
  - `failNext(method: keyof CalendarClient, error: CalendarApiError, times = 1)`
  - `addExternalEvent(calendarId, partial: Partial<GEvent> & { start; end }): GEvent`
  - `userMove(calendarId, eventId, start: string, end: string, updatedAt: string)`
  - `userDelete(calendarId, eventId)`
  - `deleteCalendar(calendarId)`
  - `expireSyncTokens()`
  - `events(calendarId): GEvent[]`

  Its behavior:
  - Each mutation bumps a global sequence, sets `updated` from a settable clock, and sets `etag = "seq-N"`.
  - `listEvents` with a `syncToken` returns the events changed after that sequence, including `cancelled` tombstones for deleted ones, and then `nextSyncToken`.
  - After `expireSyncTokens()`, using an old token throws `CalendarApiError(410)`.
  - With `timeMin`/`timeMax` it filters by overlap. With `singleEvents` it returns events as stored (tests add each occurrence of a recurring event separately).
  - It pages 2 items at a time, so tests exercise pagination.
  - Any call on a deleted calendar throws `CalendarApiError(404)`.
- `createFakeGoogle(fake)`: returns a `GoogleIntegration` (defined in Task 2) that is configured and connected and returns `fake`.

- [ ] **Step 1: Write the failing tests**

```ts
test('insert → list with syncToken returns only changes since token, with pagination', async () => {});
test('deleted event appears as cancelled tombstone in incremental list', async () => {});
test('expired sync token throws 410', async () => {});
test('failNext throws configured error once then succeeds', async () => {});
test('deleted calendar → 404 on any call', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/fakeCalendar`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run calendar/fakeCalendar`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): CalendarClient interface and in-memory fake"`

---

### Task 2: OAuth, token store, GoogleIntegration, real client

**Files:**
- Create: `server/src/calendar/oauth.ts`, `server/src/calendar/googleClient.ts`, `shared/src/schemas/google.ts` (only `GoogleStatus` for now)
- Modify: `server/package.json` (dependencies), `server/src/ctx.ts` (add `google: GoogleIntegration`), `server/src/auth/middleware.ts` (exempt `GET /api/google/callback` from the session check; it's protected by `state`)
- Test: `server/test/calendar/oauth.test.ts`, `server/test/calendar/googleClient.test.ts`

**Interfaces:**
- Produces:
  - Credentials and tokens:
    - `loadClientCredentials(dataDir): { clientId: string; clientSecret: string } | null`
    - `readTokens(dataDir): StoredTokens | null`
    - `writeTokens(dataDir, t: StoredTokens): void`: writes with `{ mode: 0o600 }` then `chmodSync(0o600)`
    - `deleteTokens(dataDir): void`
  - `interface GoogleIntegration`:
    ```ts
    {
      isConfigured(): boolean;              // client credentials file present
      isConnected(): boolean;               // tokens present
      needsReconnect(): boolean;
      markNeedsReconnect(): void;
      client(): CalendarClient | null;      // null unless connected && !needsReconnect
      beginAuth(host: string): Promise<string>;   // returns consent URL; throws VALIDATION for non-loopback host
      completeAuth(code: string, state: string): Promise<void>; // exchanges, stores tokens, clears needsReconnect
      disconnect(): Promise<void>;          // best-effort revoke, delete tokens
    }
    ```
  - `createGoogleIntegration(config: AppConfig): GoogleIntegration`
    - Uses `OAuth2Client` from `google-auth-library` and `generateCodeVerifierAsync()` for PKCE.
    - The oauth client's `on('tokens')` handler merges and persists refreshed tokens.
    - Pending states are kept in a Map and expire after 10 minutes.
  - `createGoogleCalendarClient(auth: OAuth2Client): CalendarClient`: maps to `calendar({ version: 'v3', auth })`. `listCalendars` reads `calendarList.list`.
  - `toCalendarApiError(err: unknown): CalendarApiError`:
    - The gaxios `response.status` becomes `status`.
    - `invalid_grant` in the error data → `status 401`, `reason 'invalid_grant'`.
    - A network error (no response) → `status 0`.
  - `createCtx` defaults `google` to `createGoogleIntegration(config)`. Tests replace it with `createFakeGoogle`.

- [ ] **Step 1: Write the failing tests**

```ts
test('loadClientCredentials reads installed JSON; missing file → null', () => {});
test('writeTokens creates file with mode 0600', () => { expect(statSync(p).mode & 0o777).toBe(0o600); });
test('beginAuth on non-loopback host throws VALIDATION', async () => {});
test('beginAuth URL contains exact scopes, offline access, prompt consent, code_challenge, state', async () => {
  // parse URL: scope === the three scopes joined by space; redirect_uri http://127.0.0.1:4280/api/google/callback
});
test('completeAuth with unknown/expired state → VALIDATION', async () => {});
test('toCalendarApiError maps invalid_grant → 401 reason invalid_grant; network → 0; 410 → 410', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/oauth calendar/googleClient`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): OAuth with PKCE, 0600 token store and real Calendar client"`

---

### Task 3: Calendar state, setup and recreate

**Files:**
- Create: `server/src/calendar/state.ts`, `server/src/calendar/setup.ts`
- Modify: `server/src/db/schema.ts`:
  - add `calendar_state`, a single row with `id = 1`: `life_tracker_calendar_id`, `busy_calendar_ids` (JSON), `include_all_day`, `lt_sync_token`, `last_sync_at`, `last_error`, `calendar_missing`
  - add `gcal_hash text` to `blocks`
- Test: `server/test/calendar/setup.test.ts`

**Interfaces:**
- Produces:
  - `getCalendarState(ctx): CalendarState`: creates the default row on first call
  - `updateCalendarState(ctx, patch: Partial<CalendarState>): CalendarState`
  - `CalendarState { lifeTrackerCalendarId: string|null; busyCalendarIds: string[]; includeAllDay: boolean; ltSyncToken: string|null; lastSyncAt: string|null; lastError: string|null; calendarMissing: boolean }`
  - `ensureCalendarSetup(ctx, client): Promise<void>`
    1. If there's no `lifeTrackerCalendarId`: `createCalendar('Life Tracker', tz)` and store the ID.
    2. If `busyCalendarIds` is empty: set it to the primary calendar's ID from `listCalendars`.
    3. Call `enqueueFutureMirrored(ctx)` (Task 4).
  - `recreateCalendar(ctx, client): Promise<void>`
    1. Create a new calendar.
    2. Store the ID, set `calendarMissing = false`, `ltSyncToken = null`.
    3. Clear `gcalEventId`/`gcalEtag`/`gcalHash`/`gcalSyncedAt` on all blocks with `end > now`.
    4. Call `enqueueFutureMirrored`.
  - `setGcalFields(ctx, blockId, f: { gcalEventId?: string|null; gcalEtag?: string|null; gcalHash?: string|null; gcalSyncedAt?: string|null }): void`, in the blocks service. It **does not emit** on the bus and does not touch `updatedAt`.

- [ ] **Step 1: Write the failing tests**

```ts
test('first setup creates "Life Tracker" calendar in tz and selects primary as busy', async () => {});
test('setup is idempotent (no second calendar)', async () => {});
test('recreate makes a new calendar, clears future gcal ids and re-enqueues future mirrored blocks', async () => {});
test('setGcalFields does not emit and does not change updatedAt', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/setup`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): calendar state, first-connect setup and recreate"`

---

### Task 4: Event body, mirroring rule and enqueueing

**Files:**
- Create: `server/src/calendar/eventBody.ts`, `server/src/calendar/enqueue.ts`
- Modify: `server/src/db/schema.ts` (add `sync_queue`: `id`, `block_id UNIQUE`, `op`, `attempts`, `next_attempt_at`, `last_error`, `created_at`, `updated_at`), `server/src/ctx.ts` (`createCtx` registers the subscriber)
- Test: `server/test/calendar/enqueue.test.ts`, `server/test/calendar/eventBody.test.ts`

**Interfaces:**
- Produces:
  - `shouldMirror(b: Block): boolean`: per the Global Constraints
  - `toGoogleEvent(b: Block, opts: { tz: string; appOrigin: string }): EventBody`
  - `eventHash(body: EventBody): string`: sha256 of a canonical JSON
  - `type SyncOp = 'create' | 'update' | 'delete'`
  - `deriveOp(b: Block): SyncOp | null`, the single source of truth for both the enqueuer and the worker:
    - `removed` with `gcalEventId` → `delete`
    - `removed` without one → `null`
    - not mirrored → `null`
    - no `gcalEventId` → `create`
    - otherwise → `update`
  - `enqueueBlock(ctx, blockId): void`
    - If `deriveOp` is `null`: delete any queue row for the block.
    - Otherwise: upsert the row (one per block) with `op`, `next_attempt_at = now`, and `attempts = 0` when the op changed.
  - `registerSyncEnqueue(ctx): () => void`: subscribes to `ctx.events` and calls `enqueueBlock` on every change
  - `enqueueFutureMirrored(ctx): number`: every mirrored block with `end > now` and no `gcalEventId`

- [ ] **Step 1: Write the failing tests**

```ts
test('toGoogleEvent maps title, times with tz, color, description link and private block id', () => {
  // study block → colorId '9', description 'Life Tracker · http://127.0.0.1:4280/week?block=<id>'
});
test('eventHash identical for status-only change (committed → done)', () => {});
test('committing a draft enqueues one create per block; proposed blocks enqueue nothing', async () => {});
test('unplanned review blocks are never enqueued', async () => {});
test('two edits before sync → still one queue row', async () => {});
test('removing a block that never synced deletes its pending create row', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/enqueue calendar/eventBody`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): mirroring rule, event body and sync queue enqueueing"`

---

### Task 5: Sync worker with backoff

**Files:**
- Create: `server/src/calendar/worker.ts`
- Test: `server/test/calendar/worker.test.ts`

**Interfaces:**
- Consumes: `deriveOp`, `toGoogleEvent`, `eventHash`, `setGcalFields`, `getCalendarState`, `updateCalendarState`.
- Produces: `processQueue(ctx, client: CalendarClient, opts?: { limit?: number /* 50 */ }): Promise<{ done: number; failed: number; paused: 'reconnect' | 'calendar_missing' | null }>`
  - Picks rows with `next_attempt_at ≤ now`, oldest `created_at` first. For each:
    1. Re-derive the op from the current block.
       - `null` → delete the row.
       - `update` and `eventHash(body) === block.gcalHash` → delete the row with no API call.
    2. Perform the op:
       - `create` → `insertEvent`, then `setGcalFields({ id, etag, hash, syncedAt })`
       - `update` → `patchEvent`, then `setGcalFields`
       - `delete` → `deleteEvent`, then `setGcalFields({ gcalEventId: null, ... })`
    3. On success, delete the row.
  - Errors:
    - `401` → `ctx.google.markNeedsReconnect()`. Stop, return `paused: 'reconnect'`, don't touch `attempts`.
    - `404` on `delete`, or `410` → treated as success.
    - `404` on `insert`/`patch` → call `calendarExists`.
      - The calendar is gone → `updateCalendarState({ calendarMissing: true })`. Stop, return `paused: 'calendar_missing'`.
      - Only the event is gone (on patch) → clear the block's gcal fields and keep the row; it becomes a `create` next time.
    - Anything else (`0`, `403` rate limit, `5xx`) → `attempts += 1`, `next_attempt_at = now + backoff(attempts)`, `last_error = message`. Continue with the next row.
  - `backoffSeconds(attempts: number): number` = `min(30 * 2 ** (attempts - 1), 3600)`

- [ ] **Step 1: Write the failing tests**

```ts
test('creates events and stores gcal id/etag/hash; queue empty after', async () => {});
test('status-only review changes make zero API calls', async () => {
  // sync 20 committed blocks; reset fake.calls; mark all done via submitReview; processQueue → fake.calls.length === 0
});
test('500 then success: attempts 1, next attempt +30s; after clock +30s succeeds', async () => {});
test('backoffSeconds 1→30, 2→60, 8→3600, 20→3600', () => {});
test('invalid_grant pauses without incrementing attempts and sets needsReconnect; after reconnect flushes in order', async () => {});
test('delete of already-deleted event (404) counts as success', async () => {});
test('patch 404 with calendar missing → paused calendar_missing', async () => {});
test('patch 404 with calendar present → recreated as insert on next run', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/worker`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run calendar`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): queue worker with backoff, reconnect pause and hash skip"`

---

### Task 6: Pulling changes from the Life Tracker calendar

**Files:**
- Create: `server/src/calendar/pullLifeTracker.ts`
- Modify: `server/src/db/schema.ts` (add `google_changes`: `id`, `block_id`, `kind 'moved'|'deleted'`, `before_start`, `before_end`, `after_start`, `after_end`, `created_at`, `seen`), `server/src/domains/blocks/service.ts` (add `applyExternalTimes`)
- Test: `server/test/calendar/pullLifeTracker.test.ts`

**Interfaces:**
- Produces:
  - `applyExternalTimes(ctx, blockId, f: { start: string; end: string; gcalEtag: string; gcalHash: string }): void`. Updates the times and gcal fields and sets `updatedAt = now`. It **does not emit**, so no echo write is queued.
  - `pullLifeTrackerChanges(ctx, client): Promise<{ moved: number; deleted: number; fullResync: boolean }>`
    - With no `ltSyncToken`: a full list of all pages. Otherwise an incremental list with the token.
    - A `410` clears the token and repeats as a full list (`fullResync: true`).
    - A `404` sets `calendarMissing`.
    - At the end it stores `nextSyncToken`.
    - For each item, the block is found by `gcal_event_id` (falling back to `extendedProperties.private.lifeTrackerBlockId`). No block → the item is ignored.

    | Event state | Block state | Action |
    |---|---|---|
    | `cancelled` | `committed` | `setGcalFields` (clear the ID) first, then `setBlockStatus(removed)`; record `deleted` |
    | `cancelled` | done/partial/skipped | clear the gcal fields only |
    | timed, same start and end as the block | any | refresh `gcalEtag` only (this is the echo of our own write) |
    | timed, different times, `event.updated > block.updatedAt` | not removed | `applyExternalTimes` (works for fixed blocks too); record `moved` with before/after |
    | timed, different times, `event.updated ≤ block.updatedAt` | any | the app wins: `enqueueBlock` (a re-push) |
    | all-day (`start.date`) | any | ignored |

- [ ] **Step 1: Write the failing tests**

```ts
test('own writes echo back without google_changes or queue rows', async () => {
  // commit 3 blocks → processQueue → pull: moved 0, google_changes 0, sync_queue 0
});
test('user moves event in Google → block times updated, moved change recorded, no queue row', async () => {});
test('user deletes event → committed block removed, deleted change recorded, no delete op queued', async () => {});
test('deleted event for a reviewed block keeps block status', async () => {});
test('both edited: app newer → re-enqueued update; Google newer → block takes Google times', async () => {});
test('410 triggers full resync and stores new token', async () => {});
test('fixed class moved in Google updates the fixed block', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/pullLifeTracker`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run calendar`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): incremental pull of Life Tracker calendar edits"`

---

### Task 7: Busy calendars cache + busy provider

**Files:**
- Create: `server/src/calendar/pullBusy.ts`, `server/src/calendar/busyProvider.ts`
- Modify: `server/src/db/schema.ts` (add `busy_events`: PK `(calendar_id, event_id)`, `title`, `start`, `end`, `updated`, `fetched_at`), `server/src/ctx.ts` (`busy` becomes `createCachedBusyProvider(ctx)`)
- Test: `server/test/calendar/pullBusy.test.ts`

**Interfaces:**
- Produces:
  - `isBusyEvent(e: GEvent, includeAllDay: boolean): boolean`: per the Global Constraints filters
  - `pullBusyCalendars(ctx, client): Promise<{ changed: BusyEventRow[]; removed: BusyEventRow[] }>`
    - Fetches each `busyCalendarId` except the Life Tracker calendar, over the window `[now − 1d, now + 56d]` with `singleEvents=true`, all pages.
    - Diffs against `busy_events` for that calendar: upsert the new or changed ones (by `updated`), delete the missing ones.
    - All-day events, when included, map to local `00:00`–`24:00` of each covered date.
    - Event titles fall back to `"Busy"`.
  - `BusyEventRow { calendarId; eventId; title; start; end; updated }`
  - `createCachedBusyProvider(ctx): BusyProvider`: rows overlapping `[from, to)`, mapped to `BusyInterval` with `calendarId` and `externalEventId`

- [ ] **Step 1: Write the failing tests**

```ts
test('recurring event occurrences (singleEvents) each become busy rows', async () => {});
test('declined, transparent and all-day (default) events are excluded', async () => {});
test('includeAllDay=true maps all-day event to local midnight..midnight', async () => {});
test('event removed in Google disappears from cache and is reported in removed', async () => {});
test('Life Tracker calendar never pulled as busy even if selected', async () => {});
test('busy provider feeds planner: plan next week avoids a cached busy event', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/pullBusy`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): busy calendar cache and planner busy provider"`

---

### Task 8: Conflict detection

**Files:**
- Create: `server/src/calendar/conflicts.ts`, extend `shared/src/schemas/google.ts` (`Conflict`)
- Modify: `server/src/db/schema.ts` (add `conflicts`: `id`, `calendar_id`, `external_event_id`, `title`, `start`, `end`, `block_ids` (JSON), `status`, `created_at`, `updated_at`)
- Test: `server/test/calendar/conflicts.test.ts`

**Interfaces:**
- Produces:
  - `Conflict { id; calendarId; externalEventId; title; start; end; status: 'open'|'replanned'|'dismissed'; blocks: Block[] }`
  - `detectConflicts(ctx, changes: { changed: BusyEventRow[]; removed: BusyEventRow[] }): { opened: number; resolved: number }`. For each changed event:
    - Find the overlapping blocks (no buffer) with `start > now`, `status = 'committed'`, `locked = false` and `source ≠ 'unplanned'`.
    - Some overlap → upsert an `open` conflict keyed by `(calendarId, externalEventId)`, refreshing the title, times and `block_ids`.
    - No overlap, but an open conflict exists → set it to `dismissed` (it resolved itself).

    For each removed event, its open conflict becomes `dismissed`.
  - `listConflicts(ctx, status: 'open'): Conflict[]`
  - `dismissConflict(ctx, id): Conflict`
  - `markConflictReplanned(ctx, id): Conflict`: used by Stage 4

- [ ] **Step 1: Write the failing tests**

```ts
test('new external event overlapping a committed study block opens a conflict listing that block', () => {});
test('overlap with locked fixed block or reviewed block does not conflict', () => {});
test('same event changed again updates the existing open conflict (no duplicate)', () => {});
test('event moved away from the block auto-dismisses the conflict', () => {});
test('dismissed conflict stays dismissed unless the event changes again to overlap', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/conflicts`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run calendar`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): conflict detection for new outside events"`

---

### Task 9: `runSync` orchestration, routes and the sync job

**Files:**
- Create: `server/src/calendar/runSync.ts`, `server/src/calendar/routes.ts`
- Modify: `shared/src/schemas/google.ts` (`GoogleStatus`, `CalendarListItem`, `BusyCalendarsInput`, `SyncStatus`, `GoogleChange`), `server/src/app.ts`, `server/src/index.ts` (register `scheduler.every('google-sync', 5 * 60_000, ...)`)
- Test: `server/test/calendar/runSync.test.ts`, `server/test/calendar/routes.test.ts`

**Interfaces:**
- Produces:
  - `runSync(ctx): Promise<SyncRunResult>`
    - If not connected or `needsReconnect`: returns `{ skipped: 'not_connected' | 'reconnect' }`.
    - If `calendarMissing`: returns `{ skipped: 'calendar_missing' }`.
    - Otherwise, in order:
      1. `processQueue`
      2. `pullLifeTrackerChanges`
      3. `pullBusyCalendars`
      4. `detectConflicts`
      5. `processQueue` again, for re-pushes queued during the pull
    - It sets `lastSyncAt = now`. `lastError` is `null` on success, or the message of the first non-auth error.
    - A guard prevents two runs at once: a second call returns the run already in flight.
  - `GoogleStatus { configured; connected; needsReconnect; calendarId: string|null; calendarMissing; busyCalendarIds: string[]; includeAllDay; lastSyncAt; lastError; pending: number; failing: number }`
  - `SyncStatus { pending: number; failing: Array<{ blockId; title; attempts; lastError; nextAttemptAt }>; lastSyncAt; lastError }`
  - `GoogleChange { id; blockId; kind: 'moved'|'deleted'; title; beforeStart; beforeEnd; afterStart: string|null; afterEnd: string|null; createdAt }`
  - Routes:

    | Route | Behavior |
    |---|---|
    | `GET /api/google/status` | returns `GoogleStatus` |
    | `GET /api/google/connect` | 302 to the consent URL; 400 if not configured or not a loopback host |
    | `GET /api/google/callback?code&state` | `completeAuth`, `ensureCalendarSetup`, `runSync`, then 302 to `/settings?google=connected`. On error, 302 to `/settings?google=error&message=…` |
    | `POST /api/google/disconnect` | disconnects |
    | `GET /api/google/calendars` | returns `CalendarListItem[]` (`{ id, summary, primary, selected }`), excluding the Life Tracker calendar |
    | `PUT /api/google/busy-calendars` | body `{ calendarIds: string[]; includeAllDay: boolean }`; IDs must exist in the list |
    | `POST /api/google/recreate-calendar` | recreates the calendar |
    | `GET /api/sync/status` | returns `SyncStatus` |
    | `POST /api/sync/now` | runs `runSync`, returns `SyncStatus` |
    | `GET /api/conflicts?status=open` | lists open conflicts |
    | `POST /api/conflicts/:id/dismiss` | dismisses |
    | `GET /api/google/changes?unseen=true` | lists changes |
    | `POST /api/google/changes/seen` | body `{ ids }` |

- [ ] **Step 1: Write the failing tests**

```ts
test('runSync with Google down (status 0 on everything) leaves app usable and records lastError', async () => {
  // create blocks, review them, plan a week — all succeed; status.pending > 0; lastError set
});
test('runSync end-to-end with fake: commit week → events exist in Life Tracker calendar with colors', async () => {});
test('concurrent runSync calls share one run', async () => {});
test('status reports pending and failing counts', async () => {});
test('connect from non-loopback Host → 400 message mentions 127.0.0.1', async () => {});
test('callback route works without session cookie but rejects bad state', async () => {});
test('busy-calendars rejects unknown ids', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run calendar/runSync calendar/routes`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(calendar): sync orchestration, API routes and 5-minute job"`

---

### Task 10: Web — Google settings, sync badge, banners, changes feed

**Files:**
- Create: `web/src/api/hooks/google.ts`, `web/src/components/SyncBadge.tsx`, `web/src/components/Banners.tsx`, `web/src/features/today/ChangesFeed.tsx`, `web/src/features/settings/GoogleSection.tsx`
- Modify: `web/src/components/Layout.tsx` (badge in the header, banners above the content), `web/src/features/today/TodayPage.tsx`, `web/src/features/week/WeekPage.tsx`, `web/src/features/settings/SettingsPage.tsx`
- Test: `web/test/google.test.tsx`

**Interfaces:**
- Produces:
  - Hooks:
    - `useGoogleStatus()`: refetches every 60 s
    - `useSyncStatus()`, `useSyncNow()`
    - `useGoogleCalendars()`, `useSaveBusyCalendars()`
    - `useDisconnectGoogle()`, `useRecreateCalendar()`
    - `useConflicts()`, `useDismissConflict()`
    - `useGoogleChanges()`, `useMarkChangesSeen()`
  - `SyncBadge`:
    - Hidden when `pending = 0` and there's no error.
    - "N changes waiting to sync" when `pending > 0`.
    - Red "Sync error" when `failing > 0`, linking to Settings → Google.
  - `Banners`, each shown only while its condition holds:
    - **Reconnect** (`needsReconnect`): "Google Calendar needs to be reconnected" + **Reconnect**, which goes to `/api/google/connect`.
    - **Calendar missing**: "The Life Tracker calendar was deleted in Google" + **Recreate calendar & re-push**.
    - **Conflict** (one per open conflict): "<title> (Tue 19:00–22:00) overlaps Study — Econometrics" + **Dismiss**. A disabled **Replan around this** button carries the tooltip "Available after the replan update"; Stage 4 enables it.
  - `ChangesFeed` on Today: unseen changes, e.g. "Moved in Google: Gym → Thu 18:00" or "Deleted in Google: Startup — Landing page", with "Mark as seen".
  - `GoogleSection` in Settings:
    - Not configured: a link to `docs/setup-google.md` with the steps summarized inline.
    - Configured but not connected: **Connect Google Calendar**, with the hint "Do this on your Mac".
    - Connected: the calendar name, busy calendar checkboxes, the "Treat all-day events as busy" toggle, last sync time, **Sync now**, a list of failing items, and **Disconnect** (with confirmation).
    - Reads `?google=connected|error` to show a toast.
  - **Deep link from Google events:** `WeekPage` reads `?block=<id>`, fetches `GET /api/blocks/:id` (**server addition in this task:** a route over the Stage 1 `getBlock`), switches to the week containing that block, and opens its `BlockDetails`. An unknown ID shows the toast "That block no longer exists".

- [ ] **Step 1: Write the failing tests**

```tsx
test('sync badge shows pending count and hides at 0', async () => {});
test('reconnect banner links to connect endpoint', async () => {});
test('conflict banner dismiss posts and hides', async () => {});
test('changes feed shows moved item and marks seen', async () => {});
test('settings: busy calendar checkboxes save selected ids and includeAllDay', async () => {});
test('settings: not configured shows setup instructions; connected shows Sync now', async () => {});
test('/week?block=<id> opens that block\'s week and details; unknown id shows toast', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run google --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): Google settings, sync badge, banners and changes feed"`

---

### Task 11: Setup guide + manual end-to-end checklist

**Files:**
- Create: `docs/setup-google.md`, `docs/manual-e2e.md`
- Modify: `README.md` (link both)

- [ ] **Step 1: Write `docs/setup-google.md`**

Numbered steps:
1. Create a Google Cloud project.
2. Enable the Google Calendar API.
3. Set up the OAuth consent screen: External, add yourself as a test user, add the three scopes from the Global Constraints, then **publish the app ("In production")**. Note: in Testing mode, refresh tokens expire after 7 days. The "unverified app" warning is expected; click Advanced → continue.
4. Create credentials: OAuth client ID, type **Desktop app**.
5. Download the JSON to `~/LifeTracker/secrets/google-client.json`.
6. Restart the server.
7. On the Mac, open `http://127.0.0.1:4280/settings` → **Connect Google Calendar**.
8. Choose your busy calendars.

Add a troubleshooting section covering `invalid_grant`, a deleted calendar, and "connect from phone not allowed".

- [ ] **Step 2: Write `docs/manual-e2e.md` (the Google part)**

Checklist items, each with the expected result, run against a throwaway Google account or a test calendar:
1. Connect.
2. The Life Tracker calendar appears.
3. Commit a week; the events appear with colors.
4. Mark blocks done; nothing changes in Google.
5. Move an event in Google, then Sync now; the block moves and the change appears in the feed.
6. Delete an event in Google; the block is removed.
7. Add an overlapping event to the primary calendar; a conflict banner appears.
8. Turn off Wi-Fi and edit blocks; the badge shows pending. Turn Wi-Fi back on; it flushes.
9. Revoke access at myaccount.google.com; the reconnect banner appears; reconnect; it flushes.
10. Delete the Life Tracker calendar; the recreate banner appears; recreate.

- [ ] **Step 3: Run the manual checklist once against a real test calendar and fix anything found (each fix gets a test in the relevant task's file)**

- [ ] **Step 4: Commit** — `git commit -m "docs: Google setup guide and manual e2e checklist"`

---

## Self-Review Notes

- **Spec coverage:**
  - §6.1 connection, scopes, token storage, first connect (Tasks 2, 3, 9)
  - §6.2 writing, mirroring, queue, backoff, badge (Tasks 4, 5, 10)
  - §6.3 reading: Life Tracker edits (Task 6), busy calendars (Task 7), conflicts (Task 8)
  - §6.4 failure table:
    - network/5xx → Task 5 backoff
    - token revoked → Tasks 5, 10
    - calendar deleted → Tasks 3, 5, 6, 10
    - block-ID property removed: the pull skips items it can't match (Task 6)
  - §4.3 → Tasks 8–10
  - §7 banners, feed and Google settings → Task 10
- **Stage 4 hooks:** `markConflictReplanned`, `Conflict` type, the "Replan around this" button placeholder.
