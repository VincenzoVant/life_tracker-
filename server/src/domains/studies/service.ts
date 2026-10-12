import { asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { CourseInput, CourseUpdateInput, type Course } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { courses } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

type Row = typeof courses.$inferSelect;

const toCourse = (r: Row): Course => r;

function assertNameFree(ctx: Ctx, name: string, exceptId?: string): void {
  const dup = ctx.db.select().from(courses).where(eq(courses.name, name)).all()
    .find((r) => r.active && r.id !== exceptId);
  if (dup) throw new AppError('CONFLICT', 'A course with this name already exists');
}

export function listCourses(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Course[] {
  const rows = ctx.db.select().from(courses).orderBy(asc(courses.name), asc(courses.id)).all();
  return rows.filter((r) => opts.includeArchived || r.active).map(toCourse);
}

export function getCourse(ctx: Ctx, id: string): Course {
  const row = ctx.db.select().from(courses).where(eq(courses.id, id)).get();
  if (!row) throw notFound('Course');
  return toCourse(row);
}

export function createCourse(ctx: Ctx, input: CourseInput): Course {
  const v = parse(CourseInput, input);
  assertNameFree(ctx, v.name);
  const now = ctx.clock.now().toISOString();
  const row: Row = { id: ulid(), ...v, active: true, createdAt: now, updatedAt: now };
  ctx.db.insert(courses).values(row).run();
  return toCourse(row);
}

export function updateCourse(ctx: Ctx, id: string, input: CourseUpdateInput): Course {
  const patch = parse(CourseUpdateInput, input);
  const cur = getCourse(ctx, id);
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Course;
  if (next.active) assertNameFree(ctx, next.name, id);
  next.updatedAt = ctx.clock.now().toISOString();
  ctx.db.update(courses).set(next).where(eq(courses.id, id)).run();
  return next;
}

export function archiveCourse(ctx: Ctx, id: string): Course {
  return updateCourse(ctx, id, { active: false });
}
