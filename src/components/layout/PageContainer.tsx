'use client';

import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export const PAGE_MAX_WIDTH = 1100;
export const PAGE_HEADER_MIN_HEIGHT = 44;

type PageContainerProps = {
	children: ReactNode;
	/** Colonne flex pleine hauteur (kanban, docs) au lieu du flux normal scrollable. */
	fullHeight?: boolean;
	/** Ignore le maxWidth partagé : la page prend toute la largeur (kanban Issues). */
	bleed?: boolean;
};

export function PageContainer({ children, fullHeight = false, bleed = false }: PageContainerProps) {
	return (
		<Box
			sx={{
				width: '100%',
				...(!bleed && { maxWidth: PAGE_MAX_WIDTH, mx: 'auto' }),
				...(fullHeight && {
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					minHeight: 0,
					overflow: 'hidden',
				}),
			}}
		>
			{children}
		</Box>
	);
}

type PageHeaderProps = {
	title: ReactNode;
	/** Rendu avant le titre (bouton retour sur une page de détail). */
	startAdornment?: ReactNode;
	/** Rendu après le titre, aligné sur sa baseline (compteur, chip). */
	titleSuffix?: ReactNode;
	/** Rendu à droite (recherche, filtres, actions). */
	actions?: ReactNode;
};

export function PageHeader({ title, startAdornment, titleSuffix, actions }: PageHeaderProps) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 2,
				minHeight: PAGE_HEADER_MIN_HEIGHT,
				mb: 3,
				flexShrink: 0,
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
				{startAdornment}
				{typeof title === 'string' ? (
					<Typography variant="h4" sx={{ fontWeight: 700 }} noWrap>
						{title}
					</Typography>
				) : (
					title
				)}
				{titleSuffix}
			</Box>
			{actions ? (
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
					{actions}
				</Box>
			) : null}
		</Box>
	);
}
