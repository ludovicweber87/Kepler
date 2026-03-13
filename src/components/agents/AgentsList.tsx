'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AgentTerminalModal from './AgentTerminalModal';
import AgentEditorDialog from './AgentEditorDialog';
import AgentBuilderDialog from './AgentBuilderDialog';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useTranslations } from 'next-intl';
import { useAgentFiles, type AgentFile } from '@/hooks/useAgentFiles';

export default function AgentsList() {
	const t = useTranslations('agents');
	const tc = useTranslations('common');
	const { views, activeIndex, activeView, setActiveIndex, addView, reorderViews } =
		useAgentViews();

	const { agents, isLoading, saveAgent, deleteAgent } = useAgentFiles(activeView?.path ?? null);

	const [terminalOpen, setTerminalOpen] = useState(false);
	const [terminalAgent, setTerminalAgent] = useState<AgentFile | undefined>(undefined);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingAgent, setEditingAgent] = useState<AgentFile | undefined>(undefined);
	const [builderOpen, setBuilderOpen] = useState(false);

	const handleLaunch = (agent?: AgentFile) => {
		setTerminalAgent(agent);
		setTerminalOpen(true);
	};

	const handleEdit = (agent?: AgentFile) => {
		setEditingAgent(agent);
		setEditorOpen(true);
	};

	const handleSaveAgent = (filename: string, content: string) => {
		saveAgent(filename, content);
		setEditorOpen(false);
		setEditingAgent(undefined);
	};

	// No views yet — empty state to add a project
	if (views.length === 0) {
		return (
			<Box sx={{ p: 4, maxWidth: 1000, mx: 'auto' }}>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						mb: 4,
						background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
				</Typography>
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						py: 12,
						gap: 2,
					}}
				>
					<FolderOpenRoundedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
					<Typography variant="h6" color="text.secondary">
						{t('noProjectSelected')}
					</Typography>
					<Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
						{t('selectProjectFolder')}
					</Typography>
					<Button
						variant="outlined"
						startIcon={<AddRoundedIcon />}
						onClick={() => addView()}
						sx={{
							borderColor: 'primary.main',
							color: 'primary.main',
							textTransform: 'none',
							'&:hover': {
								borderColor: 'primary.main',
								bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
							},
						}}
					>
						{t('addProject')}
					</Button>
				</Box>
			</Box>
		);
	}

	return (
		<Box sx={{ p: 4, maxWidth: 1000, mx: 'auto' }}>
			{/* Header */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					mb: 1,
				}}
			>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
				</Typography>
				<Button
					variant="contained"
					size="small"
					startIcon={<AddRoundedIcon />}
					onClick={() => setBuilderOpen(true)}
					sx={{
						bgcolor: 'primary.main',
						'&:hover': { bgcolor: 'primary.dark' },
						borderRadius: 1,
						textTransform: 'none',
						fontWeight: 600,
					}}
				>
					{t('newAgent')}
				</Button>
			</Box>
			<Typography
				variant="body2"
				sx={{ color: 'text.secondary', mb: 3, maxWidth: 640, lineHeight: 1.6 }}
			>
				{t('instruction')}
			</Typography>

			{/* Tabs */}
			<DraggableTabs
				tabs={views.map((v) => v.label)}
				activeTab={activeIndex}
				onTabChange={setActiveIndex}
				onReorder={reorderViews}
				trailing={
					<Tooltip title={t('addProject')}>
						<IconButton
							size="small"
							onClick={() => addView()}
							sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
						>
							<AddRoundedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				}
			/>

			{/* Loading */}
			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
					<CircularProgress size={28} sx={{ color: 'primary.main' }} />
				</Box>
			)}

			{/* Empty state */}
			{!isLoading && agents.length === 0 && (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						py: 12,
						gap: 2,
					}}
				>
					<SmartToyRoundedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
					<Typography variant="h6" color="text.secondary">
						{t('noAgents')}
					</Typography>
					<Typography
						variant="body2"
						color="text.disabled"
						sx={{ mb: 2, textAlign: 'center' }}
					>
						{t('createAgentIn', { path: activeView?.path ?? '' })}
					</Typography>
					<Button
						variant="outlined"
						startIcon={<AddRoundedIcon />}
						onClick={() => setBuilderOpen(true)}
						sx={{
							borderColor: 'primary.main',
							color: 'primary.main',
							textTransform: 'none',
							'&:hover': {
								borderColor: 'primary.main',
								bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
							},
						}}
					>
						{t('createAgent')}
					</Button>
				</Box>
			)}

			{/* Agent cards */}
			{!isLoading && agents.length > 0 && (
				<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
					{agents.map((agent) => (
						<Box
							key={agent.filename}
							onClick={() => handleLaunch(agent)}
							sx={{
								width: {
									xs: '100%',
									sm: 'calc(50% - 10px)',
									md: 'calc(33.333% - 14px)',
								},
								bgcolor: 'background.paper',
								borderRadius: 1,
								border: 1,
								borderColor: 'divider',
								overflow: 'hidden',
								cursor: 'pointer',
								transition: 'transform 0.15s, box-shadow 0.15s',
								'&:hover': {
									transform: 'translateY(-2px)',
									boxShadow: (theme) => `0 8px 24px ${alpha(theme.palette.primary.main, 0.15)}`,
								},
							}}
						>
							<Box sx={{ height: 4, bgcolor: 'primary.main' }} />
							<Box sx={{ p: 2.5 }}>
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1.5,
										mb: 1,
									}}
								>
									<DescriptionRoundedIcon
										sx={{ fontSize: '1.25rem', color: 'primary.main' }}
									/>
									<Typography
										variant="subtitle1"
										sx={{ fontWeight: 700, flex: 1, lineHeight: 1.3 }}
									>
										{agent.name}
									</Typography>
								</Box>

								<Box
									sx={{
										mb: 2,
										display: '-webkit-box',
										WebkitLineClamp: 3,
										WebkitBoxOrient: 'vertical',
										overflow: 'hidden',
										color: 'text.secondary',
										fontSize: '0.8rem',
										lineHeight: 1.5,
										'& p': { m: 0 },
										'& p + p': { mt: 0.5 },
										'& code': {
											fontFamily: '"JetBrains Mono", monospace',
											fontSize: '0.75em',
											bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06),
											px: 0.5,
											borderRadius: 1,
										},
										'& ul, & ol': { pl: 2, my: 0 },
										'& h1, & h2, & h3, & h4, & h5, & h6': {
											fontSize: '0.85rem',
											fontWeight: 600,
											m: 0,
											color: 'text.primary',
										},
									}}
								>
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{agent.content}
									</ReactMarkdown>
								</Box>

								<Box
									sx={{
										display: 'flex',
										justifyContent: 'flex-end',
										gap: 0.5,
									}}
								>
									<Tooltip title={tc('edit')}>
										<IconButton
											size="small"
											onClick={(e) => {
												e.stopPropagation();
												handleEdit(agent);
											}}
											sx={{
												color: 'text.secondary',
												'&:hover': { color: 'primary.main' },
											}}
										>
											<EditRoundedIcon fontSize="small" />
										</IconButton>
									</Tooltip>
									<Tooltip title={tc('delete')}>
										<IconButton
											size="small"
											onClick={(e) => {
												e.stopPropagation();
												deleteAgent(agent.filename);
											}}
											sx={{
												color: 'text.secondary',
												'&:hover': { color: 'error.main' },
											}}
										>
											<DeleteRoundedIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								</Box>
							</Box>
						</Box>
					))}
				</Box>
			)}

			{/* Terminal modal */}
			<AgentTerminalModal
				open={terminalOpen}
				onClose={() => setTerminalOpen(false)}
				projectPath={activeView?.path}
				agentFile={terminalAgent}
			/>

			{/* Editor dialog */}
			<AgentEditorDialog
				open={editorOpen}
				onClose={() => {
					setEditorOpen(false);
					setEditingAgent(undefined);
				}}
				onSave={handleSaveAgent}
				agent={editingAgent}
			/>

			{/* Builder dialog */}
			<AgentBuilderDialog
				open={builderOpen}
				onClose={() => setBuilderOpen(false)}
				onSave={(filename, content) => {
					saveAgent(filename, content);
					setBuilderOpen(false);
				}}
			/>
		</Box>
	);
}
