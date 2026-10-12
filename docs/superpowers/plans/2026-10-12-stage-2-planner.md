# Stage 2 — Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the planning half of the loop. The user can:
- enter a fixed weekly schedule (classes and work shifts) and planner preferences
- click **Plan next week** (or **Plan this week**)
- review and edit the proposed week on a drag-and-drop week grid with live goal projection and shortfalls
- assign meals
- **Commit**

Everything stays inside the app; Google comes in Stage 3.

**Architecture:**
- The planner is a **pure module**, `server/src/planner/`, exposing `planWeek(input) → { blocks, shortfalls, reservedEvenings }`. It does no DB or network access and is deterministic.
- A `plans` domain gathers the planner's inputs from the database and the `BusyProvider`, stores drafts as `proposed` blocks, and commits or discards them in transactions.
- Fixed-schedule entries are turned into locked, committed blocks for a rolling 8 weeks ahead. An in-process job scheduler keeps that window filled.

**Tech Stack:** Same as Stage 1, plus `@dnd-kit/core@^6.3.1` in the web package.

**Spec:** `docs/superpowers/specs/2026-10-12-life-tracker-design.md`. Sections covered: §3.2 `fixed_events`, `plans`, `preferences`, `meal_plan_entries`; §4.1, §4.2; §5.1–5.3, §5.5; §7 Week view and Settings (fixed schedule, preferences); §11 stage 2.

**Builds on:** `docs/superpowers/plans/2026-10-12-stage-1-foundation-tracking.md`. Every Stage 1 interface is available as defined there: `Ctx`, `createBlock`, `updateBlock`, `setBlockStatus`, `deleteProposedBlocks`, `listBlocks`, `BlockEventBus`, `getWeekProgress`, `getGoals`, `listCourses`, `listOpenTasks`, `logMeal`, `submitReview`, `createTestClient`, `mockApi`, `renderWithProviders`, `BlockForm` and the time helpers.

## Global Constraints

All Global Constraints from the Stage 1 plan apply. In addition:

- **Granularity.** The planner works in 15-minute steps. Every planner-created block starts and ends on a multiple of 15 minutes in epoch ms.
- **Planner output is deterministic.** The same input gives the same output. Ties break on the earliest start, then category order `meal, meal_prep, workout, study, startup`, then `courseId`/`workoutType` alphabetically.
- **The planner never violates:**
  - sleep or day bounds
  - `bufferMinutes` between any two occupied intervals
  - per-day caps (`maxPlannedMinutesPerDay`, `maxStudyMinutesPerDay`, `maxMinutesPerCoursePerDay`)
  - reserved evenings for study and startup
  - `minHoursBetweenGym`

  Anything that doesn't fit becomes a shortfall.
- **Preferences** live in the `settings` key `preferences`, are validated by `PreferencesSchema`, and every field has a default. The defaults from spec §5.2, in camelCase:

  | Field | Default |
  |---|---|
  | `sleep` | `{ start: '23:30', end: '07:30' }` |
  | `earliestBlock` | `'08:00'` |
  | `latestBlockEnd` | `'22:30'` |
  | `bufferMinutes` | `15` |
  | `maxPlannedMinutesPerDay` | `480` |
  | `studyBlock` | `{ min: 45, max: 120 }` |
  | `maxStudyMinutesPerDay` | `300` |
  | `maxMinutesPerCoursePerDay` | `180` |
  | `startupBlock` | `{ min: 60, max: 180 }` |
  | `preferredStartupWindows` | `[{ days: [1,2,3,4,5], start: '19:00', end: '22:30' }, { days: [6,7], start: '09:00', end: '13:00' }]` |
  | `workoutDurations` | `{ gym: 75, cardio: 45, sport: 90 }` |
  | `preferredWorkoutWindows` | `[{ days: [1,3,5], start: '17:00', end: '19:00' }]` |
  | `allowedWorkoutDays` | `[1,2,3,4,5,6,7]` |
  | `minHoursBetweenGym` | `40` |
  | `meals` | `{ breakfast: { time: '08:00', minutes: 20 }, lunch: { time: '12:30', minutes: 30 }, dinner: { time: '19:00', minutes: 45 } }` |
  | `mealFlexMinutes` | `60` |
  | `mealPrep` | `{ day: 7, preferredStart: '16:00', minutes: 90 }` |
  | `eveningStart` | `'19:00'` |
  | `reviewPromptTime` | `'20:00'` |
  | `protectedEvenings` | `[]` |
  | `classesCountTowardStudy` | `false` |

- **Rolling window.** Fixed events are materialized for **today through today + 56 days**. Re-running materialization is idempotent. Occurrences are keyed by `(fixedEventId, local date of start)`. An occurrence the user cancelled (status `removed`) is **never** recreated.
- **Proposed blocks** (`status = 'proposed'`) are never synced to Google (Stage 3) and don't count as "planned" in progress unless the caller passes `includeProposed=true`.

## Review Focus

1. **Planning the current week in the middle of a day.** Nothing may be placed before `now`. The range starts at `now` rounded up to the next 15 minutes, goals are reduced by what's already done or committed, and past days don't get meals. *Task 10 test.*
2. **Holidays and term boundaries.** Occurrences outside `validFrom..validTo` are never created. A cancelled occurrence (e.g. a holiday) stays cancelled after the fixed event is edited and rematerialized. Editing the time of a fixed event moves its future, unreviewed occurrences instead of duplicating them. *Task 2 tests.*
3. **A week with a DST change** (Oct 26 – Nov 1, 2026 in `America/Los_Angeles`). Lunch is still at 12:30 local on Sunday Nov 1, every invariant holds, and no block lands an hour off. *Task 9 test.*
4. **Clicking "Plan" again on a draft that was already edited.** The old draft's proposed blocks are deleted, not duplicated, and only one draft per week exists. *Task 10 test.*
5. **Preferences that make planning impossible** (`earliestBlock ≥ latestBlockEnd`, `studyBlock.min > max`, a usable day under 60 minutes) are rejected with 400 and field errors. A valid week with zero free time returns an empty plan with full shortfalls, not an error. *Task 1 and Task 9 tests.*

---

## File Structure

