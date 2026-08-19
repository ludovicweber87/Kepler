CREATE TABLE `agent_activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_session_id` text NOT NULL,
	`content` text,
	`log_type` text DEFAULT 'info',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`project_path` text,
	`project_name` text,
	`branch` text,
	`worktree_path` text,
	`agent_name` text,
	`status` text DEFAULT 'active',
	`started_at` text DEFAULT (datetime('now')),
	`ended_at` text,
	`report_published_at` text,
	`issue_owner` text,
	`issue_repo` text,
	`issue_number` integer,
	`issue_title` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_session_id_unique` ON `agent_sessions` (`session_id`);--> statement-breakpoint
CREATE TABLE `project_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`project_number` integer NOT NULL,
	`project_title` text DEFAULT '',
	`selected_views` text DEFAULT '[]',
	`active_view` text,
	`view_order` text DEFAULT '[]',
	`view_repo_mappings` text DEFAULT '[]',
	`status_columns` text DEFAULT '[]',
	`views` text DEFAULT '[]',
	`owner_type` text
);
--> statement-breakpoint
CREATE TABLE `repo_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`local_path` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_paths_repo_full_name_unique` ON `repo_paths` (`repo_full_name`);--> statement-breakpoint
CREATE TABLE `tab_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_group` text NOT NULL,
	`tab_order` text DEFAULT '[]',
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tab_orders_tab_group_unique` ON `tab_orders` (`tab_group`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '',
	`done` integer DEFAULT false,
	`sort_order` integer DEFAULT 0,
	`issue_number` integer,
	`issue_repo` text,
	`created_at` text DEFAULT (datetime('now'))
);
