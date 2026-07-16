# Fix — lancement d'agent depuis une issue : lecture d'issue + naming

Date : 2026-07-16

## Contexte & problème

Lorsqu'on lance un agent depuis une issue GitHub (soit directement depuis une issue,
soit depuis un repo en collant le lien d'une issue), deux bugs :

1. **La step « Lecture de l'issue par l'agent » ne fait rien** et paraît « écrasée »
   par la step de création du worktree.
2. **Le renommage se fait mal** : le nom de session/branche se réduit au numéro
   d'issue (`#123`).

## Diagnostic (causes racines)

### Bug 1 — la lecture d'issue est purement sautée (token absent)

Le serveur agent `/git/provision` (`packages/agent/src/routes/git.ts:658-709`) est
**déjà séquentiel** : il attend la lecture de l'issue avant de créer le worktree. Ce
n'est donc pas une course entre steps.

Le vrai problème : le bloc `read-issue` est gardé par `if (body.issue && token)`
(`git.ts:660`), or `token` est **toujours `null`** :

- `token = getToken(req)` (`git.ts:641`) lit uniquement le header
  `Authorization: Bearer` (`packages/agent/src/helpers.ts:99-103`).
- Ce header n'est posé par `localFetch` que si `_token` est défini
  (`src/lib/local-fetch.ts:44`), via `setLocalToken()`.
- **`setLocalToken()` n'est jamais appelé** (grep : seulement sa définition).

⟹ Aucun header → `getToken()` renvoie `null` → le bloc `read-issue` est zappé :
**aucun event `running`/`done` émis**. La step reste `pending` (rond vide) pendant que
le worktree enchaîne. D'où « ne fait rien / écrasée ».

Effet de bord : `/git/branch` (`git.ts:392`) subit le même manque de token → le
commentaire posté sur l'issue échoue silencieusement.

### Bug 2 — le nom n'est jamais dérivé du titre

- Le nom de session est **codé en dur** à `#${issueNumber}`
  (`src/components/agents/AgentTerminalModal.tsx:358` et `:416`).
- La branche reste `wip-…` : elle n'est renommée que sur le **premier message
  utilisateur** (`src/components/workbench/Workbench.tsx:454`), ce qui ne se produit
  pas pour une session lancée depuis une issue (l'agent démarre seul depuis le
  `system_prompt`).
- L'endpoint prévu, `/git/generate-branch-name` (`feat/123-slug` depuis le titre),
  est **du code mort** — jamais appelé.

## Décisions

1. **Token côté agent** : le serveur agent résout lui-même le token via `gh auth token`
   (fallback `GITHUB_TOKEN`), conforme au modèle d'auth documenté (« l'auth passe par la
   session `gh` CLI »). Pas de plomberie navigateur.
