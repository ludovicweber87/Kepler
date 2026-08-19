<p align="center">
  <img src="public/logo.svg" alt="Kepler" width="280" />
</p>

<p align="center">
  <strong>Several AI agents on one project.</strong><br/>
  An app that runs on your Mac and gives every Claude agent its own copy of the code.
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

When you start an AI agent from your terminal, it works inside your project folder, on the branch you happen to be on. So you can only run one at a time: two agents would edit the same files at once and get in each other's way.

You therefore wait for the first to finish before starting the next. And while it works, you watch text scroll past in a terminal, without really knowing which files it changed or how far along it is.

## What Kepler is

Kepler is an app that runs on your Mac. It launches several Claude agents on your projects, **each in its own copy of the code**, and shows you at all times what each one is doing.

It also remembers your instructions from one run to the next, can start an agent straight from a GitHub issue, and writes up what happened in a repository each day.

There is no account to create and no API key to paste. GitHub access reuses the `gh` login you already have on your machine, everything Kepler stores sits in a single file on your disk, and the only outbound calls go to GitHub and to Claude.

<br/>

## What Kepler does

<table>
<tr><td width="33%"><h3>🌳 One copy of the project per agent</h3></td><td>

Git can create what it calls a **worktree**: a second folder holding your project, checked out on another branch, but tied to the same repository and the same history. Kepler creates one per agent, under `.worktrees/`, automatically.

Two agents therefore never touch the same files. You can run five of them on five different subjects, and the folder you work in yourself is left alone. The sidebar lists your projects, their worktrees and their sessions, with a dot on any agent waiting for you.

You choose how to start: a fresh worktree on a new branch, the branch you are already on, an existing branch (local or remote), or a plain folder with no project and no branch at all.

</td></tr>
<tr><td><h3>🎭 Your instructions, written down once</h3></td><td>

A **persona** is a form you fill in once: a name, a role, the instructions the agent must follow, which Claude model to use, how hard it should think, and whether it may change files without asking you first.

You pick one when you start an agent, and it begins with all of that in mind. A persona can be limited to certain repositories or available everywhere, and you can switch persona mid-conversation — the agent is told, and the discussion carries on where it left off.

Ten are included, one `kepler seed` away: _Architecte Full-stack_, _Product Owner_, _Data Analyst_, _Développeur_, _Reviewer_, _The Debugger_, _The Legend_, _Growth_, _Pixelsmith_ and _Video game Engineer_.

</td></tr>
<tr><td><h3>📚 Documentation you fix by talking to it</h3></td><td>

You describe a subject and choose whether the agent should draw on general knowledge or read one of your repositories. You then set the level, the length and the format, and it writes the page in Markdown while you do something else.

Each document then has **its own conversation**, shown next to the text. You ask a question, or ask for a correction, and the agent edits the document directly. It only rewrites a passage it has quoted word for word, and refuses to guess when the request is ambiguous. One-click refinements are there too: _Shorter_, _Add examples_, _More technical_, _Simplify_.

</td></tr>
<tr><td><h3>🔗 An agent that starts from a GitHub task</h3></td><td>

On GitHub, an **issue** is a task written up in your repository: a title, a description, a discussion. Paste its address when you start the agent. Kepler reads the title and the description, hands them over as the starting point, creates the branch and the worktree, then comments on the issue so the team can see the work has begun.

Around that: a board of your issues where dragging a card also changes the status on GitHub, the list of your pull requests with the result of their automated tests and a button to merge, and issues drafted by an agent from a single sentence. Once a pull request is merged, the linked issue moves on by itself and the worktree is put away.

</td></tr>
<tr><td><h3>📅 The day's write-up, done for you</h3></td><td>

Kepler gathers what happened in a repository over a day: the commits on every branch, the pull requests, and what the agents did. An agent turns that into a few sentences in the first person.

These write-ups appear on a calendar. Click a day and you read the text and, below it, the detailed list it was built from. Enough to prepare a standup without digging through git history. You can generate, regenerate or delete any day.

</td></tr>
</table>

<br/>

## Feature tour

### Work with agents

