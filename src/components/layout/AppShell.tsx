'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import Sidebar from './Sidebar';
import Header from './Header';
import OverlayTerminal from './OverlayTerminal';
import AppLoadingSplash from './AppLoadingSplash';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { OverlayTerminalContext, type OverlaySession } from '@/hooks/useOverlayTerminal';

export default function AppShell({ children }: { children: React.ReactNode }) {
	const { repoPaths, repoPathsLoading } = useRepoPaths();
	const { configs } = useProjectConfig();
	const t = useTranslations('onboarding');
	const [overlaySession, setOverlaySession] = useState<OverlaySession | null>(null);
	const [onboardingDone, setOnboardingDone] = useState(false);
	// Captured once (after repo paths load): did the user already have repos on entry?
	const [skipOnboarding, setSkipOnboarding] = useState<boolean | null>(null);

	const openOverlay = useCallback((s: OverlaySession) => setOverlaySession(s), []);
	const closeOverlay = useCallback(() => setOverlaySession(null), []);

	const overlayCtx = useMemo(
		() => ({ session: overlaySession, open: openOverlay, close: closeOverlay }),
		[overlaySession, openOverlay, closeOverlay],
	);

	if (repoPathsLoading) return <AppLoadingSplash />;

	if (skipOnboarding === null) {
		setSkipOnboarding(repoPaths.length > 0);
		return <AppLoadingSplash />;
	}

	const hasRepos = repoPaths.length > 0;
	const hasProjects = configs.some((c) => c.connected);
	const showOnboarding = !skipOnboarding && !onboardingDone;

	if (showOnboarding) {
		return (
			<>
				<Box
					sx={{
						minHeight: '100vh',
						bgcolor: 'background.default',
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 6,
						px: 2,
						pb: 12,
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
				<Box
					sx={{
						position: 'fixed',
						bottom: 0,
						left: 0,
						right: 0,
						display: 'flex',
						justifyContent: 'center',
						py: 2,
						bgcolor: 'background.default',
						boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
						zIndex: 1200,
					}}
				>
					<Button
						variant="contained"
						size="large"
						startIcon={<RocketLaunchRoundedIcon />}
						disabled={!hasRepos || !hasProjects}
						onClick={() => setOnboardingDone(true)}
						sx={{ px: 5, py: 1.5, fontWeight: 600, fontSize: '1rem' }}
					>
						{t('launch')}
					</Button>
				</Box>
			</>
		);
	}

	return (
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
					}}
				>
					{children}
				</Box>
			</Box>
			<OverlayTerminal />
		</OverlayTerminalContext.Provider>
	);
}
