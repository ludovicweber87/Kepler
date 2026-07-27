'use client';

import Box from '@mui/material/Box';

const LOGO_NAME = 'Devora';
const LOGO_SRC = '/logo.png';

// public/logo.png : lockup vertical (goutte + wordmark), recadré au plus juste sur les tracés.
const LOGO_ASPECT_RATIO = 500 / 286;

type LogoProps = {
	width?: number;
};

// Le lockup est un raster noir sur fond transparent : on l'utilise en masque plutôt qu'en
// <img>, pour que la couleur reste pilotée par le thème (et donc lisible en dark comme en light).
export default function Logo({ width = 220 }: LogoProps) {
	return (
		<Box
			role="img"
			aria-label={LOGO_NAME}
			sx={{
				width,
				maxWidth: '100%',
				aspectRatio: `${LOGO_ASPECT_RATIO}`,
				bgcolor: 'primary.main',
				maskImage: `url(${LOGO_SRC})`,
				WebkitMaskImage: `url(${LOGO_SRC})`,
				maskSize: 'contain',
				WebkitMaskSize: 'contain',
				maskRepeat: 'no-repeat',
				WebkitMaskRepeat: 'no-repeat',
				maskPosition: 'center',
				WebkitMaskPosition: 'center',
				userSelect: 'none',
			}}
		/>
	);
}
