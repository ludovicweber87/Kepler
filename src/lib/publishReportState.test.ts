import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getPublishPhase,
	setPublishPhase,
	isPublishing,
	resetPublishPhases,
	subscribePublishPhase,
} from './publishReportState';

describe('publish report phase store', () => {
	beforeEach(() => {
		resetPublishPhases();
	});

	it('reports idle for an unknown session', () => {
		expect(getPublishPhase('s1')).toBe('idle');
		expect(isPublishing('s1')).toBe(false);
	});

	it('keeps one phase per session', () => {
		setPublishPhase('s1', 'synthesizing');
		expect(getPublishPhase('s1')).toBe('synthesizing');
		// Le worktree voisin ne doit pas hériter du spinner.
		expect(getPublishPhase('s2')).toBe('idle');
		expect(isPublishing('s2')).toBe(false);
	});

	it('lets two sessions publish at the same time', () => {
		setPublishPhase('s1', 'publishing');
		setPublishPhase('s2', 'synthesizing');
		expect(isPublishing('s1')).toBe(true);
		expect(isPublishing('s2')).toBe(true);
		setPublishPhase('s1', 'published');
		expect(getPublishPhase('s1')).toBe('published');
		expect(getPublishPhase('s2')).toBe('synthesizing');
	});

	it('treats synthesizing as an in-flight publication', () => {
		setPublishPhase('s1', 'synthesizing');
		expect(isPublishing('s1')).toBe(true);
	});

	it('releases the entry on idle', () => {
		setPublishPhase('s1', 'publishing');
		setPublishPhase('s1', 'idle');
		expect(getPublishPhase('s1')).toBe('idle');
		expect(isPublishing('s1')).toBe(false);
	});

	it('notifies subscribers only when the phase changes', () => {
		const listener = vi.fn();
		const unsubscribe = subscribePublishPhase(listener);
		setPublishPhase('s1', 'publishing');
		expect(listener).toHaveBeenCalledTimes(1);
		setPublishPhase('s1', 'publishing');
		expect(listener).toHaveBeenCalledTimes(1);
		setPublishPhase('s1', 'published');
		expect(listener).toHaveBeenCalledTimes(2);
		unsubscribe();
		setPublishPhase('s1', 'idle');
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
