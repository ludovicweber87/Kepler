import { describe, it, expect } from 'vitest';
import { selectRemoteBase } from './gitBase.js';

describe('selectRemoteBase', () => {
	it('dérive la base depuis le symbolic-ref origin/HEAD', () => {
		expect(
			selectRemoteBase({
				symbolicRef: 'refs/remotes/origin/main',
				hasOriginMain: true,
				hasOriginMaster: false,
			}),
		).toBe('origin/main');
	});

	it('gère un repo dont la HEAD distante pointe sur master', () => {
		expect(
			selectRemoteBase({
				symbolicRef: 'refs/remotes/origin/master',
				hasOriginMain: false,
				hasOriginMaster: true,
			}),
		).toBe('origin/master');
	});

	it('sans symbolic-ref, préfère origin/main s’il existe', () => {
		expect(
			selectRemoteBase({
				symbolicRef: null,
				hasOriginMain: true,
				hasOriginMaster: true,
			}),
		).toBe('origin/main');
	});

	it('sans symbolic-ref ni origin/main, retombe sur origin/master', () => {
		expect(
			selectRemoteBase({
				symbolicRef: null,
				hasOriginMain: false,
				hasOriginMaster: true,
			}),
		).toBe('origin/master');
	});

	it('défaut origin/main quand aucun signal', () => {
		expect(
			selectRemoteBase({
				symbolicRef: null,
				hasOriginMain: false,
				hasOriginMaster: false,
			}),
		).toBe('origin/main');
	});
});
