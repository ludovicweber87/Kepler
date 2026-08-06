import { execFileSync } from 'node:child_process';
import { parseLsFiles } from './routes/parseLsFiles.js';

/** Plafond de fichiers non trackés diffés un par un, pour borner le nombre de process git. */
export const MAX_UNTRACKED_DIFF_FILES = 100;

/** Budget mémoire des sorties `git diff` : un diff de worktree dépasse vite 5 Mo. */
export const DIFF_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Diff d'un fichier non tracké contre le vide. `--no-index` ne touche pas à l'index
 * (contrairement à `git add -N`, qui muterait le worktree pendant qu'un agent y travaille)
 * et sort un en-tête `diff --git a/x b/x` + `new file mode`, donc parsable tel quel par le
 * viewer côté front.
 */
function diffAgainstEmpty(cwd: string, file: string): string {
	try {
		return execFileSync('git', ['diff', '--no-index', '--', '/dev/null', file], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			maxBuffer: DIFF_MAX_BUFFER,
		});
	} catch (err) {
		// `git diff` sort en code 1 dès qu'il y a une différence : c'est le cas nominal ici,
		// la sortie utile est dans stdout. Un vrai échec donne un stdout vide, donc ignoré.
		const stdout = (err as { stdout?: unknown }).stdout;
		return typeof stdout === 'string' ? stdout : '';
	}
}

/**
 * Diff des fichiers créés mais pas encore `git add`. `git diff <ref>` ne liste que les
 * fichiers trackés : sans ça, un agent qui crée dix fichiers laisse le panneau des
 * changements vide alors que `git status` en montre dix.
 */
export function untrackedDiff(cwd: string, max = MAX_UNTRACKED_DIFF_FILES): string {
	let raw = '';
	try {
		raw = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			maxBuffer: DIFF_MAX_BUFFER,
		});
	} catch {
		return '';
	}
	const { files } = parseLsFiles(raw, max);
	return files.map((file) => diffAgainstEmpty(cwd, file)).join('');
}
