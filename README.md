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
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" alt="Supabase" />
</p>

---

## The Problem

You're a developer juggling **5 tabs of GitHub**, a terminal running Claude, a todo list somewhere, PRs to review, branches to track. Context-switching kills your flow. Your AI agents run in the background but you have **zero visibility** on what they're doing.

**Devora fixes all of that.**

## What is Devora?

Devora is a **unified developer dashboard** that brings your entire workflow into one screen: GitHub issues, pull requests, todos, git branches, and most importantly — **AI agent orchestration with Claude**.

Think of it as your **mission control for AI-assisted development**.

<br/>

## Key Features

### 🎯 Unified Dashboard
One screen to rule them all. See your open issues, in-progress work, pending todos, and weekly activity at a glance. No more jumping between GitHub, your terminal, and a note-taking app.

### 🤖 Claude Agent Management
Launch, monitor, and manage Claude agents directly from the UI. Each agent runs in an isolated **tmux session** with a full embedded terminal (xterm.js). Agents automatically report their activity — every file change, every commit, every decision — in real-time.

- **Start agents on any branch** with one click
- **Live terminal** embedded in the dashboard — no window switching
- **Activity tracking** — agents log what they do as they work
- **Session history** — reopen past sessions, review what happened
- **Custom system prompts** via `.md` agent files

### 🔀 Workspace — Branch-Level Visibility
The **Workspace** page gives you a bird's-eye view of all branches across your projects. Click any branch to see its commit history and linked agent sessions. Start a new agent directly on a branch.

### 📋 Kanban Issues (GitHub Project V2)
Full integration with GitHub Projects V2. Drag-and-drop Kanban board with status updates that sync back to GitHub via GraphQL. Create branches from issues in one click.

### ✅ Smart Todos
Per-repository todo lists with **auto-suggestions** from your in-progress GitHub issues. Optimistic mutations for instant UI feedback.

### 🔃 Pull Requests
See all your open PRs across repositories with diff stats, reviewers, labels, and comments — all in one view.

### 🧩 Skills Editor
Create and manage reusable agent presets (`.md` files in `.claude/skills/`). Define specialized agents for different tasks — code review, test writing, refactoring — and launch them with one click.

<br/>

## Why Devora?

### Save Hours Every Day

| Without Devora | With Devora |
|---|---|
| Open GitHub → find issue → copy branch name → open terminal → checkout → start Claude | Click "Start Agent" on the branch |
| Switch between 5 browser tabs to check status | Everything on one dashboard |
| Manually check what your AI agent did | Agents auto-report activity in real-time |
| Lose context when switching between repos | Draggable tabs, persistent order, multi-repo views |
| No visibility on background agents | Live streaming indicators + session history |

### Built for Multi-Repo Workflows

Devora natively supports **multiple repositories**. Add your projects, and every page — Issues, PRs, Todos, Workspace, Agents, Skills — shows tabs for each repo. Drag to reorder, and the order persists across all pages.

### AI Agents That Report Back

Unlike running Claude in a terminal and hoping for the best, Devora agents are **instrumented**. They report their activity via API calls:

- **info** — decisions taken, analysis started
- **file_change** — files created, modified, deleted
- **commit** — git commits with messages
- **error** — blockers encountered
- **summary** — final recap when the task is done

You get a live activity timeline without asking the agent anything.

### Session Continuity

Killed an agent by mistake? Need to pick up where you left off? Devora keeps full session history. Reopen any past session — the terminal reconnects in the right directory, ready to go.

<br/>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 · React 19 · TypeScript 5 |
| **UI** | Material UI 7 · Emotion · Framer Motion |
| **Data** | TanStack React Query 5 (optimistic mutations) |
| **Backend** | Supabase (PostgreSQL + Row Level Security) |
| **AI** | Claude Agent SDK · Claude CLI |
| **Terminal** | xterm.js 6 · node-pty · WebSocket · tmux |
| **GitHub** | REST API + GraphQL (Project V2) |
| **Charts** | Recharts 3 |

<br/>

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` and `project` scopes
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed (`claude` available in PATH)
- `tmux` installed

### Installation

```bash
git clone https://github.com/ludovicweber87/Devora.git
cd Devora
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
GITHUB_TOKEN=ghp_your_token_here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

<br/>

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (React)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │Dashboard │ │ Issues   │ │Workspace │ │ Agents  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       │             │            │             │      │
│       └─────────────┴────────────┴─────────────┘      │
│                         │                             │
│              React Query (cache + mutations)          │
└─────────────────────────┬─────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │   Next.js API Routes  │
              └───┬───────┬───────┬───┘
                  │       │       │
         ┌────────┘       │       └────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────────┐
   │  GitHub  │    │ Supabase │    │  Terminal WS  │
   │ REST +   │    │ Postgres │    │  (port 4001)  │
   │ GraphQL  │    │  + RLS   │    │  tmux + pty   │
   └──────────┘    └──────────┘    └──────┬───────┘
                                          │
                                   ┌──────┴───────┐
                                   │  Claude CLI  │
                                   │  (per agent) │
                                   └──────────────┘
