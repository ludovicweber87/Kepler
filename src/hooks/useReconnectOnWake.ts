'use client';

import { useEffect, useRef } from 'react';

/**
 * Relance une connexion WebSocket quand l'app revient au premier plan
 * (`visibilitychange`/`focus`) ou que le réseau revient (`online`).
 *
 * Cas ciblé : la veille du laptop. Au sleep, l'OS suspend le process et la
 * connexion TCP se rompt silencieusement ; au réveil, `visibilitychange`/`online`
 * se déclenchent et on rappelle `reconnect()` — plus de reload manuel.
 *
 * @param shouldReconnect renvoie `true` si le socket est mort (à reconnecter).
 * @param reconnect (ré)ouvre la connexion.
 */
export function useReconnectOnWake(shouldReconnect: () => boolean, reconnect: () => void) {
	const shouldRef = useRef(shouldReconnect);
	const reconnectRef = useRef(reconnect);
	// Verrou anti-rafale : `online` + `visibilitychange` peuvent tomber dans le
	// même tick ; sans lui on rouvrirait deux sockets d'un coup.
	const lockRef = useRef(false);

	// Garde les callbacks à jour sans réabonner les listeners à chaque render.
	useEffect(() => {
		shouldRef.current = shouldReconnect;
		reconnectRef.current = reconnect;
	});

	useEffect(() => {
		const attempt = () => {
			if (lockRef.current) return;
			// On ne reconnecte qu'un onglet visible : inutile de réveiller une
			// session en arrière-plan (elle se reconnectera à son retour au premier plan).
			if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
			if (!shouldRef.current()) return;
			lockRef.current = true;
			reconnectRef.current();
			setTimeout(() => {
				lockRef.current = false;
			}, 1000);
		};

		const onVisible = () => {
			if (document.visibilityState === 'visible') attempt();
		};

		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', attempt);
		window.addEventListener('focus', attempt);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', attempt);
			window.removeEventListener('focus', attempt);
		};
	}, []);
}
