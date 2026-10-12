import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});
export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(), // sha256 hex of the session token
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
});
export const courses = sqliteTable('courses', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    weeklyGoalMinutes: integer('weekly_goal_minutes').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
}, (t) => [uniqueIndex('courses_active_name_uq').on(t.name).where(sql `${t.active} = 1`)]);
export const startupMilestones = sqliteTable('startup_milestones', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    targetDate: text('target_date'),
    doneAt: text('done_at'),
    sortOrder: integer('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});
export const startupTasks = sqliteTable('startup_tasks', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    status: text('status').notNull(), // todo | doing | done
    milestoneId: text('milestone_id').references(() => startupMilestones.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull(),
    doneAt: text('done_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});
export const blocks = sqliteTable('blocks', {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    status: text('status').notNull(),
    actualMinutes: integer('actual_minutes'),
    source: text('source').notNull(),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    startupTaskId: text('startup_task_id').references(() => startupTasks.id, { onDelete: 'set null' }),
    workoutType: text('workout_type'),
    mealSlot: text('meal_slot'),
    fixedEventId: text('fixed_event_id'),
    planId: text('plan_id'),
    gcalEventId: text('gcal_event_id'),
    gcalEtag: text('gcal_etag'),
    gcalSyncedAt: text('gcal_synced_at'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
}, (t) => [index('blocks_start_idx').on(t.start), index('blocks_fixed_event_idx').on(t.fixedEventId)]);
export const workoutSessions = sqliteTable('workout_sessions', {
    id: text('id').primaryKey(),
    blockId: text('block_id').references(() => blocks.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    date: text('date').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    intensity: integer('intensity'),
    notes: text('notes'),
    gymFocus: text('gym_focus'),
    cardioKind: text('cardio_kind'),
    distanceKm: real('distance_km'),
    sportName: text('sport_name'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
}, (t) => [uniqueIndex('workout_sessions_block_uq').on(t.blockId), index('workout_sessions_date_idx').on(t.date)]);
export const lifts = sqliteTable('lifts', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
});
export const topSets = sqliteTable('top_sets', {
    id: text('id').primaryKey(),
    liftId: text('lift_id')
        .notNull()
        .references(() => lifts.id),
    date: text('date').notNull(),
    weightKg: real('weight_kg').notNull(),
    reps: integer('reps').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
}, (t) => [index('top_sets_lift_date_idx').on(t.liftId, t.date)]);
export const meals = sqliteTable('meals', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    notes: text('notes'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
});
export const goals = sqliteTable('goals', {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // study_minutes | startup_minutes | workouts_total | workouts_by_type | free_evenings | daily_kcal | daily_protein_g
    target: real('target').notNull(),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    workoutType: text('workout_type'),
    tolerancePct: real('tolerance_pct'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
});
export const fixedEvents = sqliteTable('fixed_events', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    kind: text('kind').notNull(), // class | work
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    weekday: integer('weekday').notNull(), // ISO 1..7
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    validFrom: text('valid_from').notNull(),
    validTo: text('valid_to').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});
export const mealLogs = sqliteTable('meal_logs', {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    slot: text('slot').notNull(),
    mealId: text('meal_id').references(() => meals.id),
    freeText: text('free_text'),
    servings: real('servings').notNull(),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    createdAt: text('created_at').notNull(),
}, (t) => [index('meal_logs_date_idx').on(t.date)]);
