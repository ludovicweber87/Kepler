'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { clamp01, hexToHsv, hsvToHex, type Hsv } from '@/lib/color';

const SV_HEIGHT = 132;
const HUE_HEIGHT = 12;
const HANDLE = 12;

type Props = {
	anchorEl: HTMLElement | null;
	value: string;
	onChange: (hex: string) => void;
	onClose: () => void;
};

export default function ColorPickerPopover({ anchorEl, value, onChange, onClose }: Props) {
	const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
	const [lastValue, setLastValue] = useState(value);

	// Re-sync on outside changes (HEX field, prefs reload) while keeping the local
	// hue/saturation when they still resolve to the same color (black/white lose them).
	if (value !== lastValue) {
		setLastValue(value);
		if (hsvToHex(hsv) !== value) setHsv(hexToHsv(value));
	}

	const svRef = useRef<HTMLDivElement>(null);
	const hueRef = useRef<HTMLDivElement>(null);
	const dragging = useRef<'sv' | 'hue' | null>(null);

	const commit = (next: Hsv) => {
		setHsv(next);
		onChange(hsvToHex(next));
	};

	const pickSv = (e: ReactPointerEvent) => {
		const rect = svRef.current?.getBoundingClientRect();
		if (!rect) return;
		commit({
			...hsv,
			s: clamp01((e.clientX - rect.left) / rect.width),
			v: 1 - clamp01((e.clientY - rect.top) / rect.height),
		});
	};

	const pickHue = (e: ReactPointerEvent) => {
		const rect = hueRef.current?.getBoundingClientRect();
		if (!rect) return;
		commit({ ...hsv, h: clamp01((e.clientX - rect.left) / rect.width) * 360 });
	};

	const stop = () => {
		dragging.current = null;
	};

	return (
		<Popover
			open={Boolean(anchorEl)}
			anchorEl={anchorEl}
			onClose={onClose}
			anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
			transformOrigin={{ vertical: 'top', horizontal: 'left' }}
			slotProps={{ paper: { sx: { mt: 0.75, p: 1.25, borderRadius: 2, width: 216 } } }}
		>
			<Box
				ref={svRef}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					dragging.current = 'sv';
					pickSv(e);
				}}
				onPointerMove={(e) => {
					if (dragging.current === 'sv') pickSv(e);
				}}
				onPointerUp={stop}
				onPointerCancel={stop}
				sx={{
					position: 'relative',
					height: SV_HEIGHT,
					borderRadius: 1,
					cursor: 'crosshair',
					touchAction: 'none',
					background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${hsv.h} 100% 50%)`,
				}}
			>
				<Handle left={`${hsv.s * 100}%`} top={`${(1 - hsv.v) * 100}%`} />
			</Box>

			<Box
				ref={hueRef}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					dragging.current = 'hue';
					pickHue(e);
				}}
				onPointerMove={(e) => {
					if (dragging.current === 'hue') pickHue(e);
				}}
				onPointerUp={stop}
				onPointerCancel={stop}
				sx={{
					position: 'relative',
					height: HUE_HEIGHT,
					mt: 1.25,
					borderRadius: 999,
					cursor: 'pointer',
					touchAction: 'none',
					background:
						'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)',
				}}
			>
				<Handle left={`${hsv.h / 3.6}%`} top="50%" />
			</Box>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25 }}>
				<Box
					sx={{
						width: 22,
						height: 22,
						borderRadius: 1,
						flexShrink: 0,
						border: 1,
						borderColor: 'divider',
						bgcolor: value,
					}}
				/>
				<Typography
					variant="caption"
					sx={{ fontFamily: 'monospace' }}
					color="text.secondary"
				>
					{value}
				</Typography>
			</Box>
		</Popover>
	);
}

function Handle({ left, top }: { left: string; top: string }) {
	return (
		<Box
			sx={{
				position: 'absolute',
				left,
				top,
				width: HANDLE,
				height: HANDLE,
				ml: `-${HANDLE / 2}px`,
				mt: `-${HANDLE / 2}px`,
				borderRadius: '50%',
				border: '2px solid #fff',
				boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
				pointerEvents: 'none',
			}}
		/>
	);
}
