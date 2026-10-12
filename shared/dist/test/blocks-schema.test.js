import { expect, test } from 'vitest';
import { BlockCreateInput, BlockUpdateInput, blockMinutes } from '../src/index.js';
const base = { category: 'rest', title: 'x', start: '2026-10-14T19:00:00.000Z', end: '2026-10-14T20:00:00.000Z' };
test('rejects end before start with field error', () => {
    const r = BlockCreateInput.safeParse({ ...base, start: '2026-10-14T20:00:00.000Z', end: '2026-10-14T19:00:00.000Z' });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['end']);
    expect(r.error.issues[0].message).toBe('End must be after start');
});
test('rejects blocks longer than 24h', () => {
    expect(BlockCreateInput.safeParse({ ...base, end: '2026-10-15T19:00:01.000Z' }).success).toBe(false);
    expect(BlockCreateInput.safeParse({ ...base, end: '2026-10-15T19:00:00.000Z' }).success).toBe(true);
});
test('workout requires workoutType; meal requires mealSlot; links only on their category', () => {
    expect(BlockCreateInput.safeParse({ ...base, category: 'workout' }).error.issues[0].path).toEqual(['workoutType']);
    expect(BlockCreateInput.safeParse({ ...base, category: 'meal' }).error.issues[0].path).toEqual(['mealSlot']);
    expect(BlockCreateInput.safeParse({ ...base, courseId: 'c1' }).error.issues[0].path).toEqual(['courseId']);
    expect(BlockCreateInput.safeParse({ ...base, startupTaskId: 't1' }).error.issues[0].path).toEqual(['startupTaskId']);
    expect(BlockCreateInput.safeParse({ ...base, workoutType: 'gym' }).error.issues[0].path).toEqual(['workoutType']);
    expect(BlockCreateInput.safeParse({ ...base, mealSlot: 'lunch' }).error.issues[0].path).toEqual(['mealSlot']);
    expect(BlockCreateInput.safeParse({ ...base, category: 'study', courseId: 'c1' }).success).toBe(true);
});
test('title is trimmed and length-limited', () => {
    expect(BlockCreateInput.parse({ ...base, title: '  Walk ' }).title).toBe('Walk');
    expect(BlockCreateInput.safeParse({ ...base, title: '   ' }).success).toBe(false);
    expect(BlockCreateInput.safeParse({ ...base, title: 'a'.repeat(121) }).success).toBe(false);
    expect(BlockCreateInput.safeParse({ ...base, notes: 'a'.repeat(2001) }).success).toBe(false);
});
test('update accepts partials and checks times when both given', () => {
    expect(BlockUpdateInput.safeParse({ title: 'New' }).success).toBe(true);
    expect(BlockUpdateInput.safeParse({ start: '2026-10-14T21:00:00.000Z', end: '2026-10-14T20:00:00.000Z' }).success).toBe(false);
    expect(BlockUpdateInput.safeParse({ category: 'rest', courseId: 'c1' }).success).toBe(false);
});
test('blockMinutes', () => {
    expect(blockMinutes({ start: '2026-10-14T19:00:00.000Z', end: '2026-10-14T20:30:00.000Z' })).toBe(90);
});
