'use client';

import { useState, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import MergeTypeRoundedIcon from '@mui/icons-material/MergeTypeRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import Collapse from '@mui/material/Collapse';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import Image from 'next/image';
import { useMe } from '@/hooks/useMe';
import { useTranslations } from 'next-intl';
import { usePendingTodoCount } from '@/hooks/usePendingTodoCount';
import { useAgentSessionHistory } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { classifySession } from '@/lib/sessionStatus';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useAllWorktrees } from '@/hooks/useAllWorktrees';
import { useMergedBranches } from '@/hooks/useMergedBranches';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveRepoFullName } from '@/lib/resolveRepoFullName';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const SIDEBAR_WIDTH = 220;

export default function Sidebar() {
	const theme = useTheme();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentSessionId = searchParams.get('session');
	const router = useRouter();
	const { me } = useMe();
	const t = useTranslations('sidebar');
	const pendingCount = usePendingTodoCount();
	const { data: allSessions = [] } = useAgentSessionHistory();
	// Most recent session per worktree path (list is ordered started_at desc).
	const sessionByWorktree = useMemo(() => {
		const map = new Map<string, (typeof allSessions)[number]>();
		for (const s of allSessions) {
			if (s.worktree_path && !map.has(s.worktree_path)) map.set(s.worktree_path, s);
		}
		return map;
	}, [allSessions]);
	const { views } = useAgentViews();
	const { byPath, deleteWorktree } = useAllWorktrees(views.map((v) => v.path));
	const { mergedForRepo } = useMergedBranches(views.map((v) => v.repoFullName));
	const { archive, remove } = useSessionActions();
	const { repoPaths } = useRepoPaths();
	const { showSnackbar } = useSnackbar();
	// Projects are all expanded by default; we only track the ones the user collapsed,
	// so each accordion opens/closes independently.
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
	const [deleteMenu, setDeleteMenu] = useState<{
		el: HTMLElement;
		projectPath: string;
		worktreePath: string;
	} | null>(null);
	const [actionsMenu, setActionsMenu] = useState<{
		el: HTMLElement;
		projectPath: string;
		worktreePath: string;
		sessionId: string | null;
	} | null>(null);
	const [modalConfig, setModalConfig] = useState<{
		projectPath?: string;
		existingSessionId?: string;
		existingWorktree?: { branch: string; worktreePath: string };
	} | null>(null);

	const toggleProject = (path: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const handleArchive = async () => {
		if (!actionsMenu?.sessionId) return;
		const sessionId = actionsMenu.sessionId;
		const { projectPath, worktreePath } = actionsMenu;
		setActionsMenu(null);

		const repoFullName = resolveRepoFullName({ project_path: projectPath }, repoPaths);
		if (repoFullName) {
			try {
				const rs = await apiFetch(
					`/api/repo-settings?repo=${encodeURIComponent(repoFullName)}`,
				);
				const settings = rs.ok ? await rs.json() : null;
				const script = settings?.archive_script?.trim();
				if (script && worktreePath) {
					const runRes = await localFetch('/git/run-script', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ cwd: worktreePath, script }),
					});
					if (!runRes.ok) throw new Error('archive script failed');
				}
			} catch {
				showSnackbar(t('archiveScriptFailed'), 'warning');
			}
		}

		archive(sessionId)
			.then(() => showSnackbar(t('sessionArchived'), 'success'))
			.catch(() => showSnackbar(t('archiveError'), 'error'));
	};

	const handleDeleteWorktree = (deleteBranch: boolean) => {
		if (!deleteMenu) return;
		const { projectPath, worktreePath } = deleteMenu;
		setDeleteMenu(null);
		// Delete worktree AND its session row → gone from every bucket.
		const session = sessionByWorktree.get(worktreePath);
		deleteWorktree(projectPath, worktreePath, deleteBranch)
			.then(() => {
				if (session) void remove(session.id).catch(() => {});
				showSnackbar(t('worktreeDeleted'), 'success');
			})
			.catch((err) =>
				showSnackbar(
					`${t('deleteWorktreeError')}: ${err instanceof Error ? err.message : ''}`,
					'error',
				),
			);
	};
	const mainItems = [
		{ label: t('workbench'), href: '/workbench', icon: <DashboardRoundedIcon /> },
		{ label: t('issues'), href: '/issues', icon: <BugReportRoundedIcon /> },
		{ label: t('prs'), href: '/prs', icon: <MergeTypeRoundedIcon /> },
		{ label: t('todos'), href: '/todos', icon: <ChecklistRoundedIcon />, badge: pendingCount },
	];

	const bottomItems = [
		{ label: t('archived'), href: '/archived', icon: <Inventory2OutlinedIcon /> },
		{ label: t('settings'), href: '/settings', icon: <SettingsRoundedIcon /> },
	];

	return (
		<>
			<Drawer
				variant="permanent"
				sx={{
					width: SIDEBAR_WIDTH,
					flexShrink: 0,
					'& .MuiDrawer-paper': {
						width: SIDEBAR_WIDTH,
						boxSizing: 'border-box',
					},
				}}
			>
				<Box
					sx={{
						p: 2,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						animation: 'scaleIn 0.4s ease-out',
					}}
				>
					<Image src="/logo.svg" alt="Devora" width={170} height={40} priority />
				</Box>

				<Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
					<Box sx={{ px: 1.5, mt: 2, mb: 1.5 }}>
						<Button
							variant="contained"
							fullWidth
							startIcon={<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />}
							onClick={() => setModalConfig({})}
							sx={{
								bgcolor: 'primary.main',
								textTransform: 'none',
								fontWeight: 600,
								fontSize: '0.8rem',
								py: 1,
								mb: 4,
								borderRadius: 1,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{t('launchAgent')}
						</Button>
					</Box>

					<List sx={{ px: 1.5 }}>
						{mainItems.map((item, index) => {
							const active =
								item.href === '/'
									? pathname === '/'
									: item.href === '/workbench'
										? // Don't keep Workbench lit when a specific session is
											// open — the active worktree row gets highlighted instead.
											pathname.startsWith('/workbench') && !currentSessionId
										: pathname.startsWith(item.href);
							return (
								<Link
									key={item.label}
									href={item.href}
									style={{ textDecoration: 'none', color: 'inherit' }}
								>
									<ListItemButton
										selected={active}
										sx={{
											borderRadius: 1,
											mb: 0.5,
											px: 2,
											py: 1,
											animation: `slideInLeft 0.35s ease-out ${index * 0.05}s both`,
											transition: 'background-color 0.15s, transform 0.15s',
											'&.Mui-selected': {
												bgcolor: alpha(theme.palette.primary.main, 0.18),
												color: 'primary.light',
												'& .MuiListItemIcon-root': {
													color: 'primary.light',
												},
											},
											'&:hover': {
												bgcolor: alpha(theme.palette.primary.main, 0.1),
												transform: 'translateX(4px)',
											},
										}}
									>
										<ListItemIcon
											sx={{ minWidth: 36, color: 'text.secondary' }}
										>
											{item.icon}
										</ListItemIcon>
										<ListItemText
											primary={item.label}
											primaryTypographyProps={{
												fontSize: '0.85rem',
												fontWeight: 500,
											}}
										/>
										{'badge' in item && (item.badge ?? 0) > 0 && (
											<Box
												component="span"
												sx={{
													bgcolor: 'warning.main',
													color: 'common.white',
													fontSize: '0.65rem',
													fontWeight: 700,
													lineHeight: 1,
													minWidth: 18,
													height: 18,
													borderRadius: 1,
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													px: 0.5,
												}}
											>
												{(item.badge ?? 0) > 99 ? '99+' : item.badge}
											</Box>
										)}
									</ListItemButton>
								</Link>
							);
						})}
					</List>

					{/* PROJETS — each configured repo, with active worktrees (F3) */}
					<Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, mt: 1 }}>
						{views.length > 0 && (
							<Typography
								variant="caption"
								sx={{
									px: 1,
									color: 'text.disabled',
									fontWeight: 700,
									textTransform: 'uppercase',
									letterSpacing: 1,
								}}
							>
								{t('projects')}
							</Typography>
						)}
						{views.map((view) => {
							const allWorktrees = byPath.get(view.path) ?? [];
							// Hide worktrees whose session is archived (archived → Archives page only).
							const worktrees = allWorktrees.filter((wt) => {
								const s = sessionByWorktree.get(wt.path);
								return !(s && classifySession(s) === 'archived');
							});
							const expanded = !collapsedProjects.has(view.path);
							const mergedBranches = mergedForRepo(view.repoFullName);
							return (
								<Box key={view.path}>
									<Box sx={{ display: 'flex', alignItems: 'center' }}>
										<ListItemButton
											onClick={() => toggleProject(view.path)}
											sx={{
												borderRadius: 1,
												py: 0.6,
												px: 1,
												flex: 1,
												minWidth: 0,
											}}
										>
											<ExpandMoreRoundedIcon
												sx={{
													fontSize: 16,
													mr: 0.5,
													color: 'text.disabled',
													transform: expanded ? 'none' : 'rotate(-90deg)',
													transition: 'transform 0.15s',
												}}
											/>
											<ListItemText
												primary={view.label}
												primaryTypographyProps={{
													fontSize: '0.8rem',
													fontWeight: 500,
													noWrap: true,
												}}
											/>
										</ListItemButton>
										<Tooltip title={t('repoSettings')}>
											<IconButton
												size="small"
												onClick={() =>
													router.push(
														'/settings/repo/' +
															view.repoFullName
																.split('/')
																.map(encodeURIComponent)
																.join('/'),
													)
												}
												sx={{
													color: 'text.disabled',
													'&:hover': { color: 'primary.main' },
												}}
											>
												<SettingsRoundedIcon sx={{ fontSize: 16 }} />
											</IconButton>
										</Tooltip>
										<Tooltip title={t('launchAgent')}>
											<IconButton
												size="small"
												onClick={() =>
													setModalConfig({ projectPath: view.path })
												}
												sx={{
													mr: 0.5,
													color: 'text.disabled',
													'&:hover': { color: 'primary.main' },
												}}
											>
												<AddRoundedIcon sx={{ fontSize: 16 }} />
											</IconButton>
										</Tooltip>
									</Box>
									<Collapse in={expanded} unmountOnExit>
										<Box
											sx={{
												pl: 2.5,
												pb: 0.5,
												display: 'flex',
												flexDirection: 'column',
												gap: 0.25,
											}}
										>
											{worktrees.length === 0 ? (
												<Typography
													variant="caption"
													sx={{ color: 'text.disabled', px: 1, py: 0.4 }}
												>
													{t('noWorktrees')}
												</Typography>
											) : (
												worktrees.map((wt) => {
													// Session (DB) attached to this worktree, if any.
													const wtSession = sessionByWorktree.get(
														wt.path,
													);
													const isActiveWt =
														!!wtSession &&
														classifySession(wtSession) === 'active';
													// Show the agent-renamed name.
													const displayName =
														wtSession?.agent_name ?? wt.branch;
													const sessionIdForWt =
														wtSession?.session_id ?? null;
													// Currently open in the Workbench.
													const isCurrent =
														!!currentSessionId &&
														sessionIdForWt === currentSessionId;
													const isMerged = mergedBranches.has(wt.branch);
													return (
														<Box
															key={wt.path}
															onClick={() =>
																wtSession
																	? router.push(
																			`/workbench?session=${encodeURIComponent(wtSession.session_id)}`,
																		)
																	: setModalConfig({
																			projectPath: view.path,
																			existingWorktree: {
																				branch: wt.branch,
																				worktreePath:
																					wt.path,
																			},
																		})
															}
															sx={{
																display: 'flex',
																alignItems: 'center',
																gap: 0.75,
																px: 1,
																py: 0.4,
																borderRadius: 1,
																cursor: 'pointer',
																bgcolor: isCurrent
																	? alpha(
																			theme.palette.primary
																				.main,
																			0.18,
																		)
																	: 'transparent',
																borderLeft: isCurrent
																	? `2px solid ${theme.palette.primary.main}`
																	: '2px solid transparent',
																'&:hover': {
																	bgcolor: isCurrent
																		? alpha(
																				theme.palette.primary
																					.main,
																				0.22,
																			)
																		: alpha(
																				theme.palette.primary
																					.main,
																				0.1,
																			),
																},
																'&:hover .wt-delete': {
																	opacity: 1,
																},
															}}
														>
															<AccountTreeRoundedIcon
																sx={{
																	fontSize: 13,
																	color: isMerged
																		? 'success.main'
																		: isActiveWt
																			? 'success.main'
																			: 'text.disabled',
																}}
															/>
															<Tooltip
																title={isMerged ? t('merged') : ''}
																disableHoverListener={!isMerged}
															>
																<Typography
																	variant="caption"
																	sx={{
																		flex: 1,
																		overflow: 'hidden',
																		textOverflow: 'ellipsis',
																		whiteSpace: 'nowrap',
																		textDecoration: isMerged
																			? 'line-through'
																			: 'none',
																		opacity: isMerged ? 0.6 : 1,
																		fontWeight: isCurrent
																			? 700
																			: 400,
																		color: isCurrent
																			? 'primary.main'
																			: isActiveWt
																				? 'text.primary'
																				: 'text.secondary',
																	}}
																>
																	{displayName}
																</Typography>
															</Tooltip>
															<Tooltip title={t('worktreeActions')}>
																<IconButton
																	className="wt-delete"
																	size="small"
																	onClick={(e) => {
																		e.stopPropagation();
																		setActionsMenu({
																			el: e.currentTarget,
																			projectPath: view.path,
																			worktreePath: wt.path,
																			sessionId:
																				sessionIdForWt,
																		});
																	}}
																	sx={{
																		p: 0.25,
																		opacity: 0,
																		transition: 'opacity 0.15s',
																		color: 'text.disabled',
																		'&:hover': {
																			color: 'primary.main',
																		},
																	}}
																>
																	<MoreVertRoundedIcon
																		sx={{ fontSize: 16 }}
																	/>
																</IconButton>
															</Tooltip>
														</Box>
													);
												})
											)}
										</Box>
									</Collapse>
								</Box>
							);
						})}
					</Box>

					<List sx={{ px: 1.5, pb: 1 }}>
						<LocaleSwitcher />
						{bottomItems.map((item, index) => {
							const active = pathname.startsWith(item.href);
							return (
								<Link
									key={item.label}
									href={item.href}
									style={{ textDecoration: 'none', color: 'inherit' }}
								>
									<ListItemButton
										selected={active}
										sx={{
											borderRadius: 1,
											mb: 0.5,
											px: 2,
											py: 1,
											animation: `slideInLeft 0.35s ease-out ${(mainItems.length + index) * 0.05}s both`,
											transition: 'background-color 0.15s, transform 0.15s',
											'&.Mui-selected': {
												bgcolor: alpha(theme.palette.primary.main, 0.18),
												color: 'primary.light',
												'& .MuiListItemIcon-root': {
													color: 'primary.light',
												},
											},
											'&:hover': {
												bgcolor: alpha(theme.palette.primary.main, 0.1),
												transform: 'translateX(4px)',
											},
										}}
									>
										<ListItemIcon
											sx={{ minWidth: 36, color: 'text.secondary' }}
										>
											{item.icon}
										</ListItemIcon>
										<ListItemText
											primary={item.label}
											primaryTypographyProps={{
												fontSize: '0.85rem',
												fontWeight: 500,
											}}
										/>
									</ListItemButton>
								</Link>
							);
						})}
					</List>

					{me && (
						<Box
							sx={{
								px: 2,
								pb: 2,
								pt: 1,
								borderTop: '1px solid',
								borderColor: 'divider',
								display: 'flex',
								alignItems: 'center',
								gap: 1.5,
							}}
						>
							<Avatar
								src={me.avatarUrl ?? undefined}
								alt={me.name ?? me.login}
								sx={{ width: 32, height: 32 }}
							/>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography
									variant="body2"
									sx={{
										fontWeight: 600,
										fontSize: '0.8rem',
										lineHeight: 1.2,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{me.login}
								</Typography>
							</Box>
						</Box>
					)}
				</Box>
			</Drawer>

			<Menu
				anchorEl={actionsMenu?.el}
				open={!!actionsMenu}
				onClose={() => setActionsMenu(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				<MenuItem
					onClick={handleArchive}
					disabled={!actionsMenu?.sessionId}
					sx={{ fontSize: '0.8rem', gap: 1 }}
				>
					<ArchiveOutlinedIcon sx={{ fontSize: 16 }} />
					{t('archive')}
				</MenuItem>
				<MenuItem
					onClick={() => {
						if (!actionsMenu) return;
						setDeleteMenu({
							el: actionsMenu.el,
							projectPath: actionsMenu.projectPath,
							worktreePath: actionsMenu.worktreePath,
						});
						setActionsMenu(null);
					}}
					sx={{ fontSize: '0.8rem', gap: 1, color: 'error.main' }}
				>
					<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
					{t('delete')}
				</MenuItem>
			</Menu>

			<Menu
				anchorEl={deleteMenu?.el}
				open={!!deleteMenu}
				onClose={() => setDeleteMenu(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				<MenuItem onClick={() => handleDeleteWorktree(false)} sx={{ fontSize: '0.8rem' }}>
					{t('deleteWorktreeOnly')}
				</MenuItem>
				<MenuItem
					onClick={() => handleDeleteWorktree(true)}
					sx={{ fontSize: '0.8rem', color: 'error.main' }}
				>
					{t('deleteWorktreeAndBranch')}
				</MenuItem>
			</Menu>

			<AgentTerminalModal
				open={!!modalConfig}
				onClose={() => setModalConfig(null)}
				projectPath={modalConfig?.projectPath}
				existingSessionId={modalConfig?.existingSessionId}
				existingWorktree={modalConfig?.existingWorktree}
			/>
		</>
	);
}
