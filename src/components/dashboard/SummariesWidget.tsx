'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import CircularProgress from '@mui/material/CircularProgress';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
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
	const [expandedId, setExpandedId] = useState<string | null>(null);

	return (
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
						display: 'flex',
						flexDirection: 'column',
						gap: 1,
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
						const isExpanded = expandedId === summary.session_id;
						const label = summary.title ?? summary.agent_name ?? 'Claude';
						const ts = summary.summary_at ?? summary.ended_at ?? summary.started_at;

						return (
							<Box
								key={summary.session_id}
								sx={{
									bgcolor: 'background.default',
									borderRadius: '8px',
									border: 1,
									borderColor: 'divider',
									p: 1.5,
									transition: 'border-color 0.15s',
									'&:hover': {
										borderColor: alpha(theme.palette.divider, 0.5),
									},
								}}
							>
								{/* Header row */}
								<Box
									sx={{
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'center',
										mb: 0.5,
									}}
								>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
										<Box
											sx={{
												width: 6,
												height: 6,
												borderRadius: '50%',
												bgcolor: isError ? 'error.main' : 'success.main',
												flexShrink: 0,
											}}
										/>
										{summary.branch && (
											<Box
												sx={{
													display: 'flex',
													alignItems: 'center',
													gap: 0.25,
												}}
											>
												<AccountTreeRoundedIcon
													sx={{
														fontSize: 10,
														color: 'secondary.main',
													}}
												/>
												<Typography
													sx={{
														fontSize: '0.62rem',
														color: 'secondary.main',
														fontWeight: 600,
														fontFamily: 'monospace',
													}}
												>
													{summary.branch}
												</Typography>
											</Box>
										)}
									</Box>
									<Typography
										sx={{ fontSize: '0.62rem', color: 'text.disabled' }}
									>
										{timeAgo(ts)}
									</Typography>
								</Box>

								{/* Title - clickable to expand */}
								<Box
									onClick={() =>
										setExpandedId(isExpanded ? null : summary.session_id)
									}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 0.5,
										cursor: 'pointer',
										borderRadius: 0.5,
										mx: -0.5,
										px: 0.5,
										py: 0.25,
										'&:hover': {
											bgcolor: alpha(theme.palette.action.hover, 0.5),
										},
									}}
								>
									<Typography
										sx={{
											fontSize: '0.78rem',
											fontWeight: 500,
											flex: 1,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{label}
									</Typography>
									<ExpandMoreRoundedIcon
										sx={{
											fontSize: 16,
											color: 'text.disabled',
											transition: 'transform 0.2s',
											transform: isExpanded
												? 'rotate(180deg)'
												: 'rotate(0deg)',
										}}
									/>
								</Box>

								{/* Preview when collapsed */}
								{!isExpanded && summary.summary && (
									<Typography
										sx={{
											fontSize: '0.68rem',
											color: 'text.disabled',
											mt: 0.25,
											display: '-webkit-box',
											WebkitLineClamp: 2,
											WebkitBoxOrient: 'vertical',
											overflow: 'hidden',
											lineHeight: 1.4,
										}}
									>
										{summary.summary.replace(/[#*`\-]/g, '').slice(0, 150)}
									</Typography>
								)}

								{/* Expanded content */}
								<Collapse in={isExpanded} timeout={200}>
									<Box sx={{ pt: 1 }}>
										{summary.summary ? (
											<Box
												sx={{
													color: 'text.secondary',
													fontSize: '0.75rem',
													lineHeight: 1.7,
													'& p': { m: 0 },
													'& p + p': { mt: 1 },
													'& h2': {
														fontSize: '0.8rem',
														fontWeight: 700,
														color: 'text.primary',
														mt: 1.5,
														mb: 0.5,
													},
													'& h3': {
														fontSize: '0.75rem',
														fontWeight: 600,
														color: 'text.primary',
														mt: 1,
														mb: 0.5,
													},
													'& ul, & ol': { pl: 2.5, my: 0.5 },
													'& li': { fontSize: '0.75rem', mb: 0.25 },
													'& code': {
														fontFamily: '"JetBrains Mono", monospace',
														fontSize: '0.7em',
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
													{summary.summary}
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
										<Typography
											variant="caption"
											onClick={(e) => {
												e.stopPropagation();
												onSessionClick(summary);
											}}
											sx={{
												display: 'inline-block',
												mt: 1,
												color: 'primary.main',
												fontSize: '0.68rem',
												fontWeight: 600,
												cursor: 'pointer',
												'&:hover': { textDecoration: 'underline' },
											}}
										>
											{t('viewSession')} →
										</Typography>
									</Box>
								</Collapse>
							</Box>
						);
					})}
				</Box>
			)}
		</DashboardWidget>
	);
}
