export interface GitHubRepo {
	id: number;
	name: string;
	full_name: string;
	html_url: string;
	description: string | null;
	language: string | null;
	open_issues_count: number;
	updated_at: string;
	owner: {
		login: string;
		avatar_url: string;
	};
}

export interface GitHubLabel {
	name: string;
	color: string;
}

export interface ProjectColumn {
	project: string;
	column: string;
}

export interface GitHubIssue {
	id: number;
	node_id: string;
	number: number;
	title: string;
	body: string | null;
	state: 'open' | 'closed';
	html_url: string;
	updated_at: string;
	created_at: string;
	closed_at: string | null;
	labels: GitHubLabel[];
	assignee: {
		login: string;
		avatar_url: string;
	} | null;
	assignees: {
		login: string;
		avatar_url: string;
	}[];
	user: {
		login: string;
		avatar_url: string;
	};
	repository_url: string;
	pull_request?: unknown;
	repo_full_name?: string;
	project_columns?: ProjectColumn[];
}

export interface GitHubComment {
	id: number;
	body: string;
	created_at: string;
	user: {
		login: string;
		avatar_url: string;
	};
}

export interface DashboardData {
	repos: GitHubRepo[];
	issues: GitHubIssue[];
	user: string;
}

export interface DashboardStats {
	totalIssues: number;
	openIssues: number;
	closedIssues: number;
	repoCount: number;
}

// Project V2 types

export interface ProjectV2View {
	id: string;
	name: string;
	filter: string;
}

export interface ProjectV2Item {
	contentType: 'Issue' | 'PullRequest' | 'DraftIssue';
	repoFullName: string | null;
	number: number | null;
	fieldValues: Record<string, string>; // field name → value
	labels: GitHubLabel[]; // issue/PR labels (for `label:` view filters + rendering)
	// Render fields (issues + PRs), used to build the board directly from Project V2 items
	nodeId: string | null;
	title: string;
	url: string;
	state: string; // OPEN | CLOSED | MERGED
	updatedAt: string;
	assignees: { login: string; avatarUrl: string }[];
}

export interface ProjectV2Data {
	id: string;
	title: string;
	number: number;
	views: ProjectV2View[];
	items: ProjectV2Item[];
	statusColumns: string[];
}

export interface ViewIssueRef {
	repo: string;
	number: number;
}

export interface ViewRepoMapping {
	viewName: string;
	repos: string[]; // full_name list
	issues: ViewIssueRef[]; // exact issue identifiers per view
}

export interface ProjectV2Config {
	org: string;
	projectNumber: number;
	projectTitle: string;
	selectedViews: string[]; // view names
	activeView: string | null; // currently active view tab (null = "All")
	viewOrder: string[]; // ordered view names for tab display
	viewRepoMappings: ViewRepoMapping[];
	statusColumns: string[];
	views: ProjectV2View[]; // all available views (cached from GitHub)
	ownerType?: 'organization' | 'user'; // owner type for GraphQL queries
	connected: boolean; // board agrégé au Kanban unifié
}

// Timeline event types

interface TimelineActor {
	login: string;
	avatar_url: string;
}

interface TimelineLabel {
	name: string;
	color: string;
}

interface BaseTimelineEvent {
	id?: number;
	node_id?: string;
	created_at: string;
	actor: TimelineActor | null;
}

interface LabeledEvent extends BaseTimelineEvent {
	event: 'labeled' | 'unlabeled';
	label: TimelineLabel;
}

interface AssignedEvent extends BaseTimelineEvent {
	event: 'assigned' | 'unassigned';
	assignee: TimelineActor;
}

interface ClosedEvent extends BaseTimelineEvent {
	event: 'closed';
	state_reason?: string | null;
}

interface ReopenedEvent extends BaseTimelineEvent {
	event: 'reopened';
}

interface RenamedEvent extends BaseTimelineEvent {
	event: 'renamed';
	rename: { from: string; to: string };
}

interface CommentedEvent extends BaseTimelineEvent {
	event: 'commented';
	body: string;
	user: TimelineActor;
	html_url: string;
}

interface CrossReferencedEvent extends BaseTimelineEvent {
	event: 'cross-referenced' | 'referenced';
	source?: {
		issue?: {
			number: number;
			title: string;
			html_url: string;
			repository?: { full_name: string };
		};
	};
}

