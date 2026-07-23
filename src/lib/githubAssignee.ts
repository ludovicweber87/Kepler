import { db } from '@/db';
import { appSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** Clé `app_settings` du login GitHub par défaut (création + lecture d'issues). */
export const GITHUB_ASSIGNEE_SETTING_KEY = 'github_default_assignee';

/**
 * Login GitHub à utiliser pour la création et la lecture/fetch des issues.
 * Renvoie la valeur configurée dans `app_settings` si non vide, sinon le
 * `fallbackLogin` (login gh CLI courant). Lecture DB synchrone (better-sqlite3).
 *
 * ⚠️ Importe `db` : à n'utiliser que côté serveur (route handlers).
 */
export function resolveAssigneeLogin(fallbackLogin: string): string {
	const row = db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, GITHUB_ASSIGNEE_SETTING_KEY))
		.get();
	const configured = row?.value?.trim();
	return configured ? configured : fallbackLogin;
}
