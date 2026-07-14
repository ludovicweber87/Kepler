# Diff scoping, bouton Changes & indicateur worktree mergé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger le diff d'un worktree (ne plus montrer les changes des autres worktrees), déplacer « Changes » en bouton dans la sidebar droite du Workbench, et marquer visuellement les worktrees mergés dans la sidebar gauche.

**Architecture:** Trois unités indépendantes. (1) Serveur agent : le calcul de diff compare `HEAD` au vrai point de fork distant (`origin/<base>`) via une fonction pure testable. (2) Workbench UI : le déclencheur de la tab « Changes » passe de la barre centrale à la rangée de chips de la sidebar droite. (3) Sidebar gauche : une route Next + un hook multi-repos exposent l'ensemble des branches mergées (état PR GitHub) ; le rendu barre le nom de branche et ajoute une pastille verte.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19 + TypeScript 5, MUI 7, TanStack React Query 5, next-intl, serveur agent Node (http natif, `execFileSync`/`execSync`), Vitest.

## Global Constraints

- **Tests : logique pure uniquement** (Vitest, `*.test.ts` sur lib/hooks/agent). L'UI se vérifie par `npm run lint` + `npx tsc --noEmit` + `npm run build` + run manuel. Pas de test UI.
- **Jamais de texte en dur** dans les composants : toujours `next-intl` (`useTranslations`), traductions dans `src/config/translate/{en,fr,es,de,pt}.json` (5 locales).
- **Ne jamais commiter/push sans accord explicite** — MAIS ce plan est exécuté en TDD avec commits fréquents ; les commits locaux sur la branche de travail sont attendus (pas de push).
- Path alias `@/*` → `./src/*`. Composants interactifs : `"use client"`.
- Ne pas réutiliser `fetchRepoPullRequests()` pour la détection mergé (elle pagine toutes les PRs closed et fait un appel check-runs par PR — trop lourd).
- Base distante résolue en sondant l'existence des refs (`git rev-parse --verify`), pas en supposant.

---

## File Structure

- `packages/agent/src/routes/git.ts` — **Modify** : remplacer `getBaseBranch` par la résolution de base distante dans `GET /git/diff`.
- `packages/agent/src/gitBase.ts` — **Create** : fonction pure `selectRemoteBase(...)` (testable).
- `packages/agent/src/gitBase.test.ts` — **Create** : test unitaire de `selectRemoteBase`.
- `src/components/workbench/Workbench.tsx` — **Modify** : retirer le chip « Changes » central, ajouter le bouton « Changes » dans la sidebar droite.
- `src/lib/github.ts` — **Modify** : ajouter `extractMergedBranches` (pur) + `fetchMergedBranchRefs` (fetch léger).
- `src/lib/github.test.ts` — **Create** : test unitaire de `extractMergedBranches`.
- `src/app/api/github/merged-branches/route.ts` — **Create** : route `GET`.
- `src/hooks/useMergedBranches.ts` — **Create** : hook React Query multi-repos.
- `src/components/layout/Sidebar.tsx` — **Modify** : appeler le hook, barrer + pastiller les worktrees mergés.
- `src/config/translate/{en,fr,es,de,pt}.json` — **Modify** : clé `sidebar.merged`.

---

### Task 1: Fix diff — base de comparaison distante (serveur agent)

**Files:**
- Create: `packages/agent/src/gitBase.ts`
- Test: `packages/agent/src/gitBase.test.ts`
- Modify: `packages/agent/src/routes/git.ts` (endpoint `GET /git/diff`, lignes 430-480 ; `getBaseBranch` lignes 55-69)

**Interfaces:**
- Produces: `selectRemoteBase(opts: { symbolicRef: string | null; hasOriginMain: boolean; hasOriginMaster: boolean }): string` — renvoie un ref distant court (`'origin/main'` | `'origin/master'` | dérivé du symbolic-ref).
- Produces: `resolveRemoteBaseRef(cwd: string): string` — wrapper impur (appels git) utilisé par `/git/diff`.
- Consumes: rien des autres tâches.

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/gitBase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectRemoteBase } from './gitBase.js';

