'use client';

import Box from '@mui/material/Box';
import {
	LOGO_LETTER_SPACING_EM,
	LOGO_MARK_HEIGHT_EM,
	LOGO_MARK_PATHS,
	LOGO_MARK_VIEWBOX,
	LOGO_MARK_WIDTH_EM,
	LOGO_NAME,
	LOGO_WORDMARK,
} from './logoMark';

type LogoProps = {
	fontSize?: number;
};

export default function Logo({ fontSize = 32 }: LogoProps) {
	return (
		<Box
			role="img"
			aria-label={LOGO_NAME}
			sx={{
				display: 'inline-flex',
				alignItems: 'baseline',
				maxWidth: '100%',
				color: 'primary.main',
				fontSize: `${fontSize}px`,
				fontWeight: 700,
				lineHeight: 1,
				letterSpacing: `${LOGO_LETTER_SPACING_EM}em`,
				userSelect: 'none',
			}}
		>
			<Box component="span">{LOGO_WORDMARK}</Box>
			<Box
				component="svg"
				aria-hidden
				viewBox={LOGO_MARK_VIEWBOX}
				sx={{
					width: `${LOGO_MARK_WIDTH_EM}em`,
					height: `${LOGO_MARK_HEIGHT_EM}em`,
					flexShrink: 0,
					fill: 'currentColor',
				}}
			>
				{LOGO_MARK_PATHS.map((d) => (
					<path key={d} d={d} />
				))}
			</Box>
		</Box>
	);
}
