CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`source_type` text DEFAULT 'knowledge' NOT NULL,
	`repo_full_name` text,
	`level` text DEFAULT 'intermediate' NOT NULL,
	`length` text DEFAULT 'medium' NOT NULL,
	`format` text DEFAULT 'overview' NOT NULL,
	`angle` text,
	`content` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`agent_session_id` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `doc_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#7C5CFF' NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_categories_name_unique` ON `doc_categories` (`name`);
--> statement-breakpoint
CREATE TABLE `doc_category_links` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_category_links_doc_cat` ON `doc_category_links` (`doc_id`,`category_id`);
--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `origin` text DEFAULT 'workbench';
