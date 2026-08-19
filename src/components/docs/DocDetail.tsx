'use client';

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useDoc } from '@/hooks/useDoc';
import { useDocCategories } from '@/hooks/useDocCategories';
import { useSnackbar } from '@/hooks/useSnackbar';
import { slugify, extractToc } from '@/lib/docToc';
import DocChatPanel from './DocChatPanel';

export default function DocDetail({ docId }: { docId: string }) {
	const t = useTranslations('docs');
	const router = useRouter();
	const { doc, isLoading, saveContent, saving, retry } = useDoc(docId);
	const { categories } = useDocCategories();
	const { showSnackbar } = useSnackbar();
	const queryClient = useQueryClient();

	// Les outils MCP du chat écrivent la doc côté serveur : on la relit à la fin
	// de chaque tour de l'agent.
	const onDocChanged = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ['doc', docId] });
	}, [queryClient, docId]);

	const [mode, setMode] = useState<'read' | 'edit'>('read');
	const [draft, setDraft] = useState('');
	const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);

	const enterEdit = () => {
		setDraft(doc?.content ?? '');
		setMode('edit');
	};

	const toc = useMemo(() => extractToc(doc?.content ?? ''), [doc?.content]);
	const busy = doc?.status === 'queued' || doc?.status === 'generating';
	// Doc importée : pas de format ni de niveau à afficher (cf. DocCard).
	const imported = doc?.source_type === 'import';
	const docCategories = categories.filter((c) => doc?.category_ids.includes(c.id));

	if (isLoading) {
		return (
			<Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
				<CircularProgress />
			</Box>
		);
	}
	if (!doc) {
		return (
			<Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
				<Typography>{t('notFound')}</Typography>
				<Button onClick={() => router.push('/docs')} sx={{ mt: 2, textTransform: 'none' }}>
					{t('backToList')}
				</Button>
			</Box>
		);
	}

	const copyMarkdown = async () => {
		await navigator.clipboard.writeText(doc.content ?? '');
		showSnackbar(t('copied'), 'success');
		setExportAnchor(null);
	};
	const downloadMarkdown = () => {
		const blob = new Blob([doc.content ?? ''], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${slugify(doc.title) || 'doc'}.md`;
		a.click();
		URL.revokeObjectURL(url);
		setExportAnchor(null);
	};
	const saveDraft = async () => {
		await saveContent(draft);
		setMode('read');
		showSnackbar(t('saved'), 'success');
	};

	return (
		<Box
			sx={{
				height: '100%',
				width: '100%',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			{/* Toolbar */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					px: 2,
					py: 1.25,
					borderBottom: '1px solid',
					borderColor: 'divider',
				}}
			>
				<IconButton size="small" onClick={() => router.push('/docs')}>
					<ArrowBackRoundedIcon fontSize="small" />
				</IconButton>
				<Typography sx={{ fontWeight: 600, fontSize: '0.95rem', mr: 1 }} noWrap>
					{doc.title}
				</Typography>
				{imported ? (
					<Chip
						label={t('importedBadge')}
						size="small"
						variant="outlined"
						sx={{
							height: 20,
							fontSize: '0.65rem',
							borderColor: alpha('#00D4FF', 0.4),
							color: '#9fe8ff',
						}}
					/>
				) : (
					<>
						<Chip
							label={t(`format.${doc.format}`)}
							size="small"
							variant="outlined"
							sx={{
								height: 20,
								fontSize: '0.65rem',
								borderColor: alpha('#00D4FF', 0.4),
								color: '#9fe8ff',
							}}
						/>
						<Chip
							label={t(`level.${doc.level}`)}
							size="small"
							variant="outlined"
							sx={{ height: 20, fontSize: '0.65rem' }}
						/>
					</>
				)}
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
				<Box sx={{ flex: 1 }} />
				<ToggleButtonGroup
					exclusive
					size="small"
					value={mode}
					onChange={(_e, v) => {
						if (!v) return;
						if (v === 'edit') enterEdit();
						else setMode('read');
					}}
					disabled={busy || !doc.content}
				>
					<ToggleButton value="read" sx={{ textTransform: 'none', py: 0.25 }}>
						{t('read')}
					</ToggleButton>
					<ToggleButton value="edit" sx={{ textTransform: 'none', py: 0.25 }}>
						{t('edit')}
					</ToggleButton>
				</ToggleButtonGroup>
				<Tooltip title={t('export')}>
					<span>
						<IconButton
							size="small"
							onClick={(e) => setExportAnchor(e.currentTarget)}
							disabled={!doc.content}
						>
							<DownloadRoundedIcon fontSize="small" />
						</IconButton>
					</span>
				</Tooltip>
				<Menu
					anchorEl={exportAnchor}
					open={!!exportAnchor}
					onClose={() => setExportAnchor(null)}
				>
					<MenuItem onClick={copyMarkdown} sx={{ fontSize: '0.8rem', gap: 1 }}>
						<ContentCopyRoundedIcon sx={{ fontSize: 16 }} /> {t('copyMarkdown')}
					</MenuItem>
					<MenuItem onClick={downloadMarkdown} sx={{ fontSize: '0.8rem', gap: 1 }}>
						<DownloadRoundedIcon sx={{ fontSize: 16 }} /> {t('downloadMd')}
					</MenuItem>
				</Menu>
			</Box>

			{/* Body */}
			<Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
				{/* TOC */}
				{toc.length > 0 && mode === 'read' && (
					<Box
						sx={{
							width: 200,
							borderRight: '1px solid',
							borderColor: 'divider',
							p: 2,
							overflowY: 'auto',
							display: { xs: 'none', md: 'block' },
						}}
					>
						<Typography
							variant="caption"
							sx={{
								color: 'text.disabled',
								fontWeight: 700,
								textTransform: 'uppercase',
								letterSpacing: 1,
							}}
						>
							{t('toc')}
						</Typography>
						<Box sx={{ mt: 1 }}>
							{toc.map((e, i) => (
								<Typography
									key={i}
									component="a"
									href={`#${e.slug}`}
									variant="body2"
									sx={{
										display: 'block',
										color: 'text.secondary',
										textDecoration: 'none',
										fontSize: '0.78rem',
										py: 0.4,
										pl: (e.depth - 1) * 1.25,
										'&:hover': { color: 'primary.main' },
									}}
								>
									{e.text}
								</Typography>
							))}
						</Box>
					</Box>
				)}

				{/* Reading / editing */}
				<Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, md: 4 }, minWidth: 0 }}>
					{busy && !doc.content ? (
						<Box
							sx={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								mt: 6,
								gap: 2,
								color: 'text.disabled',
							}}
						>
							<CircularProgress />
							<Typography>{t('generatingHint')}</Typography>
						</Box>
					) : doc.status === 'failed' && !doc.content ? (
						<Box sx={{ textAlign: 'center', mt: 6 }}>
							<Typography color="error" sx={{ mb: 1 }}>
								{doc.error || t('generationFailed')}
							</Typography>
							<Button
								startIcon={<RefreshRoundedIcon />}
								onClick={retry}
								sx={{ textTransform: 'none' }}
							>
								{t('retry')}
							</Button>
						</Box>
					) : mode === 'edit' ? (
						<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
							<TextField
								multiline
								fullWidth
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								sx={{
									flex: 1,
									'& .MuiInputBase-root': {
										alignItems: 'flex-start',
										fontFamily: 'monospace',
										fontSize: '0.82rem',
									},
								}}
							/>
							<Box
								sx={{
									mt: 1.5,
									display: 'flex',
									gap: 1,
									justifyContent: 'flex-end',
								}}
							>
								<Button
									onClick={() => {
										setDraft(doc.content ?? '');
										setMode('read');
									}}
									sx={{ textTransform: 'none' }}
								>
									{t('cancel')}
								</Button>
								<Button
									variant="contained"
									onClick={saveDraft}
									disabled={saving}
									sx={{ textTransform: 'none' }}
								>
									{t('save')}
								</Button>
							</Box>
						</Box>
					) : (
						<Box
							className="doc-markdown"
							sx={{
								maxWidth: 820,
								'& h1': { fontSize: '1.7rem', mb: 2 },
								'& h2': {
									fontSize: '1.3rem',
									mt: 3,
									mb: 1.5,
									pb: 0.5,
									borderBottom: '1px solid',
									borderColor: 'divider',
								},
								'& h3': { fontSize: '1.05rem', mt: 2.5, mb: 1 },
								'& p': { lineHeight: 1.7, mb: 1.5 },
								'& ul, & ol': { pl: 3, mb: 1.5, lineHeight: 1.7 },
								'& li': { mb: 0.5 },
								'& code': {
									bgcolor: 'action.hover',
									px: 0.75,
									py: 0.25,
									borderRadius: 1,
									fontSize: '0.82em',
									fontFamily: 'monospace',
								},
								'& pre': {
									bgcolor: 'action.hover',
									p: 2,
									borderRadius: 2,
									overflow: 'auto',
									mb: 2,
								},
								'& pre code': { bgcolor: 'transparent', p: 0 },
								'& table': { borderCollapse: 'collapse', mb: 2, width: '100%' },
								'& th, & td': {
									border: '1px solid',
									borderColor: 'divider',
									px: 1.5,
									py: 0.75,
									textAlign: 'left',
								},
								'& a': { color: 'primary.main' },
							}}
						>
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{doc.content ?? ''}
							</ReactMarkdown>
						</Box>
					)}
				</Box>

				<DocChatPanel
					docId={docId}
					docStatus={doc.status}
					hasContent={!!doc.content}
					editing={mode === 'edit'}
					onDocChanged={onDocChanged}
				/>
			</Box>
		</Box>
	);
}
