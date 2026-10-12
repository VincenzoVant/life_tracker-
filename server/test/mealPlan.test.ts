import { expect, test } from 'vitest';
import { createTestClient } from './helpers.js';

const meal = { name: 'Chicken rice', kcal: 600, proteinG: 45 };

test('set/clear/list meal plan for a week', async () => {
  const c = await createTestClient();
  const m = (await c.post('/api/meals', meal)).body;
  const put = await c.put('/api/meal-plan/2026-10-14/lunch', { mealId: m.id, servings: 1 });
  expect(put.status).toBe(200);
  expect(put.body).toMatchObject({ date: '2026-10-14', slot: 'lunch', mealId: m.id, servings: 1, meal: { name: 'Chicken rice' } });
  // upsert: same slot replaces, still one row
  await c.put('/api/meal-plan/2026-10-14/lunch', { mealId: m.id, servings: 2 });
  await c.put('/api/meal-plan/2026-10-19/lunch', { mealId: m.id, servings: 1 }); // next week
  const list = (await c.get('/api/meal-plan?weekStart=2026-10-12')).body;
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ servings: 2 });
  expect((await c.del('/api/meal-plan/2026-10-14/lunch')).status).toBe(200);
  expect((await c.get('/api/meal-plan?weekStart=2026-10-12')).body).toHaveLength(0);
  expect((await c.del('/api/meal-plan/2026-10-14/lunch')).status).toBe(404);
  expect((await c.get('/api/meal-plan?weekStart=2026-10-13')).status).toBe(400);
});

test('repeat last week copies entries without overwriting', async () => {
  const c = await createTestClient();
  const a = (await c.post('/api/meals', meal)).body;
  const b = (await c.post('/api/meals', { ...meal, name: 'Oats' })).body;
  const gone = (await c.post('/api/meals', { ...meal, name: 'Old' })).body;
  await c.put('/api/meal-plan/2026-10-12/breakfast', { mealId: b.id, servings: 1 });
  await c.put('/api/meal-plan/2026-10-12/lunch', { mealId: a.id, servings: 1 });
  await c.put('/api/meal-plan/2026-10-13/dinner', { mealId: gone.id, servings: 1 });
  await c.del(`/api/meals/${gone.id}`);
  await c.put('/api/meal-plan/2026-10-19/lunch', { mealId: b.id, servings: 3 }); // already filled
  const r = await c.post('/api/meal-plan/repeat', { weekStart: '2026-10-19' });
  expect(r.body).toEqual({ copied: 1 });
  const list = (await c.get('/api/meal-plan?weekStart=2026-10-19')).body as {
    date: string;
    slot: string;
    mealId: string;
    servings: number;
  }[];
  expect(list.map((e) => [e.date, e.slot, e.mealId, e.servings])).toEqual([
    ['2026-10-19', 'breakfast', b.id, 1],
    ['2026-10-19', 'lunch', b.id, 3],
  ]);
});

test('archived meal cannot be planned (400)', async () => {
  const c = await createTestClient();
  const m = (await c.post('/api/meals', meal)).body;
  await c.del(`/api/meals/${m.id}`);
  const r = await c.put('/api/meal-plan/2026-10-14/lunch', { mealId: m.id, servings: 1 });
  expect(r.status).toBe(400);
  expect(r.body.error.fields.mealId).toBeTruthy();
});
