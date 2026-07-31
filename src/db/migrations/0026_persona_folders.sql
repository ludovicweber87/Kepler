-- Rangement des personas en folders nommés, créés par l'utilisateur.
-- Relation N-N : une persona peut vivre dans plusieurs folders, un folder
-- contient plusieurs personas. Supprimer un folder ne supprime jamais de
-- persona — seulement les liens (les personas repassent « sans folder »).
CREATE TABLE `persona_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#7C5CFF' NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persona_folders_name_unique` ON `persona_folders` (`name`);
--> statement-breakpoint
CREATE TABLE `persona_folder_links` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persona_folder_links_persona_folder` ON `persona_folder_links` (`persona_id`,`folder_id`);