**🛠️ The working screen** — this is where you spend your time. The conversation with the agent takes the left-hand side. On the right, four tabs show you the files it changed, its activity log, the linked issue and a file explorer; a file you open becomes a tab of its own. Below that, one or more terminals open up (`⌘J`), on a split you can drag.

**🤖 A real conversation** — Kepler does not drive a terminal on your behalf: it talks to Claude through the official Agent SDK. Every tool the agent uses shows up as a card, you grant permissions with one click, and it can ask you a question in the middle of its work. You pick the model and how hard it should think as you go.

**🏷️ Sessions you can rename** — the name of a session is independent from the git branch, so renaming one never touches git. If you leave the branch name empty when you start, Kepler names it from your first message (`feat/…`, `fix/…`), and a name you set by hand is never overwritten afterwards.

**📈 A log you can read** — instead of pages of raw output, Kepler sums up what the agent did: the decisions it took, the files it created or changed, the commits, what blocked it, and a recap once the work is done.

**🔔 It tells you** — when an agent finishes, fails, or is waiting on your answer, a notification arrives straight away, with a sound and a system notification. So you can start an agent and go do something else. Notifications are de-duplicated and track what you have already read.

**⚡ Your commands as buttons** — declare the commands you type all the time (tests, linter, dev server) and they appear as buttons at the top of the screen. Each one opens in a terminal, or goes to the agent as a message.

### Manage the work

**📋 A board of your issues** — the issues and pull requests assigned to you, laid out in columns you can drag cards between. Moving a card changes the status on GitHub too. One tab per repository, in an order you set. The board is cached on your disk, so it appears instantly and only calls GitHub when you refresh — no rate-limit surprises.

**✍️ Issues drafted for you** — describe the task in one plain sentence, an agent writes a proper title and description, and you create it on GitHub in one click. Available from the issues page and from a task.

**✅ Tasks** — a personal to-do list, editable in place. A task can carry a due date, whose colour warns you as the deadline approaches, be pinned to the top, point to a GitHub issue, or create one. The number of overdue tasks shows in the sidebar.

**🔃 Pull requests** — every open pull request across your repositories in one view, with its diff size, reviewers, labels and the result of its automated tests. Merging from here also moves the linked issue on and puts the worktree away.

**🗄️ Archived sessions** — finished work stays readable. You can bring a session back to carry on, or delete it — the worktree alone, or the worktree and its branch.

### Make it yours

**⚙️ Settings per repository** — for each project you set the files to copy into every new worktree (your `.env`, for instance), a script to run when the worktree is created, another to run before it is archived, the wording the agent uses to open a pull request, the column a merged issue should move to, and the command buttons for that repo.

**🎨 Appearance** — seven colour themes (four dark, three light) and a fully adjustable palette if none of them suits you. Fonts and sizes are set separately for the app and the terminal.

**🧑‍💻 Your editor, one click away** — open any worktree in VS Code, Cursor, Windsurf, Zed, IntelliJ, WebStorm, PhpStorm, PyCharm or Sublime Text.

**🌍 Five languages** — the whole interface in English, French, Spanish, German and Portuguese.

<br/>

## Why Kepler?

| Without Kepler                                           | With Kepler                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| One agent at a time, since they share your files         | **As many agents as you like**, each in its own copy of the project |
| You re-explain your conventions at every launch          | Your instructions are saved in a **persona** and reused             |
| You copy the issue description into the prompt           | Kepler **reads the issue** and hands it to the agent at launch      |
| You go back to the terminal to see whether it's done     | A **notification** tells you the moment it finishes or needs you    |
| Text scrolling past, and you guess what changed          | The **list of changed files** and a log of the decisions taken      |
| Documentation you have to open and fix by hand           | Docs you **ask** for a correction, and they update themselves       |
| "What did I do on Tuesday?" — and you reread the git log | The **day's write-up** is already there, on a calendar              |

### Everything runs on your machine

Kepler asks you for no password and no key: it reuses the login of `gh`, GitHub's own command-line tool, which you have already installed and connected. Everything it stores — sessions, conversations, personas, documents, write-ups, tasks — sits in a single database file at your place, so there is no server and nothing to host. It only talks to GitHub, for your issues and pull requests, and to Claude, for the agents. Your code goes nowhere else.

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

