<p align="center">
  <img src="public/logo.svg" alt="Devora" width="280" />
</p>

<p align="center">
  <strong>Your AI-powered development command center.</strong><br/>
  Ship faster. Manage smarter. Let agents do the heavy lifting.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Claude-Agent%20SDK-7C5CFF" alt="Claude Agent SDK" />
  <img src="https://img.shields.io/badge/SQLite-Drizzle%20ORM-003B57?logo=sqlite" alt="SQLite + Drizzle" />
</p>

---

## The Problem

You're a developer juggling **5 tabs of GitHub**, a terminal running Claude, a todo list somewhere, PRs to review, branches and worktrees to track. Context-switching kills your flow. Your AI agents run in the background but you have **zero visibility** on what they're doing.

**Devora fixes all of that.**

## What is Devora?

Devora is a **local, single-user developer cockpit** that brings your entire workflow into one screen: a Claude agent conversation, git worktrees, GitHub issues, pull requests and todos — all wired together.

At its core is the **Workbench**: an agent chat powered by the **Claude Agent SDK**, side-by-side with the files it changes, its live activity, the linked issue, and an embedded terminal. No API keys to manage — GitHub access comes straight from your local `gh` CLI session.

Think of it as your **mission control for AI-assisted development**, running entirely on your machine.

<br/>

## Key Features

### 🛠️ The Workbench

The main screen. On the left (~75%), a full **Claude Agent SDK conversation** — streaming replies, tool calls, permission prompts and inline questions. On the right, chips switch the top panel between **Files** (live diff), **Activity** (what the agent did) and **Issue** (the linked GitHub issue), with one or more **terminals** stacked below and vertically resizable. The whole session is addressed by `?session=<id>` and its transcript is persisted, so you can close the tab and pick up exactly where you left off.

### 🤖 Claude Agent SDK — not just a CLI

Agents run through **`@anthropic-ai/claude-agent-sdk`**, streamed to the UI over WebSocket. You get real streaming, **tool-call cards**, **permission requests** you approve from the UI, and **AskUserQuestion** prompts rendered inline. Each session keeps a server-authoritative transcript in SQLite and replays on reconnect. The system prompt (agent persona + issue context) is persisted per session and rejoined automatically.

### 🌳 Projects & Worktrees

The left **Sidebar** lists your projects. Expand one to see its git **worktrees** and sessions; click a session to open it in the Workbench, or hit **+** to launch a new agent (project pre-filled). Worktree names are **optional** — launch with nothing and the branch is auto-renamed (Karma convention: `feat/…`, `fix/…`) from the agent's first prompt.

### 📋 Kanban Issues (GitHub Projects V2)

Full integration with GitHub Projects V2: a drag-and-drop board of the issues **and PRs assigned to you**, per-repo tabs, status synced back to GitHub via GraphQL, and an issue-detail view on click. Backed by a **local SQLite cache** so the board loads instantly and only hits GitHub on explicit refresh — no rate-limit surprises. Create a branch (and worktree) straight from an issue.

### ✅ Smart Todos

A single **global** task list with inline editing and an optional per-repo filter. One-click **suggestions** from the GitHub issues assigned to you. Optimistic mutations for instant UI feedback.

### 🔃 Pull Requests

All your open PRs across repositories in one view, with diff stats, reviewers, labels, CI/check status, and one-click merge.

<br/>

## Why Devora?

### Save Hours Every Day

| Without Devora                                                                        | With Devora                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Open GitHub → find issue → copy branch name → open terminal → checkout → start Claude | Launch an agent from the issue in one click        |
| Switch between 5 browser tabs to check status                                         | Everything in the Workbench                        |
| Manually check what your AI agent did                                                 | Live diff, activity feed and streaming chat        |
| Lose context when switching between repos                                             | Per-repo tabs, persistent order, multi-repo views  |
| No visibility on background agents                                                    | Live streaming indicators + full session history   |

### Runs Entirely Locally, Zero Secrets

Devora is **single-user and local-first**. GitHub access uses your **`gh` CLI** session (`gh auth token`) — no OAuth app, no `AUTH_SECRET`, no login page. Data lives in a **local SQLite** file. The only external calls are to GitHub and to Claude.

### AI Agents That Report Back

Instead of running Claude in a terminal and hoping for the best, Devora derives a **live activity timeline** from the SDK event stream:

- **info** — decisions taken, analysis started
- **file_change** — files created, modified, deleted
- **commit** — git commits with messages
- **error** — blockers encountered
- **summary** — final recap when the task is done

### Session Continuity

