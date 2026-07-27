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
	/** Dossiers dont le chemin correspond : dépliés un seul niveau. Descendants d'un dossier match gardent leur état de repliage (choix délibéré pour éviter de noyer le panneau sur une requête large). */
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
 * comme `matchFileDiff`. Un `nodePath` à un seul segment (fichier ou dossier
 * racine, ex. `README.md`) n'a aucune frontière de dossier à faire valoir : il
 * serait un « suffixe complet » tout aussi valide d'un `docs/README.md` situé
 * ailleurs dans l'arbre. Seule l'égalité stricte est donc fiable dans ce cas ;
 * le match par suffixe reste réservé aux chemins à plusieurs segments.
 */
export function isActivePath(nodePath: string, activePath: string | null): boolean {
	if (!activePath) return false;
	if (activePath === nodePath) return true;
	if (!nodePath.includes('/')) return false;
	return activePath.endsWith(`/${nodePath}`);
}

/**
 * Rend `activePath` relatif à `cwd` quand c'est possible, pour lever
 * l'ambiguïté qu'`isActivePath` ne peut pas trancher seul sur un `nodePath` à
 * un seul segment (un fichier racine et un homonyme dans un sous-dossier
 * produisent tous deux un suffixe valide). Si `activePath` ne commence pas
 * par `cwd` — ex. résolution de symlink macOS `/var` vs `/private/var` — il
 * est renvoyé tel quel : le repli par suffixe d'`isActivePath` reste alors le
 * seul recours, comme avant ce correctif.
 */
export function relativizeActivePath(activePath: string | null, cwd: string | null): string | null {
	if (!activePath || !cwd) return activePath;
	const prefix = cwd.endsWith('/') ? cwd : `${cwd}/`;
	if (!activePath.startsWith(prefix)) return activePath;
	return activePath.slice(prefix.length);
}
