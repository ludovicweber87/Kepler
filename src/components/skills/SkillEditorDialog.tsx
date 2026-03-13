'use client';

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { SkillFile } from '@/hooks/useSkillFiles';

interface SkillEditorDialogProps {
	open: boolean;
	onClose: () => void;
	onSave: (filename: string, content: string) => void;
	skill?: SkillFile;
}

export default function SkillEditorDialog({
	open,
	onClose,
	onSave,
	skill,
}: SkillEditorDialogProps) {
	const t = useTranslations('skills');
	const ta = useTranslations('agents');
	const tc = useTranslations('common');
	const [filename, setFilename] = useState('');
	const [content, setContent] = useState('');

	useEffect(() => {
		if (open) {
			if (skill) {
				setFilename(skill.name);
				setContent(skill.content);
			} else {
				setFilename('');
				setContent('');
			}
		}
	}, [open, skill]);

	const canSave = filename.trim() !== '' && content.trim() !== '';

	const handleSave = () => {
		if (skill) {
			// Keep original filename for existing skills
			onSave(skill.filename, content);
		} else {
			const safeName = filename.trim().replace(/\s+/g, '-').toLowerCase();
			onSave(`${safeName}.md`, content);
		}
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
				{skill ? `${tc('edit')} — ${skill.name}` : t('newSkill')}
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
				{!skill && (
					<TextField
						label={ta('fileName')}
						value={filename}
						onChange={(e) => setFilename(e.target.value)}
						required
						fullWidth
						placeholder="ex. deployment-workflow"
						size="small"
						sx={{ flexShrink: 0 }}
					/>
				)}

				<TextField
					label={t('title')}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					required
					fullWidth
					multiline
					rows={undefined}
					placeholder=""
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
					{tc('cancel')}
				</Button>
				<Button
					onClick={handleSave}
					variant="contained"
					disabled={!canSave}
					sx={(theme) => ({
						bgcolor: theme.palette.secondary.main,
						color: 'background.default',
						'&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.85) },
					})}
				>
					{tc('save')}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
