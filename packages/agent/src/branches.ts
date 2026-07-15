export interface RawBranch {
	name: string;
	lastCommitDate: string;
	lastCommitMessage: string;
	lastCommitAuthor: string;
}

export interface BranchEntry extends RawBranch {
	isCurrent: boolean;
	isRemote: boolean;
	isCheckedOut: boolean;
}

/**
 * Fusionne branches locales + distantes en dédupliquant (le local masque le distant
 * de même nom), marque isCurrent/isRemote/isCheckedOut, trie par date décroissante.
 * Fonction pure — testable sans git.
 */
export function dedupeAndSortBranches(input: {
	local: RawBranch[];
	remote: RawBranch[];
	current: string;
	checkedOut: string[];
}): BranchEntry[] {
	const checkedOut = new Set(input.checkedOut);
	const byName = new Map<string, BranchEntry>();

	const add = (raw: RawBranch, isRemote: boolean) => {
		if (byName.has(raw.name)) return; // le local (ajouté d'abord) gagne
		byName.set(raw.name, {
			...raw,
			isCurrent: raw.name === input.current,
			isRemote,
			isCheckedOut: checkedOut.has(raw.name),
		});
	};

	for (const b of input.local) add(b, false);
	for (const b of input.remote) add(b, true);

	return [...byName.values()].sort(
		(a, b) => Date.parse(b.lastCommitDate) - Date.parse(a.lastCommitDate),
	);
}

/**
 * Retourne les arguments passés après `git worktree add`, selon le mode.
 * - worktree            → crée une nouvelle branche depuis la base distante
 * - existing-branch     → checkout direct (locale) ou branche de tracking (distante)
 * Fonction pure.
 */
export function worktreeAddArgs(opts: {
	worktreePath: string;
	branch: string;
	mode: 'worktree' | 'existing-branch';
	isRemote: boolean;
	base: string;
}): string[] {
	if (opts.mode === 'worktree') {
		return [opts.worktreePath, '-b', opts.branch, opts.base];
	}
	if (opts.isRemote) {
		return ['--track', '-b', opts.branch, opts.worktreePath, `origin/${opts.branch}`];
	}
	return [opts.worktreePath, opts.branch];
}
