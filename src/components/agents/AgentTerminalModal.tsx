'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { alpha } from '@mui/material/styles';
import CircularProgress from '@mui/material/CircularProgress';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import Tooltip from '@mui/material/Tooltip';
interface AgentFile {
	filename: string;
	name: string;
	content: string;
}
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAgentSession } from '@/hooks/useAgentSession';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useTranslations } from 'next-intl';
import { localFetch } from '@/lib/local-fetch';
import { apiFetch } from '@/lib/api-fetch';

interface IssueContext {
	owner: string;
	repo: string;
	issueNumber: number;
	issueTitle: string;
	labels?: string[];
}

interface AgentTerminalModalProps {
	open: boolean;
	onClose: () => void;
	/** Direct project path (agents/skills) */
	projectPath?: string;
	agentFile?: AgentFile;
	/** Attach to an existing tmux session by ID */
	existingSessionId?: string;
	/** Issue context — resolves projectPath via repo_paths */
	issueContext?: IssueContext;
	/** Launch agent in an existing worktree — skip branch/worktree creation */
	existingWorktree?: { branch: string; worktreePath: string };
}

function buildSessionId(
	projectPath?: string,
	agentFile?: AgentFile,
	issueContext?: IssueContext,
): string {
	const uid = Date.now().toString(36);
	if (issueContext) {
		return `devora-${issueContext.owner}-${issueContext.repo}-${issueContext.issueNumber}-${uid}`;
	}
	const base = projectPath?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown';
	const suffix =
		agentFile?.filename?.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]/g, '-') ?? 'session';
	return `devora-${base}-${suffix}-${uid}`;
}

// Auto-generated worktree name. The `wip-` prefix marks it as un-named: the server
// renames the branch (Karma convention) on the agent's first activity log.
const WT_ADJ = [
	'dusty',
	'light',
	'bold',
	'calm',
	'swift',
	'brave',
	'quiet',
	'warm',
	'sharp',
	'soft',
];
const WT_NOUN = [
	'canyon',
	'ivy',
	'pine',
	'river',
	'delta',
	'harbor',
	'meadow',
	'summit',
	'ember',
	'vale',
];
function randomWorktreeName(): string {
	const a = WT_ADJ[Math.floor(Math.random() * WT_ADJ.length)];
	const n = WT_NOUN[Math.floor(Math.random() * WT_NOUN.length)];
	const id = Math.random().toString(36).slice(2, 6);
	return `wip-${a}-${n}-${id}`;
}

