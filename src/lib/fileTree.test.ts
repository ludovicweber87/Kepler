import { describe, it, expect } from 'vitest';
import {
	buildFileTree,
	filterTree,
	flattenVisible,
	isActivePath,
	relativizeActivePath,
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
		expect(outline(buildFileTree(['Zebra.ts', 'alpha.ts']))).toEqual(['alpha.ts', 'Zebra.ts']);
	});

	it('ignore les segments vides issus de doubles slashs', () => {
		expect(outline(buildFileTree(['src//a.ts']))).toEqual(['src/', '  a.ts']);
	});
});

describe('filterTree', () => {
	const tree = buildFileTree(['src/lib/gitDiff.ts', 'src/hooks/useDocs.ts', 'README.md']);

	it("renvoie l'arbre intact et aucun dépliage pour une requête vide", () => {
		const res = filterTree(tree, '   ');
		expect(res.nodes).toBe(tree);
		expect(res.expand.size).toBe(0);
	});

	it('ne garde que les fichiers correspondants et leurs ancêtres', () => {
		const res = filterTree(tree, 'gitdiff');
		expect(outline(res.nodes)).toEqual(['src/', '  lib/', '    gitDiff.ts']);
	});

	it("déplie tous les dossiers ancêtres d'une correspondance", () => {
		const res = filterTree(tree, 'gitdiff');
		expect([...res.expand].sort()).toEqual(['src', 'src/lib']);
	});

	it("conserve le sous-arbre complet d'un dossier qui correspond", () => {
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

	it("ne déplie qu'un niveau sous un dossier qui correspond", () => {
		const tree = buildFileTree(['src/lib/a.ts', 'src/hooks/b.ts']);
		const res = filterTree(tree, 'src');
		expect([...res.expand]).toEqual(['src']);
	});
});

describe('flattenVisible', () => {
	const tree = buildFileTree(['src/lib/a.ts', 'README.md']);

	it("n'émet pas les enfants d'un dossier replié", () => {
		expect(flattenVisible(tree, new Set()).map((n) => n.path)).toEqual(['src', 'README.md']);
	});

	it("émet les enfants d'un dossier déplié avec la bonne profondeur", () => {
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

	it("ne confond pas deux fichiers dont un nom est le suffixe de l'autre", () => {
		expect(isActivePath('src/a.ts', '/Users/x/repo/src/bba.ts')).toBe(false);
	});

	it('ne confond pas un fichier racine avec un homonyme dans un sous-dossier', () => {
		expect(isActivePath('README.md', '/Users/x/repo/docs/README.md')).toBe(false);
	});

	it('reconnaît toujours le fichier imbriqué correspondant dans ce même scénario', () => {
		expect(isActivePath('docs/README.md', '/Users/x/repo/docs/README.md')).toBe(true);
	});
});

describe('relativizeActivePath', () => {
	it('relativise un chemin absolu qui commence par cwd', () => {
		expect(relativizeActivePath('/Users/x/repo/README.md', '/Users/x/repo')).toBe('README.md');
	});

	it('relativise un chemin absolu imbriqué', () => {
		expect(relativizeActivePath('/Users/x/repo/docs/README.md', '/Users/x/repo')).toBe(
			'docs/README.md',
		);
	});

	it('renvoie activePath tel quel quand il ne commence pas par cwd', () => {
		expect(relativizeActivePath('/private/var/repo/README.md', '/var/repo')).toBe(
			'/private/var/repo/README.md',
		);
	});

	it('renvoie activePath tel quel sans cwd', () => {
		expect(relativizeActivePath('/Users/x/repo/README.md', null)).toBe(
			'/Users/x/repo/README.md',
		);
	});

	it('renvoie null sans activePath', () => {
		expect(relativizeActivePath(null, '/Users/x/repo')).toBeNull();
	});
});
