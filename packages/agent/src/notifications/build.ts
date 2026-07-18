import type { NotificationType, NotificationSource, EntityRef, NewNotification } from './types.js';

const HIGH: ReadonlySet<NotificationType> = new Set(['agent_blocked', 'agent_error', 'ci_failed', 'changes_requested']);

const SOURCE: Record<NotificationType, NotificationSource> = {
	agent_done: 'agent', agent_error: 'agent', agent_blocked: 'agent',
	ci_failed: 'ci', ci_passed: 'ci',
	mention: 'github', review_requested: 'github',
	pr_merged: 'pr', pr_approved: 'pr', changes_requested: 'pr',
};

export function priorityFor(type: NotificationType): 'high' | 'normal' {
	return HIGH.has(type) ? 'high' : 'normal';
}
export function sourceFor(type: NotificationType): NotificationSource {
	return SOURCE[type];
}
export function buildDedupeKey(type: NotificationType, parts: string[]): string {
	return [type, ...parts].join(':');
}
export function buildNotification(input: {
	type: NotificationType;
	title: string;
	body?: string;
	url?: string;
	entityRef?: EntityRef | null;
	payload?: Record<string, string>;
	dedupeParts: string[];
}): NewNotification {
	return {
		source: sourceFor(input.type),
		type: input.type,
		priority: priorityFor(input.type),
		title: input.title,
		body: input.body ?? '',
		url: input.url ?? '',
		entity_ref: input.entityRef ?? null,
		payload: input.payload ?? {},
		dedupe_key: buildDedupeKey(input.type, input.dedupeParts),
	};
}
