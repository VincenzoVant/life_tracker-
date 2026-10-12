CREATE TABLE `calendar_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`life_tracker_calendar_id` text,
	`busy_calendar_ids` text DEFAULT '[]' NOT NULL,
	`include_all_day` integer DEFAULT false NOT NULL,
	`lt_sync_token` text,
	`last_sync_at` text,
	`last_error` text,
	`calendar_missing` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` text NOT NULL,
	`kind` text NOT NULL,
	`before_start` text,
	`before_end` text,
	`after_start` text,
	`after_end` text,
	`created_at` text NOT NULL,
	`seen` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` text NOT NULL,
	`op` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_queue_block_id_unique` ON `sync_queue` (`block_id`);--> statement-breakpoint
ALTER TABLE `blocks` ADD `gcal_hash` text;