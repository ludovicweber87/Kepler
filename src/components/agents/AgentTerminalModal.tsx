'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import { alpha, type Theme } from '@mui/material/styles';
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
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ExploreRoundedIcon from '@mui/icons-material/ExploreRounded';
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
import { useBranches, type Branch } from '@/hooks/useBranches';
import { usePersonas } from '@/hooks/usePersonas';
import { useAppSetting } from '@/hooks/useAppSetting';
import { useTranslations } from 'next-intl';
import { localFetch } from '@/lib/local-fetch';
import { apiFetch } from '@/lib/api-fetch';
import { slugify } from '@/lib/slug';
import { resolveRepoFullName } from '@/lib/resolveRepoFullName';
import { filterPersonasByRepo } from '@/lib/personaRepos';
import { MODELS, EFFORTS } from '@/lib/models';
import { selectableCardSx } from '@/theme/selectableCard';
import PersonaCards from './launch/PersonaCards';
import AgentSettingsCards from './launch/AgentSettingsCards';

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
		return `kepler-${issueContext.owner}-${issueContext.repo}-${issueContext.issueNumber}-${uid}`;
	}
	const base = projectPath?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown';
	const suffix =
		agentFile?.filename?.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]/g, '-') ?? 'session';
	return `kepler-${base}-${suffix}-${uid}`;
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

function issueBranchName(issue: { issueNumber: number; issueTitle: string }): string {
	const slug = slugify(issue.issueTitle);
	return slug ? `feat/${issue.issueNumber}-${slug}` : `feat/${issue.issueNumber}`;
}

function issueDisplayName(issue: { issueNumber: number; issueTitle: string }): string {
	const t = issue.issueTitle.trim();
	if (!t) return `#${issue.issueNumber}`;
	return t.length > 72 ? `${t.slice(0, 71)}…` : t;
}

