'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslations } from 'next-intl';
import { useFileContent } from '@/hooks/useFileContent';

const FONT = '"JetBrains Mono", monospace';

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100%',
				px: 2,
			}}
		>
			{children}
		</Box>
	);
}

export default function FileContentView({ cwd, path }: { cwd: string | null; path: string }) {
	const t = useTranslations('workbench');
	const { data, isLoading, error } = useFileContent(cwd, path);

	if (isLoading) {
		return (
			<Centered>
				<CircularProgress size={18} />
			</Centered>
		);
	}

	if (error || !data) {
		return (
			<Centered>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('fileError')}
				</Typography>
			</Centered>
		);
	}

	const lines = data.content.split('\n');
	const gutter = lines.map((_, i) => i + 1).join('\n');

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			{data.truncated && (
				<Typography
					variant="caption"
					sx={{
						px: 1.5,
						py: 0.5,
						color: 'warning.main',
						borderBottom: 1,
						borderColor: 'divider',
						flexShrink: 0,
					}}
				>
					{t('fileTruncated')}
				</Typography>
			)}
			<Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex' }}>
				<Typography
					component="pre"
					sx={{
						m: 0,
						px: 1,
						py: 1,
						textAlign: 'right',
						userSelect: 'none',
						color: 'text.disabled',
						fontFamily: FONT,
						fontSize: '0.78rem',
						lineHeight: 1.5,
						borderRight: 1,
						borderColor: 'divider',
						flexShrink: 0,
					}}
				>
					{gutter}
				</Typography>
				<Typography
					component="pre"
					sx={{
						m: 0,
						px: 1.5,
						py: 1,
						flex: 1,
						color: 'text.primary',
						fontFamily: FONT,
						fontSize: '0.78rem',
						lineHeight: 1.5,
						whiteSpace: 'pre',
					}}
				>
					{data.content}
				</Typography>
			</Box>
		</Box>
	);
}
