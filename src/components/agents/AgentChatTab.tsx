'use client';
import { useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSession } from '@/hooks/useAgentSession';
import { usePersonas } from '@/hooks/usePersonas';
import { DEFAULT_CREATE_PR_PROMPT, DEFAULT_COMMIT_PUSH_PROMPT } from '@/lib/prompts';
import type { ChatImageInput } from '@/types';
import ChatBubble from './chat/ChatBubble';
import ChatPermissionCard from './chat/ChatPermissionCard';
import ChatQuestionCard from './chat/ChatQuestionCard';
import ChatComposer from './chat/ChatComposer';
import ChatPending from './chat/ChatPending';
import ChatQueued from './chat/ChatQueued';

interface Props {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	/**
	 * Prompt initial auto-envoyé une fois au démarrage d'une session lancée depuis
	 * une issue (le serveur garde-fou « transcript vide » assure l'unicité).
	 */
	initialPrompt?: string;
	/** Controlled by the parent from the session's DB status. */
	readOnly?: boolean;
	initialModel?: string;
	initialEffort?: string;
	initialMode?: string;
	createPrPrompt?: string;
	commitPushPrompt?: string;
	onResume?: () => void;
	/** Ref one-shot armée par le parent au clic « reprendre » : relance le dernier prompt user. */
	resumeRetryRef?: { current: boolean };
	/** Ouvre l'onglet Changes centré sur le fichier (clic sur une tool card). */
	onOpenChanges?: (filePath: string) => void;
	/** Appelé à la fin d'un tour de l'agent (transition busy → idle). */
	onTurnComplete?: () => void;
	/** Remonte au parent la disponibilité + l'action « Create PR » (rendue dans le header). */
	onCreatePrStateChange?: (state: { available: boolean; trigger: () => void }) => void;
	/** Remonte au parent la disponibilité + l'action « Commit and push » (rendue dans le header). */
	onCommitPushStateChange?: (state: { available: boolean; trigger: () => void }) => void;
}

