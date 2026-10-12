CREATE TABLE `lifts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `top_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`lift_id` text NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lift_id`) REFERENCES `lifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `top_sets_lift_date_idx` ON `top_sets` (`lift_id`,`date`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`intensity` integer,
	`notes` text,
	`gym_focus` text,
	`cardio_kind` text,
	`distance_km` real,
	`sport_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sessions_block_uq` ON `workout_sessions` (`block_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);