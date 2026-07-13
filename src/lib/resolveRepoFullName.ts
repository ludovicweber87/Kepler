export function resolveRepoFullName(
	session: {
		issue_owner?: string | null;
		issue_repo?: string | null;
		project_path?: string | null;
	} | null,
	repoPaths: { repo_full_name: string; local_path: string }[],
): string | null {
	if (!session) return null;
	if (session.issue_owner && session.issue_repo) {
		return `${session.issue_owner}/${session.issue_repo}`;
	}
	const p = session.project_path;
	if (!p) return null;
	const lower = p.toLowerCase();
	return repoPaths.find((rp) => rp.local_path.toLowerCase() === lower)?.repo_full_name ?? null;
}
