# Stage 4 — "Something came up" + Replan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One tap on **+ Something came up** adds the unexpected event (drinks with friends, an errand), replans the rest of that week with as few changes as possible, and shows a change summary the user can **Apply** or **Keep as is**. The same flow runs from a Google conflict banner via **Replan around this**.

**Architecture:**
- A pure `replan()` joins `planWeek()` in `server/src/planner/` and reuses its timeline, scoring and placement functions.
- A `replan` domain does the following:
  - resolves the quick-add presets
  - creates the locked `quick_add` block (synced to Google through the Stage 3 bus)
  - stores a `mode: 'replan'` draft holding the changes and a snapshot of the blocks it was based on
  - applies the draft atomically, or rejects it as stale

**Tech Stack:** Stages 1–3 stack. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-life-tracker-design.md`. Sections covered: §4.5 (all), §5.1 `replan` contract, §5.4, §7 Today button / Week overlap marker / quick-add page, §11 stage 4.

**Builds on:** Stage 1 (`createBlock`, `updateBlock`, `setBlockStatus`, `getBlock`), Stage 2 (`PlannerInput`, `createTimeline`, `placeMeals`, `placeMealPrep`, `placeWorkouts`, `placeStudy`, `placeStartup`, `reserveEvenings`, `nextChunk`, `ceilTo15`, `buildPlannerInput`, `Plan`, `PlanSummary`, `ApiShortfall`, `dayBoundsUtc`, `eveningWindowUtc`, `sleepStartUtc`, `layoutOverlaps`), Stage 3 (`Conflict`, `listConflicts`, `dismissConflict`, `markConflictReplanned`, `Banners`).

## Global Constraints

All Global Constraints from Stages 1–3 apply. In addition:

- **Quick-add categories:** `social` (default), `errand`, `appointment`, `other`.
  - Title: 1–120 characters.
  - The created block is `source: 'quick_add'`, `status: 'committed'`, `locked: true`.
- **Presets** (spec §4.5), all computed in the configured timezone, starting at `ceilTo15(now)`:
  - `rest_of_tonight` = `[start, sleepStartUtc(today))`
  - `this_afternoon` = `[max(start, today 12:00), today 18:00)`
  - `all_day` = `[max(start, dayBoundsUtc(today).start), sleepStartUtc(today))`
  - If the resulting interval is shorter than 15 minutes → 400 `VALIDATION`:
    - `rest_of_tonight` / `all_day`: `fields.when` = "It's already past your bedtime"
    - `this_afternoon`: `fields.when` = "The afternoon is over"
- **Custom time:** `{ start: ISO; durationMinutes: 15..1440 }`.
- **Replan scope:** the week containing the trigger, from `max(ceilTo15(now), weekStart)` to the week's end.
- **Minimal change (§5.4):** a block that doesn't conflict is **never** moved.
- **Can't be shortened:** workout, meal and meal-prep blocks. They're either kept or moved whole.
- **Shortening minimums:** study → `studyBlock.min`; startup → `startupBlock.min`; every other category → 15.
- **One open replan draft per week.** A new one discards the previous one.
- **Staleness:** applying fails with 409 `CONFLICT`, message exactly "Your week changed since this replan — please replan again", if any block the draft was based on has a different `updatedAt` or `status` than when the draft was made.

## Review Focus

1. **Quick-add after bedtime**, or "This afternoon" at 18:30 → a clear 400 message on the form, not a 0-minute event. With a bedtime after midnight (`00:30`), "Rest of tonight" at 23:00 runs until 00:30. *Task 1 tests.*
2. **The week changed between the summary and Apply** (e.g. a Google pull moved a block, or the user reviewed one) → 409 with the exact message. The UI offers "Replan again". *Task 3 test, Task 5 test.*
3. **A quick-add that overlaps nothing movable** → no draft and no empty summary. The UI shows "Added — nothing else needed to move". *Task 3 test, Task 5 test.*
4. **A trigger overlapping a locked fixed class or another quick-add** → those are never moved. The overlap is shown with a ⚠ marker on the Week view. *Task 2 test, Task 6 test.*
5. **A gym session hit by the trigger** can't be shortened. It's moved to another day that respects the 40-hour spacing; if there's no such day it's removed and reported under "Can't fit: 1 gym session". *Task 2 test.*

---

## File Structure

```
shared/src/schemas/replan.ts             QuickAddInput, QuickAddResult, ApiPlanChange, ReplanDraft
server/src/planner/replan.ts             replan() pure
server/src/planner/meals.ts              (modify) placeMeals onlySlots option
server/src/domains/replan/{presets.ts,inputs.ts,service.ts,routes.ts}
server/test/planner/replan.test.ts
server/test/replan/*.test.ts
web/src/api/hooks/replan.ts
web/src/features/quickAdd/QuickAddPage.tsx
web/src/features/replan/{ReplanPage.tsx,ChangeSummary.tsx}
web/src/features/week/overlaps.ts
```

---

### Task 1: Quick-add presets

**Files:**
- Create: `shared/src/schemas/replan.ts` (only `QuickAddInput` for now), `server/src/domains/replan/presets.ts`
- Test: `server/test/replan/presets.test.ts`

**Interfaces:**
- Produces:
  - `QuickAddWhen = { preset: 'rest_of_tonight' | 'this_afternoon' | 'all_day' } | { start: string; durationMinutes: number }`
  - `QuickAddInput { title: string; category: 'social'|'errand'|'appointment'|'other' (default 'social'); when: QuickAddWhen; notes?: string }`
  - `resolveQuickAddWhen(when: QuickAddWhen, now: Date, prefs: Preferences, tz: string): { start: Date; end: Date }`: throws `AppError('VALIDATION', ..., { when: <message> })` per the Global Constraints

- [ ] **Step 1: Write the failing tests**

```ts
const TZ = 'America/Los_Angeles';
test('rest_of_tonight at Wed 19:07 local → 19:15 .. 23:30', () => {
  const r = resolveQuickAddWhen({ preset: 'rest_of_tonight' }, new Date('2026-10-15T02:07:00Z'), DEFAULT_PREFERENCES, TZ);
  expect(localTimeOf(r.start, TZ)).toBe('19:15'); expect(localTimeOf(r.end, TZ)).toBe('23:30');
});
test('rest_of_tonight with bedtime 00:30 at 23:00 ends next day 00:30', () => {});
test('rest_of_tonight at 23:40 with bedtime 23:30 → VALIDATION fields.when "It\'s already past your bedtime"', () => {});
test('this_afternoon at 10:00 → 12:00..18:00; at 18:30 → "The afternoon is over"', () => {});
test('all_day at 06:00 → 08:00..23:30', () => {});
test('custom start + duration passes through; duration 10 → schema error', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run replan/presets`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run replan/presets`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(replan): quick-add time presets"`

---

### Task 2: Pure `replan()` — minimal-change rescheduling

**Files:**
- Create: `server/src/planner/replan.ts`; modify `server/src/planner/index.ts` (export it)
- Modify: `server/src/planner/meals.ts` (add the `onlySlots?: Array<{ date: string; slot: MealSlot }>` option to `placeMeals`)
- Test: `server/test/planner/replan.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface MovableBlock extends Interval {
    id: string; category: Category; title: string;
    courseId?: string | null; startupTaskId?: string | null;
    workoutType?: WorkoutType | null; mealSlot?: MealSlot | null;
  }
  interface ReplanInput extends PlannerInput {   // existing = frozen blocks; goals = only free_evenings (if any)
    movable: MovableBlock[];
    trigger: Interval & { title: string };
  }
  type PlanChangeCore =
    | { type: 'moved'; blockId: string; from: Interval; to: Interval }
    | { type: 'shortened'; blockId: string; from: Interval; to: Interval }
    | { type: 'removed'; blockId: string; from: Interval }
    | { type: 'added'; block: ProposedBlock };
  interface ReplanOutput { changes: PlanChangeCore[]; shortfalls: Shortfall[] }
  function replan(input: ReplanInput): ReplanOutput;
  ```
- Algorithm (spec §5.4):
  1. `pad = padIntervals([trigger], bufferMinutes)[0]`. A movable block is **conflicting** if it overlaps `pad`.
  2. For each conflicting block:
     - If its category can be shortened, compute `subtractIntervals([block], [pad])`. If the longest remaining part, aligned to 15 minutes, is at least the category minimum → it's `shortened` to that part.
     - Otherwise it's removed, and a pool item `{ sourceBlock, category, minutes, courseId, startupTaskId, workoutType, mealSlot, date }` is added.
  3. The timeline's `existing` is: frozen + non-conflicting movable + shortened (new intervals) + the trigger (as a `quick_add`-like `PlannerBlockRef`).
  4. Reserve evenings with the given `free_evenings` goal (it may be absent), then re-place the pool:
     - meals → `placeMeals({ onlySlots: [{ date, slot }] })`; nothing found → `removed` with no shortfall
     - meal prep → `placeMealPrep`
     - workouts → `placeWorkouts` with a `count: 1` goal per item
     - study → `placeStudy` with one goal per course (summing the pool minutes for that course)
     - startup → `placeStartup` with `startupTasks = [the original task]` when it had one
  5. **Pairing**, in pool order:
     - The first placed block for a pool item → `moved { blockId: sourceBlock.id, from, to }`.
     - Further blocks from the same item → `added`.
     - An item with nothing placed → `removed` plus a shortfall.

     Study and startup items are paired per course or task in start order.
  6. The changes are sorted by `from.start`, or by `block.start` for `added`.

- [ ] **Step 1: Write the failing tests**

```ts
// next week Tue: study A 19:00-21:00 (movable), gym 17:00-18:15 Tue (movable), class Tue 10:00 (frozen, locked)
test('night out Tue 19:00-23:30 moves the evening study block to another day; nothing else changes', () => {
  // changes = [{ type:'moved', blockId: studyTue, from, to }] and to is not on Tue evening; invariants hold
});
test('partial overlap shortens a startup block when the rest is ≥ startupBlock.min', () => {
  // startup 17:00-20:00, trigger 19:30-23:00 → shortened to 17:00-19:15 (pad 15)
});
test('partial overlap below min removes and re-places', () => {});
test('gym hit by trigger is moved whole respecting 40h spacing; no room → removed + shortfall count 1', () => {});
test('locked/frozen blocks overlapping the trigger are untouched and not in changes', () => {});
test('non-conflicting movable blocks never appear in changes', () => {});
test('no room for study pool → removed + shortfall minutes equal to removed minutes', () => {});
test('deterministic output', () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run planner/replan`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the planner suite**

Run: `npx vitest run planner`
Expected: PASS. The Stage 2 tests still pass with the `onlySlots` option.

- [ ] **Step 5: Commit** — `git commit -m "feat(planner): minimal-change replan"`

---

### Task 3: Replan domain — quick-add, drafts, apply, keep, stale detection

**Files:**
- Create: `server/src/domains/replan/inputs.ts`, `service.ts`; extend `shared/src/schemas/replan.ts`
- Modify: `server/src/db/schema.ts` (add `basis_json text` to `plans`), `shared/src/schemas/plans.ts` (`PlanSummary.changes?: ApiPlanChange[]`, `conflictId?: string`)
- Test: `server/test/replan/service.test.ts`

**Interfaces:**
- Produces:
  - Shared:
    - `ApiPlanChange { type: 'moved'|'shortened'|'removed'|'added'; blockId: string|null; title: string; category: Category; from: { start; end } | null; to: { start; end } | null }`
    - `ReplanDraft { plan: Plan; changes: ApiPlanChange[]; shortfalls: ApiShortfall[] }`
    - `QuickAddResult { block: Block; draft: ReplanDraft | null }`
  - `buildReplanInput(ctx, trigger: { start: Date; end: Date; title: string }): { input: ReplanInput; weekStart: string; basis: Record<string, { updatedAt: string; status: BlockStatus }> }`
    - `weekStart = weekStartOf(trigger.start)`
    - `range = [max(ceilTo15(now), weekStart), weekEnd]`
    - **Frozen:** blocks overlapping the range that are locked, reviewed, or start before `range.start`.
    - **Movable:** `committed`, not locked, `start ≥ range.start`.
    - **Busy:** `ctx.busy`.
    - **Goals:** only the remaining `free_evenings` count, computed as in `buildPlannerInput`.
    - **Basis:** a snapshot of every movable block.
  - `createReplanDraft(ctx, opts: { trigger: { start; end; title }; triggerBlockId?: string; conflictId?: string }): ReplanDraft | null`
    - Returns `null` when no movable block conflicts. No plan row is written then.
    - Otherwise it discards any previous `mode 'replan'` draft for that week (a full-week draft the user is still reviewing is left alone; its proposed blocks aren't movable) and inserts a `mode 'replan'` plan with `summary { changes, shortfalls, reservedEvenings: [], conflictId }` and `basis_json`.
  - `quickAdd(ctx, input: QuickAddInput): QuickAddResult`
    1. Resolve the interval.
    2. `createBlock(category, title, start, end, notes; { source: 'quick_add', status: 'committed', locked: true })`.
    3. `createReplanDraft({ trigger, triggerBlockId: block.id })`.
  - `getReplanDraft(ctx, planId): ReplanDraft`
  - `applyReplan(ctx, planId): { plan: Plan; blocks: Block[] }`, in one transaction:
    1. The plan must be a `draft` with `mode 'replan'`, else 409 `CONFLICT`.
    2. Check staleness against the basis; on mismatch, 409 with the exact message.
    3. Apply the changes:
       - `moved`/`shortened` → `updateBlock(id, { start, end })`
       - `removed` → `setBlockStatus(removed)`
       - `added` → `createBlock(..., { source: 'planner', status: 'committed', planId })`
    4. The plan becomes `applied`.
    5. If there's a `conflictId` → `markConflictReplanned`.
  - `keepAsIs(ctx, planId): Plan`: the plan becomes `discarded`. If there's a `conflictId` → `dismissConflict`.
  - `replanFromConflict(ctx, conflictId): ReplanDraft | null`: the conflict must be `open`, else 409. Its trigger is `{ start, end, title }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('quickAdd creates locked quick_add committed block and a replan draft with moved study block', async () => {});
test('quickAdd overlapping nothing movable returns draft null and writes no plan', async () => {});
test('apply moves blocks, removes unplaceable ones, creates added ones, marks plan applied, emits bus events', async () => {});
test('apply after a basis block changed → 409 with exact stale message, nothing changed', async () => {
  // edit a movable block via updateBlock between draft and apply
});
test('keepAsIs discards plan and keeps quick-add block', async () => {});
test('second quickAdd in same week discards first draft', async () => {});
test('quick-add for next Tuesday replans next week only, from its Monday', async () => {});
test('replanFromConflict uses conflict interval; apply marks conflict replanned; keep dismisses it', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run replan/service`
Expected: FAIL.

- [ ] **Step 3: Implement, then run `db:generate`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(replan): quick-add with replan drafts, apply, keep and stale detection"`

---

### Task 4: Replan routes

**Files:**
- Create: `server/src/domains/replan/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/replan/routes.test.ts`

**Interfaces:**
- Produces:

  | Route | Behavior |
  |---|---|
  | `POST /api/quick-add` | body `QuickAddInput` → 201 `QuickAddResult` |
  | `GET /api/replan/:planId` | → `ReplanDraft`; 404 if missing or not `mode 'replan'` |
  | `POST /api/replan/:planId/apply` | → `{ plan, blocks }` |
  | `POST /api/replan/:planId/keep` | → `Plan` |
  | `POST /api/conflicts/:id/replan` | → 201 `ReplanDraft`, or 200 `{ draft: null }` when nothing needs to move |

- [ ] **Step 1: Write the failing tests**

```ts
test('POST /api/quick-add with preset returns block and draft', async () => {});
test('POST /api/quick-add past bedtime → 400 fields.when', async () => {});
test('apply stale → 409 CONFLICT body with exact message', async () => {});
test('GET replan for a full-mode plan → 404', async () => {});
test('conflict replan returns draft', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run replan/routes`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(replan): API routes"`

---

### Task 5: Web — quick-add page + change summary

**Files:**
- Create: `web/src/api/hooks/replan.ts`, `web/src/features/quickAdd/QuickAddPage.tsx`, `web/src/features/replan/ReplanPage.tsx`, `web/src/features/replan/ChangeSummary.tsx`
- Modify: `web/src/App.tsx` (routes `/quick-add` and `/replan/:planId`), `web/src/features/today/TodayPage.tsx` (big **+ Something came up** button), `web/src/components/Layout.tsx` (header button on desktop)
- Test: `web/test/quickAdd.test.tsx`, `web/test/changeSummary.test.tsx`

**Interfaces:**
- Produces:
  - Hooks: `useQuickAdd()`, `useReplanDraft(planId)`, `useApplyReplan()`, `useKeepAsIs()`, `useReplanFromConflict()`. Mutations invalidate `blocks`, `progress`, `plans`, `conflicts` and `sync`.
  - `QuickAddPage` (`/quick-add`), designed for 2–3 taps on a phone:
    - **What** (autofocused text).
    - **When:** preset chips "Rest of tonight" (selected by default after 15:00 local), "This afternoon", "All day", "Pick a time" (which reveals date, start time and duration presets of 1 h / 2 h / 3 h / custom).
    - **Category:** chips with Social preselected.
    - **Save.**
    - On a 400, `fields.when` shows under the When chips.
    - On success with a draft → navigate to `/replan/<planId>`. With `draft: null` → the toast "Added — nothing else needed to move", then navigate to `/`.
  - `ChangeSummary { draft: ReplanDraft }`, sections shown only when non-empty:
    - **Moved:** "Study — Econometrics: Tue 19:00 → Thu 14:00"
    - **Shortened:** "Startup: Wed 2 h → 1.5 h"
    - **Removed**
    - **Added**
    - **Can't fit:** the shortfall wording from Stage 2
  - `ReplanPage`:
    - `ChangeSummary` plus **Apply** and **Keep as is**.
    - On a 409 stale error it shows the server message and a **Replan again** button, which calls `POST /api/replan/:planId/retry` and navigates to the new draft (or shows "Nothing needs to move" when it returns `null`).
  - **Server addition in this task:**
    - `retryReplan(ctx, planId): ReplanDraft | null`
      - The old plan must have `mode 'replan'`.
      - If it has a `triggerBlockId`, the trigger comes from that block's current times and title.
      - If it has a `conflictId`, the trigger comes from that conflict (which must still be `open`).
      - The old plan becomes `discarded`, and the function returns `createReplanDraft(...)` with the same IDs.
    - Route `POST /api/replan/:planId/retry` → `ReplanDraft`, or `{ draft: null }`.
    - The quick-add block isn't created again.

- [ ] **Step 1: Write the failing tests**

```tsx
test('quick-add defaults: Social category, Rest of tonight after 15:00', async () => {});
test('save with draft navigates to replan page showing Moved line', async () => {
  // "Study — Econometrics: Tue 19:00 → Thu 14:00"
});
test('save with draft null shows "Added — nothing else needed to move"', async () => {});
test('past-bedtime error shown under When', async () => {});
test('apply success navigates to week; 409 shows message and Replan again triggers retry', async () => {});
test('keep as is posts keep and returns to Today', async () => {});
```

```ts
// server/test/replan/routes.test.ts (extend)
test('retry after stale apply returns a fresh draft for the same trigger block', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run quickAdd changeSummary replan/routes`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): something-came-up quick add and change summary"`

---

### Task 6: Web — "Replan around this" + overlap markers

**Files:**
- Create: `web/src/features/week/overlaps.ts`
- Modify: `web/src/components/Banners.tsx` (enable **Replan around this**), `web/src/features/week/BlockCard.tsx` (⚠ marker), `WeekGrid.tsx`, `DayView.tsx`
- Test: `web/test/overlaps.test.ts`, `web/test/google.test.tsx` (extend)

**Interfaces:**
- Produces:
  - `overlapWarnings(blocks: Block[]): Set<string>`: IDs of non-removed, non-proposed blocks that overlap another such block (half-open intervals). Overlaps between a meal and a block in the same category don't count. A pure function.
  - `BlockCard` shows ⚠ with the title "Overlaps another block" for IDs in the set.
  - The conflict banner's **Replan around this** → `useReplanFromConflict` →
    - with a draft: navigate to `/replan/<planId>`
    - with `draft: null`: the toast "Nothing needs to move", and the conflict stays open

- [ ] **Step 1: Write the failing tests**

```ts
test('overlapWarnings flags quick-add over locked class and the class', () => {});
test('touching blocks are not overlaps', () => {});
```

```tsx
test('Replan around this navigates to replan page', async () => {});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run overlaps google --project web`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the full suite, typecheck, and check by hand**

Run: `npm test && npm run typecheck`
Expected: PASS.

Then in `npm run dev` with Google connected:
1. Commit a week.
2. Quick-add "Drinks" for tonight → the summary moves the evening study → Apply.
3. In Google, check that the moved event and the new "Drinks" event are there.
4. Add an overlapping event in the primary calendar → Sync now → Replan around this → Apply.

Add these as steps 11–12 in `docs/manual-e2e.md`.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): replan from conflicts and overlap markers"`

---

## Self-Review Notes

- **Spec coverage, §4.5:**
  - steps 1–2 (Tasks 1, 5): button on Today, `/quick-add` route (the PWA shortcut comes in Stage 5), header button on desktop, form fields, presets
  - step 3 (Tasks 2, 3): replan of the remaining days plus the change summary
  - step 4 (Task 3): Apply in one transaction, syncing through the bus
  - step 5 (Task 3): Keep as is, with the overlap marker in Task 6
  - step 6 (Tasks 3, 6): conflicts
- **§5.4** steps 1–6 → Task 2. **§5.1** `replan` contract → Task 2.
- **Added beyond the spec, with reasons:**
  - stale-draft detection, so Apply never clobbers newer edits
  - the `retry` endpoint, so the UI recovers from a stale draft without re-creating the quick-add block
