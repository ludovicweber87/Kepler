'use client';

import { useId } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { BRAND_FONT_STACK } from '@/lib/themePrefs';

const WORDMARK = 'Kepler';

/**
 * Le mark est un K filaire traversé d'une plume d'écriture. Les cinq tracés sont les
 * opérateurs PostScript de l'EPS d'origine convertis un pour un (`mo`/`li`/`cv` →
 * `M`/`L`/`C`) : la géométrie est exacte, pas approchée. Le fût du K est en deux
 * morceaux parce que la plume le coupe à mi-hauteur.
 *
 * `viewBox` est recadrée sur la bbox du mark et le groupe ramène cette bbox à
 * l'origine — ce qui laisse les coordonnées des dégradés (relevées dans la matrice
 * `ct` de l'EPS) utilisables telles quelles en `userSpaceOnUse`.
 */
const MARK_VIEWBOX = '0 0 194.466 185.993';
const MARK_ORIGIN = 'translate(-152.767 -108.253)';

/** Fût vertical du K, coiffé de l'arc haut-gauche. */
const K_TOP_LEFT =
	'M197.994 207.187 L187.994 207.187 L187.994 108.253 L192.994 108.253 C213.099 108.253 229.455 124.609 229.455 144.714 L229.455 177.883 L219.455 177.883 L219.455 144.714 C219.455 131.832 210.202 121.071 197.994 118.727 L197.994 207.187 Z';
/** Talon bas-gauche du fût, là où la plume l'a interrompu. */
const K_BOTTOM_LEFT =
	'M229.455 292.174 L187.994 292.174 L187.994 254.071 L197.994 254.071 L197.994 282.174 L219.455 282.174 L219.455 245.813 L229.455 245.813 L229.455 292.174 Z';
/** Jambe bas-droite, en équerre puis arc de raccord. */
const K_BOTTOM_RIGHT =
	'M305.018 294.246 L255.171 244.398 L262.243 237.327 L304.683 279.768 C311.658 269.477 310.591 255.326 301.483 246.216 L282.39 227.125 L289.462 220.054 L308.554 239.146 C322.77 253.362 322.77 276.493 308.554 290.71 L305.018 294.246 Z';
/** Lame de la plume, du bec en haut-droite à la pointe en bas-gauche. */
const QUILL_BLADE =
	'M344.818 122.868 L344.818 122.869 C346.294 120.419 347.233 118.796 347.233 118.796 C347.233 118.796 228.935 158.073 152.767 280.478 L188.266 241.438 C188.266 241.438 249.365 158.8 344.818 122.868 Z';
/** Hampe et barbes : repasse sur la lame avec un dégradé orienté à l'inverse, d'où le galbe. */
const QUILL_SHAFT =
	'M213.732 239.697 C213.732 239.697 213.222 231.511 202.651 228.092 C202.651 228.092 207.606 226.644 216.304 229.911 C225.003 233.178 229.836 234.992 229.836 234.992 C229.836 234.992 279.648 213.612 323.661 151.803 C323.661 151.803 307.463 153.687 298.397 147.185 C298.397 147.185 322.934 150.203 328.61 145.696 C332.761 142.399 340.798 129.541 344.818 122.869 L344.818 122.868 C249.365 158.8 188.266 241.438 188.266 241.438 C188.266 241.438 203.247 244.858 213.732 239.697 Z';

/** Axes des deux dégradés, relevés dans l'EPS. Les sens opposés sont voulus. */
const GRAD_BLADE = { x1: 362.452, y1: 92.529, x2: 110.665, y2: 307.139 };
const GRAD_SHAFT = { x1: 248.707, y1: 241.025, x2: 287.148, y2: 114.131 };

/**
 * Fractions de la largeur totale du lockup. En vertical, `mark` reprend le rapport
 * mark/wordmark du lockup d'origine (~0,47) pour un mark quasi carré. En horizontal il
 * est plus généreux que ce rapport : le K est filaire, en dessous de ~34px de haut ses
 * traits ne se lisent plus, et le header de la sidebar n'a pas de hauteur contrainte.
 */
const VERTICAL = { mark: 0.44, gap: 0.06, font: 0.25 };
const HORIZONTAL = { mark: 0.24, gap: 0.05, font: 0.22 };

type LogoProps = {
	width?: number;
	/** `vertical` reprend le lockup de la marque ; `horizontal` tient dans une barre. */
	orientation?: 'vertical' | 'horizontal';
};

/**
 * Le mark est tracé en SVG plutôt qu'importé en raster : le K suit `text.primary` et la
 * plume un dégradé `primary.light` → `primary.dark`, donc le logo reste lisible et
 * cohérent sur les huit variantes de thème, en clair comme en sombre.
 *
 * Les couleurs passent par `useTheme()` et non par `sx` : la config `sx` de MUI ne rend
 * `palette` accessible qu'à `color`, `bgcolor` et `borderColor` — `fill` et `stopColor`
 * y recevraient la chaîne brute et seraient ignorés.
 */
export default function Logo({ width = 220, orientation = 'vertical' }: LogoProps) {
	const vertical = orientation === 'vertical';
	const scale = vertical ? VERTICAL : HORIZONTAL;
	const { palette } = useTheme();

	// Deux instances du logo peuvent coexister (splash + sidebar) : les identifiants de
	// dégradé sont uniques par instance, sinon la première définition gagne pour tout le document.
	const uid = useId();
	const bladeGradient = `${uid}-blade`;
	const shaftGradient = `${uid}-shaft`;

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
				<defs>
					<linearGradient
						id={bladeGradient}
						gradientUnits="userSpaceOnUse"
						{...GRAD_BLADE}
					>
						<stop offset="0" stopColor={palette.primary.light} />
						<stop offset="1" stopColor={palette.primary.dark} />
					</linearGradient>
					<linearGradient
						id={shaftGradient}
						gradientUnits="userSpaceOnUse"
						{...GRAD_SHAFT}
					>
						<stop offset="0" stopColor={palette.primary.light} />
						<stop offset="1" stopColor={palette.primary.dark} />
					</linearGradient>
				</defs>
				<g transform={MARK_ORIGIN}>
					<path d={K_TOP_LEFT} fill={palette.text.primary} />
					<path d={K_BOTTOM_LEFT} fill={palette.text.primary} />
					<path d={K_BOTTOM_RIGHT} fill={palette.text.primary} />
					<path d={QUILL_BLADE} fill={`url(#${bladeGradient})`} />
					<path d={QUILL_SHAFT} fill={`url(#${shaftGradient})`} />
				</g>
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