2. **Lecture d'issue** : injection **brute** du contenu (titre/corps/commentaires) dans le
   `system_prompt`, sans résumé LLM (quasi instantané, pas d'appel bloquant).
3. **Naming** : slug **local déterministe** depuis le titre → `feat/{number}-{slug}`
   (pas d'appel LLM).

## Design

### Fix 1 — `resolveGitHubToken` côté agent

`packages/agent/src/helpers.ts` :

- Nouveau locateur `findGh()` calqué sur `findClaude()` (`helpers.ts:59-82`) : le serveur
  agent tourne dans un process séparé (:4001) dont le `PATH` peut ne pas contenir `gh` ;
  on cherche donc `gh` dans les emplacements Homebrew/usr puis via `command -v gh`,
  fallback nom nu.
- Nouvelle fonction `resolveGitHubToken(req)` :
  1. `getToken(req)` (header `Authorization: Bearer`) s'il existe, sinon
  2. `execFileSync(findGh(), ['auth', 'token'])` (trim, try/catch), sinon
  3. `process.env.GITHUB_TOKEN ?? null`.

Remplacer `getToken(req)` par `resolveGitHubToken(req)` dans :

- `/git/provision` (`git.ts:641`) — débloque `read-issue`.
- `/git/branch` (`git.ts:392`) — restaure le commentaire d'issue.

`read-issue` étant déjà awaité avant le worktree, le loader reste affiché jusqu'à la fin
de la lecture, puis le worktree démarre. Symptôme « step écrasée » résolu.

### Fix 2 — `read-issue` = injection brute (sans LLM)

Dans `/git/provision` (`git.ts:676-698`) : remplacer le résumé `claude --print` par une
injection brute dans le `system_prompt` :

```
## Contexte de l'issue #{number} : {title}

{body}

## Commentaires
{comments joints}
```

- Le `try/catch` gracieux est conservé : échec (fetch KO, etc.) → step `done` avec
  `message: 'skipped'`, jamais bloquant.
- Les events `running` puis `done` sont toujours émis.

### Fix 3 — naming dérivé du titre

- Nouveau `src/lib/slug.ts` (client-safe, pur, aucune dépendance node) :
  `slugify(text: string, maxLen = 40): string`.
- `AgentTerminalModal.tsx`, quand on lance depuis une issue **sans nom de branche saisi** :
  - `handleLaunch` : `branch = feat/{number}-{slugify(title)}` (au lieu de
    `randomWorktreeName()`), `agentName = title` tronqué (au lieu de `#{number}`).
    **Ordre important** : le nom de branche doit être calculé **après** la résolution de
    l'issue liée (après `fetchIssueContext`, aujourd'hui `AgentTerminalModal.tsx:348`),
    car `linked.issueTitle` n'est disponible qu'à ce moment — sinon on obtient
    `feat/123-undefined`. La ligne actuelle `const name = trimmedName || randomWorktreeName()`
    (`:336`) doit être déplacée / recalculée après le bloc de fetch.
  - `handleLaunchExistingBranch` : conserve la branche existante sélectionnée, mais
    corrige `agentName = title` tronqué.
  - `agentName` : troncature d'affichage uniquement (max ~72 caractères, ellipse), **non**
    réinjectée dans le slug (le slug a sa propre borne `maxLen = 40`).
  - Fallbacks : titre vide/slug vide → `feat/{number}` ; pas d'issue → comportement
    actuel (`randomWorktreeName()` / nom saisi).
- `feat/…` ne commence pas par `wip-`, donc `isAutoNamed` (`Workbench.tsx:177`) est faux
  → le rename « premier message » n'écrase pas le nom issu de l'issue.

### Fix 3b — unicité du nom (collision au relancement)

`randomWorktreeName()` est unique par construction ; un nom déterministe
`feat/{number}-{slug}` ne l'est pas. Un second lancement depuis la même issue (ou un
relancement après suppression du worktree) collisionnerait avec la branche existante et
ferait échouer `git worktree add -b <branch> origin/main` (`git.ts:779`).

Exigence : le nom doit rester unique. **Dédup côté serveur dans `/git/provision`** (seul
endroit qui connaît l'état git, juste avant `git worktree add`) : pour le mode `worktree`,
si `localBranchExists(cwd, branch)` (ou le dossier `.worktrees/<dir>` existe déjà pour une
branche différente), suffixer `-2`, `-3`… jusqu'à obtenir un nom libre. Le nom final est
persisté dans la session (`UPDATE agent_sessions SET … branch = ?`), et
`CreationProgress` récupère la valeur à jour via l'invalidation de query au `done`. Le nom
propre est conservé dans le cas courant (pas de collision).

### Nettoyage mineur

`composeSystemPrompt` (`AgentTerminalModal.tsx:321-329`) : le contenu de l'issue étant
désormais injecté côté serveur, alléger le bloc pour ne conserver qu'une ligne de
provenance (retirer l'instruction redondante « lance `gh issue view` »).

## Hors-scope

- CLI morte `/git/generate-branch-name` (laissée en l'état).
- Step cosmétique `linking-issue` du modal.
- Flux `rename-from-prompt` (reste valable pour les sessions lancées **sans** issue).

## Impacts & risques

- **i18n** : aucun nouveau texte en dur (label `creationProgress.readIssue` existe déjà) ;
  le nom de session est de la donnée (titre d'issue), pas une chaîne i18n.
- **Perf** : `gh auth token` est un `execFileSync` court (mise en cache non nécessaire vu
  la fréquence : une fois par provisioning). Injection brute = pas d'appel LLM, plus rapide
  qu'avant.
- **Sécurité** : app locale mono-utilisateur ; le token n'est jamais renvoyé au navigateur.
- **Compat** : les sessions sans issue conservent le comportement `wip-…` + rename au 1er
  message.

## Tests (convention repo : logique pure only)

- `src/lib/slug.test.ts` : `slugify` — accents, ponctuation, espaces multiples, casse,
  troncature à `maxLen`, chaîne vide, et **sortie conforme** à la validation de branche
  `git.ts` (`/^[\w./-]+$/`, cf. `git.ts:404`) → le slug ne produit que `[a-z0-9-]`.
- Le reste (agent server, modal) se vérifie par `lint` + `tsc --noEmit` + `build` + essai
  manuel (lancement d'un agent depuis une issue).
