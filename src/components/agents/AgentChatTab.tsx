'use client';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import ChatBubble from './chat/ChatBubble';
import ChatPermissionCard from './chat/ChatPermissionCard';
import ChatComposer from './chat/ChatComposer';

interface Props {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	isPastSession?: boolean;
	initialModel?: string;
	initialEffort?: string;
	initialMode?: string;
	onFirstUserMessage?: (text: string) => void;
}

export default function AgentChatTab({
	sessionId,
	cwd,
	systemPrompt,
	isPastSession,
	initialModel,
	initialEffort,
	initialMode,
	onFirstUserMessage,
}: Props) {
	const t = useTranslations('agentChat');
	// Past session: read-only until user hits "Reprendre".
	const [readOnly, setReadOnly] = useState(!!isPastSession);
	const firstSent = useRef(false);

	const chat = useAgentChat({
		sessionId,
		cwd,
		systemPrompt,
		enabled: true,
		readOnly,
		model: initialModel ?? 'opus',
		effort: initialEffort ?? 'high',
		permissionMode: initialMode ?? 'acceptEdits',
	});

	const scrollRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
		if (nearBottom) el.scrollTop = el.scrollHeight;
	}, [chat.messages, chat.pendingPermissions]);

	const handleSend = (text: string) => {
		if (!firstSent.current) {
			firstSent.current = true;
			onFirstUserMessage?.(text);
		}
		chat.send(text);
	};

	const busy = chat.status === 'busy';
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
						onClick={() => setReadOnly(false)}
						sx={{ textTransform: 'none' }}
					>
						{t('resume')}
					</Button>
				</Box>
			) : (
				<ChatComposer
					disabled={busy}
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
			)}
		</Box>
	);
}
