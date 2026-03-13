'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import type { AgentPreset } from '@/types';

const COLOR_OPTIONS = [
	'#7C5CFF', // violet
	'#00E5FF', // cyan
	'#4CAF50', // vert
	'#FF9800', // orange
	'#F44336', // rouge
	'#2196F3', // bleu
];

interface AgentFormDialogProps {
	open: boolean;
	onClose: () => void;
	onSave: (preset: Omit<AgentPreset, 'id' | 'created_at'> & { id?: string }) => void;
	preset?: AgentPreset;
}

export default function AgentFormDialog({ open, onClose, onSave, preset }: AgentFormDialogProps) {
	const t = useTranslations('agentForm');
	const tc = useTranslations('common');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [promptTemplate, setPromptTemplate] = useState('');
	const [icon, setIcon] = useState('🤖');
	const [color, setColor] = useState(COLOR_OPTIONS[0]);

	useEffect(() => {
		if (open) {
			if (preset) {
				setName(preset.name);
				setDescription(preset.description);
				setPromptTemplate(preset.prompt_template);
				setIcon(preset.icon);
				setColor(preset.color);
			} else {
				setName('');
				setDescription('');
				setPromptTemplate('');
				setIcon('🤖');
				setColor(COLOR_OPTIONS[0]);
			}
		}
	}, [open, preset]);

	const canSave = name.trim() !== '' && promptTemplate.trim() !== '';

	const handleSave = () => {
		onSave({
			...(preset?.id ? { id: preset.id } : {}),
			name: name.trim(),
			description: description.trim(),
			prompt_template: promptTemplate.trim(),
			icon,
			color,
		});
		onClose();
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					borderRadius: 1,
					bgcolor: 'background.paper',
				},
			}}
		>
			<DialogTitle sx={{ fontWeight: 600 }}>
				{preset ? t('editAgent') : t('newAgent')}
			</DialogTitle>
			<DialogContent
				sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}
			>
				<Box sx={{ display: 'flex', gap: 2 }}>
					<TextField
						label={t('icon')}
						value={icon}
						onChange={(e) => setIcon(e.target.value)}
						sx={{ width: 80 }}
						inputProps={{ style: { fontSize: '1.5rem', textAlign: 'center' } }}
					/>
					<TextField
						label={t('name')}
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						fullWidth
						placeholder={t('namePlaceholder')}
					/>
				</Box>

				<TextField
					label={t('description')}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					fullWidth
					placeholder={t('descriptionPlaceholder')}
				/>

				<TextField
					label={t('promptTemplate')}
					value={promptTemplate}
					onChange={(e) => setPromptTemplate(e.target.value)}
					required
					fullWidth
					multiline
					rows={6}
					placeholder={t('promptPlaceholder')}
				/>

				<Box>
					<Box sx={{ mb: 1, fontSize: '0.75rem', color: 'text.secondary' }}>{t('color')}</Box>
					<Box sx={{ display: 'flex', gap: 1 }}>
						{COLOR_OPTIONS.map((c) => (
							<Box
								key={c}
								onClick={() => setColor(c)}
								sx={{
									width: 32,
									height: 32,
									borderRadius: '50%',
									bgcolor: c,
									cursor: 'pointer',
									border: (theme) =>
										color === c ? `2px solid ${theme.palette.text.primary}` : '2px solid transparent',
									boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
									transition: 'all 0.15s',
									'&:hover': {
										transform: 'scale(1.15)',
										boxShadow: `0 0 12px ${alpha(c, 0.5)}`,
									},
								}}
							/>
						))}
					</Box>
				</Box>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button onClick={onClose} sx={{ color: 'text.secondary' }}>
					{tc('cancel')}
				</Button>
				<Button
					onClick={handleSave}
					variant="contained"
					disabled={!canSave}
					sx={{
						bgcolor: color,
						'&:hover': { bgcolor: alpha(color, 0.85) },
					}}
				>
					{tc('save')}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