1. In **Settings**, say where your projects live on disk.
2. Run `kepler seed` to get the ten included personas, or write your own under **Personas**.
3. Still in **Settings**, connect a GitHub project board if you want the issue board.
4. In the left bar, hit **+** on a project, pick a persona and choose how to start. You land on the working screen.
5. To start from an existing task, paste the address of a GitHub issue at launch.

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

Quand vous lancez un agent IA depuis votre terminal, il travaille dans le dossier de votre projet, sur la branche où vous vous trouvez. Vous ne pouvez donc en lancer qu'un seul à la fois : deux agents modifieraient les mêmes fichiers en même temps, et se marcheraient dessus.

Vous attendez donc que le premier ait fini pour démarrer le suivant. Et pendant qu'il travaille, vous voyez défiler du texte dans un terminal, sans vraiment savoir quels fichiers il a changés ni où il en est.

## Ce qu'est Kepler

Kepler est une application qui tourne sur votre Mac. Elle lance plusieurs agents Claude sur vos projets, **chacun dans sa propre copie du code**, et vous montre en permanence ce que chacun est en train de faire.

Elle retient aussi vos consignes d'une fois sur l'autre, sait démarrer un agent directement depuis une issue GitHub, et rédige le compte-rendu de ce qui s'est passé chaque jour dans un dépôt.

Il n'y a aucun compte à créer ni clé d'API à renseigner. L'accès GitHub réutilise la connexion `gh` que vous avez déjà sur votre machine, tout ce que Kepler enregistre tient dans un seul fichier sur votre disque, et les seuls appels sortants vont vers GitHub et vers Claude.

<br/>

## Ce que fait Kepler

<table>
<tr><td width="33%"><h3>🌳 Une copie du projet par agent</h3></td><td>

Git sait créer ce qu'on appelle un **worktree** : un deuxième dossier contenant votre projet, positionné sur une autre branche, mais rattaché au même dépôt et au même historique. Kepler en crée un par agent, dans `.worktrees/`, automatiquement.

Deux agents ne touchent donc jamais aux mêmes fichiers. Vous pouvez en lancer cinq sur cinq sujets différents, et le dossier dans lequel vous travaillez, vous, n'est pas modifié. La barre de gauche liste vos projets, leurs worktrees et leurs sessions, avec une pastille sur tout agent qui vous attend.

Vous choisissez comment démarrer : un worktree neuf sur une nouvelle branche, la branche où vous êtes déjà, une branche existante (locale ou distante), ou un simple dossier sans projet ni branche.

</td></tr>
<tr><td><h3>🎭 Vos consignes, écrites une fois pour toutes</h3></td><td>

Une **persona** est une fiche que vous remplissez une seule fois : un nom, un rôle, les consignes que l'agent doit suivre, le modèle Claude à utiliser, son niveau de réflexion, et le droit qu'il a — ou non — de modifier des fichiers sans vous demander.

Vous la choisissez au lancement, et l'agent démarre avec tout cela en tête. Une persona peut être réservée à certains dépôts ou disponible partout, et vous pouvez en changer en pleine conversation : l'agent est prévenu, et la discussion continue là où elle en était.

Dix sont fournies, à un `kepler seed` de distance : _Architecte Full-stack_, _Product Owner_, _Data Analyst_, _Développeur_, _Reviewer_, _The Debugger_, _The Legend_, _Growth_, _Pixelsmith_ et _Video game Engineer_.

</td></tr>
<tr><td><h3>📚 De la documentation qui se corrige en discutant</h3></td><td>

Vous décrivez un sujet et vous choisissez si l'agent doit s'appuyer sur ses connaissances générales ou lire l'un de vos dépôts. Vous réglez ensuite le niveau, la longueur et le format, et il rédige la page en Markdown pendant que vous faites autre chose.

Chaque document a ensuite **sa propre conversation**, affichée à côté du texte. Vous posez une question, ou vous demandez une correction, et l'agent modifie le document directement. Il ne réécrit qu'un passage qu'il a cité mot pour mot, et refuse de deviner quand la demande est ambiguë. Des retouches en un clic sont aussi là : _Plus court_, _Ajouter des exemples_, _Plus technique_, _Simplifier_.

