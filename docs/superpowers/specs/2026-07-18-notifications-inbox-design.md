# Inbox unifiée (centre de notifications) — v1

**Date** : 2026-07-18
**Statut** : Design validé, prêt pour le plan d'implémentation
**Portée** : v1 complète — 4 sources (agents, CI, GitHub, PR), table persistée + poller côté serveur agent, push SSE, cloche Header + page inbox. Pas de toasts en v1 (le champ `priority` les prépare pour plus tard).

## Contexte & objectif

Devora vise à absorber les outils externes. L'inbox est le **hub** qui remplace les allers-retours vers github.com (notifs, CI, état des PRs) et les pings Slack. Une **source de vérité unique** — la table `notifications` — agrège quatre sources ; le front écoute un **stream SSE** et n'interroge jamais GitHub directement.

Objectif : au réveil, un seul écran répond à « qu'est-ce qui a bougé pendant que j'étais parti / qu'un agent tournait ? » — agent terminé/bloqué, CI cassée, review demandée, PR mergée.

## Décisions validées

1. **Sources v1** : (a) agents `agent_done`/`agent_error`/`agent_blocked` ; (b) CI de mes PRs `ci_failed`/`ci_passed` ; (c) GitHub `mention`/`review_requested` ; (d) PR `pr_merged`/`pr_approved`/`changes_requested`.
2. **Persistance** : table SQLite `notifications`, source de vérité unique. `dedupeKey` unique → poller idempotent (`INSERT OR IGNORE`).
3. **Génération** : les events agents sont insérés **côté serveur agent** au point déjà hooké (`sdkAgent.ts`, `result`/`ask_question`). Les events GitHub/CI/PR sont produits par un **poller côté serveur agent** (`githubPoller`) qui diffe l'état.
4. **Transport push serveur→front** : **endpoint SSE dédié** `GET /notifications/stream` sur le serveur agent (:4001). Unidirectionnel, reconnexion native `EventSource`. GitHub reste **pollé côté serveur** (pas de webhook) — le SSE ne transporte que le résultat.
5. **CRUD** (list, mark-read, mark-all-read) : routes **Next** (`src/app/api/notifications/`), pattern `requireAuth`, cohérent avec le reste des routes DB.
6. **Surfaces UI** : cloche + dropdown dans le Header ; page inbox complète (entrée Sidebar). **Pas de toast** en v1.
7. **Affichage i18n** : le poller ne connaît pas la locale → on stocke `type` + `payload` (JSON) ; **le titre est traduit à l'affichage** côté front via `t(type, payload)`. `title`/`body` en DB sont des fallbacks optionnels.

## Frontière : ce que le SSE résout (et ne résout pas)

