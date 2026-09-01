import { test, expect, describe, it } from 'vitest';
import { applyStreamDelta, reduceStreamEvent, supersedesDrafts, userMessage } from './chatReducer';
import type { ChatMessage, StreamDeltaWire, StreamEventWire } from '@/types';

const ev = (
	seq: number,
	event: StreamEventWire['event'],
	data: Record<string, unknown>,
): StreamEventWire => ({ seq, event, data });

test('assistant text crée une bulle assistant', () => {
	const out = reduceStreamEvent([], ev(1, 'assistant', { text: 'Bonjour' }));
	expect(out).toHaveLength(1);
	expect(out[0].role).toBe('assistant');
	expect(out[0].segments).toEqual([{ kind: 'text', text: 'Bonjour' }]);
});

test('deux textes assistant successifs s empilent dans la même bulle', () => {
	let msgs: ChatMessage[] = [];
	msgs = reduceStreamEvent(msgs, ev(1, 'assistant', { text: 'a' }));
	msgs = reduceStreamEvent(msgs, ev(2, 'assistant', { text: 'b' }));
	expect(msgs).toHaveLength(1);
	expect(msgs[0].segments).toEqual([
		{ kind: 'text', text: 'a' },
		{ kind: 'text', text: 'b' },
	]);
});

test('thinking ajoute un segment thinking', () => {
	const out = reduceStreamEvent([], ev(1, 'thinking', { text: 'hmm' }));
	expect(out[0].segments[0]).toEqual({ kind: 'thinking', text: 'hmm' });
});

test('tool_use puis tool_result corrèlent par id', () => {
	let msgs = reduceStreamEvent(
		[],
		ev(1, 'tool_use', { id: 't1', name: 'Read', input: { file_path: 'a.ts' } }),
	);
	msgs = reduceStreamEvent(
		msgs,
		ev(2, 'tool_result', { tool_use_id: 't1', content: 'ok', truncated: false }),
	);
	const seg = msgs[0].segments[0];
	expect(seg.kind).toBe('tool');
	if (seg.kind === 'tool') {
		expect(seg.call.status).toBe('done');
		expect(seg.call.result).toBe('ok');
	}
});

test('session et result ne créent pas de bulle', () => {
	let msgs = reduceStreamEvent([], ev(1, 'session', { id: 's', model: 'opus' }));
	msgs = reduceStreamEvent(msgs, ev(2, 'result', { is_error: false, text: '' }));
	expect(msgs).toHaveLength(0);
});

describe('userMessage', () => {
	it('text-only → single text segment', () => {
		const m = userMessage('hi');
		expect(m.role).toBe('user');
		expect(m.segments).toEqual([{ kind: 'text', text: 'hi' }]);
	});

	it('with images → text + image segments', () => {
		const m = userMessage('look', [{ name: 'a.png', url: '/attachments/s/a.png' }]);
		expect(m.segments[0]).toEqual({ kind: 'text', text: 'look' });
		expect(m.segments[1]).toEqual({
			kind: 'image',
			url: '/attachments/s/a.png',
			name: 'a.png',
		});
	});

	it('empty text with image → only image segment', () => {
		const m = userMessage('', [{ name: 'a.png', url: '/x/a.png' }]);
		expect(m.segments).toEqual([{ kind: 'image', url: '/x/a.png', name: 'a.png' }]);
	});

	it('with files → file segments carrying the media type', () => {
		const m = userMessage('lis ça', undefined, [
			{ name: 'r.pdf', url: '/x/uuid-r.pdf', mediaType: 'application/pdf' },
		]);
		expect(m.segments).toEqual([
			{ kind: 'text', text: 'lis ça' },
			{ kind: 'file', url: '/x/uuid-r.pdf', name: 'r.pdf', mediaType: 'application/pdf' },
		]);
	});
});

