// src/components/settings/ProjectList.tsx
'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useTranslations } from 'next-intl';
import type { ProjectV2Config } from '@/types';
import {
	flattenProjects,
	filterProjects,
	sortProjectsConnectedFirst,
	countConnected,
	type OrgWithProjects,
} from './projectListUtils';
import { ProjectRow } from './ProjectRow';

export interface ProjectListProps {
	orgProjects: OrgWithProjects[];
	configs: ProjectV2Config[];
	configsLoading: boolean;
	onSave: (config: ProjectV2Config) => void;
	onClearAll: () => void;
}

export function ProjectList({
	orgProjects,
	configs,
	configsLoading,
	onSave,
	onClearAll,
}: ProjectListProps) {
	const t = useTranslations('settings');
	const [query, setQuery] = useState('');

	const flat = useMemo(() => flattenProjects(orgProjects, configs), [orgProjects, configs]);

	const sorted = useMemo(
		() => sortProjectsConnectedFirst(filterProjects(flat, query)),
		[flat, query],
	);

	const connectedTotal = countConnected(flat);
	const connectedInList = countConnected(sorted);
	// index de la première ligne non connectée (pour placer le Divider)
	const firstDisconnectedIdx = sorted.findIndex((it) => !it.connected);
	const showDivider = connectedInList > 0 && firstDisconnectedIdx > 0;

	return (
		<Box>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.5,
					mb: 1.5,
					flexWrap: 'wrap',
				}}
			>
				<TextField
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t('filterProjects')}
					size="small"
					sx={{ flex: 1, minWidth: 200 }}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchRoundedIcon
										fontSize="small"
										sx={{ color: 'text.secondary' }}
									/>
								</InputAdornment>
							),
						},
					}}
				/>
				{connectedTotal > 0 && (
					<>
						<Typography variant="caption" color="text.secondary">
							{t('connectedCount', { count: connectedTotal })}
						</Typography>
						<Button
							variant="text"
							color="error"
							size="small"
							onClick={onClearAll}
							sx={{ textTransform: 'none' }}
						>
							{t('clearAll')}
						</Button>
					</>
				)}
			</Box>

			{sorted.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 2 }}>
					{t('noProjectsMatch')}
				</Typography>
			) : (
				<Box sx={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((it, idx) => (
						<Box key={it.key}>
							{showDivider && idx === firstDisconnectedIdx && (
								<Divider sx={{ my: 0.5 }} />
							)}
							<ProjectRow
								project={it.project}
								org={it.org}
								ownerType={it.ownerType}
								savedConfig={configs.find(
									(c) =>
										c.org === it.org && c.projectNumber === it.project.number,
								)}
								configsLoaded={!configsLoading}
								onSave={onSave}
							/>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
