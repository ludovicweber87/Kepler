# Worktree Creation Progress (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À la création d'une session (nouveau worktree), afficher un écran de progression centré à étapes (read-issue → worktree → copy → setup), piloté par un endpoint agent SSE ; exécuter aussi le `archive_script` avant archivage.

**Architecture:** Le modal marque la session `status:'provisioning'` et redirige immédiatement vers le Workbench (il ne crée plus le worktree). Le Workbench, sur `provisioning`, rend `CreationProgress` qui consomme le SSE de `POST /git/provision` (agent) ; celui-ci lit l'issue (REST GitHub + Bearer → `claude --print`, résumé appended au `system_prompt`), crée le worktree, copie les `files_to_copy`, exécute le `setup_script`, puis passe la session `active`. L'archivage exécute `archive_script` via `POST /git/run-script`.

**Tech Stack:** Next.js 16 / React 19 / TS strict / MUI 7 + Framer Motion / TanStack Query / agent Node (http + SSE) / better-sqlite3 / next-intl / Vitest + node:test (agent).

## Global Constraints

- **Aucun texte en dur** : libellés via next-intl, 5 locales (`src/config/translate/*.json`).
- `"use client"` sur composants interactifs. TS strict ; `@/*`.
- Tests : logique pure (Vitest côté `src/`, `node:test` côté `packages/agent/`). UI/endpoints vérifiés par lint + `npx tsc --noEmit` + build (+ agent : `npm run -w packages/agent build` si dispo, sinon `npx tsc --noEmit` dans le package).
- Pas de migration DB (statut = colonne `text`).
- **Ne jamais commiter sans accord** (donné pour l'exécution).
- Branche : `feat/creation-progress` (déjà créée).
- Dépend de Phase 1 : `repo_settings` + `useRepoSettings` + `resolveRepoFullName`.

## File Structure

**Créés :**
- `packages/agent/src/filesToCopy.ts` (+ `.test.ts`) — helper pur de parsing de la liste.
- `src/components/workbench/CreationProgress.tsx` — écran de progression (SSE client).

**Modifiés :**
- `src/hooks/useAgentSession.ts` — union `status` + param `status` dans ensureSession.
- `src/app/api/agent-sessions/route.ts` — insert lit `status` du body (défaut `active`).
- `packages/agent/src/routes/git.ts` — nouveaux endpoints `POST /git/provision` (SSE) et `POST /git/run-script`.
- `src/components/agents/AgentTerminalModal.tsx` — 3 sites de lancement → `provisioning` + navigate, sans createWorktree.
- `src/components/workbench/Workbench.tsx` — early-return `provisioning` → `CreationProgress`.
- `src/components/layout/Sidebar.tsx` — `handleArchive` exécute `archive_script`.
- `src/config/translate/*.json` — namespace `creationProgress`.

---

## Task 1: Plumbing du statut `provisioning`

**Files:**
- Modify: `src/hooks/useAgentSession.ts`
- Modify: `src/app/api/agent-sessions/route.ts`

**Interfaces:**
- Produces: `AgentSession.status` inclut `'provisioning'` ; `ensureSession({..., status?})` propage `status` ; POST insert utilise `status ?? 'active'`.

- [ ] **Step 1: Union de statut**

`src/hooks/useAgentSession.ts` — dans `interface AgentSession`, changer :
```ts
	status: 'active' | 'completed' | 'error' | 'provisioning';
```

- [ ] **Step 2: Param `status` dans ensureSession**

Dans `ensureSessionMutation`'s `mutationFn` params type, ajouter `status?: string;`. Dans le body POST construit, ajouter `status: params.status ?? 'active',`.

- [ ] **Step 3: Route insert lit `status`**

`src/app/api/agent-sessions/route.ts` POST : destructurer `status` du body ; dans l'`insert(...).values({...})`, remplacer `status: 'active'` par `status: status ?? 'active'`. (La branche « existing session » reste inchangée.)

- [ ] **Step 4: Vérifier + commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.
```bash
git add src/hooks/useAgentSession.ts src/app/api/agent-sessions/route.ts
git commit -m "feat(provisioning): allow creating sessions with status=provisioning"
```

---

## Task 2: Endpoint agent SSE `POST /git/provision` (+ helper pur)

**Files:**
- Create: `packages/agent/src/filesToCopy.ts`, `packages/agent/src/filesToCopy.test.ts`
- Modify: `packages/agent/src/routes/git.ts`

**Interfaces:**
- Produces:
  ```ts
  // filesToCopy.ts
  export function parseFilesToCopy(text: string): string[]; // lignes trim, non vides ; [] si rien
  ```
  Endpoint `POST /git/provision` body `{ cwd, branch, sessionId, mode:'worktree'|'current-branch', issue?:{owner,repo,number}, filesToCopy:string, setupScript:string }` → SSE events `{step,status,message?}` puis `{step:'done', worktreePath}`.

- [ ] **Step 1: Test du helper**

Créer `packages/agent/src/filesToCopy.test.ts` (style `node:test`, cf. `activityDeriver.test.ts`) :
```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { parseFilesToCopy } from './filesToCopy.js';

test('parse lignes non vides, trim', () => {
	assert.deepEqual(parseFilesToCopy('.env\n  .env.local \n\n'), ['.env', '.env.local']);
});
test('texte vide → []', () => {
	assert.deepEqual(parseFilesToCopy('   \n  '), []);
});
```

- [ ] **Step 2: Lancer → échec**

Run: `cd packages/agent && node --test --import tsx src/filesToCopy.test.ts` (ou la commande de test du package — vérifier `packages/agent/package.json` scripts). Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter le helper**

Créer `packages/agent/src/filesToCopy.ts` :
```ts
export function parseFilesToCopy(text: string): string[] {
	return (text ?? '')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
}
```

- [ ] **Step 4: Lancer → succès** (même commande qu'au Step 2, PASS).

- [ ] **Step 5: Endpoint `/git/provision`**

Dans `packages/agent/src/routes/git.ts`, ajouter dans `handleGitRoutes` (avant le fallback), un handler SSE. Imports en tête (compléter les existants) : `readdirSync, copyFileSync, existsSync, symlinkSync` (déjà présents), `startSSE, sendSSE, getToken, findClaude` (helpers), `parseFilesToCopy` depuis `../filesToCopy.js`, `getDb` depuis `../db.js`.
```ts
	// POST /git/provision (SSE) — provisionne un worktree étape par étape
	if (path === '/git/provision' && method === 'POST') {
		const body = await readBody<{
			cwd: string;
			branch: string;
			sessionId: string;
			mode: 'worktree' | 'current-branch';
			issue?: { owner: string; repo: string; number: number };
			filesToCopy: string;
			setupScript: string;
		}>(req);
		const token = getToken(req);
		startSSE(res);
		const db = getDb();

		const fail = (step: string, message: string) => {
			try {
				db.prepare('UPDATE agent_sessions SET status = ? WHERE session_id = ?').run(
					'error',
					body.sessionId,
				);
			} catch {
				/* best-effort */
			}
			sendSSE(res, 'step', { step, status: 'error', message });
			res.end();
		};

		try {
			// 1) read-issue (optionnel)
			if (body.issue && token) {
				sendSSE(res, 'step', { step: 'read-issue', status: 'running' });
				try {
					const { owner, repo, number } = body.issue;
					const base = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
					const headers = {
						Authorization: `Bearer ${token}`,
						Accept: 'application/vnd.github+json',
						'X-GitHub-Api-Version': '2022-11-28',
					};
					const [issueRes, commentsRes] = await Promise.all([
						fetch(base, { headers }),
						fetch(`${base}/comments`, { headers }),
					]);
					const issue = issueRes.ok ? await issueRes.json() : null;
					const comments = commentsRes.ok ? await commentsRes.json() : [];
					if (issue) {
						const commentsText = (comments as { body?: string }[])
							.map((c) => c.body ?? '')
							.filter(Boolean)
							.join('\n\n---\n\n');
						const prompt = `Voici une issue GitHub et ses commentaires. Résume le contexte et une approche suggérée, en français, de façon concise.\n\n# ${issue.title}\n\n${issue.body ?? ''}\n\n## Commentaires\n${commentsText}`;
						const summary = execFileSync(findClaude(), ['--print'], {
							input: prompt,
							encoding: 'utf-8',
							timeout: 120000,
						}).trim();
						if (summary) {
							const row = db
								.prepare('SELECT system_prompt FROM agent_sessions WHERE session_id = ?')
								.get(body.sessionId) as { system_prompt？: string } | undefined;
							const nextPrompt = `${row?.system_prompt ?? ''}\n\n## Contexte de l'issue (résumé)\n${summary}`.trim();
							db.prepare('UPDATE agent_sessions SET system_prompt = ? WHERE session_id = ?').run(
								nextPrompt,
								body.sessionId,
							);
						}
					}
					sendSSE(res, 'step', { step: 'read-issue', status: 'done' });
				} catch {
					// non bloquant : on saute proprement
					sendSSE(res, 'step', { step: 'read-issue', status: 'done', message: 'skipped' });
				}
			}

			let worktreePath = body.cwd;

			if (body.mode === 'worktree') {
				// 2) worktree
				sendSSE(res, 'step', { step: 'worktree', status: 'running' });
				const dirName = body.branch.replace(/\//g, '-');
				worktreePath = `${body.cwd}/.worktrees/${dirName}`;
				if (!existsSync(worktreePath)) {
					let baseBranch = 'main';
					try {
						baseBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
							cwd: body.cwd,
							encoding: 'utf-8',
							timeout: 5000,
						})
							.trim()
							.replace('refs/remotes/origin/', '');
					} catch {
						/* fallback main */
					}
					try {
						execSync(`git fetch origin ${baseBranch}`, {
							cwd: body.cwd,
							encoding: 'utf-8',
							timeout: 30000,
						});
					} catch {
						/* offline */
					}
					execSync(
						`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(body.branch)} origin/${baseBranch}`,
						{ cwd: body.cwd, encoding: 'utf-8', timeout: 30000 },
					);
				}
				sendSSE(res, 'step', { step: 'worktree', status: 'done' });

				// 3) copy files
				sendSSE(res, 'step', { step: 'copy-files', status: 'running' });
				try {
					const files = parseFilesToCopy(body.filesToCopy);
					const list =
						files.length > 0 ? files : readdirSync(body.cwd).filter((f) => f.startsWith('.env'));
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

				// 4) setup script
				if (body.setupScript && body.setupScript.trim()) {
					sendSSE(res, 'step', { step: 'setup', status: 'running' });
					try {
						execSync(body.setupScript, {
							cwd: worktreePath,
							encoding: 'utf-8',
							timeout: 600000,
						});
						sendSSE(res, 'step', { step: 'setup', status: 'done' });
					} catch (err) {
						return fail('setup', err instanceof Error ? err.message : 'setup failed');
					}
				}
			}

			// 5) done → session active + worktree_path
			db.prepare(
				'UPDATE agent_sessions SET status = ?, worktree_path = ? WHERE session_id = ?',
			).run('active', body.mode === 'worktree' ? worktreePath : null, body.sessionId);
			sendSSE(res, 'done', { step: 'done', worktreePath });
			res.end();
		} catch (err) {
			return fail('worktree', err instanceof Error ? err.message : 'provision failed');
		}
		return;
	}
