# Explorateur de fichiers du Workbench — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un onglet « Explorateur » au panneau droit du Workbench qui affiche l'arborescence du worktree de la session à la manière de VSCode, et donner la coloration syntaxique à la vue de fichier ouverte à côté du chat.

**Architecture:** Le serveur agent (port 4001) expose un endpoint qui renvoie la liste plate des fichiers non ignorés par git en un seul appel. Le client transforme cette liste en arbre via un module pur, puis un composant React rend les nœuds visibles avec un champ de filtre. Le clic sur un fichier réutilise `openChanges`, la fonction qui ouvre déjà un onglet gauche pour les fichiers modifiés. La coloration syntaxique arrive dans un composant `CodeBlock` dédié, adossé à shiki chargé en import dynamique.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 strict · MUI 7 + Emotion · TanStack React Query 5 · next-intl 4 · serveur agent Node (http natif) · shiki 4 · Vitest

Spec de référence : `docs/superpowers/specs/2026-07-27-file-explorer-design.md`

## Global Constraints

- **Indentation par tabulations**, `tabWidth: 4`, `printWidth: 100`, guillemets simples, virgules finales partout, points-virgules. Config : `config/prettier.mjs`. Lance `npx prettier --write <fichiers>` avant chaque commit.
- **Jamais de texte en dur** dans un composant. Toute chaîne visible passe par `useTranslations` et existe dans les **5 locales** : `src/config/translate/{en,fr,es,de,pt}.json`.
- **`'use client'`** en première ligne de tout composant ou hook interactif.
- **Couleurs par tokens MUI uniquement** (`text.secondary`, `text.disabled`, `action.hover`, `action.selected`, `divider`, `primary.main`, `warning.main`). Aucune couleur hexadécimale codée en dur : l'explorateur doit suivre les variantes dark **et** light du thème Devora.
- **Tests Vitest sur la logique pure uniquement** (convention du repo). Aucun test de composant React. L'UI se vérifie par `npm run lint`, `npx tsc --noEmit`, `npm run build` et un passage manuel.
- Commande de test : `npx vitest run <chemin>`. Le `include` de `vitest.config.ts` couvre `src/**/*.test.{ts,tsx}` et `packages/agent/src/routes/**/*.test.ts`.
- **Imports internes au serveur agent** : suffixe `.js` obligatoire (ESM compilé), ex. `from './parseLsFiles.js'`.
- **Path alias côté app** : `@/*` → `./src/*`.
- **Commentaires en français**, uniquement quand ils expliquent un *pourquoi* non évident. Pas de docstring décorative.
- **Commits** : un par tâche, en local. Le fait de valider ce plan vaut accord pour ces commits. **Aucun `git push`**, aucune PR, sans demande explicite de Ludovic.
- Version exacte de la dépendance à ajouter : **`shiki@4.3.1`**.
- Identifiants de thème shiki : **`github-dark-default`** et **`github-light-default`**.

---

### Task 1: Endpoint `GET /filesystem/tree` sur le serveur agent

Le serveur agent gagne un endpoint qui liste les fichiers du dépôt en respectant `.gitignore`. Le découpage de la sortie brute de git est isolé dans un module pur testable, sur le modèle de `packages/agent/src/routes/parsePorcelain.ts` qui existe déjà.

**Files:**
- Create: `packages/agent/src/routes/parseLsFiles.ts`
- Create: `packages/agent/src/routes/parseLsFiles.test.ts`
- Modify: `packages/agent/src/routes/filesystem.ts` (nouvel import en tête, nouveau bloc de route inséré après le bloc `/filesystem/read-file` qui se termine ligne 66)

**Interfaces:**
- Consumes: `sendJson`, `parseQuery` depuis `../helpers.js` (déjà importés dans `filesystem.ts`) ; `execFileSync`, `statSync`, `isAbsolute` (déjà importés dans `filesystem.ts`).
- Produces:
  - `export const MAX_TREE_FILES = 20_000`
  - `export interface LsFilesResult { files: string[]; truncated: boolean }`
  - `export function parseLsFiles(raw: string, max?: number): LsFilesResult`
  - Contrat HTTP consommé par la Task 3 :
    - `GET /filesystem/tree?cwd=<absolu>` → `200 { files: string[]; truncated: boolean; root: string }`
    - `400 { error: 'absolute cwd required' }` · `400 { error: 'not a directory' }` · `404 { error: 'cwd not found' }` · `404 { error: 'not a git repository', code: 'not_a_repo' }`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/agent/src/routes/parseLsFiles.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { parseLsFiles, MAX_TREE_FILES } from './parseLsFiles.js';

