<p align="center">
  <img src="public/logo.svg" alt="Kepler" width="280" />
</p>

<p align="center">
  <strong>Your AI-powered development command center.</strong><br/>
  Ship faster. Manage smarter. Let agents do the heavy lifting.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/MUI-7-007FFF?logo=mui" alt="Material UI 7" />
  <img src="https://img.shields.io/badge/Claude-Agent%20SDK-7C5CFF" alt="Claude Agent SDK" />
  <img src="https://img.shields.io/badge/SQLite-Drizzle%20ORM-003B57?logo=sqlite" alt="SQLite + Drizzle" />
</p>

---

## The Problem

You're a developer juggling **5 tabs of GitHub**, a terminal running Claude, a todo list somewhere, PRs to review, branches and worktrees to track. Context-switching kills your flow. Your AI agents run in the background but you have **zero visibility** on what they're doing.

**Kepler fixes all of that.**

## What is Kepler?

Kepler is a **local, single-user developer cockpit** that brings your entire workflow into one screen: Claude agents with reusable personalities, git worktrees, GitHub issues, pull requests, tasks, daily recaps and real-time notifications — all wired together.

At its core is the **Workbench**: an agent chat powered by the **Claude Agent SDK**, side-by-side with the files it changes, its live activity, the linked issue, and an embedded terminal. No API keys to manage — GitHub access comes straight from your local `gh` CLI session.

Think of it as your **mission control for AI-assisted development**, running entirely on your machine.

<br/>

## Key Features

### ① Work with agents

#### 🛠️ The Workbench

The main screen. On the left (~75%), a full **Claude Agent SDK conversation** — streaming replies, tool-call cards, permission prompts and inline questions, with a **model selector** at hand. On the right, chips switch the top panel between **Files** (live diff), **Activity** (what the agent did) and **Issue** (the linked GitHub issue), with one or more **terminals** stacked below and vertically resizable. The whole session is addressed by `?session=<id>` and its transcript is persisted, so you can close the tab and pick up exactly where you left off.

#### 🎭 Personas

Give each agent a **reusable personality**. A persona bundles a name, a role, a **system prompt**, and its own defaults for **model**, **reasoning effort**, **permission mode** and an accent **color**. Manage them all in a dedicated **Personas library**. Personas drive a session's settings the moment you launch it, the **composer is tinted** with the persona's color, and you can **switch persona mid-conversation** — the model is told about the change on the fly, no restart needed.

#### 🤖 Claude Agent SDK — not just a CLI

Agents run through **`@anthropic-ai/claude-agent-sdk`**, streamed to the UI over WebSocket. You get real streaming, **tool-call cards**, **permission requests** you approve from the UI, and **AskUserQuestion** prompts rendered inline. Each session keeps a server-authoritative transcript in SQLite and replays on reconnect. The system prompt (persona + issue context) is persisted per session and rejoined automatically.

#### 🌳 Projects & Worktrees

The left **Sidebar** lists your projects. Expand one to see its git **worktrees** and sessions; click a session to open it in the Workbench, or hit **+** to launch a new agent through a **category + card wizard** (pick a persona, branch or worktree). Session labels are **decoupled from the git branch** — rename a session on the fly without touching git. Worktree names are **optional** — launch with nothing and the branch is auto-named (Karma convention: `feat/…`, `fix/…`) from the agent's first prompt.

### ② Manage your work

#### 📋 Kanban Issues (GitHub Projects V2)

Full integration with GitHub Projects V2: a drag-and-drop board of the issues **and PRs assigned to you**, per-repo tabs, status synced back to GitHub via GraphQL, closed issues included, and an issue-detail view on click. Backed by a **local SQLite cache** so the board loads instantly and only hits GitHub on explicit refresh — no rate-limit surprises. Create a branch (and worktree) straight from an issue.

#### ✍️ AI-authored issues

Don't write the boilerplate. **Describe an issue in plain language** and an agent drafts a proper **title + body** for you — then create it on GitHub in a single click.

#### ✅ Tasks

A **task manager** with inline editing, an optional per-repo filter and a modal detail view. Each task can carry a **due date** with **urgency coloring** as the deadline approaches, be **pinned** to the top, and **link to a GitHub issue** — or **spawn a new issue** straight from the task. Optimistic mutations for instant UI feedback.

