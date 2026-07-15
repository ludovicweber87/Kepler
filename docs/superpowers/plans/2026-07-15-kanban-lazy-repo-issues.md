# Kanban Issues — fetch paresseux par tab + issues hors Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le Kanban Issues (`/issues`) ne fetche plus que le repo de la tab active (lazy per-tab), et remonte aussi les issues ouvertes assignées **hors Project V2** (bug Devora).

**Architecture:** Une route serveur `/api/github/repo-issues` fait le REST des issues assignées d'un seul repo, enrichit le statut via `fetchProjectColumns`, et **réconcilie tout côté serveur** (lane, `statusColumns`, `__config` de drag) via des helpers purs. Un hook `useRepoIssues(repo)` fait une query React Query par repo (lazy + cache). `IssuesList` consomme ce hook au lieu de `useProjectBoards`.

**Tech Stack:** Next.js 16 route handlers, React Query 5, TypeScript strict, Drizzle (SQLite), Vitest (logique pure uniquement).

## Global Constraints

- **Tests = logique pure uniquement** (Vitest, `*.test.ts` sur `lib/`). L'UI, les routes et les hooks se vérifient par `npm run lint`, `npx tsc --noEmit`, `npm run build` et run manuel. (Convention repo, CLAUDE.md.)
- **Jamais de texte en dur** dans les composants — `next-intl` uniquement. Ici aucune nouvelle string UI n'est introduite (on réutilise les clés `issues.*` existantes).
- **Ne jamais commiter/push sans accord** — les steps `git commit` restent locaux ; pas de push.
- Path alias `@/*` → `./src/*`. Types centralisés dans `src/types/index.ts`.
- Réconciliation lane/statut : la colonne d'une issue ET `statusColumns` viennent **du même Project** (celui de la config couvrante). Sans config couvrante → « No Status ».

---

### Task 1: Helpers purs de réconciliation (`repoIssueBoard.ts`)

Cœur logique de la feature — entièrement testable en unité.

**Files:**
- Create: `src/lib/repoIssueBoard.ts`
- Test: `src/lib/repoIssueBoard.test.ts`

**Interfaces:**
- Consumes : `GitHubIssue`, `ProjectColumn` (`@/types`) ; `BoardIssue` (`@/lib/boardMerge`).
- Produces :
  - `resolveConfigForRepo<T extends { viewRepoMappings: { repos?: string[] }[] }>(repoFullName: string, configs: T[]): T | null`
  - `interface CoveringConfig { org: string; projectNumber: number; ownerType?: 'organization' | 'user'; projectTitle: string; statusColumns: string[]; }`
  - `reconcileRepoIssues(issues: GitHubIssue[], columnsByNodeId: Map<string, ProjectColumn[]>, config: CoveringConfig | null): { issues: BoardIssue[]; statusColumns: string[] }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/repoIssueBoard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveConfigForRepo, reconcileRepoIssues } from './repoIssueBoard';
import type { GitHubIssue, ProjectColumn } from '@/types';

function issue(node_id: string): GitHubIssue {
	return {
		id: 1,
		node_id,
		number: 1,
		title: 't',
		body: null,
		state: 'open',
		html_url: '',
		updated_at: '',
		created_at: '',
		closed_at: null,
		labels: [],
		assignee: null,
		assignees: [],
		user: { login: '', avatar_url: '' },
		repository_url: '',
		repo_full_name: 'o/r',
	} as GitHubIssue;
}

const cfg = {
	org: 'o',
	projectNumber: 5,
	ownerType: 'organization' as const,
	projectTitle: 'My Project',
	statusColumns: ['Todo', 'Done'],
};

describe('resolveConfigForRepo', () => {
	const configs = [
		{ id: 'a', viewRepoMappings: [{ repos: ['x/y'] }] },
		{ id: 'b', viewRepoMappings: [{ repos: ['O/R', 'p/q'] }] },
	];
	it('retourne la première config dont un mapping contient le repo (insensible à la casse)', () => {
		expect(resolveConfigForRepo('o/r', configs)?.id).toBe('b');
	});
	it('retourne null si aucun mapping ne couvre le repo', () => {
		expect(resolveConfigForRepo('none/here', configs)).toBeNull();
	});
	it('tolère les mappings vides / repos absents', () => {
		expect(resolveConfigForRepo('o/r', [{ viewRepoMappings: [{}] }])).toBeNull();
	});
});

describe('reconcileRepoIssues', () => {
	it('range une issue sur la colonne du Project couvrant et attache __config', () => {
		const cols = new Map<string, ProjectColumn[]>([
			['n1', [{ project: 'My Project', column: 'Done' }]],
		]);
		const { issues, statusColumns } = reconcileRepoIssues([issue('n1')], cols, cfg);
		expect(issues[0].project_columns).toEqual([{ project: 'My Project', column: 'Done' }]);
		expect(issues[0].__config).toEqual({ org: 'o', projectNumber: 5, ownerType: 'organization' });
		expect(statusColumns).toEqual(['Todo', 'Done']);
	});
	it('ignore les colonnes provenant d’un autre Project que la config couvrante', () => {
		const cols = new Map<string, ProjectColumn[]>([
			['n1', [{ project: 'Other', column: 'QA' }]],
		]);
		const { issues } = reconcileRepoIssues([issue('n1')], cols, cfg);
		expect(issues[0].project_columns).toEqual([]);
		expect(issues[0].__config).toBeUndefined();
	});
	it('sans config couvrante → No Status, pas de __config, statusColumns vide', () => {
		const cols = new Map<string, ProjectColumn[]>([
			['n1', [{ project: 'Whatever', column: 'Done' }]],
		]);
		const { issues, statusColumns } = reconcileRepoIssues([issue('n1')], cols, null);
		expect(issues[0].project_columns).toEqual([]);
		expect(issues[0].__config).toBeUndefined();
		expect(statusColumns).toEqual([]);
	});
	it('issue sans entrée de colonne → project_columns vide', () => {
		const { issues } = reconcileRepoIssues([issue('n1')], new Map(), cfg);
		expect(issues[0].project_columns).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/repoIssueBoard.test.ts`
