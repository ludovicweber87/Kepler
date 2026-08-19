import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	validateSlug,
	slugifyBranchInput,
	dedupeSlug,
	buildBranchNamePrompt,
	generateBranchSlug,
	isAutoNamed,
	worktreeNeedsMove,
	humanizeBranchSlug,
	branchHasUpstream,
	currentBranchName,
	autoRenameBranch,
	type GitExec,
} from './autoRename.js';

// ── validateSlug : format strict type + 1..4 mots-clés anglais kebab ──

test('validateSlug accepts a valid typed slug', () => {
	assert.equal(validateSlug('fix-branch-rename-french-words'), 'fix-branch-rename-french-words');
	assert.equal(validateSlug('feat-google-auth'), 'feat-google-auth');
	assert.equal(validateSlug('chore-bump-deps'), 'chore-bump-deps');
});

test('validateSlug trims whitespace, quotes and backticks from LLM output', () => {
	assert.equal(validateSlug('  feat-google-auth\n'), 'feat-google-auth');
	assert.equal(validateSlug('"fix-stale-header"'), 'fix-stale-header');
	assert.equal(validateSlug('`refactor-chat-reducer`'), 'refactor-chat-reducer');
});

test('validateSlug rejects unknown type prefix', () => {
	assert.equal(validateSlug('feature-google-auth'), null);
	assert.equal(validateSlug('wip-dusty-pine'), null);
});

test('validateSlug rejects missing keywords or too many words', () => {
	assert.equal(validateSlug('fix'), null);
	// type + 5 mots-clés → 6 segments, au-delà de la limite
	assert.equal(validateSlug('fix-one-two-three-four-five'), null);
	// type + 4 mots-clés = 5 segments max → OK
	assert.equal(validateSlug('fix-one-two-three-four'), 'fix-one-two-three-four');
});

test('validateSlug rejects french, accents, uppercase and punctuation', () => {
	assert.equal(validateSlug('fix-régénération-branche'), null);
	assert.equal(validateSlug('Fix-Branch-Rename'), null);
	assert.equal(validateSlug('fix branch rename'), null);
	assert.equal(validateSlug('fix-branch_rename'), null);
	assert.equal(validateSlug(''), null);
});

test('validateSlug rejects over-long output', () => {
	assert.equal(validateSlug(`fix-${'a'.repeat(50)}`), null);
});

test('validateSlug rejects multi-line chatter around the slug', () => {
	assert.equal(validateSlug('Sure! Here is the slug:\nfix-branch-rename'), null);
});

// ── slugifyBranchInput : saisie manuelle → kebab sûr ──

test('slugifyBranchInput normalizes free text to kebab', () => {
	assert.equal(slugifyBranchInput('Fix   Rename Branch'), 'fix-rename-branch');
	assert.equal(slugifyBranchInput('feat/Google Auth'), 'feat-google-auth');
});

test('slugifyBranchInput strips accents', () => {
	assert.equal(slugifyBranchInput('régénération épique'), 'regeneration-epique');
});

test('slugifyBranchInput rejects empty or too-short input', () => {
	assert.equal(slugifyBranchInput('  '), null);
	assert.equal(slugifyBranchInput('#'), null);
});

// ── dedupeSlug : collision → suffixe ──

test('dedupeSlug returns the slug when free', () => {
	assert.equal(dedupeSlug('fix-auth', () => false), 'fix-auth');
});

test('dedupeSlug suffixes on collision', () => {
	const taken = new Set(['fix-auth', 'fix-auth-2']);
	assert.equal(dedupeSlug('fix-auth', (n) => taken.has(n)), 'fix-auth-3');
});

test('dedupeSlug gives up when everything is taken', () => {
	assert.equal(dedupeSlug('fix-auth', () => true), null);
});

// ── buildBranchNamePrompt : prompt anglais, demande la traduction ──

test('buildBranchNamePrompt is english-only and embeds the request', () => {
	const p = buildBranchNamePrompt('Corrige le renommage des branches');
	assert.match(p, /English ONLY/);
	assert.match(p, /Translate/);
	assert.match(p, /Corrige le renommage des branches/);
	assert.match(p, /feat, fix, docs, refactor, test, chore/);
});

test('buildBranchNamePrompt truncates very long requests', () => {
	const p = buildBranchNamePrompt('x'.repeat(5000));
	assert.ok(p.length < 2500);
});

// ── generateBranchSlug : runner injecté, jamais de throw ──

test('generateBranchSlug returns a validated slug', async () => {
	const slug = await generateBranchSlug('fix the rename', async () => 'fix-branch-rename\n');
	assert.equal(slug, 'fix-branch-rename');
});

test('generateBranchSlug returns null on invalid output (no local fallback)', async () => {
	const slug = await generateBranchSlug('corrige le bug', async () => 'fix-régénération');
	assert.equal(slug, null);
});

test('generateBranchSlug returns null when the runner throws', async () => {
	const slug = await generateBranchSlug('anything', async () => {
		throw new Error('timeout');
	});
	assert.equal(slug, null);
});

// ── isAutoNamed ──