describe('parseLsFiles', () => {
	it('renvoie une liste vide pour une sortie vide', () => {
		expect(parseLsFiles('')).toEqual({ files: [], truncated: false });
	});

	it('découpe sur le séparateur NUL', () => {
		expect(parseLsFiles('src/a.ts\0src/b.ts')).toEqual({
			files: ['src/a.ts', 'src/b.ts'],
			truncated: false,
		});
	});

	it('ignore le NUL final que git ajoute toujours', () => {
		expect(parseLsFiles('src/a.ts\0')).toEqual({ files: ['src/a.ts'], truncated: false });
	});

	it('déduplique un chemin listé deux fois (--cached et --others)', () => {
		expect(parseLsFiles('src/a.ts\0src/a.ts\0src/b.ts')).toEqual({
			files: ['src/a.ts', 'src/b.ts'],
			truncated: false,
		});
	});

	it('préserve les espaces internes et finaux des noms de fichiers', () => {
		expect(parseLsFiles('docs/mon fichier .md\0')).toEqual({
			files: ['docs/mon fichier .md'],
			truncated: false,
		});
	});

	it('cape la liste et signale la troncature', () => {
		const raw = ['a', 'b', 'c'].join('\0');
		expect(parseLsFiles(raw, 2)).toEqual({ files: ['a', 'b'], truncated: true });
	});

	it("ne signale pas de troncature quand la liste tient pile dans le cap", () => {
		expect(parseLsFiles('a\0b', 2)).toEqual({ files: ['a', 'b'], truncated: false });
	});

	it('expose un cap par défaut', () => {
		expect(MAX_TREE_FILES).toBe(20_000);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run packages/agent/src/routes/parseLsFiles.test.ts`
Expected: FAIL — `Failed to resolve import "./parseLsFiles.js"`

- [ ] **Step 3: Écrire le module pur**

Créer `packages/agent/src/routes/parseLsFiles.ts` :

```ts
/** Cap du nombre de chemins renvoyés par /filesystem/tree. */
export const MAX_TREE_FILES = 20_000;

export interface LsFilesResult {
	files: string[];
	truncated: boolean;
}

/**
 * Découpe la sortie de `git ls-files -z`. Le séparateur NUL est le seul octet
 * qu'un nom de fichier ne peut pas contenir : on ne trim pas les segments,
 * sinon un nom se terminant par une espace serait corrompu.
 * Combiner --cached et --others peut lister deux fois le même chemin, d'où le Set.
 */
export function parseLsFiles(raw: string, max = MAX_TREE_FILES): LsFilesResult {
	const seen = new Set<string>();
	for (const entry of raw.split('\0')) {
		if (!entry) continue;
		seen.add(entry);
	}
	const all = [...seen];
	return { files: all.slice(0, max), truncated: all.length > max };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run packages/agent/src/routes/parseLsFiles.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Ajouter la route dans `filesystem.ts`**

Dans `packages/agent/src/routes/filesystem.ts`, ajouter l'import après la ligne `import { sendJson, parseQuery, readBody } from '../helpers.js';` :

```ts
import { parseLsFiles } from './parseLsFiles.js';
```

Puis insérer ce bloc juste après la fermeture du bloc `/filesystem/read-file` (après son `return;`, ligne 66) et avant le commentaire `// ── Open a path in a desktop editor ──` :

```ts
	// ── List repository files (git-aware: .gitignore respected, .git excluded) ──

	if (path === '/filesystem/tree' && method === 'GET') {
		const q = parseQuery(req);
		const cwd = q.get('cwd') ?? '';
		if (!cwd || !isAbsolute(cwd)) {
			sendJson(res, { error: 'absolute cwd required' }, 400);
			return;
		}
		try {
			if (!statSync(cwd).isDirectory()) {
				sendJson(res, { error: 'not a directory' }, 400);
				return;
			}
		} catch {
			sendJson(res, { error: 'cwd not found' }, 404);
			return;
		}
		try {
			// execFile sans shell : cwd est un argument, jamais interpolé.
			// --cached + --others --exclude-standard = fichiers suivis ET non-suivis
			// non ignorés. .gitignore est respecté et .git/ exclu sans traitement.
			const raw = execFileSync(
				'git',
				['-C', cwd, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
				{ encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024, timeout: 20000 },
			);
			const { files, truncated } = parseLsFiles(raw);
			sendJson(res, { files, truncated, root: cwd });
		} catch {
			sendJson(res, { error: 'not a git repository', code: 'not_a_repo' }, 404);
		}
		return;
	}
```

- [ ] **Step 6: Vérifier les types et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur

- [ ] **Step 7: Vérifier l'endpoint à la main**

Le serveur agent doit tourner (`npm run dev` à la racine du repo, ou il est déjà lancé). Puis :

```bash
curl -s "http://localhost:4001/filesystem/tree?cwd=$(pwd)" | head -c 400
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:4001/filesystem/tree?cwd=/tmp"
curl -s "http://localhost:4001/filesystem/tree?cwd=relatif"
```

Expected :
1. Un JSON `{"files":["...", ...],"truncated":false,"root":"..."}` contenant des chemins du repo, **sans** aucune entrée `node_modules/` ni `.next/`.
2. `404` (dossier `/tmp` hors dépôt git → `not_a_repo`).
3. `{"error":"absolute cwd required"}`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/agent/src/routes/parseLsFiles.ts packages/agent/src/routes/parseLsFiles.test.ts packages/agent/src/routes/filesystem.ts
git add packages/agent/src/routes/parseLsFiles.ts packages/agent/src/routes/parseLsFiles.test.ts packages/agent/src/routes/filesystem.ts
git commit -m "feat(agent): endpoint /filesystem/tree listant les fichiers non ignorés par git"
```

---

### Task 2: Module pur `fileTree` — construction, filtre, aplatissement

Toute la logique d'arborescence vit hors de React, donc elle est testée. Le composant de la Task 4 n'aura plus qu'à rendre le résultat de `flattenVisible`.

**Files:**
- Create: `src/lib/fileTree.ts`
- Create: `src/lib/fileTree.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces (consommé par la Task 4) :
  - `export interface TreeNode { name: string; path: string; isDir: boolean; children: TreeNode[] }`
  - `export interface VisibleNode extends TreeNode { depth: number }`
  - `export interface FilterResult { nodes: TreeNode[]; expand: Set<string> }`
  - `export function buildFileTree(paths: string[]): TreeNode[]`
  - `export function filterTree(nodes: TreeNode[], query: string): FilterResult`
  - `export function flattenVisible(nodes: TreeNode[], expanded: Set<string>): VisibleNode[]`
  - `export function isActivePath(nodePath: string, activePath: string | null): boolean`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/fileTree.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
	buildFileTree,
	filterTree,
	flattenVisible,
	isActivePath,
	type TreeNode,
} from './fileTree';

/** Résumé lisible d'un arbre : "dir/ > enfant" à plat, pour des assertions courtes. */
function outline(nodes: TreeNode[], depth = 0): string[] {
	return nodes.flatMap((n) => [
		`${'  '.repeat(depth)}${n.name}${n.isDir ? '/' : ''}`,
		...outline(n.children, depth + 1),
	]);
}

describe('buildFileTree', () => {
	it('renvoie un arbre vide pour une liste vide', () => {
		expect(buildFileTree([])).toEqual([]);
	});

	it('crée un nœud fichier pour un chemin à un seul segment', () => {
		expect(buildFileTree(['README.md'])).toEqual([
			{ name: 'README.md', path: 'README.md', isDir: false, children: [] },
		]);
	});

	it('crée les dossiers intermédiaires avec un chemin cumulé', () => {
		const tree = buildFileTree(['src/lib/a.ts']);
		expect(tree[0]!.path).toBe('src');
		expect(tree[0]!.isDir).toBe(true);
		expect(tree[0]!.children[0]!.path).toBe('src/lib');
		expect(tree[0]!.children[0]!.children[0]!.path).toBe('src/lib/a.ts');
	});

	it('mutualise un dossier partagé par plusieurs fichiers', () => {
		const tree = buildFileTree(['src/a.ts', 'src/b.ts']);
		expect(tree).toHaveLength(1);
		expect(tree[0]!.children.map((c) => c.name)).toEqual(['a.ts', 'b.ts']);
	});

	it('place les dossiers avant les fichiers à chaque niveau', () => {
		expect(outline(buildFileTree(['b.ts', 'a/c.ts']))).toEqual(['a/', '  c.ts', 'b.ts']);
	});

	it('trie sans tenir compte de la casse', () => {
		expect(outline(buildFileTree(['Zebra.ts', 'alpha.ts']))).toEqual([
			'alpha.ts',
			'Zebra.ts',
		]);
	});

	it('ignore les segments vides issus de doubles slashs', () => {
		expect(outline(buildFileTree(['src//a.ts']))).toEqual(['src/', '  a.ts']);
	});
});

describe('filterTree', () => {
	const tree = buildFileTree(['src/lib/gitDiff.ts', 'src/hooks/useDocs.ts', 'README.md']);

	it('renvoie l’arbre intact et aucun dépliage pour une requête vide', () => {
		const res = filterTree(tree, '   ');
		expect(res.nodes).toBe(tree);
		expect(res.expand.size).toBe(0);
	});

	it('ne garde que les fichiers correspondants et leurs ancêtres', () => {
		const res = filterTree(tree, 'gitdiff');
		expect(outline(res.nodes)).toEqual(['src/', '  lib/', '    gitDiff.ts']);
	});

	it('déplie tous les dossiers ancêtres d’une correspondance', () => {
		const res = filterTree(tree, 'gitdiff');
		expect([...res.expand].sort()).toEqual(['src', 'src/lib']);
	});

	it('conserve le sous-arbre complet d’un dossier qui correspond', () => {
		const res = filterTree(tree, 'hooks');
		expect(outline(res.nodes)).toEqual(['src/', '  hooks/', '    useDocs.ts']);
	});

	it('est insensible à la casse', () => {
		expect(outline(filterTree(tree, 'README').nodes)).toEqual(['README.md']);
		expect(outline(filterTree(tree, 'readme').nodes)).toEqual(['README.md']);
	});

	it('renvoie un arbre vide quand rien ne correspond', () => {
		expect(filterTree(tree, 'zzz').nodes).toEqual([]);
	});
});

describe('flattenVisible', () => {
	const tree = buildFileTree(['src/lib/a.ts', 'README.md']);

	it('n’émet pas les enfants d’un dossier replié', () => {
		expect(flattenVisible(tree, new Set()).map((n) => n.path)).toEqual(['src', 'README.md']);
	});

	it('émet les enfants d’un dossier déplié avec la bonne profondeur', () => {
		const rows = flattenVisible(tree, new Set(['src']));
		expect(rows.map((n) => `${n.depth}:${n.path}`)).toEqual([
			'0:src',
			'1:src/lib',
			'0:README.md',
		]);
	});

	it('descend récursivement sur les dossiers dépliés imbriqués', () => {
		const rows = flattenVisible(tree, new Set(['src', 'src/lib']));
		expect(rows.map((n) => `${n.depth}:${n.path}`)).toEqual([
			'0:src',
			'1:src/lib',
			'2:src/lib/a.ts',
			'0:README.md',
		]);
	});
});

describe('isActivePath', () => {
	it('est faux sans chemin actif', () => {
		expect(isActivePath('src/a.ts', null)).toBe(false);
	});

	it('reconnaît une égalité de chemin relatif', () => {
		expect(isActivePath('src/a.ts', 'src/a.ts')).toBe(true);
	});

	it('reconnaît un chemin absolu par son suffixe', () => {
		expect(isActivePath('src/a.ts', '/Users/x/repo/src/a.ts')).toBe(true);
	});

	it('ne confond pas deux fichiers dont un nom est le suffixe de l’autre', () => {
		expect(isActivePath('src/a.ts', '/Users/x/repo/src/bba.ts')).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/fileTree.test.ts`
Expected: FAIL — `Failed to resolve import "./fileTree"`

- [ ] **Step 3: Écrire le module**

Créer `src/lib/fileTree.ts` :

```ts
export interface TreeNode {
	name: string;
	path: string;
	isDir: boolean;
	/** Vide pour un fichier. */
	children: TreeNode[];
}

export interface VisibleNode extends TreeNode {
	depth: number;
}

export interface FilterResult {
	nodes: TreeNode[];
	/** Dossiers à déplier pour révéler les correspondances. */
	expand: Set<string>;
}

/** Dossiers d'abord, puis tri alphabétique insensible à la casse. */
function sortChildren(node: TreeNode): void {
	node.children.sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
	for (const child of node.children) {
		if (child.isDir) sortChildren(child);
	}
}

/** Construit un arbre trié depuis une liste plate de chemins relatifs. */
export function buildFileTree(paths: string[]): TreeNode[] {
	const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
	// Index des dossiers déjà créés : évite un parcours de l'arbre par segment.
	const dirs = new Map<string, TreeNode>();

	for (const raw of paths) {
		const segments = raw.split('/').filter(Boolean);
		if (segments.length === 0) continue;
		let parent = root;
		let prefix = '';
		for (let i = 0; i < segments.length; i++) {
			const name = segments[i]!;
			prefix = prefix ? `${prefix}/${name}` : name;
			if (i === segments.length - 1) {
				parent.children.push({ name, path: prefix, isDir: false, children: [] });
				break;
			}
			let dir = dirs.get(prefix);
			if (!dir) {
				dir = { name, path: prefix, isDir: true, children: [] };
				dirs.set(prefix, dir);
				parent.children.push(dir);
			}
			parent = dir;
		}
	}

	sortChildren(root);
	return root.children;
}

/**
 * Filtre l'arbre sur une sous-chaîne du chemin. Un fichier qui correspond garde
 * ses dossiers ancêtres ; un dossier qui correspond garde tout son sous-arbre.
 */
export function filterTree(nodes: TreeNode[], query: string): FilterResult {
	const needle = query.trim().toLowerCase();
	if (!needle) return { nodes, expand: new Set() };

	const expand = new Set<string>();

	const walk = (list: TreeNode[]): TreeNode[] => {
		const kept: TreeNode[] = [];
		for (const node of list) {
			const selfMatch = node.path.toLowerCase().includes(needle);
			if (!node.isDir) {
				if (selfMatch) kept.push(node);
				continue;
			}
			if (selfMatch) {
				kept.push(node);
				expand.add(node.path);
				continue;
			}
			const children = walk(node.children);
			if (children.length > 0) {
				kept.push({ ...node, children });
				expand.add(node.path);
			}
		}
		return kept;
	};

	return { nodes: walk(nodes), expand };
}

/**
 * Liste plate des lignes à rendre. Les enfants d'un dossier replié ne sont pas
 * émis, ce qui garde la liste courte sans avoir besoin de virtualisation.
 */
export function flattenVisible(nodes: TreeNode[], expanded: Set<string>): VisibleNode[] {
	const out: VisibleNode[] = [];
	const walk = (list: TreeNode[], depth: number) => {
		for (const node of list) {
			out.push({ ...node, depth });
			if (node.isDir && expanded.has(node.path)) walk(node.children, depth + 1);
		}
	};
	walk(nodes, 0);
	return out;
}

/**
 * Vrai si `activePath` désigne `nodePath`. L'onglet gauche actif peut porter un
 * chemin absolu alors que l'arbre est relatif : on tolère le match par suffixe,
 * comme `matchFileDiff`.
 */
export function isActivePath(nodePath: string, activePath: string | null): boolean {
	if (!activePath) return false;
	return activePath === nodePath || activePath.endsWith(`/${nodePath}`);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/fileTree.test.ts`
Expected: PASS — 20 tests

- [ ] **Step 5: Vérifier les types et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/fileTree.ts src/lib/fileTree.test.ts
git add src/lib/fileTree.ts src/lib/fileTree.test.ts
git commit -m "feat(lib): module pur fileTree (construction, filtre, aplatissement)"
```

---

### Task 3: Hook `useFileTree` et clés i18n

Le hook enveloppe l'endpoint de la Task 1 dans React Query, en distinguant l'erreur « pas un dépôt git » des autres. Les clés i18n de l'explorateur sont ajoutées dans la même tâche : elles n'ont pas de valeur livrable séparée et le composant de la Task 4 en dépend.

**Files:**
- Create: `src/hooks/useFileTree.ts`
- Modify: `src/config/translate/en.json` (namespace `workbench`, après la clé `"chipReader"` ligne 99)
- Modify: `src/config/translate/fr.json` (idem, ligne 99)
- Modify: `src/config/translate/es.json` (idem, ligne 99)
- Modify: `src/config/translate/de.json` (idem, ligne 99)
- Modify: `src/config/translate/pt.json` (idem, ligne 99)

**Interfaces:**
- Consumes: `localFetch` depuis `@/lib/local-fetch` (lève `AgentOfflineError` si l'agent est injoignable).
- Produces (consommé par la Task 4) :
  - `export interface FileTreeResponse { files: string[]; truncated: boolean; root: string }`
  - `export function useFileTree(cwd: string | null): { files: string[]; truncated: boolean; isLoading: boolean; error: Error | null; notARepo: boolean }`
  - Clés i18n du namespace `workbench` : `chipExplorer`, `explorerFilter`, `explorerClearFilter`, `explorerEmpty`, `explorerNoMatch`, `explorerNotARepo`, `explorerTruncated`, `explorerError`, `fileNoHighlight`.

- [ ] **Step 1: Écrire le hook**

Créer `src/hooks/useFileTree.ts` :

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';

export interface FileTreeResponse {
	files: string[];
	truncated: boolean;
	root: string;
}

/** Nom d'erreur porté quand le dossier n'est pas un dépôt git, pour un message dédié. */
const NOT_A_REPO = 'NotARepoError';

/**
 * Liste des fichiers non ignorés par git à la racine `cwd`.
 * Pas de polling : l'invalidation est explicite depuis le Workbench, à la fin
 * d'un tour d'agent — c'est le seul moment où l'arborescence peut avoir bougé.
 */
export function useFileTree(cwd: string | null) {
	const query = useQuery({
		queryKey: ['file-tree', cwd],
		queryFn: async (): Promise<FileTreeResponse> => {
			const params = new URLSearchParams({ cwd: cwd! });
			const res = await localFetch(`/filesystem/tree?${params}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as {
					error?: string;
					code?: string;
				};
				const err = new Error(body.error ?? 'Failed to list files');
				if (body.code === 'not_a_repo') err.name = NOT_A_REPO;
				throw err;
			}
			return res.json();
		},
		enabled: !!cwd,
		staleTime: 30_000,
	});

	return {
		files: query.data?.files ?? [],
		truncated: query.data?.truncated ?? false,
		isLoading: query.isLoading,
		error: query.error,
		notARepo: query.error?.name === NOT_A_REPO,
	};
}
```

- [ ] **Step 2: Ajouter les clés dans `en.json`**

Dans `src/config/translate/en.json`, namespace `workbench`, remplacer la ligne 99 `"chipReader": "Reader"` par :

```json
		"chipReader": "Reader",
		"chipExplorer": "Explorer",
		"explorerFilter": "Filter files",
		"explorerClearFilter": "Clear filter",
		"explorerEmpty": "No files to show",
		"explorerNoMatch": "No file matches",
		"explorerNotARepo": "This folder is not a git repository",
		"explorerTruncated": "Too many files — the tree is partial",
		"explorerError": "Unable to list files",
		"fileNoHighlight": "Large file — syntax highlighting disabled"
```

- [ ] **Step 3: Ajouter les clés dans `fr.json`**

Remplacer la ligne 99 `"chipReader": "Lecture"` par :

```json
		"chipReader": "Lecture",
		"chipExplorer": "Explorateur",
		"explorerFilter": "Filtrer les fichiers",
		"explorerClearFilter": "Effacer le filtre",
		"explorerEmpty": "Aucun fichier à afficher",
		"explorerNoMatch": "Aucun fichier ne correspond",
		"explorerNotARepo": "Ce dossier n'est pas un dépôt git",
		"explorerTruncated": "Trop de fichiers — l'arbre est partiel",
		"explorerError": "Impossible de lister les fichiers",
		"fileNoHighlight": "Fichier volumineux — coloration syntaxique désactivée"
```

- [ ] **Step 4: Ajouter les clés dans `es.json`**

Remplacer la ligne 99 `"chipReader": "Lectura"` par :

```json
		"chipReader": "Lectura",
		"chipExplorer": "Explorador",
		"explorerFilter": "Filtrar archivos",
		"explorerClearFilter": "Borrar el filtro",
		"explorerEmpty": "No hay archivos que mostrar",
		"explorerNoMatch": "Ningún archivo coincide",
		"explorerNotARepo": "Esta carpeta no es un repositorio git",
		"explorerTruncated": "Demasiados archivos — el árbol está incompleto",
		"explorerError": "No se pueden listar los archivos",
		"fileNoHighlight": "Archivo grande — resaltado de sintaxis desactivado"
```

- [ ] **Step 5: Ajouter les clés dans `de.json`**

Remplacer la ligne 99 `"chipReader": "Lesen"` par :

```json
		"chipReader": "Lesen",
		"chipExplorer": "Explorer",
		"explorerFilter": "Dateien filtern",
		"explorerClearFilter": "Filter löschen",
		"explorerEmpty": "Keine Dateien vorhanden",
		"explorerNoMatch": "Keine Datei gefunden",
		"explorerNotARepo": "Dieser Ordner ist kein Git-Repository",
		"explorerTruncated": "Zu viele Dateien — der Baum ist unvollständig",
		"explorerError": "Dateien können nicht aufgelistet werden",
		"fileNoHighlight": "Große Datei — Syntaxhervorhebung deaktiviert"
```

- [ ] **Step 6: Ajouter les clés dans `pt.json`**

Remplacer la ligne 99 `"chipReader": "Leitura"` par :

```json
		"chipReader": "Leitura",
		"chipExplorer": "Explorador",
		"explorerFilter": "Filtrar ficheiros",
		"explorerClearFilter": "Limpar o filtro",
		"explorerEmpty": "Nenhum ficheiro a mostrar",
		"explorerNoMatch": "Nenhum ficheiro corresponde",
		"explorerNotARepo": "Esta pasta não é um repositório git",
		"explorerTruncated": "Demasiados ficheiros — a árvore está incompleta",
		"explorerError": "Não é possível listar os ficheiros",
		"fileNoHighlight": "Ficheiro grande — realce de sintaxe desativado"
```

- [ ] **Step 7: Vérifier que les 5 fichiers de traduction sont du JSON valide et alignés**

```bash
for f in en fr es de pt; do node -e "
const w = require('./src/config/translate/$f.json').workbench;
const keys = ['chipExplorer','explorerFilter','explorerClearFilter','explorerEmpty','explorerNoMatch','explorerNotARepo','explorerTruncated','explorerError','fileNoHighlight'];
const missing = keys.filter((k) => !w[k]);
if (missing.length) { console.error('$f manquant:', missing); process.exit(1); }
console.log('$f ok');
"; done
```

Expected: `en ok` / `fr ok` / `es ok` / `de ok` / `pt ok`, aucun code de sortie non nul.

- [ ] **Step 8: Vérifier les types et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/hooks/useFileTree.ts src/config/translate/*.json
git add src/hooks/useFileTree.ts src/config/translate/en.json src/config/translate/fr.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "feat(hooks): useFileTree + clés i18n de l'explorateur (5 locales)"
```

---

### Task 4: Composant `FileExplorerTab` et câblage de l'onglet

Livrable : l'explorateur fonctionne de bout en bout. C'est la tâche où la feature devient visible.

**Files:**
- Create: `src/components/workbench/FileExplorerTab.tsx`
- Modify: `src/components/workbench/Workbench.tsx`
  - imports d'icônes (autour de la ligne 22)
  - import du composant (autour de la ligne 54)
  - `type RightTab` ligne 120
  - `onTurnComplete` lignes 551-557
  - tableau `rightTabs` lignes 595-625
  - `rightContent` lignes 626-649

**Interfaces:**
- Consumes:
  - `useFileTree` depuis `@/hooks/useFileTree` (Task 3)
  - `buildFileTree`, `filterTree`, `flattenVisible`, `isActivePath` depuis `@/lib/fileTree` (Task 2)
  - Clés i18n `workbench.chipExplorer`, `.explorerFilter`, `.explorerEmpty`, `.explorerNoMatch`, `.explorerNotARepo`, `.explorerTruncated`, `.explorerError` (Task 3)
  - `openChanges(filePath: string): void` et `isSessionTab(tab: string): boolean`, déjà présents dans `Workbench.tsx`
- Produces: `export default function FileExplorerTab(props: { cwd: string | null; activePath: string | null; onOpenFile: (path: string) => void })`

- [ ] **Step 1: Créer le composant**

Créer `src/components/workbench/FileExplorerTab.tsx` :

```tsx
'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useFileTree } from '@/hooks/useFileTree';
import { buildFileTree, filterTree, flattenVisible, isActivePath } from '@/lib/fileTree';

interface FileExplorerTabProps {
	/** Racine de l'arborescence : worktree de la session, sinon dépôt principal. */
	cwd: string | null;
	/** Chemin de l'onglet gauche actif (relatif ou absolu), pour le surlignage. */
	activePath: string | null;
	onOpenFile: (path: string) => void;
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100%',
				px: 2,
				textAlign: 'center',
			}}
		>
			{children}
		</Box>
	);
}

export default function FileExplorerTab({ cwd, activePath, onOpenFile }: FileExplorerTabProps) {
	const t = useTranslations('workbench');
	const { files, truncated, isLoading, error, notARepo } = useFileTree(cwd);

	const [query, setQuery] = useState('');
	// useDeferredValue plutôt qu'un debounce manuel : la saisie reste fluide et
	// le filtrage de l'arbre est recalculé en arrière-plan par React.
	const deferredQuery = useDeferredValue(query);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	// Changer de session change de racine : l'état de dépliage n'a plus de sens.
	useEffect(() => {
		setQuery('');
		setExpanded(new Set());
	}, [cwd]);

	const tree = useMemo(() => buildFileTree(files), [files]);
	const { nodes, expand } = useMemo(() => filterTree(tree, deferredQuery), [tree, deferredQuery]);

	// Pendant un filtre, on déplie en plus de l'état manuel sans l'écraser :
	// vider le filtre restaure l'arbre tel que l'utilisateur l'avait laissé.
	const effectiveExpanded = useMemo(
		() => (expand.size === 0 ? expanded : new Set([...expanded, ...expand])),
		[expanded, expand],
	);

	const rows = useMemo(() => flattenVisible(nodes, effectiveExpanded), [nodes, effectiveExpanded]);

	const toggle = (path: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	if (isLoading) {
		return (
			<Centered>
				<CircularProgress size={18} />
			</Centered>
		);
	}

	if (error) {
		return (
			<Centered>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{notARepo ? t('explorerNotARepo') : t('explorerError')}
				</Typography>
			</Centered>
		);
	}

	if (files.length === 0) {
		return (
			<Centered>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('explorerEmpty')}
				</Typography>
			</Centered>
		);
	}

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					px: 1.5,
					py: 0.75,
					borderBottom: 1,
					borderColor: 'divider',
					flexShrink: 0,
				}}
			>
				<SearchRoundedIcon sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
				<InputBase
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t('explorerFilter')}
					sx={{ flex: 1, fontSize: '0.72rem', '& input': { p: 0 } }}
				/>
				{query && (
					<IconButton
						size="small"
						onClick={() => setQuery('')}
						aria-label={t('explorerClearFilter')}
						sx={{ p: 0.25, color: 'text.disabled' }}
					>
						<CloseRoundedIcon sx={{ fontSize: 14 }} />
					</IconButton>
				)}
			</Box>

			{truncated && (
				<Typography
					variant="caption"
					sx={{
						px: 1.5,
						py: 0.5,
						color: 'warning.main',
						borderBottom: 1,
						borderColor: 'divider',
						flexShrink: 0,
					}}
				>
					{t('explorerTruncated')}
				</Typography>
			)}

			{rows.length === 0 ? (
				// flex: 1 indispensable : Centered s'appuie sur height 100%, qui ne
				// vaut rien sur un enfant flex qui n'occupe pas l'espace restant.
				<Box sx={{ flex: 1, minHeight: 0 }}>
					<Centered>
						<Typography variant="caption" sx={{ color: 'text.disabled' }}>
							{t('explorerNoMatch')}
						</Typography>
					</Centered>
				</Box>
			) : (
				<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', py: 0.5 }}>
					{rows.map((node) => {
						const active = !node.isDir && isActivePath(node.path, activePath);
						const open = effectiveExpanded.has(node.path);
						return (
							<Box
								key={node.path}
								onClick={() =>
									node.isDir ? toggle(node.path) : onOpenFile(node.path)
								}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 0.5,
									height: 22,
									pr: 1.5,
									pl: 1 + node.depth * 1.25,
									cursor: 'pointer',
									bgcolor: active ? 'action.selected' : 'transparent',
									transition: 'background-color 0.15s',
									'&:hover': { bgcolor: 'action.hover' },
								}}
							>
								{node.isDir ? (
									<>
										{open ? (
											<KeyboardArrowDownRoundedIcon
												sx={{
													fontSize: 14,
													color: 'text.disabled',
													flexShrink: 0,
												}}
											/>
										) : (
											<KeyboardArrowRightRoundedIcon
												sx={{
													fontSize: 14,
													color: 'text.disabled',
													flexShrink: 0,
												}}
											/>
										)}
										<FolderRoundedIcon
											sx={{
												fontSize: 13,
												flexShrink: 0,
												color: (theme) =>
													alpha(theme.palette.primary.main, 0.7),
											}}
										/>
									</>
								) : (
									<>
										<Box sx={{ width: 14, flexShrink: 0 }} />
										<InsertDriveFileRoundedIcon
											sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }}
										/>
									</>
								)}
								<Typography
									variant="caption"
									title={node.path}
									sx={{
										flex: 1,
										minWidth: 0,
										fontSize: '0.72rem',
										fontWeight: active ? 600 : 400,
										color: active ? 'text.primary' : 'text.secondary',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{node.name}
								</Typography>
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
}
```

- [ ] **Step 2: Ajouter les imports dans `Workbench.tsx`**

Après la ligne `import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';` (ligne 22), ajouter :

```tsx
import FolderCopyRoundedIcon from '@mui/icons-material/FolderCopyRounded';
```

Après la ligne `import FileContentView from '@/components/workbench/FileContentView';` (ligne 54), ajouter :

```tsx
import FileExplorerTab from '@/components/workbench/FileExplorerTab';
```

- [ ] **Step 3: Étendre le type `RightTab`**

Ligne 120, remplacer :

```tsx
	type RightTab = 'changes' | 'activity' | 'issue';
```

par :

```tsx
	type RightTab = 'changes' | 'activity' | 'explorer' | 'issue';
```

- [ ] **Step 4: Invalider l'arbre à la fin d'un tour d'agent**

Dans le `onTurnComplete` de `<AgentChatTab>` (lignes 551-557), ajouter l'invalidation de `file-tree` — l'agent vient peut-être de créer ou supprimer des fichiers :

```tsx
									onTurnComplete={() => {
										queryClient.invalidateQueries({ queryKey: ['git-diff'] });
										queryClient.invalidateQueries({ queryKey: ['git-status'] });
										queryClient.invalidateQueries({ queryKey: ['file-tree'] });
										queryClient.invalidateQueries({
											queryKey: ['github', 'prs'],
										});
									}}
```

- [ ] **Step 5: Ajouter l'onglet dans `rightTabs`**

Dans le tableau `rightTabs`, insérer ce `<Tab>` entre l'entrée `activity` (qui se termine par `),` ligne 615) et l'entrée `hasIssue && (` ligne 616 :

```tsx
						<Tab
							key="explorer"
							value="explorer"
							iconPosition="start"
							icon={<FolderCopyRoundedIcon sx={{ fontSize: 16 }} />}
							label={t('chipExplorer')}
						/>,
```

L'onglet n'est **pas** conditionné : contrairement à Activity, consulter les fichiers d'un worktree archivé reste utile, donc aucun ajustement de `effectiveRightTab` n'est nécessaire.

- [ ] **Step 6: Rendre le contenu de l'onglet**

Dans `rightContent`, insérer entre le bloc `effectiveRightTab === 'activity'` (qui se termine ligne 640) et le bloc `effectiveRightTab === 'issue'` ligne 641 :

```tsx
							{effectiveRightTab === 'explorer' && (
								<FileExplorerTab
									cwd={diffPath}
									activePath={isSessionTab(activeTab) ? null : activeTab}
									onOpenFile={openChanges}
								/>
							)}
```

- [ ] **Step 7: Vérifier les types, le lint et le build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: aucune erreur, build réussi

- [ ] **Step 8: Vérifier à la main dans le navigateur**

Lancer `npm run dev` si nécessaire, ouvrir `http://localhost:4000/workbench?session=<un id de session existant>`, puis contrôler :

1. Un onglet « Explorateur » apparaît dans le panneau droit, entre Activity et Issue.
2. L'arbre affiche les dossiers du worktree, dossiers avant fichiers, **sans** `node_modules` ni `.next`.
3. Cliquer un dossier le déplie et le replie, le chevron change de sens.
4. Cliquer un fichier ouvre un onglet gauche à côté du chat qui affiche son contenu.
5. Cliquer un fichier **modifié** ouvre son diff (comportement attendu de `matchFileDiff`).
6. Le fichier de l'onglet actif est surligné dans l'arbre.
7. Taper dans le filtre réduit l'arbre et déplie les dossiers correspondants ; effacer le filtre restaure l'état de dépliage précédent.
8. Un filtre sans résultat affiche « Aucun fichier ne correspond ».
9. Basculer le thème via le header : l'arbre reste lisible en dark **et** en light.
10. Changer de session vide le filtre et replie tout.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/components/workbench/FileExplorerTab.tsx src/components/workbench/Workbench.tsx
git add src/components/workbench/FileExplorerTab.tsx src/components/workbench/Workbench.tsx
git commit -m "feat(workbench): onglet Explorateur avec arbre de fichiers filtrable"
```

---

### Task 5: Dépendance shiki et mapping extension → langage

Prépare la coloration : la dépendance est installée et le mapping extension/langage est un module pur, donc testé.

**Files:**
- Create: `src/lib/languageFromPath.ts`
- Create: `src/lib/languageFromPath.test.ts`
- Modify: `package.json` (via `npm install`), `package-lock.json`

**Interfaces:**
- Consumes: rien.
- Produces (consommé par la Task 6) :
  - `export const FALLBACK_LANGUAGE = 'text'`
  - `export const SHIKI_LANGUAGES: string[]` — la liste exacte à passer à `createHighlighter({ langs })`
  - `export function languageFromPath(path: string): string`

- [ ] **Step 1: Installer shiki**

```bash
npm install shiki@4.3.1
```

Expected: `package.json` gagne `"shiki": "4.3.1"` dans `dependencies`. Aucune configuration webpack ou Turbopack n'est nécessaire : le moteur Oniguruma de shiki charge son wasm depuis `shiki/wasm`, un module JS où le binaire est déjà inliné.

- [ ] **Step 2: Écrire le test qui échoue**

Créer `src/lib/languageFromPath.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { languageFromPath, FALLBACK_LANGUAGE, SHIKI_LANGUAGES } from './languageFromPath';

describe('languageFromPath', () => {
	it('mappe les extensions du projet', () => {
		expect(languageFromPath('src/lib/a.ts')).toBe('typescript');
		expect(languageFromPath('src/components/A.tsx')).toBe('tsx');
		expect(languageFromPath('scripts/dev.mjs')).toBe('javascript');
		expect(languageFromPath('package.json')).toBe('json');
		expect(languageFromPath('README.md')).toBe('markdown');
		expect(languageFromPath('style.css')).toBe('css');
		expect(languageFromPath('deploy.sh')).toBe('shellscript');
		expect(languageFromPath('ci.yml')).toBe('yaml');
	});

	it('est insensible à la casse de l’extension', () => {
		expect(languageFromPath('A.TS')).toBe('typescript');
	});

	it('ne regarde que le dernier segment du chemin', () => {
		expect(languageFromPath('a.ts/b.json')).toBe('json');
	});

	it('mappe les fichiers reconnus par leur nom complet', () => {
		expect(languageFromPath('Dockerfile')).toBe('dockerfile');
		expect(languageFromPath('Makefile')).toBe('make');
		expect(languageFromPath('.gitignore')).toBe('ini');
	});

	it('mappe un nom complet suffixé', () => {
		expect(languageFromPath('.env.local')).toBe('ini');
		expect(languageFromPath('Dockerfile.dev')).toBe('dockerfile');
	});

	it('utilise la dernière extension d’un nom à plusieurs points', () => {
		expect(languageFromPath('.eslintrc.json')).toBe('json');
		expect(languageFromPath('vitest.config.ts')).toBe('typescript');
	});

	it('retombe sur le fallback pour une extension inconnue', () => {
		expect(languageFromPath('archive.bin')).toBe(FALLBACK_LANGUAGE);
	});

	it('retombe sur le fallback sans extension', () => {
		expect(languageFromPath('LICENSE')).toBe(FALLBACK_LANGUAGE);
		expect(languageFromPath('')).toBe(FALLBACK_LANGUAGE);
	});
});

describe('SHIKI_LANGUAGES', () => {
	it('ne contient pas de doublon', () => {
		expect(new Set(SHIKI_LANGUAGES).size).toBe(SHIKI_LANGUAGES.length);
	});

	it("n'inclut pas le fallback, que shiki traite comme un langage spécial", () => {
		expect(SHIKI_LANGUAGES).not.toContain(FALLBACK_LANGUAGE);
	});

	it('couvre toutes les valeurs que languageFromPath peut renvoyer', () => {
		for (const path of ['a.ts', 'a.tsx', 'a.json', 'Dockerfile', 'Makefile', '.gitignore']) {
			expect(SHIKI_LANGUAGES).toContain(languageFromPath(path));
		}
	});
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/languageFromPath.test.ts`
Expected: FAIL — `Failed to resolve import "./languageFromPath"`

- [ ] **Step 4: Écrire le module**

Créer `src/lib/languageFromPath.ts` :

```ts
/** Identifiants de langage shiki, par extension de fichier. */
const BY_EXTENSION: Record<string, string> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	json: 'json',
	jsonc: 'jsonc',
	css: 'css',
	scss: 'scss',
	html: 'html',
	xml: 'xml',
	svg: 'xml',
	md: 'markdown',
	mdx: 'markdown',
	sh: 'shellscript',
	bash: 'shellscript',
	zsh: 'shellscript',
	yml: 'yaml',
	yaml: 'yaml',
	toml: 'toml',
	ini: 'ini',
	sql: 'sql',
	py: 'python',
	go: 'go',
	rs: 'rust',
	java: 'java',
	rb: 'ruby',
	php: 'php',
	graphql: 'graphql',
	gql: 'graphql',
	prisma: 'prisma',
	vue: 'vue',
	diff: 'diff',
	patch: 'diff',
};

/** Fichiers reconnus par leur nom complet : aucune extension sur laquelle s'appuyer. */
const BY_FILENAME: Record<string, string> = {
	dockerfile: 'dockerfile',
	makefile: 'make',
	'.gitignore': 'ini',
	'.dockerignore': 'ini',
	'.prettierignore': 'ini',
	'.npmrc': 'ini',
	'.env': 'ini',
};

/** Langage spécial de shiki : aucune grammaire à charger, rendu sans couleur. */
export const FALLBACK_LANGUAGE = 'text';

/** Grammaires à charger dans createHighlighter, dédupliquées. */
export const SHIKI_LANGUAGES: string[] = [
	...new Set([...Object.values(BY_EXTENSION), ...Object.values(BY_FILENAME)]),
];

/** Déduit l'identifiant de langage shiki d'un chemin de fichier. */
export function languageFromPath(path: string): string {
	const name = (path.split('/').pop() ?? '').toLowerCase();
	if (!name) return FALLBACK_LANGUAGE;

	const exact = BY_FILENAME[name];
	if (exact) return exact;

	const dot = name.lastIndexOf('.');
	// dot <= 0 : soit pas d'extension, soit un dotfile déjà traité par BY_FILENAME.
	if (dot > 0) {
		const byExt = BY_EXTENSION[name.slice(dot + 1)];
		if (byExt) return byExt;
	}

	// Noms complets suffixés : `.env.local`, `Dockerfile.dev`.
	for (const [key, lang] of Object.entries(BY_FILENAME)) {
		if (name.startsWith(`${key}.`)) return lang;
	}

	return FALLBACK_LANGUAGE;
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/languageFromPath.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 6: Vérifier les types et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/lib/languageFromPath.ts src/lib/languageFromPath.test.ts
git add package.json package-lock.json src/lib/languageFromPath.ts src/lib/languageFromPath.test.ts
git commit -m "feat(lib): mapping extension → langage shiki + dépendance shiki"
```

---

### Task 6: Composant `CodeBlock` et coloration de la vue de fichier

Livrable : les fichiers ouverts à côté du chat sont colorés. La gouttière manuelle de `FileContentView` disparaît au profit des numéros de ligne rendus par CSS sur les `<span class="line">` que shiki émet.

**Files:**
- Create: `src/components/workbench/CodeBlock.tsx`
- Modify: `src/components/workbench/FileContentView.tsx` (imports lignes 1-9, bloc de rendu lignes 49-112)

**Interfaces:**
- Consumes:
  - `languageFromPath`, `SHIKI_LANGUAGES` depuis `@/lib/languageFromPath` (Task 5)
  - `useColorMode` depuis `@/hooks/useColorMode` — renvoie `{ variant, setVariant, mode }` où `mode` vaut `'dark' | 'light'`
  - Clé i18n `workbench.fileNoHighlight` (Task 3)
- Produces: `export default function CodeBlock(props: { code: string; path: string })`

- [ ] **Step 1: Créer le composant**

Créer `src/components/workbench/CodeBlock.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Highlighter } from 'shiki';
import { useTranslations } from 'next-intl';
import { useColorMode } from '@/hooks/useColorMode';
import { languageFromPath, SHIKI_LANGUAGES } from '@/lib/languageFromPath';

const FONT = '"JetBrains Mono", monospace';

/** Au-delà, la tokenisation TextMate bloque trop longtemps le thread principal. */
const MAX_HIGHLIGHT_CHARS = 200_000;

const THEMES = {
	dark: 'github-dark-default',
	light: 'github-light-default',
} as const;

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Chargé une seule fois par session de navigation : le wasm Oniguruma et les
 * grammaires pèsent environ 1 Mo, d'où l'import dynamique.
 */
function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = import('shiki').then((shiki) =>
			shiki.createHighlighter({
				themes: [THEMES.dark, THEMES.light],
				langs: SHIKI_LANGUAGES,
			}),
		);
	}
	return highlighterPromise;
}

/** Rendu monospace sans couleur : état d'attente et repli si shiki échoue. */
const plainSx = {
	m: 0,
	px: 1.5,
	py: 1,
	minWidth: 'max-content',
	color: 'text.primary',
	fontFamily: FONT,
	fontSize: '0.78rem',
	lineHeight: 1.5,
	whiteSpace: 'pre',
} as const;

/**
 * Numéros de ligne par compteur CSS sur les `<span class="line">` émis par shiki :
 * une seule source de vérité pour le rendu, donc aucun désalignement possible.
 * Le `!important` neutralise le background que shiki écrit en style inline.
 */
const shikiSx = {
	'& pre.shiki': {
		m: 0,
		py: 1,
		px: 0,
		bgcolor: 'transparent !important',
		fontFamily: FONT,
		fontSize: '0.78rem',
		lineHeight: 1.5,
		minWidth: 'max-content',
	},
	'& pre.shiki code': {
		display: 'block',
		fontFamily: 'inherit',
		counterReset: 'shiki-line',
	},
	'& pre.shiki .line': { display: 'block' },
	'& pre.shiki .line::before': {
		counterIncrement: 'shiki-line',
		content: 'counter(shiki-line)',
		display: 'inline-block',
		width: '3.5em',
		mr: 1.5,
		pr: 1,
		textAlign: 'right',
		color: 'text.disabled',
		userSelect: 'none',
		borderRight: '1px solid',
		borderColor: 'divider',
	},
} as const;

export default function CodeBlock({ code, path }: { code: string; path: string }) {
	const t = useTranslations('workbench');
	const { mode } = useColorMode();
	const [html, setHtml] = useState<string | null>(null);
	const tooLarge = code.length > MAX_HIGHLIGHT_CHARS;

	useEffect(() => {
		if (tooLarge) {
			setHtml(null);
			return;
		}
		let cancelled = false;
		getHighlighter()
			.then((highlighter) => {
				if (cancelled) return;
				setHtml(
					highlighter.codeToHtml(code, {
						lang: languageFromPath(path),
						theme: THEMES[mode],
					}),
				);
			})
			.catch(() => {
				// Shiki indisponible : le repli en texte brut ci-dessous reste affiché.
			});
		return () => {
			cancelled = true;
		};
	}, [code, path, mode, tooLarge]);

	if (!html) {
		return (
			<Box>
				{tooLarge && (
					<Typography
						variant="caption"
						sx={{
							display: 'block',
							px: 1.5,
							py: 0.5,
							color: 'text.disabled',
							borderBottom: 1,
							borderColor: 'divider',
						}}
					>
						{t('fileNoHighlight')}
					</Typography>
				)}
				<Box component="pre" sx={plainSx}>
					{code}
				</Box>
			</Box>
		);
	}

	// La source vient du disque local de l'utilisateur, pas d'un tiers : le HTML
	// injecté est celui que shiki génère à partir de ses propres grammaires.
	return <Box sx={shikiSx} dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 2: Brancher `CodeBlock` dans `FileContentView`**

Dans `src/components/workbench/FileContentView.tsx`, remplacer intégralement le contenu du fichier par :

```tsx
'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslations } from 'next-intl';
import { useFileContent } from '@/hooks/useFileContent';
import CodeBlock from '@/components/workbench/CodeBlock';

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100%',
				px: 2,
			}}
		>
			{children}
		</Box>
	);
}

export default function FileContentView({ cwd, path }: { cwd: string | null; path: string }) {
	const t = useTranslations('workbench');
	const { data, isLoading, error } = useFileContent(cwd, path);

	if (isLoading) {
		return (
			<Centered>
				<CircularProgress size={18} />
			</Centered>
		);
	}

	if (error || !data) {
		return (
			<Centered>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('fileError')}
				</Typography>
			</Centered>
		);
	}

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			{data.truncated && (
				<Typography
					variant="caption"
					sx={{
						px: 1.5,
						py: 0.5,
						color: 'warning.main',
						borderBottom: 1,
						borderColor: 'divider',
						flexShrink: 0,
					}}
				>
					{t('fileTruncated')}
				</Typography>
			)}
			<Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
				<CodeBlock code={data.content} path={path} />
			</Box>
		</Box>
	);
}
```

La constante `FONT` et la gouttière `<pre>` de numéros disparaissent de ce fichier : elles vivent désormais dans `CodeBlock`.

- [ ] **Step 3: Vérifier les types, le lint et le build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: aucune erreur, build réussi. Le build doit produire un chunk séparé pour shiki, puisqu'il est importé dynamiquement.

- [ ] **Step 4: Lancer la suite de tests complète**

Run: `npm run test:web`
Expected: PASS — aucune régression sur les tests existants

- [ ] **Step 5: Vérifier à la main dans le navigateur**

Ouvrir le Workbench sur une session, puis :

1. Ouvrir un `.tsx` depuis l'explorateur : le code est coloré, les numéros de ligne s'affichent à gauche avec un filet séparateur, alignés sur les lignes.
2. Le fond du bloc de code est celui du panneau, pas le fond blanc ou noir propre au thème shiki.
3. Basculer dark → light via le header : la coloration change de thème sans rechargement.
4. Ouvrir un `.json`, un `.md`, un `.sh` : chacun est coloré selon sa syntaxe.
5. Ouvrir un fichier sans extension connue (`LICENSE`) : rendu lisible en texte, sans erreur console.
6. Une ligne très longue fait défiler horizontalement le bloc.
7. Ouvrir un très gros fichier (`package-lock.json` par exemple) : le bandeau « Fichier volumineux — coloration syntaxique désactivée » s'affiche et le contenu reste lisible.
8. Aucune erreur dans la console du navigateur.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/components/workbench/CodeBlock.tsx src/components/workbench/FileContentView.tsx
git add src/components/workbench/CodeBlock.tsx src/components/workbench/FileContentView.tsx
git commit -m "feat(workbench): coloration syntaxique shiki dans la vue de fichier"
```

---

## Écarts assumés par rapport au spec

Deux points où l'implémentation planifiée diverge de la lettre du spec, décidés en écrivant le plan :

1. **Le spec évoque « `codeToHtml` avec l'option de numérotation ».** Shiki n'a pas d'option de numérotation ; il émet un `<span class="line">` par ligne. Les numéros sont donc rendus par un compteur CSS sur ces spans, ce qui satisfait l'intention (une seule source de vérité, pas de désalignement). Vérifié sur shiki 4.3.1.
2. **Le spec ne bornait pas la taille de fichier colorée.** Tokeniser 1 Mo bloque le thread principal plusieurs secondes. Un plafond de 200 000 caractères a été ajouté, au-delà duquel le fichier s'affiche en texte brut avec un bandeau explicite (clé `fileNoHighlight`).
3. **Le spec prévoyait un debounce manuel de 120 ms sur le filtre.** `useDeferredValue` de React 19 rend le même service — saisie fluide, filtrage recalculé en arrière-plan — sans `setTimeout` ni nettoyage d'effet à maintenir. Aucune constante de délai à régler.

Conséquence secondaire acceptée : la gouttière de numéros n'est plus `position: sticky`, elle défile donc horizontalement avec le code sur les lignes très longues. C'est le prix d'un rendu piloté entièrement par shiki.
