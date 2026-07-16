import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamp = () => text().default(sql`(datetime('now'))`);
const uuid = () =>
	text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

// ─── Agent Sessions ──────────────────────────────────────

export const agentSessions = sqliteTable('agent_sessions', {
	id: uuid(),
	session_id: text().notNull().unique(),
	project_path: text(),
	project_name: text(),
	branch: text(),
	worktree_path: text(),
	agent_name: text(),
	status: text().default('active'),
	started_at: timestamp(),
	ended_at: text(),
	archived_at: text(),
	report_published_at: text(),
	issue_owner: text(),
	issue_repo: text(),
	issue_number: integer(),
	issue_title: text(),
	claude_session_id: text(),
	system_prompt: text(),
	launch_mode: text().default('worktree'),
});

// ─── Agent Activity Logs ─────────────────────────────────

export const agentActivityLogs = sqliteTable('agent_activity_logs', {
	id: uuid(),
	agent_session_id: text().notNull(),
	content: text(),
	log_type: text().default('info'),
	created_at: timestamp(),
});

// ─── Agent Chat Messages (transcript SDK) ────────────────

export const agentChatMessages = sqliteTable('agent_chat_messages', {
	id: uuid(),
	agent_session_id: text().notNull(),
	seq: integer().notNull(),
	role: text().notNull(),
	event_type: text().notNull(),
	content: text({ mode: 'json' }),
	created_at: timestamp(),
});

// ─── Repo Paths ──────────────────────────────────────────

export const repoPaths = sqliteTable('repo_paths', {
	id: uuid(),
	repo_full_name: text().notNull().unique(),
	local_path: text().notNull(),
});

// ─── Project Configs ─────────────────────────────────────

export const projectConfigs = sqliteTable('project_configs', {
	id: uuid(),
	org: text().notNull(),
	project_number: integer().notNull(),
	project_title: text().default(''),
	selected_views: text({ mode: 'json' }).$type<string[]>().default([]),
	active_view: text(),
	view_order: text({ mode: 'json' }).$type<string[]>().default([]),
	view_repo_mappings: text({ mode: 'json' }).$type<Record<string, unknown>[]>().default([]),
	status_columns: text({ mode: 'json' }).$type<string[]>().default([]),
	views: text({ mode: 'json' }).$type<Record<string, unknown>[]>().default([]),
	owner_type: text(),
	connected: integer({ mode: 'boolean' }).default(false),
});

// ─── Tab Orders ──────────────────────────────────────────

export const tabOrders = sqliteTable('tab_orders', {
	id: uuid(),
	tab_group: text().notNull().unique(),
	tab_order: text({ mode: 'json' }).$type<string[]>().default([]),
	updated_at: timestamp(),
});

// ─── App Settings (clé/valeur globales) ─────────────────

export const appSettings = sqliteTable('app_settings', {
	id: uuid(),
	key: text().notNull().unique(),
	value: text().default(''),
	updated_at: timestamp(),
});

// ─── Repo Settings ───────────────────────────────────────

export const repoSettings = sqliteTable('repo_settings', {
	id: uuid(),
	repo_full_name: text().notNull().unique(),
	create_pr_prompt: text().default(''),
	files_to_copy: text().default(''),
	setup_script: text().default(''),
	setup_script_name: text().default(''),
	archive_script: text().default(''),
	updated_at: timestamp(),
});

// ─── Project Boards (SQLite cache of the GitHub Project V2 board) ──

export const projectBoards = sqliteTable(
	'project_boards',
	{
		id: uuid(),
		org: text().notNull(),
		project_number: integer().notNull(),
		payload: text({ mode: 'json' }),
		fetched_at: timestamp(),
	},
	(table) => [uniqueIndex('project_boards_org_num').on(table.org, table.project_number)],
);

// ─── Daily Recaps ────────────────────────────────────────

export type RecapItem = { time: string; type: string; text: string };

export const dailyRecaps = sqliteTable('daily_recaps', {
	id: uuid(),
	repo_full_name: text().notNull(),
	recap_date: text().notNull(), // YYYY-MM-DD (local), the day the recap covers
	content: text().default(''), // concise FR markdown
	items: text({ mode: 'json' }).$type<RecapItem[]>(), // source timeline
	trigger_type: text().default('manual'), // 'manual'
	created_at: timestamp(),
});
