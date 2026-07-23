'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { useTranslations } from 'next-intl';

type EditableSessionNameProps = {
	/** Label humain (agent_name). Découplé de la branche git. */
	value: string | null | undefined;
	/** Texte affiché si aucun label n'est défini. */
	fallback: string;
	/** Appelé avec le nouveau nom (trim, non vide, différent de l'actuel). */
	onRename: (name: string) => void;
	/** Désactive l'édition (ex. session pas encore résolue). */
	disabled?: boolean;
};

/**
 * Label de session éditable en place. Un clic (ou double-clic sur le texte)
 * ouvre un input inline ; Entrée/blur valide, Échap annule. Le renommage ne
 * touche jamais la branche ni le worktree — c'est un simple label DB.
 */
export default function EditableSessionName({
	value,
	fallback,
	onRename,
	disabled,
}: EditableSessionNameProps) {
	const t = useTranslations('workbench');
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const current = value?.trim() ?? '';
	const display = current || fallback;

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	const start = () => {
		if (disabled) return;
		setDraft(current);
		setEditing(true);
	};

	const commit = () => {
		const next = draft.trim();
		setEditing(false);
		if (next && next !== current) onRename(next);
	};

	if (editing) {
		return (
			<InputBase
				inputRef={inputRef}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commit();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						setEditing(false);
					}
				}}
				inputProps={{ 'aria-label': t('renameLabel'), maxLength: 80 }}
				sx={{
					fontSize: '0.875rem',
					fontWeight: 600,
					px: 0.75,
					py: 0.1,
					borderRadius: 1,
					bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
					'& input': { p: 0 },
				}}
			/>
		);
	}

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 0.25,
				minWidth: 0,
				'&:hover .rename-btn': { opacity: disabled ? 0 : 1 },
			}}
		>
			<Typography
				variant="subtitle2"
				onDoubleClick={start}
				sx={{
					fontWeight: 600,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					cursor: disabled ? 'default' : 'text',
				}}
			>
				{display}
			</Typography>
			{!disabled && (
				<Tooltip title={t('renameLabel')} arrow>
					<IconButton
						className="rename-btn"
						size="small"
						aria-label={t('renameLabel')}
						onClick={start}
						sx={{ opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
					>
						<EditRoundedIcon sx={{ fontSize: 13 }} />
					</IconButton>
				</Tooltip>
			)}
		</Box>
	);
}
