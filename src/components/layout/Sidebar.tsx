'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { alpha, useTheme } from '@mui/material/styles';
import MergeTypeRoundedIcon from '@mui/icons-material/MergeTypeRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import TodayRoundedIcon from '@mui/icons-material/TodayRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import Collapse from '@mui/material/Collapse';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import TheaterComedyRoundedIcon from '@mui/icons-material/TheaterComedyRounded';
import Image from 'next/image';
import { useMe } from '@/hooks/useMe';
import { useTranslations } from 'next-intl';
import {
	DARK_SHADOW_RIGHT,
	DARK_SHADOW_TOP,
	LIGHT_SHADOW_RIGHT,
	LIGHT_SHADOW_TOP,
	cardShadowRest,
	cardShadowHover,
} from '@/theme/theme';
import { useAgentSessionHistory } from '@/hooks/useAgentSession';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotifications } from '@/hooks/useMarkNotifications';
import { unreadAgentIdsBySession } from '@/lib/notificationsReducer';
import { useSessionActions } from '@/hooks/useSessionActions';
import { classifySession } from '@/lib/sessionStatus';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useAllWorktrees } from '@/hooks/useAllWorktrees';
import { useMergedBranches } from '@/hooks/useMergedBranches';
import { usePullRequests } from '@/hooks/usePullRequests';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveRepoFullName } from '@/lib/resolveRepoFullName';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const SIDEBAR_WIDTH = 260;

// Logo GitHub "pull-request" (octicon 16px) rendu en SvgIcon MUI.
function PullRequestIcon(props: SvgIconProps) {
	return (
		<SvgIcon viewBox="0 0 16 16" {...props}>
			<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
		</SvgIcon>
	);
}