```

<br/>

## Roadmap

- [ ] Multi-user support with auth
- [ ] Git worktree integration for parallel agent execution
- [ ] Agent-to-agent communication
- [ ] PR review automation with Claude
- [ ] Notifications (Slack, email) on agent completion
- [ ] Self-hosted deployment guide (Docker)

<br/>

## License

MIT

---

<br/>

<details>
<summary><strong>🇫🇷 Version française</strong></summary>

<br/>

## Le problème

Vous êtes développeur. Vous jonglez entre **5 onglets GitHub**, un terminal avec Claude, une todo list quelque part, des PRs à reviewer, des branches à suivre. Le changement de contexte permanent tue votre productivité. Vos agents IA tournent en arrière-plan mais vous n'avez **aucune visibilité** sur ce qu'ils font.

**Devora règle tout ça.**

## Qu'est-ce que Devora ?

Devora est un **tableau de bord développeur unifié** qui rassemble tout votre workflow sur un seul écran : issues GitHub, pull requests, todos, branches git, et surtout — **l'orchestration d'agents IA avec Claude**.

C'est votre **centre de contrôle pour le développement assisté par IA**.

<br/>

## Fonctionnalités clés

### 🎯 Dashboard unifié
Un seul écran pour tout voir. Issues en cours, travail en progression, todos en attente, activité de la semaine. Plus besoin de naviguer entre GitHub, votre terminal et une app de notes.

### 🤖 Gestion des agents Claude
Lancez, supervisez et gérez vos agents Claude directement depuis l'interface. Chaque agent tourne dans une **session tmux isolée** avec un terminal embarqué complet (xterm.js). Les agents rapportent automatiquement leur activité — chaque modification de fichier, chaque commit, chaque décision — en temps réel.

- **Lancez un agent sur n'importe quelle branche** en un clic
- **Terminal live** intégré au dashboard — pas de changement de fenêtre
- **Suivi d'activité** — les agents documentent ce qu'ils font en travaillant
- **Historique des sessions** — rouvrez une session passée, revoyez ce qui s'est passé
- **Prompts système personnalisés** via des fichiers `.md`

### 🔀 Workspace — Visibilité par branche
La page **Workspace** offre une vue d'ensemble de toutes les branches de vos projets. Cliquez sur une branche pour voir son historique de commits et les sessions d'agents associées. Démarrez un nouvel agent directement sur une branche.

### 📋 Kanban Issues (GitHub Project V2)
Intégration complète avec GitHub Projects V2. Board Kanban en drag-and-drop avec mise à jour des statuts synchronisés vers GitHub via GraphQL. Créez des branches depuis une issue en un clic.

### ✅ Todos intelligents
Listes de tâches par repository avec **suggestions automatiques** depuis vos issues GitHub en cours. Mutations optimistes pour un feedback UI instantané.

### 🔃 Pull Requests
Visualisez toutes vos PRs ouvertes sur tous vos repositories avec les stats de diff, reviewers, labels et commentaires — le tout dans une seule vue.

### 🧩 Éditeur de Skills
Créez et gérez des presets d'agents réutilisables (fichiers `.md` dans `.claude/skills/`). Définissez des agents spécialisés pour différentes tâches — code review, écriture de tests, refactoring — et lancez-les en un clic.

<br/>

## Pourquoi Devora ?

### Gagnez des heures chaque jour

| Sans Devora | Avec Devora |
|---|---|
| Ouvrir GitHub → trouver l'issue → copier le nom de branche → ouvrir le terminal → checkout → lancer Claude | Cliquer "Start Agent" sur la branche |
| Naviguer entre 5 onglets pour vérifier l'état | Tout sur un seul dashboard |
| Vérifier manuellement ce que l'agent IA a fait | Les agents rapportent leur activité en temps réel |
| Perdre le contexte en changeant de repo | Onglets draggables, ordre persistant, vues multi-repo |
| Aucune visibilité sur les agents en arrière-plan | Indicateurs de streaming live + historique des sessions |

### Conçu pour le multi-repo

Devora supporte nativement **plusieurs repositories**. Ajoutez vos projets, et chaque page — Issues, PRs, Todos, Workspace, Agents, Skills — affiche des onglets par repo. Réorganisez par drag-and-drop, l'ordre persiste sur toutes les pages.

### Des agents IA qui rendent compte

Contrairement à un Claude lancé dans un terminal sans suivi, les agents Devora sont **instrumentés**. Ils rapportent leur activité via des appels API :

- **info** — décisions prises, analyses lancées
- **file_change** — fichiers créés, modifiés, supprimés
- **commit** — commits git avec messages
- **error** — blocages rencontrés
- **summary** — récapitulatif final quand la tâche est terminée

Vous obtenez une timeline d'activité en direct sans rien demander à l'agent.

### Continuité des sessions

Vous avez tué un agent par erreur ? Besoin de reprendre là où vous en étiez ? Devora conserve l'historique complet des sessions. Rouvrez n'importe quelle session passée — le terminal se reconnecte dans le bon répertoire, prêt à l'emploi.

</details>

---

<p align="center">
  <sub>Built with obsessive attention to developer experience.<br/>Because the best tool is the one that disappears.</sub>
</p>
