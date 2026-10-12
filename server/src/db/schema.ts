import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export const blocks = sqliteTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    status: text('status').notNull(),
    actualMinutes: integer('actual_minutes'),
    source: text('source').notNull(),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    courseId: text('course_id'), // FK ON DELETE SET NULL added in Task 6
    startupTaskId: text('startup_task_id'), // FK ON DELETE SET NULL added in Task 7
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
  },
  (t) => [index('blocks_start_idx').on(t.start), index('blocks_fixed_event_idx').on(t.fixedEventId)],
);
