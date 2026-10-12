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
ALTER TABLE `blocks` ADD `gcal_hash` text;