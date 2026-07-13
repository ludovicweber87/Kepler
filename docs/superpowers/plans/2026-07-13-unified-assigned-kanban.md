# Unified Assigned Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le Kanban à onglets-par-track par **un seul board unifié** montrant **toutes les issues ouvertes assignées à l'user connecté**, sur tous les boards Project V2 **connectés** (nouveau toggle en Settings). Plus de sélection de tracks nulle part.

**Architecture:** Le backend `/api/github/projects` renvoie une liste plate `boardIssues` (assignées + ouvertes, dédup `node_id`) par board. `useProjectBoards` fusionne les boards **connectés** (flag `connected`) en une liste taguée par config + colonnes = union des statuts (ordre des configs). `IssuesList` rend un board unique. Stratégie **additive puis nettoyage** : on ajoute `boardIssues` à côté de `boardIssuesByView`, on bascule les conscommateurs, puis on retire l'ancienne forme — pour que `tsc`/build restent verts à chaque tâche.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, MUI 7, TanStack Query 5, Drizzle + better-sqlite3, next-intl (5 locales), Vitest.

## Global Constraints

- **Aucun texte en dur** : libellés via `next-intl`, 5 locales (`src/config/translate/{en,fr,es,de,pt}.json`).
- `"use client"` sur composants interactifs. TS strict. Alias `@/*` → `./src/*`.
- Tests : **logique pure uniquement** (Vitest, `*.test.ts` sur lib/hooks). UI vérifiée par `npm run lint` + `npx tsc --noEmit` + `npm run build`.
- **Migrations additives seulement** ; générées par `npx drizzle-kit generate` (sort dans `src/db/migrations/` d'après `drizzle.config.ts`). Ne pas éditer les migrations existantes. Ne pas supprimer `data/devora.db`.
- Vérif fin de tâche : `npm run lint` (0 NEW erreur ; ~1 pré-existant `Tooltip`/deps toléré) + `npx tsc --noEmit` (0). Tâches à logique pure : `npm run test:web` vert.
- **Ne jamais commiter sans accord** (déjà donné pour l'exécution).
- Branche : `feat/unified-kanban`.

## File Structure

**Créés :**
- `src/lib/boardMerge.ts` — helpers purs : `buildBoardIssues(...)` (filtre assigné+ouvert+dédup) et `mergeConnectedBoards(...)` (fusion + union colonnes).
- `src/lib/boardMerge.test.ts` — tests des helpers.
- `src/db/migrations/000X_*.sql` — migration additive `connected`.

**Modifiés :**
- `src/db/schema.ts` — colonne `connected`.
- `src/types/index.ts` — `ProjectV2Config.connected`.
- `src/hooks/useProjectConfig.ts` — map `connected`, retrait helpers views (T8).
- `src/app/api/project-configs/route.ts` — passer `connected`.
- `src/lib/projectBoardCache.ts` — payload `boardIssues`, `patchSnapshotStatus`.
- `src/app/api/github/projects/route.ts` — construire `boardIssues`.
- `src/hooks/useProjectBoards.ts` — sortie `issues` fusionnée + `statusColumns` union.
- `src/hooks/useUpdateIssueStatus.ts` — patch optimiste sur `boardIssues`.
- `src/components/issues/IssuesList.tsx` — board unifié, plus d'onglets.
- `src/components/issues/KanbanColumn.tsx` — clé React `node_id`.
- `src/components/settings/SettingsPanel.tsx` — toggle Connecter, retrait sélection views, compteur.
- `src/components/layout/AppShell.tsx` — gate onboarding sur `connected`.
- `src/config/translate/*.json` — libellés.

---

## Task 1: Colonne `connected` (schéma + migration)

**Files:**
- Modify: `src/db/schema.ts` (bloc `projectConfigs`)
- Create: `src/db/migrations/000X_*.sql` (généré)

**Interfaces:**
- Produces: colonne SQLite `project_configs.connected` (integer 0/1, défaut 0).

- [ ] **Step 1: Ajouter la colonne au schéma**

Dans `src/db/schema.ts`, dans `projectConfigs`, après `owner_type: text(),` ajouter :
```ts
	connected: integer({ mode: 'boolean' }).default(false),
```

- [ ] **Step 2: Générer la migration**

Run: `npx drizzle-kit generate`
Expected: crée `src/db/migrations/000X_*.sql` contenant `ALTER TABLE \`project_configs\` ADD \`connected\` integer DEFAULT false;` (ou `DEFAULT 0`), et met à jour `meta/_journal.json`. Vérifier que le SQL est **purement additif** (un seul ADD COLUMN, aucune autre instruction).

- [ ] **Step 3: Vérifier que la migration s'applique**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK (les migrations tournent au runtime, pas au build — mais l'import runtime en dev appliquera l'additif). Confirmer 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(kanban): add connected column to project_configs"
```

---

## Task 2: Persister `connected` (type + route + hook)

**Files:**
- Modify: `src/types/index.ts` (`ProjectV2Config`)
- Modify: `src/app/api/project-configs/route.ts` (PUT)
- Modify: `src/hooks/useProjectConfig.ts` (`ProjectConfigRow`, `rowToConfig`, `configToRow`)

**Interfaces:**
- Consumes: colonne `connected` (Task 1).
- Produces: `ProjectV2Config.connected: boolean` ; la route PUT lit/écrit `connected` ; `rowToConfig`/`configToRow` le mappent.

- [ ] **Step 1: Type**

Dans `src/types/index.ts`, `interface ProjectV2Config`, ajouter après `ownerType?...` :
```ts
	connected: boolean; // board agrégé au Kanban unifié
```

- [ ] **Step 2: Route PUT — destructure + values**

Dans `src/app/api/project-configs/route.ts`, ajouter `connected` au destructure du body (après `owner_type,`) :
```ts
			owner_type,
			connected,
```
et à l'objet `values` (après `owner_type,`) :
```ts
			owner_type,
			connected: connected ?? false,
```

- [ ] **Step 3: Hook — row mapping**

Dans `src/hooks/useProjectConfig.ts` :
- `interface ProjectConfigRow` : ajouter `connected: boolean | null;`
- `rowToConfig` : ajouter `connected: row.connected ?? false,`
- `configToRow` : ajouter `connected: config.connected,`

- [ ] **Step 4: Vérifier lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur. (Les créations de config existantes qui n'ont pas `connected` déclencheront une erreur TS si `connected` est requis — vérifier les call-sites de `saveConfig`/objets `ProjectV2Config` littéraux ; leur ajouter `connected: false`. Notamment `SettingsPanel.tsx` `onSave`/`fetchViews` — cf. Task 7, mais ici corriger le strict minimum pour compiler : ajouter `connected: savedConfig?.connected ?? false` là où un `ProjectV2Config` est construit.)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/app/api/project-configs/route.ts src/hooks/useProjectConfig.ts src/components/settings/SettingsPanel.tsx
git commit -m "feat(kanban): persist connected flag through type/route/hook"
```

---

## Task 3: Backend — `boardIssues` plat (additif)

Ajoute une liste plate `boardIssues` (assignées + ouvertes, dédup) **à côté** de `boardIssuesByView` (retiré en Task 8). Extrait un helper pur testable.

**Files:**
- Create: `src/lib/boardMerge.ts`
- Test: `src/lib/boardMerge.test.ts`
- Modify: `src/lib/projectBoardCache.ts` (`ProjectBoardPayload`, `patchSnapshotStatus`)
- Modify: `src/app/api/github/projects/route.ts`

**Interfaces:**
- Consumes: `projectItemToIssue` (github.ts), `GitHubIssue`.
- Produces:
  ```ts
  // boardMerge.ts
  export function buildBoardIssues(
    issues: GitHubIssue[],
  ): GitHubIssue[]; // filtre state==='open' + dédup par node_id
  ```
  `ProjectBoardPayload.boardIssues: GitHubIssue[]` ; réponse route contient `boardIssues`.

- [ ] **Step 1: Test du helper**

Créer `src/lib/boardMerge.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { buildBoardIssues } from './boardMerge';
import type { GitHubIssue } from '@/types';

function issue(node_id: string, state: 'open' | 'closed'): GitHubIssue {
	return {
		id: 1, node_id, number: 1, title: 't', body: null, state,
		html_url: '', updated_at: '', created_at: '', closed_at: null,
		labels: [], assignee: null, assignees: [], user: { login: '', avatar_url: '' },
		repository_url: '', project_columns: [],
	} as GitHubIssue;
}

describe('buildBoardIssues', () => {
	it('garde uniquement les issues ouvertes', () => {
		const out = buildBoardIssues([issue('a', 'open'), issue('b', 'closed')]);
		expect(out.map((i) => i.node_id)).toEqual(['a']);
	});
	it('déduplique par node_id (garde la première)', () => {
		const out = buildBoardIssues([issue('a', 'open'), issue('a', 'open')]);
		expect(out).toHaveLength(1);
	});
	it('liste vide → vide', () => {
		expect(buildBoardIssues([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test:web -- boardMerge`
Expected: FAIL (module/fn absent).

- [ ] **Step 3: Implémenter le helper**

Créer `src/lib/boardMerge.ts` :
```ts
import type { GitHubIssue } from '@/types';

/** Issues ouvertes uniquement, dédupliquées par node_id (première occurrence gardée). */
export function buildBoardIssues(issues: GitHubIssue[]): GitHubIssue[] {
	const seen = new Set<string>();
	const out: GitHubIssue[] = [];
	for (const it of issues) {
		if (it.state !== 'open') continue;
		if (it.node_id && seen.has(it.node_id)) continue;
		if (it.node_id) seen.add(it.node_id);
		out.push(it);
	}
	return out;
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test:web -- boardMerge`
Expected: PASS (3 tests).

- [ ] **Step 5: Payload cache + patch (additif)**

Dans `src/lib/projectBoardCache.ts` :
- `interface ProjectBoardPayload` : ajouter `boardIssues: GitHubIssue[];` (garder `boardIssuesByView` pour l'instant).
- `patchSnapshotStatus` : après le bloc qui patche `boardIssuesByView`, patcher aussi `boardIssues` s'il existe :
```ts
	if (Array.isArray(snap.payload.boardIssues)) {
		snap.payload.boardIssues = snap.payload.boardIssues.map((issue) => {
			if (issue.node_id !== issueNodeId) return issue;
			changed = true;
			return {
				...issue,
				project_columns: issue.project_columns?.length
					? issue.project_columns.map((c) => ({ ...c, column: newStatus }))
					: [{ project: '', column: newStatus }],
			};
		});
	}
```
(placer avant `if (changed) writeSnapshot(...)`).

- [ ] **Step 6: Route projects — construire `boardIssues`**

Dans `src/app/api/github/projects/route.ts`, dans le bloc succès (après la boucle qui remplit `boardIssuesByView`), ajouter :
```ts
			const allMine = projectData.items
				.filter((it) => it.assignees.some((a) => a.login.toLowerCase() === viewer))
				.map((it) => projectItemToIssue(it, projectData.title));
			const boardIssues = buildBoardIssues(allMine);
```
Importer `buildBoardIssues` : `import { buildBoardIssues } from '@/lib/boardMerge';`.
Ajouter `boardIssues,` au `payload: ProjectBoardPayload`. Ajouter `boardIssues: [],` au fallback d'erreur (l'objet retourné dans le `catch (fetchErr)`).

- [ ] **Step 7: Vérifier**

Run: `npm run test:web -- boardMerge && npm run lint && npx tsc --noEmit`
Expected: tests verts, 0 erreur.

- [ ] **Step 8: Commit**

```bash
git add src/lib/boardMerge.ts src/lib/boardMerge.test.ts src/lib/projectBoardCache.ts src/app/api/github/projects/route.ts
git commit -m "feat(kanban): backend returns flat boardIssues (assigned + open, deduped)"
```

---

## Task 4: `useProjectBoards` — fusion boards connectés

Expose une liste `issues` fusionnée (taguée par config) + `statusColumns` union, en lisant `boardIssues`. Garde `issuesByView` pour l'instant (retiré en Task 8).

**Files:**
- Modify: `src/hooks/useProjectBoards.ts`
- Modify: `src/lib/boardMerge.ts` (+ test) — helper `mergeConnectedBoards`

**Interfaces:**
- Produces:
  ```ts
  export interface BoardIssue extends GitHubIssue {
    __config: { org: string; projectNumber: number; ownerType?: 'organization' | 'user' };
  }
  export function mergeConnectedBoards(
    perConfig: { config: { org: string; projectNumber: number; ownerType?: 'organization' | 'user'; statusColumns: string[] };
                 boardIssues: GitHubIssue[] }[],
  ): { issues: BoardIssue[]; statusColumns: string[] };
  ```
  `useProjectBoards` retourne en plus `issues: BoardIssue[]` et `statusColumns: string[]`.

- [ ] **Step 1: Test du merge**

Ajouter à `src/lib/boardMerge.test.ts` :
```ts
import { mergeConnectedBoards } from './boardMerge';

describe('mergeConnectedBoards', () => {
	const mk = (node: string, col: string): GitHubIssue =>
		({ ...issue(node, 'open'), project_columns: [{ project: 'p', column: col }] }) as GitHubIssue;

	it('union des statusColumns dans l’ordre des configs, dédupliquée', () => {
		const { statusColumns } = mergeConnectedBoards([
			{ config: { org: 'o', projectNumber: 1, statusColumns: ['Todo', 'Done'] }, boardIssues: [] },
			{ config: { org: 'o', projectNumber: 2, statusColumns: ['Todo', 'QA'] }, boardIssues: [] },
		]);
		expect(statusColumns).toEqual(['Todo', 'Done', 'QA']);
	});

	it('tague chaque issue avec sa config et dédup cross-board par node_id', () => {
		const { issues } = mergeConnectedBoards([
			{ config: { org: 'o', projectNumber: 1, statusColumns: [] }, boardIssues: [mk('a', 'Todo')] },
			{ config: { org: 'o', projectNumber: 2, statusColumns: [] }, boardIssues: [mk('a', 'Todo'), mk('b', 'QA')] },
		]);
		expect(issues.map((i) => i.node_id).sort()).toEqual(['a', 'b']);
		expect(issues.find((i) => i.node_id === 'a')!.__config.projectNumber).toBe(1);
	});
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test:web -- boardMerge`
Expected: FAIL (`mergeConnectedBoards` absent).

- [ ] **Step 3: Implémenter `mergeConnectedBoards`**

Ajouter à `src/lib/boardMerge.ts` :
```ts
export interface BoardConfigTag {
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
}
export interface BoardIssue extends GitHubIssue {
	__config: BoardConfigTag;
}

export function mergeConnectedBoards(
	perConfig: { config: BoardConfigTag & { statusColumns: string[] }; boardIssues: GitHubIssue[] }[],
): { issues: BoardIssue[]; statusColumns: string[] } {
	const seen = new Set<string>();
	const issues: BoardIssue[] = [];
	const cols: string[] = [];
	const colSeen = new Set<string>();
	for (const { config, boardIssues } of perConfig) {
		for (const c of config.statusColumns) {
			if (!colSeen.has(c)) {
				colSeen.add(c);
				cols.push(c);
			}
		}
		for (const it of boardIssues) {
			if (it.node_id && seen.has(it.node_id)) continue;
			if (it.node_id) seen.add(it.node_id);
			issues.push({
				...it,
				__config: {
					org: config.org,
					projectNumber: config.projectNumber,
					ownerType: config.ownerType,
				},
			});
		}
	}
	return { issues, statusColumns: cols };
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test:web -- boardMerge`
Expected: PASS (5 tests au total).

- [ ] **Step 5: Câbler le hook**

Dans `src/hooks/useProjectBoards.ts` :
- `interface ProjectBoardResponse` : ajouter `boardIssues?: GitHubIssue[];`
- Importer `mergeConnectedBoards, type BoardIssue` depuis `@/lib/boardMerge`.
- Dans `combine`, après la construction de `perConfig`, calculer et exposer la fusion :
```ts
			const merged = mergeConnectedBoards(
				perConfig.map((p) => ({
					config: {
						org: p.config.org,
						projectNumber: p.config.projectNumber,
						ownerType: p.config.ownerType,
						statusColumns: p.data.statusColumns ?? [],
					},
					boardIssues: p.data.boardIssues ?? [],
				})),
			);
```
et ajouter au retour : `issues: merged.issues,` et `statusColumns: merged.statusColumns,` (garder `issuesByView` pour l'instant).

- [ ] **Step 6: Vérifier**

Run: `npm run test:web -- boardMerge && npm run lint && npx tsc --noEmit`
Expected: verts, 0 erreur.

- [ ] **Step 7: Commit**

```bash
git add src/lib/boardMerge.ts src/lib/boardMerge.test.ts src/hooks/useProjectBoards.ts
git commit -m "feat(kanban): merge connected boards into a tagged unified issue list"
```

---

## Task 5: `useUpdateIssueStatus` — patch optimiste sur `boardIssues`

**Files:**
- Modify: `src/hooks/useUpdateIssueStatus.ts`

**Interfaces:**
- Consumes: `BoardData` (payload cache) contient désormais `boardIssues`.
- Produces: l'optimistic update patche `boardIssues` (en plus de `boardIssuesByView` tant qu'il existe).

- [ ] **Step 1: Étendre `BoardData` + `updateBoardIssues`**

Dans `src/hooks/useUpdateIssueStatus.ts` :
- `interface BoardData` : ajouter `boardIssues?: GitHubIssue[];`
- Dans `updateBoardIssues`, après le traitement de `boardIssuesByView`, patcher aussi `boardIssues`. Remplacer le corps par :
```ts
function updateBoardIssues(
	old: BoardData | undefined,
	params: UpdateStatusParams,
): BoardData | undefined {
	if (!old) return old;
	const patchList = (list: GitHubIssue[]) =>
		list.map((issue) =>
			issue.node_id === params.issueNodeId ? withStatus(issue, params.newStatus) : issue,
		);
	const next: BoardData = { ...old };
	if (old.boardIssuesByView) {
		const byView: Record<string, GitHubIssue[]> = {};
		for (const [view, issues] of Object.entries(old.boardIssuesByView)) {
			byView[view] = patchList(issues);
		}
		next.boardIssuesByView = byView;
	}
	if (Array.isArray(old.boardIssues)) {
		next.boardIssues = patchList(old.boardIssues);
	}
	return next;
}
```

- [ ] **Step 2: Vérifier**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useUpdateIssueStatus.ts
git commit -m "feat(kanban): optimistic status patch covers flat boardIssues"
```

---

## Task 6: Kanban unifié (`IssuesList` + `KanbanColumn`)

Bascule l'UI : plus d'onglets, un board unique alimenté par `issues`/`statusColumns` fusionnés, sur les configs **connectées**. Drag via le tag `__config`.

**Files:**
- Modify: `src/components/issues/IssuesList.tsx`
- Modify: `src/components/issues/KanbanColumn.tsx`

**Interfaces:**
- Consumes: `useProjectBoards(connectedConfigs)` → `{ issues: BoardIssue[], statusColumns, fetchedAt, isLoading, error, refresh }` ; `buildColumns(issues, statusColumns)`.
- Produces: board unique.

- [ ] **Step 1: Sélection des configs connectées + hook**

Dans `IssuesList.tsx` :
- Remplacer `const boardConfigs = configs.filter((c) => c.selectedViews.length > 0);` par :
```ts
	const boardConfigs = configs.filter((c) => c.connected);
```
- Récupérer la nouvelle sortie : `const { issues, statusColumns, fetchedAt, isLoading, error, refresh, perConfig } = useProjectBoards(boardConfigs);` (garder `perConfig` s'il est utilisé pour la persistance métadonnées ; sinon le retirer).

- [ ] **Step 2: Retirer les onglets + calcul colonnes**

- Supprimer : `hasViews`, `tabs`, `safeTab`, `activeTab`/`setActiveTab`, `filteredIssues` (basé view), `activeStatusColumns` (basé view), et l'import/usage de `DraggableTabs` et `selectedViewMappings`.
- Nouveau flux :
```ts
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

	const columns = useMemo(
		() => buildColumns(searchedIssues, statusColumns),
		[searchedIssues, statusColumns],
	);
```

- [ ] **Step 3: Drag via `__config`**

Remplacer `handleStatusChange` par une version qui lit le tag de l'issue :
```ts
	const handleStatusChange = useCallback(
		(issue: GitHubIssue, newStatus: string) => {
			const cfg = (issue as BoardIssue).__config;
			if (!cfg) return;
			mutation.mutate({
				issueNodeId: issue.node_id,
				newStatus,
				org: cfg.org,
				projectNumber: cfg.projectNumber,
				ownerType: cfg.ownerType,
			});
			if (newStatus.includes('In Progress')) setBranchModalIssue(issue);
			if (newStatus.toLowerCase().includes('qa')) {
				const repo = issue.repo_full_name;
				if (repo && issue.number) {
					completeIssueTodos(repo, issue.number).then(() => {
						todoQc.invalidateQueries({ queryKey: ['todos'] });
					});
				}
			}
		},
		[mutation, todoQc],
	);
```
Importer `type BoardIssue` depuis `@/lib/boardMerge`.

- [ ] **Step 4: Rendu — retirer la barre d'onglets, garder le refresh**

- Supprimer le bloc `<DraggableTabs .../>`.
- Le bouton refresh : retirer la condition `hasViews` (toujours activé) → `disabled={refreshing}` et `title={t('refresh')}`.
- Le rendu `columns.map(([colName, issues]) => <KanbanColumn ... />)` reste.

- [ ] **Step 5: Clé React**

Dans `src/components/issues/KanbanColumn.tsx:90`, remplacer `key={issue.id}` par `key={issue.node_id}`.

- [ ] **Step 6: Vérifier + run manuel**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK. Puis `npm run dev` → `/issues` : un seul board, colonnes = union des statuts, issues assignées ouvertes de tous les boards connectés, drag change le statut, recherche filtre. (Tant qu'aucun board n'est connecté → board vide ; se vérifie après Task 7.)

- [ ] **Step 7: Commit**

```bash
git add src/components/issues/IssuesList.tsx src/components/issues/KanbanColumn.tsx
git commit -m "feat(kanban): single unified board (no track tabs), drag via config tag"
```

---

## Task 7: Settings — toggle « Connecter » + compteur + gate onboarding

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/config/translate/*.json`

**Interfaces:**
- Consumes: `ProjectV2Config.connected`, `saveConfig`.
- Produces: toggle par projet écrivant `connected` ; gates basées sur `connected`.

- [ ] **Step 1: i18n — libellés du toggle**

Ajouter dans le namespace `settings` des 5 locales une clé `connectBoard` (fr : « Connecter ce board », en : « Connect this board », es/de/pt traduits). Repérer et retirer les clés devenues inutiles liées à la sélection de views si évident (sinon laisser, non bloquant).

- [ ] **Step 2: Retirer l'UI de sélection de views + ajouter le toggle**

Dans `ProjectSection` (`SettingsPanel.tsx`) :
- Supprimer la liste des views cochables et `toggleView` (et le state/rendu associés).
- Ajouter un `Switch` (MUI) « Connecter ce board » lié à `savedConfig?.connected ?? false` qui appelle :
```tsx
	onSave({
		...(savedConfig ?? baseConfigFor(project)),
		connected: next, // valeur du switch
	});
```
où `baseConfigFor(project)` construit un `ProjectV2Config` minimal (org, projectNumber, ownerType, projectTitle, et champs views neutres `selectedViews: [], activeView: null, viewOrder: [], viewRepoMappings: [], statusColumns: [], views: []`).

- [ ] **Step 3: Auto-save au montage — ne pas écraser `connected`**

Dans l'effet de montage (`fetchViews()` → `onSave(...)`, ~`:142-147`/`:122-133`), s'assurer que l'objet sauvegardé porte **`connected: savedConfig?.connected ?? false`** (jamais un `false` codé en dur). La route PUT étant un overwrite de ligne complète, omettre `connected` le remettrait à 0.

- [ ] **Step 4: Compteur**

`SettingsPanel.tsx:711` : remplacer `configs.filter((c) => c.selectedViews.length > 0).length` par `configs.filter((c) => c.connected).length`.

- [ ] **Step 5: Gate onboarding**

`src/components/layout/AppShell.tsx:44` : remplacer `const hasProjects = configs.some((c) => c.selectedViews.length > 0);` par `const hasProjects = configs.some((c) => c.connected);`.

- [ ] **Step 6: Vérifier + run manuel**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK. Puis `npm run dev` → Settings : chaque projet a un switch « Connecter » ; l'activer fait apparaître ses issues assignées ouvertes dans `/issues` ; rouvrir Settings ne déconnecte pas le board (pas de clobber) ; le compteur reflète les connectés.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx src/components/layout/AppShell.tsx src/config/translate/
git commit -m "feat(kanban): per-board Connect toggle, connected-based counter and onboarding gate"
```

---

## Task 8: Nettoyage — retirer `boardIssuesByView` + helpers views morts

**Files:**
- Modify: `src/lib/projectBoardCache.ts`, `src/app/api/github/projects/route.ts`, `src/hooks/useProjectBoards.ts`, `src/hooks/useUpdateIssueStatus.ts`, `src/hooks/useProjectConfig.ts`

**Interfaces:**
- Produces: forme de payload finale `boardIssues` seule ; `useProjectConfig` sans helpers de views morts.

- [ ] **Step 1: Vérifier les consommateurs restants**

Run:
```bash
grep -rn "boardIssuesByView\|issuesByView\|selectedViewMappings\|getConfigForRepo\|getViewRepos\|setActiveView\|reorderViews" src --include="*.ts" --include="*.tsx"
```
Ne retirer chaque symbole que si son seul usage restant est interne aux fichiers listés. Noter tout usage inattendu et le rebrancher/laisser.

- [ ] **Step 2: Retirer `boardIssuesByView`**

- `projectBoardCache.ts` : retirer `boardIssuesByView` de `ProjectBoardPayload` et son bloc de patch dans `patchSnapshotStatus` (garder le bloc `boardIssues`). Retirer aussi `views`/`viewRepoMappings` du payload s'ils ne sont plus lus (vérifier via grep).
- `projects/route.ts` : retirer la construction de `boardIssuesByView` (la boucle `for (const view ...)`) et son entrée dans `payload` + le fallback ; garder `boardIssues`. Retirer `mapViewsToRepos`/`matchViewItems`/`knownFieldsFromItems` s'ils ne servent plus (grep).
- `useProjectBoards.ts` : retirer `issuesByView` de `ProjectBoardResponse`/`combine`/retour, et `boardIssuesByView` de la réponse.
- `useUpdateIssueStatus.ts` : simplifier `updateBoardIssues`/`BoardData` en retirant `boardIssuesByView`.

- [ ] **Step 3: Retirer les helpers de views morts de `useProjectConfig`**

Retirer `selectedViewMappings`, `getConfigForRepo`, `getViewRepos`, `setActiveView`, `reorderViews` **s'ils sont confirmés inutilisés** (Step 1). Conserver `configs`, `saveConfig`, `removeConfig`, `clearConfig`, `config`.

- [ ] **Step 4: Vérifier (complet)**

Run: `npm run lint && npx tsc --noEmit && npm run test:web && npm run build`
Expected: 0 erreur, tests verts, build OK. Le grep du Step 1 ne doit plus rien retourner d'actif.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(kanban): drop boardIssuesByView and dead view-selection helpers"
```

---

## Self-Review (effectuée)

**Spec coverage :** connected column + migration (T1) ; persistance connected type/route/hook (T2) ; boardIssues assigné+ouvert+dédup (T3) ; fusion + union colonnes + tag config (T4) ; patch optimiste boardIssues (T5) ; board unifié sans onglets + clé node_id + drag via tag (T6) ; toggle Connecter + compteur + gate onboarding + i18n (T7) ; nettoyage boardIssuesByView + helpers morts (T8). Cache serveur `patchSnapshotStatus` couvert (T3 additif, T8 final). Tous les points du spec (incl. les 9 findings des 2 revues) sont couverts.

**Placeholder scan :** aucun TODO/placeholder ; code complet pour la logique ; UI avec critères de vérif concrets.

**Type consistency :** `buildBoardIssues`/`mergeConnectedBoards`/`BoardIssue`/`__config` cohérents T3↔T4↔T6. `ProjectV2Config.connected` cohérent T2↔T6↔T7. `ProjectBoardPayload.boardIssues` cohérent T3↔T5↔T8.

**Vigilance exécution :** T2 Step 4 peut révéler des littéraux `ProjectV2Config` à compléter avec `connected` (notamment `SettingsPanel`) — corriger au minimum pour compiler, l'UI complète du toggle arrive en T7. Confirmer les signatures de `perConfig`/`ProjectSection` par lecture avant câblage.
