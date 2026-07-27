import { isOsNotificationsEnabled } from './notificationPrefs';

export type OsNotificationContext = {
	enabled: boolean;
	permission: NotificationPermission;
	hasFocus: boolean;
};

/**
 * Décide si une notification système doit s'afficher. Pure.
 * Faux si la préférence est coupée, si la permission n'est pas accordée, ou si
 * l'onglet a déjà le focus — dans ce dernier cas le snackbar in-app suffit et
 * une notification OS ferait doublon.
 */
export function shouldShowOsNotification(ctx: OsNotificationContext): boolean {
	return ctx.enabled && ctx.permission === 'granted' && !ctx.hasFocus;
}

/**
 * Affiche une notification système si le contexte s'y prête. No-op silencieux
 * si l'API `Notification` est absente de l'environnement ou si la décision est
 * fausse. Le `tag` est l'id de session (ou l'id de la notification à défaut) :
 * l'OS remplace la notification précédente de même session au lieu de
 * l'empiler — deux notifications sur la même session ne s'accumulent pas, mais
 * des sessions distinctes s'empilent normalement.
 */
export function showOsNotification(
	title: string,
	opts: { tag: string; onClick?: () => void },
): void {
	if (typeof window === 'undefined' || !('Notification' in window)) return;
	const shouldShow = shouldShowOsNotification({
		enabled: isOsNotificationsEnabled(),
		permission: Notification.permission,
		hasFocus: document.hasFocus(),
	});
	if (!shouldShow) return;
	try {
		// `silent: true` inconditionnel : l'onglet est nécessairement vivant pour
		// que ce code s'exécute, donc `playNotificationChime()` dans
		// useNotificationsStream se déclenche déjà pour le même événement — c'est
		// le seul canal audio, le switch « Son de notification » le gouverne
		// entièrement, et il n'y a pas de double bip OS + carillon.
		const notif = new Notification(title, { tag: opts.tag, icon: '/logo.png', silent: true });
		notif.onclick = () => {
			window.focus();
			notif.close();
			opts.onClick?.();
		};
	} catch {
		// Certains navigateurs exposent `Notification` mais interdisent le
		// constructeur hors service worker — on ignore.
	}
}
