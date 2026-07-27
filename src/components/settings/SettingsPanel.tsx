'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { alpha, useTheme } from '@mui/material/styles';
import GitHubIcon from '@mui/icons-material/GitHub';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import type { OrgWithProjects } from './projectListUtils';
import { ProjectList } from './ProjectList';
import AppearanceSettings from './AppearanceSettings';
import GitHubAssigneeSettings from './GitHubAssigneeSettings';
import NotificationSettings from './NotificationSettings';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useTranslations } from 'next-intl';
import { localFetch } from '@/lib/local-fetch';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { useSnackbar } from '@/hooks/useSnackbar';

/** Repo path card with popover actions */
function RepoPathCard({
	repoName,
	localPath,
	onEdit,
	onDelete,
	isEditing,
}: {
	repoName: string;
	localPath: string;
	onEdit: () => void;
	onDelete: () => void;
	isEditing: boolean;
}) {
	const t = useTranslations('settings');
	const tc = useTranslations('common');
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	const hasPath = !!localPath;

	return (
		<Box
			sx={{
				p: 2,
				borderRadius: 2,
				border: 1,
				borderColor: 'divider',
				bgcolor: 'background.paper',
				position: 'relative',
				transition: 'all 0.2s ease',
				'&:hover': {
					borderColor: (th) => alpha(th.palette.primary.main, 0.3),
				},
			}}
		>
			{/* 3-dot menu */}
			<IconButton
				size="small"
				onClick={(e) => setAnchorEl(e.currentTarget)}
				sx={{
					position: 'absolute',
					top: 8,
					right: 8,
					color: 'text.secondary',
					opacity: 0.6,
					'&:hover': { opacity: 1 },
				}}
			>
				<MoreVertRoundedIcon fontSize="small" />
			</IconButton>

			<Popover
				open={!!anchorEl}
				anchorEl={anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							bgcolor: 'background.paper',
							border: 1,
							borderColor: 'divider',
							borderRadius: 2,
							minWidth: 160,
							boxShadow: 8,
						},
					},
				}}
			>
				<List dense disablePadding>
					<ListItemButton
						onClick={() => {
							setAnchorEl(null);
							onEdit();
						}}
						disabled={isEditing}
					>
						<ListItemIcon sx={{ minWidth: 32 }}>
							{isEditing ? (
								<CircularProgress size={16} />
							) : (
								<EditRoundedIcon fontSize="small" />
							)}
						</ListItemIcon>
						<ListItemText
							primary={tc('edit')}
							primaryTypographyProps={{ variant: 'body2' }}
						/>
					</ListItemButton>
					<ListItemButton
						onClick={() => {
							setAnchorEl(null);
							onDelete();
						}}
						sx={{
							'&:hover': {
								bgcolor: (th) => alpha(th.palette.error.main, 0.08),
							},
						}}
					>
						<ListItemIcon sx={{ minWidth: 32 }}>
							<DeleteRoundedIcon fontSize="small" sx={{ color: 'error.main' }} />
						</ListItemIcon>
						<ListItemText
							primary={tc('delete')}
							primaryTypographyProps={{ variant: 'body2', color: 'error.main' }}
						/>
					</ListItemButton>
				</List>
			</Popover>

			{/* Card content */}
			<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pr: 3 }}>
				<Box
					sx={{
						width: 36,
						height: 36,
						borderRadius: 1.5,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						bgcolor: (th) =>
							hasPath
								? alpha(th.palette.success.main, 0.1)
								: alpha(th.palette.text.secondary, 0.08),
						flexShrink: 0,
						mt: 0.25,
					}}
				>
					<FolderRoundedIcon
						sx={{
							fontSize: 20,
							color: hasPath ? 'success.main' : 'text.disabled',
						}}
					/>
				</Box>
				<Box sx={{ minWidth: 0, flex: 1 }}>
					<Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
						{repoName.split('/').pop()}
					</Typography>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{
							display: 'block',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{localPath || t('noPath')}
					</Typography>
					{hasPath && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
							<CheckRoundedIcon sx={{ fontSize: 12, color: 'success.main' }} />
							<Typography
								variant="caption"
								sx={{ color: 'success.main', fontSize: '0.65rem' }}
							>
								{t('pathValid')}
							</Typography>
						</Box>
					)}
				</Box>
			</Box>
		</Box>
	);
}

