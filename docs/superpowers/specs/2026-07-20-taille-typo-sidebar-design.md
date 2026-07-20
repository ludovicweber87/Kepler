# Design — Taille typo unifiée + resize split Workbench (Issue #104)

Date : 2026-07-20
Branche : `feat/104-taille-typo-sidebar`

## Contexte

L'issue #104 demande deux choses :

1. Pouvoir régler depuis les settings une **taille de typo unifiée** sur toute l'app.
2. Pouvoir **agrandir la taille des sidebars** et **persister** la taille en DB.

### État existant (exploration)

- Un réglage `appFontSize` existe **déjà** dans `ThemePrefs` (défaut 12, borné 8–32),
  éditable dans `src/components/settings/AppearanceSettings.tsx`, persisté en DB via
  `useThemePrefs` (clé `theme_prefs` de `app_settings`), et injecté dans le thème MUI
  (`src/theme/theme.ts`, `typography.fontSize`).
- **Problème** : de nombreux composants ont des tailles de police **en dur**
  (`0.8rem`, `0.85rem`, `fontSize: 14`, `fontSize: 22`…) — donc le réglage ne s'applique
  pas partout : la typo n'est **pas réellement unifiée**.
- La sidebar nav gauche a une largeur figée `SIDEBAR_WIDTH = 260` (`src/components/layout/Sidebar.tsx`),
  consommée aussi par `Header.tsx`. Non redimensionnable.
- Le Workbench (`src/components/workbench/WorkbenchShell.tsx`) a un split gauche/droite
  figé (68% / 32%), **non** redimensionnable horizontalement, **non** persisté. Seul le
  terminal a un resize vertical local (`termHeight`, `useState`, non persisté).

### Décisions de cadrage (validées avec l'utilisateur)

- Typo : **unifier partout** via **scale global** (approche A ci-dessous).
- Sidebars : rendre redimensionnable **uniquement le split gauche/droite du Workbench**.
  La sidebar nav gauche **reste** à 260px fixe.

## Feature 1 — Typo unifiée (scale global au root)

### Principe

`appFontSize` devient un **facteur d'échelle** relatif à la baseline de design (12) :

```
scale = appFontSize / 12
```

On applique ce facteur au `font-size` de l'élément racine `<html>` via MUI `<GlobalStyles>`.
Comme la majorité des tailles de texte (variants MUI **et** tailles en dur en `rem`) sont
exprimées en `rem`, elles scalent **automatiquement** avec le root.

### Anti double-scaling (point critique)

Aujourd'hui `theme.ts` fait `typography.fontSize = prefs.appFontSize ?? 12`. Si on garde
cet override **et** qu'on scale le root, la typo scale **deux fois**.

→ On **fige** `typography.fontSize` à la baseline constante **12** dans `theme.ts`.
Le scaling se fait **uniquement** via le root font-size. La valeur `appFontSize` n'alimente
plus `typography.fontSize` mais alimente le `<GlobalStyles>`.

### Emplacement

- Le scale est injecté dans `ThemeProviderInner` (`src/components/ThemeRegistry.tsx`), qui a
  déjà accès à `prefs` (via `useThemePrefs`) et recompute sur `[variant, prefs]`.
- Exemple :
  ```tsx
  const scale = (prefs.appFontSize ?? 12) / 12;
  // ...
  <GlobalStyles styles={{ html: { fontSize: `${16 * scale}px` } }} />
  ```
  Remarque : on ne modifie **pas** `htmlFontSize` du thème MUI (il ne sert qu'à la conversion
  px→rem au build du thème ; le navigateur applique les `rem` contre le root réel).

### Travail de conversion (faible)

- Les tailles de texte déjà en `rem` (ex. `0.8rem`, `0.85rem`) : **aucun changement**, elles
  scalent d'office.
- Les tailles de **texte en dur en `px`** (`fontSize: 14`, etc.) dans Sidebar / WorkbenchShell /
  menus : les **convertir en `rem`** pour qu'elles suivent le scale.
- Les tailles d'**icônes en px** (`fontSize: 22`…) : **laissées en px** (ne scalent pas) pour
  éviter les débordements de layout. (Décision : on unifie le **texte**, pas les icônes.)
- **Méthode d'audit** (à exécuter au moment du plan) : grep `fontSize:\s*\d+` (et
  `fontSize:\s*['"]\d` pour les `px` en string) sur `src/components`, puis **règle de décision**
  par occurrence : si la taille s'applique à du **texte** (Typography, Button, MenuItem, label)
  → convertir en `rem` ; si elle s'applique à une **icône** (SvgIcon, `*Icon`, `<... Icon>`)
  → laisser en `px`. Enumérer les fichiers touchés dans le plan.

### Bornes

- Resserrer le range du réglage de **8–32** à **10–20** dans `AppearanceSettings.tsx`
  (`FontControl` `slotProps.htmlInput.min/max`) pour éviter la casse de layout aux extrêmes.

### Persistance

- Inchangée : `appFontSize` reste persisté via `useThemePrefs` (clé `theme_prefs`).

## Feature 2 — Split Workbench redimensionnable + persisté

