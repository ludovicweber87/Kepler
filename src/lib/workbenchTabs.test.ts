import { describe, it, expect } from 'vitest';
import {
	matchFileDiff,
	resolveTabAfterClose,
	addOpenFile,
	isSessionTab,
	CHAT_TAB,
	READER_TAB,
} from './workbenchTabs';
import type { FileDiff } from './gitDiff';

const f = (path: string): FileDiff => ({ path, additions: 0, deletions: 0, hunks: [] });

describe('matchFileDiff', () => {
	const files = [f('src/a.ts'), f('src/b.ts')];
	it('matches by exact relative path', () => {
		expect(matchFileDiff(files, 'src/a.ts')?.path).toBe('src/a.ts');
	});
	it('matches an absolute path by suffix', () => {
		expect(matchFileDiff(files, '/repo/root/src/b.ts')?.path).toBe('src/b.ts');
	});
	it('returns undefined when absent or null', () => {
		expect(matchFileDiff(files, 'src/missing.ts')).toBeUndefined();
		expect(matchFileDiff(files, null)).toBeUndefined();
	});
});

describe('addOpenFile', () => {
	it('appends a new path', () => {
		expect(addOpenFile(['a'], 'b')).toEqual(['a', 'b']);
	});
	it('is a no-op for an already open path', () => {
		expect(addOpenFile(['a', 'b'], 'b')).toEqual(['a', 'b']);
	});
});

describe('isSessionTab', () => {
	it('is true for the session views (chat & reader)', () => {
		expect(isSessionTab(CHAT_TAB)).toBe(true);
		expect(isSessionTab(READER_TAB)).toBe(true);
	});
	it('is false for a file path', () => {
		expect(isSessionTab('src/a.ts')).toBe(false);
		expect(isSessionTab('/repo/root/src/b.ts')).toBe(false);
	});
	it('does not match a file merely named like a session tab', () => {
		expect(isSessionTab('src/reader.ts')).toBe(false);
		expect(isSessionTab('chat/index.ts')).toBe(false);
	});
});

describe('resolveTabAfterClose', () => {
	it('keeps active tab when closing a non-active file', () => {
		expect(resolveTabAfterClose(['a', 'b'], 'a', 'b')).toBe('b');
	});
	it('falls back to previous neighbour when closing the active file', () => {
		expect(resolveTabAfterClose(['a', 'b', 'c'], 'b', 'b')).toBe('a');
	});
	it('falls back to chat when closing the only/first open file', () => {
		expect(resolveTabAfterClose(['a'], 'a', 'a')).toBe(CHAT_TAB);
	});
	it('picks the new first file when closing the first of several', () => {
		expect(resolveTabAfterClose(['a', 'b'], 'a', 'a')).toBe('b');
	});
});
