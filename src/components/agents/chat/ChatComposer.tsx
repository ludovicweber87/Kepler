'use client';
import { useState, type KeyboardEvent, type ClipboardEvent, type DragEvent } from 'react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ArrowDropDownRoundedIcon from '@mui/icons-material/ArrowDropDownRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import { alpha, keyframes, type Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/hooks/useSnackbar';
import { validateImageFile, readFileAsDataUrl, stripDataUrlPrefix } from '@/lib/imageAttach';
import { useComposerDraft } from '@/hooks/useComposerDraft';
import { normalizeEffort } from '@/lib/models';
import { RAINBOW_GRADIENT } from '@/theme/theme';
import { appShadow } from '@/theme/shadows';
import AgentSettingsControls from './AgentSettingsControls';
import type { ChatImageInput, Persona } from '@/types';

// Bordure dégradée arc-en-ciel (effort ultracode) : astuce padding-box / border-box pour
// respecter le border-radius. Seule la 3ᵉ couche (le dégradé de la bordure) défile.
const rainbowBorderShift = keyframes`
	0% { background-position: 0% 0%, 0% 0%, 0% 0%; }
	100% { background-position: 0% 0%, 0% 0%, 200% 0%; }
`;

interface Props {
	/** Session courante — scope le brouillon, préservé d'un worktree à l'autre. */
	sessionId: string;
	disabled?: boolean;
	busy?: boolean;
	model: string;
	effort: string;
	permissionMode: string;
	onSend: (text: string, images?: ChatImageInput[]) => void;
	onStop: () => void;
	onModel: (m: string) => void;
	onEffort: (e: string) => void;
	onMode: (m: string) => void;
	/** Couleur de la persona active (snapshot session) — teinte la bordure et le label. */
	agentColor?: string | null;
	/** Nom de la persona active, affiché dans le label flottant. */
	agentName?: string | null;
	/** Bibliothèque de personas pour le sélecteur. */
	personas?: Persona[];
	/** Persona courante (match best-effort par nom) pour surligner le menu. */
	currentPersonaId?: string | null;
	/** Change la persona active en cours de session (`null` = sans persona). */
	onSwitchPersona?: (personaId: string | null) => void;
}

export default function ChatComposer({
	sessionId,
	disabled,
	busy,
	model,
	effort,
	permissionMode,
	onSend,
	onStop,
	onModel,
	onEffort,
	onMode,
	agentColor,
	agentName,
	personas = [],
	currentPersonaId,
	onSwitchPersona,
}: Props) {
	const t = useTranslations('agentChat');
	const tc = useTranslations('common');
	const { showSnackbar } = useSnackbar();
	// Le brouillon vit dans un store scopé à la session : chaque worktree garde le sien.
	const { text, setText, attachments, addAttachment, removeAttachment, clear } =
		useComposerDraft(sessionId);
	const [personaAnchor, setPersonaAnchor] = useState<null | HTMLElement>(null);
	const [dragOver, setDragOver] = useState(false);

	const addFiles = async (files: File[]) => {
		for (const file of files) {
			const err = validateImageFile(file);
			if (err) {
				showSnackbar(t(err === 'type' ? 'attachTypeError' : 'attachSizeError'), 'error');
				continue;
			}
			const dataUrl = await readFileAsDataUrl(file);
			const { mediaType, data } = stripDataUrlPrefix(dataUrl);
			addAttachment({ name: file.name || 'image', mediaType, data });
		}
	};

	const onPaste = (e: ClipboardEvent) => {
		const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
		if (files.length) {
			e.preventDefault();
			void addFiles(files);
		}
	};
	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
		if (files.length) void addFiles(files);
	};
	const submit = () => {
		if (!text.trim() && attachments.length === 0) return;
		onSend(
			text,
			attachments.length
				? attachments.map((a) => ({ name: a.name, mediaType: a.mediaType, data: a.data }))
				: undefined,
		);
		clear();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	};

	const isPlan = permissionMode === 'plan';
	const eff = normalizeEffort(effort);
	const isUltra = eff === 'ultracode';
	const isHighEffort = eff === 'high';
	// Habillage de la bordure. Précédence : drag&drop > couleur persona > ultracode > high >
	// plan > divider. La persona passe devant l'effort : c'est un marqueur d'identité, et
	// comme une persona impose son effort (souvent `high`), l'effort écrasait sinon toujours
	// sa couleur. En mode plan → dashed, SAUF ultracode qui reste un dégradé plein (un dashed
	// multicolore n'est pas rendable proprement en CSS).
	const frameSx =
		!dragOver && isUltra && !agentColor
			? {
					border: '1px solid transparent',
					borderRadius: 2.5,
					// 3 couches : teinte subtile + fond opaque (masque le dégradé à l'intérieur
					// de la bordure) en padding-box, puis l'arc-en-ciel en border-box.
					background: (th: Theme) => {
						const tint = alpha(th.palette.text.primary, 0.03);
						const base = th.palette.background.default;
						return `linear-gradient(${tint}, ${tint}) padding-box, linear-gradient(${base}, ${base}) padding-box, ${RAINBOW_GRADIENT} border-box`;
					},
					backgroundSize: '100% 100%, 100% 100%, 200% 100%',
					animation: `${rainbowBorderShift} 6s linear infinite`,
				}
			: {
					border: isPlan ? '1px dashed' : '1px solid',
					borderColor: dragOver
						? 'primary.main'
						: agentColor || (isHighEffort || isPlan ? 'primary.main' : 'divider'),
					borderRadius: 2.5,
					bgcolor: (th: Theme) => alpha(th.palette.text.primary, 0.03),
				};
	const labelColor = agentColor || 'text.secondary';
	const personaLabel = agentName || t('agentLabel');
	// Une persona impose ses réglages → contrôles verrouillés. « Sans persona » les libère.
	const personaLocked = currentPersonaId != null;
	const lockedTooltip = tc('settingsLockedByPersona', { name: agentName ?? '' });

	return (
		<Box
			sx={{
				p: 1.5,
				borderTop: 1,
				borderColor: 'divider',
				flexShrink: 0,
				// z-index : sans lui l'ombre serait peinte sous le texte des messages
				// (ordre de peinture CSS : fonds des blocs avant le contenu inline).
				position: 'relative',
				zIndex: 1,
				boxShadow: (th) => appShadow(th.palette.mode),
			}}
		>
			<Box
				onPaste={onPaste}
				onDrop={onDrop}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				sx={{
					position: 'relative',
					...frameSx,
					px: 1.5,
					py: 1,
					boxShadow: (th) => appShadow(th.palette.mode),
				}}
			>
				<ButtonBase
					onClick={(e) => setPersonaAnchor(e.currentTarget)}
					disabled={!onSwitchPersona}
					aria-label={t('switchPersona')}
					sx={{
						position: 'absolute',
						top: 0,
						left: 12,
						transform: 'translateY(-50%)',
						display: 'flex',
						alignItems: 'center',
						gap: 0.5,
						height: 18,
						px: 0.75,
						borderRadius: 1,
						bgcolor: 'background.default',
						zIndex: 1,
					}}
				>
					<Box
						sx={{
							width: 7,
							height: 7,
							borderRadius: '50%',
							bgcolor: agentColor || 'text.disabled',
							flexShrink: 0,
						}}
					/>
					<Typography
						variant="caption"
						sx={{
							fontSize: '0.68rem',
							fontWeight: 700,
							color: labelColor,
							lineHeight: 1,
						}}
					>
						{personaLabel}
					</Typography>
					{onSwitchPersona && (
						<ArrowDropDownRoundedIcon
							sx={{ fontSize: 14, color: labelColor, ml: -0.25 }}
						/>
					)}
				</ButtonBase>
				<Menu
					anchorEl={personaAnchor}
					open={!!personaAnchor}
					onClose={() => setPersonaAnchor(null)}
				>
					<MenuItem
						selected={currentPersonaId == null}
						onClick={() => {
							onSwitchPersona?.(null);
							setPersonaAnchor(null);
						}}
						sx={{ fontSize: '0.8rem', gap: 1 }}
					>
						<Box
							sx={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								border: '1px dashed',
								borderColor: 'text.disabled',
								flexShrink: 0,
							}}
						/>
						{t('noPersona')}
					</MenuItem>
					{personas.length > 0 && <Divider />}
					{personas.map((p) => (
						<MenuItem
							key={p.id}
							selected={p.id === currentPersonaId}
							onClick={() => {
								onSwitchPersona?.(p.id);
								setPersonaAnchor(null);
							}}
							sx={{ fontSize: '0.8rem', gap: 1 }}
						>
							<Box
								sx={{
									width: 8,
									height: 8,
									borderRadius: '50%',
									bgcolor: p.color || 'text.disabled',
									flexShrink: 0,
								}}
							/>
							{p.name}
						</MenuItem>
					))}
				</Menu>
				{attachments.length > 0 && (
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
						{attachments.map((a) => (
							<Box
								key={a.id}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 0.5,
									pl: 0.75,
									pr: 0.25,
									py: 0.25,
									borderRadius: 999,
									bgcolor: (th) => alpha(th.palette.primary.main, 0.12),
									maxWidth: 200,
								}}
							>
								<ImageRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
								<Typography
									variant="caption"
									noWrap
									sx={{ fontSize: '0.7rem', maxWidth: 130 }}
								>
									{a.name}
								</Typography>
								<IconButton
									size="small"
									aria-label={t('removeImage')}
									onClick={() => removeAttachment(a.id)}
									sx={{ p: 0.25 }}
								>
									<CloseRoundedIcon sx={{ fontSize: 13 }} />
								</IconButton>
							</Box>
						))}
					</Box>
				)}
				<InputBase
					fullWidth
					multiline
					minRows={6}
					maxRows={14}
					placeholder={t('composerPlaceholder')}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKey}
					disabled={disabled}
					sx={{ fontSize: '0.8rem', mb: 1, alignItems: 'flex-start' }}
				/>
				{busy && text.trim() && (
					<Typography
						variant="caption"
						sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}
					>
						{t('queuedHint')}
					</Typography>
				)}
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
					<AgentSettingsControls
						model={model}
						effort={effort}
						permissionMode={permissionMode}
						onModel={onModel}
						onEffort={onEffort}
						onMode={onMode}
						locked={personaLocked}
						lockedTooltip={lockedTooltip}
					/>
					<Box sx={{ flex: 1 }} />
					{busy && (
						<IconButton size="small" color="error" onClick={onStop}>
							<StopRoundedIcon />
						</IconButton>
					)}
					<IconButton
						size="small"
						color="primary"
						onClick={submit}
						disabled={disabled || (!text.trim() && attachments.length === 0)}
					>
						<SendRoundedIcon />
					</IconButton>
				</Box>
			</Box>
		</Box>
	);
}
