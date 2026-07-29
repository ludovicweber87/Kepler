'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { useTranslations } from 'next-intl';
import { useDocs } from '@/hooks/useDocs';
import { useDocCategories } from '@/hooks/useDocCategories';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { DocWithCategories, NewDoc } from '@/types';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import DocCard from './DocCard';
import CategoryTabs from './CategoryTabs';
import DocFormDrawer from './DocFormDrawer';

export default function DocsPage() {
	const t = useTranslations('docs');
	const router = useRouter();
	const { docs, isLoading, createDoc, deleteDoc } = useDocs();
	const { categories, createCategory, deleteCategory } = useDocCategories();
	const { repoPaths } = useRepoPaths();
	const { showSnackbar } = useSnackbar();

	const [activeCategory, setActiveCategory] = useState('all');
	const [search, setSearch] = useState('');
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return docs.filter((d) => {
			if (activeCategory !== 'all' && !d.category_ids.includes(activeCategory)) return false;
			if (q && !d.title.toLowerCase().includes(q) && !d.subject.toLowerCase().includes(q))
				return false;
			return true;
		});
	}, [docs, activeCategory, search]);

	const handleCreate = async (input: NewDoc) => {
		setSubmitting(true);
		try {
			await createDoc(input);
			setDrawerOpen(false);
			showSnackbar(t('created'), 'success');
		} catch {
			showSnackbar(t('createFailed'), 'error');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDelete = (doc: DocWithCategories) => {
		deleteDoc(doc.id);
	};

	const handleCreateCategory = async (name: string, color: string) => {
		try {
			return await createCategory({ name, color });
		} catch {
			showSnackbar(t('categoryCreateFailed'), 'error');
			throw new Error('category create failed');
		}
	};

	return (
		<PageContainer fullHeight>
			<PageHeader
				title={t('title')}
				titleSuffix={
					<Typography variant="body2" sx={{ color: 'text.disabled' }}>
						· {docs.length}
					</Typography>
				}
				actions={
					<>
						<TextField
							size="small"
							placeholder={t('searchPlaceholder')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							InputProps={{
								startAdornment: (
									<InputAdornment position="start">
										<SearchRoundedIcon sx={{ fontSize: 18 }} />
									</InputAdornment>
								),
							}}
							sx={{ width: 240 }}
						/>
						<Button
							variant="contained"
							startIcon={<AddRoundedIcon />}
							onClick={() => setDrawerOpen(true)}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{t('newDoc')}
						</Button>
					</>
				}
			/>

			<CategoryTabs
				categories={categories}
				activeId={activeCategory}
				onChange={setActiveCategory}
				onCreate={(name, color) => void handleCreateCategory(name, color)}
				onDelete={(id) => deleteCategory(id)}
			/>

			<Box sx={{ flex: 1, overflowY: 'auto', mt: 2 }}>
				{isLoading ? (
					<Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
						<CircularProgress />
					</Box>
				) : filtered.length === 0 ? (
					<Box sx={{ textAlign: 'center', mt: 8, color: 'text.disabled' }}>
						<MenuBookRoundedIcon sx={{ fontSize: 48, opacity: 0.4 }} />
						<Typography sx={{ mt: 1, fontWeight: 600 }}>{t('empty')}</Typography>
						<Typography variant="body2">{t('emptyHint')}</Typography>
					</Box>
				) : (
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
							gap: 1.5,
						}}
					>
						{filtered.map((doc) => (
							<DocCard
								key={doc.id}
								doc={doc}
								categories={categories}
								onOpen={(d) => router.push(`/docs/${d.id}`)}
								onDelete={handleDelete}
							/>
						))}
					</Box>
				)}
			</Box>

			<DocFormDrawer
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
				onSubmit={handleCreate}
				submitting={submitting}
				categories={categories}
				repoPaths={repoPaths}
				onCreateCategory={handleCreateCategory}
			/>
		</PageContainer>
	);
}
