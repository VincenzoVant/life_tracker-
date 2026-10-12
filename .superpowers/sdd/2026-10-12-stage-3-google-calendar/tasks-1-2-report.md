# Stage 3 Tasks 1-2 report

Implemented CalendarClient interface + FakeCalendarClient (Task 1), and OAuth/token store/GoogleIntegration/real client (Task 2).

Tests: `npx vitest run calendar` 16 pass; full `npm test` 109 pass; `npm run typecheck` clean.

TDD evidence: Task 1 impl and tests were written together before the first run (RED step skipped); the first run had 1 failure (token valid-after-expiry off-by-one in the fake, fixed `<=` to `<`). Task 2 likewise ran green after writing.

Deviations / notes:
- `createFakeGoogle` lives in fakeCalendar.ts but was added in the Task 2 commit (needs GoogleIntegration type).
- `GoogleStatus` = { configured, connected, needsReconnect } (brief gave no shape); exported from shared index.
- beginAuth uses the request host (incl. port) as given for redirect_uri; the same URI is stored with the pending state and reused for the token exchange.
- needsReconnect is in-memory only.
- Added tests for the callback session exemption (middleware) and isConfigured/isConnected/client().
- web/tsconfig.tsbuildinfo got modified by the typecheck; not committed.
