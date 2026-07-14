'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import type { ChatToolCall } from '@/types';

function target(call: ChatToolCall): string {
	const inp = (call.input ?? {}) as Record<string, unknown>;
	return String(inp.file_path ?? inp.path ?? inp.command ?? '');
}

function filePath(call: ChatToolCall): string {
	const inp = (call.input ?? {}) as Record<string, unknown>;
	return String(inp.file_path ?? inp.path ?? '');
}

export default function ChatToolCard({
	call,
	onOpen,
}: {
	call: ChatToolCall;
	onOpen?: (filePath: string) => void;
}) {
	return (
		<Box
			onClick={() => onOpen?.(filePath(call))}
			sx={{
				my: 0.5,
				maxWidth: '92%',
				display: 'flex',
				alignItems: 'center',
				gap: 0.75,
				px: 1.25,
				py: 0.75,
				cursor: 'pointer',
				borderRadius: 1.5,
				transition: 'background-color 0.15s',
				'&:hover': { bgcolor: (th) => th.palette.action.hover },
			}}
		>
			<BuildRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
			<Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
				{call.name}
			</Typography>
			<Typography
				variant="caption"
				sx={{
					color: 'text.secondary',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					flex: 1,
				}}
			>
				{target(call)}
			</Typography>
			{call.status === 'running' ? (
				<CircularProgress size={12} />
			) : (
				<CheckRoundedIcon
					sx={{
						fontSize: 14,
						color: call.status === 'error' ? 'error.main' : 'success.main',
					}}
				/>
			)}
		</Box>
	);
}