export default function AgentChatTab({
	sessionId,
	cwd,
	systemPrompt,
	initialPrompt,
	readOnly = false,
	initialModel,
	initialEffort,
	initialMode,
	createPrPrompt,
	commitPushPrompt,
	onResume,
	resumeRetryRef,
	onOpenChanges,
	onTurnComplete,
	onCreatePrStateChange,
	onCommitPushStateChange,
}: Props) {
	const t = useTranslations('agentChat');
	const { session, updatePersona } = useAgentSession(sessionId);
	const { personas } = usePersonas();
	const prevStatus = useRef<string | null>(null);

	const chat = useAgentChat({
		sessionId,
		cwd,
		systemPrompt,
		initialPrompt,
		enabled: true,
		readOnly,
		model: initialModel ?? 'opus',
		effort: initialEffort ?? 'high',
		permissionMode: initialMode ?? 'bypassPermissions',
		resumeRetryRef,
	});

	const scrollRef = useRef<HTMLDivElement>(null);
	const didInitialScroll = useRef(false);

	// Nouvelle session (ou réouverture d'un autre chat) : on réarme le scroll initial.
	useEffect(() => {
		didInitialScroll.current = false;
	}, [sessionId]);

	// Ouverture du chat / arrivée de l'historique : scroll forcé tout en bas, une fois.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || didInitialScroll.current || chat.messages.length === 0) return;
		didInitialScroll.current = true;
		requestAnimationFrame(() => {
			const node = scrollRef.current;
			if (node) node.scrollTop = node.scrollHeight;
		});
	}, [chat.messages]);

	// Streaming live : suit le bas seulement si l'utilisateur y est déjà (pas d'arrachage).
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
		if (nearBottom) el.scrollTop = el.scrollHeight;
	}, [chat.messages, chat.pendingPermissions, chat.pendingQuestions, chat.queued]);

	// Question / permission : demande une action → scroll forcé en bas à l'apparition
	// d'un NOUVEL id (indépendant de l'heuristique « près du bas », car la carte est grande).
	const seenPromptIds = useRef<Set<string>>(new Set());
	useEffect(() => {
		const ids = [
			...chat.pendingPermissions.map((p) => p.id),
			...chat.pendingQuestions.map((q) => q.id),
		];
		const hasNew = ids.some((id) => !seenPromptIds.current.has(id));
		seenPromptIds.current = new Set(ids);
		if (!hasNew) return;
		requestAnimationFrame(() => {
			const node = scrollRef.current;
			if (node) node.scrollTop = node.scrollHeight;
		});
	}, [chat.pendingPermissions, chat.pendingQuestions]);

	// Fin de tour de l'agent (busy → idle) : signale au parent pour rafraîchir le diff.
	useEffect(() => {
		if (prevStatus.current === 'busy' && chat.status === 'idle') {
			onTurnComplete?.();
		}
		prevStatus.current = chat.status;
	}, [chat.status, onTurnComplete]);

	const prPrompt = createPrPrompt || DEFAULT_CREATE_PR_PROMPT;
	const commitPrompt = commitPushPrompt || DEFAULT_COMMIT_PUSH_PROMPT;

	const handleSend = (text: string, images?: ChatImageInput[]) => {
		chat.send(text, images);
	};

	// Persona active = persona_id (source de vérité), avec fallback par nom pour les
	// sessions créées avant la colonne persona_id (lecture seule, jamais réécrit).
	const currentPersonaId =
		session?.persona_id ?? personas.find((p) => p.name === session?.agent_name)?.id ?? null;
	const activePersona = personas.find((p) => p.id === currentPersonaId) ?? null;
	// Badge du composer = persona active. Fallback sur le label de session (cas
	// « sans persona » ou legacy). Découplé du nom/couleur affichés dans la sidebar.
	const agentName = activePersona?.name ?? session?.agent_name ?? null;
	const agentColor = activePersona?.color ?? session?.agent_color ?? null;

	// Changement de persona en cours de session : model/effort/mode appliqués en live,
	// puis le system prompt est changé côté serveur via un restart soft (resume →
	// contexte préservé, zéro token consommé, aucun message injecté), puis snapshot
	// persisté sur la session (couleur/nom/prompt survivent au reload).
	const handleSwitchPersona = (personaId: string | null) => {
		// « Sans persona » : on déverrouille les contrôles en gardant les valeurs
		// courantes (model/effort/mode inchangés), on efface le system prompt persona
		// et on persiste la remise à null du snapshot (sticky au reload).
		// On ne touche jamais agent_name / agent_color : ce sont le label et la couleur
		// du worktree affichés dans la sidebar. Seule l'identité de persona (persona_id)
		// et les réglages comportementaux changent.
		if (personaId === null) {
			chat.setSystemPrompt('');
			updatePersona({
				persona_id: null,
				model: chat.model,
				effort: chat.effort,
				permission_mode: chat.permissionMode,
				system_prompt: '',
			});
			return;
		}
		const persona = personas.find((p) => p.id === personaId);
		if (!persona) return;
		chat.setModel(persona.model ?? '');
		chat.setEffort(persona.effort ?? '');
		chat.setPermissionMode(persona.permission_mode ?? '');
		chat.setSystemPrompt(persona.system_prompt ?? '', persona.name);
		updatePersona({
			persona_id: persona.id,
			model: persona.model,
			effort: persona.effort,
			permission_mode: persona.permission_mode,
			system_prompt: persona.system_prompt,
		});
	};

	const busy = chat.status === 'busy';
	const lastRole = chat.messages[chat.messages.length - 1]?.role;
	// Indicateur immédiat tant que l'agent n'a pas commencé à répondre au tour courant.
	const showPending =
		busy &&
		chat.pendingPermissions.length === 0 &&
		chat.pendingQuestions.length === 0 &&
		lastRole !== 'assistant';
	// "Create PR" : l'agent a fini de répondre et il y a eu au moins un échange.
	const canCreatePr = chat.status === 'idle' && chat.messages.length > 0;

	// Le bouton « Create PR » est rendu dans le header du Workbench : on remonte
	// au parent la disponibilité et une action stable (qui lit toujours le dernier send).
	const sendRef = useRef(chat.send);
	sendRef.current = chat.send;
	const triggerCreatePr = useCallback(() => sendRef.current(prPrompt), [prPrompt]);
	useEffect(() => {
		onCreatePrStateChange?.({
			available: !readOnly && canCreatePr,
			trigger: triggerCreatePr,
		});
	}, [readOnly, canCreatePr, triggerCreatePr, onCreatePrStateChange]);

	// "Commit and push" : dispo dès que l'agent est idle (la visibilité selon les
	// changements non commités est gérée côté Workbench via useGitStatus).
	const canCommitPush = chat.status === 'idle';
	const triggerCommitPush = useCallback(() => sendRef.current(commitPrompt), [commitPrompt]);
	useEffect(() => {
		onCommitPushStateChange?.({
			available: !readOnly && canCommitPush,
			trigger: triggerCommitPush,
		});
	}, [readOnly, canCommitPush, triggerCommitPush, onCommitPushStateChange]);

	return (
		<Box
			sx={{
				flex: 1,
				display: 'flex',
				flexDirection: 'column',
				minHeight: 0,
				bgcolor: 'background.default',
			}}
		>
			{chat.reconnecting && (
				<Alert severity="info" icon={<CircularProgress size={16} />} sx={{ m: 1 }}>
					{t('reconnecting')}
				</Alert>
			)}
			{(chat.status === 'error' || chat.status === 'closed') && (
				<Alert
					severity={chat.status === 'error' ? 'error' : 'warning'}
					sx={{ m: 1 }}
					action={
						<Button color="inherit" size="small" onClick={() => chat.reconnect()}>
							{t('reconnect')}
						</Button>
					}
				>
					{chat.status === 'error' ? t('errorBanner') : t('disconnectedBanner')}
				</Alert>
			)}
			<Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
				{chat.messages.map((m) => (
					<ChatBubble key={m.id} message={m} onOpenChanges={onOpenChanges} />
				))}
				{chat.pendingPermissions.map((p) => (
					<ChatPermissionCard key={p.id} perm={p} onDecide={chat.resolvePermission} />
				))}
				{chat.pendingQuestions.map((q) => (
					<ChatQuestionCard key={q.id} question={q} onSubmit={chat.resolveQuestion} />
				))}
				{showPending && <ChatPending />}
				{chat.queued.map((q) => (
					<ChatQueued key={q.id} message={q} onCancel={chat.cancelQueued} />
				))}
			</Box>
			{readOnly ? (
				<Box
					sx={{
						p: 1.5,
						borderTop: 1,
						borderColor: 'divider',
						display: 'flex',
						alignItems: 'center',
						gap: 1.5,
					}}
				>
					<Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
						{t('readOnly')}
					</Typography>
					<Button
						size="small"
						variant="contained"
						startIcon={<PlayArrowRoundedIcon />}
						onClick={() => onResume?.()}
						sx={{ textTransform: 'none' }}
					>
						{t('resume')}
					</Button>
				</Box>
			) : (
				<>
					<ChatComposer
						disabled={
							chat.status === 'connecting' ||
							chat.status === 'closed' ||
							chat.status === 'error'
						}
						busy={busy}
						model={chat.model}
						effort={chat.effort}
						permissionMode={chat.permissionMode}
						onSend={handleSend}
						onStop={chat.interrupt}
						onModel={chat.setModel}
						onEffort={chat.setEffort}
						onMode={chat.setPermissionMode}
						agentColor={agentColor}
						agentName={agentName}
						personas={personas}
						currentPersonaId={currentPersonaId}
						onSwitchPersona={handleSwitchPersona}
					/>
				</>
			)}
		</Box>
	);
}
