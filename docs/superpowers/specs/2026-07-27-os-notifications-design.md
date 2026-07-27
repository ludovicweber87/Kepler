# Notifications OS natives — design

Date : 2026-07-27
Statut : validé, prêt pour plan d'implémentation

## Problème

Devora produit déjà des notifications applicatives (`agent_done`, `agent_error`,
`agent_blocked`) poussées en SSE depuis le serveur agent. Elles n'existent que
dans l'onglet : snackbar in-app, carillon Web Audio, pastille sidebar. Dès que
l'utilisateur passe sur un autre espace ou une autre application, il ne sait plus
qu'un agent a terminé ou qu'un agent attend une réponse.

On veut une notification système, activable depuis les paramètres.

## Périmètre

**Dans le scope**

- Notification OS via l'API `Notification` du navigateur, déclenchée côté client.
- Les trois types existants : `agent_done`, `agent_error`, `agent_blocked`.
- Uniquement quand l'onglet n'a pas le focus.
- Un accordéon « Notifications » dans les paramètres, avec deux switches :
  notifications système, et son de notification.

**Hors scope**

- Notification quand aucun onglet Devora n'est ouvert (nécessiterait un
  déclenchement depuis le serveur agent via `osascript` / `node-notifier`).
- Granularité par type de notification.
- Enrichissement du `payload` des notifications (repo, branche, nom lisible de
  session) : la notif OS n'affiche qu'un titre en v1.
- Web Push, service worker, notifications distantes.

## Contexte existant

