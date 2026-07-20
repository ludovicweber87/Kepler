# Taille typo unifiée + resize split Workbench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier la taille de typo de l'app via un scale global piloté par `appFontSize` (settings, persisté DB), et rendre le split gauche/droite du Workbench redimensionnable avec persistance en DB.

**Architecture:** `appFontSize` (déjà dans `ThemePrefs`) devient un facteur d'échelle appliqué au `font-size` de `<html>` via MUI `<GlobalStyles>` : tout le texte (variants MUI + tailles en `rem`) scale automatiquement ; les icônes (en `px`) restent fixes. `typography.fontSize` est figé à la baseline 12 pour éviter un double-scaling. Le split Workbench passe d'un pourcentage figé à un état `leftPct` piloté par une poignée de resize, persisté via le hook générique `useAppSetting` (clé `workbench_split_pct`, table `app_settings`, sans migration). La logique pure (clamp/scale/parse) est isolée dans des modules testables.

**Tech Stack:** React 19, Next.js 16, TypeScript 5, MUI 7, Emotion, TanStack React Query 5, SQLite/Drizzle, Vitest.

## Global Constraints

- UI text : jamais de texte en dur — toujours `next-intl`. (Ici : aucun nouveau texte visible requis.)
- Tests : logique pure uniquement (Vitest, `*.test.ts` dans `src/lib`). L'UI se vérifie par `lint` + `tsc --noEmit` + `build` + run manuel.
- Style : respecter les patterns existants (tabs, indentation par tabulations, `sx` prop, `'use client'`).
- Git : **ne jamais commiter/push sans accord explicite de Ludovic.** Les steps « Commit » ne s'exécutent qu'après son go.
- Baseline typo de design : **12px**. Range app autorisé : **[10, 20]**. Range terminal inchangé : [8, 32].
- Split Workbench : bornes **[40%, 80%]**, défaut **68%**.

---

### Task 1: Module pur `appFontScale`

Logique pure du scale typo : clamp de `appFontSize` dans [10, 20] et calcul du `font-size` root.

**Files:**
- Create: `src/lib/appFontScale.ts`
- Test: `src/lib/appFontScale.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `APP_FONT_MIN = 10`, `APP_FONT_MAX = 20`, `APP_FONT_BASE = 12`, `ROOT_FONT_PX = 16` (constantes `number`)
  - `clampAppFontSize(size: unknown): number` — clamp/round dans [10,20], fallback 12 si non-numérique/NaN
  - `appFontScale(size: unknown): number` — ratio `clampAppFontSize(size) / 12`
  - `rootFontSizePx(size: unknown): number` — `16 * appFontScale(size)`

- [ ] **Step 1: Écrire le test qui échoue**

`src/lib/appFontScale.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import {
	clampAppFontSize,
	appFontScale,
	rootFontSizePx,
	APP_FONT_BASE,
} from './appFontScale';

describe('clampAppFontSize', () => {
	it('renvoie la baseline pour une entrée non numérique', () => {
		expect(clampAppFontSize('nope' as unknown)).toBe(12);
		expect(clampAppFontSize(Number.NaN)).toBe(12);
	});
	it('clamp sous le minimum à 10', () => {
		expect(clampAppFontSize(4)).toBe(10);
	});
	it('clamp au-dessus du maximum à 20', () => {
		expect(clampAppFontSize(40)).toBe(20);
	});
	it('arrondit et laisse passer les valeurs dans la plage', () => {
		expect(clampAppFontSize(14.4)).toBe(14);
	});
});

describe('appFontScale', () => {
	it('vaut 1 à la baseline', () => {
		expect(appFontScale(APP_FONT_BASE)).toBe(1);
	});
	it('scale proportionnellement dans la plage', () => {
		expect(appFontScale(18)).toBeCloseTo(1.5);
	});
	it('utilise la valeur clampée hors plage', () => {
		expect(appFontScale(100)).toBeCloseTo(20 / 12);
	});
});