/** Card d'un mode de lancement (worktree / branche courante / branche existante). */
function launchModeCardSx(theme: Theme, selected: boolean, accent: 'primary' | 'secondary') {
	return {
		...selectableCardSx(theme, {
			selected,
			color: theme.palette[accent].main,
			radius: 1,
			borderWidth: '2px',
		}),
		cursor: 'pointer',
		textAlign: 'center' as const,
	};
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
	// Step management: 'project' → 'launch-mode' → 'agent' → ['settings'] → 'branch'
	const [step, setStep] = useState<
		| 'project'
		| 'launch-mode'
		| 'agent'
		| 'settings'
		| 'branch'
		| 'existing-branch'
		| 'linking-issue'
	>('project');
	const [branchInput, setBranchInput] = useState('');
	// F2 — optional GitHub issue linked at launch, injected into the agent prompt as context
	const [issueUrl, setIssueUrl] = useState('');
	const [issueFetching, setIssueFetching] = useState(false);
	const [issueLoaded, setIssueLoaded] = useState<string | null>(null);
	const [linkingNumber, setLinkingNumber] = useState<number | null>(null);
	const [, setWorktreePath] = useState<string | null>(null);
	const [worktreeError, setWorktreeError] = useState<string | null>(null);
	// Current branch mode state
	const [selectedProject, setSelectedProject] = useState<string | null>(null);
	const [, setCurrentBranch] = useState<string | null>(null);
	const [fetchingBranch, setFetchingBranch] = useState(false);
	const [launchMode, setLaunchMode] = useState<
		'worktree' | 'current-branch' | 'existing-branch' | 'free' | null
	>(null);
	const [selectedExistingBranch, setSelectedExistingBranch] = useState<Branch | null>(null);
	const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
	// Réglages libres utilisés quand aucune persona n'est choisie (« Sans persona »).
	// Une persona sélectionnée impose et verrouille ses propres valeurs.
	const [settingsModel, setSettingsModel] = useState('opus');
	const [settingsEffort, setSettingsEffort] = useState('high');
	const [settingsMode, setSettingsMode] = useState('bypassPermissions');
	const { personas } = usePersonas();
	// Mode libre : dossier de lancement configuré dans les settings, hors projet.
	const { value: freeModePathValue } = useAppSetting('free_mode_path');
	const freeModePath = freeModePathValue?.trim() || null;
	const selectedPersona = selectedPersonaId
		? (personas.find((p) => p.id === selectedPersonaId) ?? null)
		: null;

	// Path resolution for issue context
	const { repoPaths, getLocalPath } = useRepoPaths();
	const { showSnackbar } = useSnackbar();
	const [resolvedPath, setResolvedPath] = useState<string | null>(null);

	const projectPath = projectPathProp ?? resolvedPath;

	// Une persona rattachée à des repos n'est proposée que sur ces repos ; sans
	// rattachement elle reste globale. Repo inconnu (path hors `repo_paths`) → tout.
	const currentRepo = resolveRepoFullName(
		issueContext
			? { issue_owner: issueContext.owner, issue_repo: issueContext.repo }
			: { project_path: projectPath },
		repoPaths,
	);
	const availablePersonas = useMemo(
		() => (currentRepo ? filterPersonasByRepo(personas, currentRepo) : personas),
		[personas, currentRepo],
	);

	// Changement de projet après coup : une persona devenue hors périmètre est désélectionnée.
	useEffect(() => {
		if (!selectedPersonaId) return;
		if (!availablePersonas.some((p) => p.id === selectedPersonaId)) setSelectedPersonaId(null);
	}, [availablePersonas, selectedPersonaId]);

	// Worktree management
	const { isCreating } = useWorktrees(projectPath ?? undefined);
	const { data: existingBranches = [], isLoading: branchesLoading } = useBranches(
		projectPath ?? undefined,
		{ includeRemote: true, enabled: step === 'existing-branch' },
	);

	const generatedIdRef = useRef<string | null>(null);
	const redirectedRef = useRef(false);
	// Guard: auto-launch (worktree + redirect) fires once when opening from an issue.
	const autoLaunchedRef = useRef(false);
	const issueCtxRef = useRef<string | null>(null);
	// Issue linked via the URL field in the worktree step — persisted on the session
	const linkedIssueRef = useRef<IssueContext | null>(null);
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
			setSelectedPersonaId(null);
			setSettingsModel('opus');
			setSettingsEffort('high');
			setSettingsMode('bypassPermissions');
			setSelectedExistingBranch(null);
			setIssueUrl('');
			setIssueLoaded(null);
			setLinkingNumber(null);
			issueCtxRef.current = null;
			linkedIssueRef.current = null;
			redirectedRef.current = false;
			autoLaunchedRef.current = false;
		}
	}, [open]);

	// Redirect immediately when attaching to an existing session (re-attach / past sessions)
	useEffect(() => {
		if (open && existingSessionId) {
			goToWorkbench(existingSessionId);
		}
	}, [open, existingSessionId, goToWorkbench]);

	// Skip project step when projectPath is already provided (from the agents page, etc.)
	// and let the user choose worktree / current / existing branch.
	// Exception: when launching from an issue, we don't show the launch-mode cards at all
	// (handled by the auto-launch effect below) — the choice is implicit: worktree.
	useEffect(() => {
		if (
			open &&
			!existingSessionId &&
			!existingWorktree &&
			!issueContext &&
			projectPath &&
			step === 'project'
		) {
			setStep('launch-mode');
		}
	}, [open, existingSessionId, existingWorktree, issueContext, projectPath, step]);

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
	const fetchIssueContext = useCallback(async (url: string): Promise<IssueContext | null> => {
		const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
		if (!m) {
			issueCtxRef.current = null;
			linkedIssueRef.current = null;
			setIssueLoaded(null);
			return null;
		}
		const [, owner, repo, number] = m;
		setIssueFetching(true);
		try {
			const res = await apiFetch(
				`/api/github/issue?owner=${owner}&repo=${repo}&number=${number}`,
			);
			if (!res.ok) return null;
			const data = await res.json();
			const issue = data.issue;
			if (issue) {
				issueCtxRef.current = `## Contexte de l'issue #${issue.number} : ${issue.title}\n\n${issue.body ?? ''}`;
				setIssueLoaded(`#${issue.number} ${issue.title}`);
				const linked: IssueContext = {
					owner,
					repo,
					issueNumber: issue.number,
					issueTitle: issue.title,
				};
				linkedIssueRef.current = linked;
				return linked;
			}
			return null;
		} catch {
			// silent — context is optional
			return null;
		} finally {
			setIssueFetching(false);
		}
	}, []);

	const composeSystemPrompt = useCallback(
		(personaPrompt?: string | null): string | undefined => {
			const base = personaPrompt || (agentFile ? agentFile.content : '');
			const issueBlock = issueCtxRef.current ? `\n\n${issueCtxRef.current}` : '';
			const effectiveIssue = issueContext ?? linkedIssueRef.current;
			const sourceIssueBlock = effectiveIssue
				? `\n\n## Contexte\nCette session a été ouverte depuis l'issue GitHub ${effectiveIssue.owner}/${effectiveIssue.repo}#${effectiveIssue.issueNumber}${effectiveIssue.issueTitle ? ` : « ${effectiveIssue.issueTitle} »` : ''}.`
				: '';
			return (base + issueBlock + sourceIssueBlock).trim() || undefined;
		},
		[agentFile, issueContext],
	);

	const handleLaunch = useCallback(async () => {
		if (!projectPath) return;
		// Name is optional — fall back to an auto-generated `wip-` name (renamed later
		// from the user's first prompt, in the Workbench).
		const trimmedName = branchInput.trim();
		setWorktreeError(null);

		// When an issue URL is linked, show the "reading issue" step and make sure the
		// issue is actually fetched (and its owner/repo/number/title persisted) before
		// launching. Issue context stays optional — a fetch failure never blocks launch.
		let linked: IssueContext | null = issueContext ?? linkedIssueRef.current;
		const url = issueUrl.trim();
		const match = url.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
		if (match) {
			setLinkingNumber(Number(match[1]));
			setStep('linking-issue');
			linked = linkedIssueRef.current ?? (await fetchIssueContext(url)) ?? linked;
		}

		const name = trimmedName || (linked ? issueBranchName(linked) : randomWorktreeName());

		// Chosen agent (persona): snapshot its settings onto the session. "None" → defaults.
		const persona = selectedPersonaId
			? (personas.find((p) => p.id === selectedPersonaId) ?? null)
			: null;

		try {
			const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
			ensureSession({
				sessionId,
				projectPath,
				projectName,
				agentName:
					persona?.name ?? agentFile?.name ?? (linked ? issueDisplayName(linked) : null),
				branch: name,
				worktreePath: null,
				status: 'provisioning',
				launchMode: 'worktree',
				issueOwner: linked?.owner ?? null,
				issueRepo: linked?.repo ?? null,
				issueNumber: linked?.issueNumber ?? null,
				issueTitle: linked?.issueTitle ?? null,
				systemPrompt: composeSystemPrompt(persona?.system_prompt),
				// Persona → ses réglages (null = défaut serveur, comportement inchangé).
				// Sans persona → les réglages libres choisis dans la modale.
				model: persona ? (persona.model ?? null) : settingsModel,
				effort: persona ? (persona.effort ?? null) : settingsEffort,
				permissionMode: persona ? (persona.permission_mode ?? null) : settingsMode,
				agentColor: persona?.color ?? null,
				personaId: persona?.id ?? null,
			});
			goToWorkbench(sessionId);
		} catch (err) {
			setWorktreeError(err instanceof Error ? err.message : 'Erreur au lancement');
			setStep('branch');
		}
	}, [
		branchInput,
		projectPath,
		sessionId,
		agentFile,
		issueContext,
		issueUrl,
		fetchIssueContext,
		composeSystemPrompt,
		ensureSession,
		goToWorkbench,
		selectedPersonaId,
		personas,
		settingsModel,
		settingsEffort,
		settingsMode,
	]);

	// Launching from an issue: skip the launch-mode cards and go straight to the branch
	// step, where the user picks an agent (or "None") before launching. The branch name
	// is auto-generated in handleLaunch; the Karma rename happens later, on first activity.
	useEffect(() => {
		if (
			open &&
			issueContext &&
			!existingSessionId &&
			!existingWorktree &&
			projectPath &&
			!autoLaunchedRef.current
		) {
			autoLaunchedRef.current = true;
			setStep('agent');
		}
	}, [open, issueContext, existingSessionId, existingWorktree, projectPath]);

	// Mode libre : ni projet, ni branche, ni worktree — l'agent démarre dans le dossier
	// configuré dans les settings, comme un `claude` lancé à la main dans un terminal.
	const handleLaunchFree = useCallback(() => {
		if (!freeModePath) return;
		setWorktreeError(null);
		const persona = selectedPersonaId
			? (personas.find((p) => p.id === selectedPersonaId) ?? null)
			: null;
		try {
			const projectName = freeModePath.split('/').filter(Boolean).pop() ?? 'free';
			ensureSession({
				sessionId,
				projectPath: freeModePath,
				projectName,
				agentName: persona?.name ?? null,
				branch: null,
				worktreePath: null,
				launchMode: 'free',
				issueOwner: null,
				issueRepo: null,
				issueNumber: null,
				issueTitle: null,
				systemPrompt: composeSystemPrompt(persona?.system_prompt),
				model: persona ? (persona.model ?? null) : settingsModel,
				effort: persona ? (persona.effort ?? null) : settingsEffort,
				permissionMode: persona ? (persona.permission_mode ?? null) : settingsMode,
				agentColor: persona?.color ?? null,
				personaId: persona?.id ?? null,
			});
			goToWorkbench(sessionId);
		} catch (err) {
			setWorktreeError(err instanceof Error ? err.message : 'Erreur au lancement');
		}
	}, [
		freeModePath,
		selectedPersonaId,
		personas,
		sessionId,
		composeSystemPrompt,
		ensureSession,
		goToWorkbench,
		settingsModel,
		settingsEffort,
		settingsMode,
	]);

	// Navigation depuis l'étape « Agent » : une persona verrouille les réglages → on
	// saute l'étape Réglages ; « Sans persona » ouvre les réglages libres. En mode
	// libre il n'y a pas d'étape branche : la dernière étape lance directement.
	const handleAgentNext = useCallback(() => {
		if (!selectedPersonaId) {
			setStep('settings');
			return;
		}
		if (launchMode === 'free') {
			handleLaunchFree();
			return;
		}
		setStep('branch');
	}, [selectedPersonaId, launchMode, handleLaunchFree]);

	const handleLaunchExistingBranch = useCallback(() => {
		if (!projectPath || !selectedExistingBranch) return;
		setWorktreeError(null);
		try {
			const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
			ensureSession({
				sessionId,
				projectPath,
				projectName,
				agentName:
					agentFile?.name ?? (issueContext ? issueDisplayName(issueContext) : null),
				branch: selectedExistingBranch.name,
				worktreePath: null,
				status: 'provisioning',
				launchMode: 'existing-branch',
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
		projectPath,
		selectedExistingBranch,
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

	// Navigate from project step to launch-mode step. Le mode est remis à zéro :
	// un aller-retour par le mode libre ne doit pas préselectionner de mode git.
	const handleProjectNext = useCallback(() => {
		if (!selectedProject) return;
		setResolvedPath(selectedProject);
		setLaunchMode(null);
		setStep('launch-mode');
	}, [selectedProject]);

	// Entrée dans le mode libre depuis l'étape projet : aucun projet n'est sélectionné,
	// on enchaîne directement sur le choix de l'agent. Sans dossier configuré, on
	// renvoie vers les settings plutôt que d'offrir une carte morte.
	const handleSelectFreeMode = useCallback(() => {
		if (!freeModePath) {
			router.push('/settings');
			onClose();
			return;
		}
		setSelectedProject(null);
		setResolvedPath(null);
		setLaunchMode('free');
		setStep('agent');
	}, [freeModePath, router, onClose]);

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
					launchMode: 'current-branch',
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
			setStep('agent');
		} else if (launchMode === 'existing-branch') {
			setStep('existing-branch');
		} else if (launchMode === 'current-branch') {
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
			? tl('titleWithIssue', { number: issueContext.issueNumber })
			: existingSessionId
				? tl('activeSession')
				: tl('newSession');

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
										sx={(theme) => ({
											...selectableCardSx(theme, {
												selected: isSelected,
												color: theme.palette.primary.main,
												radius: 1,
												borderWidth: '2px',
											}),
											p: 2.5,
											cursor: 'pointer',
											textAlign: 'center',
										})}
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

					{/* Mode libre — hors projet, hors worktree : l'agent démarre dans le
					    dossier configuré dans les settings. */}
					<Box sx={{ width: '100%', maxWidth: 650 }}>
						<Divider sx={{ mb: 2 }}>
							<Typography variant="caption" sx={{ color: 'text.disabled' }}>
								{tc('or')}
							</Typography>
						</Divider>
						<Box
							onClick={handleSelectFreeMode}
							sx={(theme) => ({
								...selectableCardSx(theme, {
									selected: false,
									color: theme.palette.secondary.main,
									radius: 1,
									borderWidth: '2px',
								}),
								p: 2,
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 2,
								opacity: freeModePath ? 1 : 0.7,
							})}
						>
							<ExploreRoundedIcon sx={{ fontSize: 28, color: 'secondary.main' }} />
							<Box sx={{ minWidth: 0, flex: 1 }}>
								<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
									{tl('freeMode')}
								</Typography>
								<Typography
									variant="body2"
									sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
								>
									{tl('freeModeDesc')}
								</Typography>
								<Typography
									variant="caption"
									sx={{
										display: 'block',
										mt: 0.5,
										color: freeModePath ? 'secondary.main' : 'warning.main',
										fontFamily: freeModePath ? 'monospace' : undefined,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{freeModePath ?? tl('freeModeNoPath')}
								</Typography>
							</Box>
							<ArrowForwardRoundedIcon
								sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }}
							/>
						</Box>
					</Box>
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

					<Box sx={{ display: 'flex', gap: 2, maxWidth: 760, width: '100%' }}>
						{/* Worktree option */}
						<Box
							onClick={() => setLaunchMode('worktree')}
							sx={(theme) => ({
								...launchModeCardSx(theme, launchMode === 'worktree', 'primary'),
								flex: 1,
								p: 3,
							})}
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
								sx={(theme) => ({
									...launchModeCardSx(
										theme,
										launchMode === 'current-branch',
										'secondary',
									),
									flex: 1,
									p: 3,
								})}
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

						{/* Existing branch option */}
						<Tooltip title={tl('existingBranchTooltip')} arrow placement="top">
							<Box
								onClick={() => setLaunchMode('existing-branch')}
								sx={(theme) => ({
									...launchModeCardSx(
										theme,
										launchMode === 'existing-branch',
										'primary',
									),
									flex: 1,
									p: 3,
								})}
							>
								<AltRouteRoundedIcon
									sx={{ fontSize: 36, color: 'primary.main', mb: 1 }}
								/>
								<Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
									{tl('existingBranch')}
								</Typography>
								<Typography
									variant="body2"
									sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
								>
									{tl('existingBranchDesc')}
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

			{/* Step 3: Agent (persona) selection */}
			{step === 'agent' && (
				<Box
					sx={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 3,
						px: 4,
						py: 2,
						overflowY: 'auto',
					}}
				>
					<SmartToyRoundedIcon
						sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }}
					/>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('stepAgent')}
					</Typography>

					<Box sx={{ width: '100%', maxWidth: 820 }}>
						<PersonaCards
							personas={availablePersonas}
							selectedPersonaId={selectedPersonaId}
							onSelect={setSelectedPersonaId}
						/>
					</Box>

					<Box sx={{ display: 'flex', gap: 2 }}>
						<Button
							variant="outlined"
							startIcon={<ArrowBackRoundedIcon />}
							onClick={() => {
								if (issueContext) return onClose();
								setStep(launchMode === 'free' ? 'project' : 'launch-mode');
							}}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{tc('back')}
						</Button>
						<Button
							variant="contained"
							endIcon={
								launchMode === 'free' && selectedPersonaId ? (
									<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />
								) : (
									<ArrowForwardRoundedIcon />
								)
							}
							onClick={handleAgentNext}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								px: 4,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{launchMode === 'free' && selectedPersonaId ? tl('launch') : tc('next')}
						</Button>
					</Box>
				</Box>
			)}

			{/* Step 4: Free settings (model / effort / permissions) — only when "no persona" */}
			{step === 'settings' && (
				<Box
					sx={{
						flex: 1,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 3,
						px: 4,
						py: 2,
						overflowY: 'auto',
					}}
				>
					<TuneRoundedIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('stepSettings')}
					</Typography>

					<Box sx={{ width: '100%', maxWidth: 640 }}>
						<AgentSettingsCards
							model={settingsModel}
							effort={settingsEffort}
							permissionMode={settingsMode}
							onModel={setSettingsModel}
							onEffort={setSettingsEffort}
							onMode={setSettingsMode}
						/>
					</Box>

					<Box sx={{ display: 'flex', gap: 2 }}>
						<Button
							variant="outlined"
							startIcon={<ArrowBackRoundedIcon />}
							onClick={() => setStep('agent')}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{tc('back')}
						</Button>
						<Button
							variant="contained"
							endIcon={
								launchMode === 'free' ? (
									<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />
								) : (
									<ArrowForwardRoundedIcon />
								)
							}
							onClick={() =>
								launchMode === 'free' ? handleLaunchFree() : setStep('branch')
							}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								px: 4,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{launchMode === 'free' ? tl('launch') : tc('next')}
						</Button>
					</Box>
				</Box>
			)}

			{/* Step 5: Branch name input + launch */}
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

					{/* Récap de l'agent / des réglages choisis aux étapes précédentes */}
					<Box
						sx={{
							width: '100%',
							maxWidth: 500,
							display: 'flex',
							flexWrap: 'wrap',
							gap: 0.75,
							justifyContent: 'center',
						}}
					>
						<Chip
							size="small"
							icon={
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										bgcolor: selectedPersona?.color ?? 'text.secondary',
										ml: 1,
									}}
								/>
							}
							label={selectedPersona ? selectedPersona.name : tl('agentNoneName')}
							sx={{ height: 24, fontSize: '0.7rem' }}
						/>
						<Chip
							size="small"
							label={tc(
								MODELS.find(
									(m) =>
										m.value ===
										(selectedPersona
											? (selectedPersona.model ?? 'opus')
											: settingsModel),
								)?.key ?? 'modelOpus',
							)}
							sx={{ height: 24, fontSize: '0.7rem' }}
						/>
						<Chip
							size="small"
							label={tc(
								EFFORTS.find(
									(e) =>
										e.value ===
										(selectedPersona
											? (selectedPersona.effort ?? 'high')
											: settingsEffort),
								)?.key ?? 'effortHigh',
							)}
							sx={{ height: 24, fontSize: '0.7rem' }}
						/>
					</Box>

					{/* F2 — optional GitHub issue for agent context (hidden when launched from an issue) */}
					{!issueContext && (
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
					)}

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
							disabled={!projectPath}
							startIcon={<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />}
							sx={{
								bgcolor: 'primary.main',
								textTransform: 'none',
								fontWeight: 600,
								whiteSpace: 'nowrap',
								height: 40,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{tl('launch')}
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
							onClick={() => setStep(selectedPersonaId ? 'agent' : 'settings')}
							disabled={isCreating}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{tc('back')}
						</Button>
					</Box>
				</Box>
			)}

			{/* Transient step: reading the linked issue before launch */}
			{step === 'linking-issue' && (
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
					<Box sx={{ position: 'relative', display: 'flex' }}>
						<CircularProgress
							size={56}
							thickness={2.5}
							sx={{ color: 'primary.main' }}
						/>
						<DescriptionRoundedIcon
							sx={{
								position: 'absolute',
								top: '50%',
								left: '50%',
								transform: 'translate(-50%, -50%)',
								fontSize: 26,
								color: 'primary.main',
							}}
						/>
					</Box>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('linkingIssueTitle')}
					</Typography>
					<Typography
						variant="body2"
						sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 450 }}
					>
						{tl('linkingIssueDesc', { number: linkingNumber ?? '' })}
					</Typography>
				</Box>
			)}

			{/* Step 3 bis: Select an existing branch (local or remote) */}
			{step === 'existing-branch' && (
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
					<AltRouteRoundedIcon
						sx={{ fontSize: 56, color: 'primary.main', opacity: 0.7 }}
					/>
					<Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
						{tl('selectBranchTitle')}
					</Typography>

					<Box sx={{ width: '100%', maxWidth: 500 }}>
						<Autocomplete
							options={existingBranches}
							loading={branchesLoading}
							value={selectedExistingBranch}
							onChange={(_, v) => setSelectedExistingBranch(v)}
							getOptionLabel={(o) => o.name}
							getOptionDisabled={(o) => o.isCheckedOut === true}
							isOptionEqualToValue={(o, v) => o.name === v.name}
							noOptionsText={tl('noBranchesFound')}
							renderOption={(props, option) => {
								const { key, ...optionProps } = props;
								return (
									<Box component="li" key={key} {...optionProps}>
										<Box
											sx={{
												display: 'flex',
												flexDirection: 'column',
												minWidth: 0,
											}}
										>
											<Typography variant="body2" sx={{ fontWeight: 500 }}>
												{option.name}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'text.secondary' }}
											>
												{option.lastCommitMessage}
											</Typography>
										</Box>
										<Chip
											size="small"
											label={
												option.isRemote
													? tl('branchRemote')
													: tl('branchLocal')
											}
											sx={{ ml: 'auto', height: 20, fontSize: '0.65rem' }}
										/>
									</Box>
								);
							}}
							renderInput={(params) => (
								<TextField
									{...params}
									autoFocus
									size="small"
									placeholder={tl('selectBranchPlaceholder')}
								/>
							)}
						/>
					</Box>

					{worktreeError && (
						<Alert severity="error" sx={{ maxWidth: 500, width: '100%' }}>
							{worktreeError}
						</Alert>
					)}

					<Box sx={{ display: 'flex', gap: 1.5 }}>
						<Button
							variant="outlined"
							startIcon={<ArrowBackRoundedIcon />}
							onClick={() => setStep('launch-mode')}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{tc('back')}
						</Button>
						<Button
							variant="contained"
							disabled={!selectedExistingBranch || !projectPath}
							startIcon={<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />}
							onClick={handleLaunchExistingBranch}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								px: 4,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{tl('launch')}
						</Button>
					</Box>
				</Box>
			)}
		</Dialog>
	);
}
