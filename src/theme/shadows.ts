import type { PaletteMode } from '@mui/material/styles';

/** Opacité de l'ombre par mode : à forme égale, une ombre noire sur fond sombre a besoin
 * de plus d'opacité pour rester perceptible. */
const SHADOW_ALPHA: Record<PaletteMode, number> = { light: 0.08, dark: 0.28 };

/**
 * L'UNIQUE ombre de l'app. Non directionnelle : elle sert aussi bien aux panneaux latéraux
 * qu'aux cards, au composer ou aux snackbars. Se règle ici et nulle part ailleurs — aucun
 * composant ne doit écrire une string `boxShadow` en dur.
 *
 * Les élévations numériques MUI (`boxShadow: 3`, `elevation`, menus, dialogs…) sont écrasées
 * dans `createAppTheme` pour toutes résoudre vers cette valeur.
 */
export const appShadow = (mode: PaletteMode) => `0 2px 8px -4px rgba(0,0,0,${SHADOW_ALPHA[mode]})`;
