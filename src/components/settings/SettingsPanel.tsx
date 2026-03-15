'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Button from '@mui/material/Button';
import { alpha, useTheme } from '@mui/material/styles';
import GitHubIcon from '@mui/icons-material/GitHub';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import type { ProjectV2Config, ProjectV2View, ViewRepoMapping } from '@/types';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useTranslations } from 'next-intl';
import { useRepoPaths } from '@/hooks/useRepoPaths';

interface OrgProject {
	id: string;
	title: string;
	number: number;
}

interface OrgWithProjects {
	org: string;
	projects: OrgProject[];
	ownerType: 'organization' | 'user';
}

interface ProjectViewsData {
	project: { id: string; title: string; number: number };
	views: ProjectV2View[];
	viewRepoMappings: ViewRepoMapping[];
	statusColumns: string[];
}

/** Flat project section with lazy-loaded views */
function ProjectSection({
	project,
	org,
	ownerType,
	savedConfig,
	onSave,
	onToast,
}: {
	project: OrgProject;
	org: string;
	ownerType: 'organization' | 'user';
	savedConfig: ProjectV2Config | undefined;
	onSave: (config: ProjectV2Config) => void;
	onToast: (msg: string) => void;
}) {
	const t = useTranslations('settings');
	const [viewsData, setViewsData] = useState<ProjectViewsData | null>(() => {
		if (savedConfig?.views?.length) {
			return {
				project: { id: '', title: savedConfig.projectTitle, number: savedConfig.projectNumber },
				views: savedConfig.views,
				viewRepoMappings: savedConfig.viewRepoMappings,
				statusColumns: savedConfig.statusColumns,
			};
		}
		return null;
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasFetched, setHasFetched] = useState(!!savedConfig?.views?.length);

	const selectedViews = new Set(savedConfig?.selectedViews ?? []);

	const fetchViews = useCallback(async () => {
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
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load views');
		} finally {
			setLoading(false);
		}
	}, [org, project.number, project.title, ownerType, savedConfig, onSave]);

	// Auto-fetch on mount if not yet fetched
	useEffect(() => {
		if (!hasFetched) {
			fetchViews();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const toggleView = (viewName: string) => {
		const next = new Set(selectedViews);
		if (next.has(viewName)) {
			next.delete(viewName);
		} else {
			next.add(viewName);
		}
		const views = Array.from(next);

		onSave({
			org,
			projectNumber: project.number,
			projectTitle: project.title,
			selectedViews: views,
			activeView: views[0] ?? null,
			viewOrder: views,
			viewRepoMappings: viewsData?.viewRepoMappings ?? savedConfig?.viewRepoMappings ?? [],
			statusColumns: viewsData?.statusColumns ?? savedConfig?.statusColumns ?? [],
			views: viewsData?.views ?? savedConfig?.views ?? [],
			ownerType,
		});
		onToast(
			next.has(viewName)
				? t('viewEnabled', { name: viewName })
				: t('viewDisabled', { name: viewName }),
		);
	};

	const displayViews = viewsData?.views ?? savedConfig?.views ?? [];
	const displayMappings = viewsData?.viewRepoMappings ?? savedConfig?.viewRepoMappings ?? [];

	return (
		<Box>
			<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					{project.title}
				</Typography>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					{!loading && displayViews.length > 0 && (
						<Typography variant="caption" color="text.secondary">
							{t('viewsAvailable', { count: displayViews.length })}
						</Typography>
					)}
					<Tooltip title={t('refreshFromGithub')}>
						<IconButton
							size="small"
							onClick={fetchViews}
							disabled={loading}
							sx={{
								color: 'text.secondary',
								animation: loading ? 'spin 1s linear infinite' : 'none',
								'@keyframes spin': {
									from: { transform: 'rotate(0deg)' },
									to: { transform: 'rotate(360deg)' },
								},
							}}
						>
							<RefreshRoundedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
			</Box>

			{error && (
				<Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
					{error}
				</Alert>
			)}

			{loading && !hasFetched && (
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
					<CircularProgress size={18} />
					<Typography variant="body2" color="text.secondary">
						{t('loadingViews')}
					</Typography>
				</Box>
			)}

			{displayViews.length > 0 && (
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
						gap: 1.5,
					}}
				>
					{displayViews.map((view) => {
						const isSelected = selectedViews.has(view.name);
						const mapping = displayMappings.find((m) => m.viewName === view.name);
						const repos = mapping?.repos ?? [];
						const repoCount = repos.length;
						return (
							<Box
								key={view.id}
								onClick={() => toggleView(view.name)}
								sx={{
									position: 'relative',
									p: 1.5,
									borderRadius: 2,
									cursor: 'pointer',
									border: 2,
									borderColor: (th) =>
										isSelected ? th.palette.primary.main : th.palette.divider,
									bgcolor: (th) =>
										isSelected ? alpha(th.palette.primary.main, 0.1) : 'transparent',
									transition: 'all 0.2s ease',
									'&:hover': {
										borderColor: (th) =>
											isSelected
												? th.palette.primary.light
												: alpha(th.palette.primary.main, 0.4),
										bgcolor: (th) =>
											isSelected
												? alpha(th.palette.primary.main, 0.15)
												: alpha(th.palette.primary.main, 0.04),
									},
								}}
							>
								{isSelected && (
									<CheckCircleRoundedIcon
										sx={{
											position: 'absolute',
											top: 8,
											right: 8,
											fontSize: 18,
											color: 'primary.main',
										}}
									/>
								)}
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
									<ViewColumnRoundedIcon
										sx={{
											fontSize: 18,
											color: isSelected ? 'primary.main' : 'text.secondary',
										}}
									/>
									<Typography
										variant="body2"
										sx={{
											fontWeight: 600,
											color: isSelected ? 'primary.main' : 'text.primary',
										}}
									>
										{view.name}
									</Typography>
								</Box>
								{repoCount > 0 && (
									<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
										{repos.map((repoName) => (
											<Chip
												key={repoName}
												label={repoName.split('/').pop()}
												size="small"
												sx={{
													fontSize: '0.65rem',
													height: 20,
													bgcolor: (th) =>
														isSelected
															? alpha(th.palette.secondary.main, 0.15)
															: alpha(th.palette.text.secondary, 0.08),
													color: isSelected ? 'secondary.main' : 'text.secondary',
													'& .MuiChip-label': { px: 0.75 },
												}}
											/>
										))}
									</Box>
								)}
								{repoCount === 0 && (
									<Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
										0 {t('views', { count: 0 }).split(' ').pop()}
									</Typography>
								)}
							</Box>
						);
					})}
				</Box>
			)}

			{!loading && hasFetched && displayViews.length === 0 && !error && (
				<Typography variant="body2" color="text.secondary">
					{t('noViewsFound')}
				</Typography>
			)}
		</Box>
	);
}

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
						{repoName}
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
							<Typography variant="caption" sx={{ color: 'success.main', fontSize: '0.65rem' }}>
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
	const { configs, saveConfig, clearConfig } = useProjectConfig();
	const { repoPaths, savePath, deletePath } = useRepoPaths();

	const [orgProjects, setOrgProjects] = useState<OrgWithProjects[]>([]);
	const [loadingProjects, setLoadingProjects] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState(false);
	const [toastMessage, setToastMessage] = useState('');
	const [localPaths, setLocalPaths] = useState<Record<string, string>>({});
	const [pickingRepo, setPickingRepo] = useState<string | null>(null);

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
				if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`);
				const data = await res.json();
				if (data.error) throw new Error(data.error);
				if (!cancelled) {
					setOrgProjects(data.orgProjects ?? []);
				}
			} catch (err) {
				if (!cancelled)
					setError(err instanceof Error ? err.message : 'Failed to load projects');
			} finally {
				if (!cancelled) setLoadingProjects(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const showToast = useCallback((msg: string) => {
		setToastMessage(msg);
		setToast(true);
	}, []);

	const findSavedConfig = useCallback(
		(org: string, projectNumber: number): ProjectV2Config | undefined => {
			return configs.find((c) => c.org === org && c.projectNumber === projectNumber);
		},
		[configs],
	);

	const pickDirectory = async (repo: string) => {
		setPickingRepo(repo);
		try {
			const res = await fetch('/api/filesystem/pick-directory');
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
		setPickingRepo('__new__');
		try {
			const res = await fetch('/api/filesystem/pick-directory');
			const { path } = await res.json();
			if (path) {
				const name = path.split('/').filter(Boolean).pop() || path;
				const repoName = window.prompt(t('repoName'), name);
				if (repoName?.trim()) {
					savePath(repoName.trim(), path);
					showToast(t('pathSaved'));
				}
			}
		} finally {
			setPickingRepo(null);
		}
	};

	const totalConfigured = configs.filter((c) => c.selectedViews.length > 0).length;

	// Filter: only user projects
	const userProjects = orgProjects.filter((o) => o.ownerType === 'user');

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

			{/* Section: GitHub Project Views */}
			<Box sx={{ mb: 5 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
					<GitHubIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
					<Typography variant="h6" sx={{ fontWeight: 600 }}>
						{t('githubProjects')}
					</Typography>
					{totalConfigured > 0 && (
						<Chip
							label={t('configured', { count: totalConfigured })}
							size="small"
							color="primary"
							variant="outlined"
							sx={{ fontSize: '0.75rem' }}
						/>
					)}
				</Box>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 3, ml: 4.5 }}>
					{t('selectViewsDesc')}
				</Typography>

				{error && (
					<Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
						{error}
					</Alert>
				)}

				{loadingProjects && (
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, ml: 4.5 }}>
						<Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
						<Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
					</Box>
				)}

				{!loadingProjects && userProjects.length === 0 && !error && (
					<Alert severity="info" sx={{ mb: 2, borderRadius: 1, ml: 4.5 }}>
						{t('noProjectsFound')}
					</Alert>
				)}

				{!loadingProjects && userProjects.length > 0 && (
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, ml: 4.5 }}>
						{userProjects.map((o) =>
							o.projects.map((p) => (
								<ProjectSection
									key={p.id}
									project={p}
									org={o.org}
									ownerType={o.ownerType}
									savedConfig={findSavedConfig(o.org, p.number)}
									onSave={saveConfig}
									onToast={showToast}
								/>
							)),
						)}

						{totalConfigured > 0 && (
							<Box>
								<Button
									variant="outlined"
									color="error"
									size="small"
									onClick={clearConfig}
									sx={{ textTransform: 'none' }}
								>
									{t('clearAll')}
								</Button>
							</Box>
						)}
					</Box>
				)}
			</Box>

			{/* Section: Repo Local Paths */}
			<Box>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
					<FolderRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
					<Typography variant="h6" sx={{ fontWeight: 600 }}>
						{t('repoPaths')}
					</Typography>
				</Box>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 3, ml: 4.5 }}>
					{t('repoPathsDesc')}
				</Typography>

				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
						gap: 1.5,
						ml: 4.5,
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
			</Box>

			<Snackbar
				open={toast}
				autoHideDuration={2000}
				onClose={() => setToast(false)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
			>
				<Alert onClose={() => setToast(false)} severity="success" variant="filled">
					{toastMessage}
				</Alert>
			</Snackbar>
		</Box>
	);
}
