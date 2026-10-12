# Life Tracker — Design Spec

- **Date:** 2026-10-12
- **Status:** Draft, awaiting review
- **Owner:** Vincenzo

## 1. Intent

Life Tracker is a personal, local-first app that runs one weekly loop across five areas of life: **studies, work, workouts, food and startup work**.

> **Set goals → plan the week → do it → log what actually happened → compare against goals.**

Planning, tracking and accountability matter equally. The app plans the week around fixed commitments, writes the plan to Google Calendar, replans when something unexpected comes up, and shows plan vs. actual vs. goal.

### Constraints from the user

- **Local:** all data lives on the user's Mac, in one SQLite file. The only external service is Google Calendar.
- **Calendar:** Google Calendar.
- **Devices:** used on the Mac and on the phone, from anywhere.
- **Planner autonomy:** it proposes; the user approves. Nothing is written to Google Calendar without an explicit commit or apply.
- **Single user.**

### Success criteria

1. Planning next week, including review and tweaks, takes **under 10 minutes**.
2. The daily review on a phone takes **under 2 minutes**.
3. "Something came up" → replan → applied in Google Calendar takes **under 1 minute**.
4. All data is in one local file that gets backed up nightly.
5. The app stays fully usable (tracking, planning, review) when Google is unreachable. Calendar changes catch up later.

### Non-goals (v1)

- Multi-user support, accounts, or cloud hosting.
- Integration with Liftoff or any other fitness app. Gym sets and reps stay in Liftoff.
- A food database, barcode scanning, or computing macros from ingredients.
- Deadlines, exams, grades, or per-course to-do lists.
- Live timers.
- Using the phone offline while the Mac is asleep or unreachable.
- Native iOS/macOS apps. It's a PWA only.
- Push notifications.
- AI/Claude-powered suggestions. This is a possible later addition and not designed here.

## 2. Architecture

**Approach:** a local web server on the Mac, a responsive PWA, and phone access through Tailscale.

```
life-tracker/
  shared/            TypeScript types + zod schemas used by server and web
  server/            Node 22+ + TypeScript (Hono), runs as a launchd agent
    src/db/          SQLite (better-sqlite3) + Drizzle schema + versioned migrations
    src/domains/     one module per area: tables, service functions, API routes
      schedule/      fixed weekly schedule (classes, work shifts)
      blocks/        the unified block model (planned + logged activity)
      studies/       courses, weekly hour goals
      work/          work hours (derived from work blocks)
      startup/       startup tasks & milestones
      workouts/      sessions (gym / cardio / sport) + lifts & top sets
      food/          saved meals, meal plan, meal log, daily targets
      goals/         weekly targets, progress calculation
    src/planner/     PURE functions: planWeek() and replan(); no DB, no network
    src/calendar/    Google Calendar adapter (OAuth, read, write, sync queue)
    src/jobs/        in-process scheduler: calendar sync, fixed-block rollout, backups
  web/               React + Vite PWA (vite-plugin-pwa), responsive
```

### Technology choices

| Concern | Choice | Reason |
|---|---|---|
| Server | Hono on Node 22+ | Small, typed, fast |
| DB | SQLite via better-sqlite3 + Drizzle ORM | One local file, synchronous transactions, typed schema, migrations |
| Validation | zod (shared) | Same schemas on server and client |
| Web | React + Vite + React Router + TanStack Query | Matches the user's existing TS/Vite stack |
| Drag & drop | dnd-kit | Week grid editing |
| Dates | date-fns + date-fns-tz | Store UTC; display in the configured IANA timezone (defaults to the system timezone) |
| Google | `@googleapis/calendar` + `google-auth-library` | Official client |
| Tests | Vitest (+ Testing Library for web) | Matches existing projects |

The server serves the API under `/api/*` and the built PWA as static files from a single port.

### Boundaries

- **The planner** is a pure module. Its input is a plain object (Section 5) and its output is proposed blocks plus shortfalls. It doesn't touch the database or the network.
- **The calendar adapter** is the only code that talks to Google. Domains never call Google directly. They enqueue sync operations (Section 6).
- **Domains** own their tables and expose service functions. API routes are thin wrappers around those functions.

## 3. Data model

