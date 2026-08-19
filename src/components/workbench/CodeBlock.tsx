'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { Highlighter } from 'shiki';
import { useTranslations } from 'next-intl';
import { languageFromPath, SHIKI_LANGUAGES } from '@/lib/languageFromPath';

/**
 * Métriques alignées sur le viewer de diff (`AgentDiffTab`) : les deux rendus de
 * code de l'app doivent être interchangeables visuellement. `LINE_HEIGHT` est en
 * px (et non en ratio) pour que la gouttière — rendue dans une police plus petite
 * que le code — occupe exactement la même hauteur que la ligne de code.
 */
const FONT = '"JetBrains Mono", monospace';
const FONT_SIZE = '0.72rem';
const LINE_HEIGHT = '20px';
const GUTTER_WIDTH = 44;
const GUTTER_GAP = 8;

/** Au-delà, la tokenisation TextMate bloque trop longtemps le thread principal. */
const MAX_HIGHLIGHT_CHARS = 200_000;

const THEMES = {
	dark: 'github-dark-default',
	light: 'github-light-default',
} as const;

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Chargé une seule fois par session de navigation : le wasm Oniguruma et les
 * grammaires pèsent environ 1 Mo, d'où l'import dynamique.
 *
 * Si l'import ou `createHighlighter` échoue, la promesse rejetée reste mise en
 * cache : un échec de bundle/wasm est déterministe, retenter à chaque fichier
 * ouvert ne ferait que ré-échouer indéfiniment. Le `.catch` est attaché ici,
 * à la création, pour ne logger l'échec qu'une seule fois pour toute la page
 * — chaque appelant obtient ensuite la même promesse rejetée et gère son
 * propre repli sans relogger.
 */
function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = import('shiki')
			.then((shiki) =>
				shiki.createHighlighter({
					themes: [THEMES.dark, THEMES.light],
					langs: SHIKI_LANGUAGES,
				}),
			)
			.catch((error) => {
				console.error(
					'[CodeBlock] Échec du chargement de shiki : coloration syntaxique désactivée pour le reste de la page.',
					error,
				);
				throw error;
			});
	}
	return highlighterPromise;
}

/**
 * Rendu monospace sans couleur : état d'attente et repli si shiki échoue.
 * `pl` réserve la même largeur que la gouttière de `.line::before` ci-dessous.
 * `box-sizing: border-box` (posé par CssBaseline) fait que `GUTTER_WIDTH`
 * inclut déjà son padding et sa bordure ; seul `GUTTER_GAP` s'ajoute par-dessus.
 * Sans ce même total, ouvrir un 2e fichier peint d'abord ce repli sans gouttière
 * puis shiki avec, et le code saute horizontalement entre les deux peintures.
 */
const plainSx = {
	m: 0,
	pl: `${GUTTER_WIDTH + GUTTER_GAP}px`,
	pr: 1.5,
	py: 1,
	minWidth: 'max-content',
	color: 'text.primary',
	fontFamily: FONT,
	fontSize: FONT_SIZE,
	lineHeight: LINE_HEIGHT,
	whiteSpace: 'pre',
} as const;

/**
 * Numéros de ligne par compteur CSS sur les `<span class="line">` émis par shiki :
 * une seule source de vérité pour le rendu, donc aucun désalignement possible.
 * Le `!important` neutralise le background que shiki écrit en style inline.
 *
 * ⚠️ Ne pas remettre `.line { display: block }` : shiki sépare ses `<span class="line">`
 * par un vrai `\n`, qui sous `white-space: pre` produit sa propre boîte de ligne.
 * Passer les `.line` en bloc intercale donc une ligne vide entre chaque ligne de
 * code (interlignage doublé, bordure de gouttière en pointillés). Les `.line`
 * restent inline — ce sont les `\n` de shiki qui font les retours à la ligne.
 */
const shikiSx = {
	'& pre.shiki': {
		m: 0,
		py: 1,
		px: 0,
		bgcolor: 'transparent !important',
		fontFamily: FONT,
		fontSize: FONT_SIZE,
		lineHeight: LINE_HEIGHT,
		minWidth: 'max-content',
	},
	'& pre.shiki code': {
		display: 'block',
		fontFamily: 'inherit',
		counterReset: 'shiki-line',
	},
	'& pre.shiki .line::before': {
		counterIncrement: 'shiki-line',
		content: 'counter(shiki-line)',
		display: 'inline-block',
		width: `${GUTTER_WIDTH}px`,
		mr: `${GUTTER_GAP}px`,
		px: 0.75,
		textAlign: 'right',
		fontSize: '0.65rem',
		lineHeight: LINE_HEIGHT,
		// `top` plutôt que l'alignement par défaut sur la ligne de base : la gouttière
		// est dans une police plus petite que le code, donc leurs lignes de base ne
		// coïncident pas et l'inline-block ferait grandir la boîte de ligne d'une
		// fraction de pixel — cumulée sur un fichier entier, elle se voit.
		verticalAlign: 'top',
		color: 'text.disabled',
		userSelect: 'none',
		borderRight: '1px solid',
		borderColor: 'divider',
	},
} as const;

export default function CodeBlock({ code, path }: { code: string; path: string }) {
	const t = useTranslations('workbench');
	// `palette.mode` et non le nom du variant : le variant `custom` porte son mode
	// dans ses tokens (`customTokens.mode`), donc un thème custom sombre doit
	// recevoir le thème shiki sombre. Le thème MUI construit par `getTheme` est la
	// seule source qui résout déjà ce cas.
	const mode = useTheme().palette.mode;
	const [html, setHtml] = useState<string | null>(null);
	const tooLarge = code.length > MAX_HIGHLIGHT_CHARS;

	useEffect(() => {
		// Fichier trop volumineux : le rendu ci-dessous bascule sur `tooLarge` sans
		// jamais lire `html`, inutile de tokeniser ni de réinitialiser un état.
		if (tooLarge) return;
		let cancelled = false;
		getHighlighter()
			.then((highlighter) => {
				if (cancelled) return;
				setHtml(
					highlighter.codeToHtml(code, {
						lang: languageFromPath(path),
						theme: THEMES[mode],
					}),
				);
			})
			.catch(() => {
				// Déjà loggé une fois dans getHighlighter : ici on laisse simplement
				// le repli en texte brut ci-dessous affiché, sans relogger.
			});
		return () => {
			cancelled = true;
		};
	}, [code, path, mode, tooLarge]);

	if (tooLarge || !html) {
		return (
			<Box>
				{tooLarge && (
					<Typography
						variant="caption"
						sx={{
							display: 'block',
							px: 1.5,
							py: 0.5,
							color: 'text.disabled',
							borderBottom: 1,
							borderColor: 'divider',
						}}
					>
						{t('fileNoHighlight')}
					</Typography>
				)}
				<Box component="pre" sx={plainSx}>
					{code}
				</Box>
			</Box>
		);
	}

	// La source vient du disque local de l'utilisateur, pas d'un tiers : le HTML
	// injecté est celui que shiki génère à partir de ses propres grammaires.
	return <Box sx={shikiSx} dangerouslySetInnerHTML={{ __html: html }} />;
}
