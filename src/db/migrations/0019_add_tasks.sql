CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`repo_full_name` text,
	`issue_owner` text,
	`issue_repo` text,
	`issue_number` integer,
	`issue_title` text,
	`done` integer DEFAULT false,
	`completed_at` text,
	`pinned` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
