import { expect, test } from 'vitest';
import { ReviewSubmission, type BlockCreateInput, type BlockStatus } from '@life-tracker/shared';
import { createBlock, getBlock } from '../src/domains/blocks/service.js';
import { archiveMeal, createMeal, listMealLogs } from '../src/domains/food/service.js';
import { setMealPlanEntry } from '../src/domains/mealPlan/service.js';
import { getPendingReview, submitReview } from '../src/domains/review/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

// America/Los_Angeles is UTC-7 all week; today = Wed 2026-10-14.
const utc = (date: string, hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCHours(h! + 7, m!);
  return d.toISOString();
};

function add(
  ctx: ReturnType<typeof createTestCtx>,
  input: Partial<BlockCreateInput> & { category: BlockCreateInput['category'] },
  date: string,
  from: string,
  mins: number,
  status: BlockStatus = 'committed',
) {
  const start = utc(date, from);
  const end = new Date(new Date(start).getTime() + mins * 60_000).toISOString();
  return createBlock(ctx, { title: 'b', ...input, start, end } as BlockCreateInput, { status });
}

test('A3: a review submission may carry 201 entries', () => {
  const entries = Array.from({ length: 201 }, (_, i) => ({ blockId: `b${i}`, outcome: 'skipped' as const }));
  expect(ReviewSubmission.safeParse({ date: '2026-10-14', entries }).success).toBe(true);
});

test('A3: pending review only lists unreviewed blocks from the last 14 days', () => {
  const ctx = createTestCtx();
  const old = add(ctx, { category: 'work' }, '2026-09-24', '09:00', 60); // 20 days ago
  const recent = add(ctx, { category: 'work' }, '2026-10-02', '09:00', 60); // 12 days ago
  const ids = getPendingReview(ctx, '2026-10-14').pending.map((b) => b.id);
  expect(ids).toContain(recent.id);
  expect(ids).not.toContain(old.id);
});

test('A-m: archived planned meal + ateAsPlanned neither logs nor fails; no plannedMeal offered', () => {
  const ctx = createTestCtx();
  const m = createMeal(ctx, { name: 'Old dish', kcal: 500, proteinG: 30 });
  setMealPlanEntry(ctx, '2026-10-14', 'lunch', { mealId: m.id, servings: 1 });
  const b = add(ctx, { category: 'meal', mealSlot: 'lunch' }, '2026-10-14', '12:30', 30);
  archiveMeal(ctx, m.id);
  expect(getPendingReview(ctx, '2026-10-14').pending[0]!.plannedMeal).toBeUndefined();
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: b.id, outcome: 'done', ateAsPlanned: true }] });
  expect(getBlock(ctx, b.id).status).toBe('done');
  expect(listMealLogs(ctx, '2026-10-14')).toHaveLength(0);
});

test('A-m: re-reviewing a meal from done (ateAsPlanned) to skipped removes the log the review created', () => {
  const ctx = createTestCtx();
  const m = createMeal(ctx, { name: 'Chicken rice', kcal: 600, proteinG: 45 });
  setMealPlanEntry(ctx, '2026-10-14', 'lunch', { mealId: m.id, servings: 1 });
  const b = add(ctx, { category: 'meal', mealSlot: 'lunch' }, '2026-10-14', '12:30', 30);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: b.id, outcome: 'done', ateAsPlanned: true }] });
  expect(listMealLogs(ctx, '2026-10-14')).toHaveLength(1);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: b.id, outcome: 'skipped' }] });
  expect(listMealLogs(ctx, '2026-10-14')).toHaveLength(0);
});

test('A-m: impossible dates give 400, not 500', async () => {
  const c = await createTestClient();
  expect((await c.get('/api/review?date=2026-13-45')).status).toBe(400);
  expect((await c.get('/api/progress/week?weekStart=2026-13-45')).status).toBe(400);
  expect((await c.get('/api/plans/draft?weekStart=2026-02-30')).status).toBe(400);
});
