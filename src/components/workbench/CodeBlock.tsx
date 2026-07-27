'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Highlighter } from 'shiki';
import { useTranslations } from 'next-intl';
import { useColorMode } from '@/hooks/useColorMode';
import { languageFromPath, SHIKI_LANGUAGES } from '@/lib/languageFromPath';

const FONT = '"JetBrains Mono", monospace';

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
 */
function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = import('shiki').then((shiki) =>
			shiki.createHighlighter({
				themes: [THEMES.dark, THEMES.light],
				langs: SHIKI_LANGUAGES,
			}),
		);
	}
	return highlighterPromise;
}

/** Rendu monospace sans couleur : état d'attente et repli si shiki échoue. */
const plainSx = {
	m: 0,
	px: 1.5,
	py: 1,
	minWidth: 'max-content',
	color: 'text.primary',
	fontFamily: FONT,
	fontSize: '0.78rem',
	lineHeight: 1.5,
	whiteSpace: 'pre',
} as const;

/**
 * Numéros de ligne par compteur CSS sur les `<span class="line">` émis par shiki :
 * une seule source de vérité pour le rendu, donc aucun désalignement possible.
 * Le `!important` neutralise le background que shiki écrit en style inline.
 */
const shikiSx = {
	'& pre.shiki': {
		m: 0,
		py: 1,
		px: 0,
		bgcolor: 'transparent !important',
		fontFamily: FONT,
		fontSize: '0.78rem',
		lineHeight: 1.5,
		minWidth: 'max-content',
	},
	'& pre.shiki code': {
		display: 'block',
		fontFamily: 'inherit',
		counterReset: 'shiki-line',
	},
	'& pre.shiki .line': { display: 'block' },
	'& pre.shiki .line::before': {
		counterIncrement: 'shiki-line',
		content: 'counter(shiki-line)',
		display: 'inline-block',
		width: '3.5em',
		mr: 1.5,
		pr: 1,
		textAlign: 'right',
		color: 'text.disabled',
		userSelect: 'none',
		borderRight: '1px solid',
		borderColor: 'divider',
	},
} as const;

export default function CodeBlock({ code, path }: { code: string; path: string }) {
	const t = useTranslations('workbench');
	const { mode } = useColorMode();
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
				// Shiki indisponible : le repli en texte brut ci-dessous reste affiché.
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
