import { describe, it, expect } from 'vitest';
import { extractFilePath, basename, prettyToolName, toolChipLabel } from './toolCard';

describe('extractFilePath', () => {
	it('reads file_path first', () => {
		expect(extractFilePath({ file_path: '/a/b.ts' })).toBe('/a/b.ts');
	});
	it('falls back to path then notebook_path', () => {
		expect(extractFilePath({ path: '/a/c.ts' })).toBe('/a/c.ts');
		expect(extractFilePath({ notebook_path: '/a/d.ipynb' })).toBe('/a/d.ipynb');
	});
	it('returns null when no file key or blank', () => {
		expect(extractFilePath({ command: 'ls' })).toBeNull();
		expect(extractFilePath({ file_path: '  ' })).toBeNull();
		expect(extractFilePath(null)).toBeNull();
		expect(extractFilePath('nope')).toBeNull();
	});
});

describe('basename', () => {
	it('returns the last segment', () => {
		expect(basename('/a/b/c.tsx')).toBe('c.tsx');
		expect(basename('c.tsx')).toBe('c.tsx');
	});
	it('ignores trailing slashes', () => {
		expect(basename('/a/b/')).toBe('b');
	});
});

describe('prettyToolName', () => {
	it('shortens mcp names to the last segment', () => {
		expect(prettyToolName('mcp__github__create_issue')).toBe('create_issue');
	});
	it('leaves plain names untouched', () => {
		expect(prettyToolName('Edit')).toBe('Edit');
	});
});

describe('toolChipLabel', () => {
	it('uses the basename for file tools', () => {
		expect(toolChipLabel({ file_path: '/src/components/Foo.tsx' })).toBe('Foo.tsx');
	});
	it('falls back to command/pattern/url', () => {
		expect(toolChipLabel({ command: 'npm run build' })).toBe('npm run build');
		expect(toolChipLabel({ pattern: '*.ts' })).toBe('*.ts');
		expect(toolChipLabel({ url: 'https://x.dev' })).toBe('https://x.dev');
	});
	it('returns empty string when nothing usable', () => {
		expect(toolChipLabel({})).toBe('');
		expect(toolChipLabel(undefined)).toBe('');
	});
});
