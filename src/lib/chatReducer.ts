import type {
	ChatMessage,
	ChatSegment,
	ChatToolCall,
	StreamDeltaWire,
	StreamEventWire,
} from '@/types';

let _uid = 0;
const nextId = () => `m${Date.now().toString(36)}-${_uid++}`;

type DraftSegment = Extract<ChatSegment, { kind: 'text' | 'thinking' }>;

/** Segment construit depuis les deltas, en attente du bloc complet qui le remplacera. */
function isDraft(seg: ChatSegment): seg is DraftSegment {
	return (seg.kind === 'text' || seg.kind === 'thinking') && seg.draft === true;
}

function draftSegment(kind: 'text' | 'thinking', text: string): ChatSegment {
	return kind === 'thinking'
		? { kind: 'thinking', text, draft: true }
		: { kind: 'text', text, draft: true };
}

/** Même segment, sans la marque de brouillon. */
function settled(seg: DraftSegment): ChatSegment {
	return seg.kind === 'thinking'
		? { kind: 'thinking', text: seg.text }
		: { kind: 'text', text: seg.text };
}

/**
 * Ces trois événements portent un bloc complet qui fait autorité sur le brouillon
 * streamé du même bloc : ils le purgent avant de s'ajouter. Exporté parce que le
 * hook doit jeter au même moment les deltas encore en tampon, sinon ils
 * reconstruiraient un brouillon déjà remplacé.
 */
export function supersedesDrafts(event: StreamEventWire['event']): boolean {
	return event === 'thinking' || event === 'assistant' || event === 'tool_use';
}

/** Seul le dernier message peut porter des brouillons : le tour en cours. */
function withoutDrafts(messages: ChatMessage[]): ChatMessage[] {
	const last = messages[messages.length - 1];
	if (!last || last.role !== 'assistant' || !last.segments.some(isDraft)) return messages;
	// La bulle est conservée même vidée de tout : le bloc complet y est ajouté
	// dans la foulée, et garder son `id` évite un démontage/remontage React.
	const kept = last.segments.filter((s) => !isDraft(s));
	return [...messages.slice(0, -1), { ...last, segments: kept }];
}

/**
 * Fin de tour : ce qui est encore en brouillon ne sera plus remplacé (tour
 * interrompu ou en erreur). On le fige au lieu de le jeter — effacer sous les
 * yeux de l'utilisateur du texte déjà affiché serait pire que l'absence de ce
 * texte dans le transcript persisté.
 */
function promoteDrafts(messages: ChatMessage[]): ChatMessage[] {
	const last = messages[messages.length - 1];
	if (!last || last.role !== 'assistant' || !last.segments.some(isDraft)) return messages;
	return [
		...messages.slice(0, -1),
		{ ...last, segments: last.segments.map((s) => (isDraft(s) ? settled(s) : s)) },
	];
}

/**
 * Patche un appel d'outil sans recréer les autres messages : l'identité des
 * bulles non concernées est préservée, ce qui rend le `memo` de ChatBubble
 * efficace. Recréer toute la liste repeignait tout le transcript (et son
 * markdown) à chaque résultat d'outil — intenable une fois le streaming actif.
 */
function patchToolCall(
	messages: ChatMessage[],
	toolUseId: string,
	patch: (call: ChatToolCall) => ChatToolCall,
): ChatMessage[] {
	// L'outil visé est presque toujours dans la dernière bulle.
	for (let i = messages.length - 1; i >= 0; i--) {
		const segs = messages[i].segments;
		const j = segs.findIndex((s) => s.kind === 'tool' && s.call.id === toolUseId);
		if (j === -1) continue;
		const seg = segs[j];
		if (seg.kind !== 'tool') continue;
		const patched = patch(seg.call);
		if (patched === seg.call) return messages;
		const nextSegs = [...segs];
		nextSegs[j] = { kind: 'tool', call: patched };
		const next = [...messages];
		next[i] = { ...messages[i], segments: nextSegs };
		return next;
	}
	return messages;
}

