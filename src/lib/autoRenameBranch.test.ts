import { test, expect } from 'vitest';
import { toKarmaKebab, localSlug } from './autoRenameBranch';

test('toKarmaKebab: normalise en kebab et coupe à 50', () => {
	expect(toKarmaKebab('  Feat/Add Google Auth  ')).toBe('feat-add-google-auth');
	expect(toKarmaKebab('feat: "add" auth!')).toBe('feat-add-auth');
	expect(toKarmaKebab('ab')).toBeNull();
});

test('toKarmaKebab: tronque à 4 segments (type + 3 mots max)', () => {
	expect(toKarmaKebab('feat add google auth system now')).toBe('feat-add-google-auth');
});

test('localSlug: déduit le type par mots-clés', () => {
	expect(localSlug('corrige le bug de renommage')).toMatch(/^fix-/);
	expect(localSlug('refactor du composant sidebar')).toMatch(/^refactor-/);
	expect(localSlug('ajoute la documentation du readme')).toMatch(/^docs-/);
	expect(localSlug('écris un test pour le reducer')).toMatch(/^test-/);
	expect(localSlug('bump les dépendances')).toMatch(/^chore-/);
	expect(localSlug('ajoute un bouton de partage')).toMatch(/^feat-/);
});

test('localSlug: filtre les mots vides et garde les mots signifiants', () => {
	expect(localSlug("l'agent ne renomme pas le worktree")).toBe('feat-agent-renomme-worktree');
});

test('localSlug: toujours déterministe et non vide pour un prompt réel', () => {
	const slug = localSlug('Ajoute un système de notifications push');
	expect(slug).not.toBeNull();
	expect(slug).toMatch(/^feat-/);
});

test('localSlug: texte vide → null', () => {
	expect(localSlug('   ')).toBeNull();
});
