CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`weekly_goal_minutes` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_active_name_uq` ON `courses` (`name`) WHERE "courses"."active" = 1;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`status` text NOT NULL,
	`actual_minutes` integer,
	`source` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`course_id` text,
	`startup_task_id` text,
	`workout_type` text,
	`meal_slot` text,
	`fixed_event_id` text,
	`plan_id` text,
	`gcal_event_id` text,
	`gcal_etag` text,
	`gcal_synced_at` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_blocks`("id", "category", "title", "start", "end", "status", "actual_minutes", "source", "locked", "course_id", "startup_task_id", "workout_type", "meal_slot", "fixed_event_id", "plan_id", "gcal_event_id", "gcal_etag", "gcal_synced_at", "notes", "created_at", "updated_at") SELECT "id", "category", "title", "start", "end", "status", "actual_minutes", "source", "locked", "course_id", "startup_task_id", "workout_type", "meal_slot", "fixed_event_id", "plan_id", "gcal_event_id", "gcal_etag", "gcal_synced_at", "notes", "created_at", "updated_at" FROM `blocks`;--> statement-breakpoint
DROP TABLE `blocks`;--> statement-breakpoint
ALTER TABLE `__new_blocks` RENAME TO `blocks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `blocks_start_idx` ON `blocks` (`start`);--> statement-breakpoint
CREATE INDEX `blocks_fixed_event_idx` ON `blocks` (`fixed_event_id`);