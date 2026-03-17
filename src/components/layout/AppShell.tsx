'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Sidebar from './Sidebar';
import Header from './Header';
import RightSidebar, { RIGHT_SIDEBAR_WIDTH } from './RightSidebar';
import OverlayTerminal from './OverlayTerminal';
import AppLoadingSplash from './AppLoadingSplash';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { RightSidebarContext } from '@/hooks/useRightSidebar';
import { OverlayTerminalContext, type OverlaySession } from '@/hooks/useOverlayTerminal';

export default function AppShell({ children }: { children: React.ReactNode }) {
	const { status } = useSession();
	const { repoPaths, repoPathsLoading } = useRepoPaths();
	const t = useTranslations('onboarding');
	const [rightOpen, setRightOpen] = useState(true);
	const [rightWidth, setRightWidth] = useState(RIGHT_SIDEBAR_WIDTH);
	const [overlaySession, setOverlaySession] = useState<OverlaySession | null>(null);

	const rightCtx = useMemo(
		() => ({
			open: rightOpen,
			toggle: () => setRightOpen((v) => !v),
			width: rightWidth,
			setWidth: setRightWidth,
		}),
		[rightOpen, rightWidth],
	);

	const openOverlay = useCallback((s: OverlaySession) => setOverlaySession(s), []);
	const closeOverlay = useCallback(() => setOverlaySession(null), []);

	const overlayCtx = useMemo(
		() => ({ session: overlaySession, open: openOverlay, close: closeOverlay }),
		[overlaySession, openOverlay, closeOverlay],
	);

	if (status === 'loading' || repoPathsLoading) return <AppLoadingSplash />;

	if (repoPaths.length === 0) {
		return (
			<Box
				sx={{
					minHeight: '100vh',
					bgcolor: 'background.default',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					py: 6,
					px: 2,
				}}
			>
				<Image src="/logo.svg" alt="Devora" width={200} height={48} priority />
				<Typography
					variant="h5"
					sx={{ fontWeight: 700, mt: 4, mb: 1, color: 'text.primary' }}
				>
					{t('welcome')}
				</Typography>
				<Typography
					variant="body1"
					sx={{
						color: 'text.secondary',
						textAlign: 'center',
						maxWidth: 600,
						mb: 4,
						lineHeight: 1.7,
					}}
				>
					{t('description')}
				</Typography>
				<Box sx={{ width: '100%', maxWidth: 900 }}>
					<SettingsPanel />
				</Box>
			</Box>
		);
	}

	return (
		<RightSidebarContext.Provider value={rightCtx}>
			<OverlayTerminalContext.Provider value={overlayCtx}>
				<Box sx={{ display: 'flex', minHeight: '100vh' }}>
					<Sidebar />
					<Header />
					<Box
						component="main"
						sx={{
							flexGrow: 1,
							mt: '64px',
							p: { xs: 2, md: 4 },
							bgcolor: 'background.default',
							height: 'calc(100vh - 64px)',
							overflow: 'auto',
							transition: 'margin-right 0.2s',
						}}
					>
						{children}
					</Box>
					<RightSidebar />
				</Box>
				<OverlayTerminal />
			</OverlayTerminalContext.Provider>
		</RightSidebarContext.Provider>
	);
}
