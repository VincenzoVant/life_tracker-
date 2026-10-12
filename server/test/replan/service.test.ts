import { expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { createBlock, getBlock, listBlocks, updateBlock } from '../../src/domains/blocks/service.js';
import { getPreferences, savePreferences } from '../../src/domains/preferences/service.js';
import { createCourse } from '../../src/domains/studies/service.js';
import type { ConflictRef, ConflictsPort } from '../../src/domains/replan/conflictsPort.js';
import {
  applyReplan, getReplanDraft, keepAsIs, quickAdd, replanFromConflict,
} from '../../src/domains/replan/service.js';
import { AppError } from '../../src/lib/errors.js';
import { createTestCtx } from '../helpers.js';

const TZ = 'America/Los_Angeles';
const iso = (date: string, time: string): string => zonedToUtc(date, time, TZ).toISOString();
// Default test clock: Wed 2026-10-14 12:00 PDT.

function setup() {
  const ctx = createTestCtx();
  const course = createCourse(ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 360 });
  return { ctx, course };
}

const study = (ctx: ReturnType<typeof createTestCtx>, courseId: string, date: string, from: string, to: string): Block =>
  createBlock(ctx, { category: 'study', title: 'Study — Algebra', start: iso(date, from), end: iso(date, to), courseId });

const evening = (date = '2026-10-15') => ({
  title: 'Drinks',
  category: 'social' as const,
  when: { start: iso(date, '18:00'), durationMinutes: 120 },
});

const overlapsTrigger = (b: Block, date: string): boolean => b.start < iso(date, '20:00') && b.end > iso(date, '18:00');

function fakeConflicts(list: ConflictRef[]) {
  const calls: string[] = [];
  const port: ConflictsPort = {
    listConflicts: () => list.filter((c) => c.status === 'open'),
    dismissConflict: (_c, id) => void calls.push(`dismiss:${id}`),
    markConflictReplanned: (_c, id) => void calls.push(`replanned:${id}`),
  };
  return { port, calls };
}

test('quickAdd creates locked quick_add committed block and a replan draft with moved study block', () => {
  const { ctx, course } = setup();
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const r = quickAdd(ctx, evening());
  expect(r.block).toMatchObject({ source: 'quick_add', status: 'committed', locked: true, category: 'social', title: 'Drinks' });
  expect(r.draft).not.toBeNull();
  expect(r.draft!.plan).toMatchObject({ mode: 'replan', status: 'draft', triggerBlockId: r.block.id, weekStart: '2026-10-12' });
  const ch = r.draft!.changes.find((c) => c.blockId === s.id)!;
  expect(ch.type).toBe('moved');
  expect(ch.category).toBe('study');
  expect(ch.from).toEqual({ start: s.start, end: s.end });
  expect(ch.to!.start >= iso('2026-10-15', '20:00') || ch.to!.end <= iso('2026-10-15', '18:00')).toBe(true);
  expect(getReplanDraft(ctx, r.draft!.plan.id).changes).toEqual(r.draft!.changes);
  expect(getBlock(ctx, s.id)).toEqual(s); // nothing applied yet
});

test('quickAdd overlapping nothing movable returns draft null and writes no plan', () => {
  const { ctx, course } = setup();
  study(ctx, course.id, '2026-10-16', '18:30', '20:00');
  const r = quickAdd(ctx, evening());
  expect(r.draft).toBeNull();
  expect(r.block.locked).toBe(true);
  expect(ctx.sqlite.prepare('select count(*) as n from plans').get()).toEqual({ n: 0 });
});

test('apply moves blocks, removes unplaceable ones, creates added ones, marks plan applied, emits bus events', () => {
  const { ctx, course } = setup();
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const rest = createBlock(ctx, { category: 'rest', title: 'Nap', start: iso('2026-10-15', '18:30'), end: iso('2026-10-15', '19:00') });
  const r = quickAdd(ctx, evening());
  expect(r.draft!.changes.find((c) => c.blockId === rest.id)!.type).toBe('removed');
  const events: string[] = [];
  ctx.events.subscribe((e) => events.push(`${e.kind}:${e.blockId}`));
  const out = applyReplan(ctx, r.draft!.plan.id);
  expect(out.plan.status).toBe('applied');
  const moved = getBlock(ctx, s.id);
  expect(moved.start).not.toBe(s.start);
  expect(moved.status).toBe('committed');
  expect(overlapsTrigger(moved, '2026-10-15')).toBe(false);
  expect(getBlock(ctx, rest.id).status).toBe('removed');
  expect(events).toContain(`updated:${s.id}`);
  expect(events).toContain(`removed:${rest.id}`);
  for (const c of r.draft!.changes.filter((x) => x.type === 'added')) {
    const b = listBlocks(ctx, { from: new Date(c.to!.start), to: new Date(c.to!.end) }).find((x) => x.planId === out.plan.id);
    expect(b).toMatchObject({ source: 'planner', status: 'committed' });
  }
  expect(() => applyReplan(ctx, r.draft!.plan.id)).toThrow(AppError);
});

test('apply creates added blocks as committed planner blocks linked to the plan', () => {
  const { ctx, course } = setup();
  // Blocks are capped at 60 min, so the displaced 2 h of study comes back as one moved block plus one added block.
  savePreferences(ctx, { ...getPreferences(ctx), studyBlock: { min: 45, max: 60 } });
  study(ctx, course.id, '2026-10-15', '19:00', '21:00');
  const r = quickAdd(ctx, { title: 'Party', category: 'social', when: { start: iso('2026-10-15', '19:00'), durationMinutes: 270 } });
  const out = applyReplan(ctx, r.draft!.plan.id);
  const added = r.draft!.changes.filter((c) => c.type === 'added');
  expect(added.length).toBeGreaterThan(0);
  expect(out.blocks.filter((b) => b.planId === out.plan.id)).toHaveLength(added.length);
  for (const b of out.blocks.filter((x) => x.planId === out.plan.id)) {
    expect(b).toMatchObject({ source: 'planner', status: 'committed', category: 'study', courseId: course.id });
  }
});