interface GenericTimelineEvent extends BaseTimelineEvent {
	event: string;
	[key: string]: unknown;
}

export type GitHubTimelineEvent =
	| LabeledEvent
	| AssignedEvent
	| ClosedEvent
	| ReopenedEvent
	| RenamedEvent
	| CommentedEvent
	| CrossReferencedEvent
	| GenericTimelineEvent;

export interface CheckRun {
	name: string;
	status: 'queued' | 'in_progress' | 'completed';
	conclusion:
		| 'success'
		| 'failure'
		| 'neutral'
		| 'cancelled'
		| 'skipped'
		| 'timed_out'
		| 'action_required'
		| null;
}

export interface GitHubPullRequest {
	id: number;
	number: number;
	title: string;
	body: string | null;
	state: 'open' | 'closed';
	draft: boolean;
	html_url: string;
	created_at: string;
	updated_at: string;
	merged_at: string | null;
	mergeable: boolean | null;
	user: {
		login: string;
		avatar_url: string;
	};
	head: {
		ref: string;
		sha: string;
		label: string;
	};
	base: {
		ref: string;
		label: string;
	};
	labels: GitHubLabel[];
	requested_reviewers: {
		login: string;
		avatar_url: string;
	}[];
	review_comments: number;
	comments: number;
	additions: number;
	deletions: number;
	changed_files: number;
	repo_full_name: string;
	check_status: 'success' | 'failure' | 'pending' | null;
	check_runs: CheckRun[];
}

// Agent sessions (from local agent /sessions endpoint)

export interface ActiveSession {
	sessionId: string;
	cwd: string;
	branch: string | null;
	projectName: string;
	agentName: string | null;
	createdAt: number;
	lastActivity: number;
	lastOutput: number;
	isActive: boolean;
	isStreaming: boolean;
}

// Git worktrees (from local agent /git/worktrees endpoint)

export interface WorktreeInfo {
	path: string;
	branch: string;
	head: string;
}

export interface AgentPreset {
	id: string;
	name: string;
	description: string;
	prompt_template: string;
	icon: string;
	color: string;
	created_at: string;
}

// ─── Agent Chat (lot 2) ──────────────────────────────────
export type ChatRole = 'user' | 'assistant';

export interface ChatToolCall {
	id: string;
	name: string;
	input: unknown;
	result?: unknown;
	truncated?: boolean;
	status: 'running' | 'done' | 'error';
}

export type ChatSegment =
	| { kind: 'text'; text: string }
	| { kind: 'thinking'; text: string }
	| { kind: 'image'; url: string; name: string }
	| { kind: 'tool'; call: ChatToolCall };

export interface ChatImageInput {
	name: string;
	mediaType: string;
	data: string;
}

export interface ChatMessage {
	id: string;
	role: ChatRole;
	segments: ChatSegment[];
}

export type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';

export interface PendingPermission {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	title?: string;
	displayName?: string;
}

export interface QuestionOption {
	label: string;
	description?: string;
	preview?: string;
}

export interface QuestionSpec {
	question: string;
	header?: string;
	multiSelect?: boolean;
	options: QuestionOption[];
}

export interface PendingQuestion {
	id: string;
	questions: QuestionSpec[];
}

/** answers keyé par texte de question ; valeur = label choisi (ou texte libre "Other", joint par ", " en multiSelect). */
export type QuestionAnswers = Record<string, string>;

/** Event tel qu'il arrive sur le fil WS (data selon l'`event`). */
export interface StreamEventWire {
	seq: number;
	event: 'session' | 'user' | 'thinking' | 'assistant' | 'tool_use' | 'tool_result' | 'result';
	data: Record<string, unknown>;
}

// ─── Repo Settings ──────────────────────────────────────────
export interface RepoSettings {
	repo_full_name: string;
	create_pr_prompt: string;
	commit_push_prompt: string;
	files_to_copy: string;
	setup_script: string;
	setup_script_name: string;
	archive_script: string;
	/** Colonne du board vers laquelle déplacer l'issue au merge d'une PR liée. Vide = ne rien faire. */
	qa_column: string;
}

// ─── Daily Recaps ───────────────────────────────────────────
export interface RecapItem {
	time: string; // HH:MM local
	type: string; // commit | pr | summary | file_change | info | error
	text: string;
}

