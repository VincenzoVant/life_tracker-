CREATE TABLE `blocks` (
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
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocks_start_idx` ON `blocks` (`start`);--> statement-breakpoint
CREATE INDEX `blocks_fixed_event_idx` ON `blocks` (`fixed_event_id`);