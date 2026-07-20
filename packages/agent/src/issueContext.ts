/**
 * Récupère une issue GitHub + ses commentaires et formate le bloc de contexte
 * `## Contexte de l'issue #N : titre` injecté dans le `system_prompt` d'un agent.
 * Renvoie '' si pas de token, si le fetch échoue, ou si l'issue est introuvable.
 * Partagé par le provisioning solo (routes/git.ts) et le runner de pipeline (sdk).
 */
export async function fetchIssueContextBlock(
	owner: string,
	repo: string,
	number: number,
	token: string | null,
): Promise<string> {
	if (!token) return '';
	try {
		const base = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
		const headers = {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		};
		const [issueRes, commentsRes] = await Promise.all([
			fetch(base, { headers }),
			fetch(`${base}/comments`, { headers }),
		]);
		const issue = issueRes.ok ? ((await issueRes.json()) as { title?: string; body?: string }) : null;
		const comments = commentsRes.ok ? ((await commentsRes.json()) as { body?: string }[]) : [];
		if (!issue) return '';
		const commentsText = comments
			.map((c) => c.body ?? '')
			.filter(Boolean)
			.join('\n\n---\n\n');
		return [
			`## Contexte de l'issue #${number} : ${issue.title ?? ''}`,
			'',
			issue.body ?? '',
			commentsText ? `\n## Commentaires\n${commentsText}` : '',
		]
			.join('\n')
			.trim();
	} catch {
		return '';
	}
}

/** Marqueur d'idempotence : présent dans un `system_prompt`, le contexte est déjà injecté. */
export function issueContextMarker(number: number): string {
	return `## Contexte de l'issue #${number}`;
}
