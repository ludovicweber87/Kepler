<p align="center">
  <img src="public/logo.svg" alt="Kepler" width="280" />
</p>

<p align="center">
  <strong>Mission control for AI-assisted development.</strong><br/>
  Run a fleet of Claude agents across your worktrees — with personas, GitHub context and a daily debrief.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0-7C5CFF" alt="Version 1.0" />
  <img src="https://img.shields.io/badge/status-production-22C55E" alt="Production" />
  <img src="https://img.shields.io/badge/local--first-no%20cloud-00D4FF" alt="Local-first" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT" />
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

## The problem

You have one agent, one terminal, one branch. So you work like you always did — serially.

Meanwhile you're juggling five GitHub tabs, re-explaining your conventions to the model at every launch, copy-pasting issue descriptions into a prompt, losing track of what a background agent actually did, and hunting through `git log` on Friday to remember what you shipped on Tuesday.

The bottleneck isn't the model anymore. **It's the harness around it.**

## What Kepler is

Kepler is a **local, single-user cockpit** for running Claude agents at scale on your own machine.

It gives every agent its own **git worktree**, a reusable **persona**, and the **context it needs** — the GitHub issue it's working on, the repo it lives in, the docs you wrote about it. It streams back everything it does, notifies you the moment it needs you, and turns each day's activity into a written debrief.

No cloud, no accounts, no API keys to juggle: GitHub access comes from your local `gh` CLI session, data lives in a SQLite file next to the app, and agents run through the **Claude Agent SDK** in your own processes.

<br/>

## 🌟 The five pillars of v1.0

<table>
<tr><td width="33%"><h3>🌳 A fleet, not an agent</h3></td><td>

**Parallel worktrees.** Every session gets its own isolated worktree under `.worktrees/`, its own branch and its own terminal — so **N agents work at once without ever stepping on each other**. The sidebar is your fleet view: projects → worktrees → sessions, with an unread dot on any agent that needs you.

Four launch modes: a **new worktree**, the **current branch**, an **existing local or remote branch**, or **free mode** — no project, no branch, just an agent in a folder.

</td></tr>
<tr><td><h3>🎭 Personas</h3></td><td>

Stop re-explaining yourself. A **persona** bundles a name, a role, a system prompt and its own defaults for **model**, **reasoning effort**, **permission mode** and **accent colour** — then drives every session you launch with it. Personas can be **scoped to repos** (or stay global), and you can **switch persona mid-conversation**: the running agent is told about the change on the fly, no restart, no lost context.

Ships with a real starter library, one `kepler seed` away — _Architecte Full-stack_, _Product Owner_, _Data Analyst_, _Développeur_, _Reviewer_, _The Debugger_, _The Legend_, _Growth_, _Pixelsmith_ and _Video game Engineer_.

</td></tr>
<tr><td><h3>📚 Docs with a contextual chat</h3></td><td>

Describe a subject, pick a **source** (general knowledge or **one of your repos**), a **level**, a **length**, a **format** and an optional **angle** — a dedicated writer agent produces the doc in Markdown, in the background.

Then comes the part that matters: **each doc has its own chat**, side by side with the text. Ask a question about the subject, or ask for a change — the agent **edits the document in place** through guarded, in-process tools (exact-match edits, ambiguous requests refused rather than guessed). One-click refinements too: _Shorter_, _Add examples_, _More technical_, _Simplify_.

</td></tr>
<tr><td><h3>🔗 Wired into GitHub</h3></td><td>

**Launch an agent straight from an issue** — Kepler pulls the issue **title and body into the session's system prompt**, links the session to the issue, creates the branch and worktree, and **posts a comment on the issue** so the trail is visible on GitHub. The agent starts already knowing what it's for.

Around it: a **Projects V2 kanban** (drag-and-drop, status synced via GraphQL, local cache for instant loads), all your **PRs with CI status and one-click merge**, **AI-drafted issues** from one sentence, and **post-merge triage** — merge a PR linked to an issue and Kepler moves the issue to your QA column and archives the worktree.

</td></tr>
<tr><td><h3>📅 The daily</h3></td><td>

A **month calendar of AI-written daily reports**, per repository. Kepler collects the day's real activity — commits across all branches, pull requests, agent activity logs — and has an agent synthesise it into a handful of first-person bullets. Cells show the points inline; click a day for the full report **plus the raw activity timeline it was built from**. Generate, regenerate or delete any day.

Standups write themselves.

</td></tr>
</table>

<br/>

## Feature tour

### Work with agents

