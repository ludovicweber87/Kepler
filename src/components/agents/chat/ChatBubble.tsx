'use client';
import { memo, useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import ChatThinking from './ChatThinking';
import ChatToolCard from './ChatToolCard';
import ImageLightbox from '@/components/shared/ImageLightbox';
import FileChip from '@/components/shared/FileChip';
import { getAgentHttpUrl } from '@/lib/local-fetch';
import type { ChatMessage } from '@/types';

function ChatBubble({
	message,
	onOpenChanges,
}: {
	message: ChatMessage;
	onOpenChanges?: (filePath: string) => void;
}) {
	const t = useTranslations('agentChat');
	const [zoomed, setZoomed] = useState<{ src: string; name: string } | null>(null);
	const isUser = message.role === 'user';

	if (message.role === 'system') {
		const seg = message.segments.find((s) => s.kind === 'role_switch');
		if (seg?.kind !== 'role_switch') return null;
		return (
			<Box sx={{ px: 3, py: 1 }}>
				<Divider
					sx={{
						'&::before, &::after': { borderColor: 'divider' },
						color: 'text.secondary',
						fontSize: '0.7rem',
						fontWeight: 600,
					}}
				>
					🔄 {t('roleSwitch', { name: seg.name })}
				</Divider>
			</Box>
		);
	}

	return (
		<Box
			sx={{
				display: 'flex',
				justifyContent: isUser ? 'flex-end' : 'flex-start',
				px: 2,
				py: 1.25,
			}}
		>
			<Box
				sx={{
					maxWidth: isUser ? '78%' : '92%',
					px: 1.5,
					py: 1,
					borderRadius: 2,
					...(isUser ? { borderBottomLeftRadius: 0 } : { borderBottomRightRadius: 0 }),
					bgcolor: isUser ? 'primary.main' : 'background.paper',
					color: isUser ? 'primary.contrastText' : 'text.primary',
					fontSize: '0.8rem',
					lineHeight: 1.5,
					'& p': { m: 0 },
					'& pre': {
						overflowX: 'auto',
						bgcolor: 'background.default',
						p: 1,
						borderRadius: 1,
					},
					...(isUser && {
						'& a': {
							color: 'primary.contrastText',
							textDecoration: 'underline',
						},
					}),
				}}
			>
				{message.segments.map((seg, i) => {
					if (seg.kind === 'thinking') return <ChatThinking key={i} text={seg.text} />;
					if (seg.kind === 'tool')
						return <ChatToolCard key={i} call={seg.call} onOpen={onOpenChanges} />;
					if (seg.kind === 'image') {
						const src = getAgentHttpUrl() + seg.url;
						return (
							<Box
								component="img"
								key={i}
								src={src}
								alt={seg.name}
								onClick={() => setZoomed({ src, name: seg.name })}
								sx={{
									display: 'block',
									// Largeur fixe et généreuse : l'aperçu doit être lisible
									// sans clic, le clic servant à voir l'image en grand.
									width: 320,
									maxWidth: '100%',
									maxHeight: 360,
									objectFit: 'contain',
									borderRadius: 1,
									mt: 0.5,
									cursor: 'zoom-in',
									transition: 'opacity 120ms',
									'&:hover': { opacity: 0.85 },
								}}
							/>
						);
					}
					if (seg.kind === 'file')
						return (
							<FileChip
								key={i}
								name={seg.name}
								mediaType={seg.mediaType}
								href={getAgentHttpUrl() + seg.url}
							/>
						);
					if (seg.kind === 'role_switch') return null;
					return (
						<ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
							{seg.text}
						</ReactMarkdown>
					);
				})}
			</Box>
			<ImageLightbox
				src={zoomed?.src ?? null}
				alt={zoomed?.name}
				onClose={() => setZoomed(null)}
			/>
		</Box>
	);
}

/**
 * Mémoïsé : le reducer ne recrée que la bulle touchée par un événement. Sans
 * `memo`, chaque token de streaming repeindrait tout le transcript et son
 * markdown, ce qui coûterait plus cher que ce que le streaming fait gagner.
 */
export default memo(ChatBubble);
