import { expect, test } from 'vitest';
import { computePRs, epley1rm } from '../src/domains/workouts/prs.js';
let n = 0;
const set = (weightKg, reps, date) => ({
    id: `s${n++}`,
    liftId: 'l',
    date,
    weightKg,
    reps,
    notes: null,
});
test('epley', () => {
    expect(epley1rm(100, 3)).toBe(110);
    expect(epley1rm(80, 10)).toBe(106.7);
});
test('computePRs picks heaviest and best e1rm separately', () => {
    const sets = [set(100, 3, '2026-09-01'), set(105, 1, '2026-09-08'), set(90, 8, '2026-09-15')];
    const p = computePRs(sets);
    expect(p.heaviest.weightKg).toBe(105);
    expect(p.bestE1rm.value).toBe(114);
});
test('computePRs of empty is nulls', () => {
    expect(computePRs([])).toEqual({ heaviest: null, bestE1rm: null });
});
test('heaviest tie: more reps wins, then earlier date', () => {
    const a = set(100, 3, '2026-09-10');
    const b = set(100, 5, '2026-09-12');
    const c = set(100, 5, '2026-09-01');
    expect(computePRs([a, b]).heaviest).toBe(b);
    expect(computePRs([b, c, a]).heaviest).toBe(c);
});
