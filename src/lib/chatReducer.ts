import type { ChatMessage, ChatSegment, ChatToolCall, StreamEventWire } from '@/types';

let _uid = 0;
const nextId = () => `m${Date.now().toString(36)}-${_uid++}`;

// Renvoie une nouvelle liste ; ne mute jamais l'entrée.
export function reduceStreamEvent(messages: ChatMessage[], wire: StreamEventWire): ChatMessage[] {
	const { event, data } = wire;

	if (event === 'session' || event === 'result') return messages;

	if (event === 'tool_result') {
		const toolUseId = String(data.tool_use_id ?? '');
		return messages.map((m) => ({
			...m,
			segments: m.segments.map((s) =>
				s.kind === 'tool' && s.call.id === toolUseId
					? { kind: 'tool', call: { ...s.call, result: data.content, truncated: Boolean(data.truncated), status: 'done' } }
					: s,
			),
		}));
	}

	let segment: ChatSegment;
	if (event === 'thinking') segment = { kind: 'thinking', text: String(data.text ?? '') };
	else if (event === 'assistant') segment = { kind: 'text', text: String(data.text ?? '') };
	else {
		const call: ChatToolCall = { id: String(data.id ?? ''), name: String(data.name ?? ''), input: data.input, status: 'running' };
		segment = { kind: 'tool', call };
	}

	const last = messages[messages.length - 1];
	if (last && last.role === 'assistant') {
		const updated: ChatMessage = { ...last, segments: [...last.segments, segment] };
		return [...messages.slice(0, -1), updated];
	}
	return [...messages, { id: nextId(), role: 'assistant', segments: [segment] }];
}

export function userMessage(text: string): ChatMessage {
	return { id: nextId(), role: 'user', segments: [{ kind: 'text', text }] };
}