export default function Sidebar() {
	const theme = useTheme();
	const isLight = theme.palette.mode === 'light';
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentSessionId = searchParams.get('session');
	const router = useRouter();
	const { me } = useMe();
	const t = useTranslations('sidebar');
	const { notifications } = useNotifications();
	const { markRead } = useMarkNotifications();
	// Ids des notifs d'agent non lues, groupés par session → pastille sur le worktree.
	const unreadBySession = useMemo(() => unreadAgentIdsBySession(notifications), [notifications]);
	const { data: allSessions = [] } = useAgentSessionHistory();
	// Most recent session per worktree path (list is ordered started_at desc).
	const sessionByWorktree = useMemo(() => {
		const map = new Map<string, (typeof allSessions)[number]>();
		for (const s of allSessions) {
			if (s.worktree_path && !map.has(s.worktree_path)) map.set(s.worktree_path, s);
		}
		return map;
	}, [allSessions]);
	const { views, reorderViews } = useAgentViews();
	const { byPath, deleteWorktree, renameWorktree } = useAllWorktrees(views.map((v) => v.path));
	const { mergedForRepo } = useMergedBranches(views.map((v) => v.repoFullName));
	const { data: openPrs = [] } = usePullRequests(views.map((v) => v.repoFullName));
	// Branches avec une PR ouverte, groupées par repo (match par head.ref).
	const openPrBranchesByRepo = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const pr of openPrs) {
			if (!map.has(pr.repo_full_name)) map.set(pr.repo_full_name, new Set());
			map.get(pr.repo_full_name)!.add(pr.head.ref);
		}
		return map;
	}, [openPrs]);
	const { archive, remove, rename } = useSessionActions();
	const { repoPaths } = useRepoPaths();
	const { showSnackbar } = useSnackbar();

	// Drag & drop pour réordonner les projets (persiste via le groupe 'views' —
	// même ordre partagé par le select Daily et les tabs PRs). Clé = view.label.
	const dragViewIdx = useRef<number | null>(null);
	const [dropViewTarget, setDropViewTarget] = useState<number | null>(null);
	const handleViewDragStart = (idx: number) => (e: React.DragEvent) => {
		dragViewIdx.current = idx;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', String(idx));
	};
	const handleViewDragOver = (idx: number) => (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		if (dragViewIdx.current !== null && dragViewIdx.current !== idx) setDropViewTarget(idx);
	};
	const handleViewDrop = (idx: number) => (e: React.DragEvent) => {
		e.preventDefault();
		setDropViewTarget(null);
		const from = dragViewIdx.current;
		dragViewIdx.current = null;
		if (from === null || from === idx) return;
		const keys = views.map((v) => v.label);
		const [moved] = keys.splice(from, 1);
		keys.splice(idx, 0, moved);
		reorderViews(keys);
	};
	const handleViewDragEnd = () => {
		dragViewIdx.current = null;
		setDropViewTarget(null);
	};

	// Default focus: on a bare /workbench (no ?session=), open the first worktree
	// that already has a session, scanning folders then worktrees in order.
	// Runs once per mount; if nothing has a session, the empty-state stays.
	const hasAutoFocused = useRef(false);
	useEffect(() => {
		if (hasAutoFocused.current || currentSessionId) return;
		if (!pathname.startsWith('/workbench') || views.length === 0) return;
		for (const view of views) {
			const worktrees = (byPath.get(view.path) ?? []).filter((wt) => {
				const s = sessionByWorktree.get(wt.path);
				return !(s && classifySession(s) === 'archived');
			});
			for (const wt of worktrees) {
				const s = sessionByWorktree.get(wt.path);
				if (s) {
					hasAutoFocused.current = true;
					router.replace(`/workbench?session=${encodeURIComponent(s.session_id)}`);
					return;
				}
			}
		}
	}, [currentSessionId, pathname, views, byPath, sessionByWorktree, router]);
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
		branch: string;
		currentName: string;
	} | null>(null);
	const [renameDialog, setRenameDialog] = useState<{
		projectPath: string;
		worktreePath: string;
		sessionId: string | null;
		branch: string;
		value: string;
	} | null>(null);
	const [renameBusy, setRenameBusy] = useState(false);
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

	const handleRename = async () => {
		if (!renameDialog) return;
		const { projectPath, worktreePath, sessionId, value } = renameDialog;
		const name = value.trim();
		if (!name) return;
		setRenameBusy(true);
		try {
			if (sessionId) {
				// Renomme le label humain (agent_name) : simple UPDATE DB,
				// instantané, aucune opération git, aucun cas d'échec worktree.
				await rename(sessionId, name);
			} else {
				// Pas de session attachée : le seul nom disponible est la branche.
				// On retombe sur le renommage git (branche + dossier worktree).
				await renameWorktree(projectPath, worktreePath, name, sessionId);
			}
			showSnackbar(t('renamed'), 'success');
			setRenameDialog(null);
		} catch (err) {
			showSnackbar(
				`${t('renameError')}: ${err instanceof Error ? err.message : ''}`,
				'error',
			);
		} finally {
			setRenameBusy(false);
		}
	};
	const mainItems = [
		{ label: t('issues'), href: '/issues', icon: <BugReportRoundedIcon /> },
		{ label: t('prs'), href: '/prs', icon: <MergeTypeRoundedIcon /> },
		{ label: t('tasks'), href: '/tasks', icon: <ChecklistRoundedIcon /> },
		{ label: t('docs'), href: '/docs', icon: <MenuBookRoundedIcon /> },
		// "Daily" reste non traduit dans toutes les locales (choix produit).
		{ label: 'Daily', href: '/daily', icon: <TodayRoundedIcon /> },
	];

	const bottomItems = [
		{ label: t('personas'), href: '/personas', icon: <TheaterComedyRoundedIcon /> },
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
						borderRight: 'none',
						boxShadow: isLight ? LIGHT_SHADOW_RIGHT : DARK_SHADOW_RIGHT,
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
						{views.map((view, idx) => {
							const allWorktrees = byPath.get(view.path) ?? [];
							// Hide worktrees whose session is archived (archived → Archives page only).
							const worktrees = allWorktrees.filter((wt) => {
								const s = sessionByWorktree.get(wt.path);
								return !(s && classifySession(s) === 'archived');
							});
							const expanded = !collapsedProjects.has(view.path);
							const mergedBranches = mergedForRepo(view.repoFullName);
							const openPrBranches =
								openPrBranchesByRepo.get(view.repoFullName) ?? new Set<string>();
							return (
								<Box key={view.path}>
									<Box
										draggable
										onDragStart={handleViewDragStart(idx)}
										onDragOver={handleViewDragOver(idx)}
										onDrop={handleViewDrop(idx)}
										onDragEnd={handleViewDragEnd}
										sx={{
											display: 'flex',
											alignItems: 'center',
											borderRadius: 1,
											borderTop: 2,
											borderColor:
												dropViewTarget === idx
													? alpha(theme.palette.primary.main, 0.6)
													: 'transparent',
											'&:hover .drag-handle': { opacity: 1 },
										}}
									>
										<Box
											className="drag-handle"
											sx={{
												display: 'flex',
												alignItems: 'center',
												cursor: 'grab',
												color: 'text.disabled',
												opacity: 0,
												transition: 'opacity 0.15s',
												'&:active': { cursor: 'grabbing' },
											}}
										>
											<DragIndicatorRoundedIcon sx={{ fontSize: 16 }} />
										</Box>
										<ListItemButton
											onClick={() => toggleProject(view.path)}
											sx={{
												borderRadius: 1,
												py: 0.6,
												px: 1,
												flex: 1,
												minWidth: 0,
												transition:
													'background-color 0.15s, box-shadow 0.15s',
												'&:hover': {
													backgroundColor:
														theme.palette.surfaces.cardHover,
													boxShadow: cardShadowHover(theme.palette.mode),
												},
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
													// Label humain (agent_name) si défini, sinon la branche.
													// Le label est découplé de l'identité git : on peut le
													// renommer sans toucher branche ni worktree.
													const sessionLabel =
														wtSession?.agent_name?.trim();
													const displayName = sessionLabel || wt.branch;
													const sessionIdForWt =
														wtSession?.session_id ?? null;
													// Currently open in the Workbench.
													const isCurrent =
														!!currentSessionId &&
														sessionIdForWt === currentSessionId;
													const isMerged = mergedBranches.has(wt.branch);
													const hasOpenPr =
														!isMerged && openPrBranches.has(wt.branch);
													// Notifs d'agent non lues de cette session.
													const unreadIds = sessionIdForWt
														? (unreadBySession.get(sessionIdForWt) ??
															[])
														: [];
													const hasUnread = unreadIds.length > 0;
													return (
														<Box
															key={wt.path}
															onContextMenu={(e) => {
																e.preventDefault();
																setActionsMenu({
																	el: e.currentTarget,
																	projectPath: view.path,
																	worktreePath: wt.path,
																	sessionId: sessionIdForWt,
																	branch: wt.branch,
																	currentName: displayName,
																});
															}}
															onClick={() => {
																if (wtSession) {
																	if (unreadIds.length)
																		markRead(unreadIds);
																	router.push(
																		`/workbench?session=${encodeURIComponent(wtSession.session_id)}`,
																	);
																} else {
																	setModalConfig({
																		projectPath: view.path,
																		existingWorktree: {
																			branch: wt.branch,
																			worktreePath: wt.path,
																		},
																	});
																}
															}}
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
																// Une ombre a besoin d'une surface
																// pour décoller : au repos, seul
																// l'item courant (fond teinté) en
																// reçoit une.
																boxShadow: isCurrent
																	? cardShadowRest(
																			theme.palette.mode,
																		)
																	: 'none',
																transition:
																	'background-color 0.15s, box-shadow 0.15s',
																'&:hover': {
																	bgcolor: isCurrent
																		? alpha(
																				theme.palette
																					.primary.main,
																				0.22,
																			)
																		: alpha(
																				theme.palette
																					.primary.main,
																				0.1,
																			),
																	boxShadow: cardShadowHover(
																		theme.palette.mode,
																		theme.palette.primary.main,
																	),
																},
																'&:hover .wt-delete': {
																	opacity: 1,
																},
															}}
														>
															{isMerged || hasOpenPr ? (
																<Tooltip
																	title={
																		isMerged
																			? t('merged')
																			: t('prOpen')
																	}
																>
																	<PullRequestIcon
																		sx={{
																			fontSize: 14,
																			flexShrink: 0,
																			color: isMerged
																				? 'primary.main'
																				: 'success.main',
																		}}
																	/>
																</Tooltip>
															) : (
																<AccountTreeRoundedIcon
																	sx={{
																		fontSize: 13,
																		color: isActiveWt
																			? 'success.main'
																			: 'text.disabled',
																	}}
																/>
															)}
															<Tooltip
																title={
																	isMerged
																		? t('merged')
																		: displayName !== wt.branch
																			? wt.branch
																			: ''
																}
																disableHoverListener={
																	!isMerged &&
																	displayName === wt.branch
																}
															>
																<Typography
																	variant="caption"
																	sx={{
																		flex: 1,
																		fontSize: '0.85rem',
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
															{hasUnread && (
																<Tooltip
																	title={t(
																		'unreadAgentNotification',
																	)}
																>
																	<Box
																		component="span"
																		sx={{
																			width: 8,
																			height: 8,
																			borderRadius: '50%',
																			bgcolor: 'error.main',
																			flexShrink: 0,
																		}}
																	/>
																</Tooltip>
															)}
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
																			branch: wt.branch,
																			currentName:
																				displayName,
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

					<List
						sx={{
							px: 1.5,
							pb: 1,
							pt: 1.5,
							position: 'relative',
							boxShadow: isLight ? LIGHT_SHADOW_TOP : DARK_SHADOW_TOP,
						}}
					>
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
					onClick={() => {
						if (!actionsMenu) return;
						setRenameDialog({
							projectPath: actionsMenu.projectPath,
							worktreePath: actionsMenu.worktreePath,
							sessionId: actionsMenu.sessionId,
							branch: actionsMenu.branch,
							value: actionsMenu.currentName,
						});
						setActionsMenu(null);
					}}
					sx={{ fontSize: '0.8rem', gap: 1 }}
				>
					<EditRoundedIcon sx={{ fontSize: 16 }} />
					{t('rename')}
				</MenuItem>
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

			<Dialog
				open={!!renameDialog}
				onClose={() => (renameBusy ? null : setRenameDialog(null))}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontSize: '1rem' }}>{t('renameWorktreeTitle')}</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						fullWidth
						size="small"
						margin="dense"
						label={t('newNameLabel')}
						value={renameDialog?.value ?? ''}
						onChange={(e) =>
							setRenameDialog((prev) =>
								prev ? { ...prev, value: e.target.value } : prev,
							)
						}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !renameBusy) {
								e.preventDefault();
								void handleRename();
							}
						}}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setRenameDialog(null)} disabled={renameBusy}>
						{t('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={() => void handleRename()}
						disabled={renameBusy || !renameDialog?.value.trim()}
					>
						{t('rename')}
					</Button>
				</DialogActions>
			</Dialog>

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
