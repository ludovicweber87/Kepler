'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import Dialog from '@mui/material/Dialog';
import Link from 'next/link';
import KanbanColumn from './KanbanColumn';
import IssueDetail from '@/components/dashboard/IssueDetail';
import RefetchIntervalSelect from '@/components/shared/RefetchIntervalSelect';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useRepoIssues } from '@/hooks/useRepoIssues';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useRefetchInterval } from '@/hooks/useRefetchInterval';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateIssueStatus } from '@/hooks/useUpdateIssueStatus';
import { completeIssueTodos } from '@/hooks/useTodos';
import { useTranslations } from 'next-intl';
import { useTheme } from '@mui/material/styles';
import { GitHubIssue } from '@/types';
import type { BoardIssue } from '@/lib/boardMerge';

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
	const { configs, configsLoading } = useProjectConfig();
	const hasConnectedProject = configs.some((c) => c.connected);

	const { repoPaths } = useRepoPaths();

	// Active repo tab (default = first configured repo). Derived so it stays valid
	// even when the repoPaths list changes without an explicit selection.
	const [activeRepo, setActiveRepo] = useState<string | null>(null);
	const effectiveRepo = useMemo(() => {
		if (activeRepo && repoPaths.some((r) => r.repo_full_name === activeRepo)) return activeRepo;
		return repoPaths[0]?.repo_full_name ?? null;
	}, [activeRepo, repoPaths]);

	// Lazy per-tab: fetch only the active repo's issues (server-reconciled), cached per repo.
	const { issues, statusColumns, fetchedAt, isLoading, error, refresh } =
		useRepoIssues(effectiveRepo);
	const [refreshing, setRefreshing] = useState(false);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await refresh();
		} finally {
			setRefreshing(false);
		}
	}, [refresh]);

	// Auto-refetch: poll the active repo's board on the persisted interval.
	const [refetchMs, setRefetchMs] = useRefetchInterval('issues.refetchIntervalMs');
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	useEffect(() => {
		if (!refetchMs) return;
		const id = setInterval(() => void refreshRef.current(), refetchMs);
		return () => clearInterval(id);
	}, [refetchMs]);

	const [search, setSearch] = useState('');
	const mutation = useUpdateIssueStatus();
	const todoQc = useQueryClient();

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

	const searchedIssues = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return issues;
		return issues.filter(
			(i) =>
				i.title.toLowerCase().includes(q) ||
				String(i.number).includes(q) ||
				`#${i.number}`.includes(q),
		);
	}, [issues, search]);

	const columns = useMemo(
		() => buildColumns(searchedIssues, statusColumns),
		[searchedIssues, statusColumns],
	);

	const handleStatusChange = useCallback(
		(issue: GitHubIssue, newStatus: string) => {
			const cfg = (issue as BoardIssue).__config;
			if (!cfg) return;
			mutation.mutate({
				issueNodeId: issue.node_id,
				newStatus,
				org: cfg.org,
				projectNumber: cfg.projectNumber,
				ownerType: cfg.ownerType,
			});
			if (newStatus.toLowerCase().includes('qa')) {
				const repo = issue.repo_full_name;
				if (repo && issue.number) {
					completeIssueTodos(repo, issue.number).then(() => {
						todoQc.invalidateQueries({ queryKey: ['todos'] });
					});
				}
			}
		},
		[mutation, todoQc],
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
					<RefetchIntervalSelect value={refetchMs} onChange={setRefetchMs} />
					<Tooltip title={t('refresh')}>
						<span>
							<IconButton
								onClick={handleRefresh}
								disabled={refreshing}
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

			{repoPaths.length === 0 ? (
				<Box sx={{ textAlign: 'center', py: 8 }}>
					<Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
						{t('noReposConfigured')}
					</Typography>
					<Typography variant="body2" sx={{ mb: 3 }}>
						{t('noReposConfiguredDesc')}
					</Typography>
					<Button
						component={Link}
						href="/settings"
						variant="contained"
						startIcon={<SettingsRoundedIcon />}
					>
						{t('configureRepos')}
					</Button>
				</Box>
			) : (
				<>
					<Tabs
						value={effectiveRepo ?? false}
						onChange={(_, v) => setActiveRepo(v)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							mb: 2,
							flexShrink: 0,
							borderBottom: 1,
							borderColor: 'divider',
							'& .MuiTab-root': {
								textTransform: 'none',
								minHeight: 40,
								fontSize: '0.82rem',
							},
						}}
					>
						{repoPaths.map((r) => (
							<Tab
								key={r.repo_full_name}
								value={r.repo_full_name}
								label={r.repo_full_name.split('/')[1] ?? r.repo_full_name}
							/>
						))}
					</Tabs>
					{searchedIssues.length === 0 ? (
						!hasConnectedProject ? (
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
							{columns.map(([colName, colIssues]) => (
								<KanbanColumn
									key={colName}
									columnName={colName}
									issues={colIssues}
									allColumns={statusColumns}
									onStatusChange={handleStatusChange}
									onCardClick={openDetail}
								/>
							))}
						</Box>
					)}
				</>
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