All timestamps are stored as UTC ISO strings. Weekday and time-of-day fields (fixed schedule, preferences) are interpreted in the configured timezone. A **week** runs Monday 00:00 to Sunday 24:00 local time. IDs are ULIDs.

### 3.1 Blocks — the core model

Every planned or logged activity is a **block**.

| Field | Notes |
|---|---|
| `id` | |
| `category` | `study` \| `work` \| `startup` \| `workout` \| `meal` \| `meal_prep` \| `rest` \| `social` \| `errand` \| `appointment` \| `other` |
| `title` | e.g. "Study — Econometrics", "Drinks with Tom" |
| `start`, `end` | UTC |
| `status` | `proposed` \| `committed` \| `done` \| `partial` \| `skipped` \| `removed` |
| `actual_minutes` | Set during review. Equals the duration when `done`; user-entered when `partial`; 0 when `skipped` |
| `source` | `planner` \| `fixed` \| `manual` \| `quick_add` \| `unplanned` |
| `locked` | true for `fixed` and `quick_add` blocks. The planner never moves locked blocks |
| `course_id` | for `study` (and `class`-derived blocks) |
| `startup_task_id` | optional, for `startup` |
| `workout_type` | `gym` \| `cardio` \| `sport`, for `workout` |
| `meal_slot` | `breakfast` \| `lunch` \| `dinner` \| `snack`, for `meal` |
| `fixed_event_id` | for blocks generated from the fixed schedule |
| `plan_id` | the plan run that created or last changed it |
| `gcal_event_id`, `gcal_etag`, `gcal_synced_at` | sync state |
| `notes`, `created_at`, `updated_at` | |

Status lifecycle:

```
proposed ──commit──▶ committed ──review──▶ done | partial | skipped
   │                     │
   └──discard            └──deleted in app or Google──▶ removed
```

- **Unplanned blocks.** Activities added during review are created directly as `done` (or `partial`) with `source = unplanned`, and are never written to Google.
- **Quick-add blocks.** These are created as `committed` and locked.
- **Classes.** A class is a block with `category = study`, `source = fixed` and a `course_id`. The hours count toward that course's progress only if the setting `classes_count_toward_study` is on. **Default: off.** Study goals mean self-study time.

### 3.2 Other tables

- **`fixed_events`** — the recurring weekly schedule: `id, title, kind (class|work), course_id?, weekday (1–7), start_time (HH:mm), end_time, valid_from (date), valid_to (date), active`.
  - A job **materializes** fixed events into locked `committed` blocks for a rolling **8 weeks ahead**, and again whenever the fixed schedule changes.
  - Editing a fixed event regenerates its future blocks that haven't been reviewed yet. A single occurrence can be cancelled from the Week view, which sets that block to `removed`.
- **`courses`** — `id, name, color, weekly_goal_minutes, active`.
- **`startup_milestones`** — `id, title, target_date?, done_at?, sort_order`.
- **`startup_tasks`** — `id, title, status (todo|doing|done), milestone_id?, sort_order, done_at?`.
- **`workout_sessions`** — workout details, optionally linked to a block.
  - Common fields: `id, block_id?, type (gym|cardio|sport), date, duration_minutes, intensity (1–5)?, notes?`.
  - Gym: `gym_focus?` (free text, e.g. "Push").
  - Cardio: `cardio_kind?` (run, bike, swim…), `distance_km?`. Pace is computed from distance and duration.
  - Sport: `sport_name?`.
- **`lifts`** — `id, name, sort_order` (e.g. Bench, Squat, Deadlift, OHP).
- **`top_sets`** — `id, lift_id, date, weight_kg, reps, notes?`.
  - **PR per lift** is shown two ways: the heaviest weight, and the best estimated 1RM using Epley (`w × (1 + reps/30)`).
- **`meals`** — the saved meals library: `id, name, kcal, protein_g, carbs_g?, fat_g?, notes?`. Values are per serving.
- **`meal_plan_entries`** — `id, date, slot, meal_id, servings`.
- **`meal_logs`** — `id, date, slot, meal_id?, free_text?, servings, kcal, protein_g, carbs_g?, fat_g?`. Nutrition values are copied at logging time, so later edits to a saved meal don't change history.
- **`goals`** — weekly or daily targets, one row each. `kind` is one of:
  - `study_minutes` (per `course_id`; defaults to `courses.weekly_goal_minutes`)
  - `startup_minutes`
  - `workouts_total`
  - `workouts_by_type` (per `workout_type`)
  - `free_evenings`
  - `daily_kcal` (with `tolerance_pct`, default 10)
  - `daily_protein_g` (minimum)
  - Fields: `id, kind, target, course_id?, workout_type?, tolerance_pct?, active`.
