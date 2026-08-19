'use client';

import { alpha, type Theme } from '@mui/material/styles';
import { appShadow } from './shadows';

interface SelectableCardOptions {
	selected: boolean;
	/** Couleur d'accent de la card (persona, effort, mode de permission…). */
	color: string;
	radius?: number;
	borderWidth?: string;
	/** Amplitude du `translateY` au survol, en px. */
	lift?: number;
}

/**
 * Look commun des cards sélectionnables du wizard de lancement (persona, réglages, mode de
 * lancement, projet). La surface au repos est opaque et un cran au-dessus du paper du Dialog,
 * sans quoi l'ombre portée n'aurait rien à décoller et ne lirait pas comme de l'élévation.
 * L'état sélectionné superpose un calque teinté plutôt que de passer en `alpha`, pour garder
 * la surface opaque et donc l'élévation.
 */
export function selectableCardSx(
	theme: Theme,
	{ selected, color, radius = 1.25, borderWidth = '1.5px', lift = 2 }: SelectableCardOptions,
) {
	return {
		borderRadius: radius,
		border: `${borderWidth} solid`,
		borderColor: selected ? color : 'divider',
		backgroundColor: theme.palette.surfaces.cardHover,
		backgroundImage: selected
			? `linear-gradient(${alpha(color, 0.12)}, ${alpha(color, 0.12)})`
			: 'none',
		boxShadow: appShadow(theme.palette.mode),
		transition: 'transform 0.15s, border-color 0.15s, background-color 0.15s',
		// Le feedback de survol passe par le lift et la bordure d'accent : l'ombre est
		// la même au repos et au survol (une seule ombre dans toute l'app).
		'&:hover': {
			borderColor: color,
			transform: `translateY(-${lift}px)`,
		},
	} as const;
}