#### 🔃 Pull Requests

All your open PRs across repositories in one view, with diff stats, reviewers, labels, CI/check status, a **Merged** state, and one-click merge.

#### ⚙️ Per-repo settings

Tune each repository from a dedicated settings page: custom **create-PR** and **commit-&-push** prompts, files to copy into new worktrees, **setup** and **archive** scripts, and the **QA column** used by the board.

### ③ Stay in the loop

#### 📅 Daily recaps

A **calendar of AI-generated daily recaps**, per repository. Kepler turns each day's git and agent activity into a concise summary, aggregates **points onto the calendar cells**, and opens a day's full recap in a modal on click. Generate or delete any day on demand.

#### 🔔 Notifications

A **real-time notification center** for your agents. When an agent **finishes, errors out or gets blocked**, a prioritized, de-duplicated notification is pushed live over **SSE** (with a sound), so you can walk away from a running agent and still know the instant it needs you. Read / unread tracking included.

#### 📈 Activity timeline & session continuity

Instead of running Claude in a terminal and hoping for the best, Kepler derives a **live activity timeline** from the SDK event stream:

- **info** — decisions taken, analysis started
- **file_change** — files created, modified, deleted
- **commit** — git commits with messages
- **error** — blockers encountered
- **summary** — final recap when the task is done

Closed a tab or killed an agent? The full transcript stays in SQLite. Reopen any session — the chat replays, the terminal reconnects in the right worktree, ready to go.

<br/>

## Why Kepler?

### Save Hours Every Day

| Without Kepler                                                                        | With Kepler                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Open GitHub → find issue → copy branch name → open terminal → checkout → start Claude | Launch an agent from the issue in one click        |
| Re-explain your conventions to the agent every time                                   | Reusable **personas** with model/effort/prompt     |
| Switch between 5 browser tabs to check status                                         | Everything in the Workbench                        |
| Manually check what your AI agent did                                                 | Live diff, activity feed and streaming chat        |
| Poll a background agent to see if it's done                                           | Real-time notifications when it finishes or blocks |
| "What did I even ship yesterday?"                                                     | AI-generated daily recaps per repo                 |
| Lose context when switching between repos                                             | Per-repo tabs, persistent order, multi-repo views  |

### Runs Entirely Locally, Zero Secrets

Kepler is **single-user and local-first**. GitHub access uses your **`gh` CLI** session (`gh auth token`) — no OAuth app, no `AUTH_SECRET`, no login page. Data lives in a **local SQLite** file. The only external calls are to GitHub and to Claude.

<br/>

## Tech Stack

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| **Frontend**  | Next.js 16 (App Router) · React 19 · TypeScript 5       |
| **UI**        | Material UI 7 · MUI X Date Pickers · Emotion · Framer Motion |
| **Data**      | TanStack React Query 5 (optimistic mutations)           |
| **Backend**   | SQLite (better-sqlite3) + Drizzle ORM                   |
| **AI / Chat** | Claude Agent SDK (streaming over WebSocket)             |
| **Real-time** | WebSocket (chat + terminal) · SSE (notifications)       |
| **Terminal**  | xterm.js 6 · node-pty · tmux                            |
| **Auth**      | `gh` CLI session (fallback `GITHUB_TOKEN`)              |
| **GitHub**    | REST API + GraphQL (Projects V2)                        |
| **i18n**      | next-intl (en · fr · es · de · pt)                      |

<br/>

## Getting Started

### Prerequisites

