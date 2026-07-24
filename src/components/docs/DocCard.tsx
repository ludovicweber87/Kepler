'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { DocWithCategories, DocCategory } from '@/types';
import DocStatusBadge from './DocStatusBadge';

interface Props {
	doc: DocWithCategories;
	categories: DocCategory[];
	onOpen: (doc: DocWithCategories) => void;
	onDelete: (doc: DocWithCategories) => void;
}

export default function DocCard({ doc, categories, onOpen, onDelete }: Props) {
	const t = useTranslations('docs');
	const docCategories = categories.filter((c) => doc.category_ids.includes(c.id));

	return (
		<Card
			onClick={() => onOpen(doc)}
			sx={{
				p: 1.75,
				borderRadius: 2.5,
				cursor: 'pointer',
				border: '1px solid',
				borderColor: 'divider',
				transition: 'transform 0.15s, border-color 0.15s',
				'&:hover': { transform: 'translateY(-2px)', borderColor: 'text.disabled' },
				'&:hover .doc-del': { opacity: 1 },
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
				<DocStatusBadge status={doc.status} />
				<IconButton
					className="doc-del"
					size="small"
					onClick={(e) => {
						e.stopPropagation();
						onDelete(doc);
					}}
					sx={{
						opacity: 0,
						transition: 'opacity 0.15s',
						color: 'text.disabled',
						'&:hover': { color: 'error.main' },
					}}
				>
					<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
				</IconButton>
			</Box>

			<Typography sx={{ mt: 1, fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.35 }}>
				{doc.title}
			</Typography>

			<Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
				<Chip
					label={t(`format.${doc.format}`)}
					size="small"
					variant="outlined"
					sx={{
						height: 20,
						fontSize: '0.65rem',
						borderColor: alpha('#7C5CFF', 0.45),
						color: '#c3b4ff',
					}}
				/>
				<Chip
					label={t(`level.${doc.level}`)}
					size="small"
					variant="outlined"
					sx={{ height: 20, fontSize: '0.65rem' }}
				/>
				{docCategories.map((c) => (
					<Chip
						key={c.id}
						label={c.name}
						size="small"
						sx={{
							height: 20,
							fontSize: '0.65rem',
							bgcolor: alpha(c.color, 0.16),
							color: c.color,
						}}
					/>
				))}
			</Box>

			<Box
				sx={{
					mt: 1.25,
					display: 'flex',
					alignItems: 'center',
					gap: 0.75,
					color: 'text.disabled',
				}}
			>
				{doc.source_type === 'repo' ? (
					<FolderRoundedIcon sx={{ fontSize: 13 }} />
				) : (
					<PublicRoundedIcon sx={{ fontSize: 13 }} />
				)}
				<Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
					{doc.source_type === 'repo' && doc.repo_full_name
						? doc.repo_full_name
						: t('source.knowledge')}
					{' · '}
					{t(`length.${doc.length}`)}
				</Typography>
			</Box>

			{doc.status === 'failed' && doc.error && (
				<Tooltip title={doc.error}>
					<Typography
						variant="caption"
						sx={{
							mt: 0.75,
							display: 'block',
							color: 'error.main',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{doc.error}
					</Typography>
				</Tooltip>
			)}
		</Card>
	);
}
