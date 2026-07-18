'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useTranslations } from 'next-intl';
import type { Persona, PersonaFlowNode, PersonaFlowNodeData } from '@/types';

interface Props {
	node: PersonaFlowNode | null;
	personas: Persona[];
	onChange: (nodeId: string, data: PersonaFlowNodeData) => void;
	onDelete: (nodeId: string) => void;
}

export default function NodeConfigPanel({ node, personas, onChange, onDelete }: Props) {
	const t = useTranslations('personas');

	if (!node) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
				{t('configEmpty')}
			</Typography>
		);
	}

	const data = node.data ?? {};
	const patch = (partial: Partial<PersonaFlowNodeData>) =>
		onChange(node.id, { ...data, ...partial });

	const outputs = data.outputs && data.outputs.length > 0 ? data.outputs : ['done'];

	const setOutput = (i: number, value: string) => {
		const next = [...outputs];
		next[i] = value;
		patch({ outputs: next });
	};
	const addOutput = () => patch({ outputs: [...outputs, ''] });
	const removeOutput = (i: number) => patch({ outputs: outputs.filter((_, idx) => idx !== i) });

	return (
		<Box sx={{ p: 2 }}>
			<Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
				{t('configTitle')}
			</Typography>

			{node.type === 'persona' && (
				<Stack spacing={2}>
					<TextField
						select
						label={t('selectPersona')}
						value={data.personaId ?? ''}
						onChange={(e) => patch({ personaId: e.target.value })}
						size="small"
						fullWidth
					>
						{personas.map((p) => (
							<MenuItem key={p.id} value={p.id}>
								{p.name}
							</MenuItem>
						))}
					</TextField>

					<Box>
						<Typography variant="caption" color="text.secondary">
							{t('outputs')}
						</Typography>
						<Stack spacing={1} sx={{ mt: 1 }}>
							{outputs.map((out, i) => (
								<Stack key={i} direction="row" spacing={0.5} alignItems="center">
									<TextField
										value={out}
										placeholder={t('outputPlaceholder')}
										onChange={(e) => setOutput(i, e.target.value)}
										size="small"
										fullWidth
									/>
									<IconButton
										size="small"
										onClick={() => removeOutput(i)}
										disabled={outputs.length <= 1}
									>
										<CloseRoundedIcon fontSize="small" />
									</IconButton>
								</Stack>
							))}
						</Stack>
						<Button
							size="small"
							startIcon={<AddRoundedIcon />}
							onClick={addOutput}
							sx={{ mt: 1, textTransform: 'none' }}
						>
							{t('addOutput')}
						</Button>
					</Box>
				</Stack>
			)}

			{node.type === 'end' && (
				<TextField
					select
					label={t('endAction')}
					value={data.endAction ?? 'none'}
					onChange={(e) =>
						patch({ endAction: e.target.value as PersonaFlowNodeData['endAction'] })
					}
					size="small"
					fullWidth
				>
					<MenuItem value="none">{t('endActionNone')}</MenuItem>
					<MenuItem value="create-pr">{t('endActionCreatePr')}</MenuItem>
				</TextField>
			)}

			<Divider sx={{ my: 2 }} />
			<Button
				color="error"
				size="small"
				startIcon={<DeleteOutlineRoundedIcon />}
				onClick={() => onDelete(node.id)}
				disabled={node.type === 'start'}
				sx={{ textTransform: 'none' }}
			>
				{t('deleteNode')}
			</Button>
		</Box>
	);
}
