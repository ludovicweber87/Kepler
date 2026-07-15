# Worktree depuis une branche existante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre, à la création d'un worktree, de checkout directement une branche existante (locale ou distante) via une 3ᵉ carte dans l'assistant de lancement.

**Architecture:** L'assistant `AgentTerminalModal` gagne un mode `existing-branch` (3ᵉ carte + étape avec `Autocomplete` de branches). Le mode est persisté sur `agent_sessions.launch_mode` (nouvelle colonne), relu par `CreationProgress` qui le transmet à `POST /git/provision`. Le serveur agent liste les branches locales + distantes dédupliquées (`GET /git/branches?includeRemote`) et, à la provision, résout lui-même local vs distant puis checkout la branche. Deux fonctions pures (dédup/tri + choix des args git) sont extraites et testées.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, MUI 7, Drizzle + better-sqlite3, serveur agent Node (http natif), tests agent = `node:test`, tests web = Vitest.

## Global Constraints

- **Sémantique** : mode `existing-branch` = checkout **direct** de la branche choisie, **jamais** de nouvelle branche (option B du spec).
- **Nom de branche** : toujours le **nom court** (`feat/x`), jamais préfixé `origin/`. `worktreePath` = nom court avec `/` → `-`.
- **local vs distant** : résolu **côté serveur** à la provision (`git show-ref --verify refs/heads/<branch>`), jamais transporté depuis le client.
- **Rétro-compat** : `GET /git/branches` sans `?includeRemote` garde le comportement actuel (local only).
- **Aucun texte en dur** : tous les libellés via `next-intl` (namespace `launchModal`), 5 locales (`en/fr/es/de/pt`).
- **Tests** : convention repo = logique pure uniquement. Helpers agent testés avec `node:test` (`packages/agent/src/*.test.ts`). Pas de test UI (vérif par `tsc` + `lint` + `build`).
- **Pas de renommage auto `wip-*`** pour ce mode : la branche existe déjà.

---

### Task 1: Colonne `launch_mode` + plomberie session

Ajoute la persistance du mode de lancement de bout en bout (DB → API → hook → type).

**Files:**
- Modify: `src/db/schema.ts` (table `agentSessions`)
- Create: `src/db/migrations/0009_launch_mode.sql`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `src/hooks/useAgentSession.ts` (type `AgentSession` + params `ensureSession`)
- Modify: `src/app/api/agent-sessions/route.ts` (POST : accepter + insérer `launch_mode`)

**Interfaces:**
- Produces :
  - Colonne DB `agent_sessions.launch_mode TEXT DEFAULT 'worktree'`.
  - `AgentSession.launch_mode: 'worktree' | 'current-branch' | 'existing-branch' | null`.
  - `ensureSession(params)` accepte `launchMode?: 'worktree' | 'current-branch' | 'existing-branch'`.

- [ ] **Step 1: Ajouter la colonne au schéma Drizzle**

Dans `src/db/schema.ts`, table `agentSessions`, ajouter la colonne juste après `system_prompt: text(),` :

```ts
	system_prompt: text(),
	launch_mode: text().default('worktree'),
});
```

- [ ] **Step 2: Écrire le fichier de migration**

Créer `src/db/migrations/0009_launch_mode.sql` :

```sql
ALTER TABLE `agent_sessions` ADD `launch_mode` text DEFAULT 'worktree';
```

- [ ] **Step 3: Enregistrer la migration dans le journal**

