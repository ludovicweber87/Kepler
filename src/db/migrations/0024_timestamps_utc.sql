-- Normalisation des horodatages en ISO 8601 UTC (`2026-07-27T06:19:28.828Z`).
-- Liste de colonnes explicite et jamais dérivée d'un LIKE '%_at' : `docs.format`
-- correspondrait à ce motif (le `_` de SQL vaut un caractère quelconque).

UPDATE agent_activity_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE agent_chat_messages SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE agent_sessions SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at) WHERE started_at IS NOT NULL AND started_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE agent_sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', ended_at) WHERE ended_at IS NOT NULL AND ended_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE agent_sessions SET report_published_at = strftime('%Y-%m-%dT%H:%M:%fZ', report_published_at) WHERE report_published_at IS NOT NULL AND report_published_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE agent_sessions SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', archived_at) WHERE archived_at IS NOT NULL AND archived_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE app_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE daily_recaps SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE doc_categories SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE doc_category_links SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE docs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE docs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE notifications SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', read_at) WHERE read_at IS NOT NULL AND read_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE personas SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE personas SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE project_boards SET fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', fetched_at) WHERE fetched_at IS NOT NULL AND fetched_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE repo_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE tab_orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
--> statement-breakpoint

UPDATE tasks SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
--> statement-breakpoint
UPDATE tasks SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) WHERE completed_at IS NOT NULL AND completed_at NOT LIKE '%Z';