describe('rootFontSizePx', () => {
	it('vaut 16 à la baseline', () => {
		expect(rootFontSizePx(12)).toBe(16);
	});
	it('scale le root avec la taille de police', () => {
		expect(rootFontSizePx(18)).toBe(24);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/appFontScale.test.ts`
Expected: FAIL (« Cannot find module './appFontScale' »).

- [ ] **Step 3: Implémenter le module**

`src/lib/appFontScale.ts` :
```ts
export const APP_FONT_MIN = 10;
export const APP_FONT_MAX = 20;
export const APP_FONT_BASE = 12;
export const ROOT_FONT_PX = 16;

/** Clamp une taille de police app brute dans la plage supportée [10, 20] (px). */
export function clampAppFontSize(size: unknown): number {
	if (typeof size !== 'number' || Number.isNaN(size)) return APP_FONT_BASE;
	return Math.min(APP_FONT_MAX, Math.max(APP_FONT_MIN, Math.round(size)));
}

/** Facteur d'échelle relatif à la baseline de design (12px). */
export function appFontScale(size: unknown): number {
	return clampAppFontSize(size) / APP_FONT_BASE;
}

/** Font-size du <html> (px) qui pilote le scaling global des textes en rem. */
export function rootFontSizePx(size: unknown): number {
	return ROOT_FONT_PX * appFontScale(size);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/appFontScale.test.ts`
Expected: PASS (10 assertions).

- [ ] **Step 5: Commit** (après accord de Ludovic)

```bash
git add src/lib/appFontScale.ts src/lib/appFontScale.test.ts
git commit -m "feat: helper pur appFontScale (clamp 10-20 + scale root)"
```

---

### Task 2: Module pur `workbenchSplit`

Logique pure du split Workbench : clamp du pourcentage et parsing de la valeur DB.

**Files:**
- Create: `src/lib/workbenchSplit.ts`
- Test: `src/lib/workbenchSplit.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `SPLIT_MIN = 40`, `SPLIT_MAX = 80`, `SPLIT_DEFAULT = 68` (constantes `number`)
  - `clampSplitPct(pct: number): number` — clamp dans [40,80], fallback `SPLIT_DEFAULT` si NaN
  - `parseSplitPct(raw: string | null | undefined, fallback?: number): number` — `parseFloat` puis clamp, fallback si non parsable

- [ ] **Step 1: Écrire le test qui échoue**

`src/lib/workbenchSplit.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { clampSplitPct, parseSplitPct, SPLIT_DEFAULT } from './workbenchSplit';

describe('clampSplitPct', () => {
	it('clamp sous 40', () => {
		expect(clampSplitPct(10)).toBe(40);
	});
	it('clamp au-dessus de 80', () => {
		expect(clampSplitPct(95)).toBe(80);
	});
	it('laisse passer une valeur dans la plage', () => {
		expect(clampSplitPct(68)).toBe(68);
	});
	it('fallback sur NaN', () => {
		expect(clampSplitPct(Number.NaN)).toBe(SPLIT_DEFAULT);
	});
});

describe('parseSplitPct', () => {
	it('parse une string enregistrée', () => {
		expect(parseSplitPct('72')).toBe(72);
	});
	it('clamp une valeur DB hors plage', () => {
		expect(parseSplitPct('120')).toBe(80);
	});
	it('fallback sur null', () => {
		expect(parseSplitPct(null)).toBe(68);
	});
	it('fallback sur une valeur non numérique', () => {
		expect(parseSplitPct('abc')).toBe(68);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/workbenchSplit.test.ts`
Expected: FAIL (« Cannot find module './workbenchSplit' »).

- [ ] **Step 3: Implémenter le module**

`src/lib/workbenchSplit.ts` :
```ts
export const SPLIT_MIN = 40;
export const SPLIT_MAX = 80;
export const SPLIT_DEFAULT = 68;

/** Clamp un pourcentage de largeur gauche dans [40, 80]. */
export function clampSplitPct(pct: number): number {
	if (Number.isNaN(pct)) return SPLIT_DEFAULT;
	return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
}

/** Parse une valeur DB (string) en pourcentage clampé, avec fallback. */
export function parseSplitPct(
	raw: string | null | undefined,
	fallback: number = SPLIT_DEFAULT,
): number {
	const n = raw == null ? Number.NaN : Number.parseFloat(raw);
	if (Number.isNaN(n)) return fallback;
	return clampSplitPct(n);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/workbenchSplit.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit** (après accord de Ludovic)

```bash
git add src/lib/workbenchSplit.ts src/lib/workbenchSplit.test.ts
git commit -m "feat: helper pur workbenchSplit (clamp 40-80 + parse DB)"
```

---

### Task 3: Bornes app 10–20 (normalize + FontControl)

Appliquer la nouvelle plage [10,20] pour la taille de police **app** (le terminal reste [8,32]).

**Files:**
- Modify: `src/lib/themePrefs.ts` (import + ligne 111)
- Modify: `src/components/settings/AppearanceSettings.tsx` (props `FontControl` + usage app)
- Test: `src/lib/themePrefs.test.ts` (créer si absent)

**Interfaces:**
- Consumes: `clampAppFontSize` (Task 1), `APP_FONT_MIN`, `APP_FONT_MAX` (Task 1).
- Produces: `normalizeThemePrefs` clampe `appFontSize` dans [10,20] ; `FontControl` accepte `min?`/`max?` (défaut 8/32).

- [ ] **Step 1: Écrire le test qui échoue**

Créer/compléter `src/lib/themePrefs.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { normalizeThemePrefs, DEFAULT_THEME_PREFS } from './themePrefs';

describe('normalizeThemePrefs — appFontSize', () => {
	it('clampe une valeur trop grande (ancien range) à 20', () => {
		const out = normalizeThemePrefs({ ...DEFAULT_THEME_PREFS, appFontSize: 32 });
		expect(out.appFontSize).toBe(20);
	});
	it('clampe une valeur trop petite à 10', () => {
		const out = normalizeThemePrefs({ ...DEFAULT_THEME_PREFS, appFontSize: 8 });
		expect(out.appFontSize).toBe(10);
	});
	it('laisse le terminal dans son range large', () => {
		const out = normalizeThemePrefs({ ...DEFAULT_THEME_PREFS, terminalFontSize: 28 });
		expect(out.terminalFontSize).toBe(28);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/themePrefs.test.ts`
Expected: FAIL (le premier cas renvoie 32, pas 20 — l'ancien `clampSize` autorise jusqu'à 32).

- [ ] **Step 3: Modifier `themePrefs.ts`**

Ajouter l'import en haut du fichier (après la ligne 1) :
```ts
import { clampAppFontSize } from './appFontScale';
```
Remplacer la ligne `appFontSize: clampSize(r.appFontSize, DEFAULT_THEME_PREFS.appFontSize),` (dans `normalizeThemePrefs`) par :
```ts
		appFontSize: clampAppFontSize(r.appFontSize),
```
> `clampSize` reste utilisé pour `terminalFontSize` (range [8,32] inchangé). Ne pas le supprimer.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/themePrefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Rendre les bornes de `FontControl` configurables**

Dans `src/components/settings/AppearanceSettings.tsx`, modifier la signature de `FontControl` pour accepter `min`/`max` (défauts 8/32) et les câbler sur l'input :
```tsx
function FontControl({
	label,
	sizeLabel,
	fonts,
	font,
	size,
	onFont,
	onSize,
	min = 8,
	max = 32,
}: {
	label: string;
	sizeLabel: string;
	fonts: string[];
	font: string;
	size: number;
	onFont: (v: string) => void;
	onSize: (v: number) => void;
	min?: number;
	max?: number;
}) {
```
Et remplacer `slotProps={{ htmlInput: { min: 8, max: 32 } }}` par :
```tsx
					slotProps={{ htmlInput: { min, max } }}
```

- [ ] **Step 6: Passer les bornes app**

Toujours dans `AppearanceSettings.tsx`, ajouter l'import :
```tsx
import { APP_FONT_MIN, APP_FONT_MAX } from '@/lib/appFontScale';
```
Et sur le `FontControl` **app** (celui avec `label={t('appFont')}`), ajouter les props :
```tsx
					min={APP_FONT_MIN}
					max={APP_FONT_MAX}
```
> Ne rien changer sur le `FontControl` terminal (garde 8/32 par défaut).

- [ ] **Step 7: Vérifier types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 8: Commit** (après accord de Ludovic)

```bash
git add src/lib/themePrefs.ts src/lib/themePrefs.test.ts src/components/settings/AppearanceSettings.tsx
git commit -m "feat: borne la taille de police app à 10-20 (settings + normalize)"
```

---

### Task 4: Scale global de la typo (theme + GlobalStyles)

Figer `typography.fontSize` à 12 et injecter le `font-size` root proportionnel à `appFontSize`.

**Files:**
- Modify: `src/theme/theme.ts` (ligne ~227)
- Modify: `src/components/ThemeRegistry.tsx` (imports + `<GlobalStyles>`)

**Interfaces:**
- Consumes: `rootFontSizePx` (Task 1) ; `prefs.appFontSize` de `useThemePrefs`.
- Produces: `<html>` a un `font-size = 16 * scale` px ; `typography.fontSize` constant = 12.

- [ ] **Step 1: Figer la baseline dans le thème**

Dans `src/theme/theme.ts`, remplacer :
```ts
	const fontSize = prefs?.appFontSize ?? 12;
```
par :
```ts
	// Baseline de design figée : le scaling se fait au niveau du root <html>
	// (voir ThemeRegistry / rootFontSizePx), pas via typography.fontSize,
	// sinon la typo scalerait deux fois.
	const fontSize = 12;
```
> `prefs` reste utilisé juste au-dessus pour `fontFamily` — ne pas y toucher.

- [ ] **Step 2: Injecter le GlobalStyles root dans ThemeRegistry**

Dans `src/components/ThemeRegistry.tsx`, ajouter les imports :
```tsx
import GlobalStyles from '@mui/material/GlobalStyles';
import { rootFontSizePx } from '@/lib/appFontScale';
```
Remplacer le corps de `ThemeProviderInner` par :
```tsx
function ThemeProviderInner({ children }: { children: React.ReactNode }) {
	const { variant } = useColorMode();
	const { prefs } = useThemePrefs();
	const theme = useMemo(() => getTheme(variant, prefs), [variant, prefs]);
	const rootPx = rootFontSizePx(prefs.appFontSize);

	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<GlobalStyles styles={{ html: { fontSize: `${rootPx}px` } }} />
			{children}
		</ThemeProvider>
	);
}
```

- [ ] **Step 3: Vérifier types + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build OK, aucune erreur.

- [ ] **Step 4: Vérification manuelle (le cœur de la feature)**

1. `npm run dev`, ouvrir l'app.
2. Settings → Appearance → régler « App font size » à 20, Save.
3. Vérifier : le texte de la **sidebar** (nav, projets, worktrees), du **Workbench** (titres, chips, onglets) et des **menus** grossit de façon cohérente ; les **icônes** restent à leur taille.
4. Régler à 10 : tout rapetisse de façon cohérente.
5. Recharger la page : la taille est conservée (persistée via `theme_prefs`).
6. Le champ n'accepte plus que 10–20 (bornes de l'input).

Expected: la typo est unifiée ; aucun débordement cassant de layout aux extrêmes 10/20.

- [ ] **Step 5: Commit** (après accord de Ludovic)

```bash
git add src/theme/theme.ts src/components/ThemeRegistry.tsx
git commit -m "feat: typo unifiée via scale global du font-size root (#104)"
```

---

### Task 5: Resize horizontal du split Workbench + persistance

Rendre le split gauche/droite redimensionnable, clampé [40,80], persisté via `useAppSetting('workbench_split_pct')`.

**Files:**
- Modify: `src/components/workbench/WorkbenchShell.tsx`

**Interfaces:**
- Consumes: `clampSplitPct`, `parseSplitPct`, `SPLIT_DEFAULT` (Task 2) ; `useAppSetting` (existant, `src/hooks/useAppSetting.ts`, expose `{ valueOrDefault, isLoading, save }`).
- Produces: le split est piloté par `leftPct` (state), persisté au `mouseup`.

- [ ] **Step 1: Ajouter les imports**

Dans `src/components/workbench/WorkbenchShell.tsx`, modifier l'import React pour inclure `useEffect` :
```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
```
Et ajouter, avec les autres imports :
```tsx
import { useAppSetting } from '@/hooks/useAppSetting';
import { clampSplitPct, parseSplitPct, SPLIT_DEFAULT } from '@/lib/workbenchSplit';
```

- [ ] **Step 2: Ajouter l'état + l'hydratation + le handler de resize**

Juste après le bloc `startResize` (celui du terminal, se termine ligne ~95, avant le `return`), insérer :
```tsx
	// Resize horizontal du split gauche/droite (pourcentage de largeur gauche).
	const { valueOrDefault: splitRaw, isLoading: splitLoading, save: saveSplit } =
		useAppSetting('workbench_split_pct', String(SPLIT_DEFAULT));
	const splitRef = useRef<HTMLDivElement>(null);
	const [leftPct, setLeftPct] = useState(SPLIT_DEFAULT);
	const leftPctRef = useRef(SPLIT_DEFAULT);
	const hydrated = useRef(false);
	const hResizing = useRef(false);

	// Hydrate depuis la DB une fois la query résolue (React Query renvoie le
	// défaut tant qu'elle charge : attendre !isLoading évite de figer le défaut).
	useEffect(() => {
		if (splitLoading || hydrated.current || hResizing.current) return;
		const next = parseSplitPct(splitRaw);
		leftPctRef.current = next;
		setLeftPct(next);
		hydrated.current = true;
	}, [splitLoading, splitRaw]);

	const startHResize = useCallback(
		(e: React.MouseEvent) => {
			hResizing.current = true;
			e.preventDefault();
			const onMove = (ev: MouseEvent) => {
				if (!hResizing.current || !splitRef.current) return;
				const rect = splitRef.current.getBoundingClientRect();
				const pct = clampSplitPct(((ev.clientX - rect.left) / rect.width) * 100);
				leftPctRef.current = pct;
				setLeftPct(pct);
			};
			const onUp = () => {
				hResizing.current = false;
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
				document.body.style.userSelect = '';
				void saveSplit(String(Math.round(leftPctRef.current)));
			};
			document.body.style.userSelect = 'none';
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		},
		[saveSplit],
	);
```

- [ ] **Step 3: Attacher le ref au conteneur du split**

Remplacer l'ouverture du conteneur split :
```tsx
				{/* Split gauche/droite */}
				<Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
```
par :
```tsx
				{/* Split gauche/droite */}
				<Box ref={splitRef} sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
```

- [ ] **Step 4: Rendre la largeur gauche dynamique**

Remplacer l'ouverture de la colonne gauche :
```tsx
					<Box
						sx={{ flex: '0 0 68%', minWidth: 0, display: 'flex', flexDirection: 'column' }}
					>
```
par :
```tsx
					<Box
						sx={{
							flex: `0 0 ${leftPct}%`,
							minWidth: 0,
							display: 'flex',
							flexDirection: 'column',
						}}
					>
```

- [ ] **Step 5: Insérer la poignée de resize entre les deux colonnes**

Entre la fermeture de la colonne gauche (`</Box>` juste après `{leftContent}`) et l'ouverture de la colonne droite (`{/* Droite : panneau + terminal */}`), insérer :
```tsx
					{/* Poignée verticale — resize horizontal du split */}
					<Box
						onMouseDown={startHResize}
						sx={{
							width: 6,
							flexShrink: 0,
							cursor: 'col-resize',
							bgcolor: 'divider',
							'&:hover': { bgcolor: 'primary.main' },
						}}
					/>

```

- [ ] **Step 6: Vérifier types + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 7: Vérification manuelle**

1. `npm run dev`, ouvrir un Workbench avec une session.
2. Glisser la poignée verticale entre les colonnes : la répartition change en live, bloquée entre 40% et 80%.
3. Relâcher, puis recharger la page : la largeur est **conservée**.
4. Ouvrir un autre mode Workbench (run) : il reprend la même largeur persistée.

Expected: resize fluide, persistance après reload, pas de saut au chargement.

- [ ] **Step 8: Commit** (après accord de Ludovic)

```bash
git add src/components/workbench/WorkbenchShell.tsx
git commit -m "feat: split Workbench redimensionnable + persisté en DB (#104)"
```

---

### Task 6: Vérification finale

**Files:** aucune modification (vérification globale).

- [ ] **Step 1: Suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent (dont `appFontScale`, `workbenchSplit`, `themePrefs`).

- [ ] **Step 2: Types + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 3: Revue de non-régression manuelle**

1. Taille typo par défaut (12) : l'app est visuellement identique à avant (aucune régression).
2. Changer la taille → tout le texte scale, icônes fixes, layouts intacts.
3. Resize + reload du split Workbench : persistant.

Expected: comportement conforme au spec `docs/superpowers/specs/2026-07-20-taille-typo-sidebar-design.md`.

---

## Self-Review

**Spec coverage :**
- Typo unifiée via scale global → Tasks 1, 4. ✓
- Anti double-scaling (`typography.fontSize` figé à 12) → Task 4, Step 1. ✓
- Range resserré 10–20 + clamp des valeurs DB héritées → Task 3 (normalize + input). ✓
- Audit px→rem : l'exploration a montré que **tous** les `fontSize` px du code sont des icônes et que le texte est déjà en variants/rem → **aucune conversion nécessaire** ; vérifié par la revue manuelle Task 4 Step 4. ✓
- Split Workbench resize + clamp [40,80] + persistance DB (`useAppSetting`, sans migration) → Tasks 2, 5. ✓
- Chargement fiable de la valeur persistée (garde `!isLoading` + `hydrated`) → Task 5, Step 2. ✓
- Sidebar nav gauche fixe / pas de migration / pas de scaling d'icônes (hors scope) → respecté (aucune tâche ne les touche). ✓

**Placeholder scan :** aucun TODO/TBD ; chaque step de code contient le code complet.

**Type consistency :** `clampAppFontSize`/`appFontScale`/`rootFontSizePx` (Task 1) consommés tels quels en Tasks 3 & 4 ; `clampSplitPct`/`parseSplitPct`/`SPLIT_DEFAULT` (Task 2) consommés en Task 5 ; `useAppSetting` renvoie bien `{ valueOrDefault, isLoading, save }` (vérifié dans `src/hooks/useAppSetting.ts`).
