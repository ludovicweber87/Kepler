'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useFileTree } from '@/hooks/useFileTree';
import { buildFileTree, filterTree, flattenVisible, isActivePath } from '@/lib/fileTree';

/**
 * Cap du nombre de lignes réellement montées dans le DOM. Bien au-dessus de
 * toute profondeur de navigation utile, bien en-dessous du seuil de freeze :
 * un filtre large sur un monorepo de 20 000 fichiers peut faire remonter
 * ~21 700 lignes (fichiers + ancêtres), soit ~65 000 éléments MUI stylés —
 * un commit non interruptible qui bloque le thread principal. Pas de
 * virtualisation ici (changement disproportionné pour ce bug) : on tronque
 * et on le dit, jamais silencieusement.
 */
const MAX_EXPLORER_ROWS = 500;

interface FileExplorerTabProps {
	/** Racine de l'arborescence : worktree de la session, sinon dépôt principal. */
	cwd: string | null;
	/** Chemin de l'onglet gauche actif (relatif ou absolu), pour le surlignage. */
	activePath: string | null;
	onOpenFile: (path: string) => void;
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100%',
				px: 2,
				textAlign: 'center',
			}}
		>
			{children}
		</Box>
	);
}

export default function FileExplorerTab({ cwd, activePath, onOpenFile }: FileExplorerTabProps) {
	const t = useTranslations('workbench');
	const { files, truncated, isLoading, error, notARepo } = useFileTree(cwd);

	const [query, setQuery] = useState('');
	// useDeferredValue plutôt qu'un debounce manuel : la saisie reste fluide et
	// le filtrage de l'arbre est recalculé en arrière-plan par React.
	const deferredQuery = useDeferredValue(query);

	// `expanded` est l'unique source de vérité du rendu : un clic doit toujours
	// le faire basculer, filtre actif ou non. Pas de second set fusionné au
	// moment du rendu — une fusion rendrait certains clics muets (un dossier
	// ouvert par le filtre resterait ouvert malgré le clic).
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	// Etat de dépliage figé au démarrage du filtre, restauré à l'identique quand
	// il est effacé — y compris les dossiers repliés manuellement, à l'exclusion
	// de tout dépliage dû au filtre ou à un clic pendant qu'il est actif.
	const [preFilterExpanded, setPreFilterExpanded] = useState<Set<string> | null>(null);
	const [prevQuery, setPrevQuery] = useState(deferredQuery);

	// Changer de session change de racine : filtre et dépliage n'ont plus de sens.
	// Ajustement pendant le rendu plutôt qu'un effet (pattern recommandé par React
	// pour réinitialiser un state quand une prop change), pour éviter un rendu
	// supplémentaire avec l'ancien state.
	const [prevCwd, setPrevCwd] = useState(cwd);
	if (cwd !== prevCwd) {
		setPrevCwd(cwd);
		setQuery('');
		setExpanded(new Set());
		setPreFilterExpanded(null);
		setPrevQuery('');
	}

	const tree = useMemo(() => buildFileTree(files), [files]);
	const { nodes, expand } = useMemo(() => filterTree(tree, deferredQuery), [tree, deferredQuery]);
	// Précédent `expand` : sert à isoler les dossiers nouvellement matchés d'une
	// frappe à l'autre (voir branche « filtre en cours » ci-dessous).
	const [prevExpand, setPrevExpand] = useState(expand);

	// Même pattern qu'au-dessus, appliqué à la transition du filtre. Démarrage :
	// on fige l'état courant puis on révèle les matches dans `expanded`. Fin : on
	// restaure l'état figé tel quel. Tant que le filtre reste actif, chaque
	// changement de requête ne révèle que les dossiers qui matchent pour la
	// première fois (absents de l'ancien `expand`) : un dossier déjà présent dans
	// l'ancien et le nouveau `expand` n'est pas réinjecté, ce qui laisse survivre
	// un clic de fermeture fait pendant que le filtre reste actif. Jamais de
	// fusion permanente des deux sets, jamais de clic annulé.
	if (deferredQuery !== prevQuery) {
		const wasFiltering = prevQuery.trim() !== '';
		const isFiltering = deferredQuery.trim() !== '';
		setPrevQuery(deferredQuery);
		setPrevExpand(expand);
		if (!wasFiltering && isFiltering) {
			setPreFilterExpanded(expanded);
			setExpanded((prev) => new Set([...prev, ...expand]));
		} else if (wasFiltering && !isFiltering) {
			setExpanded(preFilterExpanded ?? expanded);
			setPreFilterExpanded(null);
		} else if (isFiltering) {
			const newlyMatched = [...expand].filter((path) => !prevExpand.has(path));
			setExpanded((prev) => new Set([...prev, ...newlyMatched]));
		}
	}

	const rows = useMemo(() => flattenVisible(nodes, expanded), [nodes, expanded]);
	const visibleRows = useMemo(() => rows.slice(0, MAX_EXPLORER_ROWS), [rows]);
	const rowsTruncated = rows.length > MAX_EXPLORER_ROWS;

	// Invariant (RULING) : un clic sur un dossier fait TOUJOURS autorité sur son
	// dépliage, filtre actif ou non. Conséquence acceptée : si l'utilisateur
	// replie un parent puis affine la requête vers un descendant qui matche
	// nouvellement, ce descendant reste invisible — le parent replié n'est
	// jamais redéplié automatiquement. Délibéré, pas un oubli : voir le journal
	// de la Task 4 (`.superpowers/sdd/2026-07-27-file-explorer/progress.md`).
	const toggle = (path: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	if (isLoading) {
		return (
			<Centered>
				<CircularProgress size={18} />
			</Centered>
		);
	}

	if (error) {
		return (
			<Centered>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{notARepo ? t('explorerNotARepo') : t('explorerError')}
				</Typography>
			</Centered>
		);
	}

	if (files.length === 0) {
		return (
			<Centered>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('explorerEmpty')}
				</Typography>
			</Centered>
		);
	}

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					px: 1.5,
					py: 0.75,
					borderBottom: 1,
					borderColor: 'divider',
					flexShrink: 0,
				}}
			>
				<SearchRoundedIcon sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
				<InputBase
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t('explorerFilter')}
					sx={{ flex: 1, fontSize: '0.72rem', '& input': { p: 0 } }}
				/>
				{query && (
					<IconButton
						size="small"
						onClick={() => setQuery('')}
						aria-label={t('explorerClearFilter')}
						sx={{ p: 0.25, color: 'text.disabled' }}
					>
						<CloseRoundedIcon sx={{ fontSize: 14 }} />
					</IconButton>
				)}
			</Box>

			{truncated && (
				<Typography
					variant="caption"
					sx={{
						px: 1.5,
						py: 0.5,
						color: 'warning.main',
						borderBottom: 1,
						borderColor: 'divider',
						flexShrink: 0,
					}}
				>
					{t('explorerTruncated')}
				</Typography>
			)}

			{rows.length === 0 ? (
				// flex: 1 indispensable : Centered s'appuie sur height 100%, qui ne
				// vaut rien sur un enfant flex qui n'occupe pas l'espace restant.
				<Box sx={{ flex: 1, minHeight: 0 }}>
					<Centered>
						<Typography variant="caption" sx={{ color: 'text.disabled' }}>
							{t('explorerNoMatch')}
						</Typography>
					</Centered>
				</Box>
			) : (
				<Box
					sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', py: 0.5 }}
				>
					{visibleRows.map((node) => {
						const active = !node.isDir && isActivePath(node.path, activePath);
						const open = expanded.has(node.path);
						return (
							<Box
								key={node.path}
								onClick={() =>
									node.isDir ? toggle(node.path) : onOpenFile(node.path)
								}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 0.5,
									height: 22,
									pr: 1.5,
									pl: 1 + node.depth * 1.25,
									cursor: 'pointer',
									bgcolor: active ? 'action.selected' : 'transparent',
									transition: 'background-color 0.15s',
									'&:hover': { bgcolor: 'action.hover' },
								}}
							>
								{node.isDir ? (
									<>
										{open ? (
											<KeyboardArrowDownRoundedIcon
												sx={{
													fontSize: 14,
													color: 'text.disabled',
													flexShrink: 0,
												}}
											/>
										) : (
											<KeyboardArrowRightRoundedIcon
												sx={{
													fontSize: 14,
													color: 'text.disabled',
													flexShrink: 0,
												}}
											/>
										)}
										<FolderRoundedIcon
											sx={{
												fontSize: 13,
												flexShrink: 0,
												color: (theme) =>
													alpha(theme.palette.primary.main, 0.7),
											}}
										/>
									</>
								) : (
									<>
										<Box sx={{ width: 14, flexShrink: 0 }} />
										<InsertDriveFileRoundedIcon
											sx={{
												fontSize: 13,
												color: 'text.disabled',
												flexShrink: 0,
											}}
										/>
									</>
								)}
								<Typography
									variant="caption"
									title={node.path}
									sx={{
										flex: 1,
										minWidth: 0,
										fontSize: '0.72rem',
										fontWeight: active ? 600 : 400,
										color: active ? 'text.primary' : 'text.secondary',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{node.name}
								</Typography>
							</Box>
						);
					})}
					{rowsTruncated && (
						<Typography
							variant="caption"
							sx={{
								display: 'block',
								px: 1.5,
								py: 0.5,
								color: 'warning.main',
							}}
						>
							{t('explorerTooManyRows', { count: MAX_EXPLORER_ROWS })}
						</Typography>
					)}
				</Box>
			)}
		</Box>
	);
}
