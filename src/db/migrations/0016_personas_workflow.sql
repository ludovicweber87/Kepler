CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '',
	`system_prompt` text DEFAULT '',
	`model` text,
	`effort` text,
	`permission_mode` text,
	`color` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `persona_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`nodes` text DEFAULT '[]',
	`edges` text DEFAULT '[]',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`group_name` text DEFAULT '',
	`project_path` text,
	`project_name` text,
	`branch` text,
	`worktree_path` text,
	`status` text DEFAULT 'running',
	`current_node_id` text,
	`pause_reason` text,
	`initial_prompt` text,
	`issue_owner` text,
	`issue_repo` text,
	`issue_number` integer,
	`issue_title` text,
	`max_steps` integer DEFAULT 30,
	`step_count` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`ended_at` text
);
--> statement-breakpoint
CREATE TABLE `pipeline_run_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`persona_id` text,
	`session_id` text,
	`outcome` text,
	`summary` text,
	`status` text DEFAULT 'running',
	`seq` integer NOT NULL,
	`started_at` text DEFAULT (datetime('now')),
	`ended_at` text
);
--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `pipeline_run_id` text;--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `pipeline_node_id` text;