Dans `src/db/migrations/meta/_journal.json`, ajouter une entrée à la fin du tableau `entries` (après l'entrée `0008_setup_script_name`) :

```json
    {
      "idx": 9,
      "version": "6",
      "when": 1784600000000,
      "tag": "0009_launch_mode",
      "breakpoints": true
    }
```

(La virgule après l'objet précédent `0008` est requise.)

- [ ] **Step 4: Étendre le type `AgentSession` et le hook**

Dans `src/hooks/useAgentSession.ts`, ajouter le champ au type `AgentSession` (après `system_prompt`) :

```ts
	system_prompt: string | null;
	launch_mode: 'worktree' | 'current-branch' | 'existing-branch' | null;
}
```

Toujours dans `useAgentSession.ts`, dans le `mutationFn` de `ensureSessionMutation`, ajouter `launchMode` au type des params et l'envoyer dans le body :

```ts
			systemPrompt?: string | null;
			status?: string;
			launchMode?: 'worktree' | 'current-branch' | 'existing-branch';
		}) => {
			const res = await apiFetch('/api/agent-sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session_id: params.sessionId,
					project_path: params.projectPath,
					project_name: params.projectName,
					branch: params.branch ?? null,
					worktree_path: params.worktreePath ?? null,
					agent_name: params.agentName ?? null,
					issue_owner: params.issueOwner ?? null,
					issue_repo: params.issueRepo ?? null,
					issue_number: params.issueNumber ?? null,
					issue_title: params.issueTitle ?? null,
					system_prompt: params.systemPrompt ?? null,
					status: params.status ?? 'active',
					launch_mode: params.launchMode ?? 'worktree',
				}),
			});
```

- [ ] **Step 5: Persister `launch_mode` côté API**

Dans `src/app/api/agent-sessions/route.ts`, fonction `POST` : extraire `launch_mode` du body et l'insérer.

Ajouter à la déstructuration (après `status,`) :

```ts
			system_prompt,
			status,
			launch_mode,
		} = body;
```

Ajouter à l'objet `.values({ ... })` (après `system_prompt: system_prompt ?? null,`) :

```ts
				system_prompt: system_prompt ?? null,
				launch_mode: launch_mode ?? 'worktree',
			})
```

- [ ] **Step 6: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Vérifier que la migration s'applique**

Run: `rm -f /tmp/devora-migtest.db && DEVORA_DB_PATH=/tmp/devora-migtest.db node --import tsx -e "import('./src/db/index.ts').then(()=>{const D=require('better-sqlite3');const db=new D('/tmp/devora-migtest.db');const cols=db.prepare(\"PRAGMA table_info(agent_sessions)\").all().map(c=>c.name);console.log(cols.includes('launch_mode')?'OK launch_mode present':'MISSING');})"`
Expected: `OK launch_mode present`

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0009_launch_mode.sql src/db/migrations/meta/_journal.json src/hooks/useAgentSession.ts src/app/api/agent-sessions/route.ts
git commit -m "feat(sessions): colonne launch_mode pour transporter le mode de lancement"
```

---

### Task 2: Fonctions pures `dedupeAndSortBranches` + `worktreeAddArgs`

Deux helpers purs (testables sans git) dans un nouveau module de l'agent.

**Files:**
- Create: `packages/agent/src/branches.ts`
- Create: `packages/agent/src/branches.test.ts`

**Interfaces:**
- Produces :
  - `interface RawBranch { name: string; lastCommitDate: string; lastCommitMessage: string; lastCommitAuthor: string; }`
  - `interface BranchEntry extends RawBranch { isCurrent: boolean; isRemote: boolean; isCheckedOut: boolean; }`
  - `dedupeAndSortBranches(input: { local: RawBranch[]; remote: RawBranch[]; current: string; checkedOut: string[] }): BranchEntry[]`
  - `worktreeAddArgs(opts: { worktreePath: string; branch: string; mode: 'worktree' | 'existing-branch'; isRemote: boolean; base: string }): string[]` — argv après `git worktree add`.

- [ ] **Step 1: Écrire les tests (échouent d'abord)**

Créer `packages/agent/src/branches.test.ts` :

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { dedupeAndSortBranches, worktreeAddArgs } from './branches.js';

const mk = (name: string, date: string) => ({
	name,
	lastCommitDate: date,
	lastCommitMessage: 'msg',
	lastCommitAuthor: 'me',
});

test('dédupe: une branche locale masque son homologue distante', () => {
	const out = dedupeAndSortBranches({
		local: [mk('feat/x', '2026-07-10T10:00:00+00:00')],
		remote: [mk('feat/x', '2026-07-10T10:00:00+00:00')],
		current: 'main',
		checkedOut: [],
	});
	const x = out.filter((b) => b.name === 'feat/x');
	assert.equal(x.length, 1);
	assert.equal(x[0].isRemote, false);
});

test('branche distante seule est marquée isRemote', () => {
	const out = dedupeAndSortBranches({
		local: [],
		remote: [mk('feat/only-remote', '2026-07-10T10:00:00+00:00')],
		current: 'main',
		checkedOut: [],
	});
	assert.equal(out[0].name, 'feat/only-remote');
	assert.equal(out[0].isRemote, true);
});

test('marque isCurrent et isCheckedOut', () => {
	const out = dedupeAndSortBranches({
		local: [mk('main', '2026-07-10T10:00:00+00:00'), mk('feat/y', '2026-07-09T10:00:00+00:00')],
		remote: [],
		current: 'main',
		checkedOut: ['feat/y'],
	});
	const main = out.find((b) => b.name === 'main')!;
	const y = out.find((b) => b.name === 'feat/y')!;
	assert.equal(main.isCurrent, true);
	assert.equal(y.isCheckedOut, true);
	assert.equal(main.isCheckedOut, false);
});

test('trie par date de commit décroissante', () => {
	const out = dedupeAndSortBranches({
		local: [mk('old', '2026-01-01T00:00:00+00:00'), mk('new', '2026-07-01T00:00:00+00:00')],
		remote: [],
		current: 'x',
		checkedOut: [],
	});
	assert.deepEqual(
		out.map((b) => b.name),
		['new', 'old'],
	);
});

test('worktreeAddArgs: mode worktree crée une nouvelle branche depuis la base', () => {
	assert.deepEqual(
		worktreeAddArgs({
			worktreePath: '/wt/feat-x',
			branch: 'feat/x',
			mode: 'worktree',
			isRemote: false,
			base: 'origin/main',
		}),
		['/wt/feat-x', '-b', 'feat/x', 'origin/main'],
	);
});

test('worktreeAddArgs: existing-branch locale checkout direct', () => {
	assert.deepEqual(
		worktreeAddArgs({
			worktreePath: '/wt/feat-x',
			branch: 'feat/x',
			mode: 'existing-branch',
			isRemote: false,
			base: '',
		}),
		['/wt/feat-x', 'feat/x'],
	);
});

test('worktreeAddArgs: existing-branch distante crée une branche de tracking', () => {
	assert.deepEqual(
		worktreeAddArgs({
			worktreePath: '/wt/feat-x',
			branch: 'feat/x',
			mode: 'existing-branch',
			isRemote: true,
			base: '',
		}),
		['--track', '-b', 'feat/x', '/wt/feat-x', 'origin/feat/x'],
	);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd packages/agent && node --import tsx --test src/branches.test.ts`
Expected: FAIL — `Cannot find module './branches.js'` / export introuvable.

- [ ] **Step 3: Implémenter les helpers**

Créer `packages/agent/src/branches.ts` :

```ts
export interface RawBranch {
	name: string;
	lastCommitDate: string;
	lastCommitMessage: string;
	lastCommitAuthor: string;
}

export interface BranchEntry extends RawBranch {
	isCurrent: boolean;
	isRemote: boolean;
	isCheckedOut: boolean;
}

/**
 * Fusionne branches locales + distantes en dédupliquant (le local masque le distant
 * de même nom), marque isCurrent/isRemote/isCheckedOut, trie par date décroissante.
 * Fonction pure — testable sans git.
 */
export function dedupeAndSortBranches(input: {
	local: RawBranch[];
	remote: RawBranch[];
	current: string;
	checkedOut: string[];
}): BranchEntry[] {
	const checkedOut = new Set(input.checkedOut);
	const byName = new Map<string, BranchEntry>();

	const add = (raw: RawBranch, isRemote: boolean) => {
		if (byName.has(raw.name)) return; // le local (ajouté d'abord) gagne
		byName.set(raw.name, {
			...raw,
			isCurrent: raw.name === input.current,
			isRemote,
			isCheckedOut: checkedOut.has(raw.name),
		});
	};

	for (const b of input.local) add(b, false);
	for (const b of input.remote) add(b, true);

	return [...byName.values()].sort(
		(a, b) => Date.parse(b.lastCommitDate) - Date.parse(a.lastCommitDate),
	);
}

/**
 * Retourne les arguments passés après `git worktree add`, selon le mode.
 * - worktree            → crée une nouvelle branche depuis la base distante
 * - existing-branch     → checkout direct (locale) ou branche de tracking (distante)
 * Fonction pure.
 */
export function worktreeAddArgs(opts: {
	worktreePath: string;
	branch: string;
	mode: 'worktree' | 'existing-branch';
	isRemote: boolean;
	base: string;
}): string[] {
	if (opts.mode === 'worktree') {
		return [opts.worktreePath, '-b', opts.branch, opts.base];
	}
	if (opts.isRemote) {
		return ['--track', '-b', opts.branch, opts.worktreePath, `origin/${opts.branch}`];
	}
	return [opts.worktreePath, opts.branch];
}
```

- [ ] **Step 4: Relancer les tests**

Run: `cd packages/agent && node --import tsx --test src/branches.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/branches.ts packages/agent/src/branches.test.ts
git commit -m "feat(agent): helpers purs dedupeAndSortBranches + worktreeAddArgs"
```

---

### Task 3: `GET /git/branches?includeRemote` — lister local + distant

**Files:**
- Modify: `packages/agent/src/routes/git.ts` (handler `GET /git/branches`, lignes ~254-298)

**Interfaces:**
- Consumes : `dedupeAndSortBranches`, `RawBranch` (Task 2).
- Produces : réponse `{ branches: BranchEntry[] }`. Sans `?includeRemote`, `remote` et `checkedOut` sont vides (comportement actuel préservé).

- [ ] **Step 1: Importer le helper**

Dans `packages/agent/src/routes/git.ts`, ajouter sous l'import de `gitBase.js` :

```ts
import { resolveRemoteBaseRef } from '../gitBase.js';
import { dedupeAndSortBranches, type RawBranch } from '../branches.js';
```

- [ ] **Step 2: Remplacer le handler `GET /git/branches`**

Remplacer tout le bloc `if (path === '/git/branches' && method === 'GET') { ... }` (lignes ~254-298) par :

```ts
	// GET /git/branches
	if (path === '/git/branches' && method === 'GET') {
		const localPath = query.get('path');
		if (!localPath) return sendJson(res, { error: 'path required' }, 400);
		const includeRemote = query.get('includeRemote') === 'true';

		const parseRefs = (raw: string): RawBranch[] =>
			raw
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((line) => {
					const [name, date, message, author] = line.split('|');
					return {
						name: name.trim(),
						lastCommitDate: date?.trim() ?? '',
						lastCommitMessage: message?.trim() ?? '',
						lastCommitAuthor: author?.trim() ?? '',
					};
				});

		try {
			const localRaw = execSync(
				`git -C ${JSON.stringify(localPath)} branch --format='%(refname:short)|%(committerdate:iso8601)|%(subject)|%(authorname)' --sort=-committerdate`,
				{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
			);
			const local = parseRefs(localRaw);

			let current = '';
			try {
				current = execSync(`git -C ${JSON.stringify(localPath)} rev-parse --abbrev-ref HEAD`, {
					encoding: 'utf-8',
					timeout: 5_000,
					stdio: ['pipe', 'pipe', 'ignore'],
				}).trim();
			} catch {
				// ignore
			}

			let remote: RawBranch[] = [];
			let checkedOut: string[] = [];
			if (includeRemote) {
				try {
					const remoteRaw = execSync(
						`git -C ${JSON.stringify(localPath)} for-each-ref --sort=-committerdate --format='%(refname:short)|%(committerdate:iso8601)|%(subject)|%(authorname)' refs/remotes/origin`,
						{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
					);
					remote = parseRefs(remoteRaw)
						.map((b) => ({ ...b, name: b.name.replace(/^origin\//, '') }))
						.filter((b) => b.name && b.name !== 'HEAD');
				} catch {
					// pas de remote / offline
				}
				try {
					const wtRaw = execSync(
						`git -C ${JSON.stringify(localPath)} worktree list --porcelain`,
						{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
					);
					checkedOut = wtRaw
						.split('\n')
						.filter((l) => l.startsWith('branch refs/heads/'))
						.map((l) => l.replace('branch refs/heads/', '').trim());
				} catch {
					// ignore
				}
			}

			const branches = dedupeAndSortBranches({ local, remote, current, checkedOut });
			sendJson(res, { branches });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}
```

- [ ] **Step 3: Vérifier la compilation de l'agent**

Run: `npx tsc --noEmit -p packages/agent/tsconfig.json 2>/dev/null || npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérification manuelle (local only rétro-compat + includeRemote)**

Run (remplacer `<REPO>` par un repo git local avec un remote origin) :
```bash
cd packages/agent && node --import tsx -e "import('child_process').then(({execSync})=>{const p=process.env.HOME+'/Documents/Lab/Perso/Devora';console.log(execSync('git -C '+p+' branch --format=%(refname:short) --sort=-committerdate',{encoding:'utf8'}).split('\n').slice(0,3).join(', '));})"
```
Expected: liste de branches locales (sanity check git). La vérification E2E de l'endpoint se fera au run manuel de l'app (Task 8).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/routes/git.ts
git commit -m "feat(agent): GET /git/branches?includeRemote (local + distant dédupliqués)"
```

---

### Task 4: `POST /git/provision` — mode `existing-branch`

**Files:**
- Modify: `packages/agent/src/routes/git.ts` (import `execFile`, helpers de résolution, handler `POST /git/provision` lignes ~575-756)

**Interfaces:**
- Consumes : `worktreeAddArgs` (Task 2).
- Produces : `POST /git/provision` accepte `mode: 'worktree' | 'current-branch' | 'existing-branch'`. Pour `existing-branch`, checkout la branche existante et enregistre `worktree_path`.

- [ ] **Step 1: Importer `execFile` + le helper d'args**

Modifier la ligne d'import de `node:child_process` :

```ts
import { execSync, execFileSync, exec, execFile, spawn } from 'node:child_process';
```

Ajouter le helper d'args à l'import branches :

```ts
import { dedupeAndSortBranches, worktreeAddArgs, type RawBranch } from '../branches.js';
```

Ajouter, juste après `const execAsync = promisify(exec);` :

```ts
const execFileAsync = promisify(execFile);

function localBranchExists(cwd: string, branch: string): boolean {
	try {
		execFileSync('git', ['-C', cwd, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
			timeout: 5000,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
}

function remoteBranchExists(cwd: string, branch: string): boolean {
	try {
		execFileSync(
			'git',
			['-C', cwd, 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
			{ timeout: 5000, stdio: 'ignore' },
		);
		return true;
	} catch {
		return false;
	}
}
```

- [ ] **Step 2: Étendre le type du body de provision**

Dans le handler `POST /git/provision`, modifier le type `mode` du `readBody` :

```ts
			mode: 'worktree' | 'current-branch' | 'existing-branch';
```

- [ ] **Step 3: Remplacer le bloc de création de worktree**

Remplacer le bloc `if (body.mode === 'worktree') { ... }` (de la ligne `if (body.mode === 'worktree') {` jusqu'à sa `}` fermante juste avant le commentaire `// 5) done`) par le bloc suivant. La partie `copy-files` et `setup` est identique à l'existant — seule la condition d'entrée et la sous-partie de création changent :

```ts
			const producesWorktree =
				body.mode === 'worktree' || body.mode === 'existing-branch';

			if (producesWorktree) {
				// 2) worktree
				sendSSE(res, 'step', { step: 'worktree', status: 'running' });
				const dirName = body.branch.replace(/\//g, '-');
				worktreePath = `${body.cwd}/.worktrees/${dirName}`;
				if (!existsSync(worktreePath)) {
					if (body.mode === 'existing-branch') {
						try {
							await execAsync('git fetch origin', {
								cwd: body.cwd,
								timeout: 30000,
							});
						} catch {
							/* offline — on tente quand même avec l'état local */
						}
						const isLocal = localBranchExists(body.cwd, body.branch);
						const isRemote = !isLocal && remoteBranchExists(body.cwd, body.branch);
						if (!isLocal && !isRemote) {
							return fail(
								'worktree',
								`Branche "${body.branch}" introuvable (ni locale ni sur origin)`,
							);
						}
						const args = worktreeAddArgs({
							worktreePath,
							branch: body.branch,
							mode: 'existing-branch',
							isRemote,
							base: '',
						});
						await execFileAsync('git', ['-C', body.cwd, 'worktree', 'add', ...args], {
							cwd: body.cwd,
							timeout: 30000,
						});
					} else {
						let baseBranch = 'main';
						try {
							baseBranch = (
								await execAsync('git symbolic-ref refs/remotes/origin/HEAD', {
									cwd: body.cwd,
									timeout: 5000,
								})
							).stdout
								.trim()
								.replace('refs/remotes/origin/', '');
						} catch {
							/* fallback main */
						}
						try {
							await execAsync(`git fetch origin ${baseBranch}`, {
								cwd: body.cwd,
								timeout: 30000,
							});
						} catch {
							/* offline */
						}
						const args = worktreeAddArgs({
							worktreePath,
							branch: body.branch,
							mode: 'worktree',
							isRemote: false,
							base: `origin/${baseBranch}`,
						});
						await execFileAsync('git', ['-C', body.cwd, 'worktree', 'add', ...args], {
							cwd: body.cwd,
							timeout: 30000,
						});
					}
				}
				sendSSE(res, 'step', { step: 'worktree', status: 'done' });

				// 3) copy files
				sendSSE(res, 'step', { step: 'copy-files', status: 'running' });
				try {
					const files = parseFilesToCopy(body.filesToCopy);
					const list =
						files.length > 0
							? files
							: readdirSync(body.cwd).filter((f) => f.startsWith('.env'));
					for (const file of list) {
						const src = join(body.cwd, file);
						if (existsSync(src)) copyFileSync(src, join(worktreePath, file));
					}
					const srcModules = join(body.cwd, 'node_modules');
					const destModules = join(worktreePath, 'node_modules');
					if (existsSync(srcModules) && !existsSync(destModules)) {
						symlinkSync(srcModules, destModules, 'dir');
					}
				} catch {
					/* non bloquant */
				}
				sendSSE(res, 'step', { step: 'copy-files', status: 'done' });

				// 4) setup script (streaming stdout/stderr en temps réel)
				if (body.setupScript && body.setupScript.trim()) {
					sendSSE(res, 'step', { step: 'setup', status: 'running' });
					const tail: string[] = [];
					const pushTail = (chunk: string) => {
						sendSSE(res, 'log', { step: 'setup', chunk });
						tail.push(chunk);
						if (tail.length > 40) tail.shift();
					};
					const code = await new Promise<number>((resolve) => {
						const child = spawn(body.setupScript, {
							cwd: worktreePath,
							shell: true,
							env: process.env,
						});
						child.stdout.on('data', (d: Buffer) => pushTail(d.toString()));
						child.stderr.on('data', (d: Buffer) => pushTail(d.toString()));
						child.on('error', (err) => {
							pushTail(err.message);
							resolve(1);
						});
						child.on('close', (c) => resolve(c ?? 0));
					});
					if (code === 0) {
						sendSSE(res, 'step', { step: 'setup', status: 'done' });
					} else {
						const lastLine =
							tail.join('').trim().split('\n').filter(Boolean).pop() ?? '';
						return fail('setup', `exit ${code}${lastLine ? ` — ${lastLine}` : ''}`);
					}
				}
			}
```

- [ ] **Step 4: Élargir l'enregistrement de `worktree_path`**

Remplacer la ligne finale d'update (dans le bloc `// 5) done`) :

```ts
			// 5) done → session active + worktree_path
			db?.prepare(
				'UPDATE agent_sessions SET status = ?, worktree_path = ? WHERE session_id = ?',
			).run(
				'active',
				body.mode === 'worktree' || body.mode === 'existing-branch'
					? worktreePath
					: null,
				body.sessionId,
			);
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Vérifier que les tests agent passent toujours**

Run: `cd packages/agent && node --import tsx --test "src/**/*.test.ts"`
Expected: tous les tests PASS (dont `branches.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/routes/git.ts
git commit -m "feat(agent): provision mode existing-branch (checkout branche locale/distante)"
```

---

### Task 5: `useBranches` — option `includeRemote` + champs de type

**Files:**
- Modify: `src/hooks/useBranches.ts`

**Interfaces:**
- Produces :
  - `interface Branch { ...; isCurrent: boolean; isRemote?: boolean; isCheckedOut?: boolean }`
  - `useBranches(localPath, opts?: { includeRemote?: boolean; enabled?: boolean })`

- [ ] **Step 1: Étendre le type `Branch` et la signature du hook**

Dans `src/hooks/useBranches.ts`, remplacer l'interface `Branch` et la fonction `useBranches` par :

```ts
export interface Branch {
	name: string;
	lastCommitDate: string;
	lastCommitMessage: string;
	lastCommitAuthor: string;
	isCurrent: boolean;
	isRemote?: boolean;
	isCheckedOut?: boolean;
}

export interface BranchCommit {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: string;
}

export function useBranches(
	localPath: string | undefined,
	opts?: { includeRemote?: boolean; enabled?: boolean },
) {
	const includeRemote = opts?.includeRemote ?? false;
	return useQuery({
		queryKey: ['git-branches', localPath, includeRemote],
		queryFn: async () => {
			const params = new URLSearchParams({ path: localPath! });
			if (includeRemote) params.set('includeRemote', 'true');
			const res = await localFetch(`/git/branches?${params.toString()}`);
			if (!res.ok) throw new Error('Failed to fetch branches');
			const { branches } = await res.json();
			return branches as Branch[];
		},
		enabled: !!localPath && (opts?.enabled ?? true),
		staleTime: 30_000,
	});
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur (les appelants existants de `useBranches(path)` restent valides — 2ᵉ argument optionnel).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBranches.ts
git commit -m "feat(hooks): useBranches supporte includeRemote + flags isRemote/isCheckedOut"
```

---

### Task 6: i18n — libellés `launchModal` (5 locales)

**Files:**
- Modify: `src/config/translate/fr.json`
- Modify: `src/config/translate/en.json`
- Modify: `src/config/translate/es.json`
- Modify: `src/config/translate/de.json`
- Modify: `src/config/translate/pt.json`

**Interfaces:**
- Produces : clés `launchModal.existingBranch`, `existingBranchDesc`, `existingBranchTooltip`, `selectBranchTitle`, `selectBranchPlaceholder`, `branchLocal`, `branchRemote`, `noBranchesFound`.

- [ ] **Step 1: Ajouter les clés dans `fr.json`**

Dans `src/config/translate/fr.json`, à l'intérieur de l'objet `"launchModal"`, ajouter après la clé `"currentBranchTooltip"` :

```json
		"existingBranch": "Depuis une branche existante",
		"existingBranchDesc": "Crée un worktree sur une branche locale ou distante existante",
		"existingBranchTooltip": "Reprend le travail d'une branche déjà commencée",
		"selectBranchTitle": "Choisir une branche",
		"selectBranchPlaceholder": "Rechercher une branche…",
		"branchLocal": "local",
		"branchRemote": "distant",
		"noBranchesFound": "Aucune branche trouvée",
```

- [ ] **Step 2: Ajouter les clés dans `en.json`** (même emplacement dans `launchModal`)

```json
		"existingBranch": "From an existing branch",
		"existingBranchDesc": "Create a worktree on an existing local or remote branch",
		"existingBranchTooltip": "Resume work from a branch already started",
		"selectBranchTitle": "Choose a branch",
		"selectBranchPlaceholder": "Search a branch…",
		"branchLocal": "local",
		"branchRemote": "remote",
		"noBranchesFound": "No branch found",
```

- [ ] **Step 3: Ajouter les clés dans `es.json`**

```json
		"existingBranch": "Desde una rama existente",
		"existingBranchDesc": "Crea un worktree en una rama local o remota existente",
		"existingBranchTooltip": "Retoma el trabajo de una rama ya iniciada",
		"selectBranchTitle": "Elegir una rama",
		"selectBranchPlaceholder": "Buscar una rama…",
		"branchLocal": "local",
		"branchRemote": "remoto",
		"noBranchesFound": "No se encontró ninguna rama",
```

- [ ] **Step 4: Ajouter les clés dans `de.json`**

```json
		"existingBranch": "Von einem bestehenden Branch",
		"existingBranchDesc": "Erstellt ein Worktree auf einem bestehenden lokalen oder Remote-Branch",
		"existingBranchTooltip": "Setzt die Arbeit an einem bereits begonnenen Branch fort",
		"selectBranchTitle": "Branch auswählen",
		"selectBranchPlaceholder": "Branch suchen…",
		"branchLocal": "lokal",
		"branchRemote": "remote",
		"noBranchesFound": "Kein Branch gefunden",
```

- [ ] **Step 5: Ajouter les clés dans `pt.json`**

```json
		"existingBranch": "De um branch existente",
		"existingBranchDesc": "Cria um worktree em um branch local ou remoto existente",
		"existingBranchTooltip": "Retoma o trabalho de um branch já iniciado",
		"selectBranchTitle": "Escolher um branch",
		"selectBranchPlaceholder": "Pesquisar um branch…",
		"branchLocal": "local",
		"branchRemote": "remoto",
		"noBranchesFound": "Nenhum branch encontrado",
```

- [ ] **Step 6: Vérifier que les 5 JSON sont valides**

Run: `for l in fr en es de pt; do node -e "require('./src/config/translate/$l.json').launchModal.existingBranch || process.exit(1)" && echo "$l OK"; done`
Expected: `fr OK` / `en OK` / `es OK` / `de OK` / `pt OK`.

- [ ] **Step 7: Commit**

```bash
git add src/config/translate/fr.json src/config/translate/en.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "i18n(launchModal): libellés mode branche existante (5 locales)"
```

---

### Task 7: `AgentTerminalModal` — 3ᵉ carte + étape `existing-branch`

**Files:**
- Modify: `src/components/agents/AgentTerminalModal.tsx`

**Interfaces:**
- Consumes : `useBranches(path, { includeRemote, enabled })` + type `Branch` (Task 5) ; `ensureSession({ launchMode })` (Task 1) ; clés i18n (Task 6).

- [ ] **Step 1: Ajouter les imports (Autocomplete + icône + hook branches)**

Dans `src/components/agents/AgentTerminalModal.tsx`, ajouter aux imports MUI :

```ts
import Autocomplete from '@mui/material/Autocomplete';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
```

Ajouter aux imports de hooks (à côté de `useWorktrees`) :

```ts
import { useBranches, type Branch } from '@/hooks/useBranches';
```

- [ ] **Step 2: Étendre les unions de state et ajouter la sélection**

Remplacer la ligne du state `step` :

```ts
	const [step, setStep] = useState<
		'project' | 'launch-mode' | 'branch' | 'existing-branch'
	>('project');
```

Remplacer la ligne du state `launchMode` :

```ts
	const [launchMode, setLaunchMode] = useState<
		'worktree' | 'current-branch' | 'existing-branch' | null
	>(null);
	const [selectedExistingBranch, setSelectedExistingBranch] = useState<Branch | null>(null);
```

- [ ] **Step 3: Charger les branches (local + distant) quand l'étape est active**

Après la ligne `const { isCreating } = useWorktrees(projectPath ?? undefined);`, ajouter :

```ts
	const { data: existingBranches = [], isLoading: branchesLoading } = useBranches(
		projectPath ?? undefined,
		{ includeRemote: true, enabled: step === 'existing-branch' },
	);
```

- [ ] **Step 4: Réinitialiser la sélection à la fermeture**

Dans l'effet de reset (`if (!open) { ... }`), ajouter après `setLaunchMode(null);` :

```ts
			setLaunchMode(null);
			setSelectedExistingBranch(null);
```

- [ ] **Step 5: Passer `launchMode: 'worktree'` dans `handleLaunch`**

Dans `handleLaunch`, ajouter `launchMode: 'worktree',` à l'objet passé à `ensureSession` (après `status: 'provisioning',`) :

```ts
				status: 'provisioning',
				launchMode: 'worktree',
```

- [ ] **Step 6: Ajouter le handler `handleLaunchExistingBranch`**

Juste après `handleLaunch` (avant `handleSelectProject`), ajouter :

```ts
	const handleLaunchExistingBranch = useCallback(() => {
		if (!projectPath || !selectedExistingBranch) return;
		setWorktreeError(null);
		try {
			const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
			ensureSession({
				sessionId,
				projectPath,
				projectName,
				agentName:
					agentFile?.name ?? (issueContext ? `#${issueContext.issueNumber}` : null),
				branch: selectedExistingBranch.name,
				worktreePath: null,
				status: 'provisioning',
				launchMode: 'existing-branch',
				issueOwner: issueContext?.owner ?? null,
				issueRepo: issueContext?.repo ?? null,
				issueNumber: issueContext?.issueNumber ?? null,
				issueTitle: issueContext?.issueTitle ?? null,
				systemPrompt: composeSystemPrompt(),
			});
			goToWorkbench(sessionId);
		} catch (err) {
			setWorktreeError(err instanceof Error ? err.message : 'Erreur au lancement');
		}
	}, [
		projectPath,
		selectedExistingBranch,
		sessionId,
		agentFile,
		issueContext,
		composeSystemPrompt,
		ensureSession,
		goToWorkbench,
	]);
```

- [ ] **Step 7: Router vers la nouvelle étape depuis `handleLaunchModeNext`**

Remplacer `handleLaunchModeNext` par :

```ts
	const handleLaunchModeNext = useCallback(() => {
		if (!launchMode) return;
		if (launchMode === 'worktree') {
			setStep('branch');
		} else if (launchMode === 'existing-branch') {
			setStep('existing-branch');
		} else {
			handleLaunchCurrentBranch();
		}
	}, [launchMode, handleLaunchCurrentBranch]);
```

- [ ] **Step 8: Ajouter la 3ᵉ carte dans l'étape `launch-mode`**

Dans le JSX de l'étape `launch-mode`, juste après le bloc `{/* Current branch option */}` (la `</Tooltip>` fermante de la carte current-branch), ajouter une 3ᵉ carte à l'intérieur du même conteneur `<Box sx={{ display: 'flex', gap: 2, ... }}>` :

```tsx
							{/* Existing branch option */}
							<Tooltip title={tl('existingBranchTooltip')} arrow placement="top">
								<Box
									onClick={() => setLaunchMode('existing-branch')}
									sx={{
										flex: 1,
										p: 3,
										borderRadius: 1,
										border: 2,
										borderColor:
											launchMode === 'existing-branch'
												? 'primary.main'
												: 'divider',
										bgcolor:
											launchMode === 'existing-branch'
												? (theme) => alpha(theme.palette.primary.main, 0.08)
												: 'transparent',
										cursor: 'pointer',
										textAlign: 'center',
										transition: 'all 0.15s',
										'&:hover': {
											borderColor: 'primary.main',
											bgcolor: (theme) =>
												alpha(theme.palette.primary.main, 0.06),
											transform: 'translateY(-2px)',
										},
									}}
								>
									<AltRouteRoundedIcon
										sx={{ fontSize: 36, color: 'primary.main', mb: 1 }}
									/>
									<Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
										{tl('existingBranch')}
									</Typography>
									<Typography
										variant="body2"
										sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
									>
										{tl('existingBranchDesc')}
									</Typography>
								</Box>
							</Tooltip>
```

- [ ] **Step 9: Ajouter le rendu de l'étape `existing-branch`**

Juste avant la balise fermante `</Dialog>` (après le bloc `{step === 'branch' && ( ... )}`), ajouter :

```tsx
			{/* Step 3 bis: Select an existing branch (local or remote) */}
			{step === 'existing-branch' && (
				<Box
					sx={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 3,
						px: 4,
					}}
				>
					<AltRouteRoundedIcon
						sx={{ fontSize: 56, color: 'primary.main', opacity: 0.7 }}
					/>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('selectBranchTitle')}
					</Typography>

					<Box sx={{ width: '100%', maxWidth: 500 }}>
						<Autocomplete
							options={existingBranches}
							loading={branchesLoading}
							value={selectedExistingBranch}
							onChange={(_, v) => setSelectedExistingBranch(v)}
							getOptionLabel={(o) => o.name}
							getOptionDisabled={(o) => o.isCheckedOut === true}
							isOptionEqualToValue={(o, v) => o.name === v.name}
							noOptionsText={tl('noBranchesFound')}
							renderOption={(props, option) => (
								<Box component="li" {...props} key={option.name}>
									<Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
										<Typography variant="body2" sx={{ fontWeight: 500 }}>
											{option.name}
										</Typography>
										<Typography
											variant="caption"
											sx={{ color: 'text.secondary' }}
										>
											{option.lastCommitMessage}
										</Typography>
									</Box>
									<Chip
										size="small"
										label={
											option.isRemote ? tl('branchRemote') : tl('branchLocal')
										}
										sx={{ ml: 'auto', height: 20, fontSize: '0.65rem' }}
									/>
								</Box>
							)}
							renderInput={(params) => (
								<TextField
									{...params}
									autoFocus
									size="small"
									placeholder={tl('selectBranchPlaceholder')}
								/>
							)}
						/>
					</Box>

					{worktreeError && (
						<Alert severity="error" sx={{ maxWidth: 500, width: '100%' }}>
							{worktreeError}
						</Alert>
					)}

					<Box sx={{ display: 'flex', gap: 1.5 }}>
						<Button
							variant="outlined"
							startIcon={<ArrowBackRoundedIcon />}
							onClick={() => setStep('launch-mode')}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{tc('back')}
						</Button>
						<Button
							variant="contained"
							disabled={!selectedExistingBranch || !projectPath}
							startIcon={<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />}
							onClick={handleLaunchExistingBranch}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								px: 4,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{tl('launch')}
						</Button>
					</Box>
				</Box>
			)}
```

- [ ] **Step 10: Vérifier compilation + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 11: Commit**

```bash
git add src/components/agents/AgentTerminalModal.tsx
git commit -m "feat(workbench): 3e carte 'branche existante' dans l'assistant de lancement"
```

---

### Task 8: `CreationProgress` — lire `launch_mode` et le transmettre

**Files:**
- Modify: `src/components/workbench/CreationProgress.tsx`

**Interfaces:**
- Consumes : `session.launch_mode` (Task 1). Envoie `mode` à `POST /git/provision` (Task 4).

- [ ] **Step 1: Dériver le mode depuis la session**

Dans `src/components/workbench/CreationProgress.tsx`, remplacer la ligne :

```ts
	const mode = 'worktree' as const; // provisioning ne concerne que la création worktree ; current-branch est géré à part
```

par :

```ts
	const mode = session.launch_mode ?? 'worktree'; // 'worktree' | 'existing-branch' (les deux produisent un worktree)
```

- [ ] **Step 2: Vérifier compilation + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK (le champ `launch_mode` est bien typé sur `AgentSession`, la valeur `mode` est acceptée par le payload provision).

- [ ] **Step 3: Vérification manuelle E2E**

Lancer l'app (`npm run dev`), ouvrir l'assistant de lancement :
1. Choisir un projet → étape mode : vérifier la présence de la 3ᵉ carte « Depuis une branche existante ».
2. La sélectionner → `Autocomplete` liste branches locales + distantes, badges `local`/`distant`, branches déjà en worktree grisées.
3. Choisir une branche **locale** existante → Launch → le Workbench affiche `CreationProgress` (steps worktree/copy-files) puis la session devient active sur cette branche (worktree créé sous `.worktrees/<branche>`).
4. Répéter avec une branche **distante seule** → vérifier qu'une branche locale de tracking est créée et checkout.
Expected: worktree créé et session active dans les deux cas ; branche du worktree = branche sélectionnée (pas de branche `wip-*`).

- [ ] **Step 4: Commit**

```bash
git add src/components/workbench/CreationProgress.tsx
git commit -m "feat(workbench): CreationProgress transmet launch_mode à la provision"
```

---

## Self-Review

**Spec coverage :**
- §1 Flow UI (3ᵉ carte + étape `existing-branch` + Autocomplete, badges, disabled) → Task 7 (+ i18n Task 6). ✅
- §2 Transport via `launch_mode` + résolution serveur local/distant + branche courte + copy/setup/worktree_path élargis + guard existsSync → Tasks 1, 4, 8. ✅
- §3 `GET /git/branches?includeRemote` (dédup/tri/flags, rétro-compat) → Tasks 3 (+ helper Task 2). ✅
- §4 Gestion d'erreurs (branche introuvable → SSE error ; disabled côté select) → Task 4 (fail) + Task 7 (getOptionDisabled). ✅
- §5 i18n 5 locales → Task 6. ✅
- §6 Tests helpers purs (dédup/tri/flags + args git) → Task 2. ✅

**Placeholder scan :** aucun TODO/TBD ; tout le code est fourni intégralement (blocs de remplacement complets pour les handlers longs).

**Type consistency :** `dedupeAndSortBranches` / `worktreeAddArgs` / `RawBranch` / `BranchEntry` (Task 2) ↔ consommés en Task 3 & 4 avec les mêmes signatures. `Branch` (Task 5) ↔ options `Autocomplete` (Task 7). `launch_mode` : colonne (Task 1) ↔ `AgentSession.launch_mode` (Task 1) ↔ `session.launch_mode` (Task 8) ↔ `ensureSession({ launchMode })` (Tasks 1, 7). Valeurs `'worktree' | 'current-branch' | 'existing-branch'` cohérentes partout.

**Note (non bloquante) :** `src/types/index.ts` n'est pas modifié — le type de session utilisé par ce flow est `AgentSession` (dans `useAgentSession.ts`) ; `ActiveSession` (types/index) n'a pas besoin de `launch_mode` pour cette feature.