</td></tr>
<tr><td><h3>🔗 Un agent qui part d'une tâche GitHub</h3></td><td>

Sur GitHub, une **issue** est une tâche décrite dans votre dépôt : un titre, une description, une discussion. Collez son adresse au moment de lancer l'agent. Kepler lit le titre et la description, les lui donne comme point de départ, crée la branche et le worktree, puis écrit un commentaire sur l'issue pour que l'équipe voie que le travail a commencé.

Autour de ça : un tableau de vos issues où déplacer une carte change aussi le statut sur GitHub, la liste de vos pull requests avec le résultat de leurs tests automatiques et un bouton pour fusionner, et des issues rédigées par un agent à partir d'une seule phrase. Une fois la pull request fusionnée, l'issue liée avance d'elle-même et le worktree est rangé.

</td></tr>
<tr><td><h3>📅 Le compte-rendu de la journée, écrit pour vous</h3></td><td>

Kepler rassemble ce qui s'est passé dans un dépôt sur une journée : les commits de toutes les branches, les pull requests, et ce que les agents ont fait. Un agent en tire quelques phrases à la première personne.

Ces comptes-rendus s'affichent sur un calendrier. En cliquant sur un jour, vous lisez le texte et, en dessous, la liste détaillée qui a servi à l'écrire. De quoi préparer un point d'équipe sans fouiller dans l'historique git. Vous pouvez générer, régénérer ou supprimer n'importe quel jour.

</td></tr>
</table>

<br/>

## Tour des fonctionnalités

### Travailler avec les agents

**🛠️ L'écran de travail** — c'est là que vous passez votre temps. La conversation avec l'agent occupe la partie gauche. À droite, quatre onglets vous montrent les fichiers qu'il a modifiés, son journal d'activité, l'issue liée et un explorateur de fichiers ; un fichier que vous ouvrez devient un onglet à part. En dessous s'ouvrent un ou plusieurs terminaux (`⌘J`), sur une séparation que vous pouvez déplacer.

**🤖 Une vraie conversation** — Kepler ne pilote pas un terminal à votre place : il parle à Claude par l'Agent SDK officiel. Chaque outil que l'agent utilise apparaît sous forme de carte, vous accordez les permissions d'un clic, et il peut vous poser une question au milieu de son travail. Vous choisissez le modèle et son niveau de réflexion au fil de l'eau.

**🏷️ Des sessions que vous pouvez renommer** — le nom d'une session est indépendant de la branche git, donc le changer ne touche jamais à git. Si vous laissez le nom de branche vide au lancement, Kepler la nomme d'après votre premier message (`feat/…`, `fix/…`), et un nom que vous avez posé à la main n'est jamais écrasé ensuite.

**📈 Un journal lisible** — plutôt que des pages de sortie brute, Kepler résume ce que l'agent a fait : les décisions prises, les fichiers créés ou modifiés, les commits, les blocages rencontrés, et un récapitulatif une fois le travail terminé.

**🔔 Il vous prévient** — quand un agent a terminé, a échoué, ou attend votre réponse, une notification arrive tout de suite, avec un son et une notification système. Vous pouvez donc lancer un agent et aller faire autre chose. Les notifications sont dédupliquées et gardent trace de ce que vous avez déjà lu.

**⚡ Vos commandes en boutons** — déclarez les commandes que vous tapez tout le temps (tests, linter, serveur de dev) et elles apparaissent en boutons en haut de l'écran. Chacune s'ouvre dans un terminal, ou part comme message à l'agent.

### Piloter le travail

**📋 Un tableau de vos issues** — les issues et pull requests qui vous sont assignées, réparties en colonnes entre lesquelles vous déplacez les cartes. Déplacer une carte change aussi le statut sur GitHub. Un onglet par dépôt, dans l'ordre que vous fixez. Le tableau est mis en cache sur votre disque : il s'affiche instantanément et n'appelle GitHub que lorsque vous rafraîchissez — fini les surprises de rate-limit.

