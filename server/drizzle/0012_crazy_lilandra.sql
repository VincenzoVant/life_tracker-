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
