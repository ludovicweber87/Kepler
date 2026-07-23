'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { alpha, type Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { MODEL_FAMILIES, EFFORTS, modelFamily, modelLabelKey } from '@/lib/models';

interface Props {
	model: string;
	effort: string;
	permissionMode: string;
	onModel: (m: string) => void;
	onEffort: (e: string) => void;
	onMode: (m: string) => void;
}

const PERMISSIONS = [
	{
		value: 'bypassPermissions',
		titleKey: 'modeBypass',
		descKey: 'permBypassDesc',
		icon: BoltRoundedIcon,
		color: '#F59E0B',
	},
	{
		value: 'plan',
		titleKey: 'modePlan',
		descKey: 'permPlanDesc',
		icon: MapOutlinedIcon,
		color: '#00D4FF',
	},
	{
		value: 'acceptEdits',
		titleKey: 'modeEdit',
		descKey: 'permEditDesc',
		icon: EditOutlinedIcon,
		color: '#7C5CFF',
	},
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<Typography
			variant="caption"
			sx={{
				color: 'text.secondary',
				textTransform: 'uppercase',
				letterSpacing: '0.6px',
				fontSize: '0.65rem',
				fontWeight: 600,
				display: 'block',
				mb: 1,
			}}
		>
			{children}
		</Typography>
	);
}

function selectableSx(selected: boolean, color: string) {
	return {
		borderRadius: 1,
		border: '1.5px solid',
		borderColor: selected ? color : 'divider',
		bgcolor: selected ? alpha(color, 0.1) : 'transparent',
		transition: 'all 0.15s',
		'&:hover': { borderColor: color, transform: 'translateY(-1px)' },
	} as const;
}

/**
 * Cards de réglages (modèle famille→version, effort, permissions) pour l'étape
 * « Réglages » de la modale — affichée quand aucune persona n'est choisie.
 */
export default function AgentSettingsCards({
	model,
	effort,
	permissionMode,
	onModel,
	onEffort,
	onMode,
}: Props) {
	const tl = useTranslations('launchModal');
	const tc = useTranslations('common');
	const tch = useTranslations('agentChat');

	const activeFamilyId = modelFamily(model);
	const activeFamily = MODEL_FAMILIES.find((f) => f.id === activeFamilyId) ?? MODEL_FAMILIES[0];
	const primary = '#7C5CFF';

	const pickFamily = (fam: (typeof MODEL_FAMILIES)[number]) => {
		onModel(fam.alias ?? fam.versions[0]);
	};

	return (
		<Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2.25 }}>
			{/* Modèle — famille */}
			<Box>
				<SectionLabel>{tl('modelFamilySection')}</SectionLabel>
				<Box sx={{ display: 'flex', gap: 1 }}>
					{MODEL_FAMILIES.map((fam) => {
						const selected = fam.id === activeFamilyId;
						return (
							<ButtonBase
								key={fam.id}
								onClick={() => pickFamily(fam)}
								sx={{
									flex: 1,
									flexDirection: 'column',
									p: 1,
									...selectableSx(selected, primary),
								}}
							>
								<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
									{tl(fam.labelKey)}
								</Typography>
								<Typography
									variant="caption"
									sx={{ color: 'text.secondary', fontSize: '0.62rem' }}
								>
									{tl(fam.descKey)}
								</Typography>
							</ButtonBase>
						);
					})}
				</Box>
			</Box>

			{/* Version de la famille active */}
			<Box>
				<SectionLabel>{tl('modelVersionSection')}</SectionLabel>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
						gap: 1,
					}}
				>
					{activeFamily.alias && (
						<VersionCard
							label={
								tc(modelLabelKey(activeFamily.alias) ?? '') || activeFamily.alias
							}
							selected={model === activeFamily.alias}
							color={primary}
							onClick={() => onModel(activeFamily.alias as string)}
						/>
					)}
					{activeFamily.versions.map((v) => (
						<VersionCard
							key={v}
							label={tc(modelLabelKey(v) ?? '') || v}
							selected={model === v}
							color={primary}
							onClick={() => onModel(v)}
						/>
					))}
				</Box>
			</Box>

			<Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
				{/* Effort */}
				<Box sx={{ flex: 1, minWidth: 220 }}>
					<SectionLabel>{tl('effortSection')}</SectionLabel>
					<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
						{EFFORTS.map((e, i) => {
							const selected = e.value === effort;
							return (
								<ButtonBase
									key={e.value}
									onClick={() => onEffort(e.value)}
									sx={{
										flexDirection: 'column',
										gap: 0.5,
										py: 1,
										...selectableSx(selected, primary),
									}}
								>
									<Bars level={i + 1} active={selected} />
									<Typography
										variant="caption"
										sx={{ fontWeight: 600, fontSize: '0.68rem' }}
									>
										{tc(e.key)}
									</Typography>
								</ButtonBase>
							);
						})}
					</Box>
				</Box>

				{/* Permissions */}
				<Box sx={{ flex: 1, minWidth: 220 }}>
					<SectionLabel>{tl('permissionsSection')}</SectionLabel>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
						{PERMISSIONS.map((p) => {
							const selected = p.value === permissionMode;
							const Icon = p.icon;
							return (
								<ButtonBase
									key={p.value}
									onClick={() => onMode(p.value)}
									sx={{
										justifyContent: 'flex-start',
										gap: 1,
										px: 1.25,
										py: 0.85,
										...selectableSx(selected, p.color),
									}}
								>
									<Icon sx={{ fontSize: 17, color: p.color }} />
									<Box sx={{ textAlign: 'left' }}>
										<Typography
											variant="caption"
											sx={{
												fontWeight: 600,
												display: 'block',
												lineHeight: 1.2,
											}}
										>
											{tch(p.titleKey)}
										</Typography>
										<Typography
											variant="caption"
											sx={{ color: 'text.secondary', fontSize: '0.6rem' }}
										>
											{tl(p.descKey)}
										</Typography>
									</Box>
								</ButtonBase>
							);
						})}
					</Box>
				</Box>
			</Box>
		</Box>
	);
}

function VersionCard({
	label,
	selected,
	color,
	onClick,
}: {
	label: string;
	selected: boolean;
	color: string;
	onClick: () => void;
}) {
	return (
		<ButtonBase onClick={onClick} sx={{ py: 0.9, px: 1, ...selectableSx(selected, color) }}>
			<Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
				{label}
			</Typography>
		</ButtonBase>
	);
}

function Bars({ level, active }: { level: number; active: boolean }) {
	const heights = [6, 9, 12, 15];
	return (
		<Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 15 }}>
			{heights.map((h, i) => (
				<Box
					key={i}
					sx={{
						width: 3,
						height: h,
						borderRadius: 0.5,
						bgcolor: (th: Theme) =>
							i < level
								? active
									? '#7C5CFF'
									: 'text.secondary'
								: alpha(th.palette.text.primary, 0.18),
					}}
				/>
			))}
		</Box>
	);
}
