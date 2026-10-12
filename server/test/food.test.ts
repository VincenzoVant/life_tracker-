import { expect, test } from 'vitest';
import { dailyTotals, listMealLogs, logMeal } from '../src/domains/food/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

const meal = { name: 'Chicken rice', kcal: 600, proteinG: 45, carbsG: 70, fatG: 10 };

test('logging a saved meal copies nutrition × servings', async () => {
  const c = await createTestClient();
  const m = await c.post('/api/meals', meal);
  expect(m.status).toBe(201);
  const l = await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'lunch', mealId: m.body.id, servings: 1.5 });
  expect(l.status).toBe(201);
  expect(l.body).toMatchObject({ kcal: 900, proteinG: 67.5, carbsG: 105, fatG: 15, servings: 1.5, mealId: m.body.id, freeText: null });
  expect((await c.get('/api/meal-logs?date=2026-10-14')).body).toHaveLength(1);
  expect((await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'lunch', mealId: m.body.id, servings: 0 })).status).toBe(400);
  expect((await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'lunch', mealId: m.body.id, servings: 21 })).status).toBe(400);
});

test('editing or archiving the meal does not change past logs', async () => {
  const c = await createTestClient();
  const m = await c.post('/api/meals', meal);
  const l = await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'lunch', mealId: m.body.id, servings: 1.5 });
  expect((await c.patch(`/api/meals/${m.body.id}`, { kcal: 700 })).body.kcal).toBe(700);
  expect((await c.del(`/api/meals/${m.body.id}`)).status).toBe(200);
  const logs = (await c.get('/api/meal-logs?date=2026-10-14')).body;
  expect(logs[0]).toMatchObject({ id: l.body.id, kcal: 900, mealId: m.body.id });
});

test('archived meals hidden from library and cannot be newly logged', async () => {
  const c = await createTestClient();
  const m = await c.post('/api/meals', meal);
  await c.del(`/api/meals/${m.body.id}`);
  expect((await c.get('/api/meals')).body).toHaveLength(0);
  const all = await c.get('/api/meals?includeArchived=true');
  expect(all.body).toHaveLength(1);
  expect(all.body[0].archived).toBe(true);
  const r = await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'dinner', mealId: m.body.id, servings: 1 });
  expect(r.status).toBe(400);
  expect(r.body.error.fields.mealId).toBeTruthy();
});

test('free-text log', async () => {
  const c = await createTestClient();
  const r = await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'snack', freeText: 'Protein bar', kcal: 200, proteinG: 20 });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ mealId: null, freeText: 'Protein bar', servings: 1, kcal: 200, proteinG: 20, carbsG: null, fatG: null });
  expect((await c.del(`/api/meal-logs/${r.body.id}`)).status).toBe(200);
  expect((await c.del(`/api/meal-logs/${r.body.id}`)).status).toBe(404);
  expect((await c.post('/api/meal-logs', { date: '2026-10-14', slot: 'snack', freeText: '', kcal: 1, proteinG: 1 })).status).toBe(400);
});

test('dailyTotals returns zeros for empty days', () => {
  const ctx = createTestCtx();
  logMeal(ctx, { date: '2026-10-14', slot: 'snack', freeText: 'a', kcal: 200, proteinG: 20, carbsG: 5 });
  logMeal(ctx, { date: '2026-10-14', slot: 'lunch', freeText: 'b', kcal: 300, proteinG: 10 });
  const t = dailyTotals(ctx, ['2026-10-13', '2026-10-14']);
  expect(t['2026-10-13']).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  expect(t['2026-10-14']).toEqual({ kcal: 500, proteinG: 30, carbsG: 5, fatG: 0 });
  expect(listMealLogs(ctx, '2026-10-14')).toHaveLength(2);
});

test('PATCH with null clears optional meal fields', async () => {
  const c = await createTestClient();
  const m = await c.post('/api/meals', { ...meal, notes: 'tasty' });
  const upd = await c.patch(`/api/meals/${m.body.id}`, { carbsG: null, fatG: null, notes: null });
  expect(upd.status).toBe(200);
  expect(upd.body).toMatchObject({ carbsG: null, fatG: null, notes: null, kcal: 600 });
});
