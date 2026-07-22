# Source unique models & efforts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que la création de persona propose exactement la même liste de models et efforts que le chat de session, via une source unique.

**Architecture:** Extraire les constantes de models/efforts (aujourd'hui dupliquées dans `ChatComposer`) dans un module partagé `src/lib/models.ts`, consommé par `ChatComposer` et `PersonaEditorDrawer`. Les labels d'options passent dans le namespace i18n `common`. Le type `ClaudeEffort` est étendu avec `'max'`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / MUI 7 / next-intl 4 / Vitest.

## Global Constraints

- Jamais de texte en dur dans les composants — labels via `next-intl` (`useTranslations`), traductions dans `src/config/translate/{en,fr,es,de,pt}.json` (les 5 locales).
- Tests : logique pure uniquement (Vitest, `*.test.ts` sur `lib`). L'UI se vérifie par `lint` + `tsc --noEmit` + `build`.
- `"use client"` sur les composants interactifs (déjà présent).
- Path alias `@/*` → `./src/*`.
- Ne rien commiter/push sans accord explicite de Ludovic.
- Comportement « valeur vide = défaut SDK » conservé (`model || null`, `effort || null`).

---

### Task 1: Module partagé `src/lib/models.ts` + test

**Files:**
- Create: `src/lib/models.ts`
- Test: `src/lib/models.test.ts`

**Interfaces:**
- Produces: `MODEL_ALIASES`, `MODEL_VERSIONS`, `MODELS`, `EFFORTS` — chacun un `readonly` array d'objets `{ value: string; key: string }`. `key` = clé i18n dans le namespace `common`.

- [ ] **Step 1: Écrire le test qui échoue**

`src/lib/models.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { MODEL_ALIASES, MODEL_VERSIONS, MODELS, EFFORTS } from './models';

describe('models', () => {
	it('MODELS = alias + versions, sans doublon de value', () => {
		expect(MODELS).toEqual([...MODEL_ALIASES, ...MODEL_VERSIONS]);
		const values = MODELS.map((m) => m.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('expose les 3 alias et 10 versions pinnées', () => {
		expect(MODEL_ALIASES.map((m) => m.value)).toEqual(['opus', 'sonnet', 'haiku']);
		expect(MODEL_VERSIONS).toHaveLength(10);
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-opus-4-8');
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-fable-5');
	});

	it('EFFORTS inclut max', () => {
		expect(EFFORTS.map((e) => e.value)).toEqual(['low', 'medium', 'high', 'max']);
	});

	it('chaque entrée a une value et une key non vides', () => {
		for (const item of [...MODELS, ...EFFORTS]) {
			expect(item.value.length).toBeGreaterThan(0);
			expect(item.key.length).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/models.test.ts`
Expected: FAIL — `Cannot find module './models'`.

- [ ] **Step 3: Écrire le module**

`src/lib/models.ts` :

```ts
// Source unique des models & efforts Claude, partagée par le chat et l'éditeur de persona.
// Aliases : résolus par l'Agent SDK vers le dernier modèle de chaque famille.
export const MODEL_ALIASES = [
	{ value: 'opus', key: 'modelOpus' },
	{ value: 'sonnet', key: 'modelSonnet' },
	{ value: 'haiku', key: 'modelHaiku' },
] as const;

// Versions pinnées (IDs exacts). À tenir à jour lors des sorties de modèles.
export const MODEL_VERSIONS = [
	{ value: 'claude-fable-5', key: 'modelFable5' },
	{ value: 'claude-opus-4-8', key: 'modelOpus48' },
	{ value: 'claude-opus-4-7', key: 'modelOpus47' },
	{ value: 'claude-opus-4-6', key: 'modelOpus46' },
	{ value: 'claude-opus-4-5', key: 'modelOpus45' },
	{ value: 'claude-opus-4-1', key: 'modelOpus41' },
	{ value: 'claude-sonnet-5', key: 'modelSonnet5' },
	{ value: 'claude-sonnet-4-6', key: 'modelSonnet46' },
	{ value: 'claude-sonnet-4-5', key: 'modelSonnet45' },
	{ value: 'claude-haiku-4-5', key: 'modelHaiku45' },
] as const;

export const MODELS = [...MODEL_ALIASES, ...MODEL_VERSIONS] as const;

export const EFFORTS = [
	{ value: 'low', key: 'effortLow' },
	{ value: 'medium', key: 'effortMedium' },
	{ value: 'high', key: 'effortHigh' },
	{ value: 'max', key: 'effortMax' },
] as const;
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/models.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/models.ts src/lib/models.test.ts
git commit -m "feat: shared models/efforts source of truth"
```

---

### Task 2: Déplacer les labels i18n vers `common` (5 locales)

**Files:**
- Modify: `src/config/translate/en.json`
- Modify: `src/config/translate/fr.json`
- Modify: `src/config/translate/es.json`
- Modify: `src/config/translate/de.json`
- Modify: `src/config/translate/pt.json`

**Interfaces:**
- Produces (dans le namespace `common` de chaque locale) : les 17 clés de label `modelOpus`, `modelSonnet`, `modelHaiku`, `modelFable5`, `modelOpus48`, `modelOpus47`, `modelOpus46`, `modelOpus45`, `modelOpus41`, `modelSonnet5`, `modelSonnet46`, `modelSonnet45`, `modelHaiku45`, `effortLow`, `effortMedium`, `effortHigh`, `effortMax` + 2 nouvelles clés `modelGroupAliases`, `modelGroupVersions`.

- [ ] **Step 1: Déplacer les 17 clés de `agentChat` vers `common`, dans chaque locale**

Pour chacun des 5 fichiers `src/config/translate/*.json` :
1. Dans l'objet `agentChat`, **couper** les 17 clés listées ci-dessus (labels d'options — PAS les clés de champ `model` et `effort` qui restent dans `agentChat`).
2. Les **coller** dans l'objet `common`, avec leurs valeurs inchangées (même traduction).

