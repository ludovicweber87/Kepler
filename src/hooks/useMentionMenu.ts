'use client';

import { useCallback, useMemo, useState, type RefObject } from 'react';
import { filterMentions } from '@/lib/mentionFilter';
import { applyMention, findMentionTrigger, type MentionKind } from '@/lib/mentionTrigger';
import type { SlashCommandInfo } from '@/types';

export interface MentionItem {
	/** Valeur insérée dans le composer, sans le caractère déclencheur. */
	value: string;
	/** Libellé principal : `/commit`, ou le nom de fichier seul. */
	label: string;
	/** Ligne secondaire : description de la commande, ou dossier du fichier. */
	detail?: string;
	/** Forme attendue des arguments, affichée à droite du nom d'une commande. */
	argumentHint?: string;
}

interface Params {
	text: string;
	setText: (text: string) => void;
	/** Commandes de la session, telles que remontées par l'agent. */
	commands: readonly SlashCommandInfo[];
	/** Fichiers du dépôt (chemins relatifs), pour l'autocomplétion `@`. */
	files: readonly string[];
	inputRef: RefObject<HTMLTextAreaElement | null>;
}

const toCommandItem = (c: SlashCommandInfo): MentionItem => ({
	value: c.name,
	label: `/${c.name}`,
	detail: c.description,
	argumentHint: c.argumentHint,
});

const toFileItem = (path: string): MentionItem => {
	const cut = path.lastIndexOf('/');
	return {
		value: path,
		// Le nom de fichier porte l'information ; le dossier ne sert qu'à départager
		// les homonymes, il passe donc en ligne secondaire.
		label: cut === -1 ? path : path.slice(cut + 1),
		detail: cut === -1 ? undefined : path.slice(0, cut),
	};
};

/**
 * Autocomplétion du composer : `/` liste les commandes de la session, `@` les
 * fichiers du dépôt. Le hook ne possède que l'état du menu — le texte reste la
 * propriété du brouillon de session (`useComposerDraft`), passé en paramètre.
 */
export function useMentionMenu({ text, setText, commands, files, inputRef }: Params) {
	const [caret, setCaret] = useState(0);
	const [activeIndex, setActiveIndex] = useState(0);
	/**
	 * Échap ne ferme le menu que pour le token courant, identifié par sa position.
	 * Repartir sur un autre déclencheur rouvre : sans ça, un Échap malheureux
	 * couperait l'autocomplétion pour tout le reste du message.
	 */
	const [dismissed, setDismissed] = useState<string | null>(null);

	const trigger = useMemo(() => findMentionTrigger(text, caret), [text, caret]);
	const triggerId = trigger ? `${trigger.kind}:${trigger.start}` : null;

	const items = useMemo<MentionItem[]>(() => {
		if (!trigger) return [];
		if (trigger.kind === 'command')
			return filterMentions(commands, trigger.query, (c) => [
				c.name,
				...(c.aliases ?? []),
			]).map(toCommandItem);
		return filterMentions(files, trigger.query, (f) => [f]).map(toFileItem);
	}, [trigger, commands, files]);

	// Ajustement pendant le rendu (pattern React de reset d'état sur changement de
	// prop) plutôt qu'un effet : la sélection doit revenir en tête dès que la liste
	// change, sans rendu intermédiaire où l'index pointerait à côté.
	const listKey = `${triggerId ?? ''}|${trigger?.query ?? ''}`;
	const [prevListKey, setPrevListKey] = useState(listKey);
	if (listKey !== prevListKey) {
		setPrevListKey(listKey);
		setActiveIndex(0);
	}

	const open = trigger !== null && items.length > 0 && dismissed !== triggerId;
	const kind: MentionKind | null = trigger?.kind ?? null;

	/** Recale le caret depuis le DOM : frappe, clic, flèches, sélection à la souris. */
	const syncCaret = useCallback(() => {
		const el = inputRef.current;
		if (el) setCaret(el.selectionStart ?? 0);
	}, [inputRef]);

	const handleChange = useCallback(
		(value: string, nextCaret: number) => {
			setText(value);
			setCaret(nextCaret);
		},
		[setText],
	);

	const select = useCallback(
		(index: number) => {
			const item = items[index];
			if (!trigger || !item) return;
			const next = applyMention(text, trigger, item.value);
			setText(next.text);
			setCaret(next.caret);
			setDismissed(null);
			// React réécrit la valeur du textarea au rendu suivant et y replace le
			// caret en fin de champ : on le repositionne une fois la valeur peinte.
			requestAnimationFrame(() => {
				const el = inputRef.current;
				if (!el) return;
				el.focus();
				el.setSelectionRange(next.caret, next.caret);
			});
		},
		[items, trigger, text, setText, inputRef],
	);

	/**
	 * Renvoie `true` quand la touche a été consommée par le menu : l'appelant doit
	 * alors couper le comportement par défaut du composer (Entrée = envoyer).
	 */
	const handleKey = useCallback(
		(key: string): boolean => {
			if (!open) return false;
			switch (key) {
				case 'ArrowDown':
					setActiveIndex((i) => (i + 1) % items.length);
					return true;
				case 'ArrowUp':
					setActiveIndex((i) => (i - 1 + items.length) % items.length);
					return true;
				case 'Enter':
				case 'Tab':
					select(activeIndex);
					return true;
				case 'Escape':
					setDismissed(triggerId);
					return true;
				default:
					return false;
			}
		},
		[open, items.length, activeIndex, select, triggerId],
	);

	return {
		open,
		kind,
		items,
		activeIndex,
		setActiveIndex,
		select,
		handleKey,
		handleChange,
		syncCaret,
	};
}
