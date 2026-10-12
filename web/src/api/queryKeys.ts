/** Single source of truth for TanStack Query keys. The first element is the family used for invalidation. */
export const qk = {
  blocks: (from: string, to: string) => ['blocks', from, to] as const,
  progress: (weekStart: string, includeProposed: boolean) => ['progress', weekStart, includeProposed] as const,
  review: (date: string) => ['review', date] as const,
  courses: (includeArchived: boolean) => ['courses', includeArchived] as const,
  startupTasks: () => ['startup', 'tasks'] as const,
  startupMilestones: () => ['startup', 'milestones'] as const,
  workoutSessions: (from: string, to: string) => ['workouts', 'sessions', from, to] as const,
  lifts: () => ['workouts', 'lifts'] as const,
  liftHistory: (liftId: string) => ['workouts', 'lift', liftId] as const,
  meals: (includeArchived: boolean) => ['food', 'meals', includeArchived] as const,
  mealLogs: (date: string) => ['food', 'logs', date] as const,
  mealPlan: (weekStart: string) => ['food', 'plan', weekStart] as const,
  planDraft: (weekStart: string) => ['plans', 'draft', weekStart] as const,
  goals: () => ['goals'] as const,
  preferences: () => ['preferences'] as const,
} as const;

export type QueryFamily = 'blocks' | 'progress' | 'review' | 'courses' | 'startup' | 'workouts' | 'food' | 'goals' | 'preferences' | 'plans' | 'conflicts' | 'sync';
