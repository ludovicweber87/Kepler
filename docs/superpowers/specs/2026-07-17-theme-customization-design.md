# Personnalisation du thème (couleurs, typo, terminal)

Date : 2026-07-17
Statut : validé (design)

## Objectif

Ajouter dans la page `/settings` un accordion « Apparence » permettant à l'utilisateur de :

- définir lui-même les couleurs du thème via des petits carrés de couleur ;
- choisir la police et la taille de police de l'app ;
- choisir la police et la taille de police du terminal.

Toutes ces préférences (hors sélection de la variante active) sont persistées en DB.

## Décisions

1. **Variante « Custom »** : on ajoute une 5e variante de thème éditable, seedée depuis la
   variante courante. Les 4 presets (`dark`, `light-warm`, `light-solarized`,
   `light-near-white`) sont conservés inchangés. Le picker de couleurs n'agit que sur `custom`.
2. **Set complet de couleurs éditables** : primary, secondary, error, warning, success, info,
   background (default + paper), text (primary + secondary), divider, surfaces (cardHover,
   cardBorderHover, drawer, drawerBorder), + un toggle `mode` (light/dark). Les nuances
   `light`/`dark` de primary/secondary sont dérivées automatiquement (`lighten`/`darken`).
3. **Typo globale** : `appFont` + `appFontSize` s'appliquent à *toutes* les variantes (pas
   seulement Custom). Les couleurs Custom ne s'appliquent qu'à la variante `custom`.
4. **Terminal** : `terminalFont` + `terminalFontSize` uniques, appliqués aux deux terminaux
   (`ShellTerminal` et `OverlayTerminal`).
5. **Persistance** :
   - La **sélection de la variante active** reste en `localStorage` (piloté par le Header, inchangé).
   - La **définition Custom + typo + tailles** est persistée en DB (`app_settings.theme_prefs`,
     un seul blob JSON) avec **miroir localStorage** pour appliquer au 1er paint sans flash.
6. **UX** : aperçu **live** pendant l'édition + **un seul bouton « Enregistrer »** qui persiste
   en DB. Pas de gestion des modifications non enregistrées (revert au dernier état sauvé au reload).
7. **Polices curated** (chargées via Google Fonts `<link>`) :
   - App (sans-serif) : Poppins, Inter, Roboto, System UI, Nunito.
   - Terminal (monospace) : JetBrains Mono, Fira Code, Cascadia Code, Source Code Pro, Menlo.

## Modèle de données

Clé unique dans `app_settings` : `theme_prefs` (JSON).

```jsonc
{
  "customTokens": {
    "mode": "dark",
    "primary": "#7C5CFF",
    "secondary": "#00D4FF",
    "error": "#EF4444", "warning": "#F59E0B", "success": "#22C55E", "info": "#00D4FF",
    "backgroundDefault": "#1A1A1A", "backgroundPaper": "#222222",
    "textPrimary": "#FFFFFF", "textSecondary": "#B3B3B3",
    "divider": "#3A3A3A",
    "cardHover": "#2A2A2A", "cardBorderHover": "#444444",
    "drawer": "#1A1A1A", "drawerBorder": "#3A3A3A"
  },
  "appFont": "Poppins",
  "appFontSize": 12,
  "terminalFont": "JetBrains Mono",
  "terminalFontSize": 14
}
```

Valeurs par défaut = tokens de la variante `dark` + Poppins/12 + JetBrains Mono/14.

## Architecture

### `theme/theme.ts`

- Étendre `ThemeVariant` avec `'custom'` et l'ajouter à `THEME_VARIANTS`.
- Nouveau type `CustomThemeTokens` + valeurs par défaut (seed = variante `dark`).
- `getTheme(variant, prefs?)` :
  - si `variant === 'custom'` → construit `VariantTokens` depuis `prefs.customTokens`
    (dérive light/dark de primary/secondary, `chipStyle: 'filled'`).
  - applique `prefs.appFont` / `prefs.appFontSize` à `typography.fontFamily` / `fontSize`
    quel que soit le variant (fallback Poppins/12).
- Une entrée `THEME_VARIANT_SWATCH.custom` (couleurs primary/secondary courantes du custom).

### Provider `ThemePrefsProvider` (`src/hooks/useThemePrefs.tsx`)

- `useSyncExternalStore` sur `localStorage` (clé `devora-theme-prefs`) pour le 1er paint.
- React Query charge `app_settings.theme_prefs` en arrière-plan et réconcilie le localStorage.
- API : `{ prefs, preview(next), save(next), isSaving }`.
  - `preview(next)` : maj en mémoire pour l'aperçu live (ne persiste pas).
  - `save(next)` : écrit DB (via `useAppSetting`/route settings) + localStorage + maj en mémoire.
- Monté dans `ThemeRegistry`, entre `ColorModeProvider` et `ThemeProviderInner`.

### `ThemeRegistry.tsx`

- `ThemeProviderInner` lit `variant` (useColorMode) + `prefs` (useThemePrefs) et
  `getTheme(variant, prefs)`.

### Terminaux (`ShellTerminal.tsx`, `OverlayTerminal.tsx`)

- Lire `terminalFont`/`terminalFontSize` via `useThemePrefs`.
- À la création : `fontFamily`/`fontSize` depuis les prefs.
- Sur changement : `term.options.fontFamily = ...; term.options.fontSize = ...; fitAddon.fit()`.

### UI — accordion « Apparence » dans `SettingsPanel.tsx`

Nouveau composant `AppearanceSettings` (sous `src/components/settings/`) rendu dans un 3e accordion :

- **Sélecteur de variante** : swatches des 4 presets + Custom (réutilise `THEME_VARIANT_SWATCH`),
  câblé sur `useColorMode().setVariant`.
- **Éditeur Custom** (visible si variante active = `custom`) :
  - grille de carrés `<input type="color">` (un par token) + labels i18n ;
  - toggle mode light/dark.
  - Chaque changement appelle `preview()` (aperçu live).
- **Typo app** : `Select` curated + stepper (`TextField type=number` ou boutons +/-).
- **Terminal** : `Select` curated monospace + stepper.
- **Bouton « Enregistrer »** unique → `save(draft)`.

### Chargement des polices

- Ajouter un `<link>` Google Fonts (dans `layout.tsx` ou via `next/font` selon le pattern repo)
  couvrant les familles curated (poids limités) pour un switch fiable et instantané.

## i18n

Nouveau namespace `appearance` dans les 5 locales (`en/fr/es/de/pt`) : titre accordion, labels
des tokens de couleur, labels typo/terminal, mode light/dark, bouton save, noms de sections.

## Tests

Convention repo = logique pure uniquement (Vitest) :

- `getTheme('custom', prefs)` : produit bien une palette avec les couleurs fournies,
  le bon `mode`, les nuances light/dark dérivées, et la typo appliquée.
- Helper de dérivation light/dark.
- Réconciliation/normalisation des prefs (defaults + merge partiel + valeurs invalides).

L'UI se vérifie par `lint` + `tsc --noEmit` + `build` + run manuel.

## Hors périmètre (YAGNI)

- Pas d'import/export de thèmes, pas de multi-thèmes custom nommés (un seul Custom).
- Pas de personnalisation par-repo (global uniquement).
- Pas de gestion « unsaved changes » / confirmation avant navigation.
