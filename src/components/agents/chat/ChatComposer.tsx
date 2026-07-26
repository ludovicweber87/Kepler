'use client';
import { useState, useRef, type KeyboardEvent, type ClipboardEvent, type DragEvent } from 'react';
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
import { normalizeEffort } from '@/lib/models';
import { LIGHT_INPUT_SHADOW, RAINBOW_GRADIENT } from '@/theme/theme';
import AgentSettingsControls from './AgentSettingsControls';
import type { ChatImageInput, Persona } from '@/types';

// Bordure dégradée arc-en-ciel (effort ultracode) : astuce padding-box / border-box pour
// respecter le border-radius. Seule la 2ᵉ couche (le dégradé de la bordure) défile.
const rainbowBorderShift = keyframes`
	0% { background-position: 0% 0%, 0% 0%; }
	100% { background-position: 0% 0%, 200% 0%; }
`;

interface Props {
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
	const [text, setText] = useState('');
	const [personaAnchor, setPersonaAnchor] = useState<null | HTMLElement>(null);
	type Attachment = { id: string; name: string; mediaType: string; data: string };
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const attachId = useRef(0);
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
			setAttachments((prev) => [
				...prev,
				{ id: `a${attachId.current++}`, name: file.name || 'image', mediaType, data },
			]);
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
	const removeAttachment = (id: string) =>
		setAttachments((prev) => prev.filter((a) => a.id !== id));

	const submit = () => {
		if (!text.trim() && attachments.length === 0) return;
		onSend(
			text,
			attachments.length
				? attachments.map((a) => ({ name: a.name, mediaType: a.mediaType, data: a.data }))
				: undefined,
		);
		setText('');
		setAttachments([]);
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
	// Habillage de la bordure selon l'effort. Précédence : drag&drop > ultracode > high >
	// couleur persona / divider. En mode plan → dashed, SAUF ultracode qui reste un dégradé
	// plein (un dashed multicolore n'est pas rendable proprement en CSS).
	const frameSx =
		!dragOver && isUltra
			? {
					border: '1px solid transparent',
					borderRadius: 2.5,
					background: (th: Theme) =>
						`linear-gradient(${alpha(th.palette.text.primary, 0.03)}, ${alpha(
							th.palette.text.primary,
							0.03,
						)}) padding-box, ${RAINBOW_GRADIENT} border-box`,
					backgroundSize: '100% 100%, 200% 100%',
					animation: `${rainbowBorderShift} 6s linear infinite`,
				}
			: {
					border: isPlan ? '1px dashed' : '1px solid',
					borderColor: dragOver
						? 'primary.main'
						: isHighEffort
							? 'primary.main'
							: agentColor || (isPlan ? 'primary.main' : 'divider'),
					borderRadius: 2.5,
					bgcolor: (th: Theme) => alpha(th.palette.text.primary, 0.03),
				};
	const labelColor = agentColor || 'text.secondary';
	const personaLabel = agentName || t('agentLabel');
	// Une persona impose ses réglages → contrôles verrouillés. « Sans persona » les libère.
	const personaLocked = currentPersonaId != null;
	const lockedTooltip = tc('settingsLockedByPersona', { name: agentName ?? '' });

	return (
		<Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
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
					boxShadow: (th) => (th.palette.mode === 'light' ? LIGHT_INPUT_SHADOW : 'none'),
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
