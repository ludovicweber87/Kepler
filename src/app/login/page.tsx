'use client';

import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { alpha, useTheme } from '@mui/material/styles';
import GitHubIcon from '@mui/icons-material/GitHub';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import MergeTypeRoundedIcon from '@mui/icons-material/MergeTypeRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import Image from 'next/image';
import LocaleSwitcher from '@/components/LocaleSwitcher';

const FEATURE_KEYS = ['kanban', 'prs', 'parallel', 'workspace'] as const;

const FEATURE_ICONS = [
	<ViewKanbanRoundedIcon key="kanban" sx={{ fontSize: 32 }} />,
	<MergeTypeRoundedIcon key="pr" sx={{ fontSize: 32 }} />,
	<AccountTreeRoundedIcon key="parallel" sx={{ fontSize: 32 }} />,
	<DashboardRoundedIcon key="workspace" sx={{ fontSize: 32 }} />,
];

export default function LoginPage() {
	const theme = useTheme();
	const t = useTranslations('landing');
	const FEATURE_COLORS = [
		theme.palette.primary.main,
		theme.palette.secondary.main,
		theme.palette.success.main,
		theme.palette.warning.main,
	];
	const handleSignIn = () => signIn('github', { callbackUrl: '/dashboard' });

	return (
		<Box sx={{ bgcolor: 'background.default', minHeight: '100vh', color: 'text.primary' }}>
			{/* Navbar */}
			<Box
				component="nav"
				sx={{
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					zIndex: 100,
					px: 3,
					py: 1.5,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					bgcolor: alpha(theme.palette.background.default, 0.85),
					backdropFilter: 'blur(16px)',
					borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
				}}
			>
				<Image src="/logo.svg" alt="Devora" width={140} height={33} priority />

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
					<LocaleSwitcher />

					<Button
						variant="outlined"
						size="small"
						startIcon={<GitHubIcon sx={{ fontSize: '18px !important' }} />}
						onClick={handleSignIn}
						sx={{
							color: 'text.primary',
							borderColor: alpha(theme.palette.text.primary, 0.2),
							textTransform: 'none',
							fontWeight: 600,
							fontSize: '0.8rem',
							borderRadius: 2,
							px: 2,
							'&:hover': {
								borderColor: theme.palette.primary.main,
								bgcolor: alpha(theme.palette.primary.main, 0.08),
							},
						}}
					>
						{t('nav.cta')}
					</Button>
				</Box>
			</Box>

			{/* Main — split layout */}
			<Box
				sx={{
					minHeight: '100vh',
					display: 'flex',
					flexDirection: { xs: 'column', md: 'row' },
					position: 'relative',
					overflow: 'hidden',
				}}
			>
				{/* Glow background */}
				<Box
					sx={{
						position: 'absolute',
						top: '40%',
						left: '30%',
						transform: 'translate(-50%, -50%)',
						width: 700,
						height: 700,
						borderRadius: '50%',
						background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 70%)`,
						filter: 'blur(80px)',
						pointerEvents: 'none',
					}}
				/>

				{/* Left — Hero text */}
				<Box
					sx={{
						flex: { xs: 'none', md: '0 0 65%' },
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						alignItems: 'center',
						textAlign: 'center',
						px: { xs: 3, md: 6, lg: 8 },
						py: { xs: 12, md: 0 },
						position: 'relative',
						zIndex: 1,
					}}
				>
					<Box sx={{ maxWidth: 640, mx: 'auto', animation: 'fadeInUp 0.8s ease-out' }}>
						<Typography
							variant="h1"
							sx={{
								fontSize: { xs: '2.2rem', md: '3.2rem', lg: '3.8rem' },
								fontWeight: 700,
								lineHeight: 1.08,
								letterSpacing: '-0.03em',
								mb: 3,
								background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${theme.palette.text.secondary} 50%, ${theme.palette.primary.main} 100%)`,
								WebkitBackgroundClip: 'text',
								WebkitTextFillColor: 'transparent',
							}}
						>
							{t('hero.tagline')}
						</Typography>

						<Typography
							sx={{
								fontSize: { xs: '1rem', md: '1.1rem' },
								color: 'text.secondary',
								lineHeight: 1.7,
								maxWidth: 480,
								mx: 'auto',
								mb: 5,
							}}
						>
							{t('hero.subtitle')}
						</Typography>

						<Button
							variant="contained"
							size="large"
							startIcon={<GitHubIcon />}
							onClick={handleSignIn}
							sx={{
								px: 4.5,
								py: 1.8,
								fontSize: '1rem',
								fontWeight: 600,
								textTransform: 'none',
								borderRadius: 2.5,
								bgcolor: 'text.primary',
								color: theme.palette.background.default,
								boxShadow: `0 0 40px ${alpha(theme.palette.primary.main, 0.3)}`,
								'&:hover': {
									bgcolor: alpha(theme.palette.text.primary, 0.9),
									boxShadow: `0 0 60px ${alpha(theme.palette.primary.main, 0.5)}`,
								},
							}}
						>
							{t('hero.cta')}
						</Button>
					</Box>
				</Box>

				{/* Right — Feature accordions */}
				<Box
					sx={{
						flex: { xs: 'none', md: '0 0 35%' },
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						gap: 1.5,
						px: { xs: 3, md: 4 },
						py: { xs: 6, md: 0 },
						pr: { md: 6, lg: 8 },
					}}
				>
					{FEATURE_KEYS.map((key, i) => (
						<Accordion
							key={key}
							disableGutters
							elevation={0}
							sx={{
								bgcolor: alpha(theme.palette.text.primary, 0.03),
								border: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
								borderRadius: '12px !important',
								overflow: 'hidden',
								animation: `fadeInUp 0.5s ease-out ${0.12 * i + 0.3}s both`,
								transition: 'all 0.3s ease',
								'&:before': { display: 'none' },
								'&:hover': {
									bgcolor: alpha(theme.palette.text.primary, 0.05),
									borderColor: alpha(FEATURE_COLORS[i], 0.3),
								},
								'&.Mui-expanded': {
									borderColor: alpha(FEATURE_COLORS[i], 0.4),
									boxShadow: `0 4px 24px ${alpha(FEATURE_COLORS[i], 0.1)}`,
								},
							}}
						>
							<AccordionSummary
								expandIcon={<ExpandMoreRoundedIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
								sx={{
									px: 2.5,
									py: 0.5,
									minHeight: 'unset',
									'& .MuiAccordionSummary-content': {
										my: 1.5,
										gap: 2,
										alignItems: 'center',
									},
								}}
							>
								<Box
									sx={{
										width: 38,
										height: 38,
										minWidth: 38,
										borderRadius: 1.5,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: alpha(FEATURE_COLORS[i], 0.12),
										color: FEATURE_COLORS[i],
									}}
								>
									{FEATURE_ICONS[i]}
								</Box>
								<Box>
									<Typography sx={{ fontSize: '0.88rem', fontWeight: 600, lineHeight: 1.3 }}>
										{t(`features.${key}.title`)}
									</Typography>
									<Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.4, mt: 0.2 }}>
										{t(`features.${key}.desc`)}
									</Typography>
								</Box>
							</AccordionSummary>
							<AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2.5 }}>
								<Typography
									sx={{
										fontSize: '0.8rem',
										color: 'text.secondary',
										lineHeight: 1.65,
										borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
										pt: 2,
									}}
								>
									{t(`features.${key}.details`)}
								</Typography>
							</AccordionDetails>
						</Accordion>
					))}
				</Box>
			</Box>
		</Box>
	);
}
