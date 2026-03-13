'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { LayoutGroup, type PanInfo } from 'framer-motion';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import KanbanColumn from './KanbanColumn';
import CreateBranchModal from './CreateBranchModal';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useDashboard } from '@/hooks/useGitHub';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateIssueStatus } from '@/hooks/useUpdateIssueStatus';
import { completeIssueTodos } from '@/hooks/useTodos';
import { useTranslations } from 'next-intl';
import { useTheme } from '@mui/material/styles';
import { GitHubIssue, ViewIssueRef } from '@/types';

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

interface DragState {
	issue: GitHubIssue;
	sourceColumn: string;
}

interface DropTarget {
	column: string;
	index: number;
}

export default function IssuesList() {
	const theme = useTheme();
	const t = useTranslations('issues');
	const { configs, selectedViewMappings, reorderViews, syncViews, getConfigForRepo } = useProjectConfig();

	// Auto-sync Project V2 data on mount to pick up new issues
	const hasSynced = useRef(false);
	useEffect(() => {
		if (configs.length > 0 && !hasSynced.current) {
			hasSynced.current = true;
			syncViews();
		}
	}, [configs, syncViews]);

	const allIssueRefs = useMemo(() => {
		if (selectedViewMappings.length === 0) return undefined;
		const hasExplicitIssues = selectedViewMappings.some((m) => m.issues?.length > 0);
		if (!hasExplicitIssues) return undefined;
		const seen = new Set<string>();
		const refs: ViewIssueRef[] = [];
		for (const m of selectedViewMappings) {
			for (const issue of m.issues ?? []) {
				const key = `${issue.repo}#${issue.number}`;
				if (!seen.has(key)) {
					seen.add(key);
					refs.push(issue);
				}
			}
		}
		return refs.length > 0 ? refs : undefined;
	}, [selectedViewMappings]);

	const { data, error, isLoading, refetch, isFetching } = useDashboard(allIssueRefs);
	const [activeTab, setActiveTab] = useState(0);
	const [search, setSearch] = useState('');
	const mutation = useUpdateIssueStatus();
	const todoQc = useQueryClient();

	// Branch modal state
	const [branchModalIssue, setBranchModalIssue] = useState<GitHubIssue | null>(null);

	// Drag & drop state
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const columnRefs = useRef(new Map<string, HTMLElement>());
	const dropTargetRef = useRef<DropTarget | null>(null);

	const hasViews = selectedViewMappings.length > 0;

	const isProjectMode = !!allIssueRefs;

	const allIssues = useMemo(() => {
		if (!data) return [];
		return data.issues.filter(
			(i) =>
				i.repo_full_name &&
				i.assignees?.some((a) => a.login === data.user),
		);
	}, [data]);

	const tabs = hasViews ? selectedViewMappings.map((m) => m.viewName) : [];
	const safeTab = activeTab >= tabs.length ? 0 : activeTab;

	const filteredIssues = useMemo(() => {
		if (!hasViews) return allIssues;
		const mapping = selectedViewMappings[safeTab];
		if (!mapping) return allIssues;
		if (mapping.issues?.length) {
			const issueKeys = new Set(mapping.issues.map((i) => `${i.repo}#${i.number}`));
			return allIssues.filter(
				(i) => i.repo_full_name && issueKeys.has(`${i.repo_full_name}#${i.number}`),
			);
		}
		const viewRepos = new Set(mapping.repos ?? []);
		return allIssues.filter((i) => i.repo_full_name && viewRepos.has(i.repo_full_name));
	}, [allIssues, selectedViewMappings, safeTab, hasViews]);

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
		// Find which config owns this view
		const owningConfig = configs.find((c) => c.selectedViews.includes(activeView));
		return owningConfig?.statusColumns ?? [];
	}, [configs, selectedViewMappings, safeTab, hasViews]);

	const isDragEnabled = activeStatusColumns.length > 0;

	const columns = useMemo(
		() => buildColumns(searchedIssues, activeStatusColumns),
		[searchedIssues, activeStatusColumns],
	);

	// Ref registration for columns
	const registerColumnRef = useCallback((name: string, el: HTMLElement | null) => {
		if (el) {
			columnRefs.current.set(name, el);
		} else {
			columnRefs.current.delete(name);
		}
	}, []);

	// Drag handlers
	const handleCardDragStart = useCallback((issue: GitHubIssue, sourceColumn: string) => {
		setDragState({ issue, sourceColumn });
		setDropTarget(null);
		dropTargetRef.current = null;
	}, []);

	const handleCardDrag = useCallback((_event: PointerEvent, info: PanInfo) => {
		// Use info.point for coordinates (page-relative)
		const x = info.point.x;
		const y = info.point.y;

		let newTarget: DropTarget | null = null;

		for (const [colName, el] of columnRefs.current.entries()) {
			const rect = el.getBoundingClientRect();
			// Check if pointer is within column X bounds (with some tolerance)
			if (x >= rect.left - 20 && x <= rect.right + 20) {
				// Find insertion index based on Y position
				const children = Array.from(el.children).filter(
					(child) => !(child as HTMLElement).dataset.placeholder,
				);
				let index = children.length;
				for (let i = 0; i < children.length; i++) {
					const childRect = children[i].getBoundingClientRect();
					if (y < childRect.top + childRect.height / 2) {
						index = i;
						break;
					}
				}
				newTarget = { column: colName, index };
				break;
			}
		}

		// Only update state if target changed
		const current = dropTargetRef.current;
		if (newTarget?.column !== current?.column || newTarget?.index !== current?.index) {
			dropTargetRef.current = newTarget;
			setDropTarget(newTarget);
		}
	}, []);

	const handleCardDragEnd = useCallback(() => {
		if (dragState && dropTarget && dropTarget.column !== dragState.sourceColumn) {
			// Resolve which project config owns this issue
			const issueRepo = dragState.issue.repo_full_name;
			const issueConfig = issueRepo ? getConfigForRepo(issueRepo) : configs[0];
			if (!issueConfig) return;

			// Always update status
			mutation.mutate({
				issueNodeId: dragState.issue.node_id,
				newStatus: dropTarget.column,
				org: issueConfig.org,
				projectNumber: issueConfig.projectNumber,
				ownerType: issueConfig.ownerType,
			});

			// Open branch modal when dropping on a column containing "In Progress"
			if (dropTarget.column.includes('In Progress')) {
				setBranchModalIssue(dragState.issue);
			}

			// Auto-check linked todos when moving to QA
			if (dropTarget.column.toLowerCase().includes('qa')) {
				const issue = dragState.issue;
				const repo = issue.repo_full_name;
				if (repo && issue.number) {
					completeIssueTodos(repo, issue.number).then(() => {
						todoQc.invalidateQueries({ queryKey: ['todos'] });
					});
				}
			}
		}

		setDragState(null);
		setDropTarget(null);
		dropTargetRef.current = null;
	}, [dragState, dropTarget, configs, getConfigForRepo, mutation]);

	if (isLoading) {
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

	if (!data) return null;

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
						background:
							`linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 30%, ${theme.palette.secondary.main} 100%)`,
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
					<Tooltip title={t('refresh')}>
						<IconButton
							onClick={() => {
								syncViews();
								refetch();
							}}
							disabled={isFetching}
							sx={{
								color: 'text.secondary',
								animation: isFetching ? 'spin 1s linear infinite' : 'none',
							}}
						>
							<RefreshRoundedIcon />
						</IconButton>
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
						counts={tabs.map((_, idx) => {
							const m = selectedViewMappings[idx];
							if (m?.issues?.length) {
								const keys = new Set(m.issues.map((i) => `${i.repo}#${i.number}`));
								return allIssues.filter(
									(i) =>
										i.repo_full_name &&
										keys.has(`${i.repo_full_name}#${i.number}`),
								).length;
							}
							const viewRepos = new Set(m?.repos ?? []);
							return allIssues.filter(
								(i) => i.repo_full_name && viewRepos.has(i.repo_full_name),
							).length;
						})}
					/>
				</Box>
			)}

			{filteredIssues.length === 0 ? (
				<Box sx={{ textAlign: 'center', py: 8 }}>
					<Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
						{t('noOpenIssues')}
					</Typography>
					<Typography variant="body2">
						{t('noOpenIssuesDesc')}
					</Typography>
				</Box>
			) : (
				<LayoutGroup>
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
								ref={(el) => registerColumnRef(colName, el)}
								columnName={colName}
								issues={issues}
								isDragActive={!!dragState}
								draggedIssueId={dragState?.issue.id ?? null}
								isDropTarget={dropTarget?.column === colName}
								dropIndex={dropTarget?.column === colName ? dropTarget.index : -1}
								onCardDragStart={(issue) => handleCardDragStart(issue, colName)}
								onCardDrag={handleCardDrag}
								onCardDragEnd={handleCardDragEnd}
							/>
						))}
					</Box>
				</LayoutGroup>
			)}

			{branchModalIssue && (
				<CreateBranchModal
					open
					onClose={() => setBranchModalIssue(null)}
					issue={branchModalIssue}
				/>
			)}
		</Box>
	);
}