```
shared/src/schemas/preferences.ts     PreferencesSchema, DEFAULT_PREFERENCES, TimeWindow
shared/src/schemas/schedule.ts        FixedEvent, FixedEventInput
shared/src/schemas/plans.ts           Plan, PlanDraft, ApiShortfall, BusyInterval
shared/src/schemas/mealPlan.ts        MealPlanEntry, MealPlanEntryInput
server/src/domains/preferences/{service.ts,routes.ts}
server/src/domains/schedule/{service.ts,materialize.ts,routes.ts}
server/src/jobs/scheduler.ts
server/src/planner/
  types.ts        PlannerInput, PlannerOutput, ProposedBlock, PlannerGoal, Shortfall, Interval
  intervals.ts    merge/subtract/pad/overlaps
  days.ts         buildDayWindows (local days → UTC windows)
  timeline.ts     Timeline: occupied set, candidates, loads
  score.ts        scoreCandidate
  meals.ts        placeMeals, placeMealPrep
  evenings.ts     reserveEvenings
  workouts.ts     placeWorkouts
  chunked.ts      placeChunked (study + startup)
  planWeek.ts     composition
  index.ts
server/src/domains/plans/{inputs.ts,service.ts,routes.ts,busy.ts}
server/src/domains/mealPlan/{service.ts,routes.ts}
server/test/planner/{fixtures.ts,invariants.ts,*.test.ts}
web/src/api/hooks/{preferences,schedule,plans,mealPlan}.ts
web/src/features/week/{WeekPage,WeekGrid,DayView,BlockCard,BlockDetails,DraftPanel,MealAssignModal,geometry}.tsx|ts
web/src/features/settings/{FixedScheduleSection,PreferencesSection}.tsx
web/src/features/areas/food/MealPlanTab.tsx
```

---

### Task 1: Planner preferences

**Files:**
- Create: `shared/src/schemas/preferences.ts`, `server/src/domains/preferences/service.ts`, `routes.ts`
- Modify: `server/src/app.ts`, `server/src/domains/goals/routes.ts` (progress reads prefs), `web/src/features/today/TodayPage.tsx` (review prompt time)
- Create: `web/src/api/hooks/preferences.ts`
- Test: `shared/test/preferences.test.ts`, `server/test/preferences.test.ts`, `web/test/today.test.tsx` (extend)

**Interfaces:**
- Produces:
  - `TimeWindow = { days: Weekday[]; start: HHmm; end: HHmm }`
  - `PreferencesSchema`: every field has `.default(...)` set to the Global Constraints values, so `PreferencesSchema.parse({})` returns the defaults
  - `type Preferences`
  - `DEFAULT_PREFERENCES`
  - Cross-field refinements, each giving a field error at its path:
    - `earliestBlock < latestBlockEnd`
    - `studyBlock.min ≤ studyBlock.max`, and the same for `startupBlock`; all four are multiples of 15
    - `TimeWindow.start < end`
    - the usable day `dayBoundsUtc` (below) is ≥ 60 minutes for any date, otherwise the error is at `latestBlockEnd`: "Preferences leave less than an hour per day"
  - **Day-bound helpers.** Bedtimes after midnight are allowed (`sleep.start: '00:30'`). Every consumer uses these helpers and never compares `HH:mm` strings itself:
    - `sleepStartUtc(date: string, prefs, tz): Date`: when `sleep.start ≤ earliestBlock` (lexically), the bedtime belongs to the **next** local date, i.e. `zonedToUtc(addDays(date, 1), sleep.start)`; otherwise `zonedToUtc(date, sleep.start)`
    - `dayBoundsUtc(date, prefs, tz): { start: Date; end: Date }`: `start = max(zonedToUtc(date, sleep.end), zonedToUtc(date, earliestBlock))`, `end = min(zonedToUtc(date, latestBlockEnd), sleepStartUtc(date))`
    - `eveningWindowUtc(date, prefs, tz): { start: Date; end: Date }`: `[zonedToUtc(date, eveningStart), sleepStartUtc(date))`

    These live in `shared/src/schemas/preferences.ts`. Stage 1's `getWeekProgress` free-evening window and Stage 2's planner both use them.
  - `getPreferences(ctx): Preferences`
  - `savePreferences(ctx, input: unknown): Preferences`: validates and stores the full object
  - Routes: `GET /api/preferences`, `PUT /api/preferences`
  - `GET /api/progress/week` now passes the preferences to `getWeekProgress`. **Change:** replace the `eveningStart`/`sleepStart` opts with `prefs?: Preferences`. The free-evening window becomes `eveningWindowUtc(date, prefs, tz)`; without prefs it falls back to the Stage 1 defaults. `classesCountTowardStudy` comes from `prefs` too. It also accepts `includeProposed=true`, which adds proposed blocks to `planned`. **Change:** extend `getWeekProgress` opts with `includeProposed?: boolean`.
  - Web hooks: `usePreferences()`, `useSavePreferences()`. `TodayPage` uses `prefs.reviewPromptTime` instead of `REVIEW_PROMPT_TIME_DEFAULT`.

- [ ] **Step 1: Write the failing tests**

```ts
// shared/test/preferences.test.ts
test('empty object parses to defaults', () => {
  expect(PreferencesSchema.parse({})).toEqual(DEFAULT_PREFERENCES);
  expect(DEFAULT_PREFERENCES.studyBlock).toEqual({ min: 45, max: 120 });
});
test('earliestBlock >= latestBlockEnd rejected at earliestBlock', () => {});
test('studyBlock min > max rejected; min not multiple of 15 rejected', () => {});
test('usable day under 60 minutes rejected', () => {
  const r = PreferencesSchema.safeParse({ earliestBlock: '22:00', latestBlockEnd: '22:30' });
  expect(r.success).toBe(false);
});
test('bedtime after midnight: sleep.start 00:30 belongs to next date', () => {
  const p = PreferencesSchema.parse({ sleep: { start: '00:30', end: '08:00' }, latestBlockEnd: '23:30' });
  const TZ = 'America/Los_Angeles';
  expect(sleepStartUtc('2026-10-14', p, TZ).toISOString()).toBe('2026-10-15T07:30:00.000Z');
  expect(localTimeOf(dayBoundsUtc('2026-10-14', p, TZ).end, TZ)).toBe('23:30');
  expect(eveningWindowUtc('2026-10-14', p, TZ).end.toISOString()).toBe('2026-10-15T07:30:00.000Z');
});
```

```ts
// server/test/preferences.test.ts
test('GET returns defaults, PUT stores and returns merged full object', async () => {});
test('PUT invalid returns 400 with fields', async () => {});
test('progress uses classesCountTowardStudy preference', async () => {});
test('progress includeProposed counts proposed blocks in planned', async () => {});
test('with sleep.start 00:30, a startup block 23:45-00:15 makes that evening not free', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run preferences`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: planner preferences with validated defaults"`

---

### Task 2: Fixed weekly schedule + materialization

