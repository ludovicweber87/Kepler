import { test } from 'node:test';
import assert from 'node:assert';
import { selectRemoteBase } from './gitBase.js';

test('dérive la base depuis le symbolic-ref origin/HEAD', () => {
	assert.equal(
		selectRemoteBase({
			symbolicRef: 'refs/remotes/origin/main',
			hasOriginMain: true,
			hasOriginMaster: false,
		}),
		'origin/main',
	);
});

test('gère un repo dont la HEAD distante pointe sur master', () => {
	assert.equal(
		selectRemoteBase({
			symbolicRef: 'refs/remotes/origin/master',
			hasOriginMain: false,
			hasOriginMaster: true,
		}),
		'origin/master',
	);
});

test('sans symbolic-ref, préfère origin/main s’il existe', () => {
	assert.equal(
		selectRemoteBase({
			symbolicRef: null,
			hasOriginMain: true,
			hasOriginMaster: true,
		}),
		'origin/main',
	);
});

test('sans symbolic-ref ni origin/main, retombe sur origin/master', () => {
	assert.equal(
		selectRemoteBase({
			symbolicRef: null,
			hasOriginMain: false,
			hasOriginMaster: true,
		}),
		'origin/master',
	);
});

test('défaut origin/main quand aucun signal', () => {
	assert.equal(
		selectRemoteBase({
			symbolicRef: null,
			hasOriginMain: false,
			hasOriginMaster: false,
		}),
		'origin/main',
	);
});