**🛠️ The Workbench** — the main screen. On the left, a full **Claude Agent SDK conversation**: real streaming, tool-call cards, permission requests you approve from the UI, inline `AskUserQuestion` prompts, image attachments, a model/effort picker and a persona-tinted composer. On the right, chips swap the top panel between **Changes** (live git diff), **Activity**, **Issue**, **Explorer** (file tree + syntax-highlighted viewer) and **Reader**, with **multiple terminal tabs** stacked below (`⌘J`) and a draggable split. Files open as tabs next to the chat.

**🤖 Real SDK sessions, not a wrapped CLI** — agents run through `@anthropic-ai/claude-agent-sdk`, streamed to the browser over WebSocket. Each session keeps a **server-authoritative transcript in SQLite** and replays on reconnect; the system prompt (persona + issue context) is persisted per session and rejoined automatically. Close the tab, restart your machine, come back — the conversation, the terminal and the worktree are all still there.

**🏷️ Sessions that behave like humans name things** — the session label is **decoupled from the git branch**: rename freely without touching git, and a manual rename always wins over the auto-title. Leave the worktree name empty and the branch is **auto-named from your first prompt** (karma convention: `feat/…`, `fix/…`).

**📈 Activity timeline** — Kepler derives a live, readable timeline from the SDK event stream: `info` (decisions, analysis), `file_change` (created / modified / deleted), `commit` (with messages), `error` (blockers) and `summary` (the final recap). Plus a per-session **Recap** view when the work is done.

**🔔 Notifications** — a real-time centre over **SSE**: when an agent **finishes**, **fails** or **gets blocked waiting for you**, a prioritised, de-duplicated notification lands instantly — with a sound and an OS notification if you've walked away. Read/unread tracking, and an unread dot on the worktree in the sidebar.

**⚡ Repo scripts** — declare per-repo commands (tests, lint, storybook…) and get them as **buttons in the top bar**. Each runs either in a **new terminal tab** or as a **message to the agent**.

### Manage the work

**📋 Issues — Projects V2 kanban** — drag-and-drop board of the issues _and_ PRs assigned to you, per-repo tabs with persisted order, statuses written back to GitHub via GraphQL, closed issues included, detail view on click. Backed by a **local SQLite cache**: the board paints instantly and only hits GitHub on refresh — no rate-limit surprises.

**✍️ AI-drafted issues** — describe it in one plain sentence; an agent writes a proper title and body; create it on GitHub in one click. Available from the issues page _and_ straight from a task.

**✅ Tasks** — inline editing, optional per-repo filter, modal detail. Each task can carry a **due date with urgency colouring**, be **pinned**, **link to a GitHub issue** — or **spawn one**. Overdue count badges the sidebar. Optimistic mutations throughout.

**🔃 Pull requests** — every open PR across your repositories in one view: diff stats, reviewers, labels, **CI / check status**, merged state, one-click merge — which then triggers post-merge triage.

**🗄️ Archived sessions** — finished work stays browsable read-only. Unarchive to resume, or delete (worktree only, or worktree + branch).

### Make it yours

**⚙️ Per-repo settings** — custom **Create PR** and **Commit & push** prompts, **files to copy** into every new worktree (`.env` & friends), a **setup script** run at worktree creation (with a named progress step), an **archive script** run before archiving, the **QA column** used by post-merge triage, and the repo's **script buttons**.

**🎨 Appearance** — seven theme presets (dark Kepler / violet / teal / amber, light cream / cool / bright) plus a **full custom palette**, and independent **font family and size for the app and the terminal**.

**🧑‍💻 Your editor, one click away** — open any worktree in VS Code, Cursor, Windsurf, Zed, IntelliJ, WebStorm, PhpStorm, PyCharm or Sublime Text.

**🌍 i18n** — the whole UI in English, French, Spanish, German and Portuguese.

<br/>

## Why Kepler?

| Without Kepler                                                                   | With Kepler                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| One agent, one branch, work done serially                                        | **A fleet of agents**, one isolated worktree each             |
| Re-explain your conventions at every launch                                      | Reusable **personas** (prompt + model + effort + permissions) |
| Copy-paste the issue into the prompt                                             | Launch from the issue — **context injected, issue commented** |
| Open GitHub → find issue → copy branch name → terminal → checkout → start Claude | One click                                                     |
| Poll a background agent to see if it's done                                      | **Real-time notifications** on done / failed / blocked        |
| Guess what the agent actually changed                                            | Live diff, activity timeline, streaming transcript            |
| Docs rot in a wiki nobody edits                                                  | Docs you **chat with** — and the agent edits in place         |
| "What did I even ship on Tuesday?"                                               | **AI-written daily reports**, per repo, on a calendar         |
| Five browser tabs to know where things stand                                     | One Workbench                                                 |