**Files:**
- Create: `shared/src/schemas/schedule.ts`, `server/src/domains/schedule/service.ts`, `materialize.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `fixed_events`), `server/src/domains/blocks/service.ts` (add `updateFixedBlockInternal`), `server/src/app.ts`
- Test: `server/test/schedule.test.ts`

**Interfaces:**
- Produces:
  - Shared:
    - `FixedEvent { id, title, kind: 'class'|'work', courseId: string|null, weekday: 1..7, startTime: HHmm, endTime: HHmm, validFrom: date, validTo: date, active: boolean }`
    - `FixedEventInput`: `endTime > startTime`, `validTo ≥ validFrom`, `class` requires `courseId`, `work` forbids it, and `title` is 1..120 characters
  - `updateFixedBlockInternal(ctx, id, patch: { start?; end?; title?; courseId? }): Block`. Only for `source = 'fixed'`. Bypasses the fixed-time guard and emits `updated`.
  - `materializeFixedEvents(ctx, opts?: { fixedEventId?: string }): { created: number; updated: number; removed: number }`. Horizon: `today .. addDays(today, 56)` in local dates. For each event (or just the one given):
    1. Compute the desired occurrences: dates in the horizon with `isoWeekday === weekday`, inside `validFrom..validTo`, only when `active`. Times are `zonedToUtc(date, startTime/endTime, tz)`.
    2. **Only when `opts.fixedEventId` is given**, meaning the event was just created or edited. For each existing block of this event with `start > now` and `status = 'committed'`:
       - If its local date has a desired occurrence and the start, end, title or course differ → `updateFixedBlockInternal`.
       - If its local date has no desired occurrence → `setBlockStatus(removed)`.

       The daily run (no `fixedEventId`) **never modifies existing occurrences**. It only creates missing ones, so a single class the user moved in Google (Stage 3) stays where they put it.
    3. For each desired date with **no block of any status** for this event on that local date → `createBlock` with:
       - `category`: `class` → `study`, `work` → `work`
       - `source: 'fixed'`, `status: 'committed'`, `locked: true`, `fixedEventId`
    4. Everything runs in one transaction.
  - Functions:
    - `listFixedEvents(ctx)`: ordered by weekday, then start time
    - `createFixedEvent(ctx, input)`, `updateFixedEvent(ctx, id, input)`: each persists, then calls `materializeFixedEvents({ fixedEventId })`
    - `deleteFixedEvent(ctx, id)`: future committed blocks → `removed`, then deletes the row. Past blocks keep their `fixedEventId` string; the column has no FK.
  - Routes:
    - `/api/schedule` (GET, POST)
    - `/api/schedule/:id` (PATCH, DELETE)
  - Cancelling one occurrence is just `DELETE /api/blocks/:id` (Stage 1), which sets `removed`.

- [ ] **Step 1: Write the failing tests**

```ts
// today 2026-10-14 (Wed) LA
test('creates weekly occurrences within horizon and term dates only', () => {
  // Mon 10:00-11:20 class, validFrom 2026-10-01, validTo 2026-11-30
  // → Mondays 2026-10-19 .. 2026-11-30 = 7 blocks; Mon 2026-10-12 is past → not created? (today is Wed; 10-12 < today → excluded)
  // all: category study, source fixed, locked true, status committed, courseId set
});
test('materialize is idempotent', () => { /* second run: created 0, updated 0, removed 0 */ });
test('daily run without fixedEventId leaves a manually moved occurrence untouched', () => {
  // updateFixedBlockInternal(occurrence, later start) then materializeFixedEvents(ctx) → start unchanged, updated 0
});
test('cancelled occurrence is not recreated after edit', () => {
  // DELETE block for 2026-10-26; update event time 10:30-11:50 → 2026-10-26 still only the removed block,
  // other future occurrences updated in place (same ids, new start)
});
test('shrinking validTo removes later committed occurrences', () => {});
test('work kind creates work blocks without course; class without courseId → 400', async () => {});
test('fixed block time cannot be PATCHed via /api/blocks (409)', async () => {});
test('deleting event removes future committed occurrences but keeps reviewed past ones', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run schedule`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): fixed weekly schedule with rolling materialization"`

---

### Task 3: In-process job scheduler

**Files:**
- Create: `server/src/jobs/scheduler.ts`
- Modify: `server/src/index.ts` (create the scheduler; register `materialize-fixed`)
- Test: `server/test/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `interface Scheduler { every(name: string, ms: number, fn: () => void | Promise<void>): void; dailyAt(name: string, time: HHmm, tz: () => string, fn): void; runNow(name: string): Promise<void>; stop(): void }`
  - `createScheduler(opts: { clock: Clock; log?: (msg: string, err?: unknown) => void }): Scheduler`
    - Uses `setTimeout`, so Vitest fake timers work.
    - A job that throws is logged and still rescheduled.
    - The same job never overlaps itself: if it's still running when due, that tick is skipped.
    - `dailyAt` computes the next local occurrence with `zonedToUtc`.
  - In `main()`: `scheduler.dailyAt('materialize-fixed', '00:05', () => getTimezone(ctx), () => materializeFixedEvents(ctx))`, plus one run at startup.

- [ ] **Step 1: Write the failing tests**

```ts
test('every runs repeatedly and survives a throwing job', async () => { /* fake timers, 3 ticks, 3 calls */ });
test('dailyAt fires at next local 00:05 and then daily', async () => {});
test('a running async job is not started twice', async () => {});
test('stop cancels timers', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scheduler`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scheduler`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): in-process job scheduler; daily fixed-schedule materialization"`

---

### Task 4: Planner foundations — types, intervals, day windows, timeline, scoring

**Files:**
- Create: `server/src/planner/types.ts`, `intervals.ts`, `days.ts`, `timeline.ts`, `score.ts`, `index.ts`
- Create: `server/test/planner/fixtures.ts`
- Test: `server/test/planner/intervals.test.ts`, `days.test.ts`, `timeline.test.ts`, `score.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  type Ms = number;                                   // epoch ms UTC
  interface Interval { start: Ms; end: Ms }
  interface PlannerBlockRef extends Interval {        // existing, already-occupied blocks
    category: Category; source: BlockSource; courseId?: string | null;
    workoutType?: WorkoutType | null; mealSlot?: MealSlot | null;
  }
  interface BusyRef extends Interval { title: string }
  type PlannerGoal =
    | { kind: 'study'; courseId: string; courseName: string; minutes: number }
    | { kind: 'startup'; minutes: number }
    | { kind: 'workout'; workoutType: WorkoutType; count: number }
    | { kind: 'free_evenings'; count: number };
  interface PlannerInput {
    range: Interval; timezone: string; prefs: Preferences;
    existing: PlannerBlockRef[]; busy: BusyRef[]; goals: PlannerGoal[];
    startupTasks: { id: string; title: string }[];
  }
  interface ProposedBlock extends Interval {
    category: Category; title: string; courseId?: string; startupTaskId?: string;
    workoutType?: WorkoutType; mealSlot?: MealSlot;
  }
  interface Shortfall { goal: PlannerGoal; missing: number }  // minutes or count, same unit as goal
  interface PlannerOutput { blocks: ProposedBlock[]; shortfalls: Shortfall[]; reservedEvenings: string[] }
  ```
- Produces (`intervals.ts`, all pure; inputs are not mutated):
  - `mergeIntervals(xs: Interval[]): Interval[]`: merges overlapping and touching intervals, sorted
  - `subtractIntervals(base: Interval[], cut: Interval[]): Interval[]`
  - `padIntervals(xs: Interval[], minutes: number): Interval[]`
  - `overlaps(a: Interval, b: Interval): boolean`: half-open; touching intervals don't overlap
  - `ceilTo15(ms: Ms): Ms`
- Produces (`days.ts`):
  - `interface DayWindow { date: string; start: Ms; end: Ms }`
  - `buildDayWindows(range: Interval, tz: string, prefs: Preferences): DayWindow[]`: for each local date touched by the range, the window is `dayBoundsUtc(date, prefs, tz)` (Task 1), clipped to the range. Empty windows are dropped. Evening windows anywhere in the planner use `eveningWindowUtc`.
  - `localWindow(date: string, w: { start: HHmm; end: HHmm }, tz: string): Interval`
- Produces (`timeline.ts`):
  - `createTimeline(input: PlannerInput): Timeline`, where
    ```ts
    interface Timeline {
      days: DayWindow[];
      freeIntervals(date: string): Interval[];   // window minus padded occupied intervals
      candidates(date: string, minutes: number, opts?: { within?: Interval; exclude?: Interval[] }): Interval[]; // 15-min aligned starts, fully free
      occupy(block: ProposedBlock): void;        // adds to occupied (padded by bufferMinutes) and updates loads
      load(date: string): { planned: number; study: number; perCourse: Record<string, number>; startup: number; workouts: number };
      gymStarts(): Ms[];
    }
    ```
    - Occupied = `existing` ∪ `busy` ∪ placed blocks, each padded by `bufferMinutes` on both sides.
    - Loads count `existing` (non-fixed, non-meal blocks toward `planned`) plus placed blocks. `planned` excludes `meal` and `source = 'fixed'`.
- Produces (`score.ts`):
  - `scoreCandidate(c: Interval, ctx: { preferred: Interval[]; dayLoadSameCategory: number; free: Interval[]; minGap: number; tz: string; extraPenalty?: number }): number`. The score is the sum of:
    - `+10` if `c` lies fully inside one of `preferred`
    - `−dayLoadSameCategory / 30`
    - `−5` if the local start time is ≥ 21:00
    - `−3` for each side whose gap to the edge of its containing free interval is `> 0` and `< minGap`
    - `−extraPenalty`
  - `pickBest(cands: Interval[], score: (c) => number): Interval | null`: highest score, ties to the earliest start

- [ ] **Step 1: Write the failing tests**

```ts
// fixtures.ts exports: TZ = 'America/Los_Angeles', NEXT_WEEK = weekRangeUtc('2026-10-19', TZ),
// at(date, time) = zonedToUtc(date, time, TZ).getTime(), baseInput(overrides) with DEFAULT_PREFERENCES.
test('merge/subtract/pad', () => {
  expect(mergeIntervals([{start:0,end:10},{start:10,end:20},{start:30,end:40}])).toEqual([{start:0,end:20},{start:30,end:40}]);
  expect(subtractIntervals([{start:0,end:100}], [{start:20,end:30}])).toEqual([{start:0,end:20},{start:30,end:100}]);
});
test('day windows are 08:00-22:30 local for each of 7 days', () => {
  const w = buildDayWindows(NEXT_WEEK, TZ, DEFAULT_PREFERENCES);
  expect(w).toHaveLength(7);
  expect(w[0]).toEqual({ date: '2026-10-19', start: at('2026-10-19','08:00'), end: at('2026-10-19','22:30') });
});
test('day windows across DST fall-back keep local times', () => {
  const w = buildDayWindows(weekRangeUtc('2026-10-26', TZ), TZ, DEFAULT_PREFERENCES);
  expect(localTimeOf(new Date(w[6].start), TZ)).toBe('08:00'); // Sun 2026-11-01
});
test('candidates respect padded occupied intervals', () => {
  // existing 12:00-13:00 Mon → 30-min candidates must end <= 11:45 or start >= 13:15
});
test('scoreCandidate components and pickBest tie → earliest', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run planner`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): intervals, day windows, timeline and scoring"`

