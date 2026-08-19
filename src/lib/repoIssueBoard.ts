import type { GitHubIssue, ProjectColumn } from '@/types';
import type { BoardIssue } from '@/lib/boardMerge';

/**
 * Première config dont un `viewRepoMappings[].repos` contient le repo (insensible à la
 * casse), ou null. Générique pour être réutilisable côté route et côté move-status.
 */
export function resolveConfigForRepo<T extends { viewRepoMappings: { repos?: string[] }[] }>(
	repoFullName: string,
	configs: T[],
): T | null {
	const lower = repoFullName.toLowerCase();
	return (
		configs.find((c) =>
			c.viewRepoMappings?.some((m) => m.repos?.some((r) => r.toLowerCase() === lower)),
		) ?? null
	);
}

export interface CoveringConfig {
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
	projectTitle: string;
	statusColumns: string[];
}

/**
 * Réconcilie les issues REST d'un repo avec leur statut Project :
 * - la colonne retenue est celle de l'entrée dont `project` == `projectTitle` de la config
 *   couvrante (sinon aucune → "No Status" côté rendu) ;
 * - `__config` (drag) attaché uniquement pour les issues rattachées au Project couvrant ;
 * - `statusColumns` = ceux de la config couvrante (fallback [] → mono-colonne "No Status").
 */
export function reconcileRepoIssues(
	issues: GitHubIssue[],
	columnsByNodeId: Map<string, ProjectColumn[]>,
	config: CoveringConfig | null,
): { issues: BoardIssue[]; statusColumns: string[] } {
	const out: BoardIssue[] = issues.map((it) => {
		const cols = columnsByNodeId.get(it.node_id) ?? [];
		const matched = config ? cols.find((c) => c.project === config.projectTitle) : undefined;
		return {
			...it,
			project_columns: matched ? [matched] : [],
			__config: matched
				? {
						org: config!.org,
						projectNumber: config!.projectNumber,
						ownerType: config!.ownerType,
					}
				: undefined,
		};
	});
	return { issues: out, statusColumns: config?.statusColumns ?? [] };
}
