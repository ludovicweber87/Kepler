'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import type { FileDiff } from '@/lib/gitDiff';

interface ChangedFilesListProps {
	changedFiles: FileDiff[];
	onOpenFile: (filePath: string) => void;
	/** Échec du chargement du diff — à distinguer d'un worktree réellement propre. */
	error?: Error | null;
}

export default function ChangedFilesList({
	changedFiles,
	onOpenFile,
	error,
}: ChangedFilesListProps) {
	const t = useTranslations('agentDiff');

	if (error || changedFiles.length === 0) {
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
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{error ? t('loadError') : t('noChanges')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ height: '100%', overflowY: 'auto', py: 0.5 }}>
			{changedFiles.map((file) => (
				<Box
					key={file.path}
					onClick={() => onOpenFile(file.path)}
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 0.75,
						px: 2,
						py: 0.4,
						cursor: 'pointer',
						transition: 'background-color 0.15s',
						'&:hover': { bgcolor: 'action.hover' },
					}}
				>
					<InsertDriveFileRoundedIcon
						sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }}
					/>
					<Typography
						variant="caption"
						sx={{
							flex: 1,
							minWidth: 0,
							color: 'text.secondary',
							fontSize: '0.72rem',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							direction: 'rtl',
							textAlign: 'left',
						}}
					>
						{file.path}
					</Typography>
					{file.additions > 0 && (
						<Typography
							variant="caption"
							sx={{
								color: 'success.main',
								fontWeight: 700,
								fontFamily: 'monospace',
								fontSize: '0.68rem',
							}}
						>
							+{file.additions}
						</Typography>
					)}
					{file.deletions > 0 && (
						<Typography
							variant="caption"
							sx={{
								color: 'error.main',
								fontWeight: 700,
								fontFamily: 'monospace',
								fontSize: '0.68rem',
							}}
						>
							−{file.deletions}
						</Typography>
					)}
				</Box>
			))}
		</Box>
	);
}
