'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import Sidebar from './Sidebar';
import Header from './Header';
import OverlayTerminal from './OverlayTerminal';
import AppLoadingSplash from './AppLoadingSplash';
import Logo from './Logo';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useNotificationsStream } from '@/hooks/useNotificationsStream';
import { OverlayTerminalContext, type OverlaySession } from '@/hooks/useOverlayTerminal';
import { ScriptRunnerContext, type PendingScriptRun } from '@/hooks/useScriptRunner';
import { appShadow } from '@/theme/shadows';

export default function AppShell({ children }: { children: React.ReactNode }) {
	useNotificationsStream();
	const pathname = usePathname();
	const { repoPaths, repoPathsLoading } = useRepoPaths();
	const { configs } = useProjectConfig();
	const t = useTranslations('onboarding');
	const [overlaySession, setOverlaySession] = useState<OverlaySession | null>(null);
	const [pendingScript, setPendingScript] = useState<PendingScriptRun | null>(null);
	const scriptNonce = useRef(0);
	const [onboardingDone, setOnboardingDone] = useState(false);
	// Captured once (after repo paths load): did the user already have repos on entry?
	const [skipOnboarding, setSkipOnboarding] = useState<boolean | null>(null);

	const openOverlay = useCallback((s: OverlaySession) => setOverlaySession(s), []);
	const closeOverlay = useCallback(() => setOverlaySession(null), []);

	const overlayCtx = useMemo(
		() => ({ session: overlaySession, open: openOverlay, close: closeOverlay }),
		[overlaySession, openOverlay, closeOverlay],
	);

	// Script cliqué dans la topbar, en attente d'exécution par le Workbench. Le nonce
	// distingue deux clics successifs sur le même script.
	const runScript = useCallback((payload: Omit<PendingScriptRun, 'nonce'>) => {
		setPendingScript({ ...payload, nonce: ++scriptNonce.current });
	}, []);
	const consumeScript = useCallback(() => setPendingScript(null), []);

	const scriptRunnerCtx = useMemo(
		() => ({ pending: pendingScript, run: runScript, consume: consumeScript }),
		[pendingScript, runScript, consumeScript],
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
					<Logo width={96} wordmark={false} />
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
						boxShadow: (th) => appShadow(th.palette.mode),
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
			<ScriptRunnerContext.Provider value={scriptRunnerCtx}>
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
						{/* Fade au changement de page. Keyé sur le pathname seul : changer
						    ?session= dans le Workbench ne doit pas remonter le terminal. */}
						<motion.div
							key={pathname}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.2, ease: 'easeOut' }}
							style={{ height: '100%' }}
						>
							{children}
						</motion.div>
					</Box>
				</Box>
				<OverlayTerminal />
			</ScriptRunnerContext.Provider>
		</OverlayTerminalContext.Provider>
	);
}