### Local-first, zero secrets

Single-user and local by design. GitHub access uses your **`gh` CLI** session (`gh auth token`) — no OAuth app, no `AUTH_SECRET`, no login page. State lives in one **SQLite** file. The only outbound calls are to GitHub and to Claude. Nothing about your code leaves your machine except what you'd already be sending to the model.

<br/>

## Tech stack

| Layer           | Technology                                                   |
| --------------- | ------------------------------------------------------------ |
| **Frontend**    | Next.js 16 (App Router) · React 19 · TypeScript 5            |
| **UI**          | Material UI 7 · MUI X Date Pickers · Emotion · Framer Motion |
| **Data**        | TanStack React Query 5 (optimistic mutations)                |
| **Storage**     | SQLite (better-sqlite3) + Drizzle ORM                        |
| **AI / chat**   | Claude Agent SDK · in-process MCP tools (docs)               |
| **Real-time**   | WebSocket (chat + terminal) · SSE (notifications)            |
| **Terminal**    | xterm.js 6 · node-pty · tmux                                 |
| **Code render** | Shiki · react-markdown · remark-gfm                          |
| **Auth**        | `gh` CLI session (fallback `GITHUB_TOKEN`)                   |
| **GitHub**      | REST API + GraphQL (Projects V2)                             |
| **Desktop**     | Electron window wrapping the local server                    |
| **i18n**        | next-intl (en · fr · es · de · pt)                           |
| **Quality**     | ESLint 9 · Prettier 3 · Vitest (pure logic)                  |

<br/>

## Getting started

### Prerequisites

