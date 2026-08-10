export interface EffectivePathInput {
	session?: { worktree_path?: string | null; branch?: string | null } | null;
	projectPath?: string | null;
	worktreePath?: string | null;
	launchMode?: 'worktree' | 'current-branch' | 'existing-branch' | 'free' | null;
	existingWorktreePath?: string | null;
}

/**
 * Résout le répertoire de travail effectif d'une session.
 * Ordre : current-branch → worktreePath explicite → session.worktree_path
 * → existingWorktreePath → projectPath.
 * Le mode libre n'a ni worktree ni branche : il retombe sur `projectPath`, qui
 * porte alors le dossier libre configuré dans les settings.
 * Un `session.worktree_path` nul signifie désormais "current-branch → racine du projet"
 * (les sessions worktree persistent toujours leur `worktree_path`).
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
	if (projectPath && existingWorktreePath) return existingWorktreePath;
	return projectPath ?? null;
}
