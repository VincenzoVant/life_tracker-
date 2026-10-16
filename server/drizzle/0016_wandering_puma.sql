CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`course_id` text,
	`weekly_minutes` integer NOT NULL,
	`week_start` text,
	`windows` text DEFAULT '[]' NOT NULL,
	`block_min` integer DEFAULT 60 NOT NULL,
	`block_max` integer DEFAULT 120 NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `blocks` ADD `project_id` text REFERENCES projects(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `fixed_events` ADD `buffer_before` integer;--> statement-breakpoint
ALTER TABLE `fixed_events` ADD `buffer_after` integer;