GitHub ne pousse rien sans webhook (impraticable en local). Le SSE transporte le flux **serveur agent → front**, pas la récupération de la donnée. Le `githubPoller` interroge donc GitHub côté serveur (respect de l'en-tête `X-Poll-Interval`, ~60 s), insère les nouvelles lignes, puis `notificationStore.emit()` les pousse sur le SSE. Le front **ne poll jamais** GitHub ; il écoute le stream et garde un `GET /api/notifications` React Query comme filet (chargement initial + resync à la reconnexion).

## Architecture

### 1. Schéma / migration — `src/db/schema.ts` + `src/db/migrations/`

Nouvelle table `notifications` :
```ts
export const notifications = sqliteTable('notifications', {
	id: uuid(),
	source: text().$type<NotificationSource>().notNull(),   // 'agent'|'github'|'ci'|'pr'
	type: text().$type<NotificationType>().notNull(),       // cf. union ci-dessous
	priority: text().$type<'high' | 'normal'>().notNull().default('normal'),
	title: text().default(''),                              // fallback ; l'affichage traduit `type`+`payload`
	body: text().default(''),                               // fallback optionnel
	url: text().default(''),                                // deep-link (interne ou github)
	entity_ref: text({ mode: 'json' }).$type<EntityRef>(),  // { kind, id, repo? }
	payload: text({ mode: 'json' }).$type<Record<string, string>>().default({}), // vars i18n
	dedupe_key: text().notNull().unique(),                  // idempotence poller
	read_at: timestamp_nullable(),                          // null = non-lu
	created_at: timestamp(),
});
```
Notes :
- `read_at` doit être **nullable sans défaut** (null = non-lu). Le helper `timestamp()` maison applique `default(datetime('now'))` ; on utilise donc une colonne `text()` nue (`timestamp_nullable` = alias documentaire, à définir localement ou inliner `text()`), **pas** le helper `timestamp()`.
- Index unique sur `dedupe_key` (idempotence). Index simple sur `read_at` et `created_at` (requêtes badge + tri).
- Migration **additive** via `npx drizzle-kit generate` → `src/db/migrations/`. La table est jouée par l'app Next à l'import (`src/db/index.ts`) ; le serveur agent (`packages/agent/src/db.ts`, `fileMustExist`) ne joue pas les migrations → **l'app Next doit avoir démarré au moins une fois** pour créer la table avant que le poller n'écrive. En dev, `dev-auto-port.mjs` lance les deux ; documenter l'ordre (Next crée le schéma, agent écrit).

### 2. Types (`src/types/index.ts`)

```ts
export type NotificationSource = 'agent' | 'github' | 'ci' | 'pr';
export type NotificationType =
	| 'agent_done' | 'agent_error' | 'agent_blocked'
	| 'ci_failed' | 'ci_passed'
	| 'mention' | 'review_requested'
	| 'pr_merged' | 'pr_approved' | 'changes_requested';
export interface EntityRef { kind: 'session' | 'issue' | 'pr'; id: string; repo?: string; }
export interface AppNotification {
	id: string;
	source: NotificationSource;
	type: NotificationType;
	priority: 'high' | 'normal';
	title: string;
	body: string;
	url: string;
	entity_ref: EntityRef | null;
	payload: Record<string, string>;
	read_at: string | null;
	created_at: string;
}
```
`priority: 'high'` = `agent_blocked`, `agent_error`, `ci_failed`, `changes_requested`. Le reste = `normal`.

### 3. Génération des events

Un module partagé construit `dedupe_key` + `payload` de façon déterministe, réutilisé par les deux writers et testable en isolation.

**`packages/agent/src/notifications/build.ts`** (logique pure, testée) :
- `buildDedupeKey(type, ref)` → ex : `ci_failed:owner/repo#42:<sha>`, `agent_blocked:<sessionId>:<logId>`, `mention:<githubThreadId>`.
- `buildNotification(input): NewNotification` → normalise source/type/priority/url/payload.
- `diffGithubState(prev, next): NewNotification[]` — cœur du poller, **pur** : reçoit l'état précédent et l'état courant (PRs + check-runs + threads notifs), retourne la liste des notifs à insérer. Aucune I/O.

**Writer agent — fin/erreur** — `packages/agent/src/sdk/sdkAgent.ts` (au point `result` déjà hooké, ~ligne 98, à côté de l'écriture `agent_activity_logs` ~ligne 143) :
- `result` avec `is_error` → `agent_error` (high) ; sinon `agent_done`.
- `url` = `/workbench?session=<sessionId>`. `entity_ref = { kind:'session', id: sessionId, repo }`. `dedupe_key = agent_done|agent_error:<sessionId>:<num_turns>` (stable, lié au run terminé).
- insert via un helper commun `insertNotification(db, notif)` (`INSERT OR IGNORE` sur `dedupe_key`) puis `notificationStore.emit(row)` **si** une ligne a bien été insérée (rowsAffected > 0).

**Writer agent — bloqué (question en attente)** — ⚠️ **PAS** dans `sdkAgent.ts` : il n'existe aucune dérivation `ask_question` dans `activityDeriver.ts`. Le signal « l'agent attend ta réponse » est owné par **`packages/agent/src/sdk/permissions.ts`**, qui gère les `PendingQuestion { id, questions }` (AskUserQuestion). C'est **là** qu'on émet `agent_blocked` :
- au moment où une `PendingQuestion` est créée/enregistrée → `agent_blocked` (high).
- `dedupe_key = agent_blocked:<sessionId>:<PendingQuestion.id>` (l'`id` de la question est **stable** ; ne surtout pas utiliser un `randomUUID()` volatil de log, cf. Risque #5).
- `url` = `/workbench?session=<sessionId>`, même helper `insertNotification` + `notificationStore.emit`.

**Writer poller** — `packages/agent/src/notifications/githubPoller.ts` :
- `setInterval` démarré avec le serveur agent (`packages/agent/src/index.ts`). Intervalle par défaut 60 s, ajusté à l'en-tête `X-Poll-Interval` de la réponse `/notifications`.
- Repos surveillés = union des `repo_paths` (déjà en DB). Token GitHub via la session `gh` CLI (même mécanisme que `src/lib/auth-utils.ts`, réutilisé côté agent).
- À chaque tick : fetch (a) `GET /notifications` (mentions, review_requested), (b) PRs ouvertes de l'auteur + leurs check-runs (`fetchCheckRunsForRef` existe déjà dans `src/lib/github.ts` — extraire la partie réutilisable ou dupliquer côté agent), (c) review decision des PRs. Passe `prev`/`next` à `diffGithubState`, insère le delta, émet sur le SSE.
- État `prev` conservé **en mémoire** dans le poller (pas de table d'état) ; au démarrage `prev` est vide → premier tick réhydraté depuis la dernière notif connue par `dedupe_key` (l'`INSERT OR IGNORE` absorbe les doublons, donc un `prev` vide au boot ne recrée pas de notifs déjà en base).
- Backoff : sur 403/rate-limit, respecter `Retry-After` / `X-RateLimit-Reset` ; log et skip le tick.

Tableau récap :

| Source | Déclencheur | Où | Type produit | priority |
|--------|-------------|-----|--------------|----------|
| agent  | event `result` | `sdkAgent.ts` (hook existant) | `agent_done` / `agent_error` | normal / **high** |
| agent  | `PendingQuestion` créée | `permissions.ts` (⚠️ pas `sdkAgent.ts`) | `agent_blocked` | **high** |
| ci     | diff check-runs PRs | `githubPoller` | `ci_failed` / `ci_passed` | **high** / normal |
| github | diff `GET /notifications` | `githubPoller` | `mention` / `review_requested` | normal |
| pr     | diff état PR | `githubPoller` | `pr_merged` / `pr_approved` / `changes_requested` | normal / normal / **high** |

### 4. SSE — `packages/agent/src/notifications/store.ts` + `packages/agent/src/routes/notifications.ts`

`notificationStore` (in-memory pub/sub) :
```ts
const clients = new Set<ServerResponse>();
export const notificationStore = {
	emit(n: AppNotification) { const d = `data: ${JSON.stringify(n)}\n\n`; for (const c of clients) c.write(d); },
	subscribe(res: ServerResponse) { clients.add(res); return () => clients.delete(res); },
};
```
Route SSE (branchée dans le dispatch par préfixe de `packages/agent/src/index.ts`, préfixe `/notifications`) :
```ts
// GET /notifications/stream
res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
res.write(': hello\n\n');
const ping = setInterval(() => res.write(': ping\n\n'), 25_000);   // keep-alive
const off = notificationStore.subscribe(res);
req.on('close', () => { clearInterval(ping); off(); });
```
CORS localhost déjà géré par le serveur agent. Auth : cohérent avec les autres routes agent (Bearer token local, cf. `localFetch`). Le stream est global (mono-utilisateur) — pas de filtrage par user.

### 5. CRUD Next — `src/app/api/notifications/route.ts` (+ `mark-read`, `mark-all-read`)

Pattern `requireAuth` / `isAuthError`, Drizzle sync :
- **GET `/api/notifications?limit=50`** → `db.select().from(notifications).orderBy(desc(created_at)).limit()`. Query `?unread=1` → filtre `isNull(read_at)`. Query `?count=1` → juste le compteur non-lus (pour le badge initial).
- **PATCH `/api/notifications/mark-read`** `{ ids: string[] }` → `UPDATE ... SET read_at = datetime('now') WHERE id IN (...)`.
- **POST `/api/notifications/mark-all-read`** → `UPDATE ... SET read_at = datetime('now') WHERE read_at IS NULL`.

Le mark-read est **purement local** (aucun appel GitHub en v1 : on ne synchronise pas l'état lu vers GitHub — simplification assumée, cf. Hors scope).

### 6. Front — hooks

- **`src/hooks/useNotifications.ts`** (React Query, filet + initial) : `queryKey ['notifications']` → `GET /api/notifications`. Expose `notifications`, `unreadCount` (dérivé), `isLoading`. `staleTime` court ; **pas de `refetchInterval`** (le SSE pousse).
- **`src/hooks/useNotificationsStream.ts`** : `new EventSource(getAgentSseUrl() + '/notifications/stream')`. `onmessage` → `queryClient.setQueryData(['notifications'], prepend + dédup par id)`. `onerror` → `EventSource` reconnecte seul ; on déclenche un `invalidateQueries(['notifications'])` au retour pour resync (rattrape ce qui a été inséré pendant la coupure). Monté une seule fois (dans `AppShell` ou un provider dédié).
- **`src/hooks/useMarkNotifications.ts`** : mutations optimistes `markRead(ids)` / `markAllRead()` (`setQueryData` + rollback `onError`, invalidation `onSettled`).
- `src/lib/local-fetch.ts` : ajouter `getAgentSseUrl()` (analogue à `getAgentWsUrl()`, base `NEXT_PUBLIC_AGENT_URL`).

### 7. Front — reducer client (logique pure, testée)

**`src/lib/notificationsReducer.ts`** :
- `prependNotification(list, incoming)` → insère en tête, dédup par `id`, tri desc par `created_at`, cap à N (ex. 200) pour le cache mémoire.
- `titleFor(n, t)` → résout le libellé affiché via `t(n.type, n.payload)` avec fallback sur `n.title`.
- `iconFor(source)` / `groupByDay(list)` (helpers page).

### 8. Surfaces UI

**Cloche** — `src/components/layout/Header.tsx`, cluster droit (`Box gap:1.5`, ~ligne 75), **avant** l'Avatar :
```tsx
<IconButton onClick={openMenu}>
	<Badge badgeContent={unreadCount} color="error"><NotificationsRoundedIcon/></Badge>
</IconButton>
```
→ `src/components/notifications/NotificationsMenu.tsx` (MUI `Menu`) : 10 dernières. Item = icône source + titre traduit + temps relatif + dot non-lu. Clic item → `router.push(n.url)` (ou `window.open` si URL github) + `markRead([n.id])`. Header du menu : « Tout marquer lu ». Footer : « Tout voir » → `/notifications`.

**Page** — `src/app/(app)/notifications/page.tsx` + entrée dans `Sidebar.tsx` `mainItems` (badge non-lus décorant l'icône) :
- `src/components/notifications/NotificationsPage.tsx` : filtres par source (chips Agents / CI / GitHub / PR + « Tout »), liste groupée par jour (`groupByDay`), bouton « Tout marquer lu ».
- `src/components/notifications/NotificationItem.tsx` : ligne partagée entre menu et page (icône, titre, body, temps relatif, dot). Clic → navigation + mark-read.

### 9. Actions par type

| Type | `url` (deep-link) | Effet du clic |
|------|-------------------|---------------|
| `agent_done` / `agent_error` / `agent_blocked` | `/workbench?session=<id>` | ouvre/reprend la conversation |
| `ci_failed` / `ci_passed` | URL github de la PR | ouvre la PR (nouvel onglet) |
| `mention` / `review_requested` | URL github issue/PR | ouvre le thread |
| `pr_merged` / `pr_approved` / `changes_requested` | URL github de la PR | ouvre la PR |

Tous les clics marquent la notif lue.

### 10. i18n

Namespace `notifications` (5 locales : en/fr/es/de/pt) :
- Un libellé par `type`, avec interpolation depuis `payload` (ex. `"ci_failed": "CI échouée sur {repo} #{number} ({check})"`, `"agent_blocked": "L'agent {agent} attend ta réponse"`).
- Labels UI : titre de page, chips de filtre (Agents/CI/GitHub/PR/Tout), « Tout marquer lu », « Tout voir », temps relatif (« à l'instant », « il y a {n} min »… ou réutiliser un util existant), empty-state.
- Sidebar : `sidebar.notifications` (« Notifications »). Pas de texte en dur.

## Tests (Vitest — logique pure only, convention repo)

- `buildDedupeKey` / `buildNotification` : formats stables par type.
- `diffGithubState(prev, next)` : le poller — cas nominal (nouvelle PR mergée, CI qui passe failure→success→failure, review_requested apparaît/disparaît), aucun doublon quand `prev == next`, `prev` vide au boot.
- `prependNotification` : dédup par id, tri, cap.
- `titleFor` : interpolation payload + fallback.
- classification `priority` par type.
- `groupByDay` : regroupement + ordre.

## Hors scope v1

- **Toasts** à l'arrivée (le champ `priority` les prépare ; réactivation ultérieure via `useSnackbar` filtré `priority === 'high'`).
- **Sync de l'état lu vers GitHub** (mark-as-read GitHub via `PATCH /notifications/threads/:id`). v1 = lu local seulement.
- **Webhooks GitHub** (push natif) — nécessiterait un tunnel public.
- **Préférences par source** (mute CI, etc.) et **réglage d'intervalle** du poller côté UI.
- **Rétention / purge** automatique des vieilles notifs (à prévoir si la table grossit — v1 : cap d'affichage côté client seulement).
- **Multi-device / multi-user** : le stream est global (mono-utilisateur assumé).

## Risques / points à vérifier pendant le plan

1. **`read_at` nullable** : ne PAS utiliser le helper `timestamp()` maison (il force un défaut `datetime('now')`) — colonne `text()` nue pour que null = non-lu. Vérifier la migration générée.
2. **Ordre de création du schéma** : la table est jouée par l'app Next (migrations), pas par l'agent (`fileMustExist`). Le poller doit gérer gracieusement une table absente au tout premier boot (try/catch + log), ou garantir que Next démarre d'abord (`dev-auto-port.mjs`).
3. **Token GitHub côté agent** : **déjà résolu** — `packages/agent/src/helpers.ts` fournit la résolution du token via `gh auth token` / `GITHUB_TOKEN` (utilisé par `routes/git.ts`, `routes/recap.ts` qui lit déjà `repo_paths`). Caveat : le helper existant `resolveGitHubToken(req)` est **lié à la requête** (retourne null sans header Bearer) ; le poller n'a pas de requête → appeler directement le chemin `execFileSync(findGh(), ['auth','token'])`. Risque réel = juste ce découplage requête, pas la faisabilité.
4. **`fetchCheckRunsForRef` est module-privé** dans `src/lib/github.ts` (côté app Next), pas importable tel quel depuis `packages/agent`. Décision plan : extraire un util partagé ou dupliquer la logique REST côté agent (le second est plus simple vu la séparation des deux packages).
5. **Idempotence au reboot du poller** : `prev` en mémoire est perdu au restart → s'appuyer entièrement sur `INSERT OR IGNORE` + `dedupe_key` pour ne pas recréer de notifs. Vérifier que chaque `dedupe_key` est **stable dans le temps** (inclut le `sha` pour la CI, le `thread id` pour GitHub — pas de timestamp volatil).
6. **SSE keep-alive & reconnexion** : commentaires `: ping` toutes les 25 s ; côté front, `onerror` d'`EventSource` reconnecte automatiquement mais il faut **resync** (`invalidateQueries`) au retour pour rattraper les inserts manqués. Tester une coupure du serveur agent.
7. **Badge initial** : au chargement, le compteur vient de `GET /api/notifications?count=1` (React Query), puis le SSE prend le relais. Éviter le double-comptage (SSE qui repousse une notif déjà dans le cache → dédup par id dans `prependNotification`).
8. **Repos surveillés** : borne la liste aux `repo_paths` pour ne pas exploser le rate-limit GitHub ; si beaucoup de repos, sérialiser/espacer les appels check-runs (déjà paginé dans `fetchRepoPullRequests`).
9. **`entity_ref` / `url` cohérents** : le deep-link session (`/workbench?session=`) suppose que la session existe encore ; sinon l'empty-state du Workbench gère.
10. **Imports ESM côté agent** : `packages/agent` utilise des extensions `.js` dans les imports. Les nouveaux modules agent (`notifications/store.ts`, `build.ts`, `githubPoller.ts`, `routes/notifications.ts`) doivent suivre cette convention en s'insérant dans `index.ts`.
