# Workbench — refonte de la page Dashboard

**Date** : 2026-07-09
**Statut** : Design validé, prêt pour le plan d'implémentation

## Contexte & objectif

La page `/dashboard` est aujourd'hui un hub agrégeant des widgets (agents actifs, sessions
récentes, summaries/logs). Cliquer une session ouvre l'expérience terminal/chat dans une
**modal** (`AgentTerminalModal`, step `terminal`).

On remplace ce hub par une page de travail plein écran, **Workbench**, calquée sur le layout
type Cursor / Claude Code :

- **75 % à gauche** : la conversation agent (l'ex-chat de la modal) en pleine page.
- **~25 % à droite** : une sidebar avec le panneau **Fichiers (diff)** en haut et le **Terminal**
  empilé en bas, plus des **chips** pour basculer le panneau haut entre `Fichiers` / `Activity`
  / `Issue`.

Les widgets sessions récentes / agents actifs / logs (et leurs actions) **disparaissent**.

## Décisions clés

1. **Nom** : la page s'appelle **Workbench**. Route `/workbench`.
2. **Point d'entrée par défaut** : `/workbench` est la landing. Si aucune session sélectionnée
   → empty-state centré + sidebar droite vide.
3. **Sélection de session existante** : via la liste **PROJETS du `Sidebar` gauche** (worktrees
   par projet). Note : le `CLAUDE.md` décrit encore un `RightSidebar` 400px — il n'existe plus,
   il a été fusionné dans le `Sidebar` gauche. C'est bien cette liste que l'utilisateur appelle
   « RightSidebar ».
4. **Création** : « nouveau worktree depuis un projet » → modal (steps projet → mode → branche)
   → puis le Workbench se remplit.
5. **Chips droite** : `Fichiers` + `Terminal` empilés simultanément ; les chips basculent surtout
   le panneau **haut** (Fichiers ↔ Activity ↔ Issue). Le Terminal reste visible en bas.

## Architecture

### Principe central : la modal redirige, elle ne rend plus le terminal

Le rendu terminal/chat/diff **vit une seule fois**, dans le Workbench. Pour éviter de migrer
les 6 appelants de `AgentTerminalModal` un par un, la modal **conserve ses steps de
création/attache** (`project` → `launch-mode` → `branch`) mais **l'étape `terminal` disparaît** :
dès que la session est prête, la modal fait `router.push('/workbench?session=<id>')` puis
`onClose()`.

Appelants de `AgentTerminalModal` (inchangés dans leur usage — ils ouvrent la modal, qui
redirige) :

- `src/app/(app)/archived/page.tsx` (ouverture session archivée/passée)
- `src/components/workspace/BranchDetail.tsx` (lancement dans worktree existant)
- `src/components/dashboard/IssueDetail.tsx` (lancement depuis une issue, `issueContext`)
- `src/components/layout/Sidebar.tsx` (nouvelle session, nouveau worktree depuis projet, clic
  worktree via `setModalConfig`)
- `src/components/layout/OverlayTerminal.tsx` (PiP « expand » — voir note plus bas)
- `src/components/dashboard/Dashboard.tsx` → **supprimé** (remplacé par Workbench)

### Source de vérité de la session affichée : l'URL

`/workbench?session=<session_id>`.

- Partageable, survit au refresh.
- Le Workbench retrouve `project_path` / `worktree_path` / `branch` / `issue_*` via
  `useAgentSessionHistory()` (comme le fait aujourd'hui le `Dashboard` pour construire
  `modalProps`) puis `useAgentSession(sessionId)` pour les logs live.
- `effectivePath` (résolution worktree vs projectPath vs `.worktrees/<branch>`) est **déplacé
  tel quel** depuis la modal vers le Workbench.

### Points d'entrée qui écrivent l'URL

La règle : **la modal redirige toujours vers `/workbench?session=<id>` quand la session est
prête**. Les appelants n'ont donc rien à changer, SAUF le cas « worktree qui a déjà une session
DB », qu'on peut router directement sans passer par la modal (évite un flash de modal).

- **`Sidebar` PROJETS** :
  - Worktree **avec** session DB (`wtSession.session_id` présent, cf. `Sidebar.tsx` ~356-368)
    → `router.push('/workbench?session=<id>')` **directement** (on n'ouvre plus la modal).
  - Worktree **sans** session DB (`setModalConfig({ projectPath, existingWorktree })`, ~373)
    → **ouvre la modal** : elle génère l'id (`generatedIdRef`), fait `ensureSession`, puis
    redirige. Nécessaire car il n'y a pas encore d'id à mettre dans l'URL.
  - « Nouvelle session » (`setModalConfig({})`) / « nouveau worktree » (`{ projectPath }`)
    → **ouvre la modal** → redirige après création.
- **Modal (création)** : après `handleLaunch` / `handleLaunchCurrentBranch` / branche
  `existingWorktree`, une fois `ensureSession` fait → `router.push('/workbench?session=<id>')`
  + `onClose()` au lieu de `setStep('terminal')`.
- **Modal (attache)** : le `useEffect` qui faisait `setStep('terminal')` pour un
  `existingSessionId` → `router.push('/workbench?session=<id>')` + `onClose()`.

## Composants

### Nouveaux

- **`src/components/workbench/Workbench.tsx`** — remplace `Dashboard.tsx`.
  - Lit `?session` via `useSearchParams`.
  - Empty-state centré si absent ; sinon layout 75/25.
  - Gère l'état des chips (panneau haut : `files` | `activity` | `issue`) et le
    redimensionnement vertical de la zone Terminal.
  - Header léger : titre session + chip branche + chip repo + Stop (si `active`) + PiP.
  - Réutilise : `AgentChatTab` (gauche), `AgentDiffTab`, `AgentActivityTab`, `AgentIssueTab`
    (panneau haut selon chip), `ShellTerminal` (bas).
  - Reprend la logique migrée depuis la modal : `effectivePath`, `chatSystemPrompt`,
    `chatReadOnly` / `isArchivedSession` (via `classifySession`), rename-from-prompt
    (`onFirstUserMessage` → `/api/agent-sessions/rename-from-prompt`), handlers Stop / resume /
    PiP.

- **`src/components/agents/ShellTerminal.tsx`** — extraction de la logique xterm/WebSocket
  aujourd'hui inline dans `AgentTerminalModal` (init `Terminal`, `FitAddon`, `WebglAddon`, WS
  `getAgentWsUrl()`, `init`/`input`/`resize`, wheel handler, `ResizeObserver`, cleanup).
  Props : `sessionId`, `cwd`, `active` (pour refit/focus au montage/affichage).
  ⚠️ Le shell utilise un id **dérivé** `` `${sessionId}-shell` `` (cf. modal ligne ~659) —
  c'est un shell brut **distinct** de la session tmux de l'agent (que le PiP attache via
  `sessionId` nu). Le composant doit conserver ce suffixe en interne (ou l'exposer en prop).
  Consommé par le Workbench (et disponible pour d'autres usages).

### Modifiés

- **`AgentTerminalModal.tsx`** : suppression du bloc `step === 'terminal'` (tabs `DraggableTabs`,
  `AgentChatTab`, `AgentActivityTab`, `AgentDiffTab`, shell, `AgentIssueTab`), de la logique
  shell inline, PiP, rename-from-prompt, gestion `activeTab`/`termTabOrder`. Ajout de
  `useRouter` + callback de redirection. La modal ne fait plus que création/attache + redirect.
- **`src/components/layout/Sidebar.tsx`** :
  - entrée nav `dashboard` → `workbench` (label, icône, `href` ligne ~125).
  - clic worktree **avec** session (`onClick` ~362) → `router.push('/workbench?session=<id>')`
    au lieu de `setModalConfig({ existingSessionId })`.
  - les autres `setModalConfig` (nouvelle session, `{ projectPath }`, `existingWorktree`)
    restent inchangés (la modal redirige elle-même).

### Supprimés

- `src/components/dashboard/Dashboard.tsx`
- `src/components/dashboard/ActiveAgentsWidget.tsx`
- `src/components/dashboard/RecentSessionsWidget.tsx`
- `src/components/dashboard/SummariesWidget.tsx`
- `src/components/dashboard/AllReportsDialog.tsx`
- Hooks devenus orphelins après suppression (à **vérifier** avant retrait) : `useRecentLogs`
  (`useAgentSummaries`), `usePendingQuestions` si non utilisés ailleurs.

> Les autres composants du dossier `dashboard/` (`IssueCard`, `IssueDetail`,
> `IssueTimelineModal`) **restent** — ils sont utilisés hors dashboard.

## Routing & i18n

- Déplacer `src/app/(app)/dashboard/page.tsx` → `src/app/(app)/workbench/page.tsx` (rend
  `<Workbench />`).
- `src/app/page.tsx` : redirect `/` → `/workbench` (au lieu de `/dashboard`).
- Ajouter un redirect `/dashboard` → `/workbench` (compat liens/bookmarks).
- Pas de `src/middleware.ts` dans le repo actuel : l'auth n'est pas à toucher ici. La route
  vit dans le group `(app)` (layout `AppShell` authentifié), donc protégée comme les autres.
- i18n : renommer la clé `sidebar.dashboard` et le namespace `dashboard.*` → `workbench.*` dans
  les 5 locales (`en, fr, es, de, pt`). Ajouter les libellés Workbench : titre, empty-state,
  chips (`files`, `activity`, `issue`, `terminal`). Réutiliser les clés `launchModal.*` /
  `agentChat.*` existantes pour le contenu migré.

## Layout détaillé

```
┌───────────────────────────────────────────────┬──────────────────────────┐
│ Header session (titre · chip branche · repo ·  │  [Fichiers] [Activity]   │ ← chips
│                 Stop · PiP)                     ├──────────────────────────┤
├───────────────────────────────────────────────┤  Panneau haut            │
│                                                 │  Fichiers (AgentDiffTab) │
│  AgentChatTab (messages + composer)   ~75%      │  ou Activity / Issue     │
│                                                 │  selon chip actif        │
│                                                 ├──────────────────────────┤
│                                                 │  Terminal (ShellTerminal)│
│                                                 │  toujours visible, resize│
└───────────────────────────────────────────────┴──────────────────────────┘
```

- Largeur droite : réutiliser la convention (~360–400 px), éventuellement redimensionnable
  (hors scope si non trivial — largeur fixe acceptable en v1).
- Split vertical droit : `flex` avec un handle de resize simple entre Fichiers et Terminal
  (persistance non requise en v1).
- `chatReadOnly` : composer désactivé pour sessions non `active` ; bandeau « Reprendre » comme
  aujourd'hui (`onResume` → `resume(sessionId)`).

## Comportements conservés

- **Rename-from-prompt** : au 1er message user d'une branche `wip-` auto-nommée, POST
  `/api/agent-sessions/rename-from-prompt` puis invalidation `git-worktrees` / `sessions` /
  `agent-sessions/history`. Migre dans le Workbench.
- **PiP / OverlayTerminal** : le terminal flottant reste (feature indépendante) ; le bouton PiP
  reste dans le header du Workbench. **MAIS** son bouton « expand » (`OverlayTerminal.tsx`
  ~194-203) rend aujourd'hui `<AgentTerminalModal existingSessionId=... />` pour ré-ouvrir en
  grand. Comme la modal redirige désormais, ce rendu ne marchera plus : réécrire « expand » en
  `router.push('/workbench?session=X')` + fermeture du PiP (sémantique : expand = ouvrir la
  page pleine). C'est cohérent, mais ce n'est pas « inchangé » — à traiter dans le plan.
- **Stop session** : bouton dans le header (si `active`), confirm dialog, `stop(sessionId)`.

## Hors scope (YAGNI v1)

- Liste de threads/sessions dans une colonne dédiée (on garde la liste PROJETS du `Sidebar`
  gauche comme sélecteur).
- Persistance de la largeur droite / du split vertical.
- Multi-terminaux (onglets Terminal 1 / Terminal 2 de l'image de référence) : un seul shell.

## Risques / points à vérifier pendant le plan

1. **OverlayTerminal (PiP)** a son propre `new Terminal(...)` (shell flottant, attache la
   session tmux via `sessionId` nu) **et** rend `AgentTerminalModal` pour le bouton « expand »
   (~194-203). Le shell flottant reste ; seul « expand » doit être réécrit en `router.push`
   (cf. section Comportements conservés).
2. **`generatedIdRef` / buildSessionId** : la génération d'ID pour une nouvelle session reste
   dans la modal (création) ; le Workbench ne reçoit que des `existingSessionId` via l'URL.
   Le `Sidebar` ne route en direct que quand `wtSession.session_id` existe déjà.
3. **Hooks orphelins** : confirmé — `useAgentSummaries`/`useRecentLogs` ne sont consommés que
   par Dashboard + `SummariesWidget` + `AllReportsDialog` (tous supprimés) ; `usePendingQuestions`
   que par Dashboard. Suppression sûre. Note : `dashboard/DashboardWidget.tsx` (utilisé par les
   3 widgets supprimés + `TodosWidget`/`KpiCards` déjà morts) devient orphelin → nettoyage
   optionnel, hors scope strict.
4. **`waitingForSession`** : sur une navigation directe vers `/workbench?session=X` (refresh),
   attendre la résolution DB avant d'initialiser le shell (logique déjà présente dans la modal,
   à préserver dans `ShellTerminal` / le Workbench).
```
