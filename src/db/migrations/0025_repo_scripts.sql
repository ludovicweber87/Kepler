-- Scripts déclarés par repo, déclenchés à la main depuis la topbar du Workbench.
-- `run_mode` vaut 'terminal' (nouvel onglet terminal) ou 'chat' (message à l'agent).
CREATE TABLE `repo_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`name` text NOT NULL,
	`script` text DEFAULT '' NOT NULL,
	`run_mode` text DEFAULT 'terminal' NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `repo_scripts_repo` ON `repo_scripts` (`repo_full_name`);
