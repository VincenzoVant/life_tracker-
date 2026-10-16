# Planning setup: move planning out of Settings into Areas

The Today, Week and Quick-add ("something came up") screens stay as they are. Settings stops being the place where
you set up your life. Each area gets its own planning setup, and the planner uses all of it.

## What the user asked for

- Gym schedule: when workouts can happen, how many, how long, buffer before and after the gym.
- Class schedule (fixed): which classes, when, buffer before and after each class.
- Study: what to study, when study hours should be, when studying is possible at all.
- Meals: a separate meal planning tab. Breakfast, lunch and dinner times, meal prep, the weekly menu.
- This week: important projects (a class to study for, startup work, fun projects, relaxing), with hours for the week.

## Foundation (already on `feat/planning-setup`)

- `shared/src/schemas/preferences.ts`: new keys `studyWindows`, `preferredStudyWindows`, `classBuffer`,
  `workoutAvailability`, `workoutBuffer`, `mealsByDay`, plus `WINDOW_KEYS` (all TimeWindow[] keys, validated).
- `PATCH /api/preferences` merges top-level keys onto the stored preferences (`usePatchPreferences()` in
  `web/src/api/hooks/preferences.ts`). Area editors save only their own keys with it. `PUT` still replaces everything.
- `FixedEvent.bufferBefore` / `bufferAfter` (minutes, null = `classBuffer`), stored in `fixed_events`.
- `projects` table (`server/src/db/schema.ts`) and `blocks.project_id`. Migration `0016`. `Block.projectId?`.
- Planner buffers: `Pads` (`padBefore` / `padAfter`, minutes) on `PlannerBlockRef` and `ProposedBlock`.
  `timeline.candidates(date, minutes, { pad })` keeps the larger facing side between two blocks;
  missing sides default to `prefs.bufferMinutes`. `server/src/domains/plans/pads.ts` gives existing fixed blocks
  their class buffers and existing workouts the workout buffer.
- Web: `web/src/components/planning.tsx` has `WEEKDAYS`, `DayChips`, `TimeWindowEditor`, `BufferFields`,
  `AreaTabs`, `subErrors`. Placeholder pages `areas/classes/ClassesPage.tsx`, `areas/meals/MealsPage.tsx`,
  `areas/thisWeek/ThisWeekPage.tsx` are routed at `/areas/classes`, `/areas/meals`, `/areas/this-week`.

## Workstreams (one agent each)

| # | Area | Owns |
| --- | --- | --- |
| 1 | Classes | `web/src/features/areas/classes/**`, `server/src/domains/schedule/**` |
| 2 | Study | `web/src/features/areas/studies/**`, `server/src/planner/chunked.ts` (`placeStudy`), `server/src/domains/studies/**` |
| 3 | Workouts | `web/src/features/areas/workouts/**`, `server/src/planner/workouts.ts`, workout re-placement in `server/src/planner/replan.ts` |
| 4 | Meals | `web/src/features/areas/meals/**`, `web/src/features/areas/food/**`, `server/src/planner/meals.ts`, meal re-placement in `replan.ts`, `server/src/domains/mealPlan/**` |
| 5 | This week | `web/src/features/areas/thisWeek/**`, projects domain (new), `server/src/planner/projects.ts` (new), `planWeek.ts`, `plans/inputs.ts`, plan apply/commit paths that copy block links |

Settings is restructured by the lead after merging: the Goals, Fixed schedule and Planner preferences sections go
away and Settings keeps Day basics (sleep, earliest/latest, default buffer, daily max, evenings, review time),
Timezone, Google, Backups, Security and About.

## Rules for every workstream

- Stay inside your files. If you must touch a shared file (`shared/src/index.ts`, `App.tsx`, `replan.ts`,
  `planner/types.ts`), keep the change small and additive.
- Do not edit `web/src/features/settings/**`. Your area page must fully replace what Settings did for your area.
- Save preferences with `usePatchPreferences()` and only send your keys. Goals (`PUT /api/goals`) replace the whole
  set, so send the current goals merged with your change.
- Planner code stays pure and deterministic. Add tests next to the existing ones (`server/test/planner/*`).
- Web tests use `web/test/render.tsx` and `web/test/mockApi.ts`. Every new screen gets a test.
- Before committing: `npm run typecheck` and `npm test` must pass. If tsc complains about file names that differ
  only in casing, run `export PWD=$(pwd -P)` first.
- Commit on your branch with conventional messages (`feat(classes): ...`).
