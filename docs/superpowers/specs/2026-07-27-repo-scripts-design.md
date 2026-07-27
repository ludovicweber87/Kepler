# Scripts par repo — design

Date : 2026-07-27
Statut : validé

## Problème

Chaque repo a des commandes qu'on relance sans arrêt dans un worktree : `pnpm dev`, `pnpm test --watch`, ou des prompts d'agent récurrents comme `/simplify`. Aujourd'hui il faut les retaper à la main dans un terminal ou dans le chat.

On veut déclarer ces commandes une fois par repo, puis les déclencher en un clic depuis la topbar quand un worktree est actif.

## Périmètre

Dans le périmètre :

- CRUD de scripts (nom + commande + mode d'exécution) par repo, dans la page settings du repo
- Un bloc « Dans ce worktree » dans le Header global, à gauche du menu éditeur, listant les scripts du repo courant
- Deux modes d'exécution : `terminal` (nouvel onglet terminal qui lance la commande) et `chat` (message envoyé à l'agent)

Hors périmètre, volontairement :

- Réordonnancement drag & drop des scripts
- Variables interpolées dans les scripts (`$BRANCH`, `$WORKTREE`…)
- Scripts globaux partagés entre repos
- Exécution headless, sans terminal visible
- Fusion des `setup_script` / `archive_script` existants dans le nouveau modèle

## Contexte existant

Trois éléments du code actuel cadrent la solution.

**Une page settings par repo existe déjà.** `/settings/repo/[...repo]` rend `RepoSettingsPanel`, adossé à la table `repo_settings` et au hook `useRepoSettings`. Cette table porte déjà `setup_script`, `setup_script_name` et `archive_script` : ce sont des hooks de cycle de vie du worktree (exécutés à la création, à l'archivage), mono-valeur, sans bouton d'UI. Ils restent inchangés — leur sémantique n'est pas celle d'un script déclenché à la main.

**Le menu éditeur est dans le Header global.** `EditorPicker` est monté dans `src/components/layout/Header.tsx`, pas dans le header du Workbench, et n'apparaît que si la session courante est active (`classifySession(resolved) === 'active'`). Le bloc de scripts se place au même endroit, sous les mêmes conditions.

**La plomberie d'exécution existe des deux côtés.** `TerminalTabs` sait ouvrir un onglet terminal supplémentaire ; `ShellTerminal` parle déjà `{type:'input'}` au PTY. Côté chat, `AgentChatTab` remonte déjà des actions au Workbench via le pattern `{available, trigger}` (`onCreatePrStateChange`, `onCommitPushStateChange`), consommées dans `headerActions`.

## Décisions

| Sujet | Décision | Raison |
| --- | --- | --- |
| Modèle | Table dédiée `repo_scripts` | N scripts par repo ; CRUD propre ; `repo_settings` reste mono-valeur |
| Mode chat | `chat.send()` direct | Reproduit Create PR / Commit & push, zéro nouvelle plomberie composer |
| Mode terminal | Nouvel onglet à chaque clic, navigation si besoin | Prévisible ; pas de tracking d'onglets par script |
| UX settings | Section avec CRUD immédiat | Indépendant du bouton Save global du panel |
| Rendu topbar | Tous les boutons, scroll horizontal | Tout reste à un clic |
| Câblage Header → Workbench | Contexte avec action en attente | Survit à la navigation `/issues` → `/workbench` |

L'alternative « enregistrement impératif » pour le câblage (le Workbench s'enregistre au montage, le Header appelle) a été écartée : au clic depuis une autre page, le Workbench n'est pas encore monté et l'action serait perdue.

## Données

Nouvelle table dans `src/db/schema.ts` :

```ts
export const repoScripts = sqliteTable('repo_scripts', {
  id: uuid(),
  repo_full_name: text().notNull(),
  name: text().notNull(),
  script: text().notNull().default(''),
  run_mode: text().notNull().default('terminal'),
  sort_order: integer().default(0),
  created_at: timestamp(),
});
```

Pas de contrainte unique sur `repo_full_name` : N lignes par repo. Index simple `repo_scripts_repo` sur cette colonne. `script` accepte du multiline.

Migration `src/db/migrations/0025_repo_scripts.sql` (SQL brut, `--> statement-breakpoint` entre les statements) plus une entrée dans `meta/_journal.json` : `{ "idx": 25, "version": "6", "when": 1786200000000, "tag": "0025_repo_scripts", "breakpoints": true }`. Pas de snapshot — c'est le pattern des migrations manuelles du repo depuis `0008`.

