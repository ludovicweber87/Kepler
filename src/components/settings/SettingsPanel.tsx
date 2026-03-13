'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { alpha, useTheme } from '@mui/material/styles';
import GitHubIcon from '@mui/icons-material/GitHub';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
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

const accordionSx = {
	bgcolor: 'background.paper',
	border: 1,
	borderColor: 'divider',
	borderRadius: '4px !important',
	'&::before': { display: 'none' },
	'&.Mui-expanded': { margin: '0 !important' },
};

const projectAccordionSx = {
	bgcolor: 'transparent',
	border: 1,
	borderColor: 'divider',
	borderRadius: '4px !important',
	'&::before': { display: 'none' },
	'&.Mui-expanded': { margin: '0 !important' },
};

/** Individual project accordion with lazy-loaded views */
function ProjectAccordion({
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
	const selectedCount = selectedViews.size;

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

			// Cache all views in DB (preserve selected_views if any)
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

	const handleAccordionChange = (_: unknown, expanded: boolean) => {
		if (expanded && !hasFetched) {
			fetchViews();
		}
	};

	const toggleView = (viewName: string) => {
		const next = new Set(selectedViews);
		if (next.has(viewName)) {
			next.delete(viewName);
		} else {
			next.add(viewName);
		}
		const views = Array.from(next);

		// Auto-save
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
		onToast(next.has(viewName) ? `Vue "${viewName}" activée` : `Vue "${viewName}" désactivée`);
	};

	const displayViews = viewsData?.views ?? savedConfig?.views ?? [];
	const displayMappings = viewsData?.viewRepoMappings ?? savedConfig?.viewRepoMappings ?? [];

	return (
		<Accordion
			sx={projectAccordionSx}
			onChange={handleAccordionChange}
		>
			<AccordionSummary expandIcon={<ExpandMoreIcon />}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
					<Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
						{project.title}
					</Typography>
					{selectedCount > 0 && (
						<Chip
							label={`${selectedCount} vue${selectedCount > 1 ? 's' : ''}`}
							size="small"
							color="primary"
							variant="outlined"
							sx={{ fontSize: '0.75rem' }}
						/>
					)}
				</Box>
			</AccordionSummary>
			<AccordionDetails sx={{ pt: 0 }}>
				{error && (
					<Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
						{error}
					</Alert>
				)}

				{loading && (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
						<CircularProgress size={18} />
						<Typography variant="body2" color="text.secondary">
							Chargement des vues...
						</Typography>
					</Box>
				)}

				{!loading && displayViews.length > 0 && (
					<Box>
						<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
							<Typography variant="body2" color="text.secondary">
								{displayViews.length} vue{displayViews.length > 1 ? 's' : ''} disponible{displayViews.length > 1 ? 's' : ''}
							</Typography>
							<Tooltip title="Rafraîchir depuis GitHub">
								<IconButton
									size="small"
									onClick={(e) => {
										e.stopPropagation();
										fetchViews();
									}}
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
						{displayViews.map((view) => {
							const mapping = displayMappings.find((m) => m.viewName === view.name);
							const repoCount = mapping?.repos.length ?? 0;
							return (
								<Box
									key={view.id}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1,
										py: 0.5,
										px: 1,
										borderRadius: 1,
										'&:hover': {
											bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
										},
									}}
								>
									<FormControlLabel
										control={
											<Checkbox
												checked={selectedViews.has(view.name)}
												onChange={() => toggleView(view.name)}
												size="small"
											/>
										}
										label={view.name}
										sx={{ flex: 1, mr: 0 }}
									/>
									<Chip
										label={`${repoCount} dépôt${repoCount !== 1 ? 's' : ''}`}
										size="small"
										variant="outlined"
										sx={{ fontSize: '0.75rem' }}
									/>
								</Box>
							);
						})}
					</Box>
				)}

				{!loading && !hasFetched && displayViews.length === 0 && (
					<Typography variant="body2" color="text.secondary">
						Ouvrez cet accordion pour charger les vues depuis GitHub.
					</Typography>
				)}

				{!loading && hasFetched && displayViews.length === 0 && !error && (
					<Typography variant="body2" color="text.secondary">
						Aucune vue trouvée pour ce projet.
					</Typography>
				)}
			</AccordionDetails>
		</Accordion>
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

	const totalProjects = orgProjects.reduce((sum, o) => sum + o.projects.length, 0);
	const totalConfigured = configs.filter((c) => c.selectedViews.length > 0).length;

	return (
		<Box>
			<Typography
				variant="h4"
				sx={{
					fontWeight: 700,
					mb: 3,
					background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 30%, ${theme.palette.secondary.main} 100%)`,
					backgroundClip: 'text',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
				}}
			>
				{t('title')}
			</Typography>

			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				{/* GitHub Project Views */}
				<Accordion defaultExpanded sx={accordionSx}>
					<AccordionSummary expandIcon={<ExpandMoreIcon />}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
							<GitHubIcon sx={{ color: 'text.secondary' }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								Projets GitHub
							</Typography>
							{totalConfigured > 0 && (
								<Chip
									label={`${totalConfigured} configuré${totalConfigured > 1 ? 's' : ''}`}
									size="small"
									color="primary"
									variant="outlined"
									sx={{ fontSize: '0.75rem' }}
								/>
							)}
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ pt: 0 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							Sélectionnez les vues à afficher dans le kanban pour chaque projet.
						</Typography>

						{error && (
							<Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
								{error}
							</Alert>
						)}

						{loadingProjects && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
								<Skeleton variant="rounded" height={48} sx={{ borderRadius: 1 }} />
								<Skeleton variant="rounded" height={48} sx={{ borderRadius: 1 }} />
							</Box>
						)}

						{!loadingProjects && totalProjects === 0 && !error && (
							<Alert severity="info" sx={{ mb: 2, borderRadius: 1 }}>
								Aucun projet trouvé.
							</Alert>
						)}

						{!loadingProjects && totalProjects > 0 && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
								{orgProjects.map((o) => (
									<Box key={o.org}>
										{orgProjects.length > 1 && (
											<Typography
												variant="overline"
												color="text.secondary"
												sx={{ display: 'block', mb: 0.5, ml: 0.5 }}
											>
												{o.org}{o.ownerType === 'user' ? ' (personnel)' : ''}
											</Typography>
										)}
										<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
											{o.projects.map((p) => (
												<ProjectAccordion
													key={p.id}
													project={p}
													org={o.org}
													ownerType={o.ownerType}
													savedConfig={findSavedConfig(o.org, p.number)}
													onSave={saveConfig}
													onToast={showToast}
												/>
											))}
										</Box>
									</Box>
								))}

								{totalConfigured > 0 && (
									<Box sx={{ mt: 1 }}>
										<Button
											variant="outlined"
											color="error"
											size="small"
											onClick={clearConfig}
											sx={{ textTransform: 'none' }}
										>
											Tout effacer
										</Button>
									</Box>
								)}
							</Box>
						)}
					</AccordionDetails>
				</Accordion>

				{/* Repo Local Paths */}
				<Accordion defaultExpanded sx={accordionSx}>
					<AccordionSummary expandIcon={<ExpandMoreIcon />}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
							<FolderRoundedIcon sx={{ color: 'text.secondary' }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								Chemins locaux des dépôts
							</Typography>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ pt: 0 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
							Chemins locaux de vos dépôts. Utilisés pour les opérations git et les
							sessions d&apos;agents.
						</Typography>

						{repoPaths.length > 0 && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}>
								{repoPaths.map((rp) => (
									<TextField
										key={rp.repo_full_name}
										label={rp.repo_full_name}
										size="small"
										fullWidth
										value={localPaths[rp.repo_full_name] ?? rp.local_path}
										onChange={(e) =>
											setLocalPaths((prev) => ({
												...prev,
												[rp.repo_full_name]: e.target.value,
											}))
										}
										slotProps={{
											input: {
												endAdornment: (
													<InputAdornment position="end">
														<Tooltip title="Parcourir...">
															<IconButton
																size="small"
																edge="end"
																onClick={() =>
																	pickDirectory(rp.repo_full_name)
																}
																disabled={pickingRepo !== null}
															>
																{pickingRepo ===
																rp.repo_full_name ? (
																	<CircularProgress size={18} />
																) : (
																	<FolderOpenRoundedIcon fontSize="small" />
																)}
															</IconButton>
														</Tooltip>
														<Tooltip title="Supprimer">
															<IconButton
																size="small"
																edge="end"
																onClick={() =>
																	deletePath(rp.repo_full_name)
																}
																sx={{
																	color: 'text.disabled',
																	'&:hover': { color: 'error.main' },
																}}
															>
																<ExpandMoreIcon
																	fontSize="small"
																	sx={{
																		transform: 'rotate(45deg)',
																	}}
																/>
															</IconButton>
														</Tooltip>
													</InputAdornment>
												),
											},
										}}
									/>
								))}
							</Box>
						)}

						<Button
							variant="outlined"
							size="small"
							startIcon={<FolderOpenRoundedIcon />}
							onClick={async () => {
								setPickingRepo('__new__');
								try {
									const res = await fetch('/api/filesystem/pick-directory');
									const { path } = await res.json();
									if (path) {
										const name = path.split('/').filter(Boolean).pop() || path;
										const repoName = window.prompt(
											'Repository name (e.g. owner/repo):',
											name,
										);
										if (repoName?.trim()) {
											savePath(repoName.trim(), path);
											showToast(t('pathSaved'));
										}
									}
								} finally {
									setPickingRepo(null);
								}
							}}
							disabled={pickingRepo !== null}
							sx={{
								borderColor: alpha(theme.palette.primary.main, 0.4),
								color: theme.palette.primary.main,
								textTransform: 'none',
								'&:hover': {
									borderColor: theme.palette.primary.main,
									bgcolor: alpha(theme.palette.primary.main, 0.08),
								},
							}}
						>
							{pickingRepo === '__new__' ? 'Sélection...' : 'Ajouter un dépôt'}
						</Button>
					</AccordionDetails>
				</Accordion>
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
