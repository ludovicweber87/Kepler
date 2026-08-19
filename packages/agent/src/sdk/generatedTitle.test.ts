import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSessionTitle, GENERATED_TITLE_MAX_LENGTH } from './generatedTitle.js';

// ── Cas nominal ──

test('derives a title from a plain first sentence', () => {
	assert.equal(
		deriveSessionTitle('Add a dark mode toggle to the header'),
		'Add a dark mode toggle to the header',
	);
});

test('keeps only the first clause', () => {
	assert.equal(
		deriveSessionTitle('Fix the login bug. Then also refactor the reducer.'),
		'Fix the login bug',
	);
});

test('capitalizes the first letter', () => {
	assert.equal(deriveSessionTitle('refactor the chat reducer'), 'Refactor the chat reducer');
});

// ── Strip du filler (anglais) ──

test('strips English politeness / intent filler', () => {
	assert.equal(
		deriveSessionTitle('Can you please add pagination to the list'),
		'Add pagination to the list',
	);
	assert.equal(deriveSessionTitle("Let's implement the search bar"), 'Implement the search bar');
	assert.equal(deriveSessionTitle('I want you to fix the flaky test'), 'Fix the flaky test');
	assert.equal(deriveSessionTitle('Help me migrate the database'), 'Migrate the database');
});

// ── Strip du filler (français) ──

test('strips French politeness / intent filler', () => {
	assert.equal(deriveSessionTitle('Peux-tu ajouter un mode sombre'), 'Ajouter un mode sombre');
	assert.equal(deriveSessionTitle("J'aimerais que tu corriges le header"), 'Corriges le header');
	assert.equal(deriveSessionTitle('Il faut refactoriser le reducer'), 'Refactoriser le reducer');
	assert.equal(deriveSessionTitle('Merci de mettre à jour la doc'), 'Mettre à jour la doc');
	assert.equal(deriveSessionTitle('stp corrige le bug de login'), 'Corrige le bug de login');
});

// ── Nettoyage markdown / URL / préfixes ──

test('strips markdown punctuation', () => {
	assert.equal(deriveSessionTitle('**Fix** the `header` bug'), 'Fix the header bug');
});

test('strips URLs without leaking fragments', () => {
	const title = deriveSessionTitle(
		'Review https://github.com/foo/bar/merge_requests/42 then merge',
	);
	assert.equal(title, 'Review then merge');
});

test('strips issue/task/PR prefixes', () => {
	assert.equal(
		deriveSessionTitle('Issue #123: fix the crash on startup'),
		'Fix the crash on startup',
	);
	assert.equal(deriveSessionTitle('TASK - build the export feature'), 'Build the export feature');
});

// ── Troncature ──

test('truncates long titles at a word boundary within the max length', () => {
	const title = deriveSessionTitle(
		'Add a comprehensive end to end testing suite covering every single edge case possible',
	);
	assert.ok(title);
	assert.ok(title!.length <= GENERATED_TITLE_MAX_LENGTH);
	assert.ok(!title!.endsWith(' '));
	assert.ok(title!.startsWith('Add a comprehensive'));
});

// ── Cas nuls ──

test('returns null for empty or whitespace-only input', () => {
	assert.equal(deriveSessionTitle(''), null);
	assert.equal(deriveSessionTitle('   \n  '), null);
});

test('returns null when only punctuation remains', () => {
	assert.equal(deriveSessionTitle('!!! ??? ...'), null);
});

test('returns null when only filler remains', () => {
	assert.equal(deriveSessionTitle('please'), null);
});

// ── Robustesse ──

test('folds exotic whitespace into single spaces', () => {
	assert.equal(deriveSessionTitle('Add  the\tfeature'), 'Add the feature');
});

test('preserves accented letters and digits', () => {
	assert.equal(deriveSessionTitle('Générer le rapport Q3 2026'), 'Générer le rapport Q3 2026');
});
