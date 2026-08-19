import { test, expect, describe, it } from 'vitest';
import { reduceStreamEvent, userMessage } from './chatReducer';
import type { ChatMessage, StreamEventWire } from '@/types';

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
		expect(m.segments[1]).toEqual({ kind: 'image', url: '/attachments/s/a.png', name: 'a.png' });
	});

	it('empty text with image → only image segment', () => {
		const m = userMessage('', [{ name: 'a.png', url: '/x/a.png' }]);
		expect(m.segments).toEqual([{ kind: 'image', url: '/x/a.png', name: 'a.png' }]);
	});
});