```
> ⚠️ Corriger la coquille unicode dans le type inline `system_prompt？` → `system_prompt?` (point d'interrogation ASCII) lors de l'écriture. Vérifier que `join`, `execSync`, `execFileSync` sont importés en haut de `git.ts` (execSync/execFileSync le sont déjà ; `join` de `node:path` — l'ajouter si absent).

- [ ] **Step 6: Vérifier types agent + commit**

Run: `cd packages/agent && npx tsc --noEmit` (0 erreur) puis `node --test --import tsx src/filesToCopy.test.ts` (PASS).
```bash
git add packages/agent/src/filesToCopy.ts packages/agent/src/filesToCopy.test.ts packages/agent/src/routes/git.ts
git commit -m "feat(provisioning): agent SSE /git/provision (read-issue, worktree, copy, setup)"
```

---

## Task 3: CreationProgress + branchement Workbench + i18n

**Files:**
- Create: `src/components/workbench/CreationProgress.tsx`
- Modify: `src/components/workbench/Workbench.tsx`
- Modify: `src/config/translate/*.json`

**Interfaces:**
- Consumes: `localFetch` (`@/lib/local-fetch`), `useRepoSettings` (Phase 1), l'endpoint `/git/provision` (Task 2), `useQueryClient`.
- Produces: écran de progression ; au `done` invalide `['agent-session', sessionId]`.

- [ ] **Step 1: i18n `creationProgress` (5 locales)**

Ajouter dans les 5 locales (fr donné, traduire le reste) :
```json
"creationProgress": {
	"title": "Préparation de l'espace de travail",
	"readIssue": "Lecture de l'issue par l'agent",
	"worktree": "Création du worktree",
	"copyFiles": "Copie des fichiers",
	"setup": "Script de configuration",
	"ready": "Prêt",
	"failed": "Échec — {step}",
	"retry": "Réessayer"
}
```

- [ ] **Step 2: CreationProgress component**

Créer `src/components/workbench/CreationProgress.tsx` :
```tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import type { AgentSession } from '@/hooks/useAgentSession';
import type { RepoSettings } from '@/types';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

export default function CreationProgress({
	session,
	repoSettings,
}: {
	session: AgentSession;
	repoSettings: RepoSettings;
}) {
	const t = useTranslations('creationProgress');
	const qc = useQueryClient();
	const started = useRef(false);
	const [steps, setSteps] = useState<Record<string, StepStatus>>({});
	const [error, setError] = useState<{ step: string; message?: string } | null>(null);

	const hasIssue = !!(session.issue_owner && session.issue_repo && session.issue_number);
	const mode: 'worktree' | 'current-branch' = session.worktree_path === null && session.branch
		? 'worktree'
		: 'worktree'; // provisioning ne concerne que la création worktree ; current-branch est géré à part
	// Étapes affichées (ordre)
	const stepKeys = [
		...(hasIssue ? ['read-issue'] : []),
		'worktree',
		'copy-files',
		...(repoSettings.setup_script.trim() ? ['setup'] : []),
	];
	const label: Record<string, string> = {
		'read-issue': t('readIssue'),
		worktree: t('worktree'),
		'copy-files': t('copyFiles'),
		setup: t('setup'),
	};

	const run = useCallback(async () => {
		setError(null);
		setSteps({});
		const controller = new AbortController();
		try {
			const res = await localFetch('/git/provision', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cwd: session.project_path,
					branch: session.branch,
					sessionId: session.session_id,
					mode,
					issue: hasIssue
						? {
								owner: session.issue_owner,
								repo: session.issue_repo,
								number: session.issue_number,
							}
						: undefined,
					filesToCopy: repoSettings.files_to_copy,
					setupScript: repoSettings.setup_script,
				}),
				signal: controller.signal,
			});
			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buf = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const frames = buf.split('\n\n');
				buf = frames.pop() ?? '';
				for (const frame of frames) {
					const evt = /^event: (.+)$/m.exec(frame)?.[1];
					const dataRaw = /^data: (.+)$/m.exec(frame)?.[1];
					if (!dataRaw) continue;
					const data = JSON.parse(dataRaw);
					if (evt === 'done') {
						qc.invalidateQueries({ queryKey: ['agent-session', session.session_id] });
						return;
					}
					if (data.status === 'error') {
						setError({ step: data.step, message: data.message });
						setSteps((s) => ({ ...s, [data.step]: 'error' }));
					} else {
						setSteps((s) => ({ ...s, [data.step]: data.status }));
					}
				}
			}
		} catch (e) {
			setError({ step: 'worktree', message: e instanceof Error ? e.message : 'error' });
		}
	}, [session, repoSettings, hasIssue, mode, qc]);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		run();
	}, [run]);

	const iconFor = (st: StepStatus | undefined) => {
		if (st === 'done') return <CheckCircleRoundedIcon color="success" fontSize="small" />;
		if (st === 'error') return <ErrorRoundedIcon color="error" fontSize="small" />;
		if (st === 'running') return <CircularProgress size={18} />;
		return <RadioButtonUncheckedRoundedIcon sx={{ color: 'text.disabled' }} fontSize="small" />;
	};

	return (
		<Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<Box component={motion.div} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} sx={{ minWidth: 320 }}>
				<Typography variant="h6" sx={{ fontWeight: 700, mb: 3, textAlign: 'center' }}>
					{t('title')}
				</Typography>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
					{stepKeys.map((k) => (
						<Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
							{iconFor(steps[k])}
							<Typography variant="body2" sx={{ color: steps[k] === 'done' ? 'text.primary' : 'text.secondary' }}>
								{label[k]}
							</Typography>
						</Box>
					))}
				</Box>
				{error && (
					<Box sx={{ mt: 3, textAlign: 'center' }}>
						<Typography variant="body2" color="error" sx={{ mb: 1 }}>
							{t('failed', { step: label[error.step] ?? error.step })}
							{error.message ? ` — ${error.message}` : ''}
						</Typography>
						<Button variant="outlined" size="small" onClick={() => { started.current = true; run(); }}>
							{t('retry')}
						</Button>
					</Box>
				)}
			</Box>
		</Box>
	);
}
```
> Note : `mode` est fixé à `'worktree'` ici — les lancements current-branch/existingWorktree ne passent PAS par `provisioning` (Task 4), donc CreationProgress ne rend que le cas worktree.

- [ ] **Step 3: Branchement Workbench (early-return AVANT classifySession)**

Dans `src/components/workbench/Workbench.tsx`, juste après la résolution de `resolved` et **avant** la ligne `const bucket = classifySession(resolved)` (~ligne 75), ajouter :
```tsx
	if (resolved?.status === 'provisioning') {
		return <CreationProgress session={resolved} repoSettings={repoSettings} />;
	}
```
Importer `CreationProgress`. `repoSettings` est déjà disponible (Phase 1, via `useRepoSettings(repoFullName)`). Vérifier que ce return est APRÈS le `if (!sessionId) return <empty>` et après les hooks (pas de hook conditionnel).

- [ ] **Step 4: Vérifier + run manuel**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK. (Le run manuel de bout-en-bout se fait après Task 4 qui produit des sessions provisioning.)

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/CreationProgress.tsx src/components/workbench/Workbench.tsx src/config/translate/
git commit -m "feat(provisioning): CreationProgress SSE screen + workbench branch"
```

---

## Task 4: Lancement → provisioning (modal ne crée plus le worktree)

**Files:**
- Modify: `src/components/agents/AgentTerminalModal.tsx`

**Interfaces:**
- Consumes: `ensureSession({..., status})` (Task 1).
- Produces: `handleLaunch` (worktree) ensure la session `provisioning` sans worktree_path et navigue ; `handleLaunchCurrentBranch` reste `active` (pas de provisioning worktree) ; `existingWorktree` reste `active`.

- [ ] **Step 1: `handleLaunch` → provisioning, sans createWorktree**

Dans `handleLaunch` (`AgentTerminalModal.tsx`), remplacer le corps du `try` (qui appelait `createWorktree` puis `ensureSession` avec `worktreePath: result.worktreePath` puis `goToWorkbench`) par :
```tsx
		try {
			const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
			ensureSession({
				sessionId,
				projectPath,
				projectName,
				agentName: agentFile?.name ?? (issueContext ? `#${issueContext.issueNumber}` : null),
				branch: name,
				worktreePath: null,
				status: 'provisioning',
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
```
Retirer l'usage de `createWorktree`/`setWorktreePath`/`result` devenu inutile dans cette fonction ; retirer `createWorktree` du hook `useWorktrees` s'il n'est plus utilisé ailleurs dans le fichier (vérifier — `isCreating` sert au bouton « Créer » : le bouton reste, mais `isCreating` sera toujours false ; garder l'état de chargement via `provisioning` est hors scope — laisser le bouton simple). Nettoyer les imports/vars orphelins jusqu'à tsc/lint clean.

- [ ] **Step 2: current-branch + existingWorktree restent `active`**

Vérifier `handleLaunchCurrentBranch` : son `ensureSession` ne met PAS `status` (défaut `active`) — pas de provisioning (il tourne sur le repo root). Idem l'effet `existingWorktree` (worktree déjà présent) → `active`. Ne rien changer sauf s'ils passaient un status.

- [ ] **Step 3: Vérifier + run manuel bout-en-bout**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur. Puis `npm run dev` : lancer un nouveau worktree depuis un projet (idéalement avec un `setup_script` court type `echo ok` configuré) → le Workbench affiche l'écran de progression (puces loader→✓) → bascule sur la conversation. Depuis une issue → l'étape « Lecture de l'issue » apparaît. Erreur setup → puce ✗ + Réessayer.

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/AgentTerminalModal.tsx
git commit -m "feat(provisioning): modal marks session provisioning and navigates (no inline worktree create)"
```

---

## Task 5: Archive script

**Files:**
- Modify: `packages/agent/src/routes/git.ts` (endpoint `POST /git/run-script`)
- Modify: `src/components/layout/Sidebar.tsx` (`handleArchive`)

**Interfaces:**
- Produces: `POST /git/run-script` `{ cwd, script }` → `{ ok }` / `{ error }` (exécute `script` dans `cwd`).
- Consumes: `useRepoPaths`, `useRepoSettings`, `resolveRepoFullName` (Phase 1) dans le Sidebar.

- [ ] **Step 1: Endpoint agent `/git/run-script`**

Dans `packages/agent/src/routes/git.ts` (`handleGitRoutes`), ajouter :
```ts
	// POST /git/run-script — exécute une commande dans un cwd (ex. archive_script)
	if (path === '/git/run-script' && method === 'POST') {
		try {
			const { cwd, script } = await readBody<{ cwd: string; script: string }>(req);
			if (!cwd || !script?.trim()) return sendJson(res, { ok: true });
			execSync(script, { cwd, encoding: 'utf-8', timeout: 120000 });
			sendJson(res, { ok: true });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'run-script failed');
		}
		return;
	}
```

- [ ] **Step 2: Sidebar `handleArchive` exécute archive_script**

Dans `src/components/layout/Sidebar.tsx` :
- Importer `useRepoPaths`, `useRepoSettings` n'est pas keyé pratique ici (hook par repo) — préférer un fetch ponctuel : au moment d'archiver, résoudre le repo via `resolveRepoFullName({ project_path: actionsMenu.projectPath }, repoPaths)` puis lire ses settings via un `apiFetch('/api/repo-settings?repo=...')` ponctuel (le hook `useRepoSettings` exige un repo au niveau composant ; ici c'est une action → fetch direct est plus simple). Importer `resolveRepoFullName` + `useRepoPaths` (pour `repoPaths`) + `localFetch` + `apiFetch`.
- Dans `handleArchive`, AVANT `archive(sessionId)` :
```ts
	const repoFullName = resolveRepoFullName({ project_path: actionsMenu.projectPath }, repoPaths);
	if (repoFullName) {
		try {
			const rs = await apiFetch(`/api/repo-settings?repo=${encodeURIComponent(repoFullName)}`);
			const settings = rs.ok ? await rs.json() : null;
			const script = settings?.archive_script?.trim();
			if (script && actionsMenu.worktreePath) {
				await localFetch('/git/run-script', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ cwd: actionsMenu.worktreePath, script }),
				});
			}
		} catch {
			showSnackbar(t('archiveScriptFailed'), 'warning');
		}
	}
```
Ajouter la clé i18n `sidebar.archiveScriptFailed` (5 locales). `actionsMenu` porte `projectPath`/`worktreePath`/`sessionId` (vérifier les champs réels et adapter). Rendre `handleArchive` `async` si besoin.

- [ ] **Step 3: Vérifier + commit**

Run: `cd packages/agent && npx tsc --noEmit` (0) ; `cd $REPO && npm run lint && npx tsc --noEmit`
Expected: 0 erreur. (Manuel : configurer un `archive_script` `echo bye`, archiver une session → pas d'erreur.)
```bash
git add packages/agent/src/routes/git.ts src/components/layout/Sidebar.tsx src/config/translate/
git commit -m "feat(provisioning): run archive_script before archiving"
```

---

## Self-Review (effectuée)

**Spec coverage :** statut provisioning plumbing (T1) ; endpoint SSE read-issue(REST+claude)/worktree/copy/setup + DB updates (T2) ; CreationProgress SSE + early-return Workbench + i18n (T3) ; modal → provisioning sans createWorktree, current-branch/existingWorktree restent active (T4) ; archive_script via /git/run-script + Sidebar (T5). read-issue via REST+Bearer (T2). worktree_path écrit au done (T2). Court-circuit avant classifySession (T3). Tous les points du spec couverts.

**Placeholder scan :** code complet pour l'endpoint, le helper (TDD), CreationProgress, les edits modal/sidebar. Corriger la coquille `system_prompt？`→`?` signalée. Pas de TODO.

**Type consistency :** events SSE `{step,status,message?}` + `done` cohérents T2↔T3. `status:'provisioning'` cohérent T1↔T3↔T4. `parseFilesToCopy` T2. `/git/provision` body identique T2↔T3. `/git/run-script` body identique T5.

**Vigilance exécution :** (1) coquille unicode `？` à corriger. (2) `join` importé dans git.ts. (3) T4 : bien nettoyer les orphelins (`createWorktree`, `result`, `setWorktreePath`) → 0 lint. (4) `actionsMenu` champs réels à confirmer dans Sidebar avant de câbler T5. (5) commande de test node du package agent à confirmer (`packages/agent/package.json`).
