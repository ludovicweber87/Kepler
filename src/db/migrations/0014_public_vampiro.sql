CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`title` text DEFAULT '',
	`body` text DEFAULT '',
	`url` text DEFAULT '',
	`entity_ref` text,
	`payload` text DEFAULT '{}',
	`dedupe_key` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_unique` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_read_at_idx` ON `notifications` (`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_created_at_idx` ON `notifications` (`created_at`);