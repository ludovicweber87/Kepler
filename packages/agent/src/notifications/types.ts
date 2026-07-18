export type NotificationSource = 'agent' | 'github' | 'ci' | 'pr';
export type NotificationType =
	| 'agent_done' | 'agent_error' | 'agent_blocked'
	| 'ci_failed' | 'ci_passed'
	| 'mention' | 'review_requested'
	| 'pr_merged' | 'pr_approved' | 'changes_requested';
export interface EntityRef { kind: 'session' | 'issue' | 'pr'; id: string; repo?: string; }
export interface NewNotification {
	source: NotificationSource;
	type: NotificationType;
	priority: 'high' | 'normal';
	title: string;
	body: string;
	url: string;
	entity_ref: EntityRef | null;
	payload: Record<string, string>;
	dedupe_key: string;
}