- **`plans`** — `id, week_start, mode (full|replan), trigger_block_id?, status (draft|applied|discarded), created_at, summary_json`.
- **`preferences`** — a single JSON document validated by a zod schema (Section 5.2).
- **`sync_queue`** — `id, op (create|update|delete), block_id, attempts, next_attempt_at, last_error?, created_at`.
- **`calendar_state`** — `life_tracker_calendar_id, busy_calendar_ids[], sync_tokens{calendarId: token}, last_sync_at`.
- **`conflicts`** — `id, external_event_id, calendar_id, title, start, end, block_ids[], status (open|replanned|dismissed)`.

### 3.3 Derived values (computed, not stored)

- **Study minutes per course per week:** the sum of `actual_minutes` over `study` blocks with that `course_id` and status `done` or `partial`. Fixed class blocks are excluded unless `classes_count_toward_study` is on.
- **Startup minutes:** the same calculation over `startup` blocks.
- **Work minutes:** the same calculation over `work` blocks.
- **Workouts done:** reviewed `workout` blocks with status `done` or `partial`, plus `workout_sessions` without a block. Counted total and by type.
- **Free evening:** a day where the time from `preferences.evening_start` to sleep holds **no reviewed or committed `study`, `startup` or `work` block**. `social`, `rest` and `meal` blocks don't use up an evening, so a night out counts as free.
- **Daily macros:** the sum over that date's `meal_logs`.
- **Streaks:** consecutive days with the daily review completed, and consecutive weeks with all workout goals met.

## 4. The weekly loop (user flows)

### 4.1 Setup

1. Connect Google Calendar (Section 6.1).
2. Enter courses, the fixed weekly schedule (classes and work shifts with term dates), goals and planner preferences.
3. Optionally, add saved meals and lifts.

### 4.2 Plan next week

1. On the Week view, the user clicks **Plan next week**. The server collects these inputs:
   - fixed blocks
   - quick-add blocks already committed for that week
   - external busy events from the selected Google calendars
   - goals
   - preferences
   - open startup tasks
2. `planWeek()` returns proposed blocks plus a shortfall list. These are saved as a `draft` plan, and the blocks get status `proposed`.
3. The user reviews the draft on the week grid: drag, resize, delete, or add blocks. Meals are assigned per slot, either picked from saved meals or via "Repeat last week's meal plan." Goal progress shown alongside updates live, as projected minutes against each goal.
4. **Commit.** In one transaction, all `proposed` blocks become `committed`, a create operation is queued for each, and the plan is marked `applied`. The sync job pushes them to Google.
5. **Discard** deletes the draft.

Planning the current week is also allowed. In that case only the time from now until the end of the week is planned.

### 4.3 During the week

- The sync job runs every 5 minutes. There is also a "Sync now" button. Section 6.3 covers how changes made in Google are handled.
- A new external event that overlaps a future committed, non-locked block creates a **conflict**. The conflict appears as a banner on Today and Week, with two actions: **Replan around this** (Section 4.5) and **Dismiss**.

### 4.4 Daily review

- The **End-of-day review** is available all day and highlighted after `preferences.review_prompt_time` (default 20:00).
- The review lists today's committed blocks, plus earlier days' blocks that haven't been reviewed. For each block the user picks:
  - **Done:** `actual_minutes` = duration.
  - **Partly:** the user sets the minutes.
  - **Skipped:** `actual_minutes` = 0.
- Extra prompts depend on the category:
  - Workout: optional details (cardio distance, gym focus, intensity).
  - Startup: tick off the linked task.
  - Meal: "ate as planned" in one tap, which creates a `meal_log` from the plan entry, or log something else.
- **Add unplanned activity** creates `unplanned` blocks.
- After submitting, the review shows today's totals against goals.

### 4.5 "Something came up" + replan

