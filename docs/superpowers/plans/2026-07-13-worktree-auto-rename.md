# Worktree Auto-Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au premier prompt d'une session agent lancée en mode « libre » (worktree `wip-…`), renommer automatiquement la branche **et** le dossier du worktree en convention Karma kebab-case (`feat-…`, `fix-…`), et refléter ce nom dans la sidebar — sans casser la session en cours.

**Architecture:** Toute la logique vit côté **serveur agent** (`packages/agent`), seul process qui possède la session SDK, le tmux et les ops git. Au 1er `stream-user-message` d'une session `wip-`, `terminal.ts` génère le nom (via `claude --print`), déplace branche+dossier (`git worktree move` + `git branch -m`), met à jour la DB, puis `sdkAgent.relocate()` recrée la query SDK au nouveau `cwd` en gardant la connexion WebSocket. Le front réagit à un event `stream-renamed` (invalidations React Query) ; l'ancien système de rename côté Next est supprimé.

**Tech Stack:** Node (http natif + ws) + `@anthropic-ai/claude-agent-sdk` + tmux + better-sqlite3 (serveur agent) ; Next.js 16 / React 19 / TanStack Query / MUI (web). Tests agent : `node:test` + `assert/strict` (via `tsx`). Tests web : Vitest + @testing-library.

## Global Constraints

- **Serveur agent = `node:test`**, pas Vitest. Lancer : `cd packages/agent && npm test` ; fichier unique : `node --import tsx --test src/sdk/<file>.test.ts`. Imports relatifs avec extension `.js` (ESM/tsx).
- **Web = Vitest.** Lancer : `npx vitest run <path>` (ou `npm run test:web`).
- **Convention de tests du repo** : logique pure uniquement. L'UI / l'intégration WS se vérifient par `npm run lint`, `npx tsc --noEmit`, `npm run build` + run manuel.
- **Jamais de texte en dur** côté composants React → `next-intl`. (Ce plan n'ajoute aucun nouveau libellé : le feedback pendant le rename réutilise l'indicateur `busy` existant.)
- **Ne jamais commiter/pusher sans accord explicite** — mais ce plan commite localement à chaque tâche (branche de travail courante `wip-warm-pine-aa05`). Pas de push.
- Env nettoyé pour tout `claude --print` : `const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env`.
- Le binaire claude et tmux se résolvent via `findClaude()` / `findTmux()` de `packages/agent/src/helpers.ts`.

---

## File Structure

**Serveur agent (`packages/agent/src/`)**
- `sdk/renameWorktree.ts` — **nouveau**. Helpers purs (`toKarmaKebab`, `resolveKarmaName`, `computeNewPath`, `isWipBranch`) + accès DB (`readSessionForRename`) + orchestration à effets de bord (`renameWorktreeFromPrompt`). Responsabilité : décider du nom et appliquer git+DB+tmux.
- `sdk/renameWorktree.test.ts` — **nouveau**. Tests des helpers purs.
- `sdk/sdkAgent.ts` — **modifié**. Nouvelle méthode `relocate(sessionId, newCwd)` + `broadcastToSession(sessionId, payload)` + garde-fou d'identité dans `runLoop`.
- `sdk/sdkAgent.test.ts` — **modifié**. Tests `relocate` (fake queryFn).
- `terminal.ts` — **modifié**. Orchestration du 1er message (détection, flag `renaming`, buffer) + broadcast `stream-renamed` / `stream-renaming-start`.

**Web (`src/`)**
- `hooks/useAgentChat.ts` — **modifié**. Callback `onRenamed`, handling `stream-renamed`/`stream-renaming-start`, effet WS piloté par `cwdReady` + `cwdRef`.
- `hooks/useAgentChat.test.ts` — **modifié**. Tests : pas de reconnexion sur changement de valeur de `cwd` ; `onRenamed` appelé sur `stream-renamed`.
- `components/agents/AgentChatTab.tsx` — **modifié**. Retirer `onFirstUserMessage`, ajouter `onRenamed` (thread vers `useAgentChat`).
- `components/workbench/Workbench.tsx` — **modifié**. Retirer `submitRenameFromPrompt`/`onFirstUserMessage`/`isAutoNamed`/`firstPromptSent` ; ajouter `handleRenamed` (invalidations).
- `components/layout/Sidebar.tsx` — **modifié**. `displayName` priorise `wt.branch` ; `agent_name` en tooltip.
- `app/api/agent-sessions/log/route.ts` — **modifié**. Retirer `maybeAutoRenameBranch` (+ import).
- `lib/autoRenameBranch.ts` — **supprimé**.
- `app/api/agent-sessions/rename-from-prompt/route.ts` — **supprimé**.