Closed a tab or killed an agent? Devora keeps the full transcript in SQLite. Reopen any session — the chat replays, the terminal reconnects in the right worktree, ready to go.

<br/>

## Tech Stack

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| **Frontend**  | Next.js 16 (App Router) · React 19 · TypeScript 5       |
| **UI**        | Material UI 7 · Emotion · Framer Motion                 |
| **Data**      | TanStack React Query 5 (optimistic mutations)           |
| **Backend**   | SQLite (better-sqlite3) + Drizzle ORM                   |
| **AI / Chat** | Claude Agent SDK (streaming over WebSocket)             |
| **Terminal**  | xterm.js 6 · node-pty · tmux · WebSocket                |
| **Auth**      | `gh` CLI session (fallback `GITHUB_TOKEN`)              |
| **GitHub**    | REST API + GraphQL (Projects V2)                        |
| **i18n**      | next-intl (en · fr · es · de · pt)                      |
| **Charts**    | Recharts 3                                              |

<br/>

## Getting Started

### Prerequisites

- **Node.js 20–25** — native modules (`better-sqlite3` / `node-pty`) don't support Node 26 yet
- **[GitHub CLI](https://cli.github.com) (`gh`)**, authenticated — run `gh auth login` once
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` in PATH) — for the Agent SDK
- **`tmux`** and **`git`**

### Install (recommended)

One command clones a dedicated copy into `~/.devora/repo`, builds it, and puts a stable `devora` command on your `PATH`:

```bash
curl -fsSL https://raw.githubusercontent.com/ludovicweber87/Devora/main/install.sh | bash
```

Open a new terminal (so the updated `PATH` takes effect), then:

```bash
devora start
```

This builds on first run, starts the agent server (`:4001`) and the web app (first free port from `4000`) as background services, and opens the desktop window. GitHub access comes from your `gh` session — **there is nothing else to configure.**

### CLI commands

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `devora start`      | Build (if needed), launch the services, open the window             |
| `devora stop`       | Stop the agent, web app and desktop window                          |
| `devora restart`    | Stop then start (use this to apply an update)                       |
| `devora status`     | Show each service (agent / web / desktop) with pid and URL          |
| `devora logs [svc]` | Tail logs — all, or one of `agent` / `web` / `desktop`              |
| `devora update`     | Pull latest `main`, reinstall, rebuild, refresh the CLI symlink     |

Runtime state (SQLite db, pids, logs) lives in `~/.devora/` and survives updates. Optional overrides go in `~/.devora/.env` (e.g. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

### Run from source (contributors)

```bash
git clone https://github.com/ludovicweber87/Devora.git
cd Devora
npm install
npm run dev
```

`npm run dev` launches both processes via `concurrently` — the Next.js app on **:4000** and the agent server on **:4001**, sharing the same SQLite database. Don't run it at the same time as `devora start` (port `4001` collides). Open [http://localhost:4000](http://localhost:4000).

<br/>

## Architecture

Devora runs as **two processes** sharing one local SQLite database:

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (React)                       │
│   Workbench · Issues · PRs · Todos · Sidebar (Projects)    │
│                          │                                 │
│         React Query (cache + optimistic mutations)         │
└───────────────┬───────────────────────────┬───────────────┘
                │ HTTP / apiFetch            │ WebSocket + localFetch
                ▼                            ▼
   ┌─────────────────────────┐   ┌──────────────────────────────┐
   │  Next.js app  (:4000)   │   │   Agent server (Node, :4001)  │
   │  API routes:            │   │  · git / worktrees            │
   │  · GitHub proxy         │   │  · terminal (node-pty + tmux) │
   │    (REST + GraphQL)     │   │  · Claude Agent SDK chat      │
   │  · CRUD (Drizzle)       │   │    (streaming over WS)        │
   └────────────┬────────────┘   └───────────────┬──────────────┘
                │                                 │
                └───────────────┬─────────────────┘
                                ▼
                   ┌──────────────────────────┐
                   │  SQLite  (data/devora.db) │
                   │  Drizzle ORM · shared     │
                   └──────────────────────────┘
                                ▲
                   ┌────────────┴─────────────┐
                   │   GitHub  ·  Claude SDK   │
                   └──────────────────────────┘
```

- **App Next.js (`src/`, :4000)** — UI + API routes (GitHub proxy, CRUD SQLite). Runs Drizzle migrations on start.
- **Agent server (`packages/agent/`, :4001)** — git/worktrees, terminal (node-pty + tmux over WebSocket), and the Agent SDK chat. Taps the **same** SQLite file.
- In dev, `scripts/dev-auto-port.mjs` boots both with `concurrently` and injects `DEVORA_DB_PATH` to share the database.

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

**Devora règle tout ça.**

## Qu'est-ce que Devora ?

Devora est un **cockpit développeur local et mono-utilisateur** qui rassemble tout votre workflow sur un seul écran : une conversation avec un agent Claude, vos worktrees git, vos issues GitHub, vos pull requests et vos todos — le tout connecté.

En son cœur, le **Workbench** : un chat d'agent propulsé par le **Claude Agent SDK**, côte à côte avec les fichiers qu'il modifie, son activité en direct, l'issue liée, et un terminal embarqué. Aucune clé API à gérer — l'accès GitHub vient directement de votre session `gh` CLI locale.

C'est votre **centre de contrôle pour le développement assisté par IA**, tournant entièrement sur votre machine.

<br/>

## Fonctionnalités clés

### 🛠️ Le Workbench

L'écran principal. À gauche (~75 %), une véritable **conversation Claude Agent SDK** — réponses en streaming, tool calls, demandes de permission et questions inline. À droite, des chips basculent le panneau haut entre **Fichiers** (diff live), **Activity** (ce que l'agent a fait) et **Issue** (l'issue GitHub liée), avec un ou plusieurs **terminaux** empilés en dessous et redimensionnables verticalement. La session est portée par `?session=<id>` et son transcript est persisté : fermez l'onglet, vous reprenez exactement où vous en étiez.

### 🤖 Claude Agent SDK — pas juste un CLI

Les agents tournent via **`@anthropic-ai/claude-agent-sdk`**, streamés vers l'UI en WebSocket. Vrai streaming, **cartes de tool call**, **demandes de permission** que vous validez depuis l'interface, et prompts **AskUserQuestion** rendus inline. Chaque session garde un transcript faisant autorité côté serveur en SQLite et se rejoue à la reconnexion. Le prompt système (persona d'agent + contexte d'issue) est persisté par session et rejoué automatiquement.

### 🌳 Projets & Worktrees

La **Sidebar** gauche liste vos projets. Dépliez-en un pour voir ses **worktrees** git et ses sessions ; cliquez une session pour l'ouvrir dans le Workbench, ou **+** pour lancer un nouvel agent (projet pré-rempli). Le nom du worktree est **optionnel** — lancez sans rien et la branche est renommée automatiquement (convention Karma : `feat/…`, `fix/…`) depuis le premier prompt de l'agent.

### 📋 Kanban Issues (GitHub Projects V2)

Intégration complète avec GitHub Projects V2 : board drag-and-drop des issues **et PRs qui vous sont assignées**, onglets par repo, statuts synchronisés vers GitHub via GraphQL, et une vue détail au clic. Adossé à un **cache SQLite local** — le board charge instantanément et n'appelle GitHub que sur refresh explicite (fini les surprises de rate-limit). Créez une branche (et un worktree) directement depuis une issue.

### ✅ Todos intelligents

Une **liste globale** unique avec édition inline et filtre repo optionnel. **Suggestions** en un clic depuis les issues GitHub qui vous sont assignées. Mutations optimistes pour un feedback UI instantané.

### 🔃 Pull Requests

Toutes vos PRs ouvertes sur tous vos repositories dans une seule vue, avec stats de diff, reviewers, labels, statut CI, et merge en un clic.

<br/>

## Pourquoi Devora ?

### Gagnez des heures chaque jour

| Sans Devora                                                                                                | Avec Devora                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Ouvrir GitHub → trouver l'issue → copier le nom de branche → ouvrir le terminal → checkout → lancer Claude | Lancer un agent depuis l'issue en un clic               |
| Naviguer entre 5 onglets pour vérifier l'état                                                              | Tout dans le Workbench                                  |
| Vérifier manuellement ce que l'agent IA a fait                                                             | Diff live, feed d'activité et chat en streaming         |
| Perdre le contexte en changeant de repo                                                                    | Onglets par repo, ordre persistant, vues multi-repo     |
| Aucune visibilité sur les agents en arrière-plan                                                           | Indicateurs de streaming live + historique des sessions |

### 100 % local, zéro secret

Devora est **mono-utilisateur et local-first**. L'accès GitHub utilise votre session **`gh` CLI** (`gh auth token`) — pas d'OAuth app, pas d'`AUTH_SECRET`, pas de page de login. Les données vivent dans un fichier **SQLite local**. Les seuls appels externes vont vers GitHub et Claude.

### Des agents IA qui rendent compte

Plutôt qu'un Claude lancé dans un terminal sans suivi, Devora dérive une **timeline d'activité en direct** depuis le flux d'events du SDK :

- **info** — décisions prises, analyses lancées
- **file_change** — fichiers créés, modifiés, supprimés
- **commit** — commits git avec messages
- **error** — blocages rencontrés
- **summary** — récapitulatif final quand la tâche est terminée

### Continuité des sessions

Onglet fermé ou agent tué ? Devora conserve le transcript complet en SQLite. Rouvrez n'importe quelle session — le chat se rejoue, le terminal se reconnecte dans le bon worktree, prêt à l'emploi.

<br/>

## Stack technique

| Couche        | Technologie                                             |
| ------------- | ------------------------------------------------------- |
| **Frontend**  | Next.js 16 (App Router) · React 19 · TypeScript 5       |
| **UI**        | Material UI 7 · Emotion · Framer Motion                 |
| **Data**      | TanStack React Query 5 (mutations optimistes)           |
| **Backend**   | SQLite (better-sqlite3) + Drizzle ORM                   |
| **IA / Chat** | Claude Agent SDK (streaming en WebSocket)               |
| **Terminal**  | xterm.js 6 · node-pty · tmux · WebSocket                |
| **Auth**      | Session `gh` CLI (fallback `GITHUB_TOKEN`)              |
| **GitHub**    | API REST + GraphQL (Projects V2)                        |
| **i18n**      | next-intl (en · fr · es · de · pt)                      |
| **Graphiques**| Recharts 3                                              |

<br/>

## Démarrage

### Prérequis

- **Node.js 20–25** — les modules natifs (`better-sqlite3` / `node-pty`) ne supportent pas encore Node 26
- **[GitHub CLI](https://cli.github.com) (`gh`)**, authentifié — lancez `gh auth login` une fois
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` dans le PATH) — pour l'Agent SDK
- **`tmux`** et **`git`**

### Installation (recommandé)

Une commande clone une copie dédiée dans `~/.devora/repo`, la build, et place une commande `devora` stable sur votre `PATH` :

```bash
curl -fsSL https://raw.githubusercontent.com/ludovicweber87/Devora/main/install.sh | bash
```

Ouvrez un nouveau terminal (pour que le `PATH` mis à jour prenne effet), puis :

```bash
devora start
```

Build au premier lancement, démarre le serveur agent (`:4001`) et l'app web (premier port libre depuis `4000`) en services d'arrière-plan, et ouvre la fenêtre desktop. L'accès GitHub vient de votre session `gh` — **il n'y a rien d'autre à configurer.**

### Commandes CLI

| Commande            | Rôle                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `devora start`      | Build (si besoin), lance les services, ouvre la fenêtre             |
| `devora stop`       | Arrête l'agent, l'app web et la fenêtre desktop                     |
| `devora restart`    | Stop puis start (à utiliser pour appliquer une mise à jour)         |
| `devora status`     | Affiche chaque service (agent / web / desktop) avec pid et URL      |
| `devora logs [svc]` | Suit les logs — tous, ou l'un de `agent` / `web` / `desktop`        |
| `devora update`     | Récupère le dernier `main`, réinstalle, rebuild, rafraîchit le lien |

L'état runtime (base SQLite, pids, logs) vit dans `~/.devora/` et survit aux mises à jour. Les overrides optionnels vont dans `~/.devora/.env` (ex. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

### Lancer depuis les sources (contributeurs)

```bash
git clone https://github.com/ludovicweber87/Devora.git
cd Devora
npm install
npm run dev
```

`npm run dev` lance les deux process via `concurrently` — l'app Next.js sur **:4000** et le serveur agent sur **:4001**, partageant la même base SQLite. Ne le lancez pas en même temps que `devora start` (le port `4001` entre en conflit). Ouvrez [http://localhost:4000](http://localhost:4000).

<br/>

## Architecture

Devora tourne en **deux process** partageant une base SQLite locale :

- **App Next.js (`src/`, :4000)** — UI + API routes (proxy GitHub, CRUD SQLite). Joue les migrations Drizzle au démarrage.
- **Serveur agent (`packages/agent/`, :4001)** — git/worktrees, terminal (node-pty + tmux en WebSocket), et le chat Agent SDK. Tape dans le **même** fichier SQLite.
- En dev, `scripts/dev-auto-port.mjs` démarre les deux via `concurrently` et injecte `DEVORA_DB_PATH` pour partager la base.

</details>

---

<p align="center">
  <sub>Built with obsessive attention to developer experience.<br/>Because the best tool is the one that disappears.</sub>
</p>
