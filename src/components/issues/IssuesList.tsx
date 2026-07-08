'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import Dialog from '@mui/material/Dialog';
import Link from 'next/link';
import KanbanColumn from './KanbanColumn';
import CreateBranchModal from './CreateBranchModal';
import IssueDetail from '@/components/dashboard/IssueDetail';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useProjectBoards } from '@/hooks/useProjectBoards';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateIssueStatus } from '@/hooks/useUpdateIssueStatus';
import { completeIssueTodos } from '@/hooks/useTodos';
import { useTranslations } from 'next-intl';
import { useTheme } from '@mui/material/styles';
import { GitHubIssue } from '@/types';

const COLUMN_WIDTH = 300;

function buildColumns(issues: GitHubIssue[], statusColumns: string[]): [string, GitHubIssue[]][] {
	const map = new Map<string, GitHubIssue[]>();
	for (const col of statusColumns) {
		map.set(col, []);
	}
	for (const issue of issues) {
		const col = issue.project_columns?.[0]?.column ?? 'No Status';
		if (!map.has(col)) map.set(col, []);
		map.get(col)!.push(issue);
	}
	return [...map.entries()];
}

export default function IssuesList() {
	const theme = useTheme();
	const t = useTranslations('issues');
	const {
		configs,
		configsLoading,
		selectedViewMappings,
		reorderViews,
		saveConfig,
		getConfigForRepo,
	} = useProjectConfig();

	// Only fetch boards for projects that actually contribute selected views to the board
	const boardConfigs = configs.filter((c) => c.selectedViews.length > 0);

	// Board data (SQLite cache-backed): issues per view + raw response per config + last fetch time
	const { issuesByView, perConfig, error, isLoading, refresh, fetchedAt } =
		useProjectBoards(boardConfigs);
	const [refreshing, setRefreshing] = useState(false);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await refresh();
		} finally {
			setRefreshing(false);
		}
	}, [refresh]);

	// Persist fresh Project V2 metadata (views / mappings / status columns) into the stored config,
	// reusing the board fetch — no separate sync request. The diff guard avoids a save loop.
	useEffect(() => {
		for (const { config, data } of perConfig) {
			const nextMappings = data.viewRepoMappings ?? config.viewRepoMappings;
			const nextViews = data.views ?? config.views;
			const nextColumns = data.statusColumns ?? config.statusColumns;
			const changed =
				JSON.stringify(config.viewRepoMappings) !== JSON.stringify(nextMappings) ||
				JSON.stringify(config.views) !== JSON.stringify(nextViews) ||
				JSON.stringify(config.statusColumns) !== JSON.stringify(nextColumns);
			if (changed) {
				saveConfig({
					...config,
					viewRepoMappings: nextMappings,
					views: nextViews,
					statusColumns: nextColumns,
				});
			}
		}
	}, [perConfig, saveConfig]);

	const [activeTab, setActiveTab] = useState(0);
	const [search, setSearch] = useState('');
	const mutation = useUpdateIssueStatus();
	const todoQc = useQueryClient();

	// Branch modal state
	const [branchModalIssue, setBranchModalIssue] = useState<GitHubIssue | null>(null);

	// Issue detail modal state
	const [detailIssue, setDetailIssue] = useState<{
		owner: string;
		repo: string;
		number: string;
	} | null>(null);

	const openDetail = useCallback((issue: GitHubIssue) => {
		const [owner, repo] = (issue.repo_full_name ?? '').split('/');
		if (owner && repo) setDetailIssue({ owner, repo, number: String(issue.number) });
	}, []);

	const hasViews = selectedViewMappings.length > 0;

	const tabs = hasViews ? selectedViewMappings.map((m) => m.viewName) : [];
	const safeTab = activeTab >= tabs.length ? 0 : activeTab;

	const filteredIssues = useMemo(() => {
		const viewName = selectedViewMappings[safeTab]?.viewName;
		return viewName ? (issuesByView.get(viewName) ?? []) : [];
	}, [issuesByView, selectedViewMappings, safeTab]);

	const searchedIssues = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return filteredIssues;
		return filteredIssues.filter(
			(i) =>
				i.title.toLowerCase().includes(q) ||
				String(i.number).includes(q) ||
				`#${i.number}`.includes(q),
		);
	}, [filteredIssues, search]);

	// Resolve statusColumns for the active tab's owning project
	const activeStatusColumns = useMemo(() => {
		if (!hasViews) return [];
		const activeView = selectedViewMappings[safeTab]?.viewName;
		if (!activeView) return [];
		const owningConfig = configs.find((c) => c.selectedViews.includes(activeView));
		return owningConfig?.statusColumns ?? [];
	}, [configs, selectedViewMappings, safeTab, hasViews]);

	const columns = useMemo(
		() => buildColumns(searchedIssues, activeStatusColumns),
		[searchedIssues, activeStatusColumns],
	);

	const handleStatusChange = useCallback(
		(issue: GitHubIssue, newStatus: string) => {
			const issueRepo = issue.repo_full_name;
			const issueConfig = issueRepo ? getConfigForRepo(issueRepo) : configs[0];
			if (!issueConfig) return;

			mutation.mutate({
				issueNodeId: issue.node_id,
				newStatus,
				org: issueConfig.org,
				projectNumber: issueConfig.projectNumber,
				ownerType: issueConfig.ownerType,
			});

			// Open branch modal when moving to "In Progress"
			if (newStatus.includes('In Progress')) {
				setBranchModalIssue(issue);
			}

			// Auto-check linked todos when moving to QA
			if (newStatus.toLowerCase().includes('qa')) {
				const repo = issue.repo_full_name;
				if (repo && issue.number) {
					completeIssueTodos(repo, issue.number).then(() => {
						todoQc.invalidateQueries({ queryKey: ['todos'] });
					});
				}
			}
		},
		[configs, getConfigForRepo, mutation, todoQc],
	);

	if (isLoading || configsLoading) {
		return (
			<Box>
				<Skeleton
					variant="rounded"
					height={40}
					width={120}
					sx={{ mb: 3, borderRadius: 1 }}
				/>
				<Skeleton variant="rounded" height={36} sx={{ mb: 2, borderRadius: 1 }} />
				<Box sx={{ display: 'flex', gap: 2 }}>
					{[1, 2, 3].map((i) => (
						<Box key={i} sx={{ width: COLUMN_WIDTH, flexShrink: 0 }}>
							<Skeleton
								variant="rounded"
								height={32}
								sx={{ mb: 1.5, borderRadius: 1 }}
							/>
							{[1, 2].map((j) => (
								<Skeleton
									key={j}
									variant="rounded"
									height={80}
									sx={{ mb: 1, borderRadius: 1 }}
								/>
							))}
						</Box>
					))}
				</Box>
			</Box>
		);
	}

	if (error) {
		return (
			<Alert severity="error" sx={{ borderRadius: 1 }}>
				Failed to load GitHub data: {error.message}
			</Alert>
		);
	}

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					mb: 3,
					flexShrink: 0,
				}}
			>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 30%, ${theme.palette.secondary.main} 100%)`,
						backgroundClip: 'text',
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
				</Typography>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
					<TextField
						size="small"
						placeholder={t('searchPlaceholder')}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<SearchRoundedIcon
											sx={{ fontSize: 18, color: 'text.secondary' }}
										/>
									</InputAdornment>
								),
								endAdornment: search ? (
									<InputAdornment position="end">
										<IconButton
											size="small"
											onClick={() => setSearch('')}
											sx={{ p: 0.25 }}
										>
											<ClearRoundedIcon
												sx={{ fontSize: 16, color: 'text.secondary' }}
											/>
										</IconButton>
									</InputAdornment>
								) : null,
							},
						}}
						sx={{
							width: 240,
							'& .MuiOutlinedInput-root': {
								fontSize: '0.82rem',
								borderRadius: 1,
								bgcolor: 'background.paper',
								'& fieldset': { borderColor: 'divider' },
							},
						}}
					/>
					{fetchedAt && (
						<Typography
							variant="caption"
							sx={{ color: 'text.disabled', whiteSpace: 'nowrap' }}
						>
							{t('updated', {
								time: new Date(fetchedAt).toLocaleTimeString(undefined, {
									hour: '2-digit',
									minute: '2-digit',
								}),
							})}
						</Typography>
					)}
					<Tooltip title={hasViews ? t('refresh') : t('refreshNeedsViews')}>
						<span>
							<IconButton
								onClick={handleRefresh}
								disabled={refreshing || !hasViews}
								sx={{
									color: 'text.secondary',
									animation: refreshing ? 'spin 1s linear infinite' : 'none',
								}}
							>
								<RefreshRoundedIcon />
							</IconButton>
						</span>
					</Tooltip>
				</Box>
			</Box>

			{hasViews && (
				<Box sx={{ flexShrink: 0 }}>
					<DraggableTabs
						tabs={tabs}
						activeTab={safeTab}
						onTabChange={(idx) => setActiveTab(idx)}
						onReorder={reorderViews}
						counts={tabs.map((name) => issuesByView.get(name)?.length ?? 0)}
					/>
				</Box>
			)}

			{filteredIssues.length === 0 ? (
				!hasViews ? (
					<Box sx={{ textAlign: 'center', py: 8 }}>
						<Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
							{t('noViewsSelected')}
						</Typography>
						<Typography variant="body2" sx={{ mb: 3 }}>
							{t('noViewsSelectedDesc')}
						</Typography>
						<Button
							component={Link}
							href="/settings"
							variant="contained"
							startIcon={<SettingsRoundedIcon />}
						>
							{t('configureViews')}
						</Button>
					</Box>
				) : (
					<Box sx={{ textAlign: 'center', py: 8 }}>
						<Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
							{t('noOpenIssues')}
						</Typography>
						<Typography variant="body2">{t('noOpenIssuesDesc')}</Typography>
					</Box>
				)
			) : (
				<Box
					sx={{
						display: 'flex',
						gap: 2,
						flex: 1,
						overflowX: 'auto',
						overflowY: 'hidden',
						pb: 1,
						scrollbarWidth: 'thin',
						'&::-webkit-scrollbar': { height: 6 },
						'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
					}}
				>
					{columns.map(([colName, issues]) => (
						<KanbanColumn
							key={colName}
							columnName={colName}
							issues={issues}
							allColumns={activeStatusColumns}
							onStatusChange={handleStatusChange}
							onCardClick={openDetail}
						/>
					))}
				</Box>
			)}

			{branchModalIssue && (
				<CreateBranchModal
					open
					onClose={() => setBranchModalIssue(null)}
					issue={branchModalIssue}
				/>
			)}

			<Dialog
				open={!!detailIssue}
				onClose={() => setDetailIssue(null)}
				maxWidth="md"
				fullWidth
				PaperProps={{ sx: { borderRadius: 1 } }}
			>
				{detailIssue && (
					<Box sx={{ p: 3 }}>
						<IssueDetail
							owner={detailIssue.owner}
							repo={detailIssue.repo}
							number={detailIssue.number}
							onClose={() => setDetailIssue(null)}
						/>
					</Box>
				)}
			</Dialog>
		</Box>
	);
}
