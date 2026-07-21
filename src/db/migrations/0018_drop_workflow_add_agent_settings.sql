DROP TABLE IF EXISTS `pipeline_run_steps`;--> statement-breakpoint
DROP TABLE IF EXISTS `pipeline_runs`;--> statement-breakpoint
DROP TABLE IF EXISTS `persona_groups`;--> statement-breakpoint
ALTER TABLE `agent_sessions` DROP COLUMN `pipeline_run_id`;--> statement-breakpoint
ALTER TABLE `agent_sessions` DROP COLUMN `pipeline_node_id`;--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `model` text;--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `effort` text;--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `permission_mode` text;--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `agent_color` text;