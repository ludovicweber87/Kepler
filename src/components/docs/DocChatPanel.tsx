'use client';

import {
	useEffect,
	useRef,
	useState,
	useCallback,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAppSetting } from '@/hooks/useAppSetting';
import ChatBubble from '@/components/agents/chat/ChatBubble';
import ChatPending from '@/components/agents/chat/ChatPending';
import { clampDocChatWidth, parseDocChatWidth, DOC_CHAT_WIDTH_DEFAULT } from '@/lib/docChatWidth';

const QUICK_KEYS = ['shorter', 'examples', 'technical', 'simpler'] as const;

export default function DocChatPanel({
	docId,
	docStatus,
	hasContent,
	editing,
	onDocChanged,
}: {
	docId: string;
	docStatus: string;
	hasContent: boolean;
	editing: boolean;
	onDocChanged: () => void;
}) {
	const t = useTranslations('docs');
	const [input, setInput] = useState('');
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// `save` fait un PUT : on ne l'appelle qu'au relâchement de la souris. Pendant
	// le drag, `dragWidth` porte la valeur locale.
	const { valueOrDefault: storedWidth, save: saveWidth } = useAppSetting(
		'doc_chat_width',
		String(DOC_CHAT_WIDTH_DEFAULT),
	);
	const [dragWidth, setDragWidth] = useState<number | null>(null);
	const width = dragWidth ?? parseDocChatWidth(storedWidth);

	const { messages, status, send, interrupt } = useAgentChat({
		sessionId: `doc-${docId}`,
		cwd: null,
		docId,
		enabled: true,
	});

	// Les outils MCP écrivent la doc côté serveur : on la relit au retour à idle.
	// Un GET par tour, pas de plomberie d'events dédiée.
	const prevStatus = useRef(status);
	useEffect(() => {
		if (prevStatus.current === 'busy' && status === 'idle') onDocChanged();
		prevStatus.current = status;
	}, [status, onDocChanged]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [messages, status]);

	const generating = docStatus === 'queued' || docStatus === 'generating';
	// `setStatus(docId, 'generating')` ne vide pas `content` : sans la condition sur
	// le statut, un « Regénérer » laisserait le composer actif et l'agent pourrait
	// éditer la doc pendant que la génération s'apprête à tout écraser.
	const disabled = !hasContent || generating || editing;
	const disabledReason = editing
		? t('chatDisabledEditing')
		: generating
			? t('chatDisabledGenerating')
			: '';

	const submit = (text: string) => {
		const v = text.trim();
		if (!v || disabled) return;
		send(v);
		setInput('');
	};

	const startResize = useCallback(
		(e: ReactMouseEvent) => {
			e.preventDefault();
			const startX = e.clientX;
			const startWidth = width;
			let last = startWidth;
			// Le panneau est à droite : tirer vers la gauche l'élargit.
			const onMove = (ev: MouseEvent) => {
				last = clampDocChatWidth(startWidth + (startX - ev.clientX));
				setDragWidth(last);
			};
			const onUp = () => {
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
				setDragWidth(null);
				void saveWidth(String(last));
			};
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
		},
		[width, saveWidth],
	);

	return (
		<Box sx={{ display: { xs: 'none', lg: 'flex' } }}>
			<Box
				onMouseDown={startResize}
				sx={{
					width: '4px',
					flexShrink: 0,
					cursor: 'col-resize',
					bgcolor: 'transparent',
					transition: 'background-color 120ms',
					'&:hover': { bgcolor: 'primary.main' },
				}}
			/>
			<Box
				sx={{
					width,
					flexShrink: 0,
					borderLeft: '1px solid',
					borderColor: 'divider',
					display: 'flex',
					flexDirection: 'column',
					bgcolor: 'action.hover',
					minWidth: 0,
				}}
			>
				<Box
					sx={{
						p: 1.5,
						borderBottom: '1px solid',
						borderColor: 'divider',
						display: 'flex',
						alignItems: 'center',
						gap: 1,
					}}
				>
					<AutoAwesomeRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
					<Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
						{t('chatTitle')}
					</Typography>
				</Box>

				<Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', py: 1, minWidth: 0 }}>
					{messages.length === 0 && (
						<Typography
							variant="caption"
							sx={{ color: 'text.disabled', display: 'block', px: 2 }}
						>
							{t('chatEmpty')}
						</Typography>
					)}
					{messages.map((m) => (
						<ChatBubble key={m.id} message={m} />
					))}
					{status === 'busy' && <ChatPending />}
				</Box>

				<Box
					sx={{
						p: 1,
						borderTop: '1px solid',
						borderColor: 'divider',
						display: 'flex',
						flexWrap: 'wrap',
						gap: 0.5,
					}}
				>
					{QUICK_KEYS.map((k) => (
						<Chip
							key={k}
							label={t(`quick.${k}`)}
							size="small"
							variant="outlined"
							onClick={() => submit(t(`quickPrompt.${k}`))}
							disabled={disabled || status === 'busy'}
							sx={{ fontSize: '0.68rem', height: 22 }}
						/>
					))}
				</Box>

				<Tooltip title={disabledReason} placement="top">
					<Box
						sx={{
							p: 1,
							borderTop: '1px solid',
							borderColor: 'divider',
							display: 'flex',
							gap: 0.75,
						}}
					>
						<TextField
							size="small"
							fullWidth
							multiline
							maxRows={6}
							placeholder={t('chatPlaceholder')}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									submit(input);
								}
							}}
							disabled={disabled}
						/>
						{status === 'busy' ? (
							<IconButton color="error" onClick={interrupt}>
								<StopRoundedIcon fontSize="small" />
							</IconButton>
						) : (
							<IconButton
								color="primary"
								onClick={() => submit(input)}
								disabled={disabled || !input.trim()}
							>
								<SendRoundedIcon fontSize="small" />
							</IconButton>
						)}
					</Box>
				</Tooltip>
			</Box>
		</Box>
	);
}