function appendSegment(messages: ChatMessage[], segment: ChatSegment): ChatMessage[] {
	const last = messages[messages.length - 1];
	if (last && last.role === 'assistant')
		return [...messages.slice(0, -1), { ...last, segments: [...last.segments, segment] }];
	return [...messages, { id: nextId(), role: 'assistant', segments: [segment] }];
}

// Renvoie une nouvelle liste ; ne mute jamais l'entrée.
export function reduceStreamEvent(messages: ChatMessage[], wire: StreamEventWire): ChatMessage[] {
	const { event, data } = wire;

	if (event === 'session') return messages;
	if (event === 'result') return promoteDrafts(messages);

	if (event === 'role_switch')
		return [
			...messages,
			{
				id: nextId(),
				role: 'system',
				segments: [{ kind: 'role_switch', name: String(data.name ?? '') }],
			},
		];

	if (event === 'user')
		return [
			...messages,
			userMessage(
				String(data.text ?? ''),
				(data.images as { name: string; url: string }[] | undefined) ?? undefined,
				(data.files as { name: string; url: string; mediaType: string }[] | undefined) ??
					undefined,
			),
		];

	if (event === 'tool_result')
		return patchToolCall(messages, String(data.tool_use_id ?? ''), (call) => ({
			...call,
			result: data.content,
			truncated: Boolean(data.truncated),
			status: 'done',
		}));

	let segment: ChatSegment;
	if (event === 'thinking') segment = { kind: 'thinking', text: String(data.text ?? '') };
	else if (event === 'assistant') segment = { kind: 'text', text: String(data.text ?? '') };
	else {
		const call: ChatToolCall = {
			id: String(data.id ?? ''),
			name: String(data.name ?? ''),
			input: data.input,
			status: 'running',
		};
		segment = { kind: 'tool', call };
	}

	return appendSegment(supersedesDrafts(event) ? withoutDrafts(messages) : messages, segment);
}

/**
 * Delta transitoire → brouillon. Le texte est concaténé dans le dernier segment
 * brouillon du même type quand il y en a un, de sorte qu'un token ne recrée que
 * la bulle en cours.
 */
export function applyStreamDelta(messages: ChatMessage[], delta: StreamDeltaWire): ChatMessage[] {
	// Le retry est un état de session, pas du contenu : traité dans le hook.
	if (delta.kind === 'api_retry') return messages;

	if (delta.kind === 'tool_progress')
		return patchToolCall(messages, delta.toolUseId, (call) =>
			call.elapsedSeconds === delta.elapsedSeconds
				? call
				: { ...call, elapsedSeconds: delta.elapsedSeconds },
		);

	const kind = delta.kind;
	const last = messages[messages.length - 1];
	if (last && last.role === 'assistant') {
		const tail = last.segments[last.segments.length - 1];
		if (tail && isDraft(tail) && tail.kind === kind)
			return [
				...messages.slice(0, -1),
				{
					...last,
					segments: [
						...last.segments.slice(0, -1),
						draftSegment(kind, tail.text + delta.text),
					],
				},
			];
	}
	return appendSegment(messages, draftSegment(kind, delta.text));
}

export function userMessage(
	text: string,
	images?: { name: string; url: string }[],
	files?: { name: string; url: string; mediaType: string }[],
): ChatMessage {
	const segments: ChatSegment[] = [];
	if (text) segments.push({ kind: 'text', text });
	for (const img of images ?? []) segments.push({ kind: 'image', url: img.url, name: img.name });
	for (const f of files ?? [])
		segments.push({ kind: 'file', url: f.url, name: f.name, mediaType: f.mediaType });
	if (segments.length === 0) segments.push({ kind: 'text', text: '' });
	return { id: nextId(), role: 'user', segments };
}
