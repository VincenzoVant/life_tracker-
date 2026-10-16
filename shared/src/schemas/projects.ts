import { z } from 'zod';
import type { Category } from '../categories.js';
import { isoWeekday } from '../time.js';
import { LocalDate } from './localDate.js';
import { TimeWindowSchema, type TimeWindow } from './preferences.js';

export const PROJECT_KINDS = ['study', 'startup', 'fun', 'relax', 'other'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/** The block category a project's planned blocks get. */
export const PROJECT_KIND_CATEGORY: Record<ProjectKind, Category> = {
  study: 'study',
  startup: 'startup',
  fun: 'other',
  relax: 'rest',
  other: 'other',
};

export const PROJECT_PRIORITIES = [1, 2, 3] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

/** Something to make time for in a week (Areas → This week). `weekStart` null = every week. */
export interface Project {
  id: string;
  title: string;
  kind: ProjectKind;
  courseId: string | null;
  weeklyMinutes: number;
  weekStart: string | null;
  windows: TimeWindow[];
  blockMin: number;
  blockMax: number;
  priority: ProjectPriority;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A project as listed for one week, with that week's planned and done minutes from its linked blocks. */
export interface ProjectWithProgress extends Project {
  plannedMinutes: number;
  doneMinutes: number;
}

const Monday = LocalDate.refine((d) => isoWeekday(d) === 1, 'Must be a Monday');
const quarter = (min: number, max: number) =>
  z.number().int().min(min, `Must be at least ${min} minutes`).max(max, `Must be at most ${max} minutes`).multipleOf(15, 'Use steps of 15 minutes');

const projectFields = {
  title: z.string().trim().min(1, 'Title is required').max(80, 'Title is too long'),
  kind: z.enum(PROJECT_KINDS),
  courseId: z.string().min(1).nullish(),
  weeklyMinutes: quarter(15, 6000),
  weekStart: Monday.nullish(),
  windows: z.array(TimeWindowSchema),
  blockMin: quarter(15, 480),
  blockMax: quarter(15, 480),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  active: z.boolean(),
};

type Refinable = {
  kind?: ProjectKind;
  courseId?: string | null;
  windows?: { start: string; end: string }[];
  blockMin?: number;
  blockMax?: number;
};

function refineProject(v: Refinable, ctx: z.RefinementCtx): void {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (v.kind === 'study' && !v.courseId) add(['courseId'], 'Pick a course for a study project');
  if (v.kind !== undefined && v.kind !== 'study' && v.courseId) add(['courseId'], 'Course is only allowed on study projects');
  if (v.blockMin !== undefined && v.blockMax !== undefined && v.blockMin > v.blockMax) {
    add(['blockMin'], 'Shortest block must not be longer than the longest');
  }
  v.windows?.forEach((w, i) => {
    if (w.start >= w.end) add(['windows', i, 'start'], 'start must be before end');
  });
}

export const ProjectInput = z
  .object({
    ...projectFields,
    windows: projectFields.windows.default([]),
    blockMin: projectFields.blockMin.default(60),
    blockMax: projectFields.blockMax.default(120),
    priority: projectFields.priority.default(2),
    active: projectFields.active.default(true),
  })
  .superRefine((v, ctx) => refineProject(v, ctx));
export type ProjectInput = z.input<typeof ProjectInput>;

/** Partial patch; the server re-checks the merged project with `ProjectInput`. */
export const ProjectUpdateInput = z
  .object(projectFields)
  .partial()
  .superRefine((v, ctx) => refineProject({ windows: v.windows, blockMin: v.blockMin, blockMax: v.blockMax }, ctx));
export type ProjectUpdateInput = z.input<typeof ProjectUpdateInput>;

export const ProjectListQuery = z.object({ weekStart: Monday });
export type ProjectListQuery = z.infer<typeof ProjectListQuery>;
