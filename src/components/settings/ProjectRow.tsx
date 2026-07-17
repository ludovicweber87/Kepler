// src/components/settings/ProjectRow.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { ProjectV2Config, ProjectV2View, ViewRepoMapping } from '@/types';
import type { OrgProject } from './projectListUtils';

interface ProjectViewsData {
	project: { id: string; title: string; number: number };
	views: ProjectV2View[];
	viewRepoMappings: ViewRepoMapping[];
	statusColumns: string[];
}

export interface ProjectRowProps {
	project: OrgProject;
	org: string;
	ownerType: 'organization' | 'user';
	savedConfig: ProjectV2Config | undefined;
	configsLoaded: boolean;
	onSave: (config: ProjectV2Config) => void;
}

export function ProjectRow({
	project,
	org,
	ownerType,
	savedConfig,
	configsLoaded,
	onSave,
}: ProjectRowProps) {
	const t = useTranslations('settings');
	const [viewsData, setViewsData] = useState<ProjectViewsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasFetched, setHasFetched] = useState(!!savedConfig?.views?.length);

	const connected = savedConfig?.connected ?? false;

	const baseConfig = (): ProjectV2Config => ({
		org,
		projectNumber: project.number,
		projectTitle: project.title,
		selectedViews: [],
		activeView: null,
		viewOrder: [],
		viewRepoMappings: [],
		statusColumns: [],
		views: [],
		ownerType,
		connected: false,
	});

	const fetchViews = useCallback(
		async (connectedOverride?: boolean) => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(
					`/api/github/projects?org=${encodeURIComponent(org)}&projectNumber=${project.number}&ownerType=${ownerType}`,
				);
				if (!res.ok) throw new Error(`Failed to load project views: ${res.status}`);
				const data = await res.json();
				if (data.error) throw new Error(data.error);
				const fetched = data as ProjectViewsData;
				setViewsData(fetched);
				setHasFetched(true);
				onSave({
					org,
					projectNumber: project.number,
					projectTitle: project.title,
					selectedViews: savedConfig?.selectedViews ?? [],
					activeView: savedConfig?.activeView ?? null,
					viewOrder: savedConfig?.viewOrder ?? [],
					viewRepoMappings: fetched.viewRepoMappings,
					statusColumns: fetched.statusColumns ?? [],
					views: fetched.views,
					ownerType,
					connected: connectedOverride ?? savedConfig?.connected ?? false,
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load views');
			} finally {
				setLoading(false);
			}
		},
		[org, project.number, project.title, ownerType, savedConfig, onSave],
	);

	// Auto-fetch au montage UNIQUEMENT pour les projets connectés (évite N requêtes en parallèle)
	useEffect(() => {
		if (configsLoaded && connected && !hasFetched) {
			fetchViews();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [configsLoaded]);

	const handleToggle = (next: boolean) => {
		onSave({ ...(savedConfig ?? baseConfig()), connected: next });
		// fetch à la demande quand on active un projet pas encore fetché
		if (next && !hasFetched && !loading) {
			fetchViews(next);
		}
	};

	const viewCount = viewsData?.views?.length ?? savedConfig?.views?.length ?? 0;

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				px: 1.5,
				py: 1,
				borderRadius: 1.5,
				transition: 'background-color 0.15s ease',
				'&:hover': { bgcolor: (th) => alpha(th.palette.text.primary, 0.03) },
			}}
		>
			<Box sx={{ minWidth: 0, flex: 1 }}>
				<Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
					{project.title}
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					noWrap
					sx={{ display: 'block' }}
				>
					{org}
					{viewCount > 0 ? ` · ${t('viewsAvailable', { count: viewCount })}` : ''}
				</Typography>
			</Box>

			{error && (
				<Tooltip title={t('loadViewsError')}>
					<ErrorOutlineRoundedIcon sx={{ fontSize: 18, color: 'error.main' }} />
				</Tooltip>
			)}

			<Chip
				size="small"
				label={connected ? t('connected') : t('notConnected')}
				sx={{
					height: 22,
					fontSize: '0.7rem',
					fontWeight: 500,
					color: connected ? 'success.main' : 'text.secondary',
					bgcolor: (th) =>
						connected
							? alpha(th.palette.success.main, 0.12)
							: alpha(th.palette.text.secondary, 0.08),
					'& .MuiChip-label': { px: 1 },
				}}
			/>

			<Switch
				size="small"
				checked={connected}
				onChange={(e) => handleToggle(e.target.checked)}
			/>

			<Tooltip title={t('refreshFromGithub')}>
				<span>
					<IconButton
						size="small"
						onClick={() => fetchViews()}
						disabled={loading}
						sx={{ color: 'text.secondary' }}
					>
						{loading ? (
							<CircularProgress size={16} />
						) : (
							<RefreshRoundedIcon fontSize="small" />
						)}
					</IconButton>
				</span>
			</Tooltip>
		</Box>
	);
}