**✍️ Des issues rédigées pour vous** — décrivez la tâche en une phrase, un agent en rédige le titre et la description, et vous la créez sur GitHub en un clic. Disponible depuis la page des issues et depuis une tâche.

**✅ Tâches** — une liste personnelle, modifiable sur place. Une tâche peut porter une échéance, dont la couleur vous alerte à l'approche de la date, être épinglée en haut, pointer vers une issue GitHub, ou en créer une. Le nombre de tâches en retard s'affiche dans la barre de gauche.

**🔃 Pull requests** — toutes vos pull requests ouvertes, tous dépôts confondus, dans une seule vue, avec la taille du diff, les relecteurs, les labels et le résultat de leurs tests automatiques. Fusionner depuis ici fait aussi avancer l'issue liée et range le worktree.

**🗄️ Sessions archivées** — le travail terminé reste consultable. Vous pouvez ramener une session pour reprendre, ou la supprimer — le worktree seul, ou le worktree et sa branche.

### Le régler à votre main

**⚙️ Réglages par dépôt** — pour chaque projet, vous indiquez les fichiers à recopier dans chaque nouveau worktree (votre `.env`, par exemple), un script à jouer à la création du worktree, un autre avant son archivage, les messages types que l'agent utilise pour ouvrir une pull request, la colonne vers laquelle une issue fusionnée doit avancer, et les boutons de commandes de ce dépôt.

**🎨 Apparence** — sept thèmes de couleurs (quatre sombres, trois clairs) et une palette entièrement réglable si aucun ne vous convient. Les polices et les tailles se règlent séparément pour l'application et le terminal.

**🧑‍💻 Votre éditeur à un clic** — ouvrez n'importe quel worktree dans VS Code, Cursor, Windsurf, Zed, IntelliJ, WebStorm, PhpStorm, PyCharm ou Sublime Text.

**🌍 Cinq langues** — toute l'interface en anglais, français, espagnol, allemand et portugais.

<br/>

## Pourquoi Kepler ?

| Sans Kepler                                                   | Avec Kepler                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Un seul agent à la fois, puisqu'ils partagent vos fichiers    | **Autant d'agents que vous voulez**, chacun dans sa copie du projet      |
| Vous réexpliquez vos conventions à chaque lancement           | Vos consignes sont enregistrées dans une **persona** et réutilisées      |
| Vous recopiez la description de l'issue dans le prompt        | Kepler **lit l'issue** et la donne à l'agent au lancement                |
| Vous revenez voir le terminal pour savoir si c'est fini       | Une **notification** vous prévient dès que l'agent a fini ou vous attend |
| Du texte qui défile, et vous devinez ce qui a changé          | La **liste des fichiers modifiés** et un journal des décisions           |
| Une documentation qu'il faut ouvrir et corriger à la main     | Une doc à qui vous **demandez** la correction, elle se met à jour        |
| « J'ai fait quoi mardi ? » — et vous relisez l'historique git | Le **compte-rendu du jour** est déjà écrit, sur un calendrier            |

### Tout tourne sur votre machine

Kepler ne vous demande ni mot de passe ni clé : il réutilise la connexion de `gh`, l'outil en ligne de commande officiel de GitHub, que vous avez déjà installé et connecté. Tout ce qu'il enregistre — sessions, conversations, personas, documents, comptes-rendus, tâches — tient dans un seul fichier de base de données chez vous, donc il n'y a pas de serveur et rien à héberger. Il ne parle qu'à GitHub, pour vos issues et vos pull requests, et à Claude, pour les agents. Votre code ne part nulle part ailleurs.

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

1. Dans **Settings**, indiquez où se trouvent vos projets sur le disque.
2. Lancez `kepler seed` pour récupérer les dix personas fournies, ou écrivez les vôtres dans **Personas**.
3. Toujours dans **Settings**, connectez un board GitHub si vous voulez le tableau des issues.
4. Dans la barre de gauche, cliquez **+** sur un projet, choisissez une persona et la façon de démarrer. Vous arrivez sur l'écran de travail.
5. Pour partir d'une tâche existante, collez l'adresse d'une issue GitHub au lancement.

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
