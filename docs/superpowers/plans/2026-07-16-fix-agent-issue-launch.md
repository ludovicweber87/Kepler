# Fix lancement d'agent depuis une issue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire fonctionner la lecture d'issue au lancement d'un agent (elle est aujourd'hui sautée), et donner à la branche/session un nom dérivé du titre de l'issue au lieu de `#123`.

**Architecture:** Trois axes indépendants. (1) Le serveur agent résout lui-même le token GitHub via `gh auth token`, ce qui débloque la step `read-issue` (déjà séquentielle avant le worktree) et le commentaire d'issue. (2) `read-issue` injecte le contenu brut de l'issue dans le `system_prompt` (pas de résumé LLM). (3) Le nom de branche est dérivé du titre côté modal (`feat/{n}-{slug}`), avec dédup serveur pour l'unicité.

**Tech Stack:** Node (serveur agent :4001, http natif + SSE), better-sqlite3, React 19 / Next 16 (modal), Vitest.

## Global Constraints

- Convention de test du repo : **logique pure uniquement** (Vitest, `*.test.ts` dans `src/lib`/`src/hooks`). Le reste (serveur agent, UI) se vérifie par `npm run lint` + `npx tsc --noEmit` + `npm run build` + essai manuel. Ne PAS écrire de tests unitaires sur le serveur agent ou les composants.
- **Jamais de texte en dur** dans les composants React → `next-intl`. (Ici aucun nouveau texte UI ; le nom de session est de la donnée, le label `creationProgress.readIssue` existe déjà.)
- Un slug de branche doit satisfaire la validation `/^[\w./-]+$/` (`packages/agent/src/routes/git.ts:404`).
- Path alias `@/*` → `./src/*`.
- Ne jamais commit/push sans accord — mais commits fréquents en local demandés par ce plan.

---

### Task 1: Utilitaire `slugify` (pur, client-safe) + tests

**Files:**
- Create: `src/lib/slug.ts`
- Test: `src/lib/slug.test.ts`

**Interfaces:**
- Consumes: (rien)
- Produces: `export function slugify(text: string, maxLen?: number): string` — sortie restreinte à `[a-z0-9-]`, jamais de tiret en tête/fin, tronquée à `maxLen` (défaut 40).

- [ ] **Step 1: Écrire le test qui échoue**

Create `src/lib/slug.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
	it('lowercases and hyphenates words', () => {
		expect(slugify('Add User Login')).toBe('add-user-login');
	});
	it('strips accents', () => {
		expect(slugify('Réparer la connexion')).toBe('reparer-la-connexion');
	});
	it('collapses punctuation and multiple spaces', () => {
		expect(slugify('Fix:  crash!! (urgent)')).toBe('fix-crash-urgent');
	});
	it('trims leading/trailing separators', () => {
		expect(slugify('  --hello--  ')).toBe('hello');
	});
	it('truncates to maxLen without a trailing hyphen', () => {
		const out = slugify(`${'a'.repeat(30)} ${'b'.repeat(30)}`, 40);
		expect(out.length).toBeLessThanOrEqual(40);
		expect(out.endsWith('-')).toBe(false);
	});
	it('returns empty string for empty or symbol-only input', () => {
		expect(slugify('')).toBe('');
		expect(slugify('!!!')).toBe('');
	});
	it('only produces valid branch characters [a-z0-9-]', () => {
		expect(/^[a-z0-9-]*$/.test(slugify('Ünïcödé 🚀 Title #42'))).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:web -- src/lib/slug.test.ts`
Expected: FAIL — `Failed to resolve import "./slug"` / `slugify is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Create `src/lib/slug.ts` :

```ts
/**
 * Deterministic, client-safe slug for branch and display names.
 * Output is restricted to [a-z0-9-] so it satisfies the agent branch-name
 * validation regex /^[\w./-]+$/ (packages/agent/src/routes/git.ts).
 */