---

### Task 5: Planner — meals and meal prep

**Files:**
- Create: `server/src/planner/meals.ts`
- Test: `server/test/planner/meals.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `localWindow`.
- Produces:
  - `placeMeals(t: Timeline, input: PlannerInput): ProposedBlock[]`
    - Days and slots are visited in order: `breakfast`, `lunch`, `dinner`. Snack is never planned.
    - Target = `zonedToUtc(date, meals[slot].time)`.
    - Candidate starts must lie in `[target − flex, target + flex]`.
    - The planner picks the candidate with the smallest `|start − target|`; ties go to the earlier one.
    - A meal is skipped silently when there's no candidate, or when `existing` already has a `meal` block with that `mealSlot` on that local date.
    - Each placed meal is occupied immediately.
    - Titles: `Breakfast`, `Lunch`, `Dinner`. `category: 'meal'` with `mealSlot` set.
  - `placeMealPrep(t, input): ProposedBlock[]` (0 or 1 block)
    - Skipped if `existing` has a `meal_prep` block in the range.
    - Tries the preferred weekday's date first, then other dates ordered by distance in days (earlier first on ties).
    - On each day it picks the candidate closest to `preferredStart`.
    - Title `Meal prep`.

- [ ] **Step 1: Write the failing tests**

```ts
test('empty next week → 21 meals at exact preferred times', () => {
  // Mon lunch 12:30-13:00 local; dinner 19:00-19:45; breakfast 08:00-08:20
});
test('busy 12:00-13:00 Tue moves lunch to 13:15-13:45 (nearest within flex)', () => {});
test('no slot within flex → meal skipped, no shortfall', () => {});
test('existing lunch block on Wed → no proposed Wed lunch', () => {});
test('meal prep Sunday 16:00-17:30; if Sunday fully busy → Saturday closest to 16:00', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner/meals`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run planner/meals`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): meal and meal-prep placement"`

---

### Task 6: Planner — free-evening reservation

**Files:**
- Create: `server/src/planner/evenings.ts`
- Test: `server/test/planner/evenings.test.ts`

