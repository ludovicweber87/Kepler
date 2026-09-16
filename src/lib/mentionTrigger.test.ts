import { describe, it, expect } from 'vitest';
import { applyMention, findMentionTrigger } from './mentionTrigger';

describe('findMentionTrigger — commandes', () => {
	it('ouvre sur un `/` en début de prompt, `/` seul compris', () => {
		expect(findMentionTrigger('/', 1)).toEqual({
			kind: 'command',
			query: '',
			start: 0,
			end: 1,
		});
		expect(findMentionTrigger('/co', 3)).toMatchObject({ kind: 'command', query: 'co' });
	});

	it('garde les `/` internes dans la requête (commandes de plugin)', () => {
		expect(findMentionTrigger('/ecc:go-test', 12)).toMatchObject({ query: 'ecc:go-test' });
		expect(findMentionTrigger('/a/b', 4)).toMatchObject({ kind: 'command', query: 'a/b' });
	});

	it("n'ouvre pas sur un `/` ailleurs qu'en tête de prompt", () => {
		expect(findMentionTrigger('fix /co', 7)).toBeNull();
		expect(findMentionTrigger('src/lib', 7)).toBeNull();
	});

	it('se ferme dès que le token est terminé par une espace', () => {
		expect(findMentionTrigger('/pr ', 4)).toBeNull();
		expect(findMentionTrigger('/pr done', 8)).toBeNull();
	});
});

describe('findMentionTrigger — fichiers', () => {
	it('ouvre sur un `@` en début de mot, où qu il soit dans le prompt', () => {
		expect(findMentionTrigger('@', 1)).toEqual({ kind: 'file', query: '', start: 0, end: 1 });
		expect(findMentionTrigger('relis @src/lib/a.ts', 19)).toEqual({
			kind: 'file',
			query: 'src/lib/a.ts',
			start: 6,
			end: 19,
		});
		expect(findMentionTrigger('ligne\n@src', 10)).toMatchObject({ query: 'src' });
	});

	it("n'ouvre pas sur un `@` collé à un mot (adresse e-mail)", () => {
		expect(findMentionTrigger('moi@exemple.fr', 14)).toBeNull();
	});
});

describe('findMentionTrigger — caret', () => {
	it('ne lit que ce qui précède le caret', () => {
		expect(findMentionTrigger('@src/lib', 4)).toMatchObject({ query: 'src' });
	});

	it('borne un caret hors limites plutôt que de renvoyer un token fantôme', () => {
		expect(findMentionTrigger('', 12)).toBeNull();
		expect(findMentionTrigger('@a', 99)).toMatchObject({ query: 'a', end: 2 });
		expect(findMentionTrigger('@a', -3)).toBeNull();
	});
});

describe('applyMention', () => {
	it('remplace le token, ajoute une espace et renvoie le caret après elle', () => {
		const trigger = findMentionTrigger('relis @src', 10)!;
		expect(applyMention('relis @src', trigger, 'src/lib/a.ts')).toEqual({
			text: 'relis @src/lib/a.ts ',
			caret: 20,
		});
	});

	it('préserve ce qui suit le caret', () => {
		const text = '@sr merci';
		const trigger = findMentionTrigger(text, 3)!;
		expect(applyMention(text, trigger, 'src/a.ts')).toEqual({
			text: '@src/a.ts  merci',
			caret: 10,
		});
	});

	it('préfixe la commande par un slash', () => {
		const trigger = findMentionTrigger('/co', 3)!;
		expect(applyMention('/co', trigger, 'commit')).toEqual({ text: '/commit ', caret: 8 });
	});
});