- **Node.js 20–25** — native modules (`better-sqlite3` / `node-pty`) don't support Node 26 yet
- **[GitHub CLI](https://cli.github.com) (`gh`)**, authenticated — run `gh auth login` once
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` in PATH) — for the Agent SDK
- **`tmux`** and **`git`**

### Install (recommended)

One command clones a dedicated copy into `~/.kepler/repo`, builds it, and puts a stable `kepler` command on your `PATH`:

```bash
gh api repos/ludovicweber87/Kepler/contents/install.sh -H "Accept: application/vnd.github.raw" | bash
```

> The repo is private, so the fetch goes through your authenticated `gh` session. A plain `curl` on `raw.githubusercontent.com` returns **404** (GitHub hides private repos rather than returning 403).

Open a new terminal (so the updated `PATH` takes effect), then:

```bash
kepler start
```

This builds on first run, starts the agent server (`:4001`) and the web app (first free port from `4000`) as background services, and opens the desktop window. GitHub access comes from your `gh` session — **there is nothing else to configure.**

### CLI commands

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `kepler start`      | Build (if needed), launch the services, open the window             |
| `kepler stop`       | Stop the agent, web app and desktop window                          |
| `kepler restart`    | Stop then start (use this to apply an update)                       |
| `kepler status`     | Show each service (agent / web / desktop) with pid and URL          |
| `kepler logs [svc]` | Tail logs — all, or one of `agent` / `web` / `desktop`              |
| `kepler update`     | Pull latest `main`, reinstall, rebuild, refresh the CLI symlink     |

Runtime state (SQLite db, pids, logs) lives in `~/.kepler/` and survives updates. Optional overrides go in `~/.kepler/.env` (e.g. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

### Run from source (contributors)

```bash
git clone https://github.com/ludovicweber87/Kepler.git
cd Kepler
npm install
npm run dev
```

`npm run dev` launches both processes via `concurrently` — the Next.js app on **:4000** and the agent server on **:4001**, sharing the same SQLite database. Don't run it at the same time as `kepler start` (port `4001` collides). Open [http://localhost:4000](http://localhost:4000).

<br/>

## Architecture

Kepler runs as **two processes** sharing one local SQLite database:

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (React)                       │
│  Workbench · Issues · PRs · Tasks · Daily · Personas       │
│                          │                                 │
│         React Query (cache + optimistic mutations)         │
└───────────────┬───────────────────────────┬───────────────┘
                │ HTTP / apiFetch            │ WS + SSE + localFetch
                ▼                            ▼
   ┌─────────────────────────┐   ┌──────────────────────────────┐
   │  Next.js app  (:4000)   │   │   Agent server (Node, :4001)  │
   │  API routes:            │   │  · git / worktrees            │
   │  · GitHub proxy         │   │  · terminal (node-pty + tmux) │
   │    (REST + GraphQL)     │   │  · Claude Agent SDK chat (WS) │
   │  · CRUD (Drizzle)       │   │  · daily recaps               │
   │                         │   │  · notifications stream (SSE) │
   └────────────┬────────────┘   └───────────────┬──────────────┘
                │                                 │
                └───────────────┬─────────────────┘
                                ▼
                   ┌──────────────────────────┐
                   │  SQLite  (data/kepler.db) │
                   │  Drizzle ORM · shared     │
                   └──────────────────────────┘
                                ▲
                   ┌────────────┴─────────────┐
                   │   GitHub  ·  Claude SDK   │
                   └──────────────────────────┘
```

- **App Next.js (`src/`, :4000)** — UI + API routes (GitHub proxy, CRUD SQLite). Runs Drizzle migrations on start.
- **Agent server (`packages/agent/`, :4001)** — git/worktrees, terminal (node-pty + tmux over WebSocket), the Agent SDK chat, daily-recap generation, and the notifications SSE stream. Taps the **same** SQLite file.
- In dev, `scripts/dev-auto-port.mjs` boots both with `concurrently` and injects `KEPLER_DB_PATH` to share the database.

Persisted state lives in a handful of SQLite tables (Drizzle): `agentSessions` + `agentChatMessages` + `agentActivityLogs` (agents), `personas`, `tasks`, `dailyRecaps`, `notifications`, `repoSettings` / `repoPaths`, plus `projectConfigs` / `projectBoards` (Projects V2 cache), `tabOrders` and `appSettings`.

<br/>

## License

MIT

---

<br/>

<details>
<summary><strong>🇫🇷 Version française</strong></summary>

<br/>

## Le problème

Vous êtes développeur. Vous jonglez entre **5 onglets GitHub**, un terminal avec Claude, une todo list quelque part, des PRs à reviewer, des branches et worktrees à suivre. Le changement de contexte permanent tue votre productivité. Vos agents IA tournent en arrière-plan mais vous n'avez **aucune visibilité** sur ce qu'ils font.

**Kepler règle tout ça.**

## Qu'est-ce que Kepler ?

Kepler est un **cockpit développeur local et mono-utilisateur** qui rassemble tout votre workflow sur un seul écran : des agents Claude dotés de personnalités réutilisables, vos worktrees git, vos issues GitHub, vos pull requests, vos tâches, vos recaps quotidiens et des notifications temps réel — le tout connecté.

En son cœur, le **Workbench** : un chat d'agent propulsé par le **Claude Agent SDK**, côte à côte avec les fichiers qu'il modifie, son activité en direct, l'issue liée, et un terminal embarqué. Aucune clé API à gérer — l'accès GitHub vient directement de votre session `gh` CLI locale.

C'est votre **centre de contrôle pour le développement assisté par IA**, tournant entièrement sur votre machine.

<br/>

## Fonctionnalités clés

### ① Travailler avec les agents

#### 🛠️ Le Workbench

L'écran principal. À gauche (~75 %), une véritable **conversation Claude Agent SDK** — réponses en streaming, cartes de tool call, demandes de permission et questions inline, avec un **sélecteur de modèle** à portée de main. À droite, des chips basculent le panneau haut entre **Fichiers** (diff live), **Activity** (ce que l'agent a fait) et **Issue** (l'issue GitHub liée), avec un ou plusieurs **terminaux** empilés en dessous et redimensionnables verticalement. La session est portée par `?session=<id>` et son transcript est persisté : fermez l'onglet, vous reprenez exactement où vous en étiez.

#### 🎭 Personas

Donnez à chaque agent une **personnalité réutilisable**. Une persona regroupe un nom, un rôle, un **system prompt** et ses propres réglages par défaut : **modèle**, **effort de raisonnement**, **mode de permission** et une **couleur** d'accent. Gérez-les toutes dans une **bibliothèque de personas** dédiée. Les personas pilotent les réglages d'une session dès son lancement, le **composer est teinté** de la couleur de la persona, et vous pouvez **changer de persona en cours de conversation** — le modèle est informé du changement à la volée, sans redémarrage.

#### 🤖 Claude Agent SDK — pas juste un CLI

Les agents tournent via **`@anthropic-ai/claude-agent-sdk`**, streamés vers l'UI en WebSocket. Vrai streaming, **cartes de tool call**, **demandes de permission** que vous validez depuis l'interface, et prompts **AskUserQuestion** rendus inline. Chaque session garde un transcript faisant autorité côté serveur en SQLite et se rejoue à la reconnexion. Le prompt système (persona + contexte d'issue) est persisté par session et rejoué automatiquement.

#### 🌳 Projets & Worktrees

La **Sidebar** gauche liste vos projets. Dépliez-en un pour voir ses **worktrees** git et ses sessions ; cliquez une session pour l'ouvrir dans le Workbench, ou **+** pour lancer un nouvel agent via un **wizard « catégorie + card »** (choix de persona, branche ou worktree). Le label de session est **découplé de la branche git** — renommez une session à la volée sans toucher à git. Le nom du worktree est **optionnel** — lancez sans rien et la branche est nommée automatiquement (convention Karma : `feat/…`, `fix/…`) depuis le premier prompt de l'agent.

### ② Gérer votre travail

#### 📋 Kanban Issues (GitHub Projects V2)

Intégration complète avec GitHub Projects V2 : board drag-and-drop des issues **et PRs qui vous sont assignées**, onglets par repo, statuts synchronisés vers GitHub via GraphQL, issues fermées incluses, et une vue détail au clic. Adossé à un **cache SQLite local** — le board charge instantanément et n'appelle GitHub que sur refresh explicite (fini les surprises de rate-limit). Créez une branche (et un worktree) directement depuis une issue.

#### ✍️ Issues rédigées par l'IA

Ne rédigez plus le boilerplate. **Décrivez une issue en langage naturel** et un agent rédige pour vous un **titre + un body** propres — puis créez-la sur GitHub en un seul clic.

#### ✅ Tâches

Un **gestionnaire de tâches** avec édition inline, filtre repo optionnel et vue modale de détail. Chaque tâche peut porter une **échéance** avec **couleur d'urgence** à l'approche de la date, être **épinglée** en haut, et **être liée à une issue GitHub** — ou **créer une nouvelle issue** directement depuis la tâche. Mutations optimistes pour un feedback UI instantané.

#### 🔃 Pull Requests

Toutes vos PRs ouvertes sur tous vos repositories dans une seule vue, avec stats de diff, reviewers, labels, statut CI, un état **Merged**, et merge en un clic.

#### ⚙️ Réglages par repo

Réglez chaque repository depuis une page dédiée : prompts personnalisés de **création de PR** et de **commit & push**, fichiers à copier dans les nouveaux worktrees, scripts de **setup** et d'**archivage**, et la **colonne QA** utilisée par le board.

### ③ Rester dans la boucle

#### 📅 Recaps quotidiens

Un **calendrier de recaps quotidiens générés par IA**, par repository. Kepler transforme l'activité git et agent de chaque journée en un résumé concis, agrège des **points sur les cellules du calendrier**, et ouvre le recap complet d'un jour dans une modale au clic. Générez ou supprimez n'importe quel jour à la demande.

#### 🔔 Notifications

Un **centre de notifications temps réel** pour vos agents. Quand un agent **termine, échoue ou se retrouve bloqué**, une notification priorisée et dédupliquée est poussée en direct via **SSE** (avec un son) : vous pouvez quitter un agent en cours et savoir à l'instant où il a besoin de vous. Suivi lu / non-lu inclus.

#### 📈 Timeline d'activité & continuité des sessions

Plutôt qu'un Claude lancé dans un terminal sans suivi, Kepler dérive une **timeline d'activité en direct** depuis le flux d'events du SDK :

- **info** — décisions prises, analyses lancées
- **file_change** — fichiers créés, modifiés, supprimés
- **commit** — commits git avec messages
- **error** — blocages rencontrés
- **summary** — récapitulatif final quand la tâche est terminée

Onglet fermé ou agent tué ? Le transcript complet reste en SQLite. Rouvrez n'importe quelle session — le chat se rejoue, le terminal se reconnecte dans le bon worktree, prêt à l'emploi.

<br/>

## Pourquoi Kepler ?

### Gagnez des heures chaque jour

| Sans Kepler                                                                                                | Avec Kepler                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Ouvrir GitHub → trouver l'issue → copier le nom de branche → ouvrir le terminal → checkout → lancer Claude | Lancer un agent depuis l'issue en un clic               |
| Ré-expliquer vos conventions à l'agent à chaque fois                                                       | **Personas** réutilisables (modèle/effort/prompt)       |
| Naviguer entre 5 onglets pour vérifier l'état                                                              | Tout dans le Workbench                                  |
| Vérifier manuellement ce que l'agent IA a fait                                                             | Diff live, feed d'activité et chat en streaming         |
| Surveiller un agent pour savoir s'il a fini                                                                | Notifications temps réel à la fin ou en cas de blocage  |
| « Qu'est-ce que j'ai livré hier, déjà ? »                                                                  | Recaps quotidiens générés par IA, par repo              |
| Perdre le contexte en changeant de repo                                                                    | Onglets par repo, ordre persistant, vues multi-repo     |

### 100 % local, zéro secret

Kepler est **mono-utilisateur et local-first**. L'accès GitHub utilise votre session **`gh` CLI** (`gh auth token`) — pas d'OAuth app, pas d'`AUTH_SECRET`, pas de page de login. Les données vivent dans un fichier **SQLite local**. Les seuls appels externes vont vers GitHub et Claude.

<br/>

## Stack technique

| Couche        | Technologie                                             |
| ------------- | ------------------------------------------------------- |
| **Frontend**  | Next.js 16 (App Router) · React 19 · TypeScript 5       |
| **UI**        | Material UI 7 · MUI X Date Pickers · Emotion · Framer Motion |
| **Data**      | TanStack React Query 5 (mutations optimistes)           |
| **Backend**   | SQLite (better-sqlite3) + Drizzle ORM                   |
| **IA / Chat** | Claude Agent SDK (streaming en WebSocket)               |
| **Temps réel**| WebSocket (chat + terminal) · SSE (notifications)       |
| **Terminal**  | xterm.js 6 · node-pty · tmux                            |
| **Auth**      | Session `gh` CLI (fallback `GITHUB_TOKEN`)              |
| **GitHub**    | API REST + GraphQL (Projects V2)                        |
| **i18n**      | next-intl (en · fr · es · de · pt)                      |

<br/>

## Démarrage

### Prérequis

- **Node.js 20–25** — les modules natifs (`better-sqlite3` / `node-pty`) ne supportent pas encore Node 26
- **[GitHub CLI](https://cli.github.com) (`gh`)**, authentifié — lancez `gh auth login` une fois
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` dans le PATH) — pour l'Agent SDK
- **`tmux`** et **`git`**

### Installation (recommandé)

Une commande clone une copie dédiée dans `~/.kepler/repo`, la build, et place une commande `kepler` stable sur votre `PATH` :

```bash
gh api repos/ludovicweber87/Kepler/contents/install.sh -H "Accept: application/vnd.github.raw" | bash
```

> Le repo est privé : le téléchargement passe par votre session `gh` authentifiée. Un `curl` direct sur `raw.githubusercontent.com` renvoie **404** (GitHub masque les repos privés au lieu de renvoyer 403).

Ouvrez un nouveau terminal (pour que le `PATH` mis à jour prenne effet), puis :

```bash
kepler start
```

Build au premier lancement, démarre le serveur agent (`:4001`) et l'app web (premier port libre depuis `4000`) en services d'arrière-plan, et ouvre la fenêtre desktop. L'accès GitHub vient de votre session `gh` — **il n'y a rien d'autre à configurer.**

### Commandes CLI

| Commande            | Rôle                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `kepler start`      | Build (si besoin), lance les services, ouvre la fenêtre             |
| `kepler stop`       | Arrête l'agent, l'app web et la fenêtre desktop                     |
| `kepler restart`    | Stop puis start (à utiliser pour appliquer une mise à jour)         |
| `kepler status`     | Affiche chaque service (agent / web / desktop) avec pid et URL      |
| `kepler logs [svc]` | Suit les logs — tous, ou l'un de `agent` / `web` / `desktop`        |
| `kepler update`     | Récupère le dernier `main`, réinstalle, rebuild, rafraîchit le lien |

L'état runtime (base SQLite, pids, logs) vit dans `~/.kepler/` et survit aux mises à jour. Les overrides optionnels vont dans `~/.kepler/.env` (ex. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

### Lancer depuis les sources (contributeurs)

```bash
git clone https://github.com/ludovicweber87/Kepler.git
cd Kepler
npm install
npm run dev
```

`npm run dev` lance les deux process via `concurrently` — l'app Next.js sur **:4000** et le serveur agent sur **:4001**, partageant la même base SQLite. Ne le lancez pas en même temps que `kepler start` (le port `4001` entre en conflit). Ouvrez [http://localhost:4000](http://localhost:4000).

<br/>

## Architecture

Kepler tourne en **deux process** partageant une base SQLite locale :

- **App Next.js (`src/`, :4000)** — UI + API routes (proxy GitHub, CRUD SQLite). Joue les migrations Drizzle au démarrage.
- **Serveur agent (`packages/agent/`, :4001)** — git/worktrees, terminal (node-pty + tmux en WebSocket), le chat Agent SDK, la génération des recaps quotidiens, et le stream SSE des notifications. Tape dans le **même** fichier SQLite.
- En dev, `scripts/dev-auto-port.mjs` démarre les deux via `concurrently` et injecte `KEPLER_DB_PATH` pour partager la base.

L'état persisté vit dans quelques tables SQLite (Drizzle) : `agentSessions` + `agentChatMessages` + `agentActivityLogs` (agents), `personas`, `tasks`, `dailyRecaps`, `notifications`, `repoSettings` / `repoPaths`, plus `projectConfigs` / `projectBoards` (cache Projects V2), `tabOrders` et `appSettings`.

</details>

---

<p align="center">
  <sub>Built with obsessive attention to developer experience.<br/>Because the best tool is the one that disappears.</sub>
</p>