test('isAutoNamed matches only wip- branches', () => {
	assert.equal(isAutoNamed('wip-dusty-pine'), true);
	assert.equal(isAutoNamed('fix-branch-rename'), false);
	assert.equal(isAutoNamed(null), false);
	assert.equal(isAutoNamed(undefined), false);
});

// ── worktreeNeedsMove : dossier wip- à réaligner sur une branche finale ──

test('worktreeNeedsMove: true quand branche finale mais dossier resté wip-', () => {
	assert.equal(
		worktreeNeedsMove({
			id: '1',
			branch: 'fix-snackbar-bottom-center',
			worktree_path: '/repo/.worktrees/wip-dusty-pine-zllm',
		}),
		true,
	);
});

test('worktreeNeedsMove: false quand dossier déjà aligné sur la branche', () => {
	assert.equal(
		worktreeNeedsMove({
			id: '1',
			branch: 'fix-snackbar-bottom-center',
			worktree_path: '/repo/.worktrees/fix-snackbar-bottom-center',
		}),
		false,
	);
});

test('worktreeNeedsMove: false quand la branche est encore wip- (phase 1)', () => {
	assert.equal(
		worktreeNeedsMove({
			id: '1',
			branch: 'wip-dusty-pine-zllm',
			worktree_path: '/repo/.worktrees/wip-dusty-pine-zllm',
		}),
		false,
	);
});

test('worktreeNeedsMove: false quand le dossier est nommé manuellement (pas wip-)', () => {
	assert.equal(
		worktreeNeedsMove({
			id: '1',
			branch: 'feat-115-truc',
			worktree_path: '/repo/.worktrees/feat-115-fix-chat',
		}),
		false,
	);
});

test('worktreeNeedsMove: false sans branche ou sans worktree_path', () => {
	assert.equal(worktreeNeedsMove({ id: '1', branch: null, worktree_path: '/x/wip-a' }), false);
	assert.equal(worktreeNeedsMove({ id: '1', branch: 'fix-a', worktree_path: null }), false);
});

// ── humanizeBranchSlug : slug typé → label sidebar ──

test('humanizeBranchSlug strips the conventional type prefix and capitalizes', () => {
	assert.equal(humanizeBranchSlug('feat-add-login'), 'Add login');
	assert.equal(humanizeBranchSlug('fix-stale-header'), 'Stale header');
	assert.equal(humanizeBranchSlug('refactor-chat-reducer'), 'Chat reducer');
});

test('humanizeBranchSlug keeps a slug without a known type prefix', () => {
	assert.equal(humanizeBranchSlug('add-login-screen'), 'Add login screen');
});

test('humanizeBranchSlug returns empty string when nothing usable remains', () => {
	assert.equal(humanizeBranchSlug(''), '');
	assert.equal(humanizeBranchSlug('feat-'), '');
});

// ── seams git : branchHasUpstream / currentBranchName ──

const okExec = (out: string): GitExec => () => out;
const failExec: GitExec = () => {
	throw new Error('fatal: no upstream configured');
};

test('branchHasUpstream: true when git resolves @{upstream}, false when it throws', () => {
	assert.equal(branchHasUpstream(okExec('origin/feat-x\n')), true);
	assert.equal(branchHasUpstream(failExec), false);
});

test('currentBranchName: trims output, null on detached HEAD or error', () => {
	assert.equal(currentBranchName(okExec('  wip-swift-pine-vgvo\n')), 'wip-swift-pine-vgvo');
	assert.equal(currentBranchName(okExec('HEAD\n')), null);
	assert.equal(currentBranchName(failExec), null);
});

// ── buildBranchNamePrompt : contexte assistant optionnel ──

test('buildBranchNamePrompt appends the assistant response only when present', () => {
	const withoutAssistant = buildBranchNamePrompt('Do the thing');
	assert.ok(!withoutAssistant.includes("Agent's initial response"));
	const withAssistant = buildBranchNamePrompt('Do the thing', 'I will explore the code first');
	assert.ok(withAssistant.includes("Agent's initial response"));
	assert.ok(withAssistant.includes('I will explore the code first'));
});

// ── autoRenameBranch : ordre des gates (sans DB) ──

test('autoRenameBranch skips a branch that is not auto-named', async () => {
	const verdict = await autoRenameBranch(
		'sid',
		{ id: '1', branch: 'feat/task', worktree_path: '/x/feat-task' },
		{ gitExec: failExec },
	);
	assert.equal(verdict.outcome, 'skip');
	assert.match(verdict.reason, /not auto-named/);
});

test('autoRenameBranch skips when the branch already has an upstream (before any generation)', async () => {
	let generated = false;
	const verdict = await autoRenameBranch(
		'sid',
		{ id: '1', branch: 'wip-swift-pine', worktree_path: '/x/wip-swift-pine' },
		{
			gitExec: okExec('origin/wip-swift-pine\n'),
			run: async () => {
				generated = true;
				return 'feat-x';
			},
		},
	);
	assert.equal(verdict.outcome, 'skip');
	assert.match(verdict.reason, /upstream/);
	assert.equal(generated, false, 'generation must not run once the upstream gate skips');
});
