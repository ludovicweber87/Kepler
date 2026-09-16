import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMentionMenu } from './useMentionMenu';
import type { SlashCommandInfo } from '@/types';

const commands: SlashCommandInfo[] = [
	{ name: 'commit', description: 'Commit les changements', argumentHint: '<message>' },
	{ name: 'pr', description: 'Ouvre une PR', argumentHint: '' },
	{ name: 'usage', description: 'Coût de la session', argumentHint: '', aliases: ['cost'] },
];
const files = ['src/lib/mentionTrigger.ts', 'src/hooks/useMentionMenu.ts', 'README.md'];

/**
 * Le hook pilote un vrai textarea : c'est lui qui porte le caret et reçoit le
 * focus après une insertion. On en monte un pour tester au plus près du réel.
 */
function setup(initialText = '') {
	const textarea = document.createElement('textarea');
	document.body.appendChild(textarea);
	const inputRef = { current: textarea };
	const state = { text: initialText };

	const hook = renderHook(
		({ text }) =>
			useMentionMenu({
				text,
				setText: (t) => {
					state.text = t;
					// React réécrit la valeur du champ contrôlé : sans ça le textarea
					// resterait court et le navigateur ramènerait le caret à sa fin.
					textarea.value = t;
					hook.rerender({ text: t });
				},
				commands,
				files,
				inputRef,
			}),
		{ initialProps: { text: initialText } },
	);

	/** Simule une frappe : met à jour le textarea, son caret, puis le hook. */
	const type = (text: string, caret = text.length) => {
		textarea.value = text;
		textarea.setSelectionRange(caret, caret);
		act(() => hook.result.current.handleChange(text, caret));
	};
	return { ...hook, type, state, textarea };
}

beforeEach(() => {
	document.body.innerHTML = '';
	// `select` repositionne le caret au frame suivant : on l'exécute tout de suite.
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	});
});

describe('menu des commandes (/)', () => {
	it('ouvre sur un `/` en tête de prompt et liste toutes les commandes', () => {
		const { result, type } = setup();
		expect(result.current.open).toBe(false);
		type('/');
		expect(result.current.open).toBe(true);
		expect(result.current.kind).toBe('command');
		expect(result.current.items.map((i) => i.label)).toEqual(['/commit', '/pr', '/usage']);
	});

	it('filtre à la frappe et expose description et forme des arguments', () => {
		const { result, type } = setup();
		type('/com');
		expect(result.current.items).toEqual([
			{
				value: 'commit',
				label: '/commit',
				detail: 'Commit les changements',
				argumentHint: '<message>',
			},
		]);
	});

	it('trouve une commande par son alias', () => {
		const { result, type } = setup();
		type('/cost');
		expect(result.current.items.map((i) => i.value)).toEqual(['usage']);
	});

	it('reste fermé quand le `/` n est pas en tête de prompt', () => {
		const { result, type } = setup();
		type('relis /com');
		expect(result.current.open).toBe(false);
	});

	it('insère la commande choisie, suivie d une espace', () => {
		const { result, type, state } = setup();
		type('/com');
		act(() => result.current.select(0));
		expect(state.text).toBe('/commit ');
		expect(result.current.open).toBe(false);
	});
});

describe('menu des fichiers (@)', () => {
	it('propose le nom de fichier en libellé et son dossier en détail', () => {
		const { result, type } = setup();
		type('relis @mentionT');
		expect(result.current.kind).toBe('file');
		// Le préfixe du nom de fichier passe devant la sous-séquence
		// (`useMentionMenu.ts` contient bien m-e-n-t-i-o-n…t, mais plus loin).
		expect(result.current.items[0]).toEqual({
			value: 'src/lib/mentionTrigger.ts',
			label: 'mentionTrigger.ts',
			detail: 'src/lib',
		});
		expect(result.current.items.map((i) => i.value)).not.toContain('README.md');
	});

	it('insère le chemin relatif complet sans toucher au reste du message', () => {
		const { result, type, state } = setup();
		type('relis @README merci', 13);
		act(() => result.current.select(0));
		expect(state.text).toBe('relis @README.md  merci');
	});
});

describe('clavier', () => {
	it('déplace la sélection en boucle avec les flèches', () => {
		const { result, type } = setup();
		type('/');
		act(() => void result.current.handleKey('ArrowDown'));
		expect(result.current.activeIndex).toBe(1);
		act(() => void result.current.handleKey('ArrowUp'));
		act(() => void result.current.handleKey('ArrowUp'));
		expect(result.current.activeIndex).toBe(2);
	});

	it('valide avec Entrée comme avec Tab, et consomme la touche', () => {
		const { result, type, state } = setup();
		type('/');
		act(() => void result.current.handleKey('ArrowDown'));
		let handled = false;
		act(() => {
			handled = result.current.handleKey('Enter');
		});
		expect(handled).toBe(true);
		expect(state.text).toBe('/pr ');
	});

	it('laisse passer les touches quand le menu est fermé, Entrée comprise', () => {
		const { result, type } = setup();
		type('bonjour');
		expect(result.current.handleKey('Enter')).toBe(false);
		expect(result.current.handleKey('ArrowDown')).toBe(false);
	});

	it('remet la sélection en tête dès que la liste change', () => {
		const { result, type } = setup();
		type('/');
		act(() => void result.current.handleKey('ArrowDown'));
		expect(result.current.activeIndex).toBe(1);
		type('/com');
		expect(result.current.activeIndex).toBe(0);
	});

	it('Échap ferme le menu du token courant mais laisse rouvrir le suivant', () => {
		const { result, type } = setup();
		type('@src');
		act(() => void result.current.handleKey('Escape'));
		expect(result.current.open).toBe(false);
		// Même token, frappe supplémentaire : reste fermé, l'utilisateur a tranché.
		type('@src/l');
		expect(result.current.open).toBe(false);
		// Nouveau token : le menu revient.
		type('@src/l @READ');
		expect(result.current.open).toBe(true);
	});
});

describe('caret', () => {
	it('se resynchronise sur un déplacement sans frappe', () => {
		const { result, type, textarea } = setup();
		type('@README fin');
		expect(result.current.open).toBe(false);
		textarea.setSelectionRange(4, 4);
		act(() => result.current.syncCaret());
		expect(result.current.open).toBe(true);
		expect(result.current.items.map((i) => i.value)).toEqual(['README.md']);
	});

	it('replace le caret dans le textarea après une insertion', () => {
		const { result, type, textarea, state } = setup();
		type('@READ');
		act(() => result.current.select(0));
		// Le textarea contrôlé est réécrit par React ; en test on reflète la valeur.
		expect(state.text).toBe('@README.md ');
		expect(textarea.selectionStart).toBe(11);
	});
});
