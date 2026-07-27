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

Conséquence à noter, parce qu'elle simplifie le design : ce garde-fou dépend du search param `?session=`, et les deux seuls endroits qui le posent (`Sidebar.tsx:161`, `AgentTerminalModal.tsx:230`) pointent sur `/workbench`. Aucune autre route ne le porte. `EditorPicker` — et donc le bloc de scripts — n'est en pratique visible que sur `/workbench`, avec le Workbench déjà monté. Il n'y a pas de cas « clic depuis une autre page », et le composant n'a aucune navigation à faire.

**La plomberie d'exécution existe des deux côtés.** `TerminalTabs` sait ouvrir un onglet terminal supplémentaire ; `ShellTerminal` parle déjà `{type:'input'}` au PTY. Côté chat, `AgentChatTab` remonte déjà des actions au Workbench via le pattern `{available, trigger}` (`onCreatePrStateChange`, `onCommitPushStateChange`), consommées dans `headerActions`.

## Décisions

| Sujet | Décision | Raison |
| --- | --- | --- |
| Modèle | Table dédiée `repo_scripts` | N scripts par repo ; CRUD propre ; `repo_settings` reste mono-valeur |
| Mode chat | `chat.send()` direct | Reproduit Create PR / Commit & push, zéro nouvelle plomberie composer |
| Mode terminal | Nouvel onglet à chaque clic | Prévisible ; pas de tracking d'onglets par script |
| UX settings | Section avec CRUD immédiat | Indépendant du bouton Save global du panel |
| Rendu topbar | Tous les boutons, scroll horizontal | Tout reste à un clic |
| Câblage Header → Workbench | Contexte avec action en attente | Header et Workbench sont des branches voisines ; l'action tolère que la cible ne soit pas encore prête |

L'alternative « enregistrement impératif » pour le câblage (le Workbench expose ses callbacks au montage, le Header les appelle en direct) a été écartée : même avec le Workbench monté, la cible peut ne pas être prête au moment du clic — le chat vient de se reconnecter et n'a pas encore remonté son `send`, ou l'utilisateur vient de changer de session. Une action en attente, consommée par un effet, absorbe cette course sans code de retry.

## Données

Nouvelle table dans `src/db/schema.ts` :

```ts
export const repoScripts = sqliteTable(
  'repo_scripts',
  {
    id: uuid(),
    repo_full_name: text().notNull(),
    name: text().notNull(),
    script: text().notNull().default(''),
    run_mode: text().notNull().default('terminal'),
    sort_order: integer().default(0),
    created_at: timestamp(),
  },
  (table) => [index('repo_scripts_repo').on(table.repo_full_name)],
);
```

Pas de contrainte unique sur `repo_full_name` : N lignes par repo. `script` accepte du multiline. La forme `(table) => [...]` reprend celle de `projectBoards` dans le même fichier.

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
  created_at: string;
}
```

`created_at` fait partie du type exposé : c'est le critère qui départage deux scripts de même `sort_order`, aussi bien côté SQL (`ORDER BY`) que côté `visibleScripts()`.

## API

`src/app/api/repo-scripts/route.ts`, style des routes récentes : `requireAuth()` + `isAuthError()` en tête de chaque handler, accès better-sqlite3 synchrone, `try/catch` uniforme vers `NextResponse.json({ error }, { status: 500 })`.

| Méthode | Entrée | Sortie |
| --- | --- | --- |
| `GET` | `?repo=owner/name` | `RepoScript[]`, trié par `sort_order` puis `created_at` |
| `POST` | `{ repo_full_name, name, script, run_mode }` | la row créée, `sort_order = max + 1` |
| `PATCH` | `{ id, ...patch }` | la row mise à jour |
| `DELETE` | `?id=` | `{ ok: true }` |

Validation : `GET` sans `repo`, `DELETE` sans `id`, `POST`/`PATCH` avec un `run_mode` hors de `'terminal' | 'chat'` répondent 400. `PATCH` sur un `id` inconnu répond 404.

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

La persistance appelle `update({ id, ...patch })`, jamais à chaque frappe : sur `onBlur` pour les deux champs texte (*Nom*, *Script*), sur `onChange` pour le select *Mode* — un select n'a pas d'état « en cours de saisie », et attendre le blur après fermeture du menu est moins prévisible.

En bas, un `Button startIcon={<AddRounded />}` « Ajouter un script » appelle `create()` avec une ligne vide (`name: ''`, `script: ''`, `run_mode: 'terminal'`).

## UI — affichage

`src/components/layout/WorktreeScripts.tsx`, monté dans `Header.tsx` juste avant `<EditorPicker />` :

```tsx
{activeWorktree && <WorktreeScripts repoFullName={repoFullName} sessionId={sessionId} />}
```

`repoFullName` se dérive de la session courante avec `resolveRepoFullName(resolved, repoPaths)`, exactement comme `Workbench.tsx:95`. `Header.tsx` ne fait aujourd'hui ni l'un ni l'autre : il faut y ajouter l'import de `useRepoPaths` et de `resolveRepoFullName`, en miroir de `Workbench.tsx:94-98`. Le composant retourne `null` si `visibleScripts()` est vide.

Structure : un `Box` flex row, `borderRadius: 2`, `px: 1`, `py: 0.5`, `gap: 0.75`, fond légèrement assombri, `boxShadow: appInsetShadow(theme.palette.mode)`, contenant

- un `Typography variant="caption"` non cliquable « Dans ce worktree » (`text.disabled`, `whiteSpace: 'nowrap'`, `pr: 0.5`)
- un `Button size="small" variant="text"` par script (`textTransform: 'none'`, `minWidth: 0`), avec `TerminalRounded` ou `ChatBubbleOutlineRounded` selon `run_mode`

`overflowX: 'auto'`, `maxWidth` bornée (~340px) pour ne pas écraser le reste du Toolbar, scrollbar masquée.

`src/theme/shadows.ts` porte une règle explicite : aucun composant ne doit écrire une string `boxShadow` en dur, et `appShadow()` est une ombre portée. L'effet « shadow inside » demandé passe donc par un ajout dans ce même fichier :

```ts
export const appInsetShadow = (mode: PaletteMode) =>
  `inset 0 1px 3px rgba(0,0,0,${SHADOW_ALPHA[mode] * 1.5})`;
