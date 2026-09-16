/**
 * Détection du « token d'autocomplétion » sous le caret du composer, et insertion
 * du choix. Logique pure : aucun accès au DOM, tout passe par (texte, caret).
 */

export type MentionKind = 'command' | 'file';

export interface MentionTrigger {
	kind: MentionKind;
	/** Texte saisi entre le caractère déclencheur et le caret. */
	query: string;
	/** Index du caractère déclencheur (`/` ou `@`) dans le texte. */
	start: number;
	/** Fin du token, c'est-à-dire la position du caret. */
	end: number;
}

/**
 * Au-delà, ce n'est plus une frappe d'autocomplétion mais un paragraphe : on
 * arrête de remonter plutôt que de scanner tout le prompt à chaque touche.
 */
const MAX_QUERY_LENGTH = 120;

const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

/**
 * Remonte depuis le caret jusqu'au caractère déclencheur du token courant.
 *
 * `/` n'ouvre le menu qu'en tout début de prompt — c'est la seule position où
 * Claude interprète une slash-command, et c'est le comportement du CLI. `@`
 * s'ouvre partout, pourvu qu'il démarre un mot : `contact@exemple.fr` ne doit
 * pas déclencher un sélecteur de fichiers.
 *
 * Une espace termine toujours le token, ce qui ferme le menu dès que
 * l'utilisateur passe à autre chose.
 */
export function findMentionTrigger(text: string, caret: number): MentionTrigger | null {
	const pos = Math.max(0, Math.min(caret, text.length));
	for (let i = pos - 1; i >= 0 && pos - i <= MAX_QUERY_LENGTH; i--) {
		const ch = text[i];
		if (isSpace(ch)) return null;
		if (ch !== '/' && ch !== '@') continue;
		if (ch === '/') {
			// Un `/` plus loin dans le token est un séparateur de chemin (`@src/lib`,
			// `/agent:skill`) : on continue de remonter au lieu d'abandonner.
			if (i !== 0) continue;
			return { kind: 'command', query: text.slice(1, pos), start: 0, end: pos };
		}
		if (i > 0 && !isSpace(text[i - 1])) return null;
		return { kind: 'file', query: text.slice(i + 1, pos), start: i, end: pos };
	}
	return null;
}

export interface MentionInsertion {
	text: string;
	caret: number;
}

/**
 * Remplace le token par la valeur choisie, suivie d'une espace : le menu se
 * referme de lui-même et l'utilisateur enchaîne sa phrase sans retoucher au caret.
 */
export function applyMention(
	text: string,
	trigger: MentionTrigger,
	value: string,
): MentionInsertion {
	const inserted = `${trigger.kind === 'command' ? '/' : '@'}${value} `;
	return {
		text: text.slice(0, trigger.start) + inserted + text.slice(trigger.end),
		caret: trigger.start + inserted.length,
	};
}