Exemple pour `fr.json` — les valeurs à retrouver dans `common` après déplacement :
`modelOpus`="Opus (dernier)", `modelSonnet`="Sonnet (dernier)", `modelHaiku`="Haiku (dernier)", `modelFable5`="Fable 5", `modelOpus48`="Opus 4.8", `modelOpus47`="Opus 4.7", `modelOpus46`="Opus 4.6", `modelOpus45`="Opus 4.5", `modelOpus41`="Opus 4.1", `modelSonnet5`="Sonnet 5", `modelSonnet46`="Sonnet 4.6", `modelSonnet45`="Sonnet 4.5", `modelHaiku45`="Haiku 4.5", `effortLow`="Low", `effortMedium`="Medium", `effortHigh`="High", `effortMax`="Max".

> Ne pas retraduire : reprendre exactement la valeur existante de chaque locale.

- [ ] **Step 2: Ajouter les 2 clés de sous-titre dans `common`, par locale**

Dans l'objet `common` de chaque fichier, ajouter :

| Locale | `modelGroupAliases` | `modelGroupVersions` |
| --- | --- | --- |
| en | `"Aliases"` | `"Versions"` |
| fr | `"Alias"` | `"Versions"` |
| es | `"Alias"` | `"Versiones"` |
| de | `"Aliase"` | `"Versionen"` |
| pt | `"Aliases"` | `"Versões"` |

- [ ] **Step 3: Vérifier la validité JSON et l'absence de doublons de clés**

Run:
```bash
node -e "for (const l of ['en','fr','es','de','pt']) { const j=require('./src/config/translate/'+l+'.json'); const c=j.common, a=j.agentChat; ['modelOpus48','effortMax','modelGroupAliases','modelGroupVersions'].forEach(k=>{ if(!(k in c)) throw new Error(l+' common manque '+k); }); if('modelOpus48' in a) throw new Error(l+' agentChat contient encore modelOpus48'); if(!('model' in a)||!('effort' in a)) throw new Error(l+' agentChat a perdu model/effort'); console.log(l,'ok'); }"
```
Expected: `en ok` … `pt ok`.

- [ ] **Step 4: Commit**

```bash
git add src/config/translate/en.json src/config/translate/fr.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "i18n: move model/effort labels to common namespace"
```

---

### Task 3: `ChatComposer` consomme le module partagé

**Files:**
- Modify: `src/components/agents/chat/ChatComposer.tsx`

**Interfaces:**
- Consumes: `MODEL_ALIASES`, `MODEL_VERSIONS`, `MODELS`, `EFFORTS` depuis `@/lib/models` ; labels via `useTranslations('common')`.

- [ ] **Step 1: Remplacer les constantes locales par l'import**

Supprimer les blocs `MODEL_ALIASES` / `MODEL_VERSIONS` / `MODELS` / `EFFORTS` (lignes 27-52, garder `MODES`) et ajouter en haut de fichier :

```ts
import { MODEL_ALIASES, MODEL_VERSIONS, MODELS, EFFORTS } from '@/lib/models';
```

Le bloc restant (lignes ~27-32 après édition) ne contient plus que :

```ts
const MODES = [
	{ value: 'bypassPermissions', key: 'modeBypass' },
	{ value: 'plan', key: 'modePlan' },
	{ value: 'acceptEdits', key: 'modeEdit' },
] as const;
```

- [ ] **Step 2: Ajouter le translator `common` et router les labels d'options**

Après `const t = useTranslations('agentChat');` (l.136) ajouter :

```ts
	const tc = useTranslations('common');
```

