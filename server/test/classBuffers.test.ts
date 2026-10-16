import { expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { createTestClient, type TestClient } from './helpers.js';

const TZ = 'America/Los_Angeles';
const ms = (date: string, time: string): number => zonedToUtc(date, time, TZ).getTime();
const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];

/** Mon-Fri 09:00-10:00 class plus a big study goal, then plans the week of 2026-10-19. */
async function planWithClass(buffer: { bufferBefore: number | null; bufferAfter: number | null }): Promise<Block[]> {
  const c: TestClient = await createTestClient();
  const course = await c.post('/api/courses', { name: 'Algorithms', color: '#3f51b5', weeklyGoalMinutes: 900 });
  for (let weekday = 1; weekday <= 5; weekday++) {
    const res = await c.post('/api/schedule', {
      title: 'Lecture',
      kind: 'class',
      courseId: course.body.id,
      weekday,
      startTime: '09:00',
      endTime: '10:00',
      validFrom: '2026-10-01',
      validTo: '2026-12-31',
      ...buffer,
    });
    expect(res.status).toBe(201);
  }
  const plan = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect(plan.status).toBe(201);
  return plan.body.blocks as Block[];
}

const insideAfterBuffer = (blocks: Block[], minutes: number): Block[] =>
  blocks.filter((b) =>
    WEEK.some((d) => {
      const s = new Date(b.start).getTime();
      const e = new Date(b.end).getTime();
      const from = ms(d, '10:00');
      return s < from + minutes * 60_000 && e > from;
    }),
  );

test('a class after-buffer keeps planned blocks out of the time after the class', async () => {
  // Control: with the default 15 minute class buffer the planner does use the late morning.
  const control = await planWithClass({ bufferBefore: null, bufferAfter: null });
  expect(insideAfterBuffer(control.filter((b) => b.category === 'study'), 150).length).toBeGreaterThan(0);
  expect(insideAfterBuffer(control, 15)).toEqual([]);

  const buffered = await planWithClass({ bufferBefore: null, bufferAfter: 150 });
  expect(buffered.some((b) => b.category === 'study')).toBe(true);
  expect(insideAfterBuffer(buffered, 150)).toEqual([]);
});

test('a class before-buffer keeps planned blocks out of the time before the class', async () => {
  const blocks = await planWithClass({ bufferBefore: 60, bufferAfter: null });
  const early = blocks.filter((b) =>
    WEEK.some((d) => new Date(b.start).getTime() < ms(d, '09:00') && new Date(b.end).getTime() > ms(d, '08:00')),
  );
  expect(early).toEqual([]);
});
