'use client';
import { useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import { DEFAULT_CREATE_PR_PROMPT } from '@/lib/prompts';
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
	/** Controlled by the parent from the session's DB status. */
	readOnly?: boolean;
	initialModel?: string;
	initialEffort?: string;
	initialMode?: string;
	createPrPrompt?: string;
	onFirstUserMessage?: (text: string) => void;
	onResume?: () => void;
	/** Ouvre l'onglet Changes centré sur le fichier (clic sur une tool card). */
	onOpenChanges?: (filePath: string) => void;
	/** Appelé à la fin d'un tour de l'agent (transition busy → idle). */
	onTurnComplete?: () => void;
	/** Remonte au parent la disponibilité + l'action « Create PR » (rendue dans le header). */
	onCreatePrStateChange?: (state: { available: boolean; trigger: () => void }) => void;
}

export default function AgentChatTab({
	sessionId,
	cwd,
	systemPrompt,
	readOnly = false,
	initialModel,
	initialEffort,
	initialMode,
	createPrPrompt,
	onFirstUserMessage,
	onResume,
	onOpenChanges,
	onTurnComplete,
	onCreatePrStateChange,
}: Props) {
	const t = useTranslations('agentChat');
	const firstSent = useRef(false);
	const prevStatus = useRef<string | null>(null);

	const chat = useAgentChat({
		sessionId,
		cwd,
		systemPrompt,
		enabled: true,
		readOnly,
		model: initialModel ?? 'opus',
		effort: initialEffort ?? 'high',
		permissionMode: initialMode ?? 'bypassPermissions',
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

	// Fin de tour de l'agent (busy → idle) : signale au parent pour rafraîchir le diff.
	useEffect(() => {
		if (prevStatus.current === 'busy' && chat.status === 'idle') onTurnComplete?.();
		prevStatus.current = chat.status;
	}, [chat.status, onTurnComplete]);

	const prPrompt = createPrPrompt || DEFAULT_CREATE_PR_PROMPT;

	const handleSend = (text: string) => {
		if (!firstSent.current) {
			firstSent.current = true;
			onFirstUserMessage?.(text);
		}
		chat.send(text);
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
					/>
				</>
			)}
		</Box>
	);
}
