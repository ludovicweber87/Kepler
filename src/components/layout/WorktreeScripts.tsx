'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useRepoScripts } from '@/hooks/useRepoScripts';
import { useScriptRunner } from '@/hooks/useScriptRunner';
import { visibleScripts } from '@/lib/repoScripts';
import { appInsetShadow } from '@/theme/shadows';

interface WorktreeScriptsProps {
	repoFullName: string | null;
	sessionId: string;
}

/**
 * Bloc « Dans ce worktree » de la topbar : un bouton par script du repo courant.
 * Ne s'affiche qu'aux côtés de l'EditorPicker, donc uniquement sur /workbench avec
 * une session active — le Workbench est forcément monté et consommera l'action.
 */
export default function WorktreeScripts({ repoFullName, sessionId }: WorktreeScriptsProps) {
	const theme = useTheme();
	const t = useTranslations('header');
	const { scripts } = useRepoScripts(repoFullName);
	const { run } = useScriptRunner();

	const shown = visibleScripts(scripts);
	if (shown.length === 0) return null;

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 0.75,
				px: 1,
				py: 0.5,
				borderRadius: 2,
				maxWidth: 340,
				overflowX: 'auto',
				bgcolor: alpha(
					theme.palette.common.black,
					theme.palette.mode === 'dark' ? 0.22 : 0.05,
				),
				boxShadow: appInsetShadow(theme.palette.mode),
				scrollbarWidth: 'none',
				'&::-webkit-scrollbar': { display: 'none' },
			}}
		>
			<Typography
				variant="caption"
				sx={{ color: 'text.disabled', whiteSpace: 'nowrap', pr: 0.5, flexShrink: 0 }}
			>
				{t('inThisWorktree')}
			</Typography>

			{shown.map((script) => (
				<Tooltip key={script.id} title={script.script} arrow>
					<Button
						size="small"
						variant="text"
						startIcon={
							script.run_mode === 'chat' ? (
								<ChatBubbleOutlineRoundedIcon
									sx={{ fontSize: '14px !important' }}
								/>
							) : (
								<TerminalRoundedIcon sx={{ fontSize: '14px !important' }} />
							)
						}
						onClick={() =>
							run({
								sessionId,
								mode: script.run_mode,
								name: script.name,
								script: script.script,
							})
						}
						sx={{
							textTransform: 'none',
							minWidth: 0,
							flexShrink: 0,
							px: 1,
							py: 0.25,
							fontSize: '0.7rem',
							color: 'text.secondary',
							'&:hover': { color: 'primary.main' },
						}}
					>
						{script.name}
					</Button>
				</Tooltip>
			))}
		</Box>
	);
}
