'use client';
import { useState, type KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ArrowDropDownRoundedIcon from '@mui/icons-material/ArrowDropDownRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';

const MODELS = [
	{ value: 'opus', key: 'modelOpus' },
	{ value: 'sonnet', key: 'modelSonnet' },
	{ value: 'haiku', key: 'modelHaiku' },
] as const;
const EFFORTS = [
	{ value: 'low', key: 'effortLow' },
	{ value: 'medium', key: 'effortMedium' },
	{ value: 'high', key: 'effortHigh' },
	{ value: 'max', key: 'effortMax' },
] as const;
const MODES = [
	{ value: 'plan', key: 'modePlan' },
	{ value: 'acceptEdits', key: 'modeAcceptEdits' },
	{ value: 'bypassPermissions', key: 'modeBypass' },
] as const;

interface Props {
	disabled?: boolean;
	busy?: boolean;
	model: string;
	effort: string;
	permissionMode: string;
	onSend: (text: string) => void;
	onStop: () => void;
	onModel: (m: string) => void;
	onEffort: (e: string) => void;
	onMode: (m: string) => void;
}

function Pill({
	label,
	options,
	value,
	onPick,
	tKey,
}: {
	label: string;
	options: readonly { value: string; key: string }[];
	value: string;
	onPick: (v: string) => void;
	tKey: (k: string) => string;
}) {
	const [anchor, setAnchor] = useState<null | HTMLElement>(null);
	const current = options.find((o) => o.value === value);
	return (
		<>
			<Button
				size="small"
				onClick={(e) => setAnchor(e.currentTarget)}
				endIcon={<ArrowDropDownRoundedIcon />}
				sx={{
					textTransform: 'none',
					fontSize: '0.7rem',
					color: 'text.secondary',
					borderRadius: 999,
					px: 1,
					minWidth: 0,
				}}
			>
				{label}: {current ? tKey(current.key) : '—'}
			</Button>
			<Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
				{options.map((o) => (
					<MenuItem
						key={o.value}
						selected={o.value === value}
						onClick={() => {
							onPick(o.value);
							setAnchor(null);
						}}
						sx={{ fontSize: '0.8rem' }}
					>
						{tKey(o.key)}
					</MenuItem>
				))}
			</Menu>
		</>
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
	const [text, setText] = useState('');
	const submit = () => {
		if (!text.trim()) return;
		onSend(text);
		setText('');
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	};
	return (
		<Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
			<Box
				sx={{
					border: 1,
					borderColor: 'divider',
					borderRadius: 2.5,
					px: 1.5,
					py: 1,
					bgcolor: (th) => alpha(th.palette.text.primary, 0.03),
				}}
			>
				<InputBase
					fullWidth
					multiline
					maxRows={8}
					placeholder={t('composerPlaceholder')}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKey}
					disabled={disabled}
					sx={{ fontSize: '0.8rem', mb: 1 }}
				/>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Pill
						label={t('model')}
						options={MODELS}
						value={model}
						onPick={onModel}
						tKey={t}
					/>
					<Pill
						label={t('effort')}
						options={EFFORTS}
						value={effort}
						onPick={onEffort}
						tKey={t}
					/>
					<Pill
						label={t('mode')}
						options={MODES}
						value={permissionMode}
						onPick={onMode}
						tKey={t}
					/>
					<Box sx={{ flex: 1 }} />
					{busy ? (
						<IconButton size="small" color="error" onClick={onStop}>
							<StopRoundedIcon />
						</IconButton>
					) : (
						<IconButton
							size="small"
							color="primary"
							onClick={submit}
							disabled={disabled || !text.trim()}
						>
							<SendRoundedIcon />
						</IconButton>
					)}
				</Box>
			</Box>
		</Box>
	);
}