- **macOS** — Kepler is built and tested there (it uses `tmux`, `osascript` for the folder picker and `open -a` for editors)
- **Node.js 20–25** — native modules (`better-sqlite3`, `node-pty`) don't support Node 26 yet
- **[GitHub CLI](https://cli.github.com) (`gh`)**, authenticated — `gh auth login` once
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` on your `PATH`)
- **`tmux`** and **`git`**

### Install

One command clones a dedicated copy into `~/.kepler/repo`, builds it, and puts a stable `kepler` command on your `PATH`:

```bash
curl -fsSL https://raw.githubusercontent.com/ludovicweber87/Kepler/main/install.sh | bash
```

> The installer is re-runnable: run it again and it pulls the latest `main`, rebuilds, and refreshes the `kepler` symlink. Prefer to read before you pipe? `curl -fsSLO …/install.sh`, read it, then `bash install.sh`.

The installer puts `~/.kepler/bin` on your `PATH`, but the shell you ran it from doesn't know
that yet — so `kepler` would come back as `command not found`. Load it, then start:

```bash
source ~/.zshrc     # or ~/.bashrc · ~/.config/fish/config.fish
kepler start        # builds on first run, starts both services, opens the window
kepler seed         # optional: install the starter persona library
```

Opening a new terminal works just as well: the `PATH` line is picked up at startup. The installer
prints the exact `source` command for your shell when it finishes.

`start` boots the agent server (`:4001`) and the web app (first free port from `4000`) as background services and opens the desktop window. GitHub access comes from your `gh` session — **there is nothing else to configure.**

### First five minutes

1. **Settings → local repository paths** — point Kepler at one of your repos.
2. `kepler seed` — get the starter personas (or write your own in **Personas**).
3. **Settings → GitHub Projects** — connect a Project V2 board to light up the kanban.
4. Open a project in the sidebar, hit **+**, pick a persona and a launch mode → you're in the Workbench.
5. Paste a GitHub issue URL at launch time to hand the agent its full context.

### CLI

| Command                 | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `kepler start`          | Build (if needed), launch the services, open the window         |
| `kepler stop`           | Stop the agent, web app and desktop window                      |
| `kepler restart`        | Stop then start — use this to apply an update                   |
| `kepler status`         | Each service (agent / web / desktop) with pid and URL           |
| `kepler logs [service]` | Tail logs — all, or one of `agent` / `web` / `desktop`          |
| `kepler update`         | Pull latest `main`, reinstall, rebuild, refresh the CLI symlink |
| `kepler seed`           | Install the starter personas (`--overwrite` to reset them)      |

Runtime state (SQLite database, pids, logs) lives in `~/.kepler/` and survives updates. Optional overrides go in `~/.kepler/.env` (e.g. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

### Run from source (contributors)

```bash
git clone https://github.com/ludovicweber87/Kepler.git
cd Kepler
npm install
npm run dev
```

`npm run dev` starts both processes via `concurrently` — the Next.js app on **:4000** and the agent server on **:4001**, sharing one SQLite database. Don't run it alongside `kepler start` (port `4001` collides). Then open [http://localhost:4000](http://localhost:4000).

| Script                    | Purpose                                |
| ------------------------- | -------------------------------------- |
| `npm run dev`             | Both processes, auto-selected web port |
| `npm run dev:web`         | Next.js only                           |
| `npm run dev:agent`       | Agent server only                      |
| `npm run build` / `start` | Production build / serve on `:4000`    |
| `npm run lint` / `format` | ESLint / Prettier                      |
| `npm run test:web`        | Vitest (pure logic — lib & hooks)      |
| `npm run seed:personas`   | `kepler seed` from a dev checkout      |

<br/>

## Architecture

Kepler runs as **two processes sharing one local SQLite database**:

```
┌────────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                       │
│   Workbench · Issues · PRs · Tasks · Docs · Daily · Personas    │
│                              │                                  │
│          React Query (cache + optimistic mutations)             │
└──────────────┬──────────────────────────────┬──────────────────┘
               │ HTTP / apiFetch               │ WS · SSE · localFetch
               ▼                               ▼
  ┌──────────────────────────┐   ┌─────────────────────────────────┐
  │   Next.js app  (:4000)   │   │    Agent server (Node, :4001)    │
  │  · GitHub proxy          │   │  · git / worktrees / branches     │
  │    (REST + GraphQL)      │   │  · terminals (node-pty + tmux)    │
  │  · CRUD via Drizzle      │   │  · Agent SDK chat (WebSocket)     │
  │  · runs migrations       │   │  · doc writer + MCP doc tools     │
  │                          │   │  · daily reports · notifications  │
  └────────────┬─────────────┘   └────────────────┬────────────────┘
               │                                   │
               └─────────────────┬─────────────────┘
                                 ▼
                   ┌──────────────────────────────┐
                   │   SQLite  (data/kepler.db)    │
                   │   Drizzle ORM · WAL · shared  │
                   └──────────────────────────────┘
                                 ▲
                   ┌─────────────┴──────────────┐
                   │  GitHub API  ·  Claude SDK  │
                   └────────────────────────────┘
```

- **Next.js app** (`src/`, `:4000`) — UI + API routes (GitHub proxy, SQLite CRUD). Runs Drizzle migrations at startup.
- **Agent server** (`packages/agent/`, `:4001`) — git and worktrees, terminals over WebSocket, the Agent SDK chat, the docs writer and its in-process MCP tools, daily report generation, and the notifications SSE stream. Opens the **same** SQLite file.
- **Desktop** (`packages/desktop/`) — a thin Electron window over the local server.
- **CLI** (`packages/cli/`) — the `kepler` command: build, process supervision, logs, updates, seeding.
- In dev, `scripts/dev-auto-port.mjs` boots both with `concurrently` and injects `KEPLER_DB_PATH` so they share the database.

### Data model

Everything persisted lives in a handful of Drizzle tables — no user ids, no RLS, single-user by design:

| Domain        | Tables                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Agents        | `agent_sessions` · `agent_chat_messages` · `agent_activity_logs`                |
| Personas      | `personas` · `persona_repos`                                                    |
| Docs          | `docs` · `doc_categories` · `doc_category_links`                                |
| Daily         | `daily_recaps`                                                                  |
| GitHub        | `project_configs` · `project_boards` (board cache)                              |
| Work          | `tasks` · `notifications`                                                       |
| Configuration | `repo_paths` · `repo_settings` · `repo_scripts` · `app_settings` · `tab_orders` |

## License

MIT

---

<br/>

<details>
<summary><strong>🇫🇷 Version française</strong></summary>

<br/>

## Le problème

Un agent, un terminal, une branche. Résultat : vous travaillez comme avant — en série.

Pendant ce temps vous jonglez entre cinq onglets GitHub, vous ré-expliquez vos conventions au modèle à chaque lancement, vous copiez-collez la description d'une issue dans un prompt, vous perdez la trace de ce qu'un agent en arrière-plan a réellement fait, et le vendredi vous fouillez le `git log` pour vous souvenir de ce que vous avez livré mardi.

Le goulot d'étranglement, ce n'est plus le modèle. **C'est tout ce qu'il y a autour.**

## Ce qu'est Kepler

Kepler est un **cockpit local et mono-utilisateur** pour faire tourner des agents Claude à l'échelle, sur votre machine.

Chaque agent reçoit son propre **worktree git**, une **persona** réutilisable, et **le contexte dont il a besoin** : l'issue GitHub sur laquelle il travaille, le repo dans lequel il vit, la doc que vous avez écrite dessus. Tout ce qu'il fait est streamé en direct, vous êtes notifié à la seconde où il a besoin de vous, et l'activité de la journée devient un compte-rendu écrit.

Pas de cloud, pas de compte, aucune clé API à gérer : l'accès GitHub vient de votre session `gh` CLI locale, les données vivent dans un fichier SQLite à côté de l'app, et les agents tournent via le **Claude Agent SDK** dans vos propres process.

<br/>

## 🌟 Les cinq piliers de la v1.0

<table>
<tr><td width="33%"><h3>🌳 Une flotte, pas un agent</h3></td><td>

**Worktrees parallèles.** Chaque session a son worktree isolé dans `.worktrees/`, sa branche et son terminal — donc **N agents travaillent en même temps sans jamais se marcher dessus**. La sidebar est votre vue de flotte : projets → worktrees → sessions, avec une pastille sur tout agent qui vous attend.

Quatre modes de lancement : **nouveau worktree**, **branche courante**, **branche existante** (locale ou distante), ou **mode libre** — sans projet, sans branche, juste un agent dans un dossier.

</td></tr>
<tr><td><h3>🎭 Personas</h3></td><td>

Arrêtez de vous répéter. Une **persona** regroupe un nom, un rôle, un system prompt et ses propres réglages de **modèle**, **effort de raisonnement**, **mode de permission** et **couleur** — et pilote chaque session lancée avec elle. Les personas peuvent être **rattachées à des repos** (ou rester globales), et vous pouvez **changer de persona en cours de conversation** : l'agent en cours est informé du changement à la volée, sans redémarrage ni perte de contexte.

Livré avec une vraie bibliothèque de départ, à un `kepler seed` de distance — _Architecte Full-stack_, _Product Owner_, _Data Analyst_, _Développeur_, _Reviewer_, _The Debugger_, _The Legend_, _Growth_, _Pixelsmith_ et _Video game Engineer_.

</td></tr>
<tr><td><h3>📚 Des docs avec chat contextuel</h3></td><td>

Décrivez un sujet, choisissez une **source** (connaissance générale ou **l'un de vos repos**), un **niveau**, une **longueur**, un **format** et un **angle** optionnel — un agent rédacteur produit la doc en Markdown, en arrière-plan.

Et surtout : **chaque doc a son propre chat**, côte à côte avec le texte. Posez une question sur le sujet, ou demandez une modification — l'agent **édite le document sur place** via des outils in-process encadrés (édition par correspondance exacte, refus explicite des cas ambigus plutôt que de deviner). Et des retouches en un clic : _Plus court_, _Ajouter des exemples_, _Plus technique_, _Simplifier_.

</td></tr>
<tr><td><h3>🔗 Branché sur GitHub</h3></td><td>

**Lancez un agent directement depuis une issue** — Kepler injecte le **titre et le corps de l'issue dans le system prompt** de la session, lie la session à l'issue, crée la branche et le worktree, et **poste un commentaire sur l'issue** pour que la trace soit visible sur GitHub. L'agent démarre en sachant déjà pourquoi il est là.

Autour : un **kanban Projects V2** (drag-and-drop, statuts synchronisés en GraphQL, cache local pour un affichage instantané), toutes vos **PRs avec statut CI et merge en un clic**, des **issues rédigées par l'IA** à partir d'une phrase, et le **triage post-merge** — mergez une PR liée à une issue et Kepler déplace l'issue vers votre colonne QA puis archive le worktree.

</td></tr>
<tr><td><h3>📅 Le daily</h3></td><td>

Un **calendrier mensuel de comptes-rendus quotidiens rédigés par l'IA**, par repository. Kepler collecte l'activité réelle de la journée — commits toutes branches, pull requests, logs d'activité des agents — et un agent la synthétise en quelques puces à la première personne. Les cellules affichent les points en clair ; un clic ouvre le rapport complet **et la timeline d'activité brute qui l'a produit**. Générez, régénérez ou supprimez n'importe quel jour.

Le daily s'écrit tout seul.

</td></tr>
</table>

<br/>

## Tour des fonctionnalités

### Travailler avec les agents

**🛠️ Le Workbench** — l'écran principal. À gauche, une véritable **conversation Claude Agent SDK** : streaming réel, cartes de tool call, demandes de permission validées depuis l'UI, questions `AskUserQuestion` inline, pièces jointes images, sélecteur de modèle/effort et composer teinté de la couleur de la persona. À droite, des chips basculent le panneau haut entre **Changes** (diff git live), **Activity**, **Issue**, **Explorer** (arbre de fichiers + viewer coloré) et **Reader**, avec **plusieurs onglets de terminal** en dessous (`⌘J`) et un split redimensionnable. Les fichiers s'ouvrent en onglets à côté du chat.

**🤖 De vraies sessions SDK, pas un CLI enrobé** — les agents tournent via `@anthropic-ai/claude-agent-sdk`, streamés au navigateur en WebSocket. Chaque session garde un **transcript faisant autorité côté serveur, en SQLite**, et se rejoue à la reconnexion ; le system prompt (persona + contexte d'issue) est persisté par session et réinjecté automatiquement. Fermez l'onglet, redémarrez la machine, revenez — la conversation, le terminal et le worktree sont toujours là.

**🏷️ Des sessions nommées comme des humains les nomment** — le label de session est **découplé de la branche git** : renommez librement sans toucher à git, et un renommage manuel gagne toujours sur le titre auto. Laissez le nom de worktree vide et la branche est **nommée automatiquement depuis votre premier prompt** (convention karma : `feat/…`, `fix/…`).

**📈 Timeline d'activité** — Kepler dérive une timeline lisible du flux d'events du SDK : `info` (décisions, analyses), `file_change` (créé / modifié / supprimé), `commit` (avec messages), `error` (blocages) et `summary` (le récap final). Plus une vue **Recap** par session quand le travail est terminé.

**🔔 Notifications** — un centre temps réel en **SSE** : quand un agent **termine**, **échoue** ou **se retrouve bloqué en attente de vous**, une notification priorisée et dédupliquée arrive instantanément — avec un son et une notification système si vous êtes parti. Suivi lu / non-lu, et pastille sur le worktree dans la sidebar.

**⚡ Scripts par repo** — déclarez des commandes par repo (tests, lint, storybook…) et obtenez-les en **boutons dans la barre du haut**. Chacune tourne soit dans un **nouvel onglet terminal**, soit comme **message envoyé à l'agent**.

### Piloter le travail

**📋 Issues — kanban Projects V2** — board drag-and-drop des issues _et_ PRs qui vous sont assignées, onglets par repo avec ordre persisté, statuts réécrits vers GitHub en GraphQL, issues fermées incluses, vue détail au clic. Adossé à un **cache SQLite local** : le board s'affiche instantanément et n'appelle GitHub que sur refresh — fini les surprises de rate-limit.

**✍️ Issues rédigées par l'IA** — décrivez-la en une phrase ; un agent en rédige titre et corps ; création sur GitHub en un clic. Disponible depuis la page issues _et_ directement depuis une tâche.

**✅ Tâches** — édition inline, filtre repo optionnel, détail en modale. Chaque tâche peut porter une **échéance avec couleur d'urgence**, être **épinglée**, **être liée à une issue GitHub** — ou **en créer une**. Le nombre de tâches en retard badge la sidebar. Mutations optimistes partout.

**🔃 Pull requests** — toutes vos PRs ouvertes, tous repos confondus, dans une seule vue : stats de diff, reviewers, labels, **statut CI**, état mergé, merge en un clic — qui déclenche ensuite le triage post-merge.

**🗄️ Sessions archivées** — le travail terminé reste consultable en lecture seule. Désarchivez pour reprendre, ou supprimez (worktree seul, ou worktree + branche).

### Le régler à votre main

**⚙️ Réglages par repo** — prompts personnalisés **Créer une PR** et **Commit & push**, **fichiers à copier** dans chaque nouveau worktree (`.env` et compagnie), **script de setup** joué à la création du worktree (avec une étape nommée dans la progression), **script d'archivage** joué avant archivage, **colonne QA** utilisée par le triage post-merge, et les **boutons de script** du repo.

**🎨 Apparence** — sept thèmes prêts à l'emploi (dark Kepler / violet / teal / ambre, light crème / froid / clair) plus une **palette entièrement personnalisable**, et **police et taille indépendantes pour l'app et le terminal**.

**🧑‍💻 Votre éditeur à un clic** — ouvrez n'importe quel worktree dans VS Code, Cursor, Windsurf, Zed, IntelliJ, WebStorm, PhpStorm, PyCharm ou Sublime Text.

**🌍 i18n** — toute l'interface en anglais, français, espagnol, allemand et portugais.

<br/>

## Pourquoi Kepler ?

| Sans Kepler                                                                        | Avec Kepler                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Un agent, une branche, du travail en série                                         | **Une flotte d'agents**, un worktree isolé chacun                 |
| Ré-expliquer ses conventions à chaque lancement                                    | Des **personas** réutilisables (prompt + modèle + effort + perms) |
| Copier-coller l'issue dans le prompt                                               | Lancement depuis l'issue — **contexte injecté, issue commentée**  |
| Ouvrir GitHub → trouver l'issue → copier la branche → terminal → checkout → Claude | Un clic                                                           |
| Surveiller un agent pour savoir s'il a fini                                        | **Notifications temps réel** : terminé / échoué / bloqué          |
| Devinez ce que l'agent a vraiment changé                                           | Diff live, timeline d'activité, transcript en streaming           |
| Une doc qui pourrit dans un wiki que personne n'édite                              | Des docs avec qui on **discute** — et que l'agent édite sur place |
| « J'ai livré quoi mardi, déjà ? »                                                  | Des **comptes-rendus quotidiens IA**, par repo, sur un calendrier |
| Cinq onglets de navigateur pour savoir où on en est                                | Un seul Workbench                                                 |

### Local-first, zéro secret

Mono-utilisateur et local par conception. L'accès GitHub utilise votre session **`gh` CLI** (`gh auth token`) — pas d'OAuth app, pas d'`AUTH_SECRET`, pas de page de login. L'état vit dans un unique fichier **SQLite**. Les seuls appels sortants vont vers GitHub et Claude. Rien de votre code ne quitte votre machine, hormis ce que vous enverriez déjà au modèle.

<br/>

## Stack technique

| Couche         | Technologie                                                  |
| -------------- | ------------------------------------------------------------ |
| **Frontend**   | Next.js 16 (App Router) · React 19 · TypeScript 5            |
| **UI**         | Material UI 7 · MUI X Date Pickers · Emotion · Framer Motion |
| **Data**       | TanStack React Query 5 (mutations optimistes)                |
| **Stockage**   | SQLite (better-sqlite3) + Drizzle ORM                        |
| **IA / chat**  | Claude Agent SDK · outils MCP in-process (docs)              |
| **Temps réel** | WebSocket (chat + terminal) · SSE (notifications)            |
| **Terminal**   | xterm.js 6 · node-pty · tmux                                 |
| **Rendu code** | Shiki · react-markdown · remark-gfm                          |
| **Auth**       | Session `gh` CLI (fallback `GITHUB_TOKEN`)                   |
| **GitHub**     | API REST + GraphQL (Projects V2)                             |
| **Desktop**    | Fenêtre Electron autour du serveur local                     |
| **i18n**       | next-intl (en · fr · es · de · pt)                           |
| **Qualité**    | ESLint 9 · Prettier 3 · Vitest (logique pure)                |

<br/>

## Démarrage

### Prérequis

- **macOS** — Kepler y est développé et testé (usage de `tmux`, `osascript` pour le picker de dossier, `open -a` pour les éditeurs)
- **Node.js 20–25** — les modules natifs (`better-sqlite3`, `node-pty`) ne supportent pas encore Node 26
- **[GitHub CLI](https://cli.github.com) (`gh`)**, authentifié — `gh auth login` une fois
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` dans le `PATH`)
- **`tmux`** et **`git`**

