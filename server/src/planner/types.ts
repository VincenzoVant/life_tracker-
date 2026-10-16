import type { BlockSource, Category, MealSlot, Preferences, TimeWindow, WorkoutType } from '@life-tracker/shared';

/** Epoch milliseconds, UTC. */
export type Ms = number;

export interface Interval {
  start: Ms;
  end: Ms;
}

/**
 * Minutes kept free before/after a block. Missing sides fall back to prefs.bufferMinutes. Two neighbours are kept
 * apart by the larger of the facing sides, so bufferMinutes is the minimum gap and class/workout buffers widen it.
 */
export interface Pads {
  padBefore?: number;
  padAfter?: number;
}

/** An already-occupied block (committed, fixed, ...) the planner must work around. */
export interface PlannerBlockRef extends Interval, Pads {
  category: Category;
  source: BlockSource;
  courseId?: string | null;
  workoutType?: WorkoutType | null;
  mealSlot?: MealSlot | null;
  projectId?: string | null;
}

export interface BusyRef extends Interval {
  title: string;
}

export type PlannerGoal =
  | { kind: 'study'; courseId: string; courseName: string; minutes: number }
  | { kind: 'startup'; minutes: number }
  | { kind: 'workout'; workoutType: WorkoutType; count: number }
  | { kind: 'free_evenings'; count: number }
  | {
      kind: 'project';
      projectId: string;
      title: string;
      category: Category;
      minutes: number;
      /** Preferred (soft) times. */
      windows: TimeWindow[];
      block: { min: number; max: number };
      /** 1 high, 2 normal, 3 low. */
      priority: number;
      courseId?: string;
    };

export interface PlannerInput {
  range: Interval;
  timezone: string;
  prefs: Preferences;
  existing: PlannerBlockRef[];
  busy: BusyRef[];
  goals: PlannerGoal[];
  startupTasks: { id: string; title: string }[];
}

export interface ProposedBlock extends Interval, Pads {
  category: Category;
  title: string;
  courseId?: string;
  startupTaskId?: string;
  projectId?: string;
  workoutType?: WorkoutType;
  mealSlot?: MealSlot;
}

/** `missing` is in the goal's own unit: minutes, or a count. */
export interface Shortfall {
  goal: PlannerGoal;
  missing: number;
}

export interface PlannerOutput {
  blocks: ProposedBlock[];
  shortfalls: Shortfall[];
  reservedEvenings: string[];
}
