'use client';

import { useState } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { NewDoc, DocCategory, DocSourceType, DocLevel, DocLength, DocFormat } from '@/types';
import { CATEGORY_COLORS } from '@/components/shared/CategoryTabs';

interface RepoPathRow {
	repo_full_name: string;
	local_path: string;
}

interface Props {
	open: boolean;
	onClose: () => void;
	onSubmit: (input: NewDoc) => void;
	submitting?: boolean;
	categories: DocCategory[];
	repoPaths: RepoPathRow[];
	onCreateCategory: (name: string, color: string) => Promise<DocCategory>;
}

const LEVELS: DocLevel[] = ['beginner', 'intermediate', 'senior'];
const LENGTHS: DocLength[] = ['short', 'medium', 'long'];
const FORMATS: DocFormat[] = ['overview', 'tutorial', 'reference', 'cheatsheet', 'comparison'];

export default function DocFormDrawer(props: Props) {
	return (
		<Drawer anchor="right" open={props.open} onClose={props.onClose}>
			{props.open && <DocForm {...props} />}
		</Drawer>
	);
}

function DocForm({
	onClose,
	onSubmit,
	submitting,
	categories,
	repoPaths,
	onCreateCategory,
}: Props) {
	const t = useTranslations('docs');
	const [subject, setSubject] = useState('');
	const [sourceType, setSourceType] = useState<DocSourceType>('knowledge');
	const [repo, setRepo] = useState('');
	const [level, setLevel] = useState<DocLevel>('beginner');
	const [length, setLength] = useState<DocLength>('medium');
	const [format, setFormat] = useState<DocFormat>('overview');
	const [selectedCats, setSelectedCats] = useState<string[]>([]);
	const [angle, setAngle] = useState('');
	const [newCat, setNewCat] = useState('');
	const [creatingCat, setCreatingCat] = useState(false);

	const toggleCat = (id: string) =>
		setSelectedCats((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);

	const handleCreateCat = async () => {
		const name = newCat.trim();
		if (!name) return;
		setCreatingCat(true);
		try {
			const color = CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length];
			const created = await onCreateCategory(name, color);
			setSelectedCats((prev) => [...prev, created.id]);
			setNewCat('');
		} finally {
			setCreatingCat(false);
		}
	};

	const canSubmit = subject.trim().length > 0 && (sourceType === 'knowledge' || !!repo);

	const submit = () => {
		if (!canSubmit) return;
		onSubmit({
			subject: subject.trim(),
			source_type: sourceType,
			repo_full_name: sourceType === 'repo' ? repo : null,
			level,
			length,
			format,
			angle: angle.trim() || undefined,
			category_ids: selectedCats,
		});
	};

	const labelSx = {
		fontSize: '0.7rem',
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
		color: 'text.disabled',
		fontWeight: 600,
		mb: 0.75,
		display: 'block',
	} as const;
	const groupSx = {
		flexWrap: 'wrap',
		gap: 0.75,
		'& .MuiToggleButtonGroup-grouped': {
			border: '1px solid',
			borderColor: 'divider',
			borderRadius: '20px !important',
			textTransform: 'none',
			px: 1.75,
			py: 0.5,
			fontSize: '0.78rem',
		},
	} as const;

	return (
		<Box
			sx={{
				width: { xs: '100vw', sm: 460 },
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
			}}
		>
			<Box
				sx={{
					p: 2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					borderBottom: '1px solid',
					borderColor: 'divider',
				}}
			>
				<Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>{t('newDoc')}</Typography>
				<IconButton size="small" onClick={onClose}>
					<CloseRoundedIcon fontSize="small" />
				</IconButton>
			</Box>

			<Box sx={{ p: 2, flex: 1, overflowY: 'auto' }}>
				<Box sx={{ mb: 2.25 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.subject')} *
					</Typography>
					<TextField
						autoFocus
						fullWidth
						size="small"
						placeholder={t('form.subjectPlaceholder')}
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
					/>
				</Box>

				<Box sx={{ mb: 2.25 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.source')}
					</Typography>
					<ToggleButtonGroup
						exclusive
						fullWidth
						value={sourceType}
						onChange={(_e, v) => v && setSourceType(v)}
						size="small"
					>
						<ToggleButton value="knowledge" sx={{ textTransform: 'none' }}>
							{t('form.sourceKnowledge')}
						</ToggleButton>
						<ToggleButton value="repo" sx={{ textTransform: 'none' }}>
							{t('form.sourceRepo')}
						</ToggleButton>
					</ToggleButtonGroup>
					{sourceType === 'repo' && (
						<TextField
							select
							fullWidth
							size="small"
							sx={{ mt: 1 }}
							label={t('form.repo')}
							value={repo}
							onChange={(e) => setRepo(e.target.value)}
						>
							{repoPaths.length === 0 && (
								<MenuItem value="" disabled>
									{t('form.noRepos')}
								</MenuItem>
							)}
							{repoPaths.map((r) => (
								<MenuItem key={r.repo_full_name} value={r.repo_full_name}>
									{r.repo_full_name}
								</MenuItem>
							))}
						</TextField>
					)}
				</Box>

				<Box sx={{ mb: 2.25 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.level')}
					</Typography>
					<ToggleButtonGroup
						exclusive
						value={level}
						onChange={(_e, v) => v && setLevel(v)}
						size="small"
						sx={groupSx}
					>
						{LEVELS.map((l) => (
							<ToggleButton key={l} value={l}>
								{t(`level.${l}`)}
							</ToggleButton>
						))}
					</ToggleButtonGroup>
				</Box>

				<Box sx={{ mb: 2.25 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.length')}
					</Typography>
					<ToggleButtonGroup
						exclusive
						value={length}
						onChange={(_e, v) => v && setLength(v)}
						size="small"
						sx={groupSx}
					>
						{LENGTHS.map((l) => (
							<ToggleButton key={l} value={l}>
								{t(`length.${l}`)}
							</ToggleButton>
						))}
					</ToggleButtonGroup>
				</Box>

				<Box sx={{ mb: 2.25 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.format')}
					</Typography>
					<ToggleButtonGroup
						exclusive
						value={format}
						onChange={(_e, v) => v && setFormat(v)}
						size="small"
						sx={groupSx}
					>
						{FORMATS.map((f) => (
							<ToggleButton key={f} value={f}>
								{t(`format.${f}`)}
							</ToggleButton>
						))}
					</ToggleButtonGroup>
				</Box>

				<Box sx={{ mb: 2.25 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.categories')}
					</Typography>
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
						{categories.map((c) => {
							const on = selectedCats.includes(c.id);
							return (
								<Chip
									key={c.id}
									label={c.name}
									size="small"
									onClick={() => toggleCat(c.id)}
									variant={on ? 'filled' : 'outlined'}
									sx={{
										height: 24,
										fontSize: '0.72rem',
										bgcolor: on ? alpha(c.color, 0.2) : 'transparent',
										color: on ? c.color : 'text.secondary',
										borderColor: alpha(c.color, 0.5),
									}}
								/>
							);
						})}
					</Box>
					<Stack direction="row" spacing={1}>
						<TextField
							size="small"
							fullWidth
							placeholder={t('form.newCategoryPlaceholder')}
							value={newCat}
							onChange={(e) => setNewCat(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									void handleCreateCat();
								}
							}}
						/>
						<IconButton
							size="small"
							onClick={() => void handleCreateCat()}
							disabled={!newCat.trim() || creatingCat}
						>
							<AddRoundedIcon fontSize="small" />
						</IconButton>
					</Stack>
				</Box>

				<Box sx={{ mb: 1 }}>
					<Typography component="label" sx={labelSx}>
						{t('form.angle')} · {t('form.optional')}
					</Typography>
					<TextField
						fullWidth
						size="small"
						multiline
						minRows={2}
						placeholder={t('form.anglePlaceholder')}
						value={angle}
						onChange={(e) => setAngle(e.target.value)}
					/>
				</Box>
			</Box>

			<Box
				sx={{
					p: 2,
					borderTop: '1px solid',
					borderColor: 'divider',
					display: 'flex',
					gap: 1,
					justifyContent: 'flex-end',
				}}
			>
				<Button onClick={onClose} sx={{ textTransform: 'none' }}>
					{t('cancel')}
				</Button>
				<Button
					variant="contained"
					onClick={submit}
					disabled={!canSubmit || submitting}
					sx={{ textTransform: 'none' }}
				>
					{t('form.submit')}
				</Button>
			</Box>
		</Box>
	);
}
