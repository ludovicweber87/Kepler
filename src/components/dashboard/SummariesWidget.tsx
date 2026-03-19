'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import CircularProgress from '@mui/material/CircularProgress';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
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
	const [expanded, setExpanded] = useState<string | false>(false);

	const handleChange = (sessionId: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
		setExpanded(isExpanded ? sessionId : false);
	};

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
						const label = summary.title ?? summary.agent_name ?? 'Claude';
						const ts = summary.summary_at ?? summary.ended_at ?? summary.started_at;

						return (
							<Accordion
								key={summary.session_id}
								expanded={expanded === summary.session_id}
								onChange={handleChange(summary.session_id)}
								disableGutters
								elevation={0}
								sx={{
									bgcolor: 'transparent',
									'&::before': { display: 'none' },
									borderBottom: 1,
									borderColor: 'divider',
									'&:last-of-type': { borderBottom: 0 },
								}}
							>
								<AccordionSummary
									expandIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />}
									sx={{
										minHeight: 44,
										px: 1.5,
										'& .MuiAccordionSummary-content': {
											my: 0.75,
											alignItems: 'center',
											gap: 1,
											minWidth: 0,
										},
									}}
								>
									<FiberManualRecordRoundedIcon
										sx={{
											fontSize: 8,
											color: isError ? 'error.main' : 'success.main',
											flexShrink: 0,
										}}
									/>
									<SmartToyRoundedIcon
										sx={{
											fontSize: 14,
											color: isError ? 'error.main' : 'text.disabled',
											flexShrink: 0,
										}}
									/>
									<Typography
										sx={{
											fontSize: '0.78rem',
											fontWeight: 600,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
											flex: 1,
											minWidth: 0,
										}}
									>
										{label}
									</Typography>
									{summary.branch && (
										<Chip
											icon={<AccountTreeRoundedIcon sx={{ fontSize: '10px !important' }} />}
											label={summary.branch}
											size="small"
											sx={{
												height: 18,
												fontSize: '0.6rem',
												fontWeight: 500,
												fontFamily: 'monospace',
												bgcolor: alpha(theme.palette.secondary.main, 0.1),
												color: 'secondary.main',
												flexShrink: 0,
												'& .MuiChip-icon': { color: 'secondary.main' },
											}}
										/>
									)}
									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 0.3,
											flexShrink: 0,
											ml: 0.5,
										}}
									>
										<AccessTimeRoundedIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
										<Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
											{timeAgo(ts)}
										</Typography>
									</Box>
								</AccordionSummary>
								<AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
									{summary.summary ? (
										<Box
											sx={{
												color: 'text.secondary',
												fontSize: '0.78rem',
												lineHeight: 1.7,
												'& p': { m: 0 },
												'& p + p': { mt: 1 },
												'& h2': {
													fontSize: '0.85rem',
													fontWeight: 700,
													color: 'text.primary',
													mt: 1.5,
													mb: 0.5,
												},
												'& h3': {
													fontSize: '0.78rem',
													fontWeight: 600,
													color: 'text.primary',
													mt: 1,
													mb: 0.5,
												},
												'& ul, & ol': { pl: 2.5, my: 0.5 },
												'& li': { fontSize: '0.78rem', mb: 0.25 },
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
												{summary.summary}
											</ReactMarkdown>
										</Box>
									) : (
										<Typography
											variant="caption"
											sx={{ color: 'text.disabled', fontStyle: 'italic' }}
										>
											{isError ? t('sessionError') : t('noReport')}
										</Typography>
									)}
									{/* View session link */}
									<Typography
										variant="caption"
										onClick={(e) => {
											e.stopPropagation();
											onSessionClick(summary);
										}}
										sx={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 0.5,
											color: 'primary.main',
											fontSize: '0.7rem',
											fontWeight: 600,
											cursor: 'pointer',
											mt: 1.5,
											'&:hover': { textDecoration: 'underline' },
										}}
									>
										{t('viewSession')}
										<OpenInNewRoundedIcon sx={{ fontSize: 12 }} />
									</Typography>
								</AccordionDetails>
							</Accordion>
						);
					})}
				</Box>
			)}
		</DashboardWidget>
	);
}