### Installation

Une commande clone une copie dédiée dans `~/.kepler/repo`, la build, et place une commande `kepler` stable dans votre `PATH` :

```bash
curl -fsSL https://raw.githubusercontent.com/ludovicweber87/Kepler/main/install.sh | bash
```

> L'installeur est rejouable : relancez-le et il récupère le dernier `main`, rebuild, et rafraîchit le symlink `kepler`. Vous préférez lire avant de piper ? `curl -fsSLO …/install.sh`, relisez-le, puis `bash install.sh`.

L'installeur ajoute `~/.kepler/bin` à votre `PATH`, mais le shell depuis lequel vous l'avez lancé
ne le sait pas encore — `kepler` répondrait `command not found`. Chargez-le, puis démarrez :

```bash
source ~/.zshrc     # ou ~/.bashrc · ~/.config/fish/config.fish
kepler start        # build au premier lancement, démarre les services, ouvre la fenêtre
kepler seed         # optionnel : installe la bibliothèque de personas de départ
```

Ouvrir un nouveau terminal marche aussi bien : la ligne de `PATH` est lue au démarrage.
L'installeur affiche la commande `source` exacte pour votre shell en fin d'exécution.

`start` démarre le serveur agent (`:4001`) et l'app web (premier port libre depuis `4000`) en services d'arrière-plan et ouvre la fenêtre desktop. L'accès GitHub vient de votre session `gh` — **il n'y a rien d'autre à configurer.**

