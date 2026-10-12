# Task 11 report: Daily review (server)
Implemented: daily_reviews table + migration 0008, shared/src/schemas/review.ts, server/src/domains/review/{service,routes}.ts, app.ts route /api/review, server/test/review.test.ts (17 tests), min(600) cap in upsertSessionForBlock.
Tests: npm test 110 passed (18 files); npm run typecheck clean.
TDD: tests were written after the implementation in this run (no separate RED run); all pass on first run.
Decisions: partial minutes validated up front (1..blockMinutes, integers) with fields["entries.<i>.actualMinutes"] before any write; duplicate blockIds rejected (entries.<i>.blockId); unplanned actualMinutes validated 1..duration (unplanned.<i>.actualMinutes); completeStartupTask ignored for skipped; workout session upserted with entry.workout ?? {}; unknown block -> 404 and whole tx rolls back; all writes in ctx.sqlite.transaction.
Concerns: migration number 0008 may collide with parallel agents' migrations (needs renumber/regenerate on merge).
