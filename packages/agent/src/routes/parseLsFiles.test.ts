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

	it('ne signale pas de troncature quand la liste tient pile dans le cap', () => {
		expect(parseLsFiles('a\0b', 2)).toEqual({ files: ['a', 'b'], truncated: false });
	});

	it('expose un cap par défaut', () => {
		expect(MAX_TREE_FILES).toBe(20_000);
	});
});
