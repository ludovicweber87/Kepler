'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useTranslations } from 'next-intl';
import type { DocCategory } from '@/types';

export const DOC_CATEGORY_COLORS = [
	'#7C5CFF',
	'#00D4FF',
	'#22C55E',
	'#F59E0B',
	'#EF4444',
	'#EC4899',
	'#14B8A6',
	'#A855F7',
];

interface Props {
	categories: DocCategory[];
	activeId: string; // 'all' | category id
	onChange: (id: string) => void;
	onCreate: (name: string, color: string) => void;
	onDelete: (id: string) => void;
}

export default function CategoryTabs({
	categories,
	activeId,
	onChange,
	onCreate,
	onDelete,
}: Props) {
	const t = useTranslations('docs');
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const [name, setName] = useState('');
	const [color, setColor] = useState(DOC_CATEGORY_COLORS[0]);
	const [ctxMenu, setCtxMenu] = useState<{ el: HTMLElement; id: string } | null>(null);

	const openCreate = (el: HTMLElement) => {
		setName('');
		setColor(DOC_CATEGORY_COLORS[0]);
		setAnchor(el);
	};

	const submit = () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		onCreate(trimmed, color);
		setAnchor(null);
	};

	// La valeur des Tabs ne doit exister que si elle correspond à une catégorie connue.
	const tabValue =
		activeId === 'all' || categories.some((c) => c.id === activeId) ? activeId : 'all';

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				borderBottom: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Tabs
				value={tabValue}
				onChange={(_e, v) => onChange(v)}
				variant="scrollable"
				scrollButtons="auto"
				sx={{
					flex: 1,
					minHeight: 40,
					'& .MuiTab-root': { minHeight: 40, textTransform: 'none' },
				}}
			>
				<Tab value="all" label={t('allTab')} />
				{categories.map((c) => (
					<Tab
						key={c.id}
						value={c.id}
						onContextMenu={(e) => {
							e.preventDefault();
							setCtxMenu({ el: e.currentTarget as HTMLElement, id: c.id });
						}}
						label={
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										bgcolor: c.color,
									}}
								/>
								{c.name}
							</Box>
						}
					/>
				))}
			</Tabs>

			<Button
				size="small"
				startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
				onClick={(e) => openCreate(e.currentTarget)}
				sx={{ textTransform: 'none', color: 'secondary.main', flexShrink: 0, ml: 1 }}
			>
				{t('addCategory')}
			</Button>

			<Popover
				open={!!anchor}
				anchorEl={anchor}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				<Box sx={{ p: 2, width: 260 }}>
					<Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
						{t('newCategory')}
					</Typography>
					<TextField
						autoFocus
						fullWidth
						size="small"
						margin="dense"
						placeholder={t('categoryName')}
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								submit();
							}
						}}
					/>
					<Stack direction="row" spacing={1} sx={{ my: 1.25 }}>
						{DOC_CATEGORY_COLORS.map((c) => (
							<Box
								key={c}
								onClick={() => setColor(c)}
								sx={{
									width: 20,
									height: 20,
									borderRadius: '50%',
									bgcolor: c,
									cursor: 'pointer',
									border: '2px solid',
									borderColor: color === c ? 'text.primary' : 'transparent',
								}}
							/>
						))}
					</Stack>
					<Stack direction="row" spacing={1} justifyContent="flex-end">
						<Button
							size="small"
							onClick={() => setAnchor(null)}
							sx={{ textTransform: 'none' }}
						>
							{t('cancel')}
						</Button>
						<Button
							size="small"
							variant="contained"
							onClick={submit}
							disabled={!name.trim()}
							sx={{ textTransform: 'none' }}
						>
							{t('create')}
						</Button>
					</Stack>
				</Box>
			</Popover>

			<Menu anchorEl={ctxMenu?.el} open={!!ctxMenu} onClose={() => setCtxMenu(null)}>
				<MenuItem
					onClick={() => {
						if (ctxMenu) onDelete(ctxMenu.id);
						setCtxMenu(null);
					}}
					sx={{ fontSize: '0.8rem', gap: 1, color: 'error.main' }}
				>
					<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
					{t('deleteCategory')}
				</MenuItem>
			</Menu>
		</Box>
	);
}
