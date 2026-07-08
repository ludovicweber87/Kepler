CREATE TABLE `project_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`project_number` integer NOT NULL,
	`payload` text,
	`fetched_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_boards_org_num` ON `project_boards` (`org`,`project_number`);