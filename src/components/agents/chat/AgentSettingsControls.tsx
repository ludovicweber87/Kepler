'use client';
import { useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import ArrowDropDownRoundedIcon from '@mui/icons-material/ArrowDropDownRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { alpha, keyframes, type Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { MODEL_ALIASES, MODEL_VERSIONS, MODELS, EFFORTS } from '@/lib/models';

/** Modes de permission proposés par le sélecteur cyclique (ordre du cycle). */
export const MODES = [
	{ value: 'bypassPermissions', key: 'modeBypass' },
	{ value: 'plan', key: 'modePlan' },
	{ value: 'acceptEdits', key: 'modeEdit' },
] as const;

const pulse = keyframes`
	0%, 100% { opacity: 1; }
	50% { opacity: 0.45; }
`;

function next<T extends { value: string }>(options: readonly T[], value: string): string {
	const i = options.findIndex((o) => o.value === value);
	return options[(i + 1) % options.length].value;
}

const controlSx = {
	display: 'flex',
	alignItems: 'center',
	gap: 0.5,
	px: 0.75,
	py: 0.25,
	borderRadius: 999,
	color: 'text.secondary',
	fontSize: '0.72rem',
	transition: 'background-color 120ms',
	'&:hover': { bgcolor: (th: Theme) => alpha(th.palette.text.primary, 0.06) },
} as const;

function SignalBars({ level, hot }: { level: number; hot: boolean }) {
	const heights = [5, 8, 11, 14];
	return (
		<Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 14 }}>
			{heights.map((h, i) => {
				const filled = i < level;
				return (
					<Box
						key={i}
						sx={{
							width: 3,
							height: h,
							borderRadius: 0.5,
							bgcolor: filled
								? hot
									? 'primary.main'
									: 'text.secondary'
								: (th) => alpha(th.palette.text.primary, 0.18),
							animation:
								filled && hot ? `${pulse} 1.4s ease-in-out infinite` : 'none',
							animationDelay: `${i * 0.12}s`,
						}}
					/>
				);
			})}
		</Box>
	);
}

interface Props {
	model: string;
	effort: string;
	permissionMode: string;
	onModel: (m: string) => void;
	onEffort: (e: string) => void;
	onMode: (m: string) => void;
	/** Verrouille les 3 contrôles (valeurs affichées mais non modifiables). */
	locked?: boolean;
	/** Texte du tooltip affiché sur les contrôles verrouillés (traduit par l'appelant). */
	lockedTooltip?: string;
}

/**
 * Barre de contrôles model / effort / mode partagée entre le composer et la modale
 * de lancement. Quand `locked`, les valeurs restent affichées mais les contrôles
 * sont désactivés (cursor not-allowed + tooltip) — utilisé quand une persona impose
 * ses réglages.
 */
export default function AgentSettingsControls({
	model,
	effort,
	permissionMode,
	onModel,
	onEffort,
	onMode,
	locked = false,
	lockedTooltip,
}: Props) {
	const t = useTranslations('agentChat');
	const tc = useTranslations('common');
	const [modelAnchor, setModelAnchor] = useState<null | HTMLElement>(null);

	const isPlan = permissionMode === 'plan';
	const effortLevel = Math.max(1, EFFORTS.findIndex((o) => o.value === effort) + 1);
	const effortHot = effort === 'high' || effort === 'max';
	const modelLabel = MODELS.find((o) => o.value === model)?.key;
	const effortLabel = EFFORTS.find((o) => o.value === effort)?.key;
	const modeLabel = MODES.find((o) => o.value === permissionMode)?.key;

	const lockedSx = locked ? { opacity: 0.55, '&:hover': { bgcolor: 'transparent' } } : null;

	// MUI Tooltip ne se déclenche pas sur un élément désactivé → on enveloppe le
	// contrôle dans un <span> porteur du curseur not-allowed et du tooltip.
	const lockWrap = (key: string, node: ReactElement) =>
		locked ? (
			<Tooltip key={key} title={lockedTooltip ?? ''} arrow placement="top">
				<Box component="span" sx={{ cursor: 'not-allowed', display: 'inline-flex' }}>
					{node}
				</Box>
			</Tooltip>
		) : (
			node
		);

	return (
		<>
			{lockWrap(
				'model',
				<ButtonBase
					sx={{ ...controlSx, ...lockedSx }}
					disabled={locked}
					onClick={(e) => setModelAnchor(e.currentTarget)}
				>
					<AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} />
					<Typography variant="caption" sx={{ fontWeight: 600, fontSize: 'inherit' }}>
						{modelLabel ? tc(modelLabel) : model}
					</Typography>
					<ArrowDropDownRoundedIcon sx={{ fontSize: 16, ml: -0.25 }} />
				</ButtonBase>,
			)}
			<Menu anchorEl={modelAnchor} open={!!modelAnchor} onClose={() => setModelAnchor(null)}>
				{MODEL_ALIASES.map((o) => (
					<MenuItem
						key={o.value}
						selected={o.value === model}
						onClick={() => {
							onModel(o.value);
							setModelAnchor(null);
						}}
						sx={{ fontSize: '0.8rem' }}
					>
						{tc(o.key)}
					</MenuItem>
				))}
				<Divider />
				{MODEL_VERSIONS.map((o) => (
					<MenuItem
						key={o.value}
						selected={o.value === model}
						onClick={() => {
							onModel(o.value);
							setModelAnchor(null);
						}}
						sx={{ fontSize: '0.8rem' }}
					>
						{tc(o.key)}
					</MenuItem>
				))}
			</Menu>

			{lockWrap(
				'effort',
				<ButtonBase
					sx={{ ...controlSx, ...lockedSx }}
					disabled={locked}
					onClick={() => onEffort(next(EFFORTS, effort))}
				>
					<SignalBars level={effortLevel} hot={effortHot} />
					<Typography
						variant="caption"
						sx={{
							fontWeight: 600,
							fontSize: 'inherit',
							color: effortHot ? 'primary.main' : 'inherit',
							animation: effortHot ? `${pulse} 1.4s ease-in-out infinite` : 'none',
						}}
					>
						{effortLabel ? tc(effortLabel) : effort}
					</Typography>
				</ButtonBase>,
			)}

			{lockWrap(
				'mode',
				<ButtonBase
					sx={{
						...controlSx,
						color: isPlan ? 'primary.main' : 'text.secondary',
						...lockedSx,
					}}
					disabled={locked}
					onClick={() => onMode(next(MODES, permissionMode))}
				>
					{permissionMode === 'bypassPermissions' ? (
						<BoltRoundedIcon sx={{ fontSize: 15 }} />
					) : isPlan ? (
						<MapOutlinedIcon sx={{ fontSize: 15 }} />
					) : (
						<EditOutlinedIcon sx={{ fontSize: 15 }} />
					)}
					<Typography variant="caption" sx={{ fontWeight: 600, fontSize: 'inherit' }}>
						{modeLabel ? t(modeLabel) : permissionMode}
					</Typography>
				</ButtonBase>,
			)}
		</>
	);
}
