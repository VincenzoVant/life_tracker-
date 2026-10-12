CREATE TABLE `busy_events` (
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`updated` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`calendar_id`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendar_id` text NOT NULL,
	`external_event_id` text NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`block_ids` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conflicts_event_unique` ON `conflicts` (`calendar_id`,`external_event_id`);