import { test } from 'node:test';
import assert from 'node:assert';
import { buildUpdateStatus, parseRevListCounts, type UpdateSignals } from './keplerUpdate.js';

function signals(over: Partial<UpdateSignals> = {}): UpdateSignals {
	return {
		branch: 'main',
		defaultBranch: 'main',
		ahead: 0,
		behind: 0,
		remoteSha: 'abc123',
		...over,
	};
}

test('réclame une mise à jour quand main est en retard sur origin/main', () => {
	assert.equal(buildUpdateStatus(signals({ behind: 4 })).updateAvailable, true);
});

test('ne réclame rien quand le checkout est à jour', () => {
	assert.equal(buildUpdateStatus(signals({ behind: 0 })).updateAvailable, false);
});

test('ne harcèle pas un checkout sur une branche de feature', () => {
	assert.equal(
		buildUpdateStatus(signals({ branch: 'wip-truc', behind: 12 })).updateAvailable,
		false,
	);
});

test('ne réclame rien sur une HEAD détachée', () => {
	assert.equal(buildUpdateStatus(signals({ branch: null, behind: 3 })).updateAvailable, false);
});

test('ne réclame rien sans remote (pas de SHA distant à comparer)', () => {
	assert.equal(
		buildUpdateStatus(signals({ defaultBranch: null, remoteSha: null, behind: 3 }))
			.updateAvailable,
		false,
	);
});

test('un checkout en avance ET en retard doit quand même se mettre à jour', () => {
	const status = buildUpdateStatus(signals({ ahead: 2, behind: 5 }));
	assert.equal(status.updateAvailable, true);
	assert.equal(status.ahead, 2);
});

test('parse le compteur ahead/behind de git rev-list', () => {
	assert.deepEqual(parseRevListCounts('2\t7\n'), { ahead: 2, behind: 7 });
});

test('dégrade en 0/0 sur une sortie git inattendue', () => {
	assert.deepEqual(parseRevListCounts(''), { ahead: 0, behind: 0 });
	assert.deepEqual(parseRevListCounts('boom'), { ahead: 0, behind: 0 });
});
