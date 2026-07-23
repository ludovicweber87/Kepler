'use client';

import { useMemo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useDashboard } from '@/hooks/useGitHub';
import type { GitHubIssue } from '@/types';

export interface IssueRef {
	owner: string;
	repo: string;
	number: number;
	title: string;
}

interface Props {
	value: IssueRef | null;
	onChange: (ref: IssueRef | null) => void;
}

/** Déduit owner/repo depuis repo_full_name ou repository_url de l'API GitHub. */
function toRef(issue: GitHubIssue): IssueRef | null {
	const fullName =
		issue.repo_full_name ??
		issue.repository_url?.replace('https://api.github.com/repos/', '') ??
		'';
	const [owner, repo] = fullName.split('/');
	if (!owner || !repo) return null;
	return { owner, repo, number: issue.number, title: issue.title };
}

export default function IssueSelect({ value, onChange }: Props) {
	const t = useTranslations('tasks');
	const { data, isLoading } = useDashboard();

	const options = useMemo<IssueRef[]>(() => {
		const issues = data?.issues ?? [];
		return issues
			.filter((i) => !i.pull_request)
			.map(toRef)
			.filter((r): r is IssueRef => r !== null);
	}, [data]);

	return (
		<Autocomplete
			size="small"
			options={options}
			loading={isLoading}
			value={value}
			onChange={(_e, next) => onChange(next)}
			isOptionEqualToValue={(a, b) =>
				a.owner === b.owner && a.repo === b.repo && a.number === b.number
			}
			getOptionLabel={(o) => `${o.repo} #${o.number} · ${o.title}`}
			renderInput={(params) => (
				<TextField
					{...params}
					label={t('fieldIssue')}
					placeholder={t('issuePlaceholder')}
				/>
			)}
		/>
	);
}