| Élément | Emplacement |
| --- | --- |
| Émission des notifications | `packages/agent/src/sdk/sdkAgent.ts` (2 points : fin de tour, question posée) |
| Persistance + SSE | `packages/agent/src/notifications/{build,insert,store}.ts`, route `GET :4001/notifications/stream` |
| Réception client | `src/hooks/useNotificationsStream.ts` (monté une fois dans `AppShell`) |
| Traduction du titre | `titleFor()` dans `src/lib/notificationsReducer.ts`, namespace i18n `notifications` |
| Son | `src/lib/notificationSound.ts` — `setNotificationSoundMuted()` existe mais n'est appelé par **aucun** composant |
| Panneau paramètres | `src/components/settings/SettingsPanel.tsx` (liste d'accordéons MUI) |

Aucun usage de l'API `Notification`, de service worker ou de `node-notifier`
n'existe aujourd'hui dans le repo.

## Décisions

### D1 — Déclenchement côté client, pas côté serveur agent

L'API `Notification` du navigateur est retenue plutôt qu'un `osascript` depuis
`packages/agent`.

Conséquence assumée : rien n'est notifié si l'onglet Devora est fermé. En
contrepartie, aucune dépendance nouvelle, comportement cross-platform, et la
notification est cliquable pour ramener le focus sur la bonne session — ce qu'un
`display notification` macOS ne permet pas.

### D2 — Préférences en localStorage

Les deux réglages sont persistés en localStorage, pas dans `app_settings`.

Trois raisons : le panneau Appearance persiste déjà tout en localStorage
(`useThemePrefs`, `useColorMode`) ; la lecture est synchrone donc le switch ne
flashe pas au montage ; et la permission `Notification` étant scopée au
navigateur, une préférence scopée au navigateur est sémantiquement cohérente.

Passer par `useAppSetting` aurait imposé un aller-retour asynchrone et laissé le
mute son en localStorage — deux mécanismes de persistance dans le même accordéon.

### D3 — Pas de notification OS quand l'onglet a le focus

Garde sur `document.hasFocus()`. Si l'utilisateur regarde déjà l'écran, le
snackbar suffit ; une notification OS ferait doublon. C'est le comportement de
Slack et de Linear.

Le snackbar et le carillon restent inchangés dans tous les cas : la notification
OS s'ajoute, elle ne remplace rien.

### D4 — Permission demandée au clic sur le switch

Jamais au chargement de la page. Chrome et Safari exigent un geste utilisateur, et
une demande spontanée au boot est le meilleur moyen d'obtenir un refus définitif.

### D5 — Titre seul, pas de corps

La notification affiche le titre traduit (`« L'agent a terminé »`) sans corps. Le
`payload` actuel ne contient qu'un UUID de session, inexploitable pour un humain.
Enrichir le payload côté `sdkAgent.ts` est une évolution séparée.

## Architecture

```
SSE  ──▶  useNotificationsStream
             ├─ setQueryData(['notifications'])        (inchangé)
             ├─ playNotificationChime()                (inchangé)
             ├─ showSnackbar(...)                      (inchangé)
             └─ showOsNotification(title, { tag, onClick })   ◀── NOUVEAU
                     └─ shouldShowOsNotification({ enabled, permission, hasFocus })
                              ├─ isOsNotificationsEnabled()   (localStorage)
                              ├─ Notification.permission
                              └─ document.hasFocus()
```

### Nouveaux modules

**`src/lib/notificationPrefs.ts`**

Calqué sur `notificationSound.ts` : helpers SSR-safe autour d'une clé
localStorage `devora.notif.os`.

```ts
export function isOsNotificationsEnabled(): boolean;  // défaut false
export function setOsNotificationsEnabled(enabled: boolean): void;
```

Les deux fonctions sont protégées par `typeof window === 'undefined'` et un
`try/catch` (localStorage indisponible en navigation privée stricte), exactement
comme `notificationSound.ts`.

**`src/lib/osNotification.ts`**

Sépare la décision (pure, testable) de l'effet de bord.

```ts
export type OsNotificationContext = {
  enabled: boolean;
  permission: NotificationPermission;
  hasFocus: boolean;
};

/** Pure. Vraie uniquement si la pref est active, la permission accordée,
 *  et l'onglet sans focus. */
export function shouldShowOsNotification(ctx: OsNotificationContext): boolean;

/** Effet de bord. Lit la pref et l'état du document, no-op silencieux si
 *  `Notification` est absent de l'environnement ou si la décision est fausse. */
export function showOsNotification(
  title: string,
  opts: { tag: string; onClick?: () => void },
): void;
```

`showOsNotification` construit
`new Notification(title, { tag, icon: '/logo.png', silent: true })`. Le `silent`
est inconditionnel : l'onglet est nécessairement vivant pour que ce code
s'exécute, donc `playNotificationChime()` se déclenche déjà pour le même
événement dans `useNotificationsStream` — c'est le seul canal audio, et le
switch « Son de notification » le gouverne entièrement (pas de double bip OS +
carillon). Le `tag` vaut l'id de session (`entity_ref.id`, avec repli sur l'id
de la notification si absent) : l'OS remplace la notification précédente de la
même session au lieu de l'empiler — un `agent_blocked` suivi d'un `agent_done`
sur la même session ne laisse qu'une notification, mais des sessions distinctes
s'empilent normalement. Le handler `onclick` appelle `window.focus()` puis le
callback fourni.

`/logo.png` existe déjà dans `public/`.

### Modification de `useNotificationsStream.ts`

Un seul ajout, dans le bloc `if` qui gère déjà les trois types, après le
`showSnackbar` existant. Le `title` et le `url` sont déjà calculés à cet endroit ;
on réutilise la même condition `url?.startsWith('/')` pour décider si le clic
navigue.

```ts
showOsNotification(title, {
  tag: incoming.entity_ref?.id ?? incoming.id,
  onClick: url?.startsWith('/') ? () => r.push(url) : undefined,
});
```

Aucune autre modification du hook. Aucune modification de `packages/agent`.

## UI des paramètres

**`src/components/settings/NotificationSettings.tsx`** — nouveau composant client
autonome, sur le modèle de `GitHubAssigneeSettings.tsx` (son propre
`useTranslations`, son propre état).

Deux lignes `FormControlLabel` + `Switch size="small"` :

1. **Notifications système** — lit `isOsNotificationsEnabled()` dans un `useState`
   initialisé au montage (évite un mismatch d'hydratation en initialisant à
   `false` puis en synchronisant dans un `useEffect`).