export default function AgentTerminalModal({
	open,
	onClose,
	projectPath: projectPathProp,
	agentFile,
	existingSessionId,
	issueContext,
	existingWorktree,
}: AgentTerminalModalProps) {
	const router = useRouter();
	const tl = useTranslations('launchModal');
	const tc = useTranslations('common');
	// Step management: 'project' → 'launch-mode' → 'branch'
	const [step, setStep] = useState<'project' | 'launch-mode' | 'branch'>('project');
	const [branchInput, setBranchInput] = useState('');
	// F2 — optional GitHub issue linked at launch, injected into the agent prompt as context
	const [issueUrl, setIssueUrl] = useState('');
	const [issueFetching, setIssueFetching] = useState(false);
	const [issueLoaded, setIssueLoaded] = useState<string | null>(null);
	const [, setWorktreePath] = useState<string | null>(null);
	const [worktreeError, setWorktreeError] = useState<string | null>(null);
	// Current branch mode state
	const [selectedProject, setSelectedProject] = useState<string | null>(null);
	const [, setCurrentBranch] = useState<string | null>(null);
	const [fetchingBranch, setFetchingBranch] = useState(false);
	const [launchMode, setLaunchMode] = useState<'worktree' | 'current-branch' | null>(null);

	// Path resolution for issue context
	const { repoPaths, getLocalPath } = useRepoPaths();
	const { showSnackbar } = useSnackbar();
	const [resolvedPath, setResolvedPath] = useState<string | null>(null);

	const projectPath = projectPathProp ?? resolvedPath;

	// Worktree management
	const { isCreating } = useWorktrees(projectPath ?? undefined);

	const generatedIdRef = useRef<string | null>(null);
	const redirectedRef = useRef(false);
	const issueCtxRef = useRef<string | null>(null);
	if (open && !existingSessionId && !generatedIdRef.current) {
		generatedIdRef.current = buildSessionId(projectPath ?? undefined, agentFile, issueContext);
	}
	if (!open) {
		generatedIdRef.current = null;
	}
	const sessionId = existingSessionId ?? generatedIdRef.current ?? '';

	const { ensureSession } = useAgentSession(open ? sessionId : undefined);

	// Redirect to the Workbench (which renders chat/files/activity/terminal) and
	// close this modal. The modal's job ends the moment a session id is ready.
	const goToWorkbench = useCallback(
		(id: string) => {
			if (redirectedRef.current) return;
			redirectedRef.current = true;
			router.push(`/workbench?session=${encodeURIComponent(id)}`);
			onClose();
		},
		[router, onClose],
	);

	// Resolve path from repo_paths when using issueContext. The local folder is
	// configured ONLY in Settings — never via a picker here. If the repo has no
	// configured path, guide the user to Settings instead of popping a picker.
	const resolveCwd = useCallback(() => {
		if (!issueContext) return;
		const repoFullName = `${issueContext.owner}/${issueContext.repo}`;
		const saved = getLocalPath(repoFullName);
		if (saved) {
			setResolvedPath(saved);
			return;
		}
		showSnackbar(tl('configurePathFirst', { repo: repoFullName }), 'warning');
		router.push('/settings');
		onClose();
	}, [issueContext, getLocalPath, showSnackbar, tl, router, onClose]);

	useEffect(() => {
		if (open && issueContext && !resolvedPath) {
			resolveCwd();
		}
	}, [open, issueContext, resolvedPath, resolveCwd]);

	// Reset state on close
	useEffect(() => {
		if (!open) {
			setResolvedPath(null);
			setStep('project');
			setBranchInput('');
			setWorktreePath(null);
			setWorktreeError(null);
			setSelectedProject(null);
			setCurrentBranch(null);
			setFetchingBranch(false);
			setLaunchMode(null);
			redirectedRef.current = false;
		}
	}, [open]);

	// Redirect immediately when attaching to an existing session (re-attach / past sessions)
	useEffect(() => {
		if (open && existingSessionId) {
			goToWorkbench(existingSessionId);
		}
	}, [open, existingSessionId, goToWorkbench]);

	// Skip project step when projectPath is already provided (from issue context, agents page, etc.)
	// Always go to launch-mode step so user can choose worktree or current branch
	useEffect(() => {
		if (open && !existingSessionId && !existingWorktree && projectPath && step === 'project') {
			setStep('launch-mode');
		}
	}, [open, existingSessionId, existingWorktree, projectPath, step]);

	// Skip branch step when launching in an existing worktree
	useEffect(() => {
		if (open && existingWorktree) {
			setWorktreePath(existingWorktree.worktreePath);
			setBranchInput(existingWorktree.branch);

			const projectName = projectPath?.split('/').filter(Boolean).pop() ?? 'unknown';
			ensureSession({
				sessionId,
				projectPath: projectPath ?? '',
				projectName,
				agentName: agentFile?.name ?? null,
				branch: existingWorktree.branch,
				worktreePath: existingWorktree.worktreePath,
				issueOwner: null,
				issueRepo: null,
				issueNumber: null,
				issueTitle: null,
				systemPrompt: composeSystemPrompt(),
			});

			goToWorkbench(sessionId);
		}
	}, [open, existingWorktree]);

	// Handle branch submission + worktree creation
	const fetchIssueContext = useCallback(async (url: string) => {
		const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
		if (!m) {
			issueCtxRef.current = null;
			setIssueLoaded(null);
			return;
		}
		const [, owner, repo, number] = m;
		setIssueFetching(true);
		try {
			const res = await apiFetch(
				`/api/github/issue?owner=${owner}&repo=${repo}&number=${number}`,
			);
			if (!res.ok) return;
			const data = await res.json();
			const issue = data.issue;
			if (issue) {
				issueCtxRef.current = `## Contexte de l'issue #${issue.number} : ${issue.title}\n\n${issue.body ?? ''}`;
				setIssueLoaded(`#${issue.number} ${issue.title}`);
			}
		} catch {
			// silent — context is optional
		} finally {
			setIssueFetching(false);
		}
	}, []);

	const composeSystemPrompt = useCallback((): string | undefined => {
		const base = agentFile ? agentFile.content : '';
		const issueBlock = issueCtxRef.current ? `\n\n${issueCtxRef.current}` : '';
		const sourceIssueBlock = issueContext
			? `\n\n## Contexte\nCette session a été ouverte depuis l'issue GitHub ${issueContext.owner}/${issueContext.repo}#${issueContext.issueNumber}${issueContext.issueTitle ? ` : « ${issueContext.issueTitle} »` : ''}.\nAvant d'agir, lis cette issue pour comprendre le contexte — par exemple : \`gh issue view ${issueContext.issueNumber} --repo ${issueContext.owner}/${issueContext.repo} --comments\`.`
			: '';
		return (base + issueBlock + sourceIssueBlock).trim() || undefined;
	}, [agentFile, issueContext]);

	const handleLaunch = useCallback(async () => {
		if (!projectPath) return;
		// Name is optional — fall back to an auto-generated `wip-` name (renamed later
		// from the user's first prompt, in the Workbench).
		const trimmedName = branchInput.trim();
		const name = trimmedName || randomWorktreeName();
		setWorktreeError(null);

		try {
			const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
			ensureSession({
				sessionId,
				projectPath,
				projectName,
				agentName:
					agentFile?.name ?? (issueContext ? `#${issueContext.issueNumber}` : null),
				branch: name,
				worktreePath: null,
				status: 'provisioning',
				issueOwner: issueContext?.owner ?? null,
				issueRepo: issueContext?.repo ?? null,
				issueNumber: issueContext?.issueNumber ?? null,
				issueTitle: issueContext?.issueTitle ?? null,
				systemPrompt: composeSystemPrompt(),
			});
			goToWorkbench(sessionId);
		} catch (err) {
			setWorktreeError(err instanceof Error ? err.message : 'Erreur au lancement');
		}
	}, [
		branchInput,
		projectPath,
		sessionId,
		agentFile,
		issueContext,
		composeSystemPrompt,
		ensureSession,
		goToWorkbench,
	]);

	// Handle selecting a project from repo_paths (selection only, navigation via Next)
	const handleSelectProject = useCallback((localPath: string) => {
		setSelectedProject(localPath);
	}, []);

	// Navigate from project step to launch-mode step
	const handleProjectNext = useCallback(() => {
		if (!selectedProject) return;
		setResolvedPath(selectedProject);
		setStep('launch-mode');
	}, [selectedProject]);

	// Handle launching on current branch (no worktree)
	const handleLaunchCurrentBranch = useCallback(async () => {
		if (!projectPath) return;
		setFetchingBranch(true);
		try {
			const res = await localFetch(
				`/git/current-branch?path=${encodeURIComponent(projectPath)}`,
			);
			const data = await res.json();
			if (data.branch) {
				setCurrentBranch(data.branch);
				setBranchInput(data.branch);

				const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
				ensureSession({
					sessionId,
					projectPath,
					projectName,
					agentName: agentFile?.name ?? null,
					branch: data.branch,
					worktreePath: null,
					issueOwner: issueContext?.owner ?? null,
					issueRepo: issueContext?.repo ?? null,
					issueNumber: issueContext?.issueNumber ?? null,
					issueTitle: issueContext?.issueTitle ?? null,
					systemPrompt: composeSystemPrompt(),
				});

				goToWorkbench(sessionId);
			}
		} catch {
			setWorktreeError('Failed to detect current branch');
		} finally {
			setFetchingBranch(false);
		}
	}, [projectPath, sessionId, agentFile, issueContext, ensureSession, goToWorkbench]);

	// Navigate from launch-mode step
	const handleLaunchModeNext = useCallback(() => {
		if (!launchMode) return;
		if (launchMode === 'worktree') {
			setStep('branch');
		} else {
			handleLaunchCurrentBranch();
		}
	}, [launchMode, handleLaunchCurrentBranch]);

	// Display info
	const folderLabel = issueContext
		? `${issueContext.owner}/${issueContext.repo}`
		: (projectPath?.split('/').filter(Boolean).pop() ?? '');

	const titleIcon = agentFile ? (
		<DescriptionRoundedIcon sx={{ color: 'primary.main' }} />
	) : issueContext ? (
		<SmartToyRoundedIcon sx={{ color: 'primary.main' }} />
	) : (
		<TerminalRoundedIcon sx={{ color: 'secondary.main' }} />
	);

	const titleText = agentFile
		? agentFile.name
		: issueContext
			? `Agent — #${issueContext.issueNumber}`
			: existingSessionId
				? 'Session active'
				: 'Nouvelle session';

	const subtitleText = issueContext?.issueTitle;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth={false}
			fullWidth
			disableAutoFocus
			disableEnforceFocus
			disableRestoreFocus
			PaperProps={{
				sx: {
					bgcolor: 'background.paper',
					maxWidth: 1400,
					height: '90vh',
					borderRadius: 1,
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
				},
			}}
		>
			<DialogTitle
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					pb: 1,
					flexShrink: 0,
				}}
			>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
					{titleIcon}
					<Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
						{titleText}
					</Typography>
					{subtitleText && (
						<Typography
							variant="body2"
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								maxWidth: 350,
								color: 'text.secondary',
							}}
						>
							{subtitleText}
						</Typography>
					)}
				</Box>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
					<Chip
						icon={<FolderOpenRoundedIcon sx={{ fontSize: '14px !important' }} />}
						label={folderLabel}
						size="small"
						sx={{
							height: 24,
							fontSize: '0.7rem',
							bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05),
							'& .MuiChip-icon': { color: 'text.secondary' },
						}}
					/>
					<Tooltip title={tc('close')} arrow placement="bottom">
						<IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
							<CloseRoundedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
			</DialogTitle>

			{/* Step 1: Project selection */}
			{step === 'project' && (
				<Box
					sx={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 3,
						px: 4,
					}}
				>
					<FolderOpenRoundedIcon
						sx={{ fontSize: 56, color: 'primary.main', opacity: 0.7 }}
					/>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('selectProject')}
					</Typography>
					<Typography
						variant="body2"
						sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 450 }}
					>
						{tl('selectProjectDesc')}
					</Typography>

					{repoPaths.length > 0 ? (
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
								gap: 2,
								width: '100%',
								maxWidth: 650,
							}}
						>
							{repoPaths.map((repo) => {
								const isSelected = selectedProject === repo.local_path;
								return (
									<Box
										key={repo.repo_full_name}
										onClick={() => handleSelectProject(repo.local_path)}
										sx={{
											p: 2.5,
											borderRadius: 1,
											border: 2,
											borderColor: isSelected ? 'primary.main' : 'divider',
											bgcolor: isSelected
												? (theme) => alpha(theme.palette.primary.main, 0.08)
												: 'transparent',
											cursor: 'pointer',
											textAlign: 'center',
											transition: 'all 0.15s',
											'&:hover': {
												borderColor: 'primary.main',
												bgcolor: (theme) =>
													alpha(theme.palette.primary.main, 0.06),
												transform: 'translateY(-2px)',
												boxShadow: (theme) =>
													`0 4px 12px ${alpha(theme.palette.primary.main, 0.12)}`,
											},
										}}
									>
										<FolderOpenRoundedIcon
											sx={{
												fontSize: 28,
												color: isSelected
													? 'primary.main'
													: 'text.secondary',
												mb: 1,
											}}
										/>
										<Typography
											variant="subtitle2"
											sx={{
												fontWeight: 700,
												fontSize: '0.85rem',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}
										>
											{repo.local_path.split('/').pop()}
										</Typography>
									</Box>
								);
							})}
						</Box>
					) : (
						<Box sx={{ textAlign: 'center' }}>
							<Typography variant="body2" color="text.disabled" sx={{ mb: 1 }}>
								{tl('noProjects')}
							</Typography>
							<Typography variant="body2" color="text.disabled">
								{tl('noProjectsDesc')}
							</Typography>
						</Box>
					)}

					{repoPaths.length > 0 && (
						<Button
							variant="contained"
							disabled={!selectedProject}
							endIcon={<ArrowForwardRoundedIcon />}
							onClick={handleProjectNext}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								px: 4,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{tc('next')}
						</Button>
					)}
				</Box>
			)}

			{/* Step 2: Launch mode (worktree vs current branch) */}
			{step === 'launch-mode' && (
				<Box
					sx={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 3,
						px: 4,
					}}
				>
					<RocketLaunchRoundedIcon
						sx={{ fontSize: 56, color: 'primary.main', opacity: 0.7 }}
					/>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('launchMode')}
					</Typography>

					{fetchingBranch && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<CircularProgress size={16} sx={{ color: 'primary.main' }} />
							<Typography variant="body2" color="text.secondary">
								{tl('fetchingBranch')}
							</Typography>
						</Box>
					)}

					{worktreeError && (
						<Alert severity="error" sx={{ maxWidth: 500, width: '100%' }}>
							{worktreeError}
						</Alert>
					)}

					<Box sx={{ display: 'flex', gap: 2, maxWidth: 500, width: '100%' }}>
						{/* Worktree option */}
						<Box
							onClick={() => setLaunchMode('worktree')}
							sx={{
								flex: 1,
								p: 3,
								borderRadius: 1,
								border: 2,
								borderColor: launchMode === 'worktree' ? 'primary.main' : 'divider',
								bgcolor:
									launchMode === 'worktree'
										? (theme) => alpha(theme.palette.primary.main, 0.08)
										: 'transparent',
								cursor: 'pointer',
								textAlign: 'center',
								transition: 'all 0.15s',
								'&:hover': {
									borderColor: 'primary.main',
									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
									transform: 'translateY(-2px)',
								},
							}}
						>
							<AccountTreeRoundedIcon
								sx={{ fontSize: 36, color: 'primary.main', mb: 1 }}
							/>
							<Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
								{tl('worktree')}
							</Typography>
							<Typography
								variant="body2"
								sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
							>
								{tl('worktreeDesc')}
							</Typography>
						</Box>

						{/* Current branch option */}
						<Tooltip title={tl('currentBranchTooltip')} arrow placement="top">
							<Box
								onClick={() => setLaunchMode('current-branch')}
								sx={{
									flex: 1,
									p: 3,
									borderRadius: 1,
									border: 2,
									borderColor:
										launchMode === 'current-branch'
											? 'secondary.main'
											: 'divider',
									bgcolor:
										launchMode === 'current-branch'
											? (theme) => alpha(theme.palette.secondary.main, 0.08)
											: 'transparent',
									cursor: 'pointer',
									textAlign: 'center',
									transition: 'all 0.15s',
									'&:hover': {
										borderColor: 'secondary.main',
										bgcolor: (theme) =>
											alpha(theme.palette.secondary.main, 0.06),
										transform: 'translateY(-2px)',
									},
								}}
							>
								<TerminalRoundedIcon
									sx={{ fontSize: 36, color: 'secondary.main', mb: 1 }}
								/>
								<Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
									{tl('currentBranch')}
								</Typography>
								<Typography
									variant="body2"
									sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
								>
									{tl('currentBranchDesc')}
								</Typography>
							</Box>
						</Tooltip>
					</Box>

					<Box sx={{ display: 'flex', gap: 2 }}>
						{!projectPathProp && (
							<Button
								variant="outlined"
								startIcon={<ArrowBackRoundedIcon />}
								onClick={() => {
									setLaunchMode(null);
									setResolvedPath(null);
									setStep('project');
								}}
								sx={{ textTransform: 'none', fontWeight: 600 }}
							>
								{tc('back')}
							</Button>
						)}
						<Button
							variant="contained"
							disabled={!launchMode || fetchingBranch}
							endIcon={<ArrowForwardRoundedIcon />}
							onClick={handleLaunchModeNext}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								px: 4,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{tc('next')}
						</Button>
					</Box>
				</Box>
			)}

			{/* Step 3: Branch name input (worktree mode) */}
			{step === 'branch' && (
				<Box
					sx={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 3,
						px: 4,
					}}
				>
					<AccountTreeRoundedIcon
						sx={{ fontSize: 56, color: 'primary.main', opacity: 0.7 }}
					/>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('branchName')}
					</Typography>
					<Typography
						variant="body2"
						sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 450 }}
					>
						{tl('branchDesc')}
					</Typography>

					{/* F2 — optional GitHub issue for agent context */}
					<Box sx={{ width: '100%', maxWidth: 500 }}>
						<TextField
							fullWidth
							size="small"
							placeholder={tl('issueUrl')}
							value={issueUrl}
							onChange={(e) => setIssueUrl(e.target.value)}
							onBlur={() => issueUrl.trim() && fetchIssueContext(issueUrl.trim())}
							disabled={isCreating}
							InputProps={{
								endAdornment: issueFetching ? (
									<CircularProgress size={14} />
								) : undefined,
							}}
						/>
						{issueLoaded && (
							<Typography
								variant="caption"
								sx={{ color: 'success.main', mt: 0.5, display: 'block' }}
							>
								✓ {issueLoaded}
							</Typography>
						)}
					</Box>

					<Box
						component="form"
						onSubmit={(e) => {
							e.preventDefault();
							handleLaunch();
						}}
						sx={{
							display: 'flex',
							gap: 1.5,
							width: '100%',
							maxWidth: 500,
							alignItems: 'flex-start',
						}}
					>
						<TextField
							autoFocus
							fullWidth
							size="small"
							placeholder="feat/my-feature"
							value={branchInput}
							onChange={(e) => setBranchInput(e.target.value)}
							disabled={isCreating}
							sx={{
								'& .MuiOutlinedInput-root': {
									bgcolor: (theme) => alpha(theme.palette.text.primary, 0.03),
									'& fieldset': {
										borderColor: (theme) =>
											alpha(theme.palette.text.primary, 0.1),
									},
									'&:hover fieldset': {
										borderColor: (theme) =>
											alpha(theme.palette.primary.main, 0.4),
									},
									'&.Mui-focused fieldset': { borderColor: 'primary.main' },
								},
							}}
						/>
						<Button
							type="submit"
							variant="contained"
							disabled={isCreating || !projectPath}
							startIcon={
								isCreating ? (
									<CircularProgress size={16} color="inherit" />
								) : (
									<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />
								)
							}
							sx={{
								bgcolor: 'primary.main',
								textTransform: 'none',
								fontWeight: 600,
								whiteSpace: 'nowrap',
								height: 40,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{isCreating ? tl('creating') : tl('launch')}
						</Button>
					</Box>

					{worktreeError && (
						<Alert severity="error" sx={{ maxWidth: 500, width: '100%' }}>
							{worktreeError}
						</Alert>
					)}

					<Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
						<Button
							variant="outlined"
							startIcon={<ArrowBackRoundedIcon />}
							onClick={() => setStep('launch-mode')}
							disabled={isCreating}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{tc('back')}
						</Button>
					</Box>
				</Box>
			)}
		</Dialog>
	);
}
