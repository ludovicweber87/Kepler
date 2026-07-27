# Notifications OS natives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher une notification système du navigateur quand un agent termine, échoue ou pose une question, uniquement si l'onglet Devora n'a pas le focus, avec un accordéon « Notifications » dans les paramètres pour activer/désactiver ça et le son.

**Architecture :** Deux nouvelles libs pures côté client (`notificationPrefs.ts` pour la persistance localStorage, `osNotification.ts` pour la décision + l'appel à l'API `Notification`), branchées en une ligne dans le hook SSE existant `useNotificationsStream`. Un nouveau composant de paramètres autonome expose deux switches. Aucune modification de `packages/agent`, aucune migration DB, aucune dépendance ajoutée.

**Tech Stack :** Next.js 16 / React 19 / TypeScript 5 strict, MUI 7, next-intl 4.8, Vitest + jsdom.

**Spec de référence :** `docs/superpowers/specs/2026-07-27-os-notifications-design.md`

## Global Constraints

- Aucune nouvelle dépendance npm. Aucune modification de `packages/agent/`. Aucune migration SQLite.
- Persistance en **localStorage uniquement** (pas `useAppSetting` / `app_settings`). Clé nouvelle : `devora.notif.os`. Clé existante réutilisée : `devora.notif.muted`.
- Tous les helpers localStorage sont SSR-safe : garde `typeof window === 'undefined'` **et** `try/catch`, exactement comme `src/lib/notificationSound.ts`.
- Indentation du repo : **tabulations**, y compris dans les fichiers JSON de traduction. Prettier est configuré, `npm run format` normalise.
- **Jamais de texte en dur** dans un composant : tout passe par `useTranslations`. Les 5 locales (`fr`, `en`, `es`, `de`, `pt`) sont mises à jour ensemble dans le même commit.
- Le nouveau sous-objet i18n est `settings.notifications.*`. **Ne pas** toucher au namespace racine `notifications`, qui contient les libellés de types (`agent_done`, etc.) consommés par `titleFor()`.
- Convention de tests du repo : **logique pure uniquement** (Vitest, `*.test.ts` sur `src/lib` et `src/hooks`). Les composants ne sont pas testés unitairement ; ils se vérifient par `npm run lint`, `npx tsc --noEmit`, `npm run build` et un run manuel.
- Commandes de vérification : `npm run test:web` (Vitest), `npm run lint` (ESLint), `npx tsc --noEmit`.
- Ne jamais `git push` ni ouvrir de PR sans accord explicite de Ludovic. Les commits locaux prévus par ce plan sont autorisés.

---

## File Structure