export function slugify(text: string, maxLen = 40): string {
	const slug = text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics (combining marks)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
		.replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
	if (slug.length <= maxLen) return slug;
	return slug.slice(0, maxLen).replace(/-+$/g, '');
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm run test:web -- src/lib/slug.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts
git commit -m "feat: add client-safe slugify util for issue-derived branch names"
```

---

### Task 2: Résolution du token GitHub côté agent (`findGh` + `resolveGitHubToken`)

**Files:**
- Modify: `packages/agent/src/helpers.ts:1-3` (import), ajout de `findGh` et `resolveGitHubToken`
- Modify: `packages/agent/src/routes/git.ts:11` (import), `:392` et `:641` (usage)

**Interfaces:**
- Consumes: `getToken(req)` existant (`helpers.ts:99`), `findClaude` pattern (`helpers.ts:59`).
- Produces:
  - `export function findGh(): string`
  - `export function resolveGitHubToken(req: IncomingMessage): string | null`

- [ ] **Step 1: Autoriser `execFileSync` dans helpers**

Modify `packages/agent/src/helpers.ts:3` :

```ts
import { execSync, execFileSync } from 'node:child_process';
```

- [ ] **Step 2: Ajouter `findGh()` après `findClaude()`**

Dans `packages/agent/src/helpers.ts`, juste après la fin de `findClaude()` (ligne 82) :

```ts
export function findGh(): string {
	const paths = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	try {
		const resolved = execSync('command -v gh', { encoding: 'utf-8' }).trim();
		if (resolved) return resolved;
	} catch {
		/* continue */
	}
	return 'gh';
}
```

- [ ] **Step 3: Ajouter `resolveGitHubToken()` juste après `getToken()`**

Dans `packages/agent/src/helpers.ts`, après `getToken()` (ligne 103) :

```ts
export function resolveGitHubToken(req: IncomingMessage): string | null {
	const header = getToken(req);
	if (header) return header;
	try {
		const token = execFileSync(findGh(), ['auth', 'token'], {
			encoding: 'utf-8',
			timeout: 10000,
		}).trim();
		if (token) return token;
	} catch {
		/* gh absent ou non authentifié — on tente le fallback env */
	}
	return process.env.GITHUB_TOKEN ?? null;
}
```

- [ ] **Step 4: Importer `resolveGitHubToken` dans git.ts**

Modify `packages/agent/src/routes/git.ts:11` — remplacer `getToken,` par `resolveGitHubToken,` (grep confirme que `getToken` n'est utilisé qu'aux lignes 392 et 641) :

```ts
	resolveGitHubToken,
```

- [ ] **Step 5: Utiliser `resolveGitHubToken` sur les deux sites**

Modify `packages/agent/src/routes/git.ts:392` :

```ts
		const token = resolveGitHubToken(req);
```

Modify `packages/agent/src/routes/git.ts:641` :

```ts
		const token = resolveGitHubToken(req);
```

- [ ] **Step 6: Vérifier types + build**

Run: `npx tsc --noEmit && npm run lint`
Expected: pas d'erreur (notamment aucun « `getToken` is not defined » ni import inutilisé).

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/helpers.ts packages/agent/src/routes/git.ts
git commit -m "fix(agent): resolve GitHub token via gh CLI so provision/branch have auth"
```

---

### Task 3: `read-issue` injecte le contenu brut de l'issue (sans LLM)

**Files:**
- Modify: `packages/agent/src/routes/git.ts:676-698`

**Interfaces:**
- Consumes: `token` (désormais résolu via Task 2), `body.issue = { owner, repo, number }`, `db` (better-sqlite3), colonne `agent_sessions.system_prompt`.
- Produces: `system_prompt` enrichi d'un bloc `## Contexte de l'issue #N : titre` + corps + commentaires. Émet toujours `step read-issue running` puis `done`.

- [ ] **Step 1: Remplacer le résumé `claude --print` par une injection brute**

Dans `packages/agent/src/routes/git.ts`, remplacer le bloc `if (issue) { … }` actuel (lignes 676-699, celui qui construit `prompt` et appelle `execFileSync(findClaude(), ['--print'], …)`) par :

```ts
					if (issue) {
						const commentsText = (comments as { body?: string }[])
							.map((c) => c.body ?? '')
							.filter(Boolean)
							.join('\n\n---\n\n');
						const issueBlock = [
							`## Contexte de l'issue #${number} : ${issue.title}`,
							'',
							issue.body ?? '',
							commentsText ? `\n## Commentaires\n${commentsText}` : '',
						]
							.join('\n')
							.trim();
						if (issueBlock && db) {
							const row = db
								.prepare(
									'SELECT system_prompt FROM agent_sessions WHERE session_id = ?',
								)
								.get(body.sessionId) as { system_prompt?: string } | undefined;
							const nextPrompt =
								`${row?.system_prompt ?? ''}\n\n${issueBlock}`.trim();
							db.prepare(
								'UPDATE agent_sessions SET system_prompt = ? WHERE session_id = ?',
							).run(nextPrompt, body.sessionId);
						}
					}
