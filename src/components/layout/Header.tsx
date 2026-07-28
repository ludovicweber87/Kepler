'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { alpha, useTheme } from '@mui/material/styles';
import { useSearchParams } from 'next/navigation';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from './Sidebar';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import EditorPicker from './EditorPicker';
import WorktreeScripts from './WorktreeScripts';
import { useColorMode } from '@/hooks/useColorMode';
import { THEME_VARIANTS, THEME_VARIANT_SWATCH, type ThemeVariant } from '@/theme/theme';
import { useAgentSession, useAgentSessionHistory } from '@/hooks/useAgentSession';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { resolveRepoFullName } from '@/lib/resolveRepoFullName';
import { classifySession } from '@/lib/sessionStatus';
import { useTranslations } from 'next-intl';

const VARIANT_LABEL_KEY: Record<ThemeVariant, string> = {
	dark: 'themeDark',
	'dark-teal': 'themeDarkTeal',
	'dark-amber': 'themeDarkAmber',
	'light-warm': 'themeLightWarm',
	'light-cool': 'themeLightCool',
	'light-bright': 'themeLightBright',
	custom: 'themeCustom',
};

function Swatch({ variant }: { variant: ThemeVariant }) {
	const [a, b] = THEME_VARIANT_SWATCH[variant];
	return (
		<Box
			component="span"
			sx={{
				width: 14,
				height: 14,
				borderRadius: '4px',
				flexShrink: 0,
				background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)`,
				border: '1px solid',
				borderColor: 'divider',
			}}
		/>
	);
}

export default function Header() {
	const theme = useTheme();
	const { variant, setVariant } = useColorMode();
	const t = useTranslations('header');

	const searchParams = useSearchParams();
	const sessionId = searchParams.get('session') ?? undefined;
	const { session } = useAgentSession(sessionId);
	const { data: allSessions = [] } = useAgentSessionHistory();
	const resolved = session ?? allSessions.find((s) => s.session_id === sessionId) ?? null;
	const activeWorktree =
		resolved && classifySession(resolved) === 'active' ? resolved.worktree_path : null;

	const { repoPaths } = useRepoPaths();
	const repoFullName = resolveRepoFullName(resolved, repoPaths);

	// Doit suivre la sidebar avec la même durée d'animation, sinon le header
	// se désynchronise visiblement pendant la transition.
	const { collapsed } = useSidebarCollapsed();
	const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;

	return (
		<AppBar
			position="fixed"
			elevation={0}
			sx={{
				width: `calc(100% - ${sidebarWidth}px)`,
				ml: `${sidebarWidth}px`,
				transition: 'width 0.2s, margin-left 0.2s',
				bgcolor: 'transparent',
				backdropFilter: 'blur(12px)',
				borderBottom: 1,
				borderColor: 'divider',
				animation: 'fadeIn 0.3s ease-out',
			}}
		>
			<Toolbar sx={{ px: { xs: 2, md: 4 }, py: 0.5, justifyContent: 'flex-end' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
					{/* Scripts declares pour ce repo (worktree actif uniquement) */}
					{activeWorktree && sessionId && (
						<WorktreeScripts repoFullName={repoFullName} sessionId={sessionId} />
					)}

					{/* Open worktree in editor (worktree actif uniquement) */}
					{activeWorktree && <EditorPicker worktreePath={activeWorktree} />}

					{/* Theme picker */}
					<Select
						value={variant}
						onChange={(e) => setVariant(e.target.value as ThemeVariant)}
						size="small"
						aria-label={t('themeSelector')}
						renderValue={(value) => (
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<Swatch variant={value as ThemeVariant} />
								{t(VARIANT_LABEL_KEY[value as ThemeVariant])}
							</Box>
						)}
						sx={{
							color: 'text.primary',
							fontSize: '0.75rem',
							bgcolor: 'background.paper',
							borderRadius: 2,
							'& .MuiSelect-select': {
								py: 0.75,
								pl: 1.25,
								display: 'flex',
								alignItems: 'center',
							},
							'& .MuiOutlinedInput-notchedOutline': {
								borderColor: 'divider',
							},
							'&:hover .MuiOutlinedInput-notchedOutline': {
								borderColor: alpha(theme.palette.primary.main, 0.5),
							},
						}}
					>
						{THEME_VARIANTS.map((v) => (
							<MenuItem key={v} value={v} sx={{ fontSize: '0.75rem', gap: 1 }}>
								<Swatch variant={v} />
								{t(VARIANT_LABEL_KEY[v])}
							</MenuItem>
						))}
					</Select>

					<Avatar
						sx={{
							width: 34,
							height: 34,
							bgcolor: 'primary.dark',
							fontSize: '0.85rem',
							fontWeight: 600,
							transition: 'box-shadow 0.2s',
							'&:hover': {
								boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.5)}`,
							},
						}}
					>
						LW
					</Avatar>
				</Box>
			</Toolbar>
		</AppBar>
	);
}
