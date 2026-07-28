'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Badge from '@mui/material/Badge';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';

export interface SidebarNavEntry {
	label: string;
	href: string;
	icon: ReactNode;
	/** Rendu à droite du label en mode déplié ; devient un compteur de badge en réduit. */
	adornment?: ReactNode;
	/** Valeur du badge posé sur l'icône en mode réduit (l'adornment n'a plus de place). */
	badgeCount?: number;
}

interface SidebarNavItemProps extends SidebarNavEntry {
	collapsed: boolean;
	active: boolean;
	/** Délai de l'animation d'entrée, en secondes. */
	delay: number;
}

export default function SidebarNavItem({
	label,
	href,
	icon,
	adornment,
	badgeCount,
	collapsed,
	active,
	delay,
}: SidebarNavItemProps) {
	const theme = useTheme();

	return (
		<Tooltip title={collapsed ? label : ''} placement="right" disableHoverListener={!collapsed}>
			<Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
				<ListItemButton
					selected={active}
					sx={{
						borderRadius: 1,
						mb: 0.5,
						px: collapsed ? 1 : 2,
						py: 1,
						justifyContent: collapsed ? 'center' : 'flex-start',
						animation: `slideInLeft 0.35s ease-out ${delay}s both`,
						transition: 'background-color 0.15s, transform 0.15s',
						'&.Mui-selected': {
							bgcolor: alpha(theme.palette.primary.main, 0.18),
							color: 'primary.light',
							'& .MuiListItemIcon-root': { color: 'primary.light' },
						},
						'&:hover': {
							bgcolor: alpha(theme.palette.primary.main, 0.1),
							// Sans label, glisser l'icône vers la droite n'a pas de sens.
							transform: collapsed ? 'none' : 'translateX(4px)',
						},
					}}
				>
					<ListItemIcon
						sx={{
							minWidth: collapsed ? 0 : 36,
							justifyContent: 'center',
							color: 'text.secondary',
						}}
					>
						{collapsed && badgeCount ? (
							<Badge badgeContent={badgeCount} color="primary">
								{icon}
							</Badge>
						) : (
							icon
						)}
					</ListItemIcon>
					{!collapsed && (
						<ListItemText
							primary={label}
							primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500 }}
						/>
					)}
					{!collapsed && adornment}
				</ListItemButton>
			</Link>
		</Tooltip>
	);
}
