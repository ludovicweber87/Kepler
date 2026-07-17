'use client';
import Box from '@mui/material/Box';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatThinking from './ChatThinking';
import ChatToolCard from './ChatToolCard';
import { getAgentHttpUrl } from '@/lib/local-fetch';
import type { ChatMessage } from '@/types';

export default function ChatBubble({
	message,
	onOpenChanges,
}: {
	message: ChatMessage;
	onOpenChanges?: (filePath: string) => void;
}) {
	const isUser = message.role === 'user';
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
					px: isUser ? 1.5 : 0,
					py: isUser ? 1 : 0,
					borderRadius: 2,
					bgcolor: isUser ? 'primary.main' : 'transparent',
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
								onClick={() => window.open(src, '_blank')}
								sx={{
									display: 'block',
									maxWidth: 180,
									maxHeight: 180,
									borderRadius: 1,
									mt: 0.5,
									cursor: 'pointer',
								}}
							/>
						);
					}
					return isUser ? (
						<span key={i}>{seg.text}</span>
					) : (
						<ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
							{seg.text}
						</ReactMarkdown>
					);
				})}
			</Box>
		</Box>
	);
}
