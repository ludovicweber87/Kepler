export type NotificationSource = 'agent';
export type NotificationType = 'agent_done' | 'agent_error' | 'agent_blocked';
export interface EntityRef { kind: 'session'; id: string; repo?: string; }
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
