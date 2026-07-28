'use client';

import Box from '@mui/material/Box';
import { BRAND_FONT_STACK } from '@/lib/themePrefs';

const WORDMARK = 'Kepler';

/**
 * Le K est formé de trois feuilles. Chacune suit la même construction : deux côtés
 * droits qui forment l'angle net, puis un arc d'ellipse qui rejoint leurs extrémités
 * libres — d'où le galbe asymétrique de la feuille. Tous les arcs vont dans le sens
 * horaire (`large-arc 0, sweep 1`), les gouttières entre feuilles font 24 unités.
 *
 * Tracés reconstruits d'après le lockup de référence (raster) : la silhouette et les
 * proportions y sont fidèles, mais les courbes sont une approximation. Remplacer les
 * trois `d` par ceux de l'export SVG d'origine suffit à rendre le mark exact.
 */
const MARK_VIEWBOX = '0 0 680 528';
/** Fût vertical du K, coiffé de la grande feuille : galbe vers le bas-gauche. */
const LEAF_STEM = 'M0 0 H272 V528 A272 380 0 0 1 0 148 Z';
/** Bras haut-droit — la seule feuille colorée du lockup. */
const LEAF_ACCENT = 'M296 0 H466 V70 A170 260 0 0 1 296 330 Z';
/** Bras bas-droit, galbe vers le bas-droite. */
const LEAF_ARM = 'M296 356 H680 V400 A384 128 0 0 1 296 528 Z';

/**
 * Proportions relevées sur le lockup de référence : le wordmark est ~1,9× plus
 * large que le mark, d'où un mark à 52 % de la largeur totale en vertical.
 */
const VERTICAL = { mark: 0.52, gap: 0.06, font: 0.25 };
const HORIZONTAL = { mark: 0.22, gap: 0.05, font: 0.22 };

type LogoProps = {
	width?: number;
	/** `vertical` reprend le lockup de la marque ; `horizontal` tient dans une barre. */
	orientation?: 'vertical' | 'horizontal';
};

/**
 * Le mark est tracé en SVG plutôt qu'importé en raster : les deux feuilles neutres
 * suivent `text.primary` et la feuille d'accent `primary.main`, donc le logo reste
 * lisible et cohérent sur les sept variantes de thème, en clair comme en sombre.
 */
export default function Logo({ width = 220, orientation = 'vertical' }: LogoProps) {
	const vertical = orientation === 'vertical';
	const scale = vertical ? VERTICAL : HORIZONTAL;

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: vertical ? 'column' : 'row',
				alignItems: 'center',
				justifyContent: 'center',
				gap: `${width * scale.gap}px`,
				width,
				maxWidth: '100%',
				userSelect: 'none',
			}}
		>
			<Box
				component="svg"
				viewBox={MARK_VIEWBOX}
				aria-hidden
				sx={{
					width: width * scale.mark,
					flexShrink: 0,
					display: 'block',
					overflow: 'visible',
				}}
			>
				<Box component="path" d={LEAF_STEM} sx={{ fill: 'text.primary' }} />
				<Box component="path" d={LEAF_ARM} sx={{ fill: 'text.primary' }} />
				<Box component="path" d={LEAF_ACCENT} sx={{ fill: 'primary.main' }} />
			</Box>

			<Box
				component="span"
				sx={{
					fontFamily: BRAND_FONT_STACK,
					fontSize: `${width * scale.font}px`,
					lineHeight: 1,
					letterSpacing: '-0.01em',
					color: 'text.primary',
					whiteSpace: 'nowrap',
				}}
			>
				{WORDMARK}
			</Box>
		</Box>
	);
}
