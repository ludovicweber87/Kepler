'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { alpha, type Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { selectableCardSx } from '@/theme/selectableCard';
import type { Persona } from '@/types';
import { modelLabelKey, EFFORTS } from '@/lib/models';
import { MODES } from '../chat/AgentSettingsControls';

const DEFAULT_COLOR = '#7C5CFF';

interface Props {
	personas: Persona[];
	selectedPersonaId: string | null;
	onSelect: (id: string | null) => void;
}

/**
 * Grille de cards pour choisir un agent (persona) à l'étape « Agent » de la modale.
 * La card « Sans persona » ouvre l'étape Réglages ; une persona verrouille les réglages
 * (affichés en tags) et fait sauter cette étape.
 */
export default function PersonaCards({ personas, selectedPersonaId, onSelect }: Props) {
	const tl = useTranslations('launchModal');
	const tc = useTranslations('common');
	const tch = useTranslations('agentChat');

	const cardSx = (selected: boolean, color: string) => (th: Theme) => ({
		...selectableCardSx(th, { selected, color }),
		position: 'relative' as const,
		p: 1.75,
		cursor: 'pointer',
	});

	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
				gap: 1.25,
				width: '100%',
			}}
		>
			{/* Sans persona */}
			<Box
				onClick={() => onSelect(null)}
				sx={(th) => ({
					...cardSx(selectedPersonaId === null, DEFAULT_COLOR)(th),
					borderStyle: 'dashed',
				})}
			>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
					<Box
						sx={{
							width: 26,
							height: 26,
							borderRadius: 1,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: (th) => alpha(th.palette.text.primary, 0.06),
							color: 'text.secondary',
						}}
					>
						<TuneRoundedIcon sx={{ fontSize: 16 }} />
					</Box>
					<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
						{tl('agentNoneName')}
					</Typography>
				</Box>
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}
				>
					{tl('agentNoneDesc')}
				</Typography>
			</Box>

			{personas.map((p) => {
				const selected = selectedPersonaId === p.id;
				const color = p.color ?? DEFAULT_COLOR;
				const mKey = p.model ? modelLabelKey(p.model) : undefined;
				const eKey = p.effort ? EFFORTS.find((e) => e.value === p.effort)?.key : undefined;
				const modeKey = p.permission_mode
					? MODES.find((m) => m.value === p.permission_mode)?.key
					: undefined;
				return (
					<Box key={p.id} onClick={() => onSelect(p.id)} sx={cardSx(selected, color)}>
						<Chip
							icon={<LockRoundedIcon sx={{ fontSize: '11px !important' }} />}
							label={tl('agentLocked')}
							size="small"
							sx={{
								position: 'absolute',
								top: 8,
								right: 8,
								height: 18,
								fontSize: '0.6rem',
								color,
								bgcolor: alpha(color, 0.12),
								'& .MuiChip-icon': { color, ml: '4px' },
							}}
						/>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, pr: 6 }}>
							<Box
								sx={{
									width: 26,
									height: 26,
									borderRadius: 1,
									flexShrink: 0,
									bgcolor: alpha(color, 0.2),
									color,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									fontWeight: 700,
									fontSize: '0.8rem',
								}}
							>
								{p.name.charAt(0).toUpperCase()}
							</Box>
							<Typography
								variant="subtitle2"
								sx={{
									fontWeight: 600,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{p.name}
							</Typography>
						</Box>
						{p.role && (
							<Typography
								variant="caption"
								sx={{
									color: 'text.secondary',
									display: '-webkit-box',
									WebkitLineClamp: 2,
									WebkitBoxOrient: 'vertical',
									overflow: 'hidden',
									lineHeight: 1.4,
									mb: 1,
									minHeight: '2.1em',
								}}
							>
								{p.role}
							</Typography>
						)}
						<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
							{mKey && <Tag label={tc(mKey)} />}
							{eKey && <Tag label={tc(eKey)} />}
							{modeKey && <Tag label={tch(modeKey)} />}
						</Box>
					</Box>
				);
			})}
		</Box>
	);
}

function Tag({ label }: { label: string }) {
	return (
		<Box
			sx={{
				fontSize: '0.62rem',
				color: 'text.secondary',
				bgcolor: (th) => alpha(th.palette.text.primary, 0.05),
				border: '1px solid',
				borderColor: 'divider',
				borderRadius: 999,
				px: 0.85,
				py: 0.15,
			}}
		>
			{label}
		</Box>
	);
}
