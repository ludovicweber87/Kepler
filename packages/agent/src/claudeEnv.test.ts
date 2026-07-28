import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAUDE_ENV_STRIP_KEYS, cleanClaudeEnv } from './helpers.js';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir = SRC): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return sourceFiles(full);
		if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) return [];
		return [full];
	});
}

test('cleanClaudeEnv retire toutes les variables qui détournent l’auth Claude', () => {
	for (const key of CLAUDE_ENV_STRIP_KEYS) process.env[key] = 'changeMe';
	try {
		const env = cleanClaudeEnv();
		for (const key of CLAUDE_ENV_STRIP_KEYS) assert.equal(env[key], undefined, key);
		assert.equal(env.PATH, process.env.PATH, 'le reste de l’env est préservé');
	} finally {
		for (const key of CLAUDE_ENV_STRIP_KEYS) delete process.env[key];
	}
});

/**
 * Garde-fou : `helpers.ts` promet une « liste unique partagée pour éviter que les
 * deux chemins divergent à nouveau ». Reconstruire l’env à la main laisse fuiter
 * ANTHROPIC_* vers le CLI, qui sort alors en erreur — panne silencieuse.
 */
test('aucun site ne reconstruit l’env Claude à la main', () => {
	const offenders = sourceFiles()
		.filter((f) => !f.endsWith('helpers.ts'))
		.flatMap((file) => {
			const lines = readFileSync(file, 'utf-8').split('\n');
			return lines
				.map((line, i) => ({ line, n: i + 1 }))
				.filter(({ line }) =>
					/CLAUDECODE\s*,\s*CLAUDE_CODE_ENTRYPOINT\s*,\s*\.\.\./.test(line),
				)
				.map(({ n }) => `${relative(SRC, file)}:${n}`);
		});

	assert.deepEqual(offenders, [], `utiliser cleanClaudeEnv() dans : ${offenders.join(', ')}`);
});

test('aucun duplicata de la liste de strip hors helpers.ts', () => {
	const offenders = sourceFiles()
		.filter((f) => !f.endsWith('helpers.ts'))
		.filter((file) => /delete\s+env\.ANTHROPIC_API_KEY/.test(readFileSync(file, 'utf-8')))
		.map((f) => relative(SRC, f));

	assert.deepEqual(offenders, [], `liste dupliquée dans : ${offenders.join(', ')}`);
});

test('le claude lancé dans un pane tmux neutralise toute la liste', () => {
	const terminal = readFileSync(join(SRC, 'terminal.ts'), 'utf-8');
	assert.match(
		terminal,
		/unset \$\{CLAUDE_ENV_STRIP_KEYS\.join\(' '\)\}/,
		'le pane tmux doit unset la liste partagée, pas une liste écrite à la main',
	);
});
