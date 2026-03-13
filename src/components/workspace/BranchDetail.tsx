'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useBranchLog, type Branch } from '@/hooks/useBranches';
import type { AgentSession } from '@/hooks/useAgentSession';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function useBranchSessions(branch: string) {
	return useQuery({
		queryKey: ['agent-sessions', 'branch', branch],
		queryFn: async () => {
			const { data, error } = await supabase
				.from('agent_sessions')
				.select('*')
				.eq('branch', branch)
				.order('started_at', { ascending: false });
			if (error) throw error;
			return (data ?? []) as AgentSession[];
		},
		enabled: !!branch,
	});
}

interface BranchDetailProps {
	branch: Branch;
	localPath: string | undefined;
	repoFullName: string | undefined;
}

export default function BranchDetail({ branch, localPath, repoFullName: _repoFullName }: BranchDetailProps) {
	const theme = useTheme();
	const { data: commits = [], isLoading: loadingCommits } = useBranchLog(localPath, branch.name);
	const { data: sessions = [], isLoading: loadingSessions } = useBranchSessions(branch.name);
	const [terminalOpen, setTerminalOpen] = useState(false);

	return (
		<>
			{/* Start Agent */}
			<Box sx={{ mb: 3 }}>
				<Button
					variant="contained"
					startIcon={<PlayArrowRoundedIcon />}
					onClick={() => setTerminalOpen(true)}
					sx={{
						bgcolor: theme.palette.primary.main,
						'&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.85) },
						textTransform: 'none',
						fontWeight: 600,
						borderRadius: 1,
					}}
				>
					Start Agent
				</Button>
			</Box>

			{/* Agent sessions on this branch */}
			{!loadingSessions && sessions.length > 0 && (
				<Box sx={{ mb: 4 }}>
					<Typography
						variant="subtitle2"
						sx={{
							fontWeight: 700,
							mb: 1.5,
							color: 'text.secondary',
							fontSize: '0.75rem',
							letterSpacing: 0.5,
							textTransform: 'uppercase',
						}}
					>
						Agent Sessions
					</Typography>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
						{sessions.map((session) => {
							const statusColor =
								session.status === 'active'
									? theme.palette.success.main
									: session.status === 'error'
										? theme.palette.error.main
										: theme.palette.text.disabled;
							return (
								<Box
									key={session.id}
									sx={{
										p: 1.5,
										borderRadius: 1,
										bgcolor: 'background.paper',
										border: 1,
										borderColor: 'divider',
									}}
								>
									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 1,
										}}
									>
										<FiberManualRecordRoundedIcon
											sx={{ fontSize: 8, color: statusColor }}
										/>
										<SmartToyRoundedIcon
											sx={{ fontSize: 14, color: 'text.disabled' }}
										/>
										<Typography
											variant="body2"
											sx={{
												fontWeight: 600,
												fontSize: '0.75rem',
												flex: 1,
											}}
										>
											{session.agent_name ?? 'Claude'}
										</Typography>
										<Chip
											label={session.status}
											size="small"
											sx={{
												height: 18,
												fontSize: '0.6rem',
												fontWeight: 600,
												bgcolor: alpha(statusColor, 0.12),
												color: statusColor,
											}}
										/>
										<Typography
											variant="caption"
											sx={{
												color: 'text.disabled',
												fontSize: '0.6rem',
											}}
										>
											{formatDate(session.started_at)}
										</Typography>
									</Box>
									{session.project_name && (
										<Box
											sx={{
												display: 'flex',
												alignItems: 'center',
												gap: 0.5,
												mt: 0.5,
											}}
										>
											<FolderRoundedIcon
												sx={{ fontSize: 11, color: 'text.disabled' }}
											/>
											<Typography
												variant="caption"
												sx={{
													color: 'text.disabled',
													fontSize: '0.6rem',
												}}
											>
												{session.project_name}
											</Typography>
										</Box>
									)}
								</Box>
							);
						})}
					</Box>
				</Box>
			)}

			{/* Commit log */}
			<Box>
				<Typography
					variant="subtitle2"
					sx={{
						fontWeight: 700,
						mb: 1.5,
						color: 'text.secondary',
						fontSize: '0.75rem',
						letterSpacing: 0.5,
						textTransform: 'uppercase',
					}}
				>
					Commits
				</Typography>

				{loadingCommits && (
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
						<CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
					</Box>
				)}

				{!loadingCommits && commits.length === 0 && (
					<Typography variant="body2" color="text.disabled">
						No commits found
					</Typography>
				)}

				{!loadingCommits && commits.length > 0 && (
					<Box
						sx={{
							borderRadius: 1,
							border: 1,
							borderColor: 'divider',
							overflow: 'hidden',
						}}
					>
						{commits.map((commit, i) => (
							<Box
								key={commit.hash}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 2,
									px: 2,
									py: 1.25,
									borderBottom: i < commits.length - 1 ? 1 : 0,
									borderColor: 'divider',
									transition: 'background-color 0.1s',
									'&:hover': { bgcolor: 'background.paper' },
								}}
							>
								{/* Commit dot */}
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										bgcolor: alpha(theme.palette.primary.main, 0.5),
										flexShrink: 0,
									}}
								/>

								{/* Message — primary info */}
								<Typography
									variant="body2"
									sx={{
										flex: 1,
										fontSize: '0.8rem',
										fontWeight: 500,
										color: 'text.primary',
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										minWidth: 0,
									}}
								>
									{commit.message}
								</Typography>

								{/* Meta — right-aligned */}
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1.5,
										flexShrink: 0,
									}}
								>
									<Typography
										variant="caption"
										sx={{
											color: 'text.secondary',
											fontSize: '0.7rem',
											whiteSpace: 'nowrap',
										}}
									>
										{commit.author}
									</Typography>
									<Typography
										sx={{
											fontFamily: '"JetBrains Mono", monospace',
											fontSize: '0.7rem',
											color: theme.palette.primary.main,
											fontWeight: 600,
											whiteSpace: 'nowrap',
										}}
									>
										{commit.shortHash}
									</Typography>
									<Typography
										variant="caption"
										sx={{
											color: 'text.disabled',
											fontSize: '0.65rem',
											whiteSpace: 'nowrap',
											minWidth: 90,
											textAlign: 'right',
										}}
									>
										{formatDate(commit.date)}
									</Typography>
								</Box>
							</Box>
						))}
					</Box>
				)}
			</Box>

			{/* Agent terminal modal */}
			<AgentTerminalModal
				open={terminalOpen}
				onClose={() => setTerminalOpen(false)}
				projectPath={localPath}
			/>
		</>
	);
}
