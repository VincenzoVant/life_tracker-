CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`mode` text NOT NULL,
	`trigger_block_id` text,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_week_idx` ON `plans` (`week_start`);