1. The **+ Something came up** button is on Today, in the PWA's home-screen shortcut (`/quick-add`), and in the header on desktop.
2. Form fields:
   - **What** (text)
   - **When:** start + duration, or a preset: "Rest of tonight" (from now until sleep start), "This afternoon", "All day"
   - **Category:** `social` (default), `errand`, `appointment`, `other`
3. **Save** creates a locked `committed` block. The server runs `replan()` for the remaining days of the week (Section 5.4) and returns a **change summary**:
   - *Moved:* original slot → new slot
   - *Shortened:* old → new duration
   - *Removed*
   - *Can't fit:* shortfall per goal
4. **Apply** runs in one transaction: it applies the changes, queues sync operations (the new event plus all changed blocks) and marks the plan `applied`.
5. **Keep as is** keeps the new block, which is still synced to Google, and changes nothing else. Overlapping blocks stay as they are, shown with an overlap marker.
6. Starting **Replan around this** from a conflict runs the same flow. The external event is treated as an extra busy interval, and nothing is created in Google for it.

### 4.6 Dashboard

- **This week:**
  - Per area, a bar showing goal, planned (committed) and actual minutes or count.
  - Daily kcal and protein against targets.
  - Workouts by type.
  - Free evenings.
  - Streaks.
- **Trends:** the same numbers for the last 4, 12 or 26 weeks.

## 5. Planner

### 5.1 Contract

```ts
planWeek(input: PlannerInput): PlannerOutput
replan(input: PlannerInput & { existing: Block[]; trigger: Interval }): ReplanOutput

PlannerInput {
  range: { start, end }            // UTC; for the current week, start = now rounded up to the slot size
  timezone: string
  locked: Interval[]               // fixed blocks, quick-add blocks, committed blocks outside the range
  busy: Interval[]                 // external Google events (opaque, with title for display)
  goals: Goal[]                    // minus progress already achieved this week (for the current week)
  prefs: Preferences
  startupTasks: { id, title }[]    // open tasks, in sort order
}
PlannerOutput { blocks: ProposedBlock[]; shortfalls: Shortfall[] }
ReplanOutput  { changes: Change[]; shortfalls: Shortfall[] }   // Change = moved | shortened | removed | added
```

**Determinism:** the same input always gives the same output. Ties are broken by the earliest start, then by category order.

**Time granularity:** 15 minutes.

### 5.2 Preferences (zod-validated, all with defaults)

- **Day bounds:**
  - `sleep`: `{ start: "23:30", end: "07:30" }`
  - `earliest_block`: `"08:00"`
  - `latest_block_end`: `"22:30"`
- **Spacing:**
  - `buffer_minutes` between consecutive planned blocks: 15
  - `max_planned_minutes_per_day`: 480, excluding meals and fixed blocks
- **Study:**
  - `study_block`: `{ min: 45, max: 120 }`
  - `max_study_minutes_per_day`: 300
  - `max_minutes_per_course_per_day`: 180
- **Startup:**
  - `startup_block`: `{ min: 60, max: 180 }`
  - `preferred_startup_windows`: e.g. weekday evenings, weekend mornings
- **Workouts:**
  - `workout_durations`: `{ gym: 75, cardio: 45, sport: 90 }`
  - `preferred_workout_windows`: e.g. `[{days:[1,3,5], start:"07:30", end:"09:30"}]`
  - `allowed_workout_days`
  - `min_hours_between_gym`: 40
- **Meals:**
  - `meals`: `{ breakfast: {time:"08:00", minutes:20}, lunch: {time:"12:30", minutes:30}, dinner: {time:"19:00", minutes:45} }`, each with a ±60 minute flex
  - `meal_prep`: `{ day: 7, preferred_start: "16:00", minutes: 90 }`
- **Rest and review:**
  - `evening_start`: `"19:00"`
  - `review_prompt_time`: `"20:00"`
  - `protected_evenings`: optional fixed weekdays to always keep free
- **Settings:**
  - `classes_count_toward_study`: false

### 5.3 `planWeek` algorithm

