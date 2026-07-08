'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import { alpha, useTheme } from '@mui/material/styles';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useActiveSessions } from '@/hooks/useActiveSessions';
import { useAgentSummaries, type AgentSummary } from '@/hooks/useRecentLogs';

function SectionLabel({ text, count }: { text: string; count: number }) {
	return (
		<Typography
			variant="caption"
			sx={{
				display: 'block',
				mb: 1.25,
				color: 'text.disabled',
				fontWeight: 700,
				textTransform: 'uppercase',
				letterSpacing: 1,
			}}
		>
			{text} — {count}
		</Typography>
	);
}

export default function WorkersView() {
	const theme = useTheme();
	const t = useTranslations('workers');
	const { data: active = [] } = useActiveSessions();
	const { data: summaries = [] } = useAgentSummaries();

	return (
		<Box sx={{ maxWidth: 860, mx: 'auto' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
				<EngineeringRoundedIcon sx={{ color: 'primary.main' }} />
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
				</Typography>
			</Box>

			{/* Live workers */}
			{active.length > 0 && (
				<Box sx={{ mb: 4 }}>
					<SectionLabel text={t('inProgress')} count={active.length} />
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
						{active.map((s) => (
							<Box
								key={s.sessionId}
								sx={{
									p: 1.5,
									borderRadius: 1,
									border: 1,
									borderColor: alpha(theme.palette.success.main, 0.2),
									bgcolor: alpha(theme.palette.success.main, 0.05),
									display: 'flex',
									alignItems: 'center',
									gap: 1,
								}}
							>
								<FiberManualRecordRoundedIcon
									sx={{
										fontSize: 10,
										color: 'success.main',
										...(s.isStreaming && {
											animation: 'workerPulse 2s ease-in-out infinite',
											'@keyframes workerPulse': {
												'0%,100%': { opacity: 0.4 },
												'50%': { opacity: 1 },
											},
										}),
									}}
								/>
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography variant="body2" sx={{ fontWeight: 600 }}>
										{s.branch ?? s.agentName ?? s.projectName}
									</Typography>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
										<FolderRoundedIcon
											sx={{ fontSize: 12, color: 'text.disabled' }}
										/>
										<Typography
											variant="caption"
											sx={{ color: 'text.secondary' }}
										>
											{s.projectName}
										</Typography>
									</Box>
								</Box>
								<Chip
									label={t('kpiActive')}
									size="small"
									sx={{
										height: 20,
										fontSize: '0.65rem',
										fontWeight: 600,
										bgcolor: alpha(theme.palette.success.main, 0.12),
										color: 'success.main',
									}}
								/>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* History */}
			{summaries.length > 0 ? (
				<Box>
					<SectionLabel text={t('history')} count={summaries.length} />
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
						{summaries.map((s) => (
							<HistoryItem key={s.session_id} summary={s} />
						))}
					</Box>
				</Box>
			) : (
				active.length === 0 && (
					<Box
						sx={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							py: 10,
							gap: 1.5,
						}}
					>
						<EngineeringRoundedIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
						<Typography variant="body1" color="text.secondary">
							{t('none')}
						</Typography>
					</Box>
				)
			)}
		</Box>
	);
}

function HistoryItem({ summary }: { summary: AgentSummary }) {
	const theme = useTheme();
	const [open, setOpen] = useState(false);
	const isError = summary.status === 'error';
	const statusColor = isError ? theme.palette.error.main : theme.palette.text.secondary;
	const date = new Date(summary.ended_at ?? summary.started_at).toLocaleDateString();

	return (
		<Box
			sx={{
				borderRadius: 1,
				border: 1,
				borderColor: 'divider',
				bgcolor: 'background.paper',
				opacity: 0.9,
			}}
		>
			<Box
				onClick={() => summary.summary && setOpen((v) => !v)}
				sx={{
					p: 1.5,
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					cursor: summary.summary ? 'pointer' : 'default',
				}}
			>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="body2" sx={{ fontWeight: 600 }}>
						{summary.title ??
							summary.agent_name ??
							summary.branch ??
							summary.project_name}
					</Typography>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
						<Typography variant="caption" sx={{ color: 'text.disabled' }}>
							{summary.project_name} · {date}
						</Typography>
					</Box>
				</Box>
				<Chip
					label={summary.status}
					size="small"
					sx={{
						height: 20,
						fontSize: '0.65rem',
						fontWeight: 600,
						bgcolor: alpha(statusColor, 0.12),
						color: statusColor,
					}}
				/>
				{summary.summary && (
					<ExpandMoreRoundedIcon
						sx={{
							fontSize: 18,
							color: 'text.disabled',
							transform: open ? 'rotate(180deg)' : 'none',
							transition: 'transform 0.15s',
						}}
					/>
				)}
			</Box>
			{summary.summary && (
				<Collapse in={open} unmountOnExit>
					<Typography
						variant="caption"
						component="pre"
						sx={{
							px: 2,
							pb: 2,
							m: 0,
							whiteSpace: 'pre-wrap',
							fontFamily: 'inherit',
							color: 'text.secondary',
							lineHeight: 1.6,
						}}
					>
						{summary.summary}
					</Typography>
				</Collapse>
			)}
		</Box>
	);
}