Expected: FAIL — `Failed to resolve import './repoIssueBoard'` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/repoIssueBoard.ts`:

```typescript
import type { GitHubIssue, ProjectColumn } from '@/types';
import type { BoardIssue } from '@/lib/boardMerge';

/**
 * Première config dont un `viewRepoMappings[].repos` contient le repo (insensible à la
 * casse), ou null. Générique pour être réutilisable côté route et côté move-status.
 */
export function resolveConfigForRepo<T extends { viewRepoMappings: { repos?: string[] }[] }>(
	repoFullName: string,
	configs: T[],
): T | null {
	const lower = repoFullName.toLowerCase();
	return (
		configs.find((c) =>
			c.viewRepoMappings?.some((m) => m.repos?.some((r) => r.toLowerCase() === lower)),
		) ?? null
	);
}

export interface CoveringConfig {
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
	projectTitle: string;
	statusColumns: string[];
}

/**
 * Réconcilie les issues REST d'un repo avec leur statut Project :
 * - la colonne retenue est celle de l'entrée dont `project` == `projectTitle` de la config
 *   couvrante (sinon aucune → "No Status" côté rendu) ;
 * - `__config` (drag) attaché uniquement pour les issues rattachées au Project couvrant ;
 * - `statusColumns` = ceux de la config couvrante (fallback [] → mono-colonne "No Status").
 */