1. **Build the free-slot timeline.** For each day in the range, start with the time between the end of sleep and the latest block end. Remove locked and busy intervals, each padded by `buffer_minutes`.
2. **Place meals** at the preferred time, using the nearest free slot within the flex window. If there isn't one, skip the meal; no shortfall is recorded for meals. **Place meal prep** on the preferred day, or the nearest day.
3. **Reserve free evenings.** Pick days for the `free_evenings` goal: `protected_evenings` first, then the days with the fewest locked commitments. Mark their evening ranges as unavailable for study, startup and work-type blocks.
4. **Place workouts.** Each required type count is placed into preferred windows first, then any allowed window, respecting `min_hours_between_gym` and spreading sessions evenly over the week.
5. **Place study.** For each course, the remaining goal minutes are split into blocks between `min` and `max` length and spread across days. The planner prefers the days with the least study so far, respecting the per-day caps, and places the course with the largest remaining need first.
6. **Place startup.** Remaining startup minutes are split into blocks and placed in preferred windows first, then any free slot. Blocks are linked round-robin to open startup tasks in sort order.
7. **Record shortfalls.** Any goal minutes or counts that couldn't be placed become `{goal, missing}`. The planner **never** breaks per-day caps, sleep or buffers to meet a goal.

**Slot scoring** (when several slots fit):
- +preferred window
- +a day with less load in the same category
- −late in the day (after 21:00)
- −fragmenting a free stretch (leaving a gap smaller than the minimum block length)

The highest score wins, and ties go to the earliest slot.

### 5.4 `replan` algorithm (minimal change)

1. **Frozen blocks.** Blocks in the past, reviewed blocks and locked blocks are frozen.
2. **Conflicting blocks.** Future blocks that overlap the trigger or a new busy interval are *conflicting*.
3. **Try to shorten.** For each conflicting block, if the part that doesn't overlap (after buffers) is at least the category's `min` length, shorten it to that part. Otherwise remove it and add its minutes back to the "to place" pool, keeping its course or task link.
4. **Keep the rest.** Non-conflicting future blocks stay exactly where they are. **v1 never moves a block that doesn't conflict.**
5. **Re-place the pool** into the remaining free slots, using the same placement rules and scoring as `planWeek`, limited to the rest of the week.
6. **Report.** A block that was removed in step 3 and re-placed in step 5 is reported as **moved**. Leftovers are reported as **shortfalls**.

### 5.5 Edge cases

- **Goals already met:** nothing gets placed for that goal.
- **A week with no free time:** an empty plan with full shortfalls, not an error.
- **DST transitions:** the timeline is built in local time per day and then converted to UTC. Tests cover both transitions.
- **Overlapping inputs:** overlapping locked or busy intervals are merged before the timeline is built.

## 6. Google Calendar integration

### 6.1 Connection

- **One-time setup.** The user creates a Google Cloud project with a **Desktop app** OAuth client. A step-by-step guide lives in `docs/setup-google.md`.
- **Publish the app.** The OAuth consent screen must be set to **"In production"**. In "Testing" mode, refresh tokens expire after 7 days. An unverified app is fine for personal use; the user clicks through the "unverified app" warning once.
- **OAuth flow:** a loopback redirect to `http://127.0.0.1:<port>/api/google/callback`.
- **Scopes (least privilege):**
  - `calendar.app.created`: create and manage the Life Tracker calendar and its events.
  - `calendar.calendarlist.readonly`: list calendars to choose busy sources.
  - `calendar.events.readonly`: read events from busy calendars.
- **Token storage.** The refresh token is stored in `~/LifeTracker/secrets/google.json` with `0600` permissions. It is **excluded from backups**.
- **On first connect:**
  - Create a secondary calendar named **"Life Tracker"** and store its ID.
  - The user picks which calendars count as busy. Default: the primary calendar.

### 6.2 Writing (app → Google)

- Every `committed` block **except `unplanned`** is mirrored as one event in the Life Tracker calendar.
- **Event content:**
  - Title: the block title.
  - Color: the category color, mapped to Google `colorId`.
  - Description: a backlink to the block in the app.
  - `extendedProperties.private.lifeTrackerBlockId`: the block ID.
- **Status changes:**
  - `done`, `partial` and `skipped` don't change the event. The calendar shows the plan, not the outcome.
  - `removed` deletes the event.
- **Sync queue.** All writes go through `sync_queue`, which deduplicates per block (the latest operation wins).
  - The worker processes the queue in order.
  - On failure: exponential backoff from 30 s up to 1 h, with no limit on attempts.
  - Errors are visible in Settings.
  - A "N changes waiting to sync" badge shows in the header.

