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
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import { alpha, keyframes, type Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/hooks/useSnackbar';
import { validateImageFile, readFileAsDataUrl, stripDataUrlPrefix } from '@/lib/imageAttach';
import { LIGHT_INPUT_SHADOW } from '@/theme/theme';
import { MODEL_ALIASES, MODEL_VERSIONS, MODELS, EFFORTS } from '@/lib/models';
import type { ChatImageInput } from '@/types';

const MODES = [
	{ value: 'bypassPermissions', key: 'modeBypass' },
	{ value: 'plan', key: 'modePlan' },
	{ value: 'acceptEdits', key: 'modeEdit' },
] as const;

const pulse = keyframes`
	0%, 100% { opacity: 1; }
	50% { opacity: 0.45; }
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
}

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
}: Props) {
	const t = useTranslations('agentChat');
	const tc = useTranslations('common');
	const { showSnackbar } = useSnackbar();
	const [text, setText] = useState('');
	const [modelAnchor, setModelAnchor] = useState<null | HTMLElement>(null);
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
	const effortLevel = Math.max(1, EFFORTS.findIndex((o) => o.value === effort) + 1);
	const effortHot = effort === 'high' || effort === 'max';
	const modelLabel = MODELS.find((o) => o.value === model)?.key;
	const effortLabel = EFFORTS.find((o) => o.value === effort)?.key;
	const modeLabel = MODES.find((o) => o.value === permissionMode)?.key;

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
					border: isPlan ? '1px dashed' : '1px solid',
					borderColor: dragOver ? 'primary.main' : isPlan ? 'primary.main' : 'divider',
					borderRadius: 2.5,
					px: 1.5,
					py: 1,
					bgcolor: (th) => alpha(th.palette.text.primary, 0.03),
					boxShadow: (th) => (th.palette.mode === 'light' ? LIGHT_INPUT_SHADOW : 'none'),
				}}
			>
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
					<ButtonBase sx={controlSx} onClick={(e) => setModelAnchor(e.currentTarget)}>
						<AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} />
						<Typography variant="caption" sx={{ fontWeight: 600, fontSize: 'inherit' }}>
							{modelLabel ? tc(modelLabel) : model}
						</Typography>
						<ArrowDropDownRoundedIcon sx={{ fontSize: 16, ml: -0.25 }} />
					</ButtonBase>
					<Menu
						anchorEl={modelAnchor}
						open={!!modelAnchor}
						onClose={() => setModelAnchor(null)}
					>
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

					<ButtonBase sx={controlSx} onClick={() => onEffort(next(EFFORTS, effort))}>
						<SignalBars level={effortLevel} hot={effortHot} />
						<Typography
							variant="caption"
							sx={{
								fontWeight: 600,
								fontSize: 'inherit',
								color: effortHot ? 'primary.main' : 'inherit',
								animation: effortHot
									? `${pulse} 1.4s ease-in-out infinite`
									: 'none',
							}}
						>
							{effortLabel ? tc(effortLabel) : effort}
						</Typography>
					</ButtonBase>

					<ButtonBase
						sx={{ ...controlSx, color: isPlan ? 'primary.main' : 'text.secondary' }}
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
					</ButtonBase>

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
