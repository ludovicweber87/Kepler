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
 * fausse. Le `tag` évite l'empilement : l'OS remplace la notification de même
 * tag au lieu d'en ajouter une.
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
		const notif = new Notification(title, { tag: opts.tag, icon: '/logo.png' });
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
