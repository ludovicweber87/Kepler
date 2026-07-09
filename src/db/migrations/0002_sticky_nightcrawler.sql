CREATE TABLE `agent_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`event_type` text NOT NULL,
	`content` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `claude_session_id` text;