| Fichier | Responsabilité |
| --- | --- |
| `src/lib/notificationPrefs.ts` *(créé)* | Lecture/écriture de la préférence « notifications système » en localStorage. Sœur de `notificationSound.ts`. |
| `src/lib/notificationPrefs.test.ts` *(créé)* | Défaut, aller-retour, robustesse. |
| `src/lib/osNotification.ts` *(créé)* | `shouldShowOsNotification` (pure) + `showOsNotification` (effet de bord sur l'API `Notification`). |
| `src/lib/osNotification.test.ts` *(créé)* | Matrice de décision complète. |
| `src/hooks/useNotificationsStream.ts` *(modifié)* | Un appel de plus à côté du `showSnackbar` existant. |
| `src/config/translate/{fr,en,es,de,pt}.json` *(modifiés)* | Sous-objet `settings.notifications`. |
| `src/components/settings/NotificationSettings.tsx` *(créé)* | Les deux switches + machine à états de la permission. |
| `src/components/settings/SettingsPanel.tsx` *(modifié)* | Un accordéon de plus. |

---

## Task 1 : Préférence localStorage des notifications système

**Files:**
- Create: `src/lib/notificationPrefs.ts`
- Test: `src/lib/notificationPrefs.test.ts`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces:
  - `isOsNotificationsEnabled(): boolean` — défaut `false`
  - `setOsNotificationsEnabled(enabled: boolean): void`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/notificationPrefs.test.ts`. Il est calqué sur `src/lib/notificationSound.test.ts`, qui est déjà dans le repo et sert de modèle de style.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isOsNotificationsEnabled, setOsNotificationsEnabled } from './notificationPrefs';

describe('os notifications preference persistence', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('defaults to disabled when nothing stored', () => {
		expect(isOsNotificationsEnabled()).toBe(false);
	});

	it('persists and reads the enabled state', () => {
		setOsNotificationsEnabled(true);
		expect(isOsNotificationsEnabled()).toBe(true);
	});

	it('disabling flips the state back', () => {
		setOsNotificationsEnabled(true);
		setOsNotificationsEnabled(false);
		expect(isOsNotificationsEnabled()).toBe(false);
	});

	it('treats an unrelated stored value as disabled', () => {
		window.localStorage.setItem('devora.notif.os', 'yes');
		expect(isOsNotificationsEnabled()).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:web -- src/lib/notificationPrefs.test.ts`
Expected: FAIL — `Failed to resolve import "./notificationPrefs"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/lib/notificationPrefs.ts` :

```ts
const OS_ENABLED_KEY = 'devora.notif.os';

/** True si les notifications système sont activées (persisté en localStorage). SSR-safe. */
export function isOsNotificationsEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(OS_ENABLED_KEY) === '1';
	} catch {
		return false;
	}
}

/** Persiste l'activation des notifications système. SSR-safe. */
export function setOsNotificationsEnabled(enabled: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(OS_ENABLED_KEY, enabled ? '1' : '0');
	} catch {
		// localStorage indisponible (mode privé strict) — on ignore.
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm run test:web -- src/lib/notificationPrefs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificationPrefs.ts src/lib/notificationPrefs.test.ts
git commit -m "feat(notifications): préférence localStorage des notifications système"
```

---

## Task 2 : Décision et affichage de la notification OS

**Files:**
- Create: `src/lib/osNotification.ts`
- Test: `src/lib/osNotification.test.ts`

**Interfaces:**
- Consumes: `isOsNotificationsEnabled()` de `src/lib/notificationPrefs.ts` (Task 1).
- Produces:
  - `type OsNotificationContext = { enabled: boolean; permission: NotificationPermission; hasFocus: boolean }`
  - `shouldShowOsNotification(ctx: OsNotificationContext): boolean` — pure
  - `showOsNotification(title: string, opts: { tag: string; onClick?: () => void }): void`

Note : `NotificationPermission` (`'default' | 'granted' | 'denied'`) est un type de la lib DOM de TypeScript, disponible même si jsdom n'implémente pas le constructeur `Notification` au runtime. Seule la fonction pure est testée — c'est la convention du repo, et ça évite d'avoir à stubber une API absente de jsdom.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/osNotification.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowOsNotification } from './osNotification';

describe('shouldShowOsNotification', () => {
	it('shows when enabled, granted, and the tab is not focused', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'granted', hasFocus: false }),
		).toBe(true);
	});

	it('stays silent when the preference is off', () => {
		expect(
			shouldShowOsNotification({ enabled: false, permission: 'granted', hasFocus: false }),
		).toBe(false);
	});

	it('stays silent when the permission was never asked', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'default', hasFocus: false }),
		).toBe(false);
	});

	it('stays silent when the permission was denied', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'denied', hasFocus: false }),
		).toBe(false);
	});

	it('stays silent when the tab already has focus (the snackbar is enough)', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'granted', hasFocus: true }),
		).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:web -- src/lib/osNotification.test.ts`
Expected: FAIL — `Failed to resolve import "./osNotification"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/lib/osNotification.ts` :

```ts
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
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm run test:web -- src/lib/osNotification.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Vérifier les types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/osNotification.ts src/lib/osNotification.test.ts
git commit -m "feat(notifications): décision et affichage d'une notification OS"
```

---

## Task 3 : Brancher la notification OS sur le flux SSE

**Files:**
- Modify: `src/hooks/useNotificationsStream.ts`

**Interfaces:**
- Consumes: `showOsNotification(title, { tag, onClick })` de `src/lib/osNotification.ts` (Task 2).
- Produces: rien de nouveau (le hook garde sa signature `useNotificationsStream(): void`).

Le hook contient déjà, dans son `es.onmessage`, un bloc `if` couvrant exactement les trois types visés, où `title` et `url` sont déjà calculés. On ajoute l'appel juste après le `snack(...)` existant — c'est le seul changement de comportement du fichier.

Pas de test unitaire : la convention du repo réserve Vitest à la logique pure, et toute la décision est déjà couverte par `osNotification.test.ts`. La vérification passe par `tsc`, `lint` et un run manuel.

- [ ] **Step 1: Ajouter l'import**

Dans `src/hooks/useNotificationsStream.ts`, après la ligne 9 (`import { isNotificationSoundMuted, playNotificationChime } from '@/lib/notificationSound';`), ajouter :

```ts
import { showOsNotification } from '@/lib/osNotification';
```

- [ ] **Step 2: Appeler `showOsNotification` après le snackbar**

Dans le même fichier, remplacer le bloc existant (lignes 56-60) :

```ts
					snack(
						title,
						severity,
						url?.startsWith('/') ? { onClick: () => r.push(url) } : undefined,
					);
```

par :

```ts
					const onClick = url?.startsWith('/') ? () => r.push(url) : undefined;
					snack(title, severity, onClick ? { onClick } : undefined);
					// Notification système : no-op si la pref est coupée, la permission
					// non accordée, ou si l'onglet a déjà le focus.
					showOsNotification(title, { tag: incoming.id, onClick });
```

- [ ] **Step 3: Vérifier les types et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que la suite de tests existante ne régresse pas**

Run: `npm run test:web`
Expected: PASS sur toute la suite.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotificationsStream.ts
git commit -m "feat(notifications): déclenche une notification OS depuis le flux SSE"
```

---

## Task 4 : Accordéon « Notifications » dans les paramètres

**Files:**
- Modify: `src/config/translate/fr.json`, `en.json`, `es.json`, `de.json`, `pt.json`
- Create: `src/components/settings/NotificationSettings.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx` (imports en tête, `useTranslations` ligne 271, nouvel accordéon avant `{/* Accordion: Appearance */}`)

**Interfaces:**
- Consumes:
  - `isOsNotificationsEnabled()` / `setOsNotificationsEnabled(enabled)` de `src/lib/notificationPrefs.ts` (Task 1)
  - `isNotificationSoundMuted()` / `setNotificationSoundMuted(muted)` de `src/lib/notificationSound.ts` (déjà dans le repo, jamais appelé par un composant jusqu'ici)
- Produces: `export default function NotificationSettings()` dans `src/components/settings/NotificationSettings.tsx`.

L'i18n est incluse dans cette tâche : les clés n'ont aucun consommateur avant le composant, les séparer donnerait un commit mort.

**Point de vigilance — hydratation.** `localStorage` et `Notification.permission` ne sont pas lisibles au premier render (SSR). Le composant initialise donc `permission` à `'unsupported'` (switch désactivé, état sûr) et synchronise dans un `useEffect` vide. Un très bref flash au premier montage du panneau est attendu et acceptable.

**Point de vigilance — inversion du son.** La lib stocke un `muted`, le switch s'affiche en positif (« Son de notification » activé). D'où `checked={soundOn}` et `setNotificationSoundMuted(!next)`.

- [ ] **Step 1: Ajouter les clés i18n dans les 5 locales**

Dans chacun des 5 fichiers, le namespace `settings` se termine par la même clé : `"assigneeSaved"`. Ajouter une virgule après cette ligne, puis le sous-objet. Attention : **tabulations**, `"assigneeSaved"` est à 2 tabs, les clés du sous-objet à 3 tabs.

`src/config/translate/fr.json` :

```json
		"assigneeSaved": "Utilisateur GitHub enregistré",
		"notifications": {
			"title": "Notifications",
			"os": "Notifications système",
			"osDesc": "Affiche une notification de ton système quand un agent termine, échoue ou pose une question. Uniquement quand Devora n'est pas au premier plan.",
			"osDenied": "Les notifications sont bloquées pour ce site. Autorise-les dans les réglages de ton navigateur.",
			"osUnsupported": "Ton navigateur ne supporte pas les notifications.",
			"sound": "Son de notification",
			"soundDesc": "Joue un carillon court à chaque nouvelle notification."
		}
```

`src/config/translate/en.json` :

```json
		"assigneeSaved": "GitHub user saved",
		"notifications": {
			"title": "Notifications",
			"os": "System notifications",
			"osDesc": "Shows a system notification when an agent finishes, fails, or asks a question. Only when Devora is not in the foreground.",
			"osDenied": "Notifications are blocked for this site. Allow them in your browser settings.",
			"osUnsupported": "Your browser does not support notifications.",
			"sound": "Notification sound",
			"soundDesc": "Plays a short chime on every new notification."
		}
```

`src/config/translate/es.json` :

```json
		"assigneeSaved": "Usuario de GitHub guardado",
		"notifications": {
			"title": "Notificaciones",
			"os": "Notificaciones del sistema",
			"osDesc": "Muestra una notificación del sistema cuando un agente termina, falla o hace una pregunta. Solo cuando Devora no está en primer plano.",
			"osDenied": "Las notificaciones están bloqueadas para este sitio. Permítelas en los ajustes de tu navegador.",
			"osUnsupported": "Tu navegador no admite notificaciones.",
			"sound": "Sonido de notificación",
			"soundDesc": "Reproduce un tono breve en cada nueva notificación."
		}
```

`src/config/translate/de.json` :

```json
		"assigneeSaved": "GitHub-Benutzer gespeichert",
		"notifications": {
			"title": "Benachrichtigungen",
			"os": "Systembenachrichtigungen",
			"osDesc": "Zeigt eine Systembenachrichtigung, wenn ein Agent fertig ist, fehlschlägt oder eine Frage stellt. Nur wenn Devora nicht im Vordergrund ist.",
			"osDenied": "Benachrichtigungen sind für diese Website blockiert. Erlaube sie in den Einstellungen deines Browsers.",
			"osUnsupported": "Dein Browser unterstützt keine Benachrichtigungen.",
			"sound": "Benachrichtigungston",
			"soundDesc": "Spielt bei jeder neuen Benachrichtigung einen kurzen Klang ab."
		}
```

`src/config/translate/pt.json` :

```json
		"assigneeSaved": "Usuário do GitHub salvo",
		"notifications": {
			"title": "Notificações",
			"os": "Notificações do sistema",
			"osDesc": "Mostra uma notificação do sistema quando um agente termina, falha ou faz uma pergunta. Apenas quando o Devora não está em primeiro plano.",
			"osDenied": "As notificações estão bloqueadas para este site. Permita-as nas definições do teu navegador.",
			"osUnsupported": "O teu navegador não suporta notificações.",
			"sound": "Som de notificação",
			"soundDesc": "Reproduz um toque breve a cada nova notificação."
		}
```

- [ ] **Step 2: Vérifier que les 5 JSON sont valides**

Run: `for f in fr en es de pt; do node -e "JSON.parse(require('fs').readFileSync('src/config/translate/$f.json','utf8')); console.log('$f ok')"; done`
Expected: `fr ok` / `en ok` / `es ok` / `de ok` / `pt ok`.

- [ ] **Step 3: Créer le composant**

Créer `src/components/settings/NotificationSettings.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { isOsNotificationsEnabled, setOsNotificationsEnabled } from '@/lib/notificationPrefs';
import { isNotificationSoundMuted, setNotificationSoundMuted } from '@/lib/notificationSound';

type PermissionState = NotificationPermission | 'unsupported';

export default function NotificationSettings() {
	const t = useTranslations('settings.notifications');

	// localStorage et Notification.permission ne sont pas lisibles au premier
	// render (SSR) — on part d'un état sûr (switch OS désactivé) puis on
	// synchronise au montage.
	const [osEnabled, setOsEnabled] = useState(false);
	const [soundOn, setSoundOn] = useState(true);
	const [permission, setPermission] = useState<PermissionState>('unsupported');

	useEffect(() => {
		setOsEnabled(isOsNotificationsEnabled());
		setSoundOn(!isNotificationSoundMuted());
		setPermission('Notification' in window ? Notification.permission : 'unsupported');
	}, []);

	// La permission ne peut être demandée que sur un geste utilisateur : une
	// demande spontanée au chargement se solde souvent par un refus définitif.
	const handleOsToggle = async (next: boolean) => {
		if (!next) {
			setOsNotificationsEnabled(false);
			setOsEnabled(false);
			return;
		}
		let granted = permission === 'granted';
		if (permission === 'default') {
			const result = await Notification.requestPermission();
			setPermission(result);
			granted = result === 'granted';
		}
		setOsNotificationsEnabled(granted);
		setOsEnabled(granted);
	};

	// La lib persiste un `muted` ; le switch s'affiche en positif.
	const handleSoundToggle = (next: boolean) => {
		setNotificationSoundMuted(!next);
		setSoundOn(next);
	};

	const osDisabled = permission === 'denied' || permission === 'unsupported';
	const osHelper =
		permission === 'denied'
			? t('osDenied')
			: permission === 'unsupported'
				? t('osUnsupported')
				: t('osDesc');

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<Box>
				<FormControlLabel
					control={
						<Switch
							size="small"
							checked={osEnabled}
							disabled={osDisabled}
							onChange={(e) => void handleOsToggle(e.target.checked)}
						/>
					}
					label={t('os')}
				/>
				<Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
					{osHelper}
				</Typography>
			</Box>

			<Box>
				<FormControlLabel
					control={
						<Switch
							size="small"
							checked={soundOn}
							onChange={(e) => handleSoundToggle(e.target.checked)}
						/>
					}
					label={t('sound')}
				/>
				<Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
					{t('soundDesc')}
				</Typography>
			</Box>
		</Box>
	);
}
```

- [ ] **Step 4: Ajouter les imports dans SettingsPanel**

Dans `src/components/settings/SettingsPanel.tsx`, après la ligne 34 (`import PersonRoundedIcon from '@mui/icons-material/PersonRounded';`), ajouter :

```tsx
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
```

Puis, après la ligne 38 (`import GitHubAssigneeSettings from './GitHubAssigneeSettings';`), ajouter :

```tsx
import NotificationSettings from './NotificationSettings';
```

- [ ] **Step 5: Ajouter le hook de traduction**

Dans le même fichier, après la ligne 271 (`const tAppearance = useTranslations('appearance');`), ajouter :

```tsx
	const tNotif = useTranslations('settings.notifications');
```

- [ ] **Step 6: Insérer l'accordéon**

Toujours dans `src/components/settings/SettingsPanel.tsx`, juste avant le commentaire `{/* Accordion: Appearance */}`, insérer un accordéon strictement identique aux autres :

```tsx
				{/* Accordion: Notifications */}
				<Accordion
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<NotificationsRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{tNotif('title')}
							</Typography>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<NotificationSettings />
					</AccordionDetails>
				</Accordion>

```

- [ ] **Step 7: Formater, typer, linter, builder**

Run: `npm run format && npx tsc --noEmit && npm run lint && npm run test:web`
Expected: aucune erreur, suite Vitest verte.

Run: `npm run build`
Expected: build Next réussi.

- [ ] **Step 8: Vérification manuelle**

Lancer `npm run dev`, puis dans le navigateur :

1. Aller sur `/settings` → l'accordéon « Notifications » est présent, entre « Utilisateur GitHub » et « Apparence ».
2. Activer « Notifications système » → le navigateur demande la permission. Accorder.
3. Lancer un agent depuis le Workbench, puis passer sur une **autre application** (pas juste un autre onglet — il faut que la fenêtre perde le focus).
4. À la fin de l'agent : une notification système apparaît. Cliquer dessus → la fenêtre reprend le focus et navigue vers `/workbench?session=<id>`.
5. Revenir sur Devora au premier plan, relancer un agent : **seul** le snackbar apparaît, pas de notification OS.
6. Couper « Son de notification », relancer un agent : plus de carillon. Le réactiver : le carillon revient.
7. Couper « Notifications système », relancer un agent hors focus : plus de notification OS.

- [ ] **Step 9: Commit**

```bash
git add src/config/translate/fr.json src/config/translate/en.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json src/components/settings/NotificationSettings.tsx src/components/settings/SettingsPanel.tsx
git commit -m "feat(settings): accordéon Notifications (notifs système + son)"
```

---

## Récapitulatif de vérification finale

Après la Task 4, l'ensemble doit passer :

```bash
npm run test:web && npx tsc --noEmit && npm run lint && npm run build
```

Et la checklist manuelle du Step 8 doit être intégralement validée avant de considérer la fonctionnalité terminée.

Ne pas pousser ni ouvrir de PR sans accord explicite de Ludovic.
