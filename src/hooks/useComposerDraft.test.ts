import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposerDraft } from './useComposerDraft';
import { clearComposerDraft } from '@/lib/composerDraft';

const image = { name: 'shot.png', mediaType: 'image/png', data: 'AAAA' };

describe('useComposerDraft', () => {
	beforeEach(() => {
		window.localStorage.clear();
		clearComposerDraft('worktree-a');
		clearComposerDraft('worktree-b');
	});

	it('exposes an empty draft for a fresh session', () => {
		const { result } = renderHook(() => useComposerDraft('worktree-a'));
		expect(result.current.text).toBe('');
		expect(result.current.attachments).toEqual([]);
	});

	it('reflects typing back to the caller', () => {
		const { result } = renderHook(() => useComposerDraft('worktree-a'));
		act(() => result.current.setText('en cours'));
		expect(result.current.text).toBe('en cours');
	});

	it('gives each session its own draft when switching back and forth', () => {
		const { result, rerender } = renderHook(({ sid }) => useComposerDraft(sid), {
			initialProps: { sid: 'worktree-a' },
		});
		act(() => result.current.setText('message pour A'));

		rerender({ sid: 'worktree-b' });
		expect(result.current.text).toBe('');
		act(() => result.current.setText('message pour B'));

		rerender({ sid: 'worktree-a' });
		expect(result.current.text).toBe('message pour A');

		rerender({ sid: 'worktree-b' });
		expect(result.current.text).toBe('message pour B');
	});

	it('scopes attachments per session too', () => {
		const { result, rerender } = renderHook(({ sid }) => useComposerDraft(sid), {
			initialProps: { sid: 'worktree-a' },
		});
		act(() => result.current.addAttachment(image));
		expect(result.current.attachments).toHaveLength(1);

		rerender({ sid: 'worktree-b' });
		expect(result.current.attachments).toEqual([]);

		rerender({ sid: 'worktree-a' });
		expect(result.current.attachments).toHaveLength(1);
	});

	it('removes a single attachment by id', () => {
		const { result } = renderHook(() => useComposerDraft('worktree-a'));
		act(() => result.current.addAttachment(image));
		act(() => result.current.addAttachment({ ...image, name: 'other.png' }));
		const firstId = result.current.attachments[0].id;

		act(() => result.current.removeAttachment(firstId));
		expect(result.current.attachments.map((a) => a.name)).toEqual(['other.png']);
	});

	it('clear() empties the current session only', () => {
		const { result, rerender } = renderHook(({ sid }) => useComposerDraft(sid), {
			initialProps: { sid: 'worktree-a' },
		});
		act(() => result.current.setText('à envoyer'));
		act(() => result.current.addAttachment(image));

		rerender({ sid: 'worktree-b' });
		act(() => result.current.setText('intact'));

		rerender({ sid: 'worktree-a' });
		act(() => result.current.clear());
		expect(result.current.text).toBe('');
		expect(result.current.attachments).toEqual([]);

		rerender({ sid: 'worktree-b' });
		expect(result.current.text).toBe('intact');
	});

	it('restores the draft on remount, as after a reload', () => {
		const first = renderHook(() => useComposerDraft('worktree-a'));
		act(() => first.result.current.setText('survit au remount'));
		first.unmount();

		const second = renderHook(() => useComposerDraft('worktree-a'));
		expect(second.result.current.text).toBe('survit au remount');
	});
});