describe('selectRemoteBase', () => {
	it('dérive la base depuis le symbolic-ref origin/HEAD', () => {
		expect(
			selectRemoteBase({
				symbolicRef: 'refs/remotes/origin/main',
				hasOriginMain: true,
				hasOriginMaster: false,
			}),
		).toBe('origin/main');
	});

	it('gère un repo dont la HEAD distante pointe sur master', () => {
		expect(
			selectRemoteBase({
				symbolicRef: 'refs/remotes/origin/master',
				hasOriginMain: false,
				hasOriginMaster: true,
			}),
		).toBe('origin/master');
	});

	it('sans symbolic-ref, préfère origin/main s’il existe', () => {
		expect(
			selectRemoteBase({
				symbolicRef: null,
				hasOriginMain: true,
				hasOriginMaster: true,
			}),
		).toBe('origin/main');
	});

	it('sans symbolic-ref ni origin/main, retombe sur origin/master', () => {
		expect(
			selectRemoteBase({
				symbolicRef: null,
				hasOriginMain: false,
				hasOriginMaster: true,
			}),
		).toBe('origin/master');
	});

	it('défaut origin/main quand aucun signal', () => {
		expect(
			selectRemoteBase({
				symbolicRef: null,
				hasOriginMain: false,
				hasOriginMaster: false,
			}),
		).toBe('origin/main');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/gitBase.test.ts`
Expected: FAIL — `Failed to resolve import './gitBase.js'` (module inexistant).

- [ ] **Step 3: Write minimal implementation of the pure function**

Create `packages/agent/src/gitBase.ts`:

```ts
import { execFileSync } from 'node:child_process';

export interface RemoteBaseSignals {
	/** Sortie de `git symbolic-ref refs/remotes/origin/HEAD`, ex. 'refs/remotes/origin/main', sinon null. */
	symbolicRef: string | null;
	hasOriginMain: boolean;
	hasOriginMaster: boolean;
}

/**
 * Choisit le ref de base distant (court, ex. 'origin/main') à partir des signaux git.
 * Priorité : symbolic-ref origin/HEAD > origin/main > origin/master > 'origin/main' (défaut).
 * Fonction pure — testable sans git.
 */
export function selectRemoteBase(signals: RemoteBaseSignals): string {
	if (signals.symbolicRef) {
		const short = signals.symbolicRef.replace('refs/remotes/', '').trim();
		if (short) return short;
	}
	if (signals.hasOriginMain) return 'origin/main';
	if (signals.hasOriginMaster) return 'origin/master';
	return 'origin/main';
}

function refExists(cwd: string, ref: string): boolean {
	try {
		execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			stdio: ['pipe', 'pipe', 'ignore'],
		});
		return true;
	} catch {
		return false;
	}
}

/** Résout le ref de base distant réel du repo situé en `cwd` (sonde les refs). */
export function resolveRemoteBaseRef(cwd: string): string {
	let symbolicRef: string | null = null;
	try {
		symbolicRef = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			stdio: ['pipe', 'pipe', 'ignore'],
		}).trim();
	} catch {
		symbolicRef = null;
	}
	return selectRemoteBase({
		symbolicRef,
		hasOriginMain: refExists(cwd, 'refs/remotes/origin/main'),
		hasOriginMaster: refExists(cwd, 'refs/remotes/origin/master'),
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/gitBase.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire `resolveRemoteBaseRef` into `GET /git/diff`**

In `packages/agent/src/routes/git.ts`, add the import near the top (after line 17, `import { parseFilesToCopy }`):

```ts
import { resolveRemoteBaseRef } from '../gitBase.js';
```

Then replace the body of the `GET /git/diff` block (current lines 436-475, from `try {` to the `sendJson(res, { diff, stats });`) with:

```ts
			try {
				const baseRef = resolveRemoteBaseRef(cwd);
				let diff = '';
				let stats = '';

				const isWorktreeDir = existsSync(cwd);

				if (isWorktreeDir) {
					const mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
						cwd,
						encoding: 'utf-8',
						timeout: 5000,
					}).trim();

					diff = execFileSync('git', ['diff', mergeBase], {
						cwd,
						encoding: 'utf-8',
						timeout: 15000,
						maxBuffer: 5 * 1024 * 1024,
					});
					stats = execFileSync('git', ['diff', '--stat', mergeBase], {
						cwd,
						encoding: 'utf-8',
						timeout: 5000,
					});
				} else if (branch) {
					// Diff hors répertoire worktree : compare la base distante à la branche.
					// Note : si `branch` vaut le nom court de la base (ex. 'main'), le diff
					// `origin/main..main` est vide/correct — comportement inoffensif attendu.
					diff = execSync(`git diff ${baseRef}..${branch}`, {
						cwd: process.cwd(),
						encoding: 'utf-8',
						timeout: 15000,
						maxBuffer: 5 * 1024 * 1024,
					});
					stats = execSync(`git diff --stat ${baseRef}..${branch}`, {
						cwd: process.cwd(),
						encoding: 'utf-8',
						timeout: 5000,
					});
				}

				sendJson(res, { diff, stats });
```

- [ ] **Step 6: Remove the now-unused `getBaseBranch`**

Delete the `getBaseBranch` function (lines 55-69). Then confirm no other reference remains.

Run: `grep -n "getBaseBranch" packages/agent/src/routes/git.ts`
Expected: no output.

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit -p packages/agent/tsconfig.json`
Expected: no errors. (If `packages/agent` has no dedicated tsconfig, run `npx tsc --noEmit` from repo root.)

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/gitBase.ts packages/agent/src/gitBase.test.ts packages/agent/src/routes/git.ts
git commit -m "fix(agent): scope worktree diff to remote fork point (origin/<base>)"
```

---

### Task 2: Bouton « Changes » dans la sidebar droite (Workbench)

**Files:**
- Modify: `src/components/workbench/Workbench.tsx`

**Interfaces:**
- Consumes: état local existant `centerTab: 'chat' | 'changes'`, `setCenterTab`, `changedFiles` (de `useGitDiff`), `t = useTranslations('workbench')`.
- Produces: rien pour d'autres tâches.

Contexte actuel : la barre d'onglets centrale (lignes ~307-341) contient deux chips « Chat » et « Changes (N) ». La rangée de chips de la sidebar droite (lignes ~394-423) contient « Activity » et éventuellement « Issue ».

- [ ] **Step 1: Retirer le chip « Changes » de la barre centrale**

Dans `src/components/workbench/Workbench.tsx`, remplacer tout le bloc de la barre d'onglets centrale (le `<Box>` contenant les deux chips, actuellement lignes ~307-341) par une version ne gardant que « Chat » :

```tsx
					{/* Onglets centraux */}
					<Box
						sx={{
							display: 'flex',
							gap: 0.75,
							px: 1,
							py: 0.75,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
						}}
					>
						<Chip
							label={t('tabChat')}
							size="small"
							color={centerTab === 'chat' ? 'primary' : 'default'}
							variant={centerTab === 'chat' ? 'filled' : 'outlined'}
							onClick={() => setCenterTab('chat')}
						/>
					</Box>
```

- [ ] **Step 2: Ajouter le bouton « Changes » dans la rangée de chips de la sidebar droite**

Toujours dans `Workbench.tsx`, dans le `<Box>` de chips de la sidebar droite (celui contenant le chip Activity, actuellement lignes ~395-423), ajouter le chip « Changes » **avant** le chip Activity. Le bouton n'apparaît que s'il y a des changements ou si la tab est déjà ouverte :

```tsx
						{(changedFiles.length > 0 || centerTab === 'changes') && (
							<Chip
								icon={<DescriptionRoundedIcon sx={{ fontSize: '16px !important' }} />}
								label={
									changedFiles.length > 0
										? `${t('tabChanges')} (${changedFiles.length})`
										: t('tabChanges')
								}
								size="small"
								color={centerTab === 'changes' ? 'primary' : 'default'}
								variant={centerTab === 'changes' ? 'filled' : 'outlined'}
								onClick={() => setCenterTab('changes')}
							/>
						)}
```

Placer ce bloc juste après l'ouverture du `<Box>` de chips et avant le `<Chip ... label={t('chipActivity')} ...>`.

- [ ] **Step 3: Vérifier que `DescriptionRoundedIcon` est toujours importé**

Run: `grep -n "DescriptionRoundedIcon" src/components/workbench/Workbench.tsx`
Expected: au moins la ligne d'import (ligne ~20). Si l'import avait été retiré, le rajouter :

```tsx
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
```

- [ ] **Step 4: Vérifier types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no warnings sur `Workbench.tsx`.

- [ ] **Step 5: Vérification manuelle**

Run: `npm run dev` puis ouvrir un worktree avec des changements dans le Workbench.
Expected : plus de chip « Changes » à côté de « Chat » ; un bouton « Changes (N) » présent dans la sidebar droite à côté d'« Activity » ; clic → le diff s'ouvre dans le panneau central ; clic sur « Chat » → retour à la conversation.

- [ ] **Step 6: Commit**

```bash
git add src/components/workbench/Workbench.tsx
git commit -m "feat(workbench): move Changes trigger to right sidebar button"
```

---

### Task 3: Backend détection branches mergées (lib + route Next)

**Files:**
- Modify: `src/lib/github.ts` (ajouts après `fetchRepoPullRequests`, ~ligne 470)
- Test: `src/lib/github.test.ts`
- Create: `src/app/api/github/merged-branches/route.ts`

**Interfaces:**
- Produces: `extractMergedBranches(prs: Array<{ merged_at: string | null; head: { ref: string } }>): string[]` — renvoie les `head.ref` uniques dont `merged_at != null`.
- Produces: `fetchMergedBranchRefs(owner: string, repo: string, token: string): Promise<string[]>` — 1 appel `GET /pulls?state=closed&per_page=100`, applique `extractMergedBranches`.
- Produces (HTTP): `GET /api/github/merged-branches?repo=owner/name` → `{ branches: string[] }`.
- Consumes: `requireAuth`, `isAuthError` (`@/lib/auth-utils`), `GITHUB_API`, `getHeaders` (déjà dans `github.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/github.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMergedBranches } from './github';

describe('extractMergedBranches', () => {
	it('ne garde que les PRs réellement mergées', () => {
		const prs = [
			{ merged_at: '2026-07-10T00:00:00Z', head: { ref: 'feat/a' } },
			{ merged_at: null, head: { ref: 'feat/b' } },
			{ merged_at: '2026-07-11T00:00:00Z', head: { ref: 'fix/c' } },
		];
		expect(extractMergedBranches(prs).sort()).toEqual(['feat/a', 'fix/c']);
	});

	it('déduplique les refs de branche', () => {
		const prs = [
			{ merged_at: '2026-07-10T00:00:00Z', head: { ref: 'feat/a' } },
			{ merged_at: '2026-07-12T00:00:00Z', head: { ref: 'feat/a' } },
		];
		expect(extractMergedBranches(prs)).toEqual(['feat/a']);
	});

	it('renvoie un tableau vide sans PR mergée', () => {
		expect(extractMergedBranches([{ merged_at: null, head: { ref: 'x' } }])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github.test.ts`
Expected: FAIL — `extractMergedBranches is not a function` / import introuvable.

- [ ] **Step 3: Implémenter `extractMergedBranches` + `fetchMergedBranchRefs`**

Dans `src/lib/github.ts`, ajouter après la fonction `fetchRepoPullRequests` (juste après son `}` de fermeture, ~ligne 470) :

```ts
// --- Merged branches (léger : 1 page de PRs closed, sans check-runs) ---

/** Extrait les refs de branche (head.ref) uniques des PRs réellement mergées. Pur. */
export function extractMergedBranches(
	prs: Array<{ merged_at: string | null; head: { ref: string } }>,
): string[] {
	const set = new Set<string>();
	for (const pr of prs) {
		if (pr.merged_at && pr.head?.ref) set.add(pr.head.ref);
	}
	return [...set];
}

/**
 * Renvoie l'ensemble des branches (head.ref) mergées d'un repo.
 * Volontairement léger : une seule page (100 PRs closed les plus récentes), sans check-runs.
 */
export async function fetchMergedBranchRefs(
	owner: string,
	repo: string,
	token: string,
): Promise<string[]> {
	const res = await fetch(
		`${GITHUB_API}/repos/${owner}/${repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
		{ headers: getHeaders(token) },
	);
	if (!res.ok) throw new Error(`GitHub /pulls failed: ${res.status}`);
	const data = (await res.json()) as Array<{ merged_at: string | null; head: { ref: string } }>;
	return extractMergedBranches(data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Créer la route Next**

Create `src/app/api/github/merged-branches/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchMergedBranchRefs } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = req.nextUrl.searchParams.get('repo');
	if (!repo || !repo.includes('/')) {
		return NextResponse.json({ error: 'repo parameter required (owner/name)' }, { status: 400 });
	}

	try {
		const [owner, name] = repo.split('/');
		const branches = await fetchMergedBranchRefs(owner, name, auth.accessToken);
		return NextResponse.json({ branches });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
```

- [ ] **Step 6: Vérifier types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/github.ts src/lib/github.test.ts src/app/api/github/merged-branches/route.ts
git commit -m "feat(api): merged-branches endpoint from closed PR state"
```

---

### Task 4: Hook multi-repos + rendu worktree mergé (Sidebar)

**Files:**
- Create: `src/hooks/useMergedBranches.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/config/translate/{en,fr,es,de,pt}.json`

**Interfaces:**
- Consumes (HTTP): `GET /api/github/merged-branches?repo=owner/name` → `{ branches: string[] }` (Task 3).
- Produces: `useMergedBranches(repoFullNames: string[]): { mergedForRepo: (repoFullName: string) => Set<string> }`.
- Consumes: `apiFetch` (`@/lib/api-fetch`), `useQueries` (`@tanstack/react-query`), `useAgentViews` (fournit `views[].repoFullName`) dans la Sidebar.

- [ ] **Step 1: Créer le hook multi-repos**

Create `src/hooks/useMergedBranches.ts`:

```ts
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Récupère, pour une liste de repos, l'ensemble des branches mergées (état PR GitHub).
 * Appelé UNE seule fois au niveau composant (Rules of Hooks) : la liste des repos
 * est passée en entrée, et `mergedForRepo(repo)` lit le résultat correspondant.
 */
export function useMergedBranches(repoFullNames: string[]) {
	// Stabilise la liste pour éviter des requêtes redondantes.
	const repos = useMemo(
		() => [...new Set(repoFullNames.filter((r) => r && r.includes('/')))].sort(),
		[repoFullNames],
	);

	const results = useQueries({
		queries: repos.map((repo) => ({
			queryKey: ['merged-branches', repo],
			queryFn: async () => {
				const res = await apiFetch(
					`/api/github/merged-branches?repo=${encodeURIComponent(repo)}`,
				);
				if (!res.ok) throw new Error('Failed to fetch merged branches');
				const data = (await res.json()) as { branches: string[] };
				return new Set(data.branches);
			},
			staleTime: 5 * 60_000,
		})),
	});

	const byRepo = useMemo(() => {
		const map = new Map<string, Set<string>>();
		repos.forEach((repo, i) => {
			map.set(repo, results[i]?.data ?? new Set<string>());
		});
		return map;
	}, [repos, results]);

	const mergedForRepo = useMemo(
		() => (repoFullName: string) => byRepo.get(repoFullName) ?? new Set<string>(),
		[byRepo],
	);

	return { mergedForRepo };
}
```

- [ ] **Step 2: Vérifier types du hook**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Ajouter la clé i18n `sidebar.merged` dans les 5 locales**

Dans chaque fichier `src/config/translate/<locale>.json`, ajouter une clé `"merged"` dans l'objet `"sidebar"` (après `"worktreeActions"`), avec ces valeurs exactes :

- `en.json` : `"merged": "Merged"`
- `fr.json` : `"merged": "Mergée"`
- `es.json` : `"merged": "Fusionada"`
- `de.json` : `"merged": "Gemergt"`
- `pt.json` : `"merged": "Integrada"`

- [ ] **Step 4: Brancher le hook dans la Sidebar**

Dans `src/components/layout/Sidebar.tsx` :

Ajouter l'import (après la ligne 42, `import { useAllWorktrees }`):

```tsx
import { useMergedBranches } from '@/hooks/useMergedBranches';
```

Après la ligne 70 (`const { byPath, deleteWorktree } = useAllWorktrees(...)`), ajouter l'appel unique du hook au niveau composant :

```tsx
	const { mergedForRepo } = useMergedBranches(views.map((v) => v.repoFullName));
```

- [ ] **Step 5: Calculer `isMerged` par repo dans le `.map()`**

Dans le `views.map((view) => { ... })` (à partir de la ligne 301), après la ligne `const expanded = !collapsedProjects.has(view.path);` (ligne ~308), ajouter :

```tsx
								const mergedBranches = mergedForRepo(view.repoFullName);
```

- [ ] **Step 6: Appliquer le rendu mergé sur chaque worktree**

Dans le `worktrees.map((wt) => { ... })` (à partir de la ligne 394), après la ligne `const sessionIdForWt = wtSession?.session_id ?? null;` (ligne ~406), ajouter :

```tsx
														const isMerged = mergedBranches.has(wt.branch);
```

Puis modifier l'icône `AccountTreeRoundedIcon` (lignes ~443-450) pour teindre en vert quand mergé :

```tsx
																<AccountTreeRoundedIcon
																	sx={{
																		fontSize: 13,
																		color: isMerged
																			? 'success.main'
																			: isActiveWt
																				? 'success.main'
																				: 'text.disabled',
																	}}
																/>
```

Et modifier le `<Typography>` du nom (lignes ~451-464) pour barrer + estomper quand mergé, avec tooltip :

```tsx
																<Tooltip
																	title={isMerged ? t('merged') : ''}
																	disableHoverListener={!isMerged}
																>
																	<Typography
																		variant="caption"
																		sx={{
																			flex: 1,
																			overflow: 'hidden',
																			textOverflow: 'ellipsis',
																			whiteSpace: 'nowrap',
																			textDecoration: isMerged
																				? 'line-through'
																				: 'none',
																			opacity: isMerged ? 0.6 : 1,
																			color: isActiveWt
																				? 'text.primary'
																				: 'text.secondary',
																		}}
																	>
																		{displayName}
																	</Typography>
																</Tooltip>
```

(Le composant `Tooltip` est déjà importé — ligne 16.)

- [ ] **Step 7: Vérifier types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no warnings sur `Sidebar.tsx` / `useMergedBranches.ts`.

- [ ] **Step 8: Vérifier que les 5 JSON sont valides**

Run: `for f in en fr es de pt; do node -e "JSON.parse(require('fs').readFileSync('src/config/translate/$f.json','utf8')); console.log('$f ok')"; done`
Expected: `en ok` … `pt ok` (aucune erreur de parsing).

- [ ] **Step 9: Vérification manuelle**

Run: `npm run dev`, ouvrir la sidebar avec un repo ayant une branche de worktree dont la PR est mergée.
Expected : la ligne du worktree mergé montre le nom barré + estompé + icône verte + tooltip « Mergée » ; les worktrees non mergés inchangés.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useMergedBranches.ts src/components/layout/Sidebar.tsx src/config/translate/en.json src/config/translate/fr.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "feat(sidebar): mark merged worktrees (strikethrough + green dot)"
```

---

## Vérification finale (après les 4 tasks)

- [ ] **Build complet**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tous les tests passent, pas d'erreur de types, pas de warning de lint, build OK.

---

## Self-Review (rempli par l'auteur du plan)

**Spec coverage:**
- Section 1 (fix diff origin/<base>, ref probing, edge case origin/main..main) → Task 1. ✅
- Section 2 (Changes = bouton sidebar droite, retrait du chip central, chip Chat conservé) → Task 2. ✅
- Section 3 (route merged-branches sans réutiliser fetchRepoPullRequests, hook multi-repos Map/getter, rendu pastille+strikethrough, i18n 5 locales, pas de cleanup) → Tasks 3 & 4. ✅

**Placeholder scan:** aucun TODO/TBD ; tout le code est fourni ; commandes et sorties attendues explicites.

**Type consistency:** `selectRemoteBase`/`resolveRemoteBaseRef` (Task 1) ; `extractMergedBranches`/`fetchMergedBranchRefs` (Task 3) consommées à l'identique par la route et le hook ; `useMergedBranches(repoFullNames: string[])` → `mergedForRepo(repo): Set<string>` utilisé tel quel dans la Sidebar (Task 4). Cohérent.