### UI / interaction

- Ajouter une **poignée verticale (resize horizontal)** (`cursor: col-resize`) entre la colonne
  gauche (conversation, ~68%) et la colonne droite (panneau + terminal, ~32%) dans
  `WorkbenchShell.tsx`.
- Réutiliser le **même pattern** que le resize existant du terminal (`termHeight`) :
  `onMouseDown` → listeners `mousemove` / `mouseup` sur **`document`** (comme l'existant), avec
  un **ref** (`resizing.current`, à l'image du pattern actuel) plutôt qu'une lecture de state —
  pour éviter les stale-closures pendant `mousemove` → `setLeftPct(clamp(...))`.
- État local `leftPct` (number, pourcentage) pilote le layout en live via `flex`.
- **Clamp** entre **40%** et **80%**.

### Persistance DB

- Réutiliser le hook générique **existant** `useAppSetting('workbench_split_pct', '68')`
  (`src/hooks/useAppSetting.ts`) → `GET/PUT /api/settings` → table `app_settings`.
- **Pas de migration** (nouvelle clé dans la table clé/valeur existante).
- Écriture DB **au relâchement de la souris** (`mouseup`) uniquement — pas à chaque `mousemove`
  (évite de spammer l'API).
- **Chargement de la valeur persistée (point critique)** : `useAppSetting` lit via React Query,
  donc `valueOrDefault` renvoie le fallback `'68'` tant que le fetch async n'est pas résolu.
  Initialiser `leftPct` une seule fois dans un `useState` initializer **ne restaurerait jamais**
  la valeur DB après reload. → Il faut un **`useEffect` qui synchronise `leftPct` depuis
  `valueOrDefault`** quand la query se résout, **gardé** pour ne pas écraser un drag en cours
  (ex. ne sync que si `!resizing.current` et tant qu'aucune interaction utilisateur n'a eu lieu,
  via un flag `hydrated`). Parse `parseFloat` + fallback 68 + clamp 40–80.

## Composants / fichiers impactés

| Fichier | Changement |
| --- | --- |
| `src/theme/theme.ts` | Figer `typography.fontSize` à 12 (retirer l'override par `appFontSize`) |
| `src/components/ThemeRegistry.tsx` | Injecter `<GlobalStyles>` root `font-size` = `16 * scale` |
| `src/components/settings/AppearanceSettings.tsx` | Resserrer bornes du champ taille app (10–20) |
| `src/components/layout/Sidebar.tsx` | Convertir tailles **texte** en dur px → rem |
| `src/components/workbench/WorkbenchShell.tsx` | Poignée resize horizontal + `leftPct` + persistance via `useAppSetting` ; conversions px→rem texte |
| Autres composants avec `fontSize` px de **texte** (menus…) | Conversion px → rem au besoin (audit ciblé) |

> Aucun nouveau fichier de traduction requis (la poignée n'a pas de label ; les labels typo
> existent déjà). Toute chaîne visible éventuelle passera par `next-intl`.

## Data flow

```
Feature 1 (typo)
  AppearanceSettings → useThemePrefs.save(appFontSize)
    → PUT /api/settings (theme_prefs) → app_settings
  ThemeProviderInner lit prefs.appFontSize → scale → <GlobalStyles html font-size>
    → tout le texte en rem scale

Feature 2 (split)
  WorkbenchShell resize handle → setLeftPct(clamp) [live]
    → mouseup → useAppSetting('workbench_split_pct').save(pct)
      → PUT /api/settings → app_settings
  Query résolue → useEffect (guard hydrated + !resizing) → leftPct restauré
```

## Gestion d'erreurs / cas limites

- Persistance split : si le `PUT` échoue, le layout live reste correct (state local) ; on peut
  ignorer silencieusement ou afficher un snackbar d'erreur (optionnel, non bloquant).
- Valeur DB corrompue (`workbench_split_pct` non numérique) : `parseFloat` + fallback 68 + clamp.
- Taille typo extrême : bornée à 10–20 côté UI. **Exigence** : le calcul du `scale` doit
  **clamper `appFontSize` dans [10, 20]** avant de dériver le ratio — une valeur DB hors borne
  (l'ancien range 8–32 autorisait jusqu'à 32) est un cas réaliste pour les données existantes.
- SSR : `useThemePrefs` est déjà SSR-safe (localStorage + défaut) ; `GlobalStyles` s'applique
  côté client au premier paint effectif.

## Tests

Convention repo : **logique pure uniquement** (Vitest), l'UI se vérifie par lint + `tsc --noEmit`
+ build + run manuel.

- Test unitaire possible : helper de calcul du `scale` (clamp + ratio) si extrait en fonction pure.
- Test unitaire possible : helper de clamp du `leftPct` (40–80) et parsing de la valeur DB.
- Vérif manuelle : changer la taille dans les settings → tout le texte (sidebar, workbench,
  menus) scale de façon cohérente ; icônes inchangées. Redimensionner le split → persistance
  après reload.

## Hors scope

- Redimensionnement de la sidebar nav gauche (reste 260px).
- Scaling des icônes.
- Nouvelle table / migration DB.
