import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getComposerDraft,
	setComposerDraft,
	clearComposerDraft,
	getComposerAttachments,
	setComposerAttachments,
	subscribeComposerDraft,
	nextAttachmentId,
} from './composerDraft';

const DRAFTS_KEY = 'kepler.composerDrafts';
const LEGACY_DRAFTS_KEY = 'devora.composerDrafts';

const image = (id: string) => ({ id, name: `${id}.png`, mediaType: 'image/png', data: 'AAAA' });

describe('composer draft persistence', () => {
	beforeEach(() => {
		window.localStorage.clear();
		// Horloge monotone : rend l'ordre d'éviction déterministe.
		let clock = 0;
		vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns an empty draft when nothing is stored', () => {
		expect(getComposerDraft('s1')).toBe('');
	});

	it('still reads drafts stored under the former key name', () => {
		window.localStorage.setItem(
			LEGACY_DRAFTS_KEY,
			JSON.stringify({ s1: { text: 'écrit avant le renommage', updatedAt: 1 } }),
		);
		expect(getComposerDraft('s1')).toBe('écrit avant le renommage');
	});

	it('prefers the current key when both are present', () => {
		window.localStorage.setItem(
			LEGACY_DRAFTS_KEY,
			JSON.stringify({ s1: { text: 'ancien', updatedAt: 1 } }),
		);
		window.localStorage.setItem(
			DRAFTS_KEY,
			JSON.stringify({ s1: { text: 'nouveau', updatedAt: 2 } }),
		);
		expect(getComposerDraft('s1')).toBe('nouveau');
	});

	it('keeps one draft per session', () => {
		setComposerDraft('s1', 'hello from worktree one');
		setComposerDraft('s2', 'hello from worktree two');
		expect(getComposerDraft('s1')).toBe('hello from worktree one');
		expect(getComposerDraft('s2')).toBe('hello from worktree two');
	});

	it('overwrites the draft of a session without touching the others', () => {
		setComposerDraft('s1', 'first');
		setComposerDraft('s2', 'untouched');
		setComposerDraft('s1', 'second');
		expect(getComposerDraft('s1')).toBe('second');
		expect(getComposerDraft('s2')).toBe('untouched');
	});

	it('drops the entry when the draft becomes empty', () => {
		setComposerDraft('s1', 'typing');
		setComposerDraft('s1', '');
		expect(getComposerDraft('s1')).toBe('');
		expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? '{}')).toEqual({});
	});

	it('clearing a draft removes both text and attachments', () => {
		setComposerDraft('s1', 'with image');
		setComposerAttachments('s1', [image('a1')]);
		clearComposerDraft('s1');
		expect(getComposerDraft('s1')).toBe('');
		expect(getComposerAttachments('s1')).toEqual([]);
	});

	it('evicts the least recently edited drafts past the cap', () => {
		for (let i = 0; i < 51; i += 1) setComposerDraft(`s${i}`, `draft ${i}`);
		expect(getComposerDraft('s0')).toBe('');
		expect(getComposerDraft('s1')).toBe('draft 1');
		expect(getComposerDraft('s50')).toBe('draft 50');
		expect(
			Object.keys(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? '{}')),
		).toHaveLength(50);
	});

	it('keeps a re-edited draft alive when eviction kicks in', () => {
		for (let i = 0; i < 50; i += 1) setComposerDraft(`s${i}`, `draft ${i}`);
		setComposerDraft('s0', 'still writing');
		setComposerDraft('s50', 'newcomer');
		expect(getComposerDraft('s0')).toBe('still writing');
		expect(getComposerDraft('s1')).toBe('');
	});

	it('survives a corrupted payload', () => {
		window.localStorage.setItem(DRAFTS_KEY, '{not json');
		expect(getComposerDraft('s1')).toBe('');
		setComposerDraft('s1', 'recovered');
		expect(getComposerDraft('s1')).toBe('recovered');
	});

	it('keeps the draft usable when localStorage refuses writes', () => {
		vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError');
		});
		setComposerDraft('s1', 'typed without storage');
		expect(getComposerDraft('s1')).toBe('typed without storage');
		clearComposerDraft('s1');
		expect(getComposerDraft('s1')).toBe('');
	});

	it('ignores malformed entries', () => {
		window.localStorage.setItem(
			DRAFTS_KEY,
			JSON.stringify({ s1: 'plain string', s2: { text: 42 }, s3: { text: 'valid' } }),
		);
		expect(getComposerDraft('s1')).toBe('');
		expect(getComposerDraft('s2')).toBe('');
		expect(getComposerDraft('s3')).toBe('valid');
	});
});

describe('composer attachments', () => {
	beforeEach(() => {
		window.localStorage.clear();
		clearComposerDraft('s1');
		clearComposerDraft('s2');
	});

	it('keeps attachments per session', () => {
		setComposerAttachments('s1', [image('a1')]);
		setComposerAttachments('s2', [image('a2'), image('a3')]);
		expect(getComposerAttachments('s1').map((a) => a.id)).toEqual(['a1']);
		expect(getComposerAttachments('s2').map((a) => a.id)).toEqual(['a2', 'a3']);
	});

	it('does not persist attachments to localStorage', () => {
		setComposerAttachments('s1', [image('a1')]);
		expect(window.localStorage.getItem(DRAFTS_KEY)).toBeNull();
	});

	it('an empty list clears the session entry', () => {
		setComposerAttachments('s1', [image('a1')]);
		setComposerAttachments('s1', []);
		expect(getComposerAttachments('s1')).toEqual([]);
	});

	it('hands out unique attachment ids across sessions', () => {
		const ids = [nextAttachmentId(), nextAttachmentId(), nextAttachmentId()];
		expect(new Set(ids).size).toBe(3);
	});

	it('returns a stable reference when empty, so subscribers do not loop', () => {
		expect(getComposerAttachments('s1')).toBe(getComposerAttachments('s2'));
	});

	it('returns a stable reference while nothing changes', () => {
		setComposerAttachments('s1', [image('a1')]);
		expect(getComposerAttachments('s1')).toBe(getComposerAttachments('s1'));
	});
});

describe('composer draft subscription', () => {
	beforeEach(() => {
		window.localStorage.clear();
		clearComposerDraft('s1');
	});

	it('notifies subscribers on text and attachment writes', () => {
		let calls = 0;
		const unsubscribe = subscribeComposerDraft(() => {
			calls += 1;
		});
		setComposerDraft('s1', 'typing');
		expect(calls).toBe(1);
		setComposerAttachments('s1', [image('a1')]);
		expect(calls).toBe(2);
		unsubscribe();
		setComposerDraft('s1', 'after unsubscribe');
		expect(calls).toBe(2);
	});
});