```

Le docstring d'`appShadow` dit aujourd'hui « L'UNIQUE ombre de l'app ». Il faut le reformuler dans le même commit — quelque chose comme « les deux seules ombres de l'app : `appShadow` (portée) et `appInsetShadow` (creusée) » — sinon le fichier se contredit lui-même pour le prochain lecteur.

## Exécution

### Le contexte

`src/hooks/useScriptRunner.ts`, jumeau de `useOverlayTerminal.ts` : un fichier TS simple qui exporte `createContext` + le hook `useScriptRunner()`, sans JSX. Comme pour l'overlay, le `<ScriptRunnerContext.Provider>` et son `useState` sont écrits directement dans `AppShell.tsx`, à côté de l'`OverlayTerminalContext.Provider` existant.

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

`run()` incrémente le `nonce`, donc recliquer le même script redéclenche bien l'effet consommateur. `WorktreeScripts` se contente d'appeler `run(...)` : le bloc n'étant visible que sur `/workbench` (voir « Contexte existant »), il n'y a aucune navigation à déclencher.

### Consommation dans le Workbench

Un effet consomme `pending` quand `pending.sessionId === sessionId`, puis appelle `consume()`.

Les deux cibles sont stockées en `useState` et non en `ref`, pour que l'effet se rejoue quand la cible devient disponible. Le cas visé ici n'est pas un changement de route — il n'y en a pas, le bloc ne vit que sur `/workbench` — mais un changement de session ou une reconnexion du chat à l'intérieur du Workbench, qui rend la cible momentanément indisponible :

- **`chat`** — `AgentChatTab` remonte son `chat.send` via une nouvelle prop `onSendReady`, même pattern que `onCreatePrStateChange`. Le script est envoyé tel quel. Si l'agent est occupé, `useAgentChat.send()` met le message en file et l'affiche dans `<ChatQueued>` : comportement déjà correct, rien à ajouter.
- **`terminal`** — `TerminalTabs` devient un `forwardRef` exposant `TerminalTabsHandle { openWithCommand(cmd, label) }`. Son état passe de `number[]` à `{ id, label?, initialCommand? }[]` ; le Chip affiche `label ?? t('terminalTab', { n: id })`. Le nouvel onglet devient actif. `Workbench.tsx` attache ce handle via une callback ref qui alimente le `useState` décrit ci-dessus, puis appelle `openWithCommand(pending.script, pending.name)`.

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
| Hors `/workbench` | Le bloc n'est pas rendu : aucune autre route ne porte `?session=` |
| Cible pas encore prête (chat en reconnexion, changement de session) | L'action reste `pending` ; l'effet se rejoue dès que le `useState` de la cible est alimenté |
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
