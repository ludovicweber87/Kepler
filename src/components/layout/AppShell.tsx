'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import { useSession } from 'next-auth/react';
import Sidebar from './Sidebar';
import Header from './Header';
import RightSidebar, { RIGHT_SIDEBAR_WIDTH } from './RightSidebar';
import OverlayTerminal from './OverlayTerminal';
import AppLoadingSplash from './AppLoadingSplash';
import { RightSidebarContext } from '@/hooks/useRightSidebar';
import { OverlayTerminalContext, type OverlaySession } from '@/hooks/useOverlayTerminal';

export default function AppShell({ children }: { children: React.ReactNode }) {
	const { status } = useSession();
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

	if (status === 'loading') return <AppLoadingSplash />;

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
