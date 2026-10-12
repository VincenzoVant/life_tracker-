CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target` real NOT NULL,
	`course_id` text,
	`workout_type` text,
	`tolerance_pct` real,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