Types dans `src/types/index.ts` :

```ts
export type RepoScriptRunMode = 'terminal' | 'chat';

export interface RepoScript {
  id: string;
  repo_full_name: string;
  name: string;
  script: string;
  run_mode: RepoScriptRunMode;
  sort_order: number;
}
```

## API

`src/app/api/repo-scripts/route.ts`, style des routes récentes : `requireAuth()` + `isAuthError()` en tête de chaque handler, accès better-sqlite3 synchrone, `try/catch` uniforme vers `NextResponse.json({ error }, { status: 500 })`.

| Méthode | Entrée | Sortie |
| --- | --- | --- |
| `GET` | `?repo=owner/name` | `RepoScript[]`, trié par `sort_order` puis `created_at` |
| `POST` | `{ repo_full_name, name, script, run_mode }` | la row créée, `sort_order = max + 1` |
| `PATCH` | `{ id, ...patch }` | la row mise à jour |
| `DELETE` | `?id=` | `{ ok: true }` |

`GET` sans `repo` et `DELETE` sans `id` répondent 400.

## Hooks

`src/hooks/useRepoScripts.ts` — React Query sur la clé `['repo-scripts', repoFullName]`, `enabled: !!repoFullName`. Expose `{ scripts, isLoading, create, update, remove }`. Les trois mutations suivent le pattern optimiste de `useRepoPaths` : `onMutate` (cancel, snapshot, `setQueryData`), rollback `onError`, `invalidateQueries` `onSettled`.

Le Header et le panel settings consomment le même hook, donc la même clé de cache : ajouter un script le fait apparaître dans la topbar sans reload.

`src/lib/repoScripts.ts` — logique pure, testable :

- `visibleScripts(scripts)` : écarte les scripts dont le `name` est vide (une ligne fraîchement créée et pas encore remplie ne doit pas polluer la topbar), trie par `sort_order` puis `created_at`
- `nextSortOrder(scripts)` : `max(sort_order) + 1`, `0` sur liste vide

## UI — édition

Nouvelle section « Scripts » dans `RepoSettingsPanel`, placée après « Setup script » par voisinage thématique, en dehors du bouton Save global.

Une ligne par script dans un `Box` bordé :

- `TextField` *Nom*, size small, largeur ~200px
- `TextField` *Script*, multiline `minRows={1}`, `flex: 1`
- `TextField select` *Mode*, options `terminal` / `chat`, largeur ~140px
- `IconButton` `DeleteOutlineRounded`

La persistance se fait sur `onBlur` du champ modifié (`update({ id, ...patch })`), pas à chaque frappe. En bas, un `Button startIcon={<AddRounded />}` « Ajouter un script » appelle `create()` avec une ligne vide (`name: ''`, `script: ''`, `run_mode: 'terminal'`).

## UI — affichage

`src/components/layout/WorktreeScripts.tsx`, monté dans `Header.tsx` juste avant `<EditorPicker />` :

```tsx
{activeWorktree && <WorktreeScripts repoFullName={repoFullName} sessionId={sessionId} />}
```

`repoFullName` se dérive de la session courante avec `resolveRepoFullName(resolved, repoPaths)`, exactement comme `Workbench.tsx:95`. Le composant retourne `null` si `visibleScripts()` est vide.

Structure : un `Box` flex row, `borderRadius: 2`, `px: 1`, `py: 0.5`, `gap: 0.75`, fond légèrement assombri, contenant

- un `Typography variant="caption"` non cliquable « Dans ce worktree » (`text.disabled`, `whiteSpace: 'nowrap'`, `pr: 0.5`)
- un `Button size="small" variant="text"` par script (`textTransform: 'none'`, `minWidth: 0`), avec `TerminalRounded` ou `ChatBubbleOutlineRounded` selon `run_mode`

`overflowX: 'auto'`, `maxWidth` bornée (~340px) pour ne pas écraser le reste du Toolbar, scrollbar masquée.

`src/theme/shadows.ts` porte une règle explicite : aucun composant ne doit écrire une string `boxShadow` en dur, et `appShadow()` est une ombre portée. L'effet « shadow inside » demandé passe donc par un ajout dans ce même fichier :

