import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCopyTargets } from './resolveCopyTargets.js';

function makeTree(): string {
	const root = mkdtempSync(join(tmpdir(), 'kepler-copy-'));
	writeFileSync(join(root, '.env'), 'ROOT');
	writeFileSync(join(root, '.env.local'), 'ROOT_LOCAL');
	mkdirSync(join(root, 'packages', 'agent'), { recursive: true });
	writeFileSync(join(root, 'packages', 'agent', '.env.local'), 'AGENT_LOCAL');
	mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
	writeFileSync(join(root, 'node_modules', 'pkg', '.env.local'), 'SHOULD_BE_IGNORED');
	return root;
}

test('nom simple → recherche récursive de tous les fichiers correspondants', () => {
	const root = makeTree();
	const rels = resolveCopyTargets(root, ['.env.local']).sort();
	assert.deepEqual(rels, ['.env.local', 'packages/agent/.env.local']);
});

test('ignore node_modules (et autres dossiers exclus)', () => {
	const root = makeTree();
	const rels = resolveCopyTargets(root, ['.env.local']);
	assert.ok(!rels.some((r) => r.includes('node_modules')));
});

test('chemin explicite avec / → conservé tel quel s’il existe', () => {
	const root = makeTree();
	assert.deepEqual(resolveCopyTargets(root, ['packages/agent/.env.local']), [
		'packages/agent/.env.local',
	]);
});

test('chemin explicite inexistant → ignoré', () => {
	const root = makeTree();
	assert.deepEqual(resolveCopyTargets(root, ['packages/web/.env.local']), []);
});

test('préfixe ./ normalisé', () => {
	const root = makeTree();
	assert.deepEqual(resolveCopyTargets(root, ['./.env']), ['.env']);
});

test('déduplication entre plusieurs entrées', () => {
	const root = makeTree();
	const rels = resolveCopyTargets(root, ['.env.local', 'packages/agent/.env.local']).sort();
	assert.deepEqual(rels, ['.env.local', 'packages/agent/.env.local']);
});

test('ne suit pas les symlinks de dossier', () => {
	const root = makeTree();
	try {
		symlinkSync(join(root, 'node_modules'), join(root, 'linked_modules'), 'dir');
	} catch {
		return; // symlink non supporté sur l’environnement de test
	}
	const rels = resolveCopyTargets(root, ['.env.local']);
	assert.ok(!rels.some((r) => r.includes('linked_modules')));
});