```

Ne PAS toucher aux lignes autour (`sendSSE(... 'read-issue', status: 'running')` avant, `sendSSE(... 'read-issue', status: 'done')` et le `catch` après restent identiques). `findClaude` reste importé (toujours utilisé par `/git/generate-branch-name`).

- [ ] **Step 2: Vérifier types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: pas d'erreur ; aucune référence orpheline à un `prompt`/`summary` supprimé.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/routes/git.ts
git commit -m "feat(agent): inject raw issue body+comments into system prompt (no LLM summary)"
```

---

### Task 4: Dédup du nom de branche côté provision (unicité)

**Files:**
- Modify: `packages/agent/src/routes/git.ts:711-720` (init `finalBranch` + boucle de dédup), `:774` (branch dans `worktreeAddArgs` du mode worktree), `:842-851` (persist `branch`), `:852` (payload `done`)

**Interfaces:**
- Consumes: `localBranchExists(cwd, branch)` (`git.ts:26`), `existsSync` (`node:fs`), `body.branch`, `body.mode`.
- Produces: `finalBranch` (string) — nom réellement utilisé pour le worktree et persisté dans `agent_sessions.branch`.

- [ ] **Step 1: Introduire `finalBranch` et dédupliquer avant de créer le worktree**

Dans `packages/agent/src/routes/git.ts`, remplacer les lignes 711-720 (de `let worktreePath = body.cwd;` jusqu'à `worktreePath = \`${body.cwd}/.worktrees/${dirName}\`;`) par :

```ts
				let worktreePath = body.cwd;
				let finalBranch = body.branch;

				const producesWorktree =
					body.mode === 'worktree' || body.mode === 'existing-branch';

				if (producesWorktree) {
					// Nom déterministe (issue) → on garantit l'unicité pour un NOUVEAU worktree.
					// (mode existing-branch = on attache une branche existante, pas de dédup.)
					if (body.mode === 'worktree') {
						let candidate = body.branch;
						let n = 2;
						while (
							localBranchExists(body.cwd, candidate) ||
							existsSync(
								`${body.cwd}/.worktrees/${candidate.replace(/\//g, '-')}`,
							)
						) {
							candidate = `${body.branch}-${n}`;
							n += 1;
						}
						finalBranch = candidate;
					}

					// 2) worktree
					sendSSE(res, 'step', { step: 'worktree', status: 'running' });
					const dirName = finalBranch.replace(/\//g, '-');
					worktreePath = `${body.cwd}/.worktrees/${dirName}`;
```

> ⚠️ Cette édition fusionne l'ancien `if (producesWorktree) {` + `sendSSE(... 'worktree', 'running')` + calcul `dirName`/`worktreePath`. Vérifier après édition que le `if (producesWorktree) {` n'apparaît plus en double et que l'accolade fermante correspondante (avant `// 5) done`) est toujours équilibrée.

- [ ] **Step 2: Utiliser `finalBranch` dans le `git worktree add` du mode worktree**

Dans le bloc `else` (nouvelle branche) — `git.ts:772-778` — remplacer `branch: body.branch,` par `branch: finalBranch,` :

```ts
							const args = worktreeAddArgs({
								worktreePath,
								branch: finalBranch,
								mode: 'worktree',
								isRemote: false,
								base: `origin/${baseBranch}`,
							});
```

(Le mode `existing-branch` garde `body.branch` puisque `finalBranch === body.branch` dans ce cas.)

- [ ] **Step 3: Persister `finalBranch` sur la session**

Modify `packages/agent/src/routes/git.ts:842-851` :

```ts
				// 5) done → session active + worktree_path + branch (dédup éventuel)
				db?.prepare(
					'UPDATE agent_sessions SET status = ?, worktree_path = ?, branch = ? WHERE session_id = ?',
				).run(
					'active',
					producesWorktree ? worktreePath : null,
					finalBranch,
					body.sessionId,
				);
				sendSSE(res, 'done', { step: 'done', worktreePath, branch: finalBranch });
```

- [ ] **Step 4: Vérifier types + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build OK. (Le build Next valide aussi que `CreationProgress` compile ; il rafraîchit la session via l'invalidation `['agent-session', sessionId]` au `done`, donc le nom dédupé apparaît.)

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/routes/git.ts
git commit -m "fix(agent): dedupe deterministic worktree branch name to avoid relaunch collisions"
```

---

### Task 5: Naming issue côté modal + nettoyage du system prompt

**Files:**
- Modify: `src/components/agents/AgentTerminalModal.tsx` — import (`slugify`), helpers module-scope (~ligne 110), `composeSystemPrompt` (321-329), `handleLaunch` (331-373), `handleLaunchExistingBranch` (410-427)

**Interfaces:**
- Consumes: `slugify` (Task 1), `IssueContext { owner, repo, issueNumber, issueTitle }`.
- Produces: (aucun export ; comportement du modal)

- [ ] **Step 1: Importer `slugify`**

Ajouter en haut de `src/components/agents/AgentTerminalModal.tsx` (avec les autres imports `@/`) :

```ts
import { slugify } from '@/lib/slug';
```

- [ ] **Step 2: Ajouter deux helpers module-scope**

Juste après `randomWorktreeName()` (`AgentTerminalModal.tsx:110`) :

```ts
function issueBranchName(issue: { issueNumber: number; issueTitle: string }): string {
	const slug = slugify(issue.issueTitle);
	return slug ? `feat/${issue.issueNumber}-${slug}` : `feat/${issue.issueNumber}`;
}

function issueDisplayName(issue: { issueNumber: number; issueTitle: string }): string {
	const t = issue.issueTitle.trim();
	if (!t) return `#${issue.issueNumber}`;
	return t.length > 72 ? `${t.slice(0, 71)}…` : t;
}
```

- [ ] **Step 3: Calculer le nom APRÈS résolution de l'issue dans `handleLaunch`**

Dans `handleLaunch`, supprimer la ligne 336 `const name = trimmedName || randomWorktreeName();` et, juste après le bloc `if (match) { … }` (après la ligne 349 `linked = linkedIssueRef.current ?? (await fetchIssueContext(url)) ?? linked;` et sa `}`), ajouter :

```ts
		const name =
			trimmedName || (linked ? issueBranchName(linked) : randomWorktreeName());
```

Puis dans l'appel `ensureSession({ … })` du même `handleLaunch`, remplacer la ligne `agentName` (357-358) par :

```ts
				agentName: agentFile?.name ?? (linked ? issueDisplayName(linked) : null),
```

(`branch: name` reste inchangé — `name` vaut maintenant `feat/{n}-{slug}` quand on part d'une issue.)

- [ ] **Step 4: Corriger `agentName` dans `handleLaunchExistingBranch`**

Modify `src/components/agents/AgentTerminalModal.tsx:415-416` (dans `handleLaunchExistingBranch`) — la branche reste `selectedExistingBranch.name`, seul le nom d'affichage change :

```ts
				agentName:
					agentFile?.name ?? (issueContext ? issueDisplayName(issueContext) : null),
```

- [ ] **Step 5: Alléger `composeSystemPrompt` (retirer l'instruction `gh issue view` redondante)**

Modify `src/components/agents/AgentTerminalModal.tsx:325-327` — remplacer la définition de `sourceIssueBlock` par (on retire la phrase « Avant d'agir, lis cette issue… `gh issue view`… », le contenu étant injecté côté serveur) :

```ts
			const sourceIssueBlock = effectiveIssue
				? `\n\n## Contexte\nCette session a été ouverte depuis l'issue GitHub ${effectiveIssue.owner}/${effectiveIssue.repo}#${effectiveIssue.issueNumber}${effectiveIssue.issueTitle ? ` : « ${effectiveIssue.issueTitle} »` : ''}.`
				: '';
```

- [ ] **Step 6: Vérifier types + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: OK. Vérifier qu'il ne reste aucune référence à l'ancien `const name` déplacé et que `handleLaunch` compile (le `name` est bien défini avant `ensureSession`).

- [ ] **Step 7: Commit**

```bash
git add src/components/agents/AgentTerminalModal.tsx
git commit -m "feat: derive branch/session name from issue title instead of #number"
```

---

### Task 6: Vérification manuelle end-to-end

**Files:** (aucun — validation runtime)

- [ ] **Step 1: Lancer l'app**

Run: `npm run dev`
Expected: Next sur :4000, serveur agent sur :4001, pas d'erreur au démarrage.

- [ ] **Step 2: Lancer un agent depuis une issue**

Depuis une issue GitHub (ou depuis un repo en collant un lien d'issue), lancer un agent. Observer le Workbench (`CreationProgress`) :
- La step « Lecture de l'issue » passe **running → done** (spinner visible), PUIS « Création du worktree » démarre. Le loader reste tant que la lecture n'est pas finie.
- La branche/session porte un nom `feat/{numéro}-{slug-du-titre}` (et non `#123` ni `wip-…`).

- [ ] **Step 3: Vérifier l'injection du contexte**

Dans la conversation de l'agent (system prompt) / la DB : le `system_prompt` contient `## Contexte de l'issue #N : <titre>` + corps + commentaires. L'agent démarre avec ce contexte sans avoir à lancer `gh issue view`.

- [ ] **Step 4: Vérifier la non-collision**

Relancer un agent depuis la même issue → un second worktree est créé avec un nom suffixé (`feat/{n}-{slug}-2`), sans erreur `git worktree add`.

- [ ] **Step 5: Vérifier la non-régression (sans issue)**

Lancer un agent sans issue (mode worktree, nom laissé vide) → nom `wip-…` comme avant, renommé au premier message utilisateur.

---

## Self-Review

**Spec coverage :**
- Fix 1 (token via gh) → Task 2. ✅
- Fix 2 (read-issue injection brute) → Task 3. ✅
- Fix 3 (naming `feat/{n}-{slug}` + session = titre) → Task 1 (slug) + Task 5. ✅
- Fix 3 ordre (nom calculé après fetch) → Task 5 Step 3. ✅
- Fix 3b (dédup + recalcul dirName/worktreePath) → Task 4. ✅
- Nettoyage `composeSystemPrompt` → Task 5 Step 5. ✅
- Effet de bord `/git/branch` (commentaire d'issue) → Task 2 Step 5 (`:392`). ✅
- Tests slug + regex de branche → Task 1. ✅

**Placeholder scan :** aucun TODO/TBD ; code complet à chaque step. ✅

**Type consistency :** `slugify(text, maxLen?)` défini Task 1 et consommé Task 5 via `issueBranchName`. `finalBranch: string` défini/consommé dans Task 4. `resolveGitHubToken(req): string | null` défini Task 2, consommé aux deux sites. `issueDisplayName`/`issueBranchName` signatures cohérentes avec `IssueContext`. ✅