### Les cinq premières minutes

1. **Settings → chemins locaux des repos** — indiquez à Kepler l'un de vos repos.
2. `kepler seed` — récupérez les personas de départ (ou écrivez les vôtres dans **Personas**).
3. **Settings → GitHub Projects** — connectez un board Project V2 pour allumer le kanban.
4. Ouvrez un projet dans la sidebar, cliquez **+**, choisissez une persona et un mode de lancement → vous êtes dans le Workbench.
5. Collez l'URL d'une issue GitHub au lancement pour donner à l'agent tout son contexte.

### CLI

| Commande                | Rôle                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `kepler start`          | Build (si besoin), lance les services, ouvre la fenêtre                |
| `kepler stop`           | Arrête l'agent, l'app web et la fenêtre desktop                        |
| `kepler restart`        | Stop puis start — à utiliser pour appliquer une mise à jour            |
| `kepler status`         | Chaque service (agent / web / desktop) avec pid et URL                 |
| `kepler logs [service]` | Suit les logs — tous, ou l'un de `agent` / `web` / `desktop`           |
| `kepler update`         | Récupère le dernier `main`, réinstalle, rebuild, rafraîchit le lien    |
| `kepler seed`           | Installe les personas de départ (`--overwrite` pour les réinitialiser) |

L'état runtime (base SQLite, pids, logs) vit dans `~/.kepler/` et survit aux mises à jour. Les overrides optionnels vont dans `~/.kepler/.env` (ex. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

