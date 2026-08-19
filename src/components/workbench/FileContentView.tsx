'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslations } from 'next-intl';
import { useFileContent } from '@/hooks/useFileContent';
import CodeBlock from '@/components/workbench/CodeBlock';

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
			<Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
				<CodeBlock code={data.content} path={path} />
			</Box>
		</Box>
	);
}
