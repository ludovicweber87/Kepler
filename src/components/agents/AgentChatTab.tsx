'use client';
import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import CallMergeRoundedIcon from '@mui/icons-material/CallMergeRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAppSetting } from '@/hooks/useAppSetting';
import { CREATE_PR_PROMPT_KEY, DEFAULT_CREATE_PR_PROMPT } from '@/lib/prompts';
import ChatBubble from './chat/ChatBubble';
import ChatPermissionCard from './chat/ChatPermissionCard';
import ChatComposer from './chat/ChatComposer';
import ChatPending from './chat/ChatPending';

interface Props {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	/** Controlled by the parent from the session's DB status. */
	readOnly?: boolean;
	/** Archived sessions are read-only with no "Reprendre" (resume) affordance. */
	archived?: boolean;
	initialModel?: string;
	initialEffort?: string;
	initialMode?: string;
	onFirstUserMessage?: (text: string) => void;
	onResume?: () => void;
}

export default function AgentChatTab({
	sessionId,
	cwd,
	systemPrompt,
	readOnly = false,
	archived = false,
	initialModel,
	initialEffort,
	initialMode,
	onFirstUserMessage,
	onResume,
}: Props) {
	const t = useTranslations('agentChat');
	const firstSent = useRef(false);

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
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
		if (nearBottom) el.scrollTop = el.scrollHeight;
	}, [chat.messages, chat.pendingPermissions]);

	const { valueOrDefault: createPrPrompt } = useAppSetting(
		CREATE_PR_PROMPT_KEY,
		DEFAULT_CREATE_PR_PROMPT,
	);

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
	const showPending = busy && chat.pendingPermissions.length === 0 && lastRole !== 'assistant';
	// "Create PR" : l'agent a fini de répondre et il y a eu au moins un échange.
	const canCreatePr = chat.status === 'idle' && chat.messages.length > 0;
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
					<ChatBubble key={m.id} message={m} />
				))}
				{chat.pendingPermissions.map((p) => (
					<ChatPermissionCard key={p.id} perm={p} onDecide={chat.resolvePermission} />
				))}
				{showPending && <ChatPending />}
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
						{archived ? t('archivedReadOnly') : t('readOnly')}
					</Typography>
					{!archived && (
						<Button
							size="small"
							variant="contained"
							startIcon={<PlayArrowRoundedIcon />}
							onClick={() => onResume?.()}
							sx={{ textTransform: 'none' }}
						>
							{t('resume')}
						</Button>
					)}
				</Box>
			) : (
				<>
					{canCreatePr && (
						<Box
							sx={{
								px: 1.5,
								pt: 1,
								display: 'flex',
								justifyContent: 'flex-end',
							}}
						>
							<Button
								size="small"
								variant="outlined"
								startIcon={<CallMergeRoundedIcon sx={{ fontSize: 16 }} />}
								onClick={() => chat.send(createPrPrompt)}
								sx={{ textTransform: 'none', borderRadius: 999 }}
							>
								{t('createPr')}
							</Button>
						</Box>
					)}
					<ChatComposer
						disabled={chat.status !== 'idle'}
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
