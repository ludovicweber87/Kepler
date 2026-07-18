const MUTED_KEY = 'devora.notif.muted';

/** True si le son de notification est coupé (persisté en localStorage). SSR-safe. */
export function isNotificationSoundMuted(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(MUTED_KEY) === '1';
	} catch {
		return false;
	}
}

/** Persiste l'état mute du son de notification. SSR-safe. */
export function setNotificationSoundMuted(muted: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
	} catch {
		// localStorage indisponible (mode privé strict) — on ignore.
	}
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	if (!audioContext) audioContext = new Ctor();
	return audioContext;
}

/**
 * Joue un carillon doux à deux notes (~180ms). Réutilise un AudioContext
 * singleton, le réveille s'il est suspendu (politique autoplay). Aucun asset :
 * tout est synthétisé en Web Audio. No-op silencieux si l'audio est indisponible
 * ou bloqué par le navigateur.
 */
export function playNotificationChime(): void {
	const ctx = getAudioContext();
	if (!ctx) return;
	try {
		if (ctx.state === 'suspended') void ctx.resume();

		const now = ctx.currentTime;
		// Deux notes ascendantes (La5 → Ré6), courtes et espacées.
		const notes: Array<{ freq: number; at: number }> = [
			{ freq: 880, at: 0 },
			{ freq: 1174.66, at: 0.09 },
		];

		for (const { freq, at } of notes) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, now + at);

			// Enveloppe attaque/décroissance douce pour éviter le clic.
			const start = now + at;
			gain.gain.setValueAtTime(0, start);
			gain.gain.linearRampToValueAtTime(0.14, start + 0.012);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

			osc.connect(gain).connect(ctx.destination);
			osc.start(start);
			osc.stop(start + 0.13);
		}
	} catch {
		// Audio bloqué / contexte invalide — on ignore.
	}
}