test('apply after a basis block changed → 409 with exact stale message, nothing changed', () => {
  const { ctx, course } = setup();
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const other = study(ctx, course.id, '2026-10-17', '10:00', '11:00');
  const r = quickAdd(ctx, evening());
  ctx.clock.set('2026-10-14T19:05:00.000Z');
  updateBlock(ctx, other.id, { title: 'Study — Algebra II' });
  let err: AppError | undefined;
  try {
    applyReplan(ctx, r.draft!.plan.id);
  } catch (e) {
    err = e as AppError;
  }
  expect(err).toMatchObject({ code: 'CONFLICT', status: 409, message: 'Your week changed since this replan — please replan again' });
  expect(getBlock(ctx, s.id)).toEqual(s);
  expect(getReplanDraft(ctx, r.draft!.plan.id).plan.status).toBe('draft');
});

test('a later quick-add that finds nothing to move still discards the earlier open draft', () => {
  const { ctx, course } = setup();
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const a = quickAdd(ctx, evening());
  expect(a.draft).not.toBeNull();
  const b = quickAdd(ctx, { title: 'Late drinks', category: 'social', when: { start: iso('2026-10-15', '21:00'), durationMinutes: 120 } });
  expect(b.draft).toBeNull();
  expect(getReplanDraft(ctx, a.draft!.plan.id).plan.status).toBe('discarded');
  expect(() => applyReplan(ctx, a.draft!.plan.id)).toThrow(AppError);
  expect(getBlock(ctx, s.id)).toEqual(s);
});

test('keepAsIs discards plan and keeps quick-add block', () => {
  const { ctx, course } = setup();
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const r = quickAdd(ctx, evening());
  const plan = keepAsIs(ctx, r.draft!.plan.id);
  expect(plan.status).toBe('discarded');
  expect(getBlock(ctx, r.block.id).status).toBe('committed');
  expect(getBlock(ctx, s.id)).toEqual(s);
  expect(() => applyReplan(ctx, plan.id)).toThrow(/already discarded/);
});

test('second quickAdd in same week discards first draft', () => {
  const { ctx, course } = setup();
  study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const a = quickAdd(ctx, evening());
  const b = quickAdd(ctx, { ...evening(), title: 'More drinks' });
  expect(b.draft).not.toBeNull();
  expect(getReplanDraft(ctx, a.draft!.plan.id).plan.status).toBe('discarded');
  expect(getReplanDraft(ctx, b.draft!.plan.id).plan.status).toBe('draft');
});

test('quick-add for next Tuesday replans next week only, from its Monday', () => {
  const { ctx, course } = setup();
  const thisWeek = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const nextMon = study(ctx, course.id, '2026-10-19', '10:00', '11:00');
  const nextTue = study(ctx, course.id, '2026-10-20', '18:30', '20:00');
  const r = quickAdd(ctx, evening('2026-10-20'));
  expect(r.draft!.plan.weekStart).toBe('2026-10-19');
  const ids = r.draft!.changes.map((c) => c.blockId);
  expect(ids).toContain(nextTue.id);
  expect(ids).not.toContain(thisWeek.id);
  expect(ids).not.toContain(nextMon.id);
  for (const c of r.draft!.changes) if (c.to) expect(c.to.start >= iso('2026-10-19', '00:00')).toBe(true);
});

test('replanFromConflict uses conflict interval; apply marks conflict replanned; keep dismisses it', () => {
  const { ctx, course } = setup();
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const conflict: ConflictRef = {
    id: 'c1', title: 'Dentist', start: iso('2026-10-15', '18:00'), end: iso('2026-10-15', '20:00'), status: 'open',
  };
  const { port, calls } = fakeConflicts([conflict, { ...conflict, id: 'c2', status: 'dismissed' }]);

  const draft = replanFromConflict(ctx, 'c1', port)!;
  expect(draft.plan.summary.conflictId).toBe('c1');
  expect(draft.plan.triggerBlockId).toBeNull();
  expect(draft.changes.map((c) => c.blockId)).toContain(s.id);
  expect(() => replanFromConflict(ctx, 'c2', port)).toThrow(AppError);

  applyReplan(ctx, draft.plan.id, port);
  expect(calls).toEqual(['replanned:c1']);

  study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const second = replanFromConflict(ctx, 'c1', port)!;
  keepAsIs(ctx, second.plan.id, port);
  expect(calls).toEqual(['replanned:c1', 'dismiss:c1']);
});

test('manual appointment/social/errand/work/other blocks are frozen: replan never moves or removes them', () => {
  const { ctx, course } = setup();
  const cats = ['appointment', 'social', 'errand', 'work', 'other'] as const;
  const frozen = cats.map((category, i) =>
    createBlock(ctx, { category, title: category, start: iso('2026-10-15', `18:${i}0`), end: iso('2026-10-15', `19:${i}0`) }),
  );
  const s = study(ctx, course.id, '2026-10-15', '18:30', '20:00');
  const r = quickAdd(ctx, evening());
  const touched = (r.draft?.changes ?? []).map((c) => c.blockId);
  for (const f of frozen) expect(touched).not.toContain(f.id);
  expect(touched).toContain(s.id);
});
