import type { NotificationType, NotificationSource, EntityRef, NewNotification } from './types.js';

const HIGH: ReadonlySet<NotificationType> = new Set(['agent_blocked', 'agent_error']);

export function priorityFor(type: NotificationType): 'high' | 'normal' {
	return HIGH.has(type) ? 'high' : 'normal';
}
export function sourceFor(_type: NotificationType): NotificationSource {
	return 'agent';
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