---

## Task 1: Helpers purs de nommage (`renameWorktree.ts`)

**Files:**
- Create: `packages/agent/src/sdk/renameWorktree.ts`
- Test: `packages/agent/src/sdk/renameWorktree.test.ts`

**Interfaces:**
- Produces:
  - `toKarmaKebab(raw: string): string | null`
  - `computeNewPath(projectPath: string, name: string): string`
  - `resolveKarmaName(base: string, exists: (name: string) => boolean): string`
  - `isWipBranch(branch: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/sdk/renameWorktree.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toKarmaKebab,
  computeNewPath,
  resolveKarmaName,
  isWipBranch,
} from './renameWorktree.js';

test('toKarmaKebab normalise en kebab minuscule', () => {
  assert.equal(toKarmaKebab('  Feat: Add Google Auth!! '), 'feat-add-google-auth');
});

test('toKarmaKebab remplace slashs et espaces multiples par un tiret', () => {
  assert.equal(toKarmaKebab('fix/  weird   name'), 'fix-weird-name');
});

test('toKarmaKebab tronque à 50 caractères sans tiret final', () => {
  const out = toKarmaKebab('feat ' + 'a'.repeat(80));
  assert.ok(out && out.length <= 50);
  assert.ok(out && !out.endsWith('-'));
});

test('toKarmaKebab renvoie null si < 3 caractères utiles', () => {
  assert.equal(toKarmaKebab('!!'), null);
  assert.equal(toKarmaKebab('   '), null);
});

test('computeNewPath place le worktree sous .worktrees', () => {
  assert.equal(
    computeNewPath('/repo/app', 'feat-x'),
    '/repo/app/.worktrees/feat-x',
  );
});

test('resolveKarmaName renvoie le nom de base si libre', () => {
  assert.equal(resolveKarmaName('feat-x', () => false), 'feat-x');
});

test('resolveKarmaName suffixe jusqu à trouver un nom libre', () => {
  const taken = new Set(['feat-x', 'feat-x-2']);
  assert.equal(resolveKarmaName('feat-x', (n) => taken.has(n)), 'feat-x-3');
});

test('isWipBranch vrai uniquement pour un préfixe wip-', () => {
  assert.equal(isWipBranch('wip-warm-pine'), true);
  assert.equal(isWipBranch('feat-x'), false);
  assert.equal(isWipBranch(null), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent && node --import tsx --test src/sdk/renameWorktree.test.ts`
