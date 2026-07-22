# Source unique pour la liste des models & efforts

**Date** : 2026-07-22
**Statut** : Design validé, en attente de plan d'implémentation

## Problème

La liste des models (modèles Claude) est **dupliquée** entre deux composants, sans source commune, ce qui crée une dérive :

| Emplacement | Fichier | Models proposés |
| --- | --- | --- |
| Chat de session | `src/components/agents/chat/ChatComposer.tsx` (l.27-46) | 13 : 3 alias (`opus`/`sonnet`/`haiku`) + 10 versions pinnées (`claude-opus-4-8`, `claude-sonnet-5`, `claude-fable-5`, …) |
| Création de persona | `src/components/personas/PersonaEditorDrawer.tsx` (l.27) | 4 : `['', 'sonnet', 'opus', 'haiku']` (alias seuls) |

Conséquence : impossible de choisir une version pinnée au niveau d'une persona. Même dérive sur l'**effort** : le chat propose `low/medium/high/max`, la persona seulement `low/medium/high` (pas de `max`).

La cause racine est la duplication : tant qu'il existe deux copies, elles divergeront à chaque sortie de modèle.

## Objectif

Une **source unique** de vérité pour les models et efforts, consommée par les deux composants. La création de persona propose exactement les mêmes models et efforts que le chat.

## Design

### 1. Module partagé `src/lib/models.ts` (nouveau)

Extraction des constantes actuelles de `ChatComposer`, format objet `{ value, key }` où `key` est une clé i18n :

```ts
export const MODEL_ALIASES = [
  { value: 'opus',   key: 'modelOpus' },
  { value: 'sonnet', key: 'modelSonnet' },
  { value: 'haiku',  key: 'modelHaiku' },
] as const;

export const MODEL_VERSIONS = [
  { value: 'claude-fable-5',   key: 'modelFable5' },
  { value: 'claude-opus-4-8',  key: 'modelOpus48' },
  { value: 'claude-opus-4-7',  key: 'modelOpus47' },
  { value: 'claude-opus-4-6',  key: 'modelOpus46' },
  { value: 'claude-opus-4-5',  key: 'modelOpus45' },
  { value: 'claude-opus-4-1',  key: 'modelOpus41' },
  { value: 'claude-sonnet-5',  key: 'modelSonnet5' },
  { value: 'claude-sonnet-4-6', key: 'modelSonnet46' },
  { value: 'claude-sonnet-4-5', key: 'modelSonnet45' },
  { value: 'claude-haiku-4-5', key: 'modelHaiku45' },
] as const;

export const MODELS = [...MODEL_ALIASES, ...MODEL_VERSIONS] as const;

export const EFFORTS = [
  { value: 'low',    key: 'effortLow' },
  { value: 'medium', key: 'effortMedium' },
  { value: 'high',   key: 'effortHigh' },
  { value: 'max',    key: 'effortMax' },
] as const;
```

> `MODES` (permission modes) reste dans `ChatComposer` : il n'est pas partagé avec la persona (le drawer a son propre `PERMISSION_OPTIONS`, hors périmètre).

### 2. i18n — labels d'options dans le namespace `common`

Les clés de label des options (`modelOpus`, `modelSonnet`, `modelHaiku`, `modelFable5`, `modelOpus48`, `modelOpus47`, `modelOpus46`, `modelOpus45`, `modelOpus41`, `modelSonnet5`, `modelSonnet46`, `modelSonnet45`, `modelHaiku45`, `effortLow`, `effortMedium`, `effortHigh`, `effortMax`) sont aujourd'hui dans le namespace `agentChat`. Elles servent désormais aux deux features → **déplacées vers `common`** dans les 5 locales (`en/fr/es/de/pt`).

- Retirées de `agentChat`, ajoutées à `common` (mêmes valeurs).
- Les libellés de **champ** restent en place : `agentChat.model`/`agentChat.effort` (chat), `personas.model`/`personas.effort`/`personas.defaultOption` (persona).

### 3. `ChatComposer.tsx`

- Supprime les définitions locales `MODEL_ALIASES` / `MODEL_VERSIONS` / `MODELS` / `EFFORTS` → import depuis `@/lib/models`.
- Ajoute un second translator `const tc = useTranslations('common')`.
- Les lookups de label d'options passent de `t(...)` à `tc(...)` : `modelLabel` (l.283), les `MODEL_ALIASES.map`/`MODEL_VERSIONS.map` (l.302, l.316), et `effortLabel`. Le reste (`MODES`, placeholders, hints) continue d'utiliser `t` (agentChat).
- Comportement inchangé.

### 4. `PersonaEditorDrawer.tsx`

- Supprime `MODEL_OPTIONS` et `EFFORT_OPTIONS` en dur → import `MODEL_ALIASES` / `MODEL_VERSIONS` / `EFFORTS` depuis `@/lib/models` (`MODELS` non requis ici).
- Le translator du drawer reste `useTranslations('personas')` ; ajout de `const tc = useTranslations('common')` pour les labels d'options.
- Select **model** (`TextField select`) → rendu groupé :
  - `MenuItem` « Défaut » (valeur `''`, label `t('defaultOption')`) — comportement `model || null` à la sauvegarde conservé.
  - `ListSubheader` **Alias** (label `common`, ex. clé `modelGroupAliases`) + les 3 alias (`tc(o.key)`).
  - `ListSubheader` **Versions** (clé `modelGroupVersions`) + les 10 versions (`tc(o.key)`).
  - Import de `ListSubheader` depuis `@mui/material/ListSubheader`.
- Select **effort** → « Défaut » + `EFFORTS.map` (4 options dont `max`, labels `tc(o.key)`).
- Deux nouvelles clés i18n de sous-titres à ajouter (`modelGroupAliases`, `modelGroupVersions`) dans `common` × 5 locales.

### 5. Type `ClaudeEffort` — étendre avec `max`

`src/types/index.ts:432` définit `export type ClaudeEffort = 'low' | 'medium' | 'high';` — `'max'` manque. `Persona.effort` étant typé `ClaudeEffort | null`, ajouter l'option `max` au select persona stockerait une valeur hors union (masquée aujourd'hui par le cast `as NewPersona['effort']` dans `PersonaEditorDrawer.tsx:85`).

→ Étendre : `export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';`. Aligne le type avec ChatComposer qui propose déjà `max`. `Persona.model` reste `string | null` (déjà libre, versions pinnées OK).

### 6. Hors périmètre / inchangé

- `AgentTerminalModal` : hérite du model/effort via `persona?.model ?? null` / `persona?.effort ?? null`, aucun changement (le flux `effort: 'max'` devient correctement typé de bout en bout une fois §5 appliqué).
- Sémantique « valeur vide = défaut SDK » conservée partout (`model || null`, `effort || null`).
- Aucune migration SQLite.

## Points d'attention

- Vérifier qu'aucune autre référence n'importe les constantes désormais déplacées (recherche `MODEL_ALIASES`/`MODEL_VERSIONS`/`EFFORTS`).
- `ListSubheader` dans un `TextField select` MUI n'est pas sélectionnable par défaut (OK), vérifier le rendu.
- Toutes les clés déplacées doivent exister dans les 5 locales pour éviter les warnings next-intl.

## Vérification

`npm run lint` + `tsc --noEmit` + `build`, puis run manuel : ouvrir le drawer de création de persona → vérifier les 13 models groupés + « Défaut », et l'effort avec `max`.
