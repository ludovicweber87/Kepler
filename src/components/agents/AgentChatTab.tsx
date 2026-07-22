'use client';
import { useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSession } from '@/hooks/useAgentSession';
import { usePersonas } from '@/hooks/usePersonas';
import { DEFAULT_CREATE_PR_PROMPT, DEFAULT_COMMIT_PUSH_PROMPT } from '@/lib/prompts';
import { buildPersonaSwitchMessage } from '@/lib/personaSwitch';
import type { ChatImageInput, ChatSegment } from '@/types';
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
	onFirstUserMessage?: (text: string) => void;
	/**
	 * Appelé une seule fois, à la fin du PREMIER tour agent (busy → idle) : fournit la
	 * demande initiale de l'utilisateur + la réponse de l'agent, pour synthétiser un nom
	 * de branche à partir d'un contexte complet plutôt que du seul premier message.
	 */
	onFirstTurnComplete?: (userText: string, assistantText: string) => void;
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
	onFirstUserMessage,
	onFirstTurnComplete,
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
	const firstSent = useRef(false);
	const firstUserText = useRef('');
	const firstTurnDone = useRef(false);
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

	// Toujours à jour sans re-déclencher l'effet de fin de tour (lecture au moment T).
	// Déclaré avant l'effet fin-de-tour → exécuté avant lui sur un même commit.
	const messagesRef = useRef(chat.messages);
	useEffect(() => {
		messagesRef.current = chat.messages;
	}, [chat.messages]);

	// Fin de tour de l'agent (busy → idle) : signale au parent pour rafraîchir le diff,
	// et — au tout premier tour seulement — remonte demande + réponse pour le renommage.
	useEffect(() => {
		if (prevStatus.current === 'busy' && chat.status === 'idle') {
			onTurnComplete?.();
			if (!firstTurnDone.current && firstUserText.current) {
				firstTurnDone.current = true;
				const assistantText = (
					messagesRef.current.filter((m) => m.role === 'assistant').at(-1)?.segments ?? []
				)
					.filter((s): s is Extract<ChatSegment, { kind: 'text' }> => s.kind === 'text')
					.map((s) => s.text)
					.join('\n')
					.trim();
				onFirstTurnComplete?.(firstUserText.current, assistantText);
			}
		}
		prevStatus.current = chat.status;
	}, [chat.status, onTurnComplete, onFirstTurnComplete]);

	const prPrompt = createPrPrompt || DEFAULT_CREATE_PR_PROMPT;
	const commitPrompt = commitPushPrompt || DEFAULT_COMMIT_PUSH_PROMPT;

	const handleSend = (text: string, images?: ChatImageInput[]) => {
		if (!firstSent.current) {
			firstSent.current = true;
			firstUserText.current = text;
			onFirstUserMessage?.(text);
		}
		chat.send(text, images);
	};

	const agentColor = session?.agent_color ?? null;
	const agentName = session?.agent_name ?? null;
	const currentPersonaId = personas.find((p) => p.name === agentName)?.id ?? null;

	// Changement de persona en cours de session : model/effort/mode appliqués en live,
	// puis directive injectée dans la conversation (le SDK ne change pas le prompt à chaud),
	// puis snapshot persisté sur la session (couleur/nom/prompt survivent au reload).
	const handleSwitchPersona = (personaId: string) => {
		const persona = personas.find((p) => p.id === personaId);
		if (!persona) return;
		chat.setModel(persona.model ?? '');
		chat.setEffort(persona.effort ?? '');
		chat.setPermissionMode(persona.permission_mode ?? '');
		chat.send(buildPersonaSwitchMessage(persona));
		updatePersona({
			agent_name: persona.name,
			agent_color: persona.color,
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
			{chat.status === 'error' && (
				<Alert
					severity="error"
					sx={{ m: 1 }}
					action={
						<Button color="inherit" size="small" onClick={() => chat.reconnect()}>
							{t('reconnect')}
						</Button>
					}
				>
					{t('errorBanner')}
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
