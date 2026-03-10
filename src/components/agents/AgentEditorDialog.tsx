'use client';

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { alpha } from '@mui/material/styles';
import type { AgentFile } from '@/hooks/useAgentFiles';

interface AgentEditorDialogProps {
	open: boolean;
	onClose: () => void;
	onSave: (filename: string, content: string) => void;
	agent?: AgentFile;
}

export default function AgentEditorDialog({
	open,
	onClose,
	onSave,
	agent,
}: AgentEditorDialogProps) {
	const [filename, setFilename] = useState('');
	const [content, setContent] = useState('');

	useEffect(() => {
		if (open) {
			if (agent) {
				setFilename(agent.name);
				setContent(agent.content);
			} else {
				setFilename('');
				setContent('');
			}
		}
	}, [open, agent]);

	const canSave = filename.trim() !== '' && content.trim() !== '';

	const handleSave = () => {
		const safeName = filename.trim().replace(/\s+/g, '-').toLowerCase();
		onSave(safeName, content);
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="md"
			fullWidth
			PaperProps={{
				sx: {
					borderRadius: 1,
					bgcolor: 'background.paper',
					height: '70vh',
					display: 'flex',
					flexDirection: 'column',
				},
			}}
		>
			<DialogTitle sx={{ fontWeight: 600 }}>
				{agent ? `Edit — ${agent.name}.md` : 'New Agent'}
			</DialogTitle>
			<DialogContent
				sx={{
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
					pt: '8px !important',
					flex: 1,
					minHeight: 0,
				}}
			>
				{!agent && (
					<TextField
						label="Filename"
						value={filename}
						onChange={(e) => setFilename(e.target.value)}
						required
						fullWidth
						placeholder="e.g. code-reviewer"
						helperText="Will be saved as .claude/agents/{name}.md"
						size="small"
						sx={{ flexShrink: 0 }}
					/>
				)}

				<TextField
					label="Agent Prompt"
					value={content}
					onChange={(e) => setContent(e.target.value)}
					required
					fullWidth
					multiline
					rows={undefined}
					placeholder="Write the agent system prompt in markdown..."
					sx={{
						flex: 1,
						minHeight: 0,
						display: 'flex',
						flexDirection: 'column',
						'& .MuiInputBase-root': {
							flex: 1,
							alignItems: 'stretch',
							fontFamily: '"JetBrains Mono", "Fira Code", monospace',
							fontSize: '0.85rem',
							overflow: 'hidden',
						},
						'& textarea': {
							overflow: 'auto !important',
							height: '100% !important',
							resize: 'none',
						},
					}}
				/>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button onClick={onClose} sx={{ color: 'text.secondary' }}>
					Cancel
				</Button>
				<Button
					onClick={handleSave}
					variant="contained"
					disabled={!canSave}
					sx={{
						bgcolor: '#7C5CFF',
						'&:hover': { bgcolor: alpha('#7C5CFF', 0.85) },
					}}
				>
					Save
				</Button>
			</DialogActions>
		</Dialog>
	);
}
