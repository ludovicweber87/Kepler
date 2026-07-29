'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useAllWorktrees } from '@/hooks/useAllWorktrees';
import { classifySession } from '@/lib/sessionStatus';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { useSnackbar } from '@/hooks/useSnackbar';

const AgentTerminalModal = dynamic(() => import('@/components/agents/AgentTerminalModal'), {
	ssr: false,
});

export default function ArchivedPage() {
	const theme = useTheme();
	const t = useTranslations('archived');
	const { data: sessions = [] } = useAgentSessionHistory();
	const { unarchive, remove } = useSessionActions();
	const { showSnackbar } = useSnackbar();
	const [projectTab, setProjectTab] = useState(0);
	const [selected, setSelected] = useState<AgentSession | null>(null);
	const [deleteMenu, setDeleteMenu] = useState<{ el: HTMLElement; session: AgentSession } | null>(
		null,
	);

	const archived = useMemo(
		() => sessions.filter((s) => classifySession(s) === 'archived'),
		[sessions],
	);
	const projects = useMemo(
		() => [...new Set(archived.map((s) => s.project_name).filter(Boolean))] as string[],
		[archived],
	);
	const projectPaths = useMemo(
		() => [...new Set(archived.map((s) => s.project_path).filter(Boolean))] as string[],
		[archived],
	);
	const { byPath, deleteWorktree } = useAllWorktrees(projectPaths);

	const selectedProject = projectTab === 0 ? null : (projects[projectTab - 1] ?? null);
	const filtered = useMemo(
		() =>
			selectedProject ? archived.filter((s) => s.project_name === selectedProject) : archived,
		[archived, selectedProject],
	);

	const worktreeExists = (s: AgentSession) =>
		!!s.worktree_path &&
		(byPath.get(s.project_path) ?? []).some((wt) => wt.path === s.worktree_path);

	const handleUnarchive = (s: AgentSession) => {
		unarchive(s.session_id)
			.then(() => showSnackbar(t('sessionUnarchived'), 'success'))
			.catch(() => showSnackbar(t('unarchiveError'), 'error'));
	};

	const handleDeleteWorktree = (s: AgentSession, deleteBranch: boolean) => {
		setDeleteMenu(null);
		if (!s.worktree_path) return;
		deleteWorktree(s.project_path, s.worktree_path, deleteBranch)
			.then(() => remove(s.id).catch(() => {}))
			.then(() => showSnackbar(t('sessionDeleted'), 'success'))
			.catch(() => showSnackbar(t('deleteError'), 'error'));
	};

	const handleRemoveSession = (s: AgentSession) => {
		setDeleteMenu(null);
		remove(s.id)
			.then(() => showSnackbar(t('sessionDeleted'), 'success'))
			.catch(() => showSnackbar(t('deleteError'), 'error'));
	};

	return (
		<>
			<PageContainer fullHeight>
				<PageHeader title={t('title')} />

				{projects.length > 0 && (
					<Tabs
						value={projectTab}
						onChange={(_, val) => setProjectTab(val)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							mb: 2,
							flexShrink: 0,
							'& .MuiTab-root': { textTransform: 'none', minHeight: 40 },
						}}
					>
						<Tab label={t('all')} />
						{projects.map((p) => (
							<Tab key={p} label={p} />
						))}
					</Tabs>
				)}

				{filtered.length === 0 ? (
					<Box
						sx={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 1.5,
							color: 'text.disabled',
						}}
					>
						<Inventory2OutlinedIcon sx={{ fontSize: 48 }} />
						<Typography variant="body2">{t('empty')}</Typography>
					</Box>
				) : (
					<Box
						sx={{
							flex: 1,
							overflowY: 'auto',
							display: 'flex',
							flexDirection: 'column',
							gap: 1,
							'&::-webkit-scrollbar': { width: 4 },
							'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 1 },
						}}
					>
						{filtered.map((s) => {
							const isError = s.status === 'error';
							return (
								<Box
									key={s.id}
									onClick={() => setSelected(s)}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1.5,
										px: 2,
										py: 1.25,
										border: 1,
										borderColor: 'divider',
										borderRadius: 2,
										cursor: 'pointer',
										transition: 'background-color 0.15s, border-color 0.15s',
										'&:hover': {
											borderColor: alpha(theme.palette.primary.main, 0.4),
											bgcolor: alpha(theme.palette.action.hover, 0.5),
										},
										'&:hover .session-action-btn': { opacity: 1 },
									}}
								>
									<Box
										sx={{
											width: 26,
											height: 26,
											borderRadius: '50%',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											flexShrink: 0,
											bgcolor: isError
												? alpha(theme.palette.error.main, 0.12)
												: alpha(theme.palette.success.main, 0.12),
										}}
									>
										{isError ? (
											<ErrorOutlineRoundedIcon
												sx={{ fontSize: 15, color: 'error.main' }}
											/>
										) : (
											<CheckCircleOutlineRoundedIcon
												sx={{ fontSize: 15, color: 'success.main' }}
											/>
										)}
									</Box>
									<Box sx={{ flex: 1, minWidth: 0 }}>
										<Typography
											sx={{
												fontSize: '0.85rem',
												fontWeight: 600,
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{s.agent_name ?? s.branch ?? 'Claude'}
										</Typography>
										<Typography
											sx={{
												fontSize: '0.7rem',
												color: 'text.disabled',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{s.branch ? `${s.branch} · ` : ''}
											{s.project_name}
										</Typography>
									</Box>
									<Tooltip title={t('unarchive')}>
										<IconButton
											className="session-action-btn"
											size="small"
											onClick={(e) => {
												e.stopPropagation();
												handleUnarchive(s);
											}}
											sx={{
												opacity: 0,
												transition: 'opacity 0.15s',
												color: 'text.secondary',
												'&:hover': { color: 'primary.main' },
											}}
										>
											<UnarchiveOutlinedIcon sx={{ fontSize: 18 }} />
										</IconButton>
									</Tooltip>
									<Tooltip title={t('delete')}>
										<IconButton
											className="session-action-btn"
											size="small"
											onClick={(e) => {
												e.stopPropagation();
												setDeleteMenu({ el: e.currentTarget, session: s });
											}}
											sx={{
												opacity: 0,
												transition: 'opacity 0.15s',
												color: 'text.secondary',
												'&:hover': { color: 'error.main' },
											}}
										>
											<DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
										</IconButton>
									</Tooltip>
								</Box>
							);
						})}
					</Box>
				)}
			</PageContainer>

			<Menu
				anchorEl={deleteMenu?.el}
				open={!!deleteMenu}
				onClose={() => setDeleteMenu(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				{deleteMenu && worktreeExists(deleteMenu.session)
					? [
							<MenuItem
								key="wt-only"
								onClick={() => handleDeleteWorktree(deleteMenu.session, false)}
								sx={{ fontSize: '0.8rem' }}
							>
								{t('deleteWorktreeOnly')}
							</MenuItem>,
							<MenuItem
								key="wt-branch"
								onClick={() => handleDeleteWorktree(deleteMenu.session, true)}
								sx={{ fontSize: '0.8rem', color: 'error.main' }}
							>
								{t('deleteWorktreeAndBranch')}
							</MenuItem>,
						]
					: deleteMenu && (
							<MenuItem
								onClick={() => handleRemoveSession(deleteMenu.session)}
								sx={{ fontSize: '0.8rem', color: 'error.main', gap: 1 }}
							>
								<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
								{t('deleteSession')}
							</MenuItem>
						)}
			</Menu>

			<AgentTerminalModal
				open={!!selected}
				onClose={() => setSelected(null)}
				projectPath={selected?.project_path || undefined}
				existingSessionId={selected?.session_id}
			/>
		</>
	);
}
