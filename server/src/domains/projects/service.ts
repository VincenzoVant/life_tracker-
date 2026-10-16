import { asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  ProjectInput,
  ProjectUpdateInput,
  blockMinutes,
  weekRangeUtc,
  type Project,
  type ProjectPriority,
  type ProjectKind,
  type ProjectWithProgress,
  type TimeWindow,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { courses, projects } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { listBlocks } from '../blocks/service.js';
import { getTimezone } from '../settings/service.js';

type Row = typeof projects.$inferSelect;

const PLANNED_STATUSES = new Set(['committed', 'done', 'partial', 'skipped']);
const DONE_STATUSES = new Set(['done', 'partial']);

const toProject = (r: Row): Project => ({
  ...r,
  kind: r.kind as ProjectKind,
  windows: JSON.parse(r.windows) as TimeWindow[],
  priority: r.priority as ProjectPriority,
});

function assertCourseExists(ctx: Ctx, courseId: string | null): void {
  if (courseId && !ctx.db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).get()) {
    throw new AppError('VALIDATION', 'Invalid input', { courseId: 'Unknown course' });
  }
}

function getRow(ctx: Ctx, id: string): Row {
  const row = ctx.db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) throw notFound('Project');
  return row;
}

export const getProject = (ctx: Ctx, id: string): Project => toProject(getRow(ctx, id));

/** Active projects that apply to the week: every-week ones plus that week's one-offs. Highest priority first. */
export function projectsForWeek(ctx: Ctx, weekStart: string): Project[] {
  return ctx.db
    .select()
    .from(projects)
    .orderBy(asc(projects.priority), asc(projects.title), asc(projects.id))
    .all()
    .filter((r) => r.active && (r.weekStart === null || r.weekStart === weekStart))
    .map(toProject);
}

/** Planned (committed, done, partial, skipped) and done minutes come from the week's blocks linked to each project. */
export function listProjects(ctx: Ctx, weekStart: string): ProjectWithProgress[] {
  const list = projectsForWeek(ctx, weekStart);
  const range = weekRangeUtc(weekStart, getTimezone(ctx));
  const linked = listBlocks(ctx, { from: range.start, to: range.end }).filter((b) => {
    const s = new Date(b.start).getTime();
    return b.projectId && s >= range.start.getTime() && s < range.end.getTime();
  });
  return list.map((p) => {
    const bs = linked.filter((b) => b.projectId === p.id);
    return {
      ...p,
      plannedMinutes: bs.filter((b) => PLANNED_STATUSES.has(b.status) && b.source !== 'unplanned').reduce((n, b) => n + blockMinutes(b), 0),
      doneMinutes: bs.filter((b) => DONE_STATUSES.has(b.status)).reduce((n, b) => n + (b.actualMinutes ?? 0), 0),
    };
  });
}

function toRow(v: ReturnType<typeof ProjectInput.parse>): Omit<Row, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: v.title,
    kind: v.kind,
    courseId: v.kind === 'study' ? (v.courseId ?? null) : null,
    weeklyMinutes: v.weeklyMinutes,
    weekStart: v.weekStart ?? null,
    windows: JSON.stringify(v.windows),
    blockMin: v.blockMin,
    blockMax: v.blockMax,
    priority: v.priority,
    active: v.active,
  };
}

export function createProject(ctx: Ctx, input: ProjectInput): Project {
  const v = parse(ProjectInput, input);
  assertCourseExists(ctx, v.courseId ?? null);
  const now = ctx.clock.now().toISOString();
  const row: Row = { id: ulid(), ...toRow(v), createdAt: now, updatedAt: now };
  ctx.db.insert(projects).values(row).run();
  return toProject(row);
}

export function updateProject(ctx: Ctx, id: string, input: ProjectUpdateInput): Project {
  const patch = parse(ProjectUpdateInput, input);
  const cur = getProject(ctx, id);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const merged = { ...cur, ...defined };
  // Switching away from study drops the course instead of failing on it.
  if (patch.kind && patch.kind !== 'study' && patch.courseId === undefined) merged.courseId = null;
  const v = parse(ProjectInput, {
    title: merged.title,
    kind: merged.kind,
    courseId: merged.courseId,
    weeklyMinutes: merged.weeklyMinutes,
    weekStart: merged.weekStart,
    windows: merged.windows,
    blockMin: merged.blockMin,
    blockMax: merged.blockMax,
    priority: merged.priority,
    active: merged.active,
  });
  if ((v.courseId ?? null) !== cur.courseId) assertCourseExists(ctx, v.courseId ?? null);
  const next = { ...toRow(v), updatedAt: ctx.clock.now().toISOString() };
  ctx.db.update(projects).set(next).where(eq(projects.id, id)).run();
  return getProject(ctx, id);
}

/** Linked blocks keep their history; the FK sets their projectId to null. */
export function deleteProject(ctx: Ctx, id: string): Project {
  const cur = getProject(ctx, id);
  ctx.db.delete(projects).where(eq(projects.id, id)).run();
  return cur;
}
