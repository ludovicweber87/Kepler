import type { PaletteMode } from '@mui/material/styles';

/** Opacité de l'ombre par mode : à forme égale, une ombre noire sur fond sombre a besoin
 * de plus d'opacité pour rester perceptible. */
const SHADOW_ALPHA: Record<PaletteMode, number> = { light: 0.08, dark: 0.28 };

/**
 * L'ombre portée de l'app — avec `appInsetShadow` ci-dessous, les deux SEULES ombres
 * autorisées. Non directionnelle : elle sert aussi bien aux panneaux latéraux qu'aux
 * cards, au composer ou aux snackbars. Se règlent ici et nulle part ailleurs — aucun
 * composant ne doit écrire une string `boxShadow` en dur.
 *
 * Les élévations numériques MUI (`boxShadow: 3`, `elevation`, menus, dialogs…) sont écrasées
 * dans `createAppTheme` pour toutes résoudre vers cette valeur.
 */
export const appShadow = (mode: PaletteMode) => `0 2px 8px -4px rgba(0,0,0,${SHADOW_ALPHA[mode]})`;

/**
 * Le pendant creusé d'`appShadow`, pour les zones en retrait dans une surface (le bloc
 * de scripts de la topbar). Plus opaque que l'ombre portée : une ombre interne sur une
 * petite surface a besoin de contraste pour se lire.
 */
export const appInsetShadow = (mode: PaletteMode) =>
	`inset 0 1px 3px rgba(0,0,0,${SHADOW_ALPHA[mode] * 1.5})`;
