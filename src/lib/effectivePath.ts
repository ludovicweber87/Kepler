export interface EffectivePathInput {
	session?: { worktree_path?: string | null; branch?: string | null } | null;
	projectPath?: string | null;
	worktreePath?: string | null;
	launchMode?: 'worktree' | 'current-branch' | null;
	existingWorktreePath?: string | null;
}

/**
 * Résout le répertoire de travail effectif d'une session.
 * Ordre : current-branch → worktreePath explicite → session.worktree_path
 * → dérivation `.worktrees/<branch>` (branche non main/master) → existingWorktreePath → projectPath.
 * Extrait de AgentTerminalModal (useMemo effectivePath).
 */
export function resolveEffectivePath({
	session,
	projectPath,
	worktreePath,
	launchMode,
	existingWorktreePath,
}: EffectivePathInput): string | null {
	if (launchMode === 'current-branch' && projectPath) return projectPath;
	if (worktreePath) return worktreePath;
	if (session?.worktree_path) return session.worktree_path;
	if (
		projectPath &&
		session?.branch &&
		session.branch !== 'main' &&
		session.branch !== 'master'
	) {
		const dirName = session.branch.replace(/\//g, '-');
		return `${projectPath}/.worktrees/${dirName}`;
	}
	if (projectPath && existingWorktreePath) return existingWorktreePath;
	return projectPath ?? null;
}