```ts
export const appInsetShadow = (mode: PaletteMode) =>
  `inset 0 1px 3px rgba(0,0,0,${SHADOW_ALPHA[mode] * 1.5})`;
```

## Exécution

### Le contexte

`src/hooks/useScriptRunner.tsx`, jumeau de `useOverlayTerminal.tsx`, provider monté dans `AppShell` à côté d'`OverlayTerminalContext` :

```ts
export type PendingScriptRun = {
  nonce: number;
  sessionId: string;
  mode: RepoScriptRunMode;
  name: string;
  script: string;
};

// contexte : { pending, run(payload), consume() }
```

`run()` incrémente le `nonce`, donc recliquer le même script redéclenche bien l'effet consommateur. `WorktreeScripts` appelle `run(...)` puis, si on n'est pas déjà sur `/workbench?session=<id>`, fait un `router.push()`. L'action attend dans le contexte que le Workbench monte.

### Consommation dans le Workbench

Un effet consomme `pending` quand `pending.sessionId === sessionId`, puis appelle `consume()`.

Les deux cibles sont stockées en `useState` et non en `ref`, pour que l'effet se rejoue quand la cible devient disponible après une navigation :

- **`chat`** — `AgentChatTab` remonte son `chat.send` via une nouvelle prop `onSendReady`, même pattern que `onCreatePrStateChange`. Le script est envoyé tel quel. Si l'agent est occupé, `useAgentChat.send()` met le message en file et l'affiche dans `<ChatQueued>` : comportement déjà correct, rien à ajouter.
- **`terminal`** — `TerminalTabs` gagne un handle `TerminalTabsHandle { openWithCommand(cmd, label) }`. Son état passe de `number[]` à `{ id, label?, initialCommand? }[]` ; le Chip affiche `label ?? t('terminalTab', { n: id })`. Le nouvel onglet devient actif.

### Exécution dans le PTY

`ShellTerminal` gagne une prop `initialCommand?: string`. Le handler `onmessage` ignore aujourd'hui le JSON `{type:'init-ack'}` ; on s'y accroche : à réception, si `initialCommand` est défini et qu'un `commandSentRef` est encore à `false`, on le passe à `true` et on envoie `{ type: 'input', data: initialCommand + '\r' }`.

Le ref garantit que la reconnexion au réveil (`useReconnectOnWake`, qui renvoie un `init`) ne relance pas la commande.

Aucune modification du serveur agent : on réutilise le protocole `input` existant, et le `cwd` du PTY est déjà le worktree, ce qui donne son sens au libellé « Dans ce worktree ».

`ShellTerminal.runCommand` — le handle impératif existant, aujourd'hui mort — n'est volontairement pas le vecteur retenu : il n'offre aucune garantie que le PTY soit attaché au moment de l'appel. Il reste en place, inchangé.

## Cas limites

| Cas | Comportement |
| --- | --- |
| Session archivée ou passée | Le bloc n'est pas rendu (`activeWorktree` est `null` hors session active) |
| Repo sans script | Le bloc n'est pas rendu |
| Script au nom vide | Filtré par `visibleScripts()` |
| Clic depuis une autre page | `run()` puis `router.push('/workbench?session=<id>')` ; l'effet consomme au montage |
| Clic répété sur le même script | Le `nonce` change, l'effet se rejoue, un nouvel onglet s'ouvre |
| Agent occupé en mode chat | Le message est mis en file par `useAgentChat` |
| Reconnexion du PTY après veille | `commandSentRef` empêche de relancer la commande |
| Repo non résolu (`repoFullName === null`) | La query est désactivée, le bloc n'est pas rendu |

## i18n

Nouvelles clés dans `src/config/translate/{en,fr,es,de,pt}.json` :

- `header.inThisWorktree`
- `repoSettings.scripts`, `scriptsDesc`, `scriptName`, `scriptNamePlaceholder`, `scriptCommand`, `scriptMode`, `scriptModeTerminal`, `scriptModeChat`, `addScript`, `deleteScript`

## Tests

Convention du repo : logique pure uniquement, en Vitest.

- `src/lib/repoScripts.test.ts` — `visibleScripts()` (filtrage des noms vides, tri par `sort_order` puis `created_at`) et `nextSortOrder()` (liste vide, liste peuplée, trous dans la numérotation)

L'UI se vérifie par `npm run lint`, `tsc --noEmit`, `npm run build` et un passage manuel.