Puis remplacer les lookups de label de **model** et **effort** par `tc` (les `MODES` et autres textes restent sur `t`) :
- l.283 : `{modelLabel ? tc(modelLabel) : model}`
- l.302 (dans `MODEL_ALIASES.map`) : `{tc(o.key)}`
- l.316 (dans `MODEL_VERSIONS.map`) : `{tc(o.key)}`
- l'affichage du label d'effort (utilise `effortLabel`, chercher `t(effortLabel)`) : `{effortLabel ? tc(effortLabel) : effort}`

Ne pas toucher `modeLabel` / `MODES` (restent `t`).

- [ ] **Step 3: Vérifier types + lint**

Run: `npx tsc --noEmit && npx eslint src/components/agents/chat/ChatComposer.tsx`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/chat/ChatComposer.tsx
git commit -m "refactor: ChatComposer uses shared models module"
```

---

### Task 4: `ClaudeEffort` + `PersonaEditorDrawer`

**Files:**
- Modify: `src/types/index.ts:432`
- Modify: `src/components/personas/PersonaEditorDrawer.tsx`

**Interfaces:**
- Consumes: `MODEL_ALIASES`, `MODEL_VERSIONS`, `EFFORTS` depuis `@/lib/models` ; labels via `useTranslations('common')`.

- [ ] **Step 1: Étendre `ClaudeEffort`**

`src/types/index.ts:432` — remplacer :

```ts
export type ClaudeEffort = 'low' | 'medium' | 'high';
```

par :

```ts
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';
```

- [ ] **Step 2: Remplacer les listes en dur par l'import**

Dans `PersonaEditorDrawer.tsx`, supprimer les lignes 27-28 (`MODEL_OPTIONS`, `EFFORT_OPTIONS`) et ajouter les imports :

```ts
import ListSubheader from '@mui/material/ListSubheader';
import { MODEL_ALIASES, MODEL_VERSIONS, EFFORTS } from '@/lib/models';
```

Conserver `PERMISSION_OPTIONS` (l.29) inchangé.

- [ ] **Step 3: Ajouter le translator `common`**

Après `const t = useTranslations('personas');` (l.66) ajouter :

```ts
	const tc = useTranslations('common');
```

- [ ] **Step 4: Rendu groupé du select model**

Remplacer le contenu du `TextField select` model (les `MenuItem` générés par `MODEL_OPTIONS.map`, l.151-155) par :

```tsx
						<MenuItem value="">{t('defaultOption')}</MenuItem>
						<ListSubheader>{tc('modelGroupAliases')}</ListSubheader>
						{MODEL_ALIASES.map((m) => (
							<MenuItem key={m.value} value={m.value}>
								{tc(m.key)}
							</MenuItem>
						))}
						<ListSubheader>{tc('modelGroupVersions')}</ListSubheader>
						{MODEL_VERSIONS.map((m) => (
							<MenuItem key={m.value} value={m.value}>
								{tc(m.key)}
							</MenuItem>
						))}
```

- [ ] **Step 5: Rendu du select effort (avec `max`)**

Remplacer le contenu du `TextField select` effort (les `MenuItem` générés par `EFFORT_OPTIONS.map`, l.165-169) par :

```tsx
						<MenuItem value="">{t('defaultOption')}</MenuItem>
						{EFFORTS.map((e) => (
							<MenuItem key={e.value} value={e.value}>
								{tc(e.key)}
							</MenuItem>
						))}
```

> `handleSave` (l.84-85) reste inchangé : `model: model || null`, `effort: (effort || null) as NewPersona['effort']`.

- [ ] **Step 6: Vérifier types + lint**

Run: `npx tsc --noEmit && npx eslint src/components/personas/PersonaEditorDrawer.tsx src/types/index.ts`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/components/personas/PersonaEditorDrawer.tsx
git commit -m "feat: persona editor exposes full model list + max effort"
```

---

### Task 5: Vérification finale

**Files:** aucun (vérification uniquement).

- [ ] **Step 1: Suite de tests + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tests PASS, aucune erreur TS, build OK.

- [ ] **Step 2: Vérification manuelle**

Lancer l'app (`npm run dev`), ouvrir la bibliothèque de personas → « Nouveau persona ». Vérifier :
- Le select **Model** montre « Défaut », un groupe **Alias** (3), un groupe **Versions** (10) = 13 models + défaut.
- Le select **Effort** montre « Défaut » + `Low/Medium/High/Max`.
- Le chat de session (ChatComposer) affiche toujours correctement les labels de model/effort.

---

## Self-Review

- **Couverture spec** : §1 module → Task 1 ; §2 i18n `common` → Task 2 ; §3 ChatComposer → Task 3 ; §4 PersonaEditorDrawer → Task 4 ; §5 `ClaudeEffort` → Task 4 Step 1 ; vérif → Task 5. ✅
- **Placeholders** : aucun — code complet à chaque étape. ✅
- **Cohérence des types** : `{ value, key }` uniforme entre module, ChatComposer et PersonaEditorDrawer ; `tc` = `useTranslations('common')` dans les deux composants ; clés `common` (Task 2) = clés référencées (Task 3/4). ✅