### Lancer depuis les sources (contributeurs)

```bash
git clone https://github.com/ludovicweber87/Kepler.git
cd Kepler
npm install
npm run dev
```

`npm run dev` lance les deux process via `concurrently` — l'app Next.js sur **:4000** et le serveur agent sur **:4001**, partageant la même base SQLite. Ne le lancez pas en même temps que `kepler start` (conflit sur le port `4001`). Puis ouvrez [http://localhost:4000](http://localhost:4000).

| Script                    | Rôle                                        |
| ------------------------- | ------------------------------------------- |
| `npm run dev`             | Les deux process, port web auto-sélectionné |
| `npm run dev:web`         | Next.js seul                                |
| `npm run dev:agent`       | Serveur agent seul                          |
| `npm run build` / `start` | Build de prod / serveur sur `:4000`         |
| `npm run lint` / `format` | ESLint / Prettier                           |
| `npm run test:web`        | Vitest (logique pure — lib & hooks)         |
| `npm run seed:personas`   | `kepler seed` depuis un checkout de dev     |

<br/>

## Architecture

Kepler tourne en **deux process partageant une base SQLite locale** :

- **App Next.js** (`src/`, `:4000`) — UI + API routes (proxy GitHub, CRUD SQLite). Joue les migrations Drizzle au démarrage.
- **Serveur agent** (`packages/agent/`, `:4001`) — git et worktrees, terminaux en WebSocket, le chat Agent SDK, le rédacteur de docs et ses outils MCP in-process, la génération des comptes-rendus quotidiens, et le stream SSE des notifications. Ouvre le **même** fichier SQLite.
- **Desktop** (`packages/desktop/`) — une fine fenêtre Electron autour du serveur local.
- **CLI** (`packages/cli/`) — la commande `kepler` : build, supervision des process, logs, mises à jour, seed.
- En dev, `scripts/dev-auto-port.mjs` démarre les deux via `concurrently` et injecte `KEPLER_DB_PATH` pour partager la base.

### Modèle de données

Tout ce qui est persisté vit dans une poignée de tables Drizzle — pas d'`user_id`, pas de RLS, mono-utilisateur par conception :

| Domaine       | Tables                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Agents        | `agent_sessions` · `agent_chat_messages` · `agent_activity_logs`                |
| Personas      | `personas` · `persona_repos`                                                    |
| Docs          | `docs` · `doc_categories` · `doc_category_links`                                |
| Daily         | `daily_recaps`                                                                  |
| GitHub        | `project_configs` · `project_boards` (cache du board)                           |
| Travail       | `tasks` · `notifications`                                                       |
| Configuration | `repo_paths` · `repo_settings` · `repo_scripts` · `app_settings` · `tab_orders` |

## Licence

MIT

</details>

---

<p align="center">
  <sub><strong>Kepler 1.0</strong> — built with obsessive attention to developer experience.<br/>Because the best tool is the one that disappears.</sub>
</p>