2. **Son de notification** — même pattern autour de `isNotificationSoundMuted()` /
   `setNotificationSoundMuted()`. Le switch est présenté en positif (« activé »),
   donc `checked={!muted}`.

### Machine à états de la permission

Le composant lit `Notification.permission` au montage (dans le même `useEffect`,
avec une garde `'Notification' in window`).

| Permission | Switch « notifications système » |
| --- | --- |
| `default` | Actif. À l'activation : `await Notification.requestPermission()`. On ne persiste `true` que si le retour est `granted` ; sinon le switch retombe à off et l'état de permission est rafraîchi. |
| `granted` | Actif, toggle libre. |
| `denied` | **Désactivé** (`disabled`), avec un `FormHelperText` expliquant qu'il faut débloquer les notifications pour ce site dans les réglages du navigateur. Rien n'est faisable depuis le code à ce stade. |
| API absente | **Désactivé**, helper text « non supporté par ce navigateur ». |

La désactivation du switch (passage à off) ne révoque évidemment pas la
permission : elle écrit simplement `false` en localStorage.

**`src/components/settings/SettingsPanel.tsx`** — un accordéon supplémentaire,
strictement le même bloc stylé que les autres, icône `NotificationsRoundedIcon`,
inséré avant l'accordéon Appearance. Il rend `<NotificationSettings />`.

## i18n

Nouveau sous-objet dans le namespace `settings` — surtout **pas** le namespace
racine `notifications`, qui contient les libellés des types et est consommé par
`titleFor()`.

```json
"settings": {
  "notifications": {
    "title": "Notifications",
    "os": "Notifications système",
    "osDesc": "Affiche une notification de votre système quand un agent termine, échoue ou pose une question. Seulement quand Devora n'est pas au premier plan.",
    "osDenied": "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages de votre navigateur.",
    "osUnsupported": "Votre navigateur ne supporte pas les notifications.",
    "sound": "Son de notification",
    "soundDesc": "Joue un carillon court à chaque nouvelle notification."
  }
}
```

Les cinq locales (`fr`, `en`, `es`, `de`, `pt`) sont mises à jour ensemble.

## Tests

Convention du repo : logique pure uniquement, Vitest.

**`src/lib/osNotification.test.ts`** — matrice complète de
`shouldShowOsNotification` :

| enabled | permission | hasFocus | attendu |
| --- | --- | --- | --- |
| `false` | `granted` | `false` | `false` |
| `true` | `default` | `false` | `false` |
| `true` | `denied` | `false` | `false` |
| `true` | `granted` | `true` | `false` |
| `true` | `granted` | `false` | **`true`** |

**`src/lib/notificationPrefs.test.ts`** — calqué sur `notificationSound.test.ts` :
défaut à `false`, aller-retour set/get, robustesse quand localStorage jette.

L'UI se vérifie par `npm run lint`, `tsc --noEmit`, `npm run build` et un run
manuel (activer le toggle, accorder la permission, lancer un agent, changer
d'application, vérifier la notification et le clic).

## Risques

- **Permission refusée définitivement.** Irréversible depuis le code. Mitigé par
  D4 (demande sur geste utilisateur) et par un message d'aide explicite.
- **Hydratation.** La lecture de localStorage et de `Notification.permission` ne
  peut pas se faire au premier render. Le composant initialise à `false` puis
  synchronise dans un `useEffect` — un très bref flash du switch est possible au
  premier montage du panneau de paramètres, acceptable.
- **Bruit.** Trois types notifiés sans filtre. Si ça devient gênant en usage réel,
  la granularité par type est une évolution triviale (le point d'appel est unique).
- **`document.hasFocus()` est par onglet.** Avec Devora ouvert dans deux onglets,
  l'onglet qui n'a pas le focus déclenche une notification OS même si
  l'utilisateur regarde l'autre onglet Devora à l'écran. Accepté pour une app
  locale mono-utilisateur ; un `BroadcastChannel` entre onglets serait le
  correctif si ça devient gênant en usage réel.
