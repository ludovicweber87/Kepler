CREATE TABLE `daily_recaps` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`recap_date` text NOT NULL,
	`content` text DEFAULT '',
	`items` text,
	`trigger_type` text DEFAULT 'manual',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `recap_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`time` text NOT NULL,
	`enabled` integer DEFAULT true,
	`last_run_date` text,
	`created_at` text DEFAULT (datetime('now'))
);
