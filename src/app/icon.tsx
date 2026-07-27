import { ImageResponse } from 'next/og';
import { LOGO_MARK_PATHS, LOGO_MARK_TIGHT_VIEWBOX } from '@/components/layout/logoMark';
import { DEFAULT_CUSTOM_TOKENS } from '@/lib/themePrefs';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
	return new ImageResponse(
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '100%',
				height: '100%',
			}}
		>
			<svg
				viewBox={LOGO_MARK_TIGHT_VIEWBOX}
				width={48}
				height={52}
				fill={DEFAULT_CUSTOM_TOKENS.primary}
			>
				{LOGO_MARK_PATHS.map((d) => (
					<path key={d} d={d} />
				))}
			</svg>
		</div>,
		size,
	);
}
