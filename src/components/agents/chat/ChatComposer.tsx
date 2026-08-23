'use client';
import {
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type ClipboardEvent,
	type DragEvent,
} from 'react';
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
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import Tooltip from '@mui/material/Tooltip';
import { alpha, keyframes, type Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/hooks/useSnackbar';
import {
	validateAttachment,
	mediaTypeForFile,
	isImageMediaType,
	readFileAsDataUrl,
	stripDataUrlPrefix,
} from '@/lib/fileAttach';
import { useComposerDraft } from '@/hooks/useComposerDraft';
import { normalizeEffort } from '@/lib/models';
import { RAINBOW_GRADIENT } from '@/theme/theme';
import { appShadow } from '@/theme/shadows';
import ImageLightbox from '@/components/shared/ImageLightbox';
import FileChip from '@/components/shared/FileChip';
import AgentSettingsControls from './AgentSettingsControls';
import type { ChatAttachmentInput, Persona } from '@/types';

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
	onSend: (text: string, attachments?: ChatAttachmentInput[]) => void;
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
	const [zoomed, setZoomed] = useState<{ src: string; name: string } | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const addFiles = async (files: File[]) => {
		for (const file of files) {
			const err = validateAttachment(file);
			if (err === 'type') {
				showSnackbar(t('attachTypeError'), 'error');
				continue;
			}
			if (err === 'size') {
				const isImage = isImageMediaType(mediaTypeForFile(file));
				showSnackbar(t(isImage ? 'attachSizeError' : 'attachFileSizeError'), 'error');
				continue;
			}
			const dataUrl = await readFileAsDataUrl(file);
			const { data } = stripDataUrlPrefix(dataUrl);
			// Le type vient du fichier, pas de la data URL : le navigateur laisse `type`
			// vide sur beaucoup de fichiers de code, où l'extension est plus parlante.
			addAttachment({
				name: file.name || 'fichier',
				mediaType: mediaTypeForFile(file),
				data,
			});
		}
	};

	const onPaste = (e: ClipboardEvent) => {
		const files = Array.from(e.clipboardData.files);
		if (files.length) {
			e.preventDefault();
			void addFiles(files);
		}
	};
	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const files = Array.from(e.dataTransfer.files);
		if (files.length) void addFiles(files);
	};
	const onPick = (e: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files ?? []);
		// Reset avant lecture : sans ça, re-choisir le même fichier n'émet plus `change`.
		e.target.value = '';
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
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
						{attachments.map((a) => {
							// Un fichier non-image n'a rien à prévisualiser : pastille nom + type.
							if (!isImageMediaType(a.mediaType))
								return (
									<FileChip
										key={a.id}
										name={a.name}
										mediaType={a.mediaType}
										onRemove={() => removeAttachment(a.id)}
										removeLabel={t('removeFile')}
									/>
								);
							const src = `data:${a.mediaType};base64,${a.data}`;
							return (
								<Box key={a.id} sx={{ position: 'relative' }}>
									<Box
										component="img"
										src={src}
										alt={a.name}
										title={a.name}
										onClick={() => setZoomed({ src, name: a.name })}
										sx={{
											display: 'block',
											width: 56,
											height: 56,
											objectFit: 'cover',
											borderRadius: 1,
											border: '1px solid',
											borderColor: 'divider',
											cursor: 'zoom-in',
											transition: 'opacity 120ms',
											'&:hover': { opacity: 0.85 },
										}}
									/>
									<IconButton
										size="small"
										aria-label={t('removeImage')}
										onClick={() => removeAttachment(a.id)}
										sx={{
											position: 'absolute',
											top: -6,
											right: -6,
											p: 0.15,
											bgcolor: 'background.paper',
											border: '1px solid',
											borderColor: 'divider',
											'&:hover': { bgcolor: 'background.paper' },
										}}
									>
										<CloseRoundedIcon sx={{ fontSize: 12 }} />
									</IconButton>
								</Box>
							);
						})}
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
					<Tooltip title={t('attachFile')}>
						<IconButton
							size="small"
							aria-label={t('attachFile')}
							onClick={() => fileInput.current?.click()}
							disabled={disabled}
						>
							<AttachFileRoundedIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
					<Box
						component="input"
						ref={fileInput}
						type="file"
						multiple
						onChange={onPick}
						sx={{ display: 'none' }}
					/>
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
			<ImageLightbox
				src={zoomed?.src ?? null}
				alt={zoomed?.name}
				onClose={() => setZoomed(null)}
			/>
		</Box>
	);
}