describe('streaming (deltas)', () => {
	const d = (delta: StreamDeltaWire) => delta;

	it('un delta texte crée un segment brouillon', () => {
		const out = applyStreamDelta([], d({ kind: 'text', text: 'Bon' }));
		expect(out[0].segments).toEqual([{ kind: 'text', text: 'Bon', draft: true }]);
	});

	it('les deltas successifs se concatènent dans le même segment', () => {
		let msgs = applyStreamDelta([], d({ kind: 'text', text: 'Bon' }));
		msgs = applyStreamDelta(msgs, d({ kind: 'text', text: 'jour' }));
		expect(msgs).toHaveLength(1);
		expect(msgs[0].segments).toEqual([{ kind: 'text', text: 'Bonjour', draft: true }]);
	});

	it('un delta thinking après un delta texte ouvre un second segment', () => {
		let msgs = applyStreamDelta([], d({ kind: 'text', text: 'a' }));
		msgs = applyStreamDelta(msgs, d({ kind: 'thinking', text: 'hmm' }));
		expect(msgs[0].segments).toEqual([
			{ kind: 'text', text: 'a', draft: true },
			{ kind: 'thinking', text: 'hmm', draft: true },
		]);
	});

	it('le bloc complet remplace le brouillon sans le dupliquer', () => {
		let msgs = applyStreamDelta([], d({ kind: 'text', text: 'Bonjo' }));
		msgs = reduceStreamEvent(msgs, ev(1, 'assistant', { text: 'Bonjour tout le monde' }));
		expect(msgs).toHaveLength(1);
		expect(msgs[0].segments).toEqual([{ kind: 'text', text: 'Bonjour tout le monde' }]);
	});

	it('la bulle garde son id quand le brouillon est remplacé', () => {
		const streamed = applyStreamDelta([], d({ kind: 'text', text: 'Bonjo' }));
		const settled = reduceStreamEvent(streamed, ev(1, 'assistant', { text: 'Bonjour' }));
		expect(settled[0].id).toBe(streamed[0].id);
	});

	it('un tool_use purge aussi le brouillon du même tour', () => {
		let msgs = applyStreamDelta([], d({ kind: 'text', text: 'je lis' }));
		msgs = reduceStreamEvent(msgs, ev(1, 'assistant', { text: 'Je lis le fichier.' }));
		msgs = reduceStreamEvent(msgs, ev(2, 'tool_use', { id: 't1', name: 'Read', input: {} }));
		expect(msgs[0].segments.map((x) => x.kind)).toEqual(['text', 'tool']);
	});

	it('result fige le brouillon restant au lieu de l effacer', () => {
		let msgs = applyStreamDelta([], d({ kind: 'text', text: 'coupé net' }));
		msgs = reduceStreamEvent(msgs, ev(1, 'result', { is_error: false, text: '' }));
		expect(msgs[0].segments).toEqual([{ kind: 'text', text: 'coupé net' }]);
	});

	it('supersedesDrafts ne cible que les blocs complets de l assistant', () => {
		const blocks: StreamEventWire['event'][] = ['thinking', 'assistant', 'tool_use'];
		const others: StreamEventWire['event'][] = [
			'tool_result',
			'user',
			'session',
			'result',
			'role_switch',
		];
		expect(blocks.every((e) => supersedesDrafts(e))).toBe(true);
		expect(others.some((e) => supersedesDrafts(e))).toBe(false);
	});

	it('tool_progress met à jour les secondes de l appel visé', () => {
		let msgs = reduceStreamEvent([], ev(1, 'tool_use', { id: 't1', name: 'Bash', input: {} }));
		msgs = applyStreamDelta(
			msgs,
			d({ kind: 'tool_progress', toolUseId: 't1', toolName: 'Bash', elapsedSeconds: 7 }),
		);
		const seg = msgs[0].segments[0];
		expect(seg.kind === 'tool' && seg.call.elapsedSeconds).toBe(7);
	});

	it('un delta sans cible ne recrée pas la liste', () => {
		const msgs = reduceStreamEvent(
			[],
			ev(1, 'tool_use', { id: 't1', name: 'Bash', input: {} }),
		);
		const same = applyStreamDelta(
			msgs,
			d({ kind: 'tool_progress', toolUseId: 'inconnu', toolName: 'Bash', elapsedSeconds: 7 }),
		);
		expect(same).toBe(msgs);
	});

	it('api_retry ne touche pas au fil de discussion', () => {
		const msgs = reduceStreamEvent([], ev(1, 'assistant', { text: 'a' }));
		expect(
			applyStreamDelta(
				msgs,
				d({ kind: 'api_retry', attempt: 1, maxRetries: 5, delayMs: 10 }),
			),
		).toBe(msgs);
	});
});

describe('identité des messages (prérequis du memo)', () => {
	it('tool_result ne recrée que la bulle qui porte l outil', () => {
		let msgs = reduceStreamEvent([], ev(1, 'user', { text: 'salut' }));
		msgs = reduceStreamEvent(msgs, ev(2, 'tool_use', { id: 't1', name: 'Read', input: {} }));
		const before = msgs;
		const after = reduceStreamEvent(
			msgs,
			ev(3, 'tool_result', { tool_use_id: 't1', content: 'ok' }),
		);
		expect(after[0]).toBe(before[0]); // bulle user intacte
		expect(after[1]).not.toBe(before[1]); // bulle de l outil patchée
	});

	it('un delta ne recrée que la dernière bulle', () => {
		let msgs = reduceStreamEvent([], ev(1, 'user', { text: 'salut' }));
		msgs = applyStreamDelta(msgs, { kind: 'text', text: 'a' });
		const before = msgs;
		const after = applyStreamDelta(msgs, { kind: 'text', text: 'b' });
		expect(after[0]).toBe(before[0]);
		expect(after[1]).not.toBe(before[1]);
	});
});