export function reconcileRepoIssues(
	issues: GitHubIssue[],
	columnsByNodeId: Map<string, ProjectColumn[]>,
	config: CoveringConfig | null,
): { issues: BoardIssue[]; statusColumns: string[] } {
	const out: BoardIssue[] = issues.map((it) => {
		const cols = columnsByNodeId.get(it.node_id) ?? [];
		const matched = config ? cols.find((c) => c.project === config.projectTitle) : undefined;
		return {
			...it,
			project_columns: matched ? [matched] : [],
			__config: matched
				? { org: config!.org, projectNumber: config!.projectNumber, ownerType: config!.ownerType }
				: undefined,
		};
	});
	return { issues: out, statusColumns: config?.statusColumns ?? [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/repoIssueBoard.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repoIssueBoard.ts src/lib/repoIssueBoard.test.ts
git commit -m "feat(issues): pure helpers resolveConfigForRepo + reconcileRepoIssues"
```

---

### Task 2: Refactor `move-status` pour consommer `resolveConfigForRepo` (DRY)

Valide le helper contre son usage réel et supprime la duplication de la résolution repo→config.

**Files:**
- Modify: `src/app/api/github/issue/move-status/route.ts:31-51`

**Interfaces:**
- Consumes : `resolveConfigForRepo` (Task 1).
- Produces : rien de nouveau (comportement inchangé — parité, y compris le fallback à la 1ʳᵉ config).

- [ ] **Step 1: Add the import**

Dans `src/app/api/github/issue/move-status/route.ts`, ajouter sous les imports existants :

```typescript
import { resolveConfigForRepo } from '@/lib/repoIssueBoard';
```

- [ ] **Step 2: Replace the inline resolution**

Remplacer le bloc actuel (lignes ~31-51, du commentaire `// Find the project config...` jusqu'à la garde `if (!config) { ... }` incluse) par :

```typescript
		// Find the project config that contains this repo in its view_repo_mappings.
		const repoFullName = `${owner}/${repo}`;
		const allConfigs = db
			.select({
				org: projectConfigs.org,
				project_number: projectConfigs.project_number,
				view_repo_mappings: projectConfigs.view_repo_mappings,
			})
			.from(projectConfigs)
			.all();

		const normalized = (allConfigs ?? []).map((c) => ({
			org: c.org,
			projectNumber: c.project_number,
			viewRepoMappings: (c.view_repo_mappings as { repos?: string[] }[] | null) ?? [],
		}));

		const config = resolveConfigForRepo(repoFullName, normalized) ?? normalized[0];

		if (!config) {
			return NextResponse.json({ error: 'No project config found' }, { status: 404 });
		}
```

- [ ] **Step 3: Update downstream references to config shape**

Le reste du handler utilise `config.org` et `config.project_number`. Comme `normalized` expose `projectNumber` (camelCase), remplacer les deux usages suivants :

`fetchStatusFieldInfo(config.org, config.project_number, auth.accessToken)` → `fetchStatusFieldInfo(config.org, config.projectNumber, auth.accessToken)`

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/github/issue/move-status/route.ts
git commit -m "refactor(issues): move-status uses shared resolveConfigForRepo"
```

---

### Task 3: Fetcher REST repo-scoped (`fetchRepoAssignedOpenIssues`)

**Files:**
- Modify: `src/lib/github.ts` (ajout après `fetchAssignedIssues`, ~ligne 95)

**Interfaces:**
- Consumes : helpers privés existants `GITHUB_API`, `getHeaders` (déjà dans le fichier).
- Produces : `fetchRepoAssignedOpenIssues(owner: string, repo: string, assignee: string, token: string): Promise<GitHubIssue[]>` — issues ouvertes assignées de CE repo, PRs exclues, `repo_full_name` renseigné, `node_id` conservé.

- [ ] **Step 1: Add the function**

Dans `src/lib/github.ts`, juste après la fonction `fetchAssignedIssues` (fin ~ligne 95), insérer :

```typescript
/**
 * Issues ouvertes assignées à `assignee` dans UN repo (scope tab active du Kanban).
 * PRs exclues. Paginé (100/page) avec garde-fou de 10 pages.
 */
export async function fetchRepoAssignedOpenIssues(
	owner: string,
	repo: string,
	assignee: string,
	token: string,
): Promise<GitHubIssue[]> {
	const issues: GitHubIssue[] = [];
	const repo_full_name = `${owner}/${repo}`;
	const MAX_PAGES = 10;

	for (let page = 1; page <= MAX_PAGES; page++) {
		const res = await fetch(
			`${GITHUB_API}/repos/${owner}/${repo}/issues?assignee=${encodeURIComponent(
				assignee,
			)}&state=open&per_page=100&sort=updated&page=${page}`,
			{ headers: getHeaders(token) },
		);
		if (!res.ok) throw new Error(`GitHub repo issues failed: ${res.status}`);
		const data: GitHubIssue[] = await res.json();
		if (data.length === 0) break;

		issues.push(
			...data
				.filter((issue) => !issue.pull_request)
				.map((issue) => ({ ...issue, repo_full_name })),
		);
		if (data.length < 100) break;
	}

	return issues;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/github.ts
git commit -m "feat(issues): fetchRepoAssignedOpenIssues (repo-scoped assigned)"
```

---

### Task 4: Route serveur `GET /api/github/repo-issues`

Wire : REST + enrichissement colonnes + réconciliation serveur. (Route handler → vérif via tsc/build/manuel, pas de test unité par convention.)

**Files:**
- Create: `src/app/api/github/repo-issues/route.ts`

**Interfaces:**
- Consumes : `fetchRepoAssignedOpenIssues` (Task 3), `fetchProjectColumns` (`@/lib/github`, existant), `resolveConfigForRepo` + `reconcileRepoIssues` + `CoveringConfig` (Task 1), `requireAuth`/`isAuthError` (`@/lib/auth-utils`), `db`/`projectConfigs` (`@/db`).
- Produces : réponse JSON `{ issues: BoardIssue[]; statusColumns: string[]; fetchedAt: string | null; error?: string }`.

- [ ] **Step 1: Create the route**

Create `src/app/api/github/repo-issues/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projectConfigs } from '@/db/schema';
import { fetchRepoAssignedOpenIssues, fetchProjectColumns } from '@/lib/github';
import {
	resolveConfigForRepo,
	reconcileRepoIssues,
	type CoveringConfig,
} from '@/lib/repoIssueBoard';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = request.nextUrl.searchParams.get('repo');
	if (!repo || !repo.includes('/')) {
		return NextResponse.json({ error: 'repo parameter (owner/name) is required' }, { status: 400 });
	}
	const [owner, name] = repo.split('/');

	try {
		const issues = await fetchRepoAssignedOpenIssues(owner, name, auth.login, auth.accessToken);

		const nodeIds = issues.map((i) => i.node_id).filter((id): id is string => !!id);
		const columnsByNodeId = await fetchProjectColumns(nodeIds, auth.accessToken);

		const connected = (
			db
				.select({
					org: projectConfigs.org,
					project_number: projectConfigs.project_number,
					project_title: projectConfigs.project_title,
					status_columns: projectConfigs.status_columns,
					view_repo_mappings: projectConfigs.view_repo_mappings,
					owner_type: projectConfigs.owner_type,
					connected: projectConfigs.connected,
				})
				.from(projectConfigs)
				.all() ?? []
		)
			.filter((c) => c.connected)
			.map((c) => ({
				org: c.org,
				projectNumber: c.project_number,
				ownerType: (c.owner_type ?? undefined) as CoveringConfig['ownerType'],
				projectTitle: c.project_title,
				statusColumns: (c.status_columns as string[] | null) ?? [],
				viewRepoMappings: (c.view_repo_mappings as { repos?: string[] }[] | null) ?? [],
			}));

		const covering = resolveConfigForRepo(repo, connected);
		const { issues: reconciled, statusColumns } = reconcileRepoIssues(
			issues,
			columnsByNodeId,
			covering,
		);

		return NextResponse.json({
			issues: reconciled,
			statusColumns,
			fetchedAt: new Date().toISOString(),
		});
	} catch (err) {
		// GitHub failure (rate limit…) → empty board + error flag instead of crashing.
		return NextResponse.json({
			issues: [],
			statusColumns: [],
			fetchedAt: null,
			error: err instanceof Error ? err.message : 'fetch_failed',
		});
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Si `status_columns`/`view_repo_mappings` sont typés `unknown` par Drizzle, les casts ci-dessus les couvrent.)

- [ ] **Step 3: Manual smoke test**

Run (dev déjà lancé, sinon `npm run dev`) :
```bash
curl -s "http://localhost:4000/api/github/repo-issues?repo=<owner>/Devora" | head -c 400
```
Expected: JSON `{ "issues": [...], "statusColumns": [...], "fetchedAt": "..." }` contenant l'issue Devora assignée (même sans Project → `project_columns: []`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/github/repo-issues/route.ts
git commit -m "feat(issues): GET /api/github/repo-issues (lazy per-repo, server-reconciled)"
```

---

### Task 5: Hook `useRepoIssues`

**Files:**
- Create: `src/hooks/useRepoIssues.ts`

**Interfaces:**
- Consumes : la route Task 4 via `apiFetch` ; `BoardIssue` (`@/lib/boardMerge`).
- Produces : `useRepoIssues(repo: string | null): { issues: BoardIssue[]; statusColumns: string[]; fetchedAt: string | null; isLoading: boolean; error: Error | undefined; refresh: () => Promise<void> }`.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useRepoIssues.ts`:

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { BoardIssue } from '@/lib/boardMerge';

interface RepoIssuesResponse {
	issues: BoardIssue[];
	statusColumns: string[];
	fetchedAt: string | null;
	error?: string;
}

/**
 * Issues du repo de la tab active, fetchées à la demande (lazy) et cachées par repo.
 * Tout arrive déjà réconcilié du serveur (lanes, statut, __config).
 */
export function useRepoIssues(repo: string | null) {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ['repo-issues', repo],
		enabled: !!repo,
		queryFn: async (): Promise<RepoIssuesResponse> => {
			const res = await apiFetch(`/api/github/repo-issues?repo=${encodeURIComponent(repo!)}`);
			if (!res.ok) throw new Error(`Repo issues fetch failed: ${res.status}`);
			return res.json();
		},
	});

	const refresh = async () => {
		if (!repo) return;
		await queryClient.invalidateQueries({ queryKey: ['repo-issues', repo] });
	};

	return {
		issues: query.data?.issues ?? [],
		statusColumns: query.data?.statusColumns ?? [],
		fetchedAt: query.data?.fetchedAt ?? null,
		isLoading: !!repo && query.isLoading,
		error: query.error as Error | undefined,
		refresh,
	};
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRepoIssues.ts
git commit -m "feat(issues): useRepoIssues hook (lazy per-tab, cached)"
```

---

### Task 6: Brancher `IssuesList` sur `useRepoIssues`

Retire le fetch massif multi-projets et le filtre client ; supprime l'effet de persistance métadonnées (déplacé côté Settings, cf. spec §5).

**Files:**
- Modify: `src/components/issues/IssuesList.tsx`

**Interfaces:**
- Consumes : `useRepoIssues` (Task 5), `useProjectConfig` (existant, pour l'état vide « aucun Project connecté »).
- Produces : rien (composant).

- [ ] **Step 1: Swap imports**

Dans `src/components/issues/IssuesList.tsx`, remplacer la ligne d'import de `useProjectBoards` :

```typescript
import { useProjectBoards } from '@/hooks/useProjectBoards';
```

par :

```typescript
import { useRepoIssues } from '@/hooks/useRepoIssues';
```

- [ ] **Step 2: Replace the data source and remove the metadata-sync effect**

Remplacer le bloc actuel (lignes ~54-135, de `const { configs, configsLoading, saveConfig } = useProjectConfig();` jusqu'à la fin du `useMemo` `repoIssues` inclus) par :

```typescript
	const { configs, configsLoading } = useProjectConfig();
	const hasConnectedProject = configs.some((c) => c.connected);

	const { repoPaths } = useRepoPaths();

	// Active repo tab (default = first configured repo). Derived so it stays valid
	// even when the repoPaths list changes without an explicit selection.
	const [activeRepo, setActiveRepo] = useState<string | null>(null);
	const effectiveRepo = useMemo(() => {
		if (activeRepo && repoPaths.some((r) => r.repo_full_name === activeRepo)) return activeRepo;
		return repoPaths[0]?.repo_full_name ?? null;
	}, [activeRepo, repoPaths]);

	// Lazy per-tab: fetch only the active repo's issues (server-reconciled), cached per repo.
	const { issues, statusColumns, fetchedAt, isLoading, error, refresh } =
		useRepoIssues(effectiveRepo);
	const [refreshing, setRefreshing] = useState(false);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await refresh();
		} finally {
			setRefreshing(false);
		}
	}, [refresh]);

	// Auto-refetch: poll the active repo's board on the persisted interval.
	const [refetchMs, setRefetchMs] = useRefetchInterval('issues.refetchIntervalMs');
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	useEffect(() => {
		if (!refetchMs) return;
		const id = setInterval(() => void refreshRef.current(), refetchMs);
		return () => clearInterval(id);
	}, [refetchMs]);

	const [search, setSearch] = useState('');
	const mutation = useUpdateIssueStatus();
	const todoQc = useQueryClient();

	// Issue detail modal state
	const [detailIssue, setDetailIssue] = useState<{
		owner: string;
		repo: string;
		number: string;
	} | null>(null);

	const openDetail = useCallback((issue: GitHubIssue) => {
		const [owner, repo] = (issue.repo_full_name ?? '').split('/');
		if (owner && repo) setDetailIssue({ owner, repo, number: String(issue.number) });
	}, []);
