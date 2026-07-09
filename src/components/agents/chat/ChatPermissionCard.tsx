'use client';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { PendingPermission, PermissionDecision } from '@/types';

export default function ChatPermissionCard({
	perm,
	onDecide,
}: {
	perm: PendingPermission;
	onDecide: (id: string, d: PermissionDecision) => void;
}) {
	const t = useTranslations('agentChat');
	const preview = perm.input?.command
		? String(perm.input.command)
		: JSON.stringify(perm.input ?? {}, null, 2);
	return (
		<Box
			sx={{
				mx: 2,
				my: 1,
				border: 1,
				borderColor: (th) => alpha(th.palette.warning.main, 0.5),
				borderRadius: 2,
				overflow: 'hidden',
				bgcolor: (th) => alpha(th.palette.warning.main, 0.07),
				maxWidth: '92%',
			}}
		>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1.5,
					py: 1,
					borderBottom: 1,
					borderColor: (th) => alpha(th.palette.warning.main, 0.25),
				}}
			>
				<WarningAmberRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
				<Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>
					{t('permissionTitle')} — {perm.displayName ?? perm.toolName}
				</Typography>
			</Box>
			<Box
				sx={{
					px: 1.5,
					py: 1,
					fontFamily: 'monospace',
					fontSize: '0.7rem',
					whiteSpace: 'pre-wrap',
					bgcolor: 'background.default',
				}}
			>
				{preview}
			</Box>
			<Box sx={{ display: 'flex', gap: 1, px: 1.5, py: 1 }}>
				<Button
					size="small"
					variant="contained"
					color="success"
					onClick={() => onDecide(perm.id, 'allow-once')}
					sx={{ textTransform: 'none' }}
				>
					{t('allowOnce')}
				</Button>
				<Button
					size="small"
					variant="outlined"
					color="success"
					onClick={() => onDecide(perm.id, 'allow-always')}
					sx={{ textTransform: 'none' }}
				>
					{t('allowAlways', { tool: perm.toolName })}
				</Button>
				<Button
					size="small"
					variant="outlined"
					color="error"
					onClick={() => onDecide(perm.id, 'reject')}
					sx={{ textTransform: 'none' }}
				>
					{t('reject')}
				</Button>
			</Box>
		</Box>
	);
}
