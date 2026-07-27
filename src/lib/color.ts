export type Hsv = { h: number; s: number; v: number };

export function clamp01(value: number): number {
	if (Number.isNaN(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Parses `#RRGGBB` (with or without '#', any case). Invalid input → black. */
export function hexToHsv(hex: string): Hsv {
	const match = /^#?([0-9a-f]{6})$/i.exec(typeof hex === 'string' ? hex.trim() : '');
	const int = match ? parseInt(match[1], 16) : 0;
	const r = ((int >> 16) & 255) / 255;
	const g = ((int >> 8) & 255) / 255;
	const b = (int & 255) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	if (delta !== 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}

	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
	const hue = ((h % 360) + 360) % 360;
	const sat = clamp01(s);
	const val = clamp01(v);

	const c = val * sat;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = val - c;
	const segments: [number, number, number][] = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x],
	];
	const channels = segments[Math.floor(hue / 60) % 6];

	return `#${channels
		.map((n) =>
			Math.round((n + m) * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')
		.toUpperCase()}`;
}
