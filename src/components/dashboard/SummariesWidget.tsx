'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type AgentSummary } from '@/hooks/useRecentLogs';
import DashboardWidget from './DashboardWidget';

interface SummariesWidgetProps {
	summaries: AgentSummary[];
	isLoading: boolean;
	onSessionClick: (summary: AgentSummary) => void;
	onShowAll?: () => void;
}

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return '<1m';
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

export default function SummariesWidget({
	summaries,
	isLoading,
	onSessionClick,
	onShowAll,
}: SummariesWidgetProps) {
	const theme = useTheme();
	const t = useTranslations('dashboard');
	const [selectedSummary, setSelectedSummary] = useState<AgentSummary | null>(null);

	return (
		<>
			<DashboardWidget
				title={t('summariesTitle')}
				linkText={summaries.length > 0 ? t('showAll') : undefined}
				onLinkClick={onShowAll}
			>
				{isLoading ? (
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
						<CircularProgress size={20} sx={{ color: 'primary.main' }} />
					</Box>
				) : summaries.length === 0 ? (
					<Box
						sx={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							py: 3,
							gap: 1,
						}}
					>
						<SummarizeRoundedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
						<Typography variant="caption" sx={{ color: 'text.disabled' }}>
							{t('noSummaries')}
						</Typography>
					</Box>
				) : (
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: 'repeat(2, 1fr)',
							gap: 1.5,
							flex: 1,
							overflowY: 'auto',
							'&::-webkit-scrollbar': { width: 3 },
							'&::-webkit-scrollbar-thumb': {
								bgcolor: 'divider',
								borderRadius: 1,
							},
						}}
					>
						{summaries.map((summary) => {
							const isError = summary.status === 'error';
							const isSelected = selectedSummary?.session_id === summary.session_id;
							const label = summary.title ?? summary.agent_name ?? 'Claude';
							const ts = summary.summary_at ?? summary.ended_at ?? summary.started_at;

							return (
								<Box
									key={summary.session_id}
									onClick={() => setSelectedSummary(summary)}
									sx={{
										bgcolor: 'background.default',
										borderRadius: '10px',
										border: 1,
										borderColor: isSelected
											? alpha(theme.palette.primary.main, 0.4)
											: 'divider',
										p: 2,
										cursor: 'pointer',
										transition: 'all 0.2s',
										display: 'flex',
										flexDirection: 'column',
										'&:hover': {
											borderColor: alpha(theme.palette.primary.main, 0.3),
											bgcolor: alpha(theme.palette.primary.main, 0.02),
										},
									}}
								>
									{/* Top: status dot + agent name + time */}
									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 1,
											mb: 1,
										}}
									>
										<Box
											sx={{
												width: 32,
												height: 32,
												borderRadius: '8px',
												bgcolor: isError
													? alpha(theme.palette.error.main, 0.12)
													: alpha(theme.palette.success.main, 0.12),
												color: isError ? 'error.main' : 'success.main',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												flexShrink: 0,
											}}
										>
											<SmartToyRoundedIcon sx={{ fontSize: 16 }} />
										</Box>
										<Box sx={{ flex: 1, minWidth: 0 }}>
											<Typography
												sx={{
													fontSize: '0.82rem',
													fontWeight: 600,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{label}
											</Typography>
											<Box
												sx={{
													display: 'flex',
													alignItems: 'center',
													gap: 0.5,
													mt: 0.25,
												}}
											>
												<AccessTimeRoundedIcon
													sx={{ fontSize: 11, color: 'text.disabled' }}
												/>
												<Typography
													sx={{ fontSize: '0.65rem', color: 'text.disabled' }}
												>
													{timeAgo(ts)}
												</Typography>
											</Box>
										</Box>
									</Box>

									{/* Branch chip */}
									{summary.branch && (
										<Chip
											icon={
												<AccountTreeRoundedIcon
													sx={{ fontSize: '12px !important' }}
												/>
											}
											label={summary.branch}
											size="small"
											sx={{
												alignSelf: 'flex-start',
												height: 22,
												fontSize: '0.65rem',
												fontWeight: 500,
												fontFamily: 'monospace',
												bgcolor: alpha(theme.palette.secondary.main, 0.1),
												color: 'secondary.main',
												mb: 1,
												'& .MuiChip-icon': { color: 'secondary.main' },
											}}
										/>
									)}

									{/* Preview */}
									{summary.summary && (
										<Typography
											sx={{
												fontSize: '0.72rem',
												color: 'text.secondary',
												display: '-webkit-box',
												WebkitLineClamp: 2,
												WebkitBoxOrient: 'vertical',
												overflow: 'hidden',
												lineHeight: 1.5,
											}}
										>
											{summary.summary.replace(/[#*`\-]/g, '').slice(0, 150)}
										</Typography>
									)}
								</Box>
							);
						})}
					</Box>
				)}
			</DashboardWidget>

			{/* Report Drawer */}
			<Drawer
				anchor="right"
				open={!!selectedSummary}
				onClose={() => setSelectedSummary(null)}
				PaperProps={{
					sx: {
						width: 480,
						maxWidth: '90vw',
						bgcolor: 'background.paper',
						borderLeft: 1,
						borderColor: 'divider',
					},
				}}
			>
				{selectedSummary && (() => {
					const isError = selectedSummary.status === 'error';
					const label = selectedSummary.title ?? selectedSummary.agent_name ?? 'Claude';
					const ts = selectedSummary.summary_at ?? selectedSummary.ended_at ?? selectedSummary.started_at;

					return (
						<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
							{/* Header */}
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1.5,
									p: 2.5,
									borderBottom: 1,
									borderColor: 'divider',
									flexShrink: 0,
								}}
							>
								<Box
									sx={{
										width: 36,
										height: 36,
										borderRadius: '8px',
										bgcolor: isError
											? alpha(theme.palette.error.main, 0.12)
											: alpha(theme.palette.success.main, 0.12),
										color: isError ? 'error.main' : 'success.main',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										flexShrink: 0,
									}}
								>
									<SmartToyRoundedIcon sx={{ fontSize: 18 }} />
								</Box>
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography
										sx={{
											fontSize: '0.95rem',
											fontWeight: 600,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{label}
									</Typography>
									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 0.5,
											mt: 0.25,
										}}
									>
										<AccessTimeRoundedIcon
											sx={{ fontSize: 12, color: 'text.disabled' }}
										/>
										<Typography
											sx={{ fontSize: '0.7rem', color: 'text.disabled' }}
										>
											{timeAgo(ts)}
										</Typography>
									</Box>
								</Box>
								<IconButton
									onClick={() => setSelectedSummary(null)}
									size="small"
									sx={{ color: 'text.secondary' }}
								>
									<CloseRoundedIcon sx={{ fontSize: 18 }} />
								</IconButton>
							</Box>

							{/* Branch */}
							{selectedSummary.branch && (
								<Box sx={{ px: 2.5, pt: 2 }}>
									<Chip
										icon={
											<AccountTreeRoundedIcon
												sx={{ fontSize: '12px !important' }}
											/>
										}
										label={selectedSummary.branch}
										size="small"
										sx={{
											height: 24,
											fontSize: '0.7rem',
											fontWeight: 500,
											fontFamily: 'monospace',
											bgcolor: alpha(theme.palette.secondary.main, 0.1),
											color: 'secondary.main',
											'& .MuiChip-icon': { color: 'secondary.main' },
										}}
									/>
								</Box>
							)}

							{/* Content */}
							<Box
								sx={{
									flex: 1,
									overflowY: 'auto',
									px: 2.5,
									py: 2,
									'&::-webkit-scrollbar': { width: 4 },
									'&::-webkit-scrollbar-thumb': {
										bgcolor: 'divider',
										borderRadius: 2,
									},
								}}
							>
								{selectedSummary.summary ? (
									<Box
										sx={{
											color: 'text.secondary',
											fontSize: '0.8rem',
											lineHeight: 1.7,
											'& p': { m: 0 },
											'& p + p': { mt: 1 },
											'& h2': {
												fontSize: '0.9rem',
												fontWeight: 700,
												color: 'text.primary',
												mt: 2,
												mb: 0.5,
											},
											'& h3': {
												fontSize: '0.8rem',
												fontWeight: 600,
												color: 'text.primary',
												mt: 1.5,
												mb: 0.5,
											},
											'& ul, & ol': { pl: 2.5, my: 0.5 },
											'& li': { fontSize: '0.8rem', mb: 0.25 },
											'& code': {
												fontFamily: '"JetBrains Mono", monospace',
												fontSize: '0.75em',
												bgcolor: alpha(theme.palette.divider, 0.3),
												px: 0.5,
												py: 0.15,
												borderRadius: 0.5,
											},
											'& pre': {
												bgcolor: 'background.default',
												p: 1.5,
												borderRadius: 1,
												overflow: 'auto',
												my: 1,
											},
											'& pre code': {
												bgcolor: 'transparent',
												p: 0,
											},
										}}
									>
										<ReactMarkdown remarkPlugins={[remarkGfm]}>
											{selectedSummary.summary}
										</ReactMarkdown>
									</Box>
								) : (
									<Typography
										variant="caption"
										sx={{
											color: 'text.disabled',
											fontStyle: 'italic',
										}}
									>
										{isError ? t('sessionError') : t('noReport')}
									</Typography>
								)}
							</Box>

							{/* Footer */}
							<Box
								sx={{
									p: 2.5,
									borderTop: 1,
									borderColor: 'divider',
									flexShrink: 0,
								}}
							>
								<Typography
									variant="caption"
									onClick={() => {
										onSessionClick(selectedSummary);
										setSelectedSummary(null);
									}}
									sx={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 0.5,
										color: 'primary.main',
										fontSize: '0.75rem',
										fontWeight: 600,
										cursor: 'pointer',
										'&:hover': { textDecoration: 'underline' },
									}}
								>
									{t('viewSession')}
									<OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
								</Typography>
							</Box>
						</Box>
					);
				})()}
			</Drawer>
		</>
	);
}
