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
