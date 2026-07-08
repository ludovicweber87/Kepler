'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
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
import Collapse from '@mui/material/Collapse';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import Image from 'next/image';
import { useMe } from '@/hooks/useMe';
import { useTranslations } from 'next-intl';
import { usePendingTodoCount } from '@/hooks/usePendingTodoCount';
import { useActiveSessions } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory } from '@/hooks/useAgentSession';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useAllWorktrees } from '@/hooks/useAllWorktrees';
import { useSnackbar } from '@/hooks/useSnackbar';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const SIDEBAR_WIDTH = 220;

export default function Sidebar() {
	const theme = useTheme();
	const pathname = usePathname();
	const { me } = useMe();
	const t = useTranslations('sidebar');
	const pendingCount = usePendingTodoCount();
	const { data: activeSessions = [] } = useActiveSessions();
	const { data: pastSessions = [] } = useAgentSessionHistory();
	// Sessions whose agent finished (DB status) — open read-only even if their tmux lingers.
	const finishedSessionIds = useMemo(
		() =>
			new Set(
				pastSessions
					.filter((s) => s.status === 'completed' || s.status === 'error')
					.map((s) => s.session_id),
			),
		[pastSessions],
	);
	const { views } = useAgentViews();
	const { byPath, deleteWorktree } = useAllWorktrees(views.map((v) => v.path));
	const { showSnackbar } = useSnackbar();
	// Projects are all expanded by default; we only track the ones the user collapsed,
	// so each accordion opens/closes independently.
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
	const [deleteMenu, setDeleteMenu] = useState<{
		el: HTMLElement;
		projectPath: string;
		worktreePath: string;
	} | null>(null);
	const [modalConfig, setModalConfig] = useState<{
		projectPath?: string;
		existingSessionId?: string;
		existingWorktree?: { branch: string; worktreePath: string };
		isPastSession?: boolean;
	} | null>(null);

	const toggleProject = (path: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const handleDeleteWorktree = (deleteBranch: boolean) => {
		if (!deleteMenu) return;
		const { projectPath, worktreePath } = deleteMenu;
		setDeleteMenu(null);
		deleteWorktree(projectPath, worktreePath, deleteBranch)
			.then(() => showSnackbar(t('worktreeDeleted'), 'success'))
			.catch((err) =>
				showSnackbar(
					`${t('deleteWorktreeError')}: ${err instanceof Error ? err.message : ''}`,
					'error',
				),
			);
	};
	const mainItems = [
		{ label: t('dashboard'), href: '/dashboard', icon: <DashboardRoundedIcon /> },
		{ label: t('issues'), href: '/issues', icon: <BugReportRoundedIcon /> },
		{ label: t('prs'), href: '/prs', icon: <MergeTypeRoundedIcon /> },
		{ label: t('todos'), href: '/todos', icon: <ChecklistRoundedIcon />, badge: pendingCount },
	];

	const bottomItems = [
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
							const worktrees = byPath.get(view.path) ?? [];
							const expanded = !collapsedProjects.has(view.path);
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
													const activeS = activeSessions.find(
														(s) => s.cwd === wt.path,
													);
													return (
														<Box
															key={wt.path}
															onClick={() =>
																setModalConfig(
																	activeS
																		? {
																				projectPath:
																					view.path,
																				existingSessionId:
																					activeS.sessionId,
																				isPastSession:
																					finishedSessionIds.has(
																						activeS.sessionId,
																					),
																			}
																		: {
																				projectPath:
																					view.path,
																				existingWorktree: {
																					branch: wt.branch,
																					worktreePath:
																						wt.path,
																				},
																			},
																)
															}
															sx={{
																display: 'flex',
																alignItems: 'center',
																gap: 0.75,
																px: 1,
																py: 0.4,
																borderRadius: 1,
																cursor: 'pointer',
																'&:hover': {
																	bgcolor: alpha(
																		theme.palette.primary.main,
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
																	color: activeS
																		? 'success.main'
																		: 'text.disabled',
																}}
															/>
															<Typography
																variant="caption"
																sx={{
																	flex: 1,
																	overflow: 'hidden',
																	textOverflow: 'ellipsis',
																	whiteSpace: 'nowrap',
																	color: activeS
																		? 'text.primary'
																		: 'text.secondary',
																}}
															>
																{wt.branch}
															</Typography>
															<Tooltip title={t('deleteWorktree')}>
																<IconButton
																	className="wt-delete"
																	size="small"
																	onClick={(e) => {
																		e.stopPropagation();
																		setDeleteMenu({
																			el: e.currentTarget,
																			projectPath: view.path,
																			worktreePath: wt.path,
																		});
																	}}
																	sx={{
																		p: 0.25,
																		opacity: 0,
																		transition: 'opacity 0.15s',
																		color: 'text.disabled',
																		'&:hover': {
																			color: 'error.main',
																		},
																	}}
																>
																	<DeleteOutlineRoundedIcon
																		sx={{ fontSize: 14 }}
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
				isPastSession={modalConfig?.isPastSession}
			/>
		</>
	);
}