**Interfaces:**
- Produces: `reserveEvenings(t: Timeline, input: PlannerInput): { reserved: string[]; reservedIntervals: Interval[]; shortfall: Shortfall | null }`
  - The goal is the `free_evenings` goal from `input.goals`. Without one, nothing is reserved.
  - Eligible dates:
    - the evening window `eveningWindowUtc(date)` starts at or after `range.start`
    - no `existing` block with category `study`/`startup`/`work` overlaps that window
  - Order:
    1. dates whose weekday is in `protectedEvenings`, which are always reserved even beyond the goal count
    2. then by fewest existing occupied minutes on that date
    3. then by the earliest date
  - It reserves up to `count`, counting protected dates toward it.
  - `missing = count − reserved` when positive.
  - `reservedIntervals` are the evening windows of the reserved dates. Tasks 7–8 pass them as `exclude` for study and startup.

- [ ] **Step 1: Write the failing tests**

```ts
test('reserves the N least-loaded evenings, earliest first on ties', () => {
  // goal 2, empty week → Mon, Tue
  // existing work 19:30-22:00 Mon → Mon ineligible → Tue, Wed
});
test('protected evenings always reserved (Fri) and count toward goal', () => {});
test('shortfall when fewer eligible evenings than goal', () => {});
test('current-week range starting Wed 12:00 → Mon/Tue ineligible', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner/evenings`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run planner/evenings`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): free-evening reservation"`

---

### Task 7: Planner — workouts

**Files:**
- Create: `server/src/planner/workouts.ts`
- Test: `server/test/planner/workouts.test.ts`

**Interfaces:**
- Produces: `placeWorkouts(t: Timeline, input: PlannerInput): { blocks: ProposedBlock[]; shortfalls: Shortfall[] }`
  - Types are processed in order `gym`, `cardio`, `sport`, each up to its goal count.
  - Duration comes from `workoutDurations[type]`.
  - Only dates whose weekday is in `allowedWorkoutDays` are considered.
  - Each placement scans every allowed day's candidates. They're not limited by `planned` caps beyond `maxPlannedMinutesPerDay`, and that cap is enforced.
  - Gym candidates are rejected if they start less than `minHoursBetweenGym` from any `t.gymStarts()`. That includes existing gym blocks in the range.
  - Score: `scoreCandidate` with `preferred` = the `preferredWorkoutWindows` windows for that date, and `extraPenalty = 10 × workouts already that day + 3 × workouts on adjacent days`.
  - Titles are `Gym`, `Cardio` and `Sport`, with `category: 'workout'` and `workoutType` set.
  - Unplaced counts become shortfalls.

- [ ] **Step 1: Write the failing tests**

```ts
test('gym 2 + cardio 1 on empty week → gym Mon & Wed, cardio Fri, all inside 17:00-19:00 window', () => {
  // assert local dates & that each block is fully within the preferred window; not exact minute
});
test('gym spacing: existing gym Mon 17:00 → next gym not before Wed 09:00 (40h)', () => {});
test('never two workouts on the same day while other allowed days have room', () => {});
test('allowedWorkoutDays [6,7] and goal 2 gym → 1 gym placed (Sat→Sun < 40h) and shortfall { missing: 1 }', () => {});
test('maxPlannedMinutesPerDay respected', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner/workouts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run planner/workouts`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): workout placement with spacing and spreading"`

---

### Task 8: Planner — chunked placement for study and startup

**Files:**
- Create: `server/src/planner/chunked.ts`
- Test: `server/test/planner/chunked.test.ts`

**Interfaces:**
- Produces:
  - `nextChunk(remaining: number, min: number, max: number): number`. All values are minutes and multiples of 15.
    - If `remaining ≤ max`: returns `max(remaining rounded up to 15, min)`.
    - Else if `remaining − max < min`: returns `remaining − min` rounded up to 15.
    - Else: returns `max`.
  - `placeStudy(t, input, exclude: Interval[]): { blocks; shortfalls }`
    - Loop:
      1. Pick the course with the largest remaining minutes; ties go to the alphabetical `courseId`.
      2. Take `chunk = nextChunk(...)` and look for a candidate on any day that satisfies all of:
         - `load.study + chunk ≤ maxStudyMinutesPerDay`
         - `load.perCourse[courseId] + chunk ≤ maxMinutesPerCoursePerDay`
         - `load.planned + chunk ≤ maxPlannedMinutesPerDay`
         - not overlapping `exclude`
      3. If there's no candidate, retry with chunks 15 minutes shorter, down to `studyBlock.min`.
      4. If there's still nothing, the course's remaining minutes become a shortfall and the course drops out.
    - The block's `actual` length counts against the remaining minutes. Blocks rounded up to `min` may slightly overshoot the goal; that's allowed.
    - Score: `scoreCandidate` with `preferred = []`, `dayLoadSameCategory = load.perCourse[courseId]`, `minGap = studyBlock.min`.
    - Title `Study — <courseName>`, with `courseId` set.
  - `placeStartup(t, input, exclude): { blocks; shortfalls }`
    - The same loop with `startupBlock`, `preferred = preferredStartupWindows` for that date, and `dayLoadSameCategory = load.startup`.
    - Blocks are linked round-robin to `input.startupTasks`, in order.
    - Title `Startup — <task title>`, or `Startup` when there are no tasks.

- [ ] **Step 1: Write the failing tests**

```ts
test('nextChunk', () => {
  expect(nextChunk(360, 45, 120)).toBe(120);
  expect(nextChunk(150, 45, 120)).toBe(105);  // 150-120=30 < 45 → 150-45
  expect(nextChunk(30, 45, 120)).toBe(45);
  expect(nextChunk(100, 45, 120)).toBe(105);  // round up to 15
});
test('study 6h course A + 4h course B on empty week: totals met, block lengths 45..120, per-course/day ≤ 180, study/day ≤ 300', () => {});
test('study spreads: no day has more than ceil(total/available days)+max of a course', () => {
  // weaker property: course A appears on ≥ 3 distinct days
});
test('reserved evenings receive no study or startup', () => {});
test('startup prefers weekday evenings/weekend mornings and links tasks round-robin', () => {});
test('overloaded week → study shortfall equals unplaced minutes', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner/chunked`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run planner/chunked`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): chunked study and startup placement"`

---

### Task 9: Planner — `planWeek` composition, invariants and scenario suite

**Files:**
- Create: `server/src/planner/planWeek.ts`; modify `server/src/planner/index.ts` (export `planWeek` and the types)
- Create: `server/test/planner/invariants.ts`
- Test: `server/test/planner/planWeek.test.ts`

**Interfaces:**
- Produces:
  - `planWeek(input: PlannerInput): PlannerOutput`. Order (spec §5.3):
    1. `createTimeline`
    2. `placeMeals`
    3. `placeMealPrep`
    4. `reserveEvenings`
    5. `placeWorkouts`
    6. `placeStudy(exclude = reservedIntervals)`
    7. `placeStartup(exclude = reservedIntervals)`
    8. Collect shortfalls in goal order.
    9. Sort blocks by start, then by the category order from the Global Constraints.
  - `checkInvariants(input, output): string[]` (test helper; an empty array means OK). Checks:
    - Each block lies within a day window, and its start and end are multiples of 15 minutes.
    - No block overlaps another block, an `existing` block or a `busy` interval once each is padded by `bufferMinutes`.
    - Per-day caps hold.
    - No study or startup block overlaps a reserved evening.
    - Gym starts are ≥ `minHoursBetweenGym` apart.
    - Every block lies inside `input.range`.