export interface DailyRecap {
	id: string;
	repo_full_name: string;
	recap_date: string; // YYYY-MM-DD (local)
	content: string; // concise FR markdown
	items: RecapItem[] | null;
	trigger_type: 'manual';
	created_at: string;
}

// ─── Notifications ───────────────────────────────────────────
export type NotificationSource = 'agent' | 'github' | 'ci' | 'pr';
export type NotificationType =
	| 'agent_done'
	| 'agent_error'
	| 'agent_blocked'
	| 'ci_failed'
	| 'ci_passed'
	| 'mention'
	| 'review_requested'
	| 'pr_merged'
	| 'pr_approved'
	| 'changes_requested';
export interface EntityRef {
	kind: 'session' | 'issue' | 'pr';
	id: string;
	repo?: string;
}
export interface AppNotification {
	id: string;
	source: NotificationSource;
	type: NotificationType;
	priority: 'high' | 'normal';
	title: string;
	body: string;
	url: string;
	entity_ref: EntityRef | null;
	payload: Record<string, string>;
	read_at: string | null;
	created_at: string;
}
export type NewNotification = Omit<AppNotification, 'id' | 'read_at' | 'created_at'> & {
	dedupe_key: string;
};

// ─── Personas & Workflow (groupes) ───────────────────────

export type ClaudeEffort = 'low' | 'medium' | 'high';
export type ClaudePermissionMode =
	| 'default'
	| 'acceptEdits'
	| 'bypassPermissions'
	| 'plan';

export interface Persona {
	id: string;
	name: string;
	role: string | null;
	system_prompt: string | null;
	model: string | null;
	effort: ClaudeEffort | null;
	permission_mode: ClaudePermissionMode | null;
	color: string | null;
	created_at: string;
	updated_at: string;
}

export type NewPersona = Pick<Persona, 'name'> &
	Partial<Omit<Persona, 'id' | 'created_at' | 'updated_at'>>;

export type PersonaNodeType = 'start' | 'persona' | 'checkpoint' | 'end';

/** Data carried by a node inside the React Flow graph (serialised in DB). */
export interface PersonaFlowNodeData {
	label?: string;
	/** For `persona` nodes: which persona this node runs. */
	personaId?: string;
	/** For `persona` nodes: declared named outputs → become source handles / edges. */
	outputs?: string[];
	/** For `end` nodes: optional terminal action. */
	endAction?: 'none' | 'create-pr';
	[key: string]: unknown;
}

/** Serialisable React Flow node persisted on a group. */
export interface PersonaFlowNode {
	id: string;
	type: PersonaNodeType;
	position: { x: number; y: number };
	data: PersonaFlowNodeData;
}

/** Serialisable React Flow edge persisted on a group. */
export interface PersonaFlowEdge {
	id: string;
	source: string;
	target: string;
	/** Output name the edge leaves from (persona node with multiple outputs). */
	sourceHandle?: string | null;
	targetHandle?: string | null;
	label?: string | null;
}

export interface PersonaGroup {
	id: string;
	name: string;
	description: string | null;
	nodes: PersonaFlowNode[];
	edges: PersonaFlowEdge[];
	created_at: string;
	updated_at: string;
}

export type PipelineRunStatus = 'running' | 'paused' | 'completed' | 'failed';
export type PipelinePauseReason =
	| 'checkpoint'
	| 'error'
	| 'awaiting_outcome'
	| 'max_steps';

export interface PipelineRun {
	id: string;
	group_id: string;
	group_name: string | null;
	project_path: string | null;
	project_name: string | null;
	branch: string | null;
	worktree_path: string | null;
	status: PipelineRunStatus;
	current_node_id: string | null;
	pause_reason: PipelinePauseReason | null;
	initial_prompt: string | null;
	issue_owner: string | null;
	issue_repo: string | null;
	issue_number: number | null;
	issue_title: string | null;
	max_steps: number;
	step_count: number;
	created_at: string;
	ended_at: string | null;
}

export type PipelineRunStepStatus = 'running' | 'completed' | 'failed' | 'paused';

export interface PipelineRunStep {
	id: string;
	run_id: string;
	node_id: string;
	persona_id: string | null;
	session_id: string | null;
	outcome: string | null;
	summary: string | null;
	status: PipelineRunStepStatus;
	seq: number;
	started_at: string;
	ended_at: string | null;
}