/** Ghost card to add a new repo */
function AddRepoCard({
	onClick,
	disabled,
	label,
}: {
	onClick: () => void;
	disabled: boolean;
	label: string;
}) {
	return (
		<Box
			onClick={disabled ? undefined : onClick}
			sx={{
				p: 2,
				borderRadius: 2,
				border: 2,
				borderStyle: 'dashed',
				borderColor: 'divider',
				cursor: disabled ? 'default' : 'pointer',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: 88,
				opacity: disabled ? 0.5 : 1,
				transition: 'all 0.2s ease',
				'&:hover': disabled
					? {}
					: {
							borderColor: (th: { palette: { primary: { main: string } } }) =>
								alpha(th.palette.primary.main, 0.5),
							bgcolor: (th: { palette: { primary: { main: string } } }) =>
								alpha(th.palette.primary.main, 0.04),
						},
			}}
		>
			<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
				{disabled ? (
					<CircularProgress size={20} />
				) : (
					<AddRoundedIcon sx={{ fontSize: 24, color: 'text.secondary' }} />
				)}
				<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
					{label}
				</Typography>
			</Box>
		</Box>
	);
}

export default function SettingsPanel() {
	const theme = useTheme();
	const t = useTranslations('settings');
	const tc = useTranslations('common');
	const tAppearance = useTranslations('appearance');
	const { configs, configsLoading, saveConfig, clearConfig } = useProjectConfig();
	const { repoPaths, savePath, deletePath } = useRepoPaths();
	const { isAgentOnline } = useAgentStatus();
	const { showSnackbar } = useSnackbar();

	const [orgProjects, setOrgProjects] = useState<OrgWithProjects[]>([]);
	const [loadingProjects, setLoadingProjects] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [localPaths, setLocalPaths] = useState<Record<string, string>>({});
	const [pickingRepo, setPickingRepo] = useState<string | null>(null);
	const [manualDialogOpen, setManualDialogOpen] = useState(false);
	const [manualRepo, setManualRepo] = useState('');
	const [manualPath, setManualPath] = useState('');

	// Sync local paths from DB
	useEffect(() => {
		const fromDb: Record<string, string> = {};
		for (const rp of repoPaths) fromDb[rp.repo_full_name] = rp.local_path;
		setLocalPaths((prev) => {
			const next = { ...fromDb };
			for (const [k, v] of Object.entries(prev)) {
				if (v && !fromDb[k]) next[k] = v;
			}
			return next;
		});
	}, [repoPaths]);

	// Auto-discover orgs + projects on mount
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/github/projects');
				if (!res.ok) throw new Error(t('loadProjectsError'));
				const data = await res.json();
				if (data.error) throw new Error(data.error);
				if (!cancelled) {
					setOrgProjects(data.orgProjects ?? []);
				}
			} catch (err) {
				if (!cancelled)
					setError(err instanceof Error ? err.message : t('loadProjectsError'));
			} finally {
				if (!cancelled) setLoadingProjects(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [t]);

	const showToast = useCallback(
		(msg: string) => {
			showSnackbar(msg, 'success');
		},
		[showSnackbar],
	);

	const pickDirectory = async (repo: string) => {
		setPickingRepo(repo);
		try {
			const res = await localFetch('/filesystem/pick-directory');
			const { path } = await res.json();
			if (path) {
				setLocalPaths((prev) => ({ ...prev, [repo]: path }));
				savePath(repo, path);
				showToast(t('pathSaved'));
			}
		} finally {
			setPickingRepo(null);
		}
	};

	const handleAddRepo = async () => {
		if (!isAgentOnline) {
			setManualRepo('');
			setManualPath('');
			setManualDialogOpen(true);
			return;
		}

		setPickingRepo('__new__');
		try {
			const res = await localFetch('/filesystem/pick-directory');
			const { path } = await res.json();
			if (!path) return;

			const nameRes = await localFetch(`/git/repo-name?path=${encodeURIComponent(path)}`);
			const nameData = await nameRes.json();

			if (nameData.repoFullName) {
				savePath(nameData.repoFullName, path);
				showToast(t('pathSaved'));
			} else {
				const fallback = path.split('/').filter(Boolean).pop() || path;
				const repoName = window.prompt(t('repoName'), fallback);
				if (repoName?.trim()) {
					savePath(repoName.trim(), path);
					showToast(t('pathSaved'));
				}
			}
		} finally {
			setPickingRepo(null);
		}
	};

	const handleManualSave = () => {
		if (manualRepo.trim() && manualPath.trim()) {
			savePath(manualRepo.trim(), manualPath.trim());
			showToast(t('pathSaved'));
			setManualDialogOpen(false);
		}
	};

	return (
		<Box>
			<Typography
				variant="h4"
				sx={{
					fontWeight: 700,
					mb: 4,
					background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 30%, ${theme.palette.secondary.main} 100%)`,
					backgroundClip: 'text',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
				}}
			>
				{t('title')}
			</Typography>

			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				{/* Accordion: Repo Local Paths */}
				<Accordion
					defaultExpanded
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<FolderRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{t('repoPaths')}
							</Typography>
							<Chip
								label={t('repoCount', { count: repoPaths.length })}
								size="small"
								variant="outlined"
								sx={{ fontSize: '0.7rem' }}
							/>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							{t('repoPathsDesc')}
						</Typography>
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
								gap: 1.5,
							}}
						>
							{repoPaths.map((rp) => (
								<RepoPathCard
									key={rp.repo_full_name}
									repoName={rp.repo_full_name}
									localPath={localPaths[rp.repo_full_name] ?? rp.local_path}
									onEdit={() => pickDirectory(rp.repo_full_name)}
									onDelete={() => deletePath(rp.repo_full_name)}
									isEditing={pickingRepo === rp.repo_full_name}
								/>
							))}
							<AddRepoCard
								onClick={handleAddRepo}
								disabled={pickingRepo !== null}
								label={pickingRepo === '__new__' ? t('selecting') : t('addRepo')}
							/>
						</Box>
					</AccordionDetails>
				</Accordion>

				{/* Accordion: GitHub Projects (collapsed by default) */}
				<Accordion
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<GitHubIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{t('githubProjects')}
							</Typography>
							{configs.filter((c) => c.connected).length > 0 && (
								<Chip
									label={t('connectedCount', {
										count: configs.filter((c) => c.connected).length,
									})}
									size="small"
									color="primary"
									variant="outlined"
									sx={{ fontSize: '0.7rem' }}
								/>
							)}
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							{t('selectViewsDesc')}
						</Typography>

						{error && (
							<Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
								{error}
							</Alert>
						)}

						{loadingProjects && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
								<Skeleton
									variant="rounded"
									height={44}
									sx={{ borderRadius: 1.5 }}
								/>
								<Skeleton
									variant="rounded"
									height={44}
									sx={{ borderRadius: 1.5 }}
								/>
								<Skeleton
									variant="rounded"
									height={44}
									sx={{ borderRadius: 1.5 }}
								/>
							</Box>
						)}

						{!loadingProjects && orgProjects.length === 0 && !error && (
							<Alert severity="info" sx={{ borderRadius: 1 }}>
								{t('noProjectsFound')}
							</Alert>
						)}

						{!loadingProjects && orgProjects.length > 0 && (
							<ProjectList
								orgProjects={orgProjects}
								configs={configs}
								configsLoading={configsLoading}
								onSave={saveConfig}
								onClearAll={clearConfig}
							/>
						)}
					</AccordionDetails>
				</Accordion>

				{/* Accordion: GitHub User (default assignee) */}
				<Accordion
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<PersonRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{t('githubUser')}
							</Typography>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<GitHubAssigneeSettings />
					</AccordionDetails>
				</Accordion>

				{/* Accordion: Notifications */}
				<Accordion
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<NotificationsRoundedIcon
								sx={{ color: 'text.secondary', fontSize: 22 }}
							/>
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{t('notifications.title')}
							</Typography>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<NotificationSettings />
					</AccordionDetails>
				</Accordion>

				{/* Accordion: Appearance */}
				<Accordion
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<PaletteRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{tAppearance('title')}
							</Typography>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<AppearanceSettings />
					</AccordionDetails>
				</Accordion>
			</Box>

			<Dialog
				open={manualDialogOpen}
				onClose={() => setManualDialogOpen(false)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>{t('addRepo')}</DialogTitle>
				<DialogContent
					sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
				>
					<TextField
						label={t('repoName')}
						placeholder="owner/repo"
						value={manualRepo}
						onChange={(e) => setManualRepo(e.target.value)}
						size="small"
						fullWidth
						autoFocus
					/>
					<TextField
						label={t('localPath')}
						placeholder="/Users/you/projects/repo"
						value={manualPath}
						onChange={(e) => setManualPath(e.target.value)}
						size="small"
						fullWidth
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setManualDialogOpen(false)}>{tc('cancel')}</Button>
					<Button
						variant="contained"
						disabled={!manualRepo.trim() || !manualPath.trim()}
						onClick={handleManualSave}
					>
						{tc('save')}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
