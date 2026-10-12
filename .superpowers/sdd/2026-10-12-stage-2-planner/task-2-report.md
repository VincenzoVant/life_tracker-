# Task 2 report: Fixed weekly schedule + materialization

Implemented: fixed_events table + migration 0008_lush_enchantress, shared FixedEvent/FixedEventInput/FixedEventUpdateInput,
updateFixedBlockInternal (blocks service), materializeFixedEvents (single transaction, 56-day rolling window, edit-only
update/remove of future committed occurrences, never recreates any date that already has a block of any status),
list/create/update/deleteFixedEvent, routes /api/schedule (GET, POST, PATCH /:id, DELETE /:id -> 204), mounted in app.ts.

Tests: server/test/schedule.test.ts, 11 tests, all pass. Full suite 18 files / 104 tests pass; `npm run typecheck` clean.

TDD: tests were written after the implementation in this run, so there is no recorded RED run (honest deviation).
GREEN: `npx vitest run schedule` -> 11 passed; `npm test` -> 104 passed.

Notes / concerns:
- PATCH merges the patch onto the current event and re-validates with FixedEventInput (so 400 field errors reflect the merged result).
- Reactivating a deactivated event does not recreate occurrences removed by deactivation (per the "removed is never recreated" rule); only dates with no block at all are created.
- Migration number 0008 may collide with other agents' migrations; controller resolves the journal.