### 6.3 Reading (Google → app)

The sync job runs every 5 minutes plus on demand, using incremental `events.list` with `syncToken`. A `410 Gone` response triggers a full resync.

**Life Tracker calendar (detecting the user's edits in Google):**
- **Event moved or resized:** update the block's `start` and `end`. The user is the source of truth here.
- **Event deleted:** the block becomes `removed`, unless it was already reviewed.
- **Changed in both places since the last sync:** the most recent `updated` timestamp wins. Changes coming from Google are listed in a small "Changes from Google" feed on Today.

**Busy calendars:**
- These are cached as busy intervals for the planner, covering the next 8 weeks.
- These events are skipped:
  - transparent ("free") events
  - declined invites
  - all-day events (configurable)
- A new or changed event that overlaps a future committed, non-locked block creates a **conflict** (Section 4.3).

### 6.4 Failure modes

| Failure | Behavior |
|---|---|
| Network down / Google 5xx / rate limit | Queue keeps the operations; backoff; app fully usable |
| Refresh token revoked or expired | Sync paused; "Reconnect Google" banner; queue kept |
| Life Tracker calendar deleted in Google | Detected on sync; offer "Recreate calendar & re-push committed future blocks" |
| Event edited in Google beyond recognition (e.g. block ID property removed) | Treated as an external event on the next full resync |

## 7. Screens (PWA)

There is a bottom tab bar on phones and a sidebar on desktop. Each category has one color, used everywhere: blocks, charts and Google `colorId`. Light and dark mode follow the system setting.

1. **Today (home):**
   - Timeline of today's blocks and a "Next up" card.
   - Today's kcal and protein against target.
   - Conflict and "Changes from Google" banners.
   - **+ Something came up** and **End-of-day review** buttons.
2. **Week:**
   - A grid on desktop; one day at a time with swiping on phones.
   - Locked blocks show a lock icon. Proposed blocks are drawn dashed.
   - Actions: **Plan next/this week**, the draft review panel with live goal projection, **Commit/Discard**, and the replan change summary.
   - Meal assignment per slot.
3. **Review:** the daily review flow (Section 4.4).
4. **Areas:**
   - *Studies:* courses with this week's progress against goal; manage courses.
   - *Work:* this week's shifts and hours.
   - *Startup:* tasks (to do / doing / done, drag to reorder, group by milestone); milestones; hours this week.
   - *Workouts:* session history (filter by type); **Top Lifts** (lift list, "Add top set", per-lift history chart, PRs).
   - *Food:* saved meals library; this week's meal plan; meal log.
5. **Dashboard** (Section 4.6).
6. **Settings:**
   - Fixed weekly schedule (with term dates)
   - Goals
   - Planner preferences
   - Google connection and busy calendars
   - Sync queue status
   - Backup folder
   - PIN
   - Timezone

**Offline/unreachable:** a service worker serves the app shell. When `/api/health` can't be reached, the app shows: "Life Tracker is offline — your Mac may be asleep or disconnected."

## 8. Security & runtime

- **Network exposure.** The server binds to **127.0.0.1 only**. Phone access goes through **`tailscale serve`**, which proxies the tailnet's HTTPS (`https://<mac>.<tailnet>.ts.net`) to localhost. This provides a valid HTTPS certificate, which PWA install and service workers require, and nothing is reachable from the public internet.
- **PIN.**
  - The PIN is required on first visit from each device. It is stored as an argon2 hash.
  - A successful login sets an httpOnly, Secure, SameSite=Strict session cookie that lasts 30 days.
  - After 5 failed attempts within 15 minutes, logins lock out for 15 minutes.
- **CSRF.** SameSite=Strict cookies plus an `Origin` header check on state-changing requests.
- **Runtime.**
  - A launchd agent (`~/Library/LaunchAgents/com.lifetracker.server.plist`, `KeepAlive`) starts the server at login.
  - Logs go to `~/LifeTracker/logs/` and are rotated.
  - `docs/setup-phone.md` covers installing Tailscale, `tailscale serve`, adding the PWA to the home screen, and optionally macOS "prevent sleep while on power."
- **Data directory:** `~/LifeTracker/` holds `data.db`, `secrets/`, `logs/` and `backups/`, or the configured backup folder.
- **Backups.**
  - Runs nightly at 03:00, plus on demand.
  - Uses SQLite's online backup API to write `data-YYYY-MM-DD.db` to the configured folder (e.g. iCloud Drive). The last 14 are kept.
  - `secrets/` is not included.
  - A restore guide is in the README.

## 9. Error handling

- **Validation.** Every API input is validated with shared zod schemas. Errors return `400` with field messages, which the UI shows inline.
- **Transactions.** Multi-step writes run in a single SQLite transaction: commit plan, apply replan, materialize fixed events, submit review.
- **Migrations.** Versioned Drizzle migrations run at startup. The database is backed up automatically before each migration.
- **Planner errors.** The planner never throws for "doesn't fit"; that's what shortfalls are for. Invalid input (e.g. preferences that leave no usable day) gets a clear validation error.
- **Server crashes.** launchd restarts the server. The sync queue and plans are persisted, so no work is lost.
- **Error responses.** These use a consistent shape `{ error: { code, message, fields? } }`. The UI shows a toast for unexpected errors.

## 10. Testing

- **Planner unit tests** — the highest priority. Fixture weeks:
  - an empty week
  - a typical student week (classes + shifts)
  - an overloaded week (shortfalls)
  - preferred windows respected
  - gym spacing
  - per-day caps
  - meals within their flex windows
  - free evenings protected
  - DST weeks
  - replan: night out on a study evening (move), partial overlap (shorten), no room left (shortfall), non-conflicting blocks untouched

  **Invariant checks run on every output:**
  - no overlaps with locked or busy intervals
  - buffers respected
  - inside the day bounds
  - same input gives the same output
- **Domain and API tests** against in-memory SQLite. Covered:
  - goal progress calculations
  - review status transitions
  - fixed-event materialization and regeneration
  - meal log nutrition copied at logging time
  - top-set PR computation
- **Calendar adapter tests** against a fake Google client. Covered:
  - queue deduplication and backoff
  - incremental sync and `410` resync
  - edits and deletes detected from Google
  - conflict creation
  - token-expired path
- **Web component tests** (Testing Library):
  - the daily review flow
  - quick-add → change summary → apply
  - the commit flow
- **One manual end-to-end checklist** against a real test calendar: `docs/manual-e2e.md`.

## 11. Delivery stages

Each stage ends with something usable on its own. A separate implementation plan is written per stage.

1. **Foundation + tracking.**
   - Repo and workspace setup; server, database and migrations; PWA shell; PIN login.
   - The block model and manual blocks.
   - Courses, startup tasks and milestones, workouts and top lifts, saved meals and meal log, goals.
   - Daily review and a basic dashboard.
   - *The user can start tracking.*
2. **Planner.**
   - Fixed schedule and its materialization; preferences.
   - `planWeek`; Week view with draft review, drag/resize and commit; meal plan assignment.
   - Runs app-only, with no Google yet.
3. **Google Calendar.**
   - OAuth, the Life Tracker calendar, the sync queue and writer.
   - Reading busy calendars, detecting edits from Google, conflicts, failure banners.
   - Setup guide.
4. **Something came up + replan.**
   - Quick-add, `replan`, the change summary and apply.
   - "Replan around this" from conflicts.
5. **Phone access & polish.**
   - launchd agent, the `tailscale serve` guide, PWA install and shortcuts, offline screen.
   - Backups and restore guide; dashboard trends and streaks.

## 12. Decisions & assumptions

- **Fixed events become individual Google events.** Fixed-schedule entries are materialized as individual blocks/events for a rolling 8 weeks, not as Google recurring events. This keeps a single rule — one block = one event — and makes cancelling one occurrence simple. Effect for the user: classes appear as normal events in the Life Tracker calendar.
- **The calendar shows the plan.** Logging outcomes (done/skipped) doesn't change Google events.
- **Classes don't count as study** by default (a setting).
- **Social time counts as free time** for the free-evenings goal.
- **The planner doesn't move non-conflicting blocks** when replanning in v1.
- **The Mac must be awake and online** for phone access; this is accepted. Moving to an always-on host later only needs the runtime setup changed, not the code.
