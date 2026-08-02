-- Le rangement des personas suit désormais les repos configurés (`repo_paths`)
-- au lieu de folders nommés créés à la main. Relation N-N : une persona peut
-- être rattachée à plusieurs repos, une persona sans lien reste globale.
-- Les folders précédents (feature de la veille) sont abandonnés, pas migrés.
DROP TABLE IF EXISTS `persona_folder_links`;
--> statement-breakpoint
DROP TABLE IF EXISTS `persona_folders`;
--> statement-breakpoint
CREATE TABLE `persona_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_id` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persona_repos_persona_repo` ON `persona_repos` (`persona_id`,`repo_full_name`);