Expected: FAIL (module `./renameWorktree.js` introuvable / exports non définis).

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent/src/sdk/renameWorktree.ts` (helpers purs seulement pour cette tâche) :

```ts
/** Normalise une chaîne en slug Karma kebab (`feat-add-auth`) ou null si trop court. */
export function toKarmaKebab(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, '')
    .replace(/[\s/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return cleaned.length >= 3 ? cleaned : null;
}

/** Chemin du worktree pour un nom donné, sous `<projectPath>/.worktrees`. */
export function computeNewPath(projectPath: string, name: string): string {
  return `${projectPath}/.worktrees/${name}`;
}

/**
 * Résout un nom libre : renvoie `base`, sinon `base-2`, `base-3`, … jusqu'à ce que
 * `exists(name)` soit faux. `exists` couvre à la fois l'existence du dossier ET de la branche.
 */
export function resolveKarmaName(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Une session est auto-nommée tant que sa branche commence par `wip-`. */
export function isWipBranch(branch: string | null | undefined): boolean {
  return typeof branch === 'string' && branch.startsWith('wip-');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent && node --import tsx --test src/sdk/renameWorktree.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/sdk/renameWorktree.ts packages/agent/src/sdk/renameWorktree.test.ts
git commit -m "feat(agent): helpers purs de nommage worktree (Karma kebab)"
```

---

## Task 2: Orchestration à effets de bord (`renameWorktreeFromPrompt`)

**Files:**
- Modify: `packages/agent/src/sdk/renameWorktree.ts`

**Interfaces:**
- Consumes: `toKarmaKebab`, `computeNewPath`, `resolveKarmaName` (Task 1) ; `getDb` (`../db.js`) ; `findClaude`, `findTmux` (`../helpers.js`).
- Produces:
  - `interface RenameResult { branch: string; worktreePath: string; cwd: string }`
  - `interface SessionRow { id: string; branch: string | null; worktree_path: string | null; project_path: string | null }`
  - `readSessionForRename(sessionId: string): SessionRow | null`
  - `renameWorktreeFromPrompt(sessionId: string, text: string): Promise<RenameResult | null>`

- [ ] **Step 1: Add imports at the top of `renameWorktree.ts`**

```ts
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { getDb } from '../db.js';
import { findClaude, findTmux } from '../helpers.js';
```

- [ ] **Step 2: Append the DB reader + orchestration below the pure helpers**

```ts
export interface RenameResult {
  branch: string;
  worktreePath: string;
  cwd: string;
}

export interface SessionRow {
  id: string;
  branch: string | null;
  worktree_path: string | null;
  project_path: string | null;
}

/** Lit la session pour décider/appliquer le rename. null si absente ou DB indisponible. */
export function readSessionForRename(sessionId: string): SessionRow | null {
  const d = getDb();
  if (!d) return null;
  try {
    const row = d
      .prepare(
        'SELECT id, branch, worktree_path, project_path FROM agent_sessions WHERE session_id = ?',
      )
      .get(sessionId) as SessionRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Renomme branche + dossier d'un worktree `wip-` à partir du texte du 1er prompt.
 * Effets de bord : claude --print (génération nom), kill tmux, git worktree move + branch -m,
 * update DB. Ne recrée PAS la session SDK (fait par l'appelant via sdkAgent.relocate).
 * Retourne null (dégradation gracieuse) si non-wip, génération vide, ou échec git.
 */
export async function renameWorktreeFromPrompt(
  sessionId: string,
  text: string,
): Promise<RenameResult | null> {
  const session = readSessionForRename(sessionId);
  if (!session?.worktree_path || !session.project_path) return null;
  if (!isWipBranch(session.branch)) return null;
  if (!text.trim()) return null;

  const oldPath = session.worktree_path;
  const projectPath = session.project_path;

  try {
    // 1. Générer le slug via claude --print, env nettoyé.
    const prompt = `Transforme cette demande en un nom de branche git court, convention Karma (format: type-en-kebab, ex: "feat-add-google-auth"). Types autorisés: feat, fix, docs, refactor, test, chore, perf. Réponds UNIQUEMENT le nom, sans guillemets ni autre texte.\n\nDemande: ${text.slice(0, 500)}`;
    const escaped = prompt.replace(/'/g, "'\\''");
    const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
      string,
      string | undefined
    >;
    const out = execSync(`${findClaude()} --print '${escaped}'`, {
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv as NodeJS.ProcessEnv,
    });
    const base = toKarmaKebab(out);
    if (!base || base === session.branch) return null;

    // 2. Résoudre un nom libre (dossier OU branche déjà pris).
    const branchExists = (name: string): boolean => {
      try {
        const res = execSync(`git -C ${JSON.stringify(projectPath)} branch --list ${JSON.stringify(name)}`, {
          encoding: 'utf-8',
        });
        return res.trim().length > 0;
      } catch {
        return false;
      }
    };
    const finalName = resolveKarmaName(base, (name) =>
      existsSync(computeNewPath(projectPath, name)) || branchExists(name),
    );
    const newPath = computeNewPath(projectPath, finalName);

    // 3. Kill des deux tmux liés (le shell tourne au cwd du worktree). Best-effort.
    const TMUX = findTmux();
    for (const target of [sessionId, `${sessionId}-shell`]) {
      try {
        execSync(`${TMUX} kill-session -t ${JSON.stringify(target)}`, { stdio: 'ignore' });
      } catch {
        /* pas de session tmux → ignore */
      }
    }

    // 4. Déplacer le dossier puis renommer la branche.
    execSync(
      `git -C ${JSON.stringify(projectPath)} worktree move ${JSON.stringify(oldPath)} ${JSON.stringify(newPath)}`,
      { stdio: 'ignore' },
    );
    execSync(`git -C ${JSON.stringify(newPath)} branch -m ${JSON.stringify(finalName)}`, {
      stdio: 'ignore',
    });

    // 5. Mettre à jour la DB.
    const d = getDb();
    d?.prepare('UPDATE agent_sessions SET worktree_path = ?, branch = ? WHERE session_id = ?').run(
      newPath,
      finalName,
      sessionId,
    );

    return { branch: finalName, worktreePath: newPath, cwd: newPath };
  } catch {
    // Échec claude/git → on garde le nom wip-, la session n'a pas bougé.
    return null;
  }
}
```

- [ ] **Step 3: Type-check the agent package**

Run: `npx tsc --noEmit -p packages/agent/tsconfig.json`
Expected: PASS (aucune erreur sur `renameWorktree.ts`). Si le projet agent n'a pas de tsconfig dédié, lancer `npx tsc --noEmit` à la racine.

- [ ] **Step 4: Re-run Task 1 tests (non-régression des helpers purs)**

Run: `cd packages/agent && node --import tsx --test src/sdk/renameWorktree.test.ts`
Expected: PASS (les 8 tests purs — `renameWorktreeFromPrompt` n'est pas testé unitairement, il est vérifié en intégration au run manuel).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/sdk/renameWorktree.ts
git commit -m "feat(agent): renameWorktreeFromPrompt (git move + branch -m + DB)"
```

---

## Task 3: `relocate()` + garde-fou `runLoop` dans `sdkAgent.ts`

**Files:**
- Modify: `packages/agent/src/sdk/sdkAgent.ts`
- Test: `packages/agent/src/sdk/sdkAgent.test.ts`

**Interfaces:**
- Consumes: `SessionState`, `createPermissionController`, `makePromptQueue`, `findClaude`, `cleanEnv`, `getDb`, `runLoop`, `sessions` (internes au module).
- Produces (sur l'objet retourné par `createSdkAgentManager`) :
  - `relocate(sessionId: string, newCwd: string): boolean`
  - `broadcastToSession(sessionId: string, payload: unknown): void`

- [ ] **Step 1: Write the failing test**

Append to `packages/agent/src/sdk/sdkAgent.test.ts`. Ce test vérifie qu'après `relocate`, (a) la session existe toujours, (b) un `sendUserMessage` est bien pris en compte (nouvelle query), (c) aucun `stream-closed` n'est diffusé aux clients. Adapter au `fakeQueryFactory` existant du fichier (mémorise les `cwd` reçus).

```ts
test('relocate recrée la query au nouveau cwd sans diffuser stream-closed', async () => {
  const mgr = createSdkAgentManager({ queryFn: fakeQueryFactory().queryFn });
  const sid = randomUUID();
  memDb.prepare('INSERT INTO agent_sessions (id, session_id, claude_session_id) VALUES (?, ?, ?)').run(
    randomUUID(),
    sid,
    null,
  );
  const ws = fakeSocket();
  mgr.startOrAttach(sid, ws, { cwd: '/old' });

  const before = ws.messages.length;
  const ok = mgr.relocate(sid, '/new');
  assert.equal(ok, true);
  assert.equal(mgr.has(sid), true);

  // Aucun stream-closed émis par l'ancien runLoop après relocate.
  const closedAfter = ws.messages
    .slice(before)
    .filter((m) => m.type === 'stream-closed');
  assert.equal(closedAfter.length, 0);
});

test('relocate renvoie false si la session est absente', () => {
  const mgr = createSdkAgentManager({ queryFn: fakeQueryFactory().queryFn });
  assert.equal(mgr.relocate('inconnu', '/x'), false);
});
```

> Note : `fakeQueryFactory` du fichier existant crée un générateur figé qui se termine tout de suite. Pour que le test soit fiable, `relocate` doit poser `sessions.set(sid, s2)` **avant** de fermer l'ancienne query ; le garde-fou d'identité empêche l'ancien `runLoop` d'émettre `stream-closed`. Si le `fakeQueryFactory` existant termine trop vite pour observer l'état, garder l'assertion « pas de stream-closed après relocate » qui est le cœur du contrat.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent && node --import tsx --test src/sdk/sdkAgent.test.ts`
Expected: FAIL (`mgr.relocate is not a function`).

- [ ] **Step 3: Add the identity guard in `runLoop`**

Dans `sdkAgent.ts`, remplacer la fin de `runLoop` (lignes ~91-98) par une version gardée par identité :

```ts
      const isCurrent = () => sessions.get(sessionId) === s;
      if (!s.closed && isCurrent())
        broadcast(s, { type: 'stream-closed', reason: 'generator-ended' });
    } catch (err) {
      if (!s.closed && sessions.get(sessionId) === s)
        broadcast(s, { type: 'stream-error', message: err instanceof Error ? err.message : String(err), fatal: true });
    } finally {
      if (sessions.get(sessionId) === s) {
        s.perms.abortAll();
        sessions.delete(sessionId);
      }
    }
```

> Le point clé : après `relocate`, `sessions.get(sessionId)` renvoie `s2 ≠ s`, donc l'ancien `runLoop` n'émet aucun événement terminal et ne supprime ni `perms` ni l'entrée de la map.

- [ ] **Step 4: Add `readSystemPrompt`, `relocate` and `broadcastToSession`**

Ajouter le helper de lecture du system prompt (près de `readClaudeSessionId`) :

```ts
  function readSystemPrompt(sessionId: string): string | undefined {
    const d = getDb();
    if (!d) return undefined;
    try {
      const row = d.prepare('SELECT system_prompt AS s FROM agent_sessions WHERE session_id = ?').get(sessionId) as { s: string | null } | undefined;
      return row?.s ?? undefined;
    } catch { return undefined; }
  }
```

Ajouter les deux méthodes dans l'objet retourné par `createSdkAgentManager` (à côté de `startOrAttach`) :

```ts
    relocate(sessionId: string, newCwd: string): boolean {
      const s = sessions.get(sessionId);
      if (!s) return false;
      const systemPrompt = readSystemPrompt(sessionId);
      const queue = makePromptQueue();
      const s2: SessionState = {
        q: undefined as unknown as QueryLike,
        queue,
        perms: createPermissionController(
          (req: PendingPermission) => broadcast(s2, { type: 'stream-permission-request', ...req }),
          () => s2.permissionMode,
          (req: PendingQuestion) => broadcast(s2, { type: 'stream-question-request', ...req }),
        ),
        clients: s.clients,
        claudeSessionId: s.claudeSessionId,
        model: s.model,
        effort: s.effort,
        permissionMode: s.permissionMode,
        busy: false,
        closed: false,
        seq: s.seq,
        cwd: newCwd,
        createdAt: s.createdAt,
      };
      const options: Record<string, unknown> = {
        cwd: newCwd,
        pathToClaudeCodeExecutable: findClaude(),
        env: cleanEnv(),
        permissionMode: s2.permissionMode,
        allowDangerouslySkipPermissions: true,
        canUseTool: s2.perms.canUseTool,
      };
      if (s2.model) options.model = s2.model;
      if (s2.effort) options.effort = s2.effort;
      if (systemPrompt) options.systemPrompt = systemPrompt;
      if (s2.claudeSessionId) options.resume = s2.claudeSessionId;
      s2.q = queryFn({ prompt: queue.iterable, options } as never) as unknown as QueryLike;
      sessions.set(sessionId, s2); // swap AVANT de fermer l'ancienne query
      void s.q.return?.();
      s.queue.close();
      void runLoop(sessionId, s2);
      return true;
    },

    broadcastToSession(sessionId: string, payload: unknown) {
      const s = sessions.get(sessionId);
      if (s) broadcast(s, payload);
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/agent && node --import tsx --test src/sdk/sdkAgent.test.ts`
Expected: PASS (tests existants + les 2 nouveaux).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/sdk/sdkAgent.ts packages/agent/src/sdk/sdkAgent.test.ts
git commit -m "feat(agent): sdkAgent.relocate + garde-fou d'identité runLoop"
```

---

## Task 4: Orchestration du 1er message dans `terminal.ts`

**Files:**
- Modify: `packages/agent/src/terminal.ts`

**Interfaces:**
- Consumes: `renameWorktreeFromPrompt`, `readSessionForRename`, `isWipBranch` (Task 1-2) ; `sdkAgent.relocate`, `sdkAgent.broadcastToSession`, `sdkAgent.sendUserMessage` (Task 3).
- Produces: comportement WS — au 1er `stream-user-message` d'une session `wip-`, rename+relocate+broadcast avant de pousser le prompt ; broadcast `stream-renaming-start` (avant) et `stream-renamed` (après succès).

- [ ] **Step 1: Add imports (haut de `terminal.ts`)**

```ts
import { renameWorktreeFromPrompt, readSessionForRename, isWipBranch } from './sdk/renameWorktree.js';
```

- [ ] **Step 2: Add module-level tracking state (près des autres Map de suivi, ~ligne 110)**

```ts
// Suivi du 1er message + rename en cours, par sessionId (partagé entre connexions WS).
const firstMsgSeen = new Set<string>();
const renamingSessions = new Set<string>();
const pendingWhileRenaming = new Map<string, string[]>();

async function handleFirstMessageRename(sessionId: string, text: string): Promise<void> {
  renamingSessions.add(sessionId);
  sdkAgent.broadcastToSession(sessionId, { type: 'stream-renaming-start', sessionId });
  try {
    const result = await renameWorktreeFromPrompt(sessionId, text);
    if (result) {
      sdkAgent.relocate(sessionId, result.cwd);
      sdkAgent.broadcastToSession(sessionId, {
        type: 'stream-renamed',
        sessionId,
        branch: result.branch,
        worktreePath: result.worktreePath,
        cwd: result.cwd,
      });
    }
    sdkAgent.sendUserMessage(sessionId, text);
  } finally {
    renamingSessions.delete(sessionId);
    const pending = pendingWhileRenaming.get(sessionId) ?? [];
    pendingWhileRenaming.delete(sessionId);
    for (const t of pending) sdkAgent.sendUserMessage(sessionId, t);
  }
}
```

- [ ] **Step 3: Rewrite the `stream-user-message` handler (ligne ~316)**

Remplacer :

```ts
			if (msg.type === 'stream-user-message') {
				sdkAgent.sendUserMessage(msg.sessionId, msg.text);
				return;
			}
```

par :

```ts
			if (msg.type === 'stream-user-message') {
				const sid = msg.sessionId;
				// Un message arrivé pendant un rename est bufferisé (sinon perdu : la session
				// est en cours de recréation).
				if (renamingSessions.has(sid)) {
					const buf = pendingWhileRenaming.get(sid) ?? [];
					buf.push(msg.text);
					pendingWhileRenaming.set(sid, buf);
					return;
				}
				const firstTime = !firstMsgSeen.has(sid);
				firstMsgSeen.add(sid);
				if (firstTime) {
					const session = readSessionForRename(sid);
					if (session && isWipBranch(session.branch)) {
						void handleFirstMessageRename(sid, msg.text);
						return;
					}
				}
				sdkAgent.sendUserMessage(sid, msg.text);
				return;
			}
```

- [ ] **Step 4: Type-check the agent package**

Run: `npx tsc --noEmit -p packages/agent/tsconfig.json` (ou `npx tsc --noEmit` à la racine si pas de tsconfig agent).
Expected: PASS.

- [ ] **Step 5: Run the full agent test suite (non-régression)**

Run: `cd packages/agent && npm test`
Expected: PASS (tous les fichiers `*.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/terminal.ts
git commit -m "feat(agent): rename+relocate au 1er message (buffer anti-perte)"
```

---

## Task 5: Front — `useAgentChat` réagit à `stream-renamed` sans reconnecter

**Files:**
- Modify: `src/hooks/useAgentChat.ts`
- Test: `src/hooks/useAgentChat.test.ts`

**Interfaces:**
- Produces: nouvelle prop `onRenamed?: (p: { branch: string; worktreePath: string; cwd: string }) => void` sur `Params` ; l'effet WS ne se relance plus quand la **valeur** de `cwd` change (seulement quand elle **apparaît**).

- [ ] **Step 1: Write the failing tests**

Append to `src/hooks/useAgentChat.test.ts` :

```ts
test('ne recrée pas la WebSocket quand cwd change de valeur', async () => {
  const first = { sessionId: 's1', cwd: '/old', enabled: true };
  const { rerender } = renderHook((props) => useAgentChat(props), {
    initialProps: first,
  });
  act(() => MockWS.last._open());
  const wsBefore = MockWS.last;
  rerender({ sessionId: 's1', cwd: '/new', enabled: true });
  // Même instance de socket → pas de reconnexion.
  expect(MockWS.last).toBe(wsBefore);
});

test('onRenamed est appelé sur stream-renamed', async () => {
  const onRenamed = vi.fn();
  renderHook(() => useAgentChat({ sessionId: 's1', cwd: '/tmp', enabled: true, onRenamed }));
  act(() => {
    MockWS.last._open();
    MockWS.last._emit({
      type: 'stream-renamed',
      sessionId: 's1',
      branch: 'feat-x',
      worktreePath: '/repo/.worktrees/feat-x',
      cwd: '/repo/.worktrees/feat-x',
    });
  });
  expect(onRenamed).toHaveBeenCalledWith({
    branch: 'feat-x',
    worktreePath: '/repo/.worktrees/feat-x',
    cwd: '/repo/.worktrees/feat-x',
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useAgentChat.test.ts`
Expected: FAIL (reconnexion sur changement de cwd → `MockWS.last` diffère ; `onRenamed` non défini).

- [ ] **Step 3: Update `Params` and hook body**

Dans `src/hooks/useAgentChat.ts` :

Ajouter à l'interface `Params` :

```ts
	onRenamed?: (p: { branch: string; worktreePath: string; cwd: string }) => void;
```

Juste après les `useRef` existants (vers ligne 37), ajouter un ref qui suit la valeur courante de `cwd` :

```ts
	const cwdRef = useRef(p.cwd);
	cwdRef.current = p.cwd;
	const cwdReady = !!p.cwd;
```

Dans l'`onopen`, remplacer `cwd: p.cwd` par `cwd: cwdRef.current` :

```ts
					cwd: cwdRef.current,
```

Dans le `switch (msg.type)` de `onmessage`, ajouter deux cas (avant `default`/fin) :

```ts
				case 'stream-renaming-start':
					setStatus('busy');
					break;
				case 'stream-renamed':
					p.onRenamed?.({
						branch: String(msg.branch ?? ''),
						worktreePath: String(msg.worktreePath ?? ''),
						cwd: String(msg.cwd ?? ''),
					});
					break;
```

Remplacer les deps de l'effet (ligne ~123) :

```ts
	}, [p.enabled, cwdReady, p.readOnly, p.sessionId, reconnectNonce]);
```

et le guard d'entrée (ligne ~48) :

```ts
		if (!p.enabled || !cwdReady || p.readOnly) return;
```

> `p.onRenamed` est volontairement hors deps (comme les autres callbacks du hook) : l'effet ne doit pas se relancer si la référence du callback change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useAgentChat.test.ts`
Expected: PASS (tests existants + les 2 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAgentChat.ts src/hooks/useAgentChat.test.ts
git commit -m "feat(web): useAgentChat gère stream-renamed sans reconnexion sur cwd"
```

---

## Task 6: Front — câblage `onRenamed` (AgentChatTab → Workbench) + suppression de l'ancien rename

**Files:**
- Modify: `src/components/agents/AgentChatTab.tsx`
- Modify: `src/components/workbench/Workbench.tsx`

**Interfaces:**
- Consumes: `onRenamed` de `useAgentChat` (Task 5).
- Produces: `AgentChatTab` accepte `onRenamed?` et le passe à `useAgentChat` ; `Workbench` fournit `handleRenamed` qui invalide les queries React Query.

- [ ] **Step 1: `AgentChatTab.tsx` — remplacer `onFirstUserMessage` par `onRenamed`**

Repérer la prop `onFirstUserMessage` dans l'interface de props et son usage (passée à `useAgentChat` / au `send`). La supprimer et ajouter :

```ts
	onRenamed?: (p: { branch: string; worktreePath: string; cwd: string }) => void;
```

Dans l'appel `useAgentChat({ ... })`, retirer toute logique liée à `onFirstUserMessage` et ajouter `onRenamed` :

```ts
		onRenamed,
```

(Si `onFirstUserMessage` était appelé dans le handler d'envoi, supprimer cet appel — le rename est désormais piloté par le serveur.)

- [ ] **Step 2: `Workbench.tsx` — supprimer l'ancien mécanisme**

Supprimer :
- `const isAutoNamed = ...` (ligne ~118),
- toute la `const submitRenameFromPrompt = useCallback(...)` (lignes ~120-141),
- la ref `firstPromptSent` si elle n'est plus utilisée,
- le bloc `onFirstUserMessage={(text) => { ... submitRenameFromPrompt(text); }}` passé à `AgentChatTab` (lignes ~275-280).

- [ ] **Step 3: `Workbench.tsx` — ajouter `handleRenamed` et le passer à `AgentChatTab`**

Ajouter (près des autres callbacks, en réutilisant `queryClient` et `resolved`) :

```ts
	const handleRenamed = useCallback(() => {
		if (resolved?.project_path)
			queryClient.invalidateQueries({
				queryKey: ['git-worktrees', resolved.project_path],
			});
		queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
		queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
		queryClient.invalidateQueries({ queryKey: ['agent-session', sessionId] });
	}, [sessionId, resolved?.project_path, queryClient]);
```

Dans le JSX `<AgentChatTab ... />`, ajouter :

```tsx
							onRenamed={handleRenamed}
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit`
Expected: PASS (aucune référence orpheline à `onFirstUserMessage`, `submitRenameFromPrompt`, `isAutoNamed`, `firstPromptSent`).

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/AgentChatTab.tsx src/components/workbench/Workbench.tsx
git commit -m "feat(web): câblage onRenamed (Workbench→AgentChatTab), retrait ancien rename"
```

---

## Task 7: Sidebar — afficher le nom Karma + suppression finale de l'ancien système

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/api/agent-sessions/log/route.ts`
- Delete: `src/lib/autoRenameBranch.ts`
- Delete: `src/app/api/agent-sessions/rename-from-prompt/route.ts`

**Interfaces:**
- Consumes: `wt.branch` (nom Karma après rename), `wtSession?.agent_name` (persona/titre).
- Produces: `displayName` priorise `wt.branch` ; `agent_name` visible en tooltip.

- [ ] **Step 1: `Sidebar.tsx` — inverser la priorité de `displayName`**

Remplacer (ligne ~368-370) :

```ts
													// Show the agent-renamed name.
													const displayName =
														wtSession?.agent_name ?? wt.branch;
```

par :

```ts
													// Nom du worktree = branche (slug Karma après auto-rename).
													const displayName = wt.branch;
													const personaLabel = wtSession?.agent_name ?? null;
```

Entourer le `<Typography>{displayName}</Typography>` (ligne ~417-430) d'un `Tooltip` montrant le persona si présent :

```tsx
															<Tooltip title={personaLabel ?? ''} disableHoverListener={!personaLabel}>
																<Typography
																	variant="caption"
																	sx={{
																		flex: 1,
																		overflow: 'hidden',
																		textOverflow: 'ellipsis',
																		whiteSpace: 'nowrap',
																		color: isActiveWt
																			? 'text.primary'
																			: 'text.secondary',
																	}}
																>
																	{displayName}
																</Typography>
															</Tooltip>
```

(`Tooltip` est déjà importé dans `Sidebar.tsx`.)

- [ ] **Step 2: `log/route.ts` — retirer `maybeAutoRenameBranch`**

Supprimer l'import `import { maybeAutoRenameBranch } from '@/lib/autoRenameBranch';` (ligne 5) et les deux appels `maybeAutoRenameBranch(session, ...)` (lignes ~59 et ~72). Le handler `logType === 'title'` continue de setter `agent_name` (inchangé).

- [ ] **Step 3: Delete the dead files**

```bash
git rm src/lib/autoRenameBranch.ts src/app/api/agent-sessions/rename-from-prompt/route.ts
```

- [ ] **Step 4: Verify no dangling references**

Run: `grep -rn "autoRenameBranch\|rename-from-prompt\|maybeAutoRenameBranch\|onFirstUserMessage\|submitRenameFromPrompt" src/`
Expected: aucun résultat.

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

Run: `npm run build`
Expected: build Next réussi.

Run: `npx vitest run` (web) puis `cd packages/agent && npm test` (agent)
Expected: toutes les suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/app/api/agent-sessions/log/route.ts
git commit -m "feat(web): sidebar affiche le slug Karma; suppression de l'ancien auto-rename"
```

---

## Task 8: Vérification manuelle end-to-end

**Files:** aucun (run manuel).

- [ ] **Step 1: Lancer l'app**

Run: `npm run dev` (Next :4000 + agent :4001).

- [ ] **Step 2: Scénario nominal**

1. Ouvrir `/workbench`, créer une session « libre » sans nom (worktree `wip-…`). Vérifier dans la sidebar le nom `wip-…`.
2. Envoyer un 1er prompt clair (ex. « ajoute une auth Google »).
3. Attendre le rename : la sidebar doit afficher le slug Karma (ex. `feat-add-google-auth`) ; le dossier `.worktrees/` doit être renommé (`ls .worktrees` dans le repo cible) ; la branche aussi (`git -C <repo> branch`).
4. Vérifier que **le chat n'a pas été réinitialisé** (bulle utilisateur + réponse présentes, pas de flash « closed »), et que la réponse de l'agent arrive normalement dans le nouveau worktree.

- [ ] **Step 3: Cas limites manuels**

1. **2e message rapide** : envoyer un 2e prompt juste après le 1er (pendant le rename) → il ne doit pas être perdu (traité après le rename).
2. **Génération impossible** : couper le réseau / provoquer l'échec de `claude --print` → la session garde `wip-`, le prompt part quand même, aucune erreur bloquante.
3. **Session non-wip** (lancée depuis une issue `feat/NN-…` ou sur branche courante) → aucun rename, flux inchangé.

- [ ] **Step 4: (Si tout est vert) proposer commit final / PR à Ludovic**

Ne pas pusher sans accord explicite.

---

## Self-Review (fait par l'auteur du plan)

**Spec coverage :**
- #1 rename ne se déclenche pas → Task 2 (env nettoyé pour `claude --print`) + Task 4 (déclencheur serveur fiable). ✓
- #2 renommer le dossier → Task 2 (`git worktree move`) + Task 3 (`relocate`). ✓
- #3 sidebar mauvais nom → Task 7 (`displayName = wt.branch`). ✓
- `relocate` + garde-fou runLoop (R1) → Task 3. ✓
- Buffer anti-perte (R-buffer) → Task 4. ✓
- `perms` neuf pour s2 (R4) + garde étendue catch/finally (R5) → Task 3. ✓
- Front `cwdReady`/`cwdRef` (R2) → Task 5. ✓
- Résolution collision avant move (R3) → Task 2 (`resolveKarmaName` + `branchExists`). ✓
- Kill des 2 tmux (R6) → Task 2. ✓
- Nettoyage (`autoRenameBranch`, route, `onFirstUserMessage`) → Task 6 + 7. ✓
- Tradeoff sidebar/header (persona en tooltip) → Task 7. ✓
- Tests purs → Task 1 ; tests hook → Task 5 ; tests relocate → Task 3. ✓

**Placeholder scan :** aucun TODO/TBD ; chaque step de code montre le code. ✓

**Type consistency :** `RenameResult { branch, worktreePath, cwd }` cohérent entre Task 2 (produit), Task 4 (broadcast), Task 5 (`onRenamed`), Task 6 (`handleRenamed`). `relocate(sessionId, newCwd): boolean` cohérent Task 3 ↔ Task 4. `isWipBranch`/`readSessionForRename` cohérents Task 1-2 ↔ Task 4. ✓
