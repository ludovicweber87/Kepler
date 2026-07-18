'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseCircleOutlineRoundedIcon from '@mui/icons-material/PauseCircleOutlineRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import { useTranslations } from 'next-intl';
import { usePersonaLookup } from './PersonaFlowContext';
import type { PersonaFlowNodeData } from '@/types';

const shell = {
	px: 1.5,
	py: 1,
	borderRadius: 2,
	border: '1px solid',
	bgcolor: 'background.paper',
	minWidth: 150,
	boxShadow: 1,
};

const handleStyle = { width: 9, height: 9, background: '#7C5CFF' };

export function StartNode({ selected }: NodeProps) {
	const t = useTranslations('personas');
	return (
		<Box sx={{ ...shell, borderColor: selected ? 'primary.main' : 'divider' }}>
			<Stack direction="row" spacing={1} alignItems="center">
				<PlayArrowRoundedIcon fontSize="small" color="success" />
				<Typography variant="body2" fontWeight={600}>
					{t('nodeStart')}
				</Typography>
			</Stack>
			<Handle type="source" position={Position.Right} style={handleStyle} />
		</Box>
	);
}

export function PersonaNode({ data, selected }: NodeProps) {
	const t = useTranslations('personas');
	const lookup = usePersonaLookup();
	const d = data as PersonaFlowNodeData;
	const persona = d.personaId ? lookup.get(d.personaId) : undefined;
	const outputs = d.outputs && d.outputs.length > 0 ? d.outputs : ['done'];

	return (
		<Box
			sx={{
				...shell,
				borderColor: selected ? 'primary.main' : 'divider',
				pb: outputs.length > 1 ? 1.5 : 1,
			}}
		>
			<Handle type="target" position={Position.Left} style={handleStyle} />
			<Stack direction="row" spacing={1} alignItems="center">
				<Avatar
					sx={{
						width: 24,
						height: 24,
						fontSize: 11,
						fontWeight: 700,
						bgcolor: persona?.color ?? 'grey.500',
					}}
				>
					{(persona?.name ?? '?').slice(0, 2).toUpperCase()}
				</Avatar>
				<Typography variant="body2" fontWeight={600} noWrap>
					{persona?.name ?? t('unknownPersona')}
				</Typography>
			</Stack>
			{outputs.map((out, i) => (
				<Box key={out} sx={{ position: 'relative' }}>
					{outputs.length > 1 && (
						<Typography
							variant="caption"
							sx={{
								display: 'block',
								textAlign: 'right',
								pr: 1,
								color: 'text.secondary',
							}}
						>
							{out}
						</Typography>
					)}
					<Handle
						id={out}
						type="source"
						position={Position.Right}
						style={{
							...handleStyle,
							top: outputs.length > 1 ? 'auto' : '50%',
							bottom:
								outputs.length > 1 ? 6 + (outputs.length - 1 - i) * 20 : undefined,
						}}
					/>
				</Box>
			))}
		</Box>
	);
}

export function CheckpointNode({ selected }: NodeProps) {
	const t = useTranslations('personas');
	return (
		<Box sx={{ ...shell, borderColor: selected ? 'primary.main' : 'warning.main' }}>
			<Handle type="target" position={Position.Left} style={handleStyle} />
			<Stack direction="row" spacing={1} alignItems="center">
				<PauseCircleOutlineRoundedIcon fontSize="small" color="warning" />
				<Typography variant="body2" fontWeight={600}>
					{t('nodeCheckpoint')}
				</Typography>
			</Stack>
			<Handle type="source" position={Position.Right} style={handleStyle} />
		</Box>
	);
}

export function EndNode({ selected }: NodeProps) {
	const t = useTranslations('personas');
	return (
		<Box sx={{ ...shell, borderColor: selected ? 'primary.main' : 'divider' }}>
			<Handle type="target" position={Position.Left} style={handleStyle} />
			<Stack direction="row" spacing={1} alignItems="center">
				<FlagRoundedIcon fontSize="small" color="error" />
				<Typography variant="body2" fontWeight={600}>
					{t('nodeEnd')}
				</Typography>
			</Stack>
		</Box>
	);
}

export const nodeTypes = {
	start: StartNode,
	persona: PersonaNode,
	checkpoint: CheckpointNode,
	end: EndNode,
};