- [ ] **Step 1: Write the failing tests**

Each scenario asserts `checkInvariants(...)` returns `[]`, plus the scenario-specific expectations below.

```ts
test('typical student week: classes Mon/Wed 10:00-11:20, work Tue/Thu 13:00-18:00; goals study A 360 B 240, startup 600, gym 2 cardio 1 sport 1, free evenings 2', () => {
  // all goals met (shortfalls []), 21 meals, 1 meal prep, 2 reserved evenings
});
test('overloaded week: work 08:00-22:30 every weekday → shortfalls for study and startup; sum(placed)+missing = goal', () => {});
test('zero free time (busy 00:00-24:00 all week) → blocks [] and every goal fully in shortfalls', () => {});
test('deterministic: same input twice → deep equal output; shuffled existing/busy order → same output', () => {});
test('DST week 2026-10-26: invariants hold and Sun 2026-11-01 lunch starts 12:30 local', () => {});
test('current-week range from Wed 12:15 → no block before range.start', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner/planWeek`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the planner suite**

Run: `npx vitest run planner`
Expected: PASS, all tests.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): planWeek composition with invariant-checked scenarios"`

---

### Task 10: Plans domain — inputs, drafts, commit, discard, busy provider

**Files:**
- Create: `shared/src/schemas/plans.ts`, `server/src/domains/plans/busy.ts`, `inputs.ts`, `service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `plans`), `server/src/ctx.ts` (add `busy: BusyProvider`), `server/src/app.ts`
- Test: `server/test/plans.test.ts`

**Interfaces:**
- Produces:
  - Shared:
    - `BusyInterval { start: string; end: string; title: string; calendarId?: string; externalEventId?: string }`
    - `ApiShortfall { kind: 'study'|'startup'|'workout'|'free_evenings'; courseId?: string; courseName?: string; workoutType?: WorkoutType; missing: number; unit: 'minutes'|'count' }`
    - `Plan { id; weekStart; mode: 'full'|'replan'; triggerBlockId: string|null; status: 'draft'|'applied'|'discarded'; createdAt; summary: PlanSummary }`
    - `PlanSummary { shortfalls: ApiShortfall[]; reservedEvenings: string[]; changes?: PlanChange[] }`. `changes` is used by Stage 4.
    - `PlanDraft { plan: Plan; blocks: Block[] }`
  - Busy provider:
    - `interface BusyProvider { busyIntervals(from: Date, to: Date): BusyInterval[] }`
    - `emptyBusyProvider`: the default in `createCtx`; Stage 3 replaces it
  - `buildPlannerInput(ctx, weekStart: string): PlannerInput`
    - **Range:**
      - A future week uses `weekRangeUtc(weekStart)`.
      - The current week runs from `ceilTo15(now)` to the week's end.
      - A past week throws `VALIDATION` with `fields.weekStart = "Cannot plan a past week"`.
    - **Existing:** blocks overlapping the range with status in `committed/done/partial/skipped`. Proposed and removed blocks are excluded.
    - **Busy:** `ctx.busy.busyIntervals(range)`.
    - **Goals are the remaining amounts:**
      - study per active course: `weeklyGoalMinutes − actual − (committed minutes not yet reviewed)` for that course this week, floored at 0
      - `startup`: the same calculation
      - workouts per type: `goal − (done/partial) − (committed workouts)`
      - `free_evenings`: `goal − free dates already in the past` (for the current week only)
    - Goals of 0 are omitted.
    - **startupTasks:** `listOpenTasks`.
  - Plan service:
    - `createWeekPlan(ctx, weekStart): PlanDraft`, in one transaction:
      1. Discard any existing `draft` plan for that `weekStart` (delete its proposed blocks, set it to `discarded`).
      2. Run `planWeek`.
      3. Insert the plan with `mode 'full'`.
      4. `createBlock` each proposed block with `status 'proposed'`, `source 'planner'` and `planId`.
      5. Map the shortfalls to `ApiShortfall`.
    - `getDraft(ctx, weekStart): PlanDraft | null`
    - `addDraftBlock(ctx, planId, input: BlockCreateInput): Block`: `status 'proposed'`, `source 'manual'`, `planId`
    - `commitPlan(ctx, planId): Plan`: all the plan's `proposed` blocks become `committed`, and the plan becomes `applied`. 409 `CONFLICT` if the plan isn't a `draft`.
    - `discardPlan(ctx, planId): Plan`: `deleteProposedBlocks`, and the plan becomes `discarded`
  - Routes:
    - `POST /api/plans { weekStart }` → 201 `PlanDraft`
    - `GET /api/plans/draft?weekStart` → `PlanDraft | null`
    - `POST /api/plans/:id/blocks` → 201 `Block`
    - `POST /api/plans/:id/commit`
    - `POST /api/plans/:id/discard`

- [ ] **Step 1: Write the failing tests**

```ts
test('plan next week creates proposed planner blocks linked to plan with shortfalls', async () => {});
test('planning again discards the previous draft: exactly one draft and no orphan proposed blocks', async () => {
  // plan, PATCH a proposed block, plan again → old plan discarded; count(status=proposed) === new draft block count
});
test('current week mid-day: no block before now (Wed 12:00 → ceil 12:00) and goals reduced by done+committed', async () => {
  // course A 360; Mon done 120 + Thu committed 60 → planner study goal for A = 180
});
test('past week → 400 fields.weekStart', async () => {});
test('commit turns proposed into committed and plan applied; second commit → 409', async () => {});
test('discard deletes proposed blocks', async () => {});
test('busy provider intervals are respected', async () => { /* ctx.busy stub returns Tue 12:00-14:00 → no block overlaps */ });
test('draft blocks do not count in progress planned unless includeProposed', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run plans`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): week plans — draft, commit, discard"`

---

### Task 11: Meal plan + "ate as planned" in review

**Files:**
- Create: `shared/src/schemas/mealPlan.ts`, `server/src/domains/mealPlan/service.ts`, `routes.ts`
- Modify: `server/src/db/schema.ts` (add `meal_plan_entries`, unique on `(date, slot)`), `shared/src/schemas/review.ts` (add `ateAsPlanned?: boolean` to `ReviewEntry`), `server/src/domains/review/service.ts`, `server/src/app.ts`
- Test: `server/test/mealPlan.test.ts`, `server/test/review.test.ts` (extend)

**Interfaces:**
- Produces:
  - `MealPlanEntry { id, date, slot: MealSlot, mealId, servings, meal: Meal }`: `meal` is joined in for display
  - `MealPlanEntryInput { mealId: string; servings: >0 ≤20 }`
  - `listMealPlan(ctx, weekStart): MealPlanEntry[]`
  - `setMealPlanEntry(ctx, date, slot, input): MealPlanEntry`: upsert; the meal must not be archived
  - `clearMealPlanEntry(ctx, date, slot): void`
  - `repeatLastWeek(ctx, weekStart): { copied: number }`: copies the previous week's entries to `date + 7`, skipping slots already filled and archived meals
  - Routes:
    - `GET /api/meal-plan?weekStart`
    - `PUT /api/meal-plan/:date/:slot`
    - `DELETE /api/meal-plan/:date/:slot`
    - `POST /api/meal-plan/repeat { weekStart }`
  - Review change: a meal block entry with `outcome done|partial` and `ateAsPlanned: true` → when a plan entry exists for `(local date of block.start, block.mealSlot)`, call `logMeal({ date, slot, mealId, servings })`. With no entry it throws `VALIDATION` at `fields["entries.<i>.ateAsPlanned"] = "No meal planned for this slot"`. Re-reviewing doesn't create a second log: the server checks for an existing log with the same `date`, `slot` and `mealId`.
  - `PendingReview` blocks of category `meal` gain `plannedMeal?: { mealId; name; servings }` so the UI can offer the option.

- [ ] **Step 1: Write the failing tests**

```ts
test('set/clear/list meal plan for a week', async () => {});
test('repeat last week copies entries without overwriting', async () => {});
test('archived meal cannot be planned (400)', async () => {});
test('review ateAsPlanned logs the planned meal once even if re-reviewed', async () => {});
test('ateAsPlanned without plan entry → 400 field error', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run mealPlan review`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: weekly meal plan and ate-as-planned review"`

---

### Task 12: Web — Week view (grid, day view, block details)

**Files:**
- Create: `web/src/features/week/WeekPage.tsx`, `WeekGrid.tsx`, `DayView.tsx`, `BlockCard.tsx`, `BlockDetails.tsx`, `geometry.ts`
- Modify: `web/src/App.tsx` (route `/week`), `web/src/components/TabBar.tsx` + `Sidebar.tsx` (insert Week second)
- Test: `web/test/week.test.tsx`, `web/test/geometry.test.ts`

**Interfaces:**
- Consumes: `useBlocks`, `usePreferences`, `useTimezone`, `BlockForm`, `useUpdateBlock`, `useRemoveBlock`.
- Produces:
  - `geometry.ts` (pure):
    - `PX_PER_HOUR = 48`
    - `gridHours(prefs): { from: number; to: number }`: from `floor(earliestBlock) − 1` to `ceil(latestBlockEnd) + 1`, clamped to 0..24
    - `blockTop(block, date, tz, hours): number`
    - `blockHeight(block): number`
    - `minutesFromPixels(dy: number): number`: snapped to 15
    - `layoutOverlaps(blocks): Map<id, { col: number; cols: number }>`: side-by-side columns for overlapping blocks
  - `WeekPage`:
    - A week switcher.
    - At 768 px and up: `WeekGrid`, 7 day columns with an hour gutter.
    - Under 768 px: `DayView` for one day, with prev/next buttons and horizontal swipe (`touchstart`/`touchend`, `|dx| > 60` px).
  - `BlockCard`:
    - Background is the category color.
    - 🔒 when `locked`.
    - Dashed border and a "Proposed" label when `status === 'proposed'`.
    - 50% opacity when `skipped`.
    - A ✓ badge when `done`/`partial`.
  - `BlockDetails` (opens on click):
    - Shows the fields.
    - "Edit" uses `BlockForm`, but not for fixed or reviewed blocks.
    - "Delete" calls `DELETE /api/blocks/:id`, which sets `removed`. This works for proposed blocks too, since `canTransition` allows `proposed` → `removed`.
    - For fixed blocks: "Cancel this occurrence", with the confirmation text "Cancel this class/shift on <date>? Other weeks are not affected."

- [ ] **Step 1: Write the failing tests**

```ts
test('geometry: 12:30 block top at (12.5-7)*48 with default prefs; 90 min height 72', () => {});
test('minutesFromPixels snaps to 15', () => { expect(minutesFromPixels(20)).toBe(30); });
test('layoutOverlaps gives two columns for overlapping blocks', () => {});
```

```tsx
test('week grid renders 7 columns with blocks in correct day column', async () => {});
test('locked block shows lock icon; proposed block has dashed style and label', async () => {});
test('mobile width shows single day and next button advances', async () => { /* window.innerWidth 375 */ });
test('cancel occurrence on fixed block confirms and calls DELETE', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run week geometry --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): week view with day view and block details"`

---

### Task 13: Web — drag and resize blocks

**Files:**
- Modify: `web/package.json` (add `@dnd-kit/core@^6.3.1`), `web/src/features/week/WeekGrid.tsx`, `DayView.tsx`, `BlockCard.tsx`, `geometry.ts`
- Test: `web/test/geometry.test.ts` (extend), `web/test/dragResize.test.tsx`

**Interfaces:**
- Produces:
  - `canDrag(block): boolean`: `!locked && (status === 'proposed' || status === 'committed')`
  - `applyMove(block, deltaMinutes: number, dayDelta: number): { start: string; end: string }`: keeps the duration
  - `applyResize(block, deltaMinutes: number): { start: string; end: string } | null`: `null` if the result is shorter than 15 minutes
  - Dragging a card in `WeekGrid` (dnd-kit `useDraggable`, with day columns as `useDroppable`) calls `onMove(block, deltaMinutes, dayDelta)`. A pointer-drag handle at the card's bottom calls `onResize(block, deltaMinutes)`.
  - Both callbacks run `useUpdateBlock().mutate({ id, start, end })`. On a server error the block snaps back and the error shows in a toast.

- [ ] **Step 1: Write the failing tests**

```ts
test('applyMove +30 min and +1 day keeps duration', () => {});
test('applyResize below 15 min → null', () => {});
test('canDrag false for locked, done, removed', () => {});
```

```tsx
test('onMove handler sends PATCH with new start/end', async () => {
  // render WeekGrid with onMove prop spy replaced by real hook; invoke the exported handleDragEnd({ delta: { y: 24 }, over: { id: '2026-10-20' } ... })
});
test('server 409 on move shows toast and keeps original position', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run geometry dragResize --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

`WeekGrid` exports `handleDragEnd(event, blocks, onMove)` so the test can call it without simulating pointer events.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): drag to move and resize blocks"`

---

### Task 14: Web — planning flow (draft panel, projection, commit/discard)

**Files:**
- Create: `web/src/api/hooks/plans.ts`, `web/src/features/week/DraftPanel.tsx`
- Modify: `web/src/features/week/WeekPage.tsx`, `web/src/api/hooks/progress.ts` (support `includeProposed`)
- Test: `web/test/planning.test.tsx`

**Interfaces:**
- Consumes: the plans API; `useWeekProgress(weekStart, { includeProposed: true })`.
- Produces:
  - Hooks: `useCreatePlan()`, `useDraft(weekStart)`, `useAddDraftBlock()`, `useCommitPlan()`, `useDiscardPlan()`. All of them invalidate `blocks`, `progress` and `plans`.
  - `WeekPage` header:
    - **Plan this week** shows when viewing the current week; **Plan next week** shows when viewing next week. Past weeks show no plan button.
    - If a draft exists, it shows "Draft — review and commit".
  - `DraftPanel` (a side panel on desktop, a bottom sheet on phones):
    - Projected progress per goal: planned including proposed, against the goal.
    - Shortfalls, worded as "Can't fit: 1.5 h of Econometrics", "Can't fit: 1 gym session" or "Only 1 of 2 free evenings".
    - The reserved evenings.
    - "Add block" opens `BlockForm` and submits to `POST /api/plans/:id/blocks`.
    - **Commit** and **Discard**. Discard asks for confirmation.
    - After a commit: the toast "Week committed".

- [ ] **Step 1: Write the failing tests**

```tsx
test('Plan next week posts weekStart and shows draft panel with shortfalls', async () => {
  // shortfall {kind:'study', courseName:'Econometrics', missing: 90, unit:'minutes'} → "Can't fit: 1.5 h of Econometrics"
});
test('projection uses includeProposed=true', async () => {});
test('commit calls commit endpoint and hides panel', async () => {});
test('discard requires confirmation', async () => {});
test('no plan button for past weeks', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planning --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): plan week flow with draft review and commit"`

---

### Task 15: Web — meal plan (Week assignment, Food Plan tab, review option)

**Files:**
- Create: `web/src/api/hooks/mealPlan.ts`, `web/src/features/week/MealAssignModal.tsx`, `web/src/features/areas/food/MealPlanTab.tsx`
- Modify: `web/src/features/week/BlockCard.tsx` (show the assigned meal name), `BlockDetails.tsx` ("Assign meal" for meal blocks), `web/src/features/areas/food/FoodPage.tsx` (Plan tab), `web/src/features/review/ReviewRow.tsx` ("Ate as planned" checkbox)
- Test: `web/test/mealPlan.test.tsx`

**Interfaces:**
- Produces:
  - Hooks: `useMealPlan(weekStart)`, `useSetMealPlanEntry()`, `useClearMealPlanEntry()`, `useRepeatMealPlan()`.
  - **Plan tab:**
    - A 7 × 3 grid (breakfast, lunch, dinner). A cell shows the meal name, servings and kcal.
    - Clicking a cell opens the meal picker.
    - "Repeat last week" shows the toast "Copied N meals".
    - Weekly kcal and protein per day are summed from the plan.
  - **Review row** for a meal block with `plannedMeal`: an "Ate as planned (Chicken bowl ×1)" checkbox, checked by default. It sends `ateAsPlanned: true`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('assign meal from week block details PUTs entry', async () => {});
test('plan tab repeat last week shows copied count', async () => {});
test('review meal row sends ateAsPlanned true by default', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run mealPlan --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project web`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): meal planning and ate-as-planned review"`

---

### Task 16: Web — Settings: fixed schedule + planner preferences

**Files:**
- Create: `web/src/api/hooks/schedule.ts`, `web/src/features/settings/FixedScheduleSection.tsx`, `PreferencesSection.tsx`
- Modify: `web/src/features/settings/SettingsPage.tsx`
- Test: `web/test/settingsSchedule.test.tsx`, `web/test/settingsPreferences.test.tsx`

**Interfaces:**
- Produces:
  - Hooks: `useFixedEvents()`, `useSaveFixedEvent()`, `useDeleteFixedEvent()`.
  - **Fixed schedule** section:
    - A list grouped by weekday: title, kind, course, time, term dates.
    - The form fields: kind (class/work), title, course (only for class), weekday, start, end, valid from, valid to.
    - Deleting asks "Remove all future occurrences of <title>? Past, reviewed ones are kept."
  - **Planner preferences** section, with fieldsets:
    - Day: sleep, earliest block, latest end, buffer
    - Limits: max planned/day, max study/day, max per course/day
    - Block lengths: study and startup min/max
    - Workouts: durations, preferred windows editor, allowed days, gym spacing
    - Meals: times, durations, flex, meal prep day/start/duration
    - Evenings: evening start, protected evenings
    - Review time
    - "Classes count toward study"

    Saving sends the whole object. Server field errors show next to their inputs. "Reset to defaults" asks for confirmation, then sends `{}`.
  - The `TimeWindow` editor: weekday toggle chips plus start and end times, with add/remove rows.

- [ ] **Step 1: Write the failing tests**

```tsx
test('add class requires course; posts weekday and times', async () => {});
test('delete fixed event confirms with future-occurrence wording', async () => {});
test('preferences save sends full object; server field error displayed at latestBlockEnd', async () => {});
test('reset to defaults sends {}', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run settingsSchedule settingsPreferences --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the full suite, typecheck, and check the loop by hand**

Run: `npm test && npm run typecheck`
Expected: PASS.

Then in `npm run dev`:
1. Add classes and shifts.
2. Set goals.
3. Plan next week.
4. Drag a block.
5. Assign meals.
6. Commit.
7. Check that the dashboard planned bars update.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): settings for fixed schedule and planner preferences"`

---

## Self-Review Notes

- **Spec coverage:**
  - §3.2 `fixed_events` (Task 2), `plans` (Task 10), `preferences` (Task 1), `meal_plan_entries` (Task 11)
  - §4.1 setup (Tasks 1, 2, 16)
  - §4.2 steps 1–5 including the current week (Tasks 10, 14, 15)
  - §5.1 contract (Task 4 types, Task 9; `replan` is Stage 4)
  - §5.2 (Task 1)
  - §5.3 steps 1–7 and scoring (Tasks 4–9)
  - §5.5 edge cases (Task 9: goals met → omitted in Task 10; zero free time; DST; merged inputs via `mergeIntervals`)
  - §7 Week view (Tasks 12–15); Settings (Task 16)
- **Interfaces carried into later stages:**
  - `BusyProvider` (Stage 3 implements it)
  - `PlanSummary.changes` and `Plan.mode 'replan'` (Stage 4)
  - `createScheduler` (Stages 3 and 5)
  - `buildPlannerInput` (Stage 4 reuses it for the rest-of-week range)
