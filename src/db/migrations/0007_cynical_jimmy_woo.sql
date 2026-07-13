CREATE TABLE `repo_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`create_pr_prompt` text DEFAULT '',
	`files_to_copy` text DEFAULT '',
	`setup_script` text DEFAULT '',
	`archive_script` text DEFAULT '',
	`run_scripts` text DEFAULT '[]',
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_settings_repo_full_name_unique` ON `repo_settings` (`repo_full_name`);