import { describe, it, expect } from 'vitest';
import { shouldShowUpdate } from './keplerUpdate';
import type { KeplerUpdateStatus } from '@/types';

function status(over: Partial<KeplerUpdateStatus> = {}): KeplerUpdateStatus {
	return {
		updateAvailable: true,
		branch: 'main',
		defaultBranch: 'main',
		ahead: 0,
		behind: 3,
		remoteSha: 'sha-new',
		...over,
	};
}

describe('shouldShowUpdate', () => {
	it('affiche la bannière quand une mise à jour est disponible', () => {
		expect(shouldShowUpdate(status(), null)).toBe(true);
	});

	it('reste muette si le checkout est à jour', () => {
		expect(shouldShowUpdate(status({ updateAvailable: false }), null)).toBe(false);
	});

	it('reste muette tant que l’agent n’a rien répondu', () => {
		expect(shouldShowUpdate(null, null)).toBe(false);
		expect(shouldShowUpdate(undefined, null)).toBe(false);
	});

	it('respecte un rejet portant sur ce même SHA', () => {
		expect(shouldShowUpdate(status(), 'sha-new')).toBe(false);
	});

	it('réapparaît pour une mise à jour plus récente que le rejet', () => {
		expect(shouldShowUpdate(status({ remoteSha: 'sha-newer' }), 'sha-new')).toBe(true);
	});
});
