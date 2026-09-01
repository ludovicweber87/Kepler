import { test } from 'node:test';
import assert from 'node:assert';
import {
	tmuxNamesToKill,
	baseSessionId,
	selectOrphanTmuxSessions,
	selectDeadSdkSessions,
} from './sessionLifecycle.js';

const ID = 'kepler--Users-x-session-mruclnue';

test('tmuxNamesToKill emporte la session et tous ses onglets shell', () => {
	const all = [ID, `${ID}-shell`, `${ID}-shell-1`, `${ID}-shell-12`];
	assert.deepEqual(tmuxNamesToKill(ID, all), all);
});

test('tmuxNamesToKill ne touche pas aux autres sessions', () => {
	const other = 'kepler--Users-x-session-autre';
	assert.deepEqual(tmuxNamesToKill(ID, [ID, other, `${other}-shell-1`]), [ID]);
});

test('tmuxNamesToKill ignore les noms absents de la liste réelle', () => {
	assert.deepEqual(tmuxNamesToKill(ID, [`${ID}-shell-2`]), [`${ID}-shell-2`]);
	assert.deepEqual(tmuxNamesToKill(ID, []), []);
});

test('baseSessionId retire le suffixe shell, indexé ou non', () => {
	assert.equal(baseSessionId(`${ID}-shell`), ID);
	assert.equal(baseSessionId(`${ID}-shell-1`), ID);
	assert.equal(baseSessionId(ID), ID);
});

const NOW = 1_000_000;
const GRACE = 300_000;
const old = (name: string) => ({ name, createdAt: NOW - GRACE - 1 });

test('selectOrphanTmuxSessions cible les sessions sans ligne en base', () => {
	const snaps = [old(ID), old('kepler--Users-x-session-vivante')];
	const known = new Set(['kepler--Users-x-session-vivante']);
	assert.deepEqual(selectOrphanTmuxSessions(snaps, known, NOW, GRACE), [ID]);
});

test('selectOrphanTmuxSessions rattache un onglet shell à sa session', () => {
	const snaps = [old(`${ID}-shell-1`)];
	assert.deepEqual(selectOrphanTmuxSessions(snaps, new Set([ID]), NOW, GRACE), []);
	assert.deepEqual(selectOrphanTmuxSessions(snaps, new Set(), NOW, GRACE), [`${ID}-shell-1`]);
});

test('selectOrphanTmuxSessions épargne une session encore dans son délai de grâce', () => {
	const snaps = [{ name: ID, createdAt: NOW - 1000 }];
	assert.deepEqual(selectOrphanTmuxSessions(snaps, new Set(), NOW, GRACE), []);
});

test("selectOrphanTmuxSessions ne touche pas aux sessions tmux d'autres outils", () => {
	const snaps = [old('mon-projet-perso'), old('scratch')];
	assert.deepEqual(selectOrphanTmuxSessions(snaps, new Set(), NOW, GRACE), []);
});

test('selectDeadSdkSessions repère un cwd disparu', () => {
	const active = [
		{ sessionId: 'a', cwd: '/wt/vivant' },
		{ sessionId: 'b', cwd: '/wt/supprime' },
	];
	const exists = (p: string) => p === '/wt/vivant';
	assert.deepEqual(selectDeadSdkSessions(active, exists), ['b']);
});

test('selectDeadSdkSessions ignore une session sans cwd', () => {
	assert.deepEqual(
		selectDeadSdkSessions([{ sessionId: 'a', cwd: '' }], () => false),
		[],
	);
});
