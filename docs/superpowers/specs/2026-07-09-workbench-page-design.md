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
3. **Sélection de session existante** : via le **RightSidebar** existant (worktrees + sessions).
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
- `src/components/layout/Sidebar.tsx` (nouvelle session / nouveau worktree depuis projet)
- `src/components/layout/OverlayTerminal.tsx` (PiP — voir note plus bas)
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

- **RightSidebar** : clic session active/passée → `router.push('/workbench?session=X')`
  (au lieu du mécanisme actuel qui ouvrait la modal / le dashboard).
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
  Consommé par le Workbench (et disponible pour d'autres usages).

### Modifiés

- **`AgentTerminalModal.tsx`** : suppression du bloc `step === 'terminal'` (tabs `DraggableTabs`,
  `AgentChatTab`, `AgentActivityTab`, `AgentDiffTab`, shell, `AgentIssueTab`), de la logique
  shell inline, PiP, rename-from-prompt, gestion `activeTab`/`termTabOrder`. Ajout de
  `useRouter` + callback de redirection. La modal ne fait plus que création/attache + redirect.
- **`src/components/layout/RightSidebar.tsx`** : clic session → navigation `/workbench?session=X`.
- **`src/components/layout/Sidebar.tsx`** : entrée nav `dashboard` → `workbench` (label, icône,
  `href`).

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
- `src/middleware.ts` : vérifier que la protection auth couvre `/workbench` (matcher
  `/app/*` — la route est dans le group `(app)`, donc déjà couverte ; à confirmer).
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
- **PiP / OverlayTerminal** : **inchangé** (feature indépendante). Le bouton PiP reste dans le
  header du Workbench.
- **Stop session** : bouton dans le header (si `active`), confirm dialog, `stop(sessionId)`.

## Hors scope (YAGNI v1)

- Liste de threads/sessions dans une colonne gauche (on garde le RightSidebar comme sélecteur).
- Persistance de la largeur droite / du split vertical.
- Multi-terminaux (onglets Terminal 1 / Terminal 2 de l'image de référence) : un seul shell.

## Risques / points à vérifier pendant le plan

1. **OverlayTerminal (PiP)** utilise `AgentTerminalModal` (ligne ~196) **et** a son propre
   `new Terminal(...)`. Comprendre exactement ce couplage avant de retirer le shell inline de la
   modal, pour ne pas casser le PiP. Idéalement le PiP consomme aussi `ShellTerminal`.
2. **RightSidebar** : identifier le mécanisme actuel de sélection de session (ouvrait-il la
   modal, ou un state ?) pour le rebrancher proprement sur la navigation URL.
3. **Hooks orphelins** : confirmer par `grep` que `useRecentLogs`/`usePendingQuestions` ne sont
   pas consommés ailleurs avant suppression.
4. **`waitingForSession`** : sur une navigation directe vers `/workbench?session=X` (refresh),
   attendre la résolution DB avant d'initialiser le shell (logique déjà présente dans la modal,
   à préserver).
5. **`generatedIdRef` / buildSessionId** : la génération d'ID pour une nouvelle session reste
   dans la modal (création) ; le Workbench ne reçoit que des `existingSessionId` via l'URL.
```