```

> Note : `issues` est déjà scopé au repo actif (serveur), donc plus de `repoIssues` intermédiaire. Le `useMemo` `searchedIssues` (juste en dessous, inchangé) filtre désormais directement `issues`. Vérifier qu'il référence bien `issues` et non `repoIssues` :

```typescript
	const searchedIssues = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return issues;
		return issues.filter(
			(i) =>
				i.title.toLowerCase().includes(q) ||
				String(i.number).includes(q) ||
				`#${i.number}`.includes(q),
		);
	}, [issues, search]);
```

- [ ] **Step 3: Update the empty-state condition**

Dans le JSX, la branche d'état vide utilise aujourd'hui `boardConfigs.length === 0`. Remplacer cette condition par `!hasConnectedProject` (l'unique occurrence, ~ligne 357) :

```tsx
						{searchedIssues.length === 0 ? (
							!hasConnectedProject ? (
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (Il ne doit plus rester AUCUNE référence à `useProjectBoards`, `boardConfigs`, `perConfig`, `saveConfig`, ni `repoIssues` dans ce fichier.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build success.

- [ ] **Step 6: Manual verification**

Dev en marche (`npm run dev`), ouvrir `/issues` :
1. La tab **Devora** affiche l'issue assignée (colonne « No Status » si hors Project). ✅ bug corrigé.
2. Changer de tab ne recharge que le nouveau repo (Network : un seul `repo-issues?repo=...` par tab, mis en cache au retour). ✅ perf.
3. Le drag-to-status fonctionne sur une issue rattachée à un Project ; il est neutre sur une issue hors Project (pas de `__config`).
4. La recherche filtre les issues du repo actif ; « updated X » et l'auto-refetch fonctionnent.

- [ ] **Step 7: Commit**

```bash
git add src/components/issues/IssuesList.tsx
git commit -m "feat(issues): Kanban reads active repo via useRepoIssues (lazy per-tab)"
```

---

### Task 7: Nettoyage `useProjectBoards` si orphelin

**Files:**
- Modify/Delete: `src/hooks/useProjectBoards.ts`
- (Vérif) tous les consommateurs

- [ ] **Step 1: Check for remaining consumers**

Run: `grep -rn "useProjectBoards" src/`
Expected: soit aucune occurrence hors de la définition, soit d'autres consommateurs.

- [ ] **Step 2: Act on the result**

- Si `useProjectBoards` n'est plus importé nulle part → supprimer `src/hooks/useProjectBoards.ts` :
  ```bash
  git rm src/hooks/useProjectBoards.ts
  ```
- Si d'autres consommateurs existent → **ne rien supprimer**, laisser le hook en place. (Ne pas casser d'autres pages.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, build success.

- [ ] **Step 4: Commit (seulement si un changement a eu lieu)**

```bash
git add -A
git commit -m "chore(issues): remove orphaned useProjectBoards hook"
```

---

## Self-Review

**1. Spec coverage :**
- §0 résolution serveur + `resolveConfigForRepo` → Task 1 (+ réutilisé Task 2, Task 4). ✅
- §1 route `/api/github/repo-issues` (REST + `fetchProjectColumns` + réconciliation + `__config` + `statusColumns` + fallback + error) → Task 3 (fetch) + Task 4 (route) + Task 1 (réconciliation). ✅
- §1.5 réconciliation lane/statut par titre de Project → Task 1 (`reconcileRepoIssues` + tests). ✅
- §1.7 fallback statusColumns → Task 1 (`config?.statusColumns ?? []`, test « sans config »). ✅
- §2 hook `useRepoIssues` lazy + cache + refresh → Task 5. ✅
- §3 `IssuesList` branché, retrait `useProjectBoards`/`repoIssues`, recherche scoping, auto-refetch → Task 6. ✅
- §4 drag `__config` serveur, no-op hors Project → Task 1 (attache) + Task 6 (manuel). ✅
- §5 sync métadonnées déplacée hors montage → Task 6 supprime l'effet de persistance (déclencheur Settings = comportement existant, hors périmètre code de ce plan). ✅
- Table fichiers spec → couverte (Tasks 1-7). ✅

**2. Placeholder scan :** aucun TODO/TBD/« add error handling » générique — chaque step contient le code réel. ✅

**3. Type consistency :** `resolveConfigForRepo` (générique), `CoveringConfig`, `reconcileRepoIssues`, `fetchRepoAssignedOpenIssues`, `useRepoIssues` — signatures identiques entre définition (Tasks 1/3/5) et consommation (Tasks 2/4/6). `BoardIssue.__config` de forme `{ org, projectNumber, ownerType? }` cohérente avec `boardMerge.ts` existant. ✅
