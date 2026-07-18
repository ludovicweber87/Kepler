# Inbox unifiée (centre de notifications) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une inbox unifiée qui agrège 4 sources d'events (agents, CI, GitHub, PR) dans une table SQLite unique, poussée en temps réel au front via SSE, consommée par une cloche Header + une page inbox.

**Architecture:** Une table `notifications` = source de vérité unique. Côté serveur agent (:4001) : writers agents (`sdkAgent.ts`, `permissions.ts`) + un `githubPoller` qui diffe l'état GitHub et insère le delta ; toute insertion émet sur un `notificationStore` in-memory relayé par un endpoint SSE `/notifications/stream`. Côté app Next : routes CRUD (`requireAuth`), hooks React Query + `EventSource`, cloche Header et page `/notifications`. Toute la logique décisionnelle (dedupe, diff, reducer) est pure et testée en isolation.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Drizzle + better-sqlite3, MUI 7, TanStack Query 5, next-intl 4.8, serveur agent Node (http natif + SSE), Vitest.

## Global Constraints

- **i18n obligatoire** : jamais de texte en dur dans les composants — `useTranslations`, traductions dans les **5** locales (`en/fr/es/de/pt`), fichiers `src/config/translate/{locale}.json`.
- **Tests = logique pure uniquement** (Vitest, `*.test.ts` sur lib/hooks). Pas de test UI (vérif par `lint` + `tsc --noEmit` + `build`).
- **Path alias** `@/*` → `./src/*`. Types centralisés dans `src/types/index.ts`.
- **DB** : IDs `text` + `crypto.randomUUID()` via helper `uuid()` ; timestamps `text` via helper `timestamp()` (défaut `datetime('now')`) — **sauf `read_at`** qui doit être `text()` nu nullable. JSON via `text({ mode: 'json' })`.
- **App Next** joue les migrations à l'import ; **serveur agent** ouvre le même fichier (`fileMustExist`, SQL brut), ne joue PAS les migrations.
- **Imports ESM côté `packages/agent`** : extensions `.js` dans les imports relatifs.
- **Pas de commit/push git** au-delà des commits de tâches décrits ici. Aucune interaction réseau non prévue.
- **Convention API Next** : `requireAuth()` + `isAuthError()` en tête de chaque handler ; Drizzle sync (`.all()/.get()/.run()`), `NextResponse.json`.

---

### Task 1: Schéma `notifications` + migration + types

**Files:**
- Modify: `src/db/schema.ts` (ajouter la table `notifications`)
- Modify: `src/types/index.ts` (types partagés)
- Create (généré): `src/db/migrations/XXXX_*.sql` via drizzle-kit

**Interfaces:**
- Produces: table Drizzle `notifications` ; types `NotificationSource`, `NotificationType`, `EntityRef`, `AppNotification`, `NewNotification`.

- [ ] **Step 1: Ajouter les types dans `src/types/index.ts`**

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
export type NewNotification = Omit<AppNotification, 'id' | 'read_at' | 'created_at'> & { dedupe_key: string };
```

- [ ] **Step 2: Ajouter la table dans `src/db/schema.ts`**

Suivre les helpers existants (`uuid()`, `timestamp()`). `read_at` est une colonne `text()` **nue** (nullable, pas de défaut) pour que `null` = non-lu.

```ts
export const notifications = sqliteTable('notifications', {
	id: uuid(),
	source: text().$type<NotificationSource>().notNull(),
	type: text().$type<NotificationType>().notNull(),
	priority: text().$type<'high' | 'normal'>().notNull().default('normal'),
	title: text().default(''),
	body: text().default(''),
	url: text().default(''),
	entity_ref: text({ mode: 'json' }).$type<EntityRef | null>(),
	payload: text({ mode: 'json' }).$type<Record<string, string>>().default({}),
	dedupe_key: text().notNull().unique(),
	read_at: text(),
	created_at: timestamp(),
}, (t) => ({
	readIdx: index('notifications_read_at_idx').on(t.read_at),
	createdIdx: index('notifications_created_at_idx').on(t.created_at),
}));
```

Ajouter l'import des types en tête (`import type { NotificationSource, NotificationType, EntityRef } from '@/types'`) et `index` depuis `drizzle-orm/sqlite-core` s'il n'est pas déjà importé.

- [ ] **Step 3: Générer la migration**

Run: `npx drizzle-kit generate`
Expected: un nouveau fichier `src/db/migrations/XXXX_*.sql` créant `notifications` + index (additif, aucune table existante modifiée).

- [ ] **Step 4: Vérifier que la table est créée au boot Next**

Run: `npm run dev` (côté Next uniquement suffit), puis vérifier que la DB contient la table :
`sqlite3 data/devora.db ".tables" | grep notifications`
Expected: `notifications` listée. Arrêter le dev server.

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: pas d'erreur liée au schéma/types.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/types/index.ts src/db/migrations/
git commit -m "feat(notifications): add notifications table, types and migration"
```

---

### Task 2: Logique pure `build` (dedupeKey, buildNotification, priority)

**Files:**
- Create: `packages/agent/src/notifications/build.ts`
- Test: `packages/agent/src/notifications/build.test.ts`

**Interfaces:**
- Consumes: types `NotificationType`, `EntityRef`, `NewNotification` (redéclarés localement côté agent — voir note).
- Produces:
  - `priorityFor(type: NotificationType): 'high' | 'normal'`
  - `sourceFor(type: NotificationType): NotificationSource`
  - `buildDedupeKey(type: NotificationType, parts: string[]): string`
  - `buildNotification(input: { type; title; body?; url?; entityRef?; payload?; dedupeParts: string[] }): NewNotification`

**Note types côté agent** : `packages/agent` ne partage pas le path-alias `@/types`. Redéclarer les types nécessaires dans `packages/agent/src/notifications/types.ts` (copie fidèle de `NotificationType`, `NotificationSource`, `EntityRef`, `NewNotification`). Ce fichier est créé dans cette tâche.

- [ ] **Step 1: Créer `packages/agent/src/notifications/types.ts`**

```ts
export type NotificationSource = 'agent' | 'github' | 'ci' | 'pr';
export type NotificationType =
	| 'agent_done' | 'agent_error' | 'agent_blocked'
	| 'ci_failed' | 'ci_passed'
	| 'mention' | 'review_requested'
	| 'pr_merged' | 'pr_approved' | 'changes_requested';
export interface EntityRef { kind: 'session' | 'issue' | 'pr'; id: string; repo?: string; }
export interface NewNotification {
	source: NotificationSource;
	type: NotificationType;
	priority: 'high' | 'normal';
	title: string;
	body: string;
	url: string;
	entity_ref: EntityRef | null;
	payload: Record<string, string>;
	dedupe_key: string;
}
```

- [ ] **Step 2: Écrire le test qui échoue `build.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { priorityFor, sourceFor, buildDedupeKey, buildNotification } from './build.js';

describe('priorityFor', () => {
	it('marks blocking/failure types high', () => {
		expect(priorityFor('agent_blocked')).toBe('high');
		expect(priorityFor('agent_error')).toBe('high');
		expect(priorityFor('ci_failed')).toBe('high');
		expect(priorityFor('changes_requested')).toBe('high');
	});
	it('marks the rest normal', () => {
		expect(priorityFor('agent_done')).toBe('normal');
		expect(priorityFor('pr_merged')).toBe('normal');
	});
});

describe('sourceFor', () => {
	it('maps type -> source', () => {
		expect(sourceFor('agent_done')).toBe('agent');
		expect(sourceFor('ci_failed')).toBe('ci');
		expect(sourceFor('mention')).toBe('github');
		expect(sourceFor('pr_merged')).toBe('pr');
	});
});

describe('buildDedupeKey', () => {
	it('is stable and joins parts', () => {
		expect(buildDedupeKey('ci_failed', ['owner/repo#42', 'abc123'])).toBe('ci_failed:owner/repo#42:abc123');
	});
});

describe('buildNotification', () => {
	it('normalizes into a NewNotification', () => {
		const n = buildNotification({
			type: 'agent_blocked',
			title: 'blocked',
			url: '/workbench?session=s1',
			entityRef: { kind: 'session', id: 's1' },
			payload: { agent: 'Devora' },
			dedupeParts: ['s1', 'q1'],
		});
		expect(n.source).toBe('agent');
		expect(n.priority).toBe('high');
		expect(n.dedupe_key).toBe('agent_blocked:s1:q1');
		expect(n.body).toBe('');
		expect(n.entity_ref).toEqual({ kind: 'session', id: 's1' });
	});
});
```

- [ ] **Step 3: Lancer le test → échoue**

Run: `npx vitest run packages/agent/src/notifications/build.test.ts`
Expected: FAIL (`build.js` introuvable / exports manquants).

- [ ] **Step 4: Implémenter `packages/agent/src/notifications/build.ts`**

```ts
import type { NotificationType, NotificationSource, EntityRef, NewNotification } from './types.js';

const HIGH: ReadonlySet<NotificationType> = new Set(['agent_blocked', 'agent_error', 'ci_failed', 'changes_requested']);

const SOURCE: Record<NotificationType, NotificationSource> = {
	agent_done: 'agent', agent_error: 'agent', agent_blocked: 'agent',
	ci_failed: 'ci', ci_passed: 'ci',
	mention: 'github', review_requested: 'github',
	pr_merged: 'pr', pr_approved: 'pr', changes_requested: 'pr',
};

export function priorityFor(type: NotificationType): 'high' | 'normal' {
	return HIGH.has(type) ? 'high' : 'normal';
}
export function sourceFor(type: NotificationType): NotificationSource {
	return SOURCE[type];
}
export function buildDedupeKey(type: NotificationType, parts: string[]): string {
	return [type, ...parts].join(':');
}
export function buildNotification(input: {
	type: NotificationType;
	title: string;
	body?: string;
	url?: string;
	entityRef?: EntityRef | null;
	payload?: Record<string, string>;
	dedupeParts: string[];
}): NewNotification {
	return {
		source: sourceFor(input.type),
		type: input.type,
		priority: priorityFor(input.type),
		title: input.title,
		body: input.body ?? '',
		url: input.url ?? '',
		entity_ref: input.entityRef ?? null,
		payload: input.payload ?? {},
		dedupe_key: buildDedupeKey(input.type, input.dedupeParts),
	};
}
```

- [ ] **Step 5: Lancer le test → passe**

Run: `npx vitest run packages/agent/src/notifications/build.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/notifications/
git commit -m "feat(notifications): pure build helpers (dedupe, priority, source)"
```

---

### Task 3: Logique pure `diffGithubState` (cœur du poller)

**Files:**
- Create: `packages/agent/src/notifications/diff.ts`
- Test: `packages/agent/src/notifications/diff.test.ts`

**Interfaces:**
- Consumes: `buildNotification` (Task 2).
- Produces:
  - Types `GithubState`, `PrSnapshot`, `NotifThreadSnapshot`.
  - `diffGithubState(prev: GithubState, next: GithubState): NewNotification[]`

State shape (déterministe, aucune I/O) :
```ts
export interface PrSnapshot {
	repo: string;          // 'owner/repo'
	number: number;
	url: string;
	title: string;
	headSha: string;
	checkStatus: 'pending' | 'success' | 'failure' | null;
	reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	merged: boolean;
}
export interface NotifThreadSnapshot {
	id: string;            // github thread id
	reason: string;        // 'mention' | 'review_requested' | autre
	title: string;
	url: string;
	repo: string;
}
export interface GithubState {
	prs: Record<string, PrSnapshot>;       // clé = `${repo}#${number}`
	threads: Record<string, NotifThreadSnapshot>; // clé = thread id
}
```

- [ ] **Step 1: Écrire le test qui échoue `diff.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { diffGithubState, type GithubState } from './diff.js';

const empty: GithubState = { prs: {}, threads: {} };
const pr = (over: Partial<import('./diff.js').PrSnapshot> = {}): import('./diff.js').PrSnapshot => ({
	repo: 'o/r', number: 42, url: 'https://gh/pr/42', title: 'PR', headSha: 'sha1',
	checkStatus: 'pending', reviewDecision: null, merged: false, ...over,
});

describe('diffGithubState', () => {
	it('emits nothing when prev == next', () => {
		const s: GithubState = { prs: { 'o/r#42': pr() }, threads: {} };
		expect(diffGithubState(s, s)).toEqual([]);
	});

	it('emits ci_failed when checks go pending -> failure (keyed by sha)', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'pending' }) }, threads: {} };
		const next: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'failure' }) }, threads: {} };
		const out = diffGithubState(prev, next);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('ci_failed');
		expect(out[0].dedupe_key).toBe('ci_failed:o/r#42:sha1');
	});

	it('emits ci_passed on failure -> success', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'failure' }) }, threads: {} };
		const next: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'success' }) }, threads: {} };
		expect(diffGithubState(prev, next)[0].type).toBe('ci_passed');
	});

	it('emits pr_merged when merged flips true', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ merged: false }) }, threads: {} };
		const next: GithubState = { prs: { 'o/r#42': pr({ merged: true }) }, threads: {} };
		const out = diffGithubState(prev, next);
		expect(out.map(n => n.type)).toContain('pr_merged');
		expect(out.find(n => n.type === 'pr_merged')!.dedupe_key).toBe('pr_merged:o/r#42');
	});

	it('emits pr_approved / changes_requested on review decision change', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ reviewDecision: 'REVIEW_REQUIRED' }) }, threads: {} };
		const approved = diffGithubState(prev, { prs: { 'o/r#42': pr({ reviewDecision: 'APPROVED' }) }, threads: {} });
		expect(approved.map(n => n.type)).toContain('pr_approved');
		const changes = diffGithubState(prev, { prs: { 'o/r#42': pr({ reviewDecision: 'CHANGES_REQUESTED' }) }, threads: {} });
		expect(changes.map(n => n.type)).toContain('changes_requested');
	});

	it('emits a github notif for a new thread, keyed by thread id', () => {
		const next: GithubState = { prs: {}, threads: { t1: { id: 't1', reason: 'mention', title: 'hi', url: 'u', repo: 'o/r' } } };
		const out = diffGithubState(empty, next);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('mention');
		expect(out[0].dedupe_key).toBe('mention:t1');
	});

	it('maps review_requested reason to review_requested type', () => {
		const next: GithubState = { prs: {}, threads: { t2: { id: 't2', reason: 'review_requested', title: 'r', url: 'u', repo: 'o/r' } } };
		expect(diffGithubState(empty, next)[0].type).toBe('review_requested');
	});

	it('does not re-emit an existing thread', () => {
		const s: GithubState = { prs: {}, threads: { t1: { id: 't1', reason: 'mention', title: 'hi', url: 'u', repo: 'o/r' } } };
		expect(diffGithubState(s, s)).toEqual([]);
	});
});
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run packages/agent/src/notifications/diff.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `packages/agent/src/notifications/diff.ts`**

```ts
import { buildNotification } from './build.js';
import type { NewNotification, NotificationType } from './types.js';

export interface PrSnapshot {
	repo: string; number: number; url: string; title: string; headSha: string;
	checkStatus: 'pending' | 'success' | 'failure' | null;
	reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	merged: boolean;
}
export interface NotifThreadSnapshot { id: string; reason: string; title: string; url: string; repo: string; }
export interface GithubState { prs: Record<string, PrSnapshot>; threads: Record<string, NotifThreadSnapshot>; }

function threadType(reason: string): NotificationType {
	return reason === 'review_requested' ? 'review_requested' : 'mention';
}

export function diffGithubState(prev: GithubState, next: GithubState): NewNotification[] {
	const out: NewNotification[] = [];

	for (const [key, pr] of Object.entries(next.prs)) {
		const before = prev.prs[key];
		const ref = `${pr.repo}#${pr.number}`;
		const entityRef = { kind: 'pr' as const, id: String(pr.number), repo: pr.repo };
		const payload = { repo: pr.repo, number: String(pr.number), title: pr.title };

		// CI transitions (dedupe includes sha → stable across reboots, re-fires on new sha)
		if (before && before.checkStatus !== pr.checkStatus) {
			if (pr.checkStatus === 'failure') {
				out.push(buildNotification({ type: 'ci_failed', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref, pr.headSha] }));
			} else if (pr.checkStatus === 'success' && before.checkStatus === 'failure') {
				out.push(buildNotification({ type: 'ci_passed', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref, pr.headSha] }));
			}
		}
		// Merge
		if (before && !before.merged && pr.merged) {
			out.push(buildNotification({ type: 'pr_merged', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref] }));
		}
		// Review decision
		if (before && before.reviewDecision !== pr.reviewDecision) {
			if (pr.reviewDecision === 'APPROVED') {
				out.push(buildNotification({ type: 'pr_approved', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref] }));
			} else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
				out.push(buildNotification({ type: 'changes_requested', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref] }));
			}
		}
	}

	for (const [id, th] of Object.entries(next.threads)) {
		if (prev.threads[id]) continue;
		const type = threadType(th.reason);
		out.push(buildNotification({
			type, title: th.title, url: th.url,
			entityRef: { kind: 'issue', id, repo: th.repo },
			payload: { repo: th.repo, title: th.title }, dedupeParts: [id],
		}));
	}

	return out;
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run packages/agent/src/notifications/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/notifications/diff.ts packages/agent/src/notifications/diff.test.ts
git commit -m "feat(notifications): pure diffGithubState (poller core)"
```

---

### Task 4: Store SSE in-memory + helper d'insertion

**Files:**
- Create: `packages/agent/src/notifications/store.ts`
- Create: `packages/agent/src/notifications/insert.ts`
- Test: `packages/agent/src/notifications/insert.test.ts`

**Interfaces:**
- Consumes: `getDb()` de `packages/agent/src/db.ts`, `NewNotification` (Task 2), `notificationStore`.
- Produces:
  - `notificationStore.emit(row)`, `notificationStore.subscribe(res): () => void`
  - `insertNotification(db, notif: NewNotification): InsertedRow | null` — `INSERT OR IGNORE`, retourne la ligne insérée (avec id/created_at) ou `null` si dédupliquée.
  - `insertAndEmit(db, notif): void`

Signature `getDb` : `packages/agent/src/db.ts` expose `getDb()` (better-sqlite3, SQL brut). Vérifier la forme réelle avant d'écrire (SQL brut, pas Drizzle côté agent).

- [ ] **Step 1: Implémenter le store `store.ts`**

```ts
import type { ServerResponse } from 'node:http';

export interface EmittedNotification {
	id: string; source: string; type: string; priority: string;
	title: string; body: string; url: string;
	entity_ref: unknown; payload: unknown; read_at: string | null; created_at: string;
}

const clients = new Set<ServerResponse>();

export const notificationStore = {
	emit(row: EmittedNotification): void {
		const data = `data: ${JSON.stringify(row)}\n\n`;
		for (const res of clients) {
			try { res.write(data); } catch { clients.delete(res); }
		}
	},
	subscribe(res: ServerResponse): () => void {
		clients.add(res);
		return () => clients.delete(res);
	},
	count(): number { return clients.size; },
};
```

- [ ] **Step 2: Écrire le test qui échoue `insert.test.ts`**

Utilise un better-sqlite3 en mémoire avec le même schéma que la table (colonnes de Task 1).

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { insertNotification } from './insert.js';
import type { NewNotification } from './types.js';

let db: Database.Database;
beforeEach(() => {
	db = new Database(':memory:');
	db.exec(`CREATE TABLE notifications (
		id TEXT PRIMARY KEY, source TEXT NOT NULL, type TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal',
		title TEXT DEFAULT '', body TEXT DEFAULT '', url TEXT DEFAULT '',
		entity_ref TEXT, payload TEXT DEFAULT '{}', dedupe_key TEXT NOT NULL UNIQUE,
		read_at TEXT, created_at TEXT DEFAULT (datetime('now')));`);
});

const notif = (over: Partial<NewNotification> = {}): NewNotification => ({
	source: 'agent', type: 'agent_done', priority: 'normal', title: 't', body: '', url: '/w',
	entity_ref: { kind: 'session', id: 's1' }, payload: {}, dedupe_key: 'agent_done:s1:1', ...over,
});

describe('insertNotification', () => {
	it('inserts a new row and returns it', () => {
		const row = insertNotification(db, notif());
		expect(row).not.toBeNull();
		expect(row!.id).toBeTruthy();
		expect(row!.dedupe_key).toBe('agent_done:s1:1');
		expect(row!.read_at).toBeNull();
	});
	it('returns null on duplicate dedupe_key', () => {
		insertNotification(db, notif());
		expect(insertNotification(db, notif())).toBeNull();
		expect(db.prepare('SELECT COUNT(*) c FROM notifications').get()).toEqual({ c: 1 });
	});
	it('serializes entity_ref and payload as JSON', () => {
		const row = insertNotification(db, notif({ payload: { a: 'b' } }));
		expect(row!.payload).toEqual({ a: 'b' });
		expect(row!.entity_ref).toEqual({ kind: 'session', id: 's1' });
	});
});
```

- [ ] **Step 3: Lancer → échoue**

Run: `npx vitest run packages/agent/src/notifications/insert.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implémenter `insert.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { NewNotification } from './types.js';
import { notificationStore, type EmittedNotification } from './store.js';

export function insertNotification(db: Database.Database, n: NewNotification): EmittedNotification | null {
	const id = randomUUID();
	const info = db.prepare(
		`INSERT OR IGNORE INTO notifications
		 (id, source, type, priority, title, body, url, entity_ref, payload, dedupe_key, read_at)
		 VALUES (@id, @source, @type, @priority, @title, @body, @url, @entity_ref, @payload, @dedupe_key, NULL)`
	).run({
		id, source: n.source, type: n.type, priority: n.priority,
		title: n.title, body: n.body, url: n.url,
		entity_ref: JSON.stringify(n.entity_ref), payload: JSON.stringify(n.payload),
		dedupe_key: n.dedupe_key,
	});
	if (info.changes === 0) return null;
	const raw = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown>;
	return {
		id: raw.id as string, source: raw.source as string, type: raw.type as string, priority: raw.priority as string,
		title: raw.title as string, body: raw.body as string, url: raw.url as string,
		entity_ref: raw.entity_ref ? JSON.parse(raw.entity_ref as string) : null,
		payload: raw.payload ? JSON.parse(raw.payload as string) : {},
		read_at: (raw.read_at as string | null) ?? null, created_at: raw.created_at as string,
	};
}

export function insertAndEmit(db: Database.Database, n: NewNotification): void {
	const row = insertNotification(db, n);
	if (row) notificationStore.emit(row);
}
```

- [ ] **Step 5: Lancer → passe**

Run: `npx vitest run packages/agent/src/notifications/insert.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/notifications/store.ts packages/agent/src/notifications/insert.ts packages/agent/src/notifications/insert.test.ts
git commit -m "feat(notifications): SSE store + idempotent insertNotification"
```

---

### Task 5: Endpoint SSE `/notifications/stream` (serveur agent)

**Files:**
- Create: `packages/agent/src/routes/notifications.ts`
- Modify: `packages/agent/src/index.ts` (brancher le préfixe `/notifications`)

**Interfaces:**
- Consumes: `notificationStore.subscribe` (Task 4).
- Produces: route HTTP `GET /notifications/stream` (text/event-stream).

Cette tâche n'a pas de test unitaire (I/O réseau) — vérification manuelle via `curl`.

- [ ] **Step 1: Implémenter `routes/notifications.ts`**

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { notificationStore } from '../notifications/store.js';

export function handleNotificationsStream(req: IncomingMessage, res: ServerResponse): void {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
		'Access-Control-Allow-Origin': '*',
	});
	res.write(': hello\n\n');
	const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 25_000);
	const off = notificationStore.subscribe(res);
	req.on('close', () => { clearInterval(ping); off(); });
}
```

Note CORS : aligner l'en-tête `Access-Control-Allow-Origin` sur ce que fait déjà `index.ts` (localhost / `DEVORA_ORIGIN`). Réutiliser le helper CORS existant du serveur agent s'il y en a un plutôt que `*`.

- [ ] **Step 2: Brancher dans `index.ts`**

Dans le dispatch par préfixe de `packages/agent/src/index.ts`, ajouter, **avant** le fallback 404 :

```ts
import { handleNotificationsStream } from './routes/notifications.js';
// ...
if (req.method === 'GET' && url.pathname === '/notifications/stream') {
	return handleNotificationsStream(req, res);
}
```

(Adapter à la façon exacte dont `index.ts` parse `url`/`pathname` et enchaîne les préfixes existants `/git`, `/sessions`, etc.)

- [ ] **Step 3: Vérification manuelle SSE**

Run (serveur agent lancé via `npm run dev`) :
`curl -N http://localhost:4001/notifications/stream`
Expected: reçoit `: hello` immédiatement, puis `: ping` toutes les 25 s. Laisser tourner ~30 s pour voir un ping, puis Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/routes/notifications.ts packages/agent/src/index.ts
git commit -m "feat(notifications): SSE endpoint GET /notifications/stream"
```

---

### Task 6: Writers agents — fin/erreur (`sdkAgent.ts`) + bloqué (`permissions.ts`)

**Files:**
- Modify: `packages/agent/src/sdk/sdkAgent.ts` (au hook `result`, ~ligne 98/143)
- Modify: `packages/agent/src/sdk/permissions.ts` (à la création d'une `PendingQuestion`)

**Interfaces:**
- Consumes: `insertAndEmit` (Task 4), `buildNotification` (Task 2), `getDb()`.
- Produces: insertion de `agent_done`/`agent_error`/`agent_blocked` en base + émission SSE.

⚠️ **Point vérifié en revue** : `agent_blocked` **n'est pas** dans `sdkAgent.ts` (aucune dérivation `ask_question`). Il se branche dans `permissions.ts`, qui possède `PendingQuestion { id, questions }` avec un `id` stable.

Pas de test unitaire (intégration dans du code stateful existant). Vérification via build + run manuel.

- [ ] **Step 1: Repérer le contexte réel**

Lire `packages/agent/src/sdk/sdkAgent.ts` autour de la ligne 98 (event `result` : accès à `sessionId`, `is_error`, `num_turns`, `agentName`/`cwd`, `repo` si dispo) et l'écriture `agent_activity_logs` (~143). Lire `packages/agent/src/sdk/permissions.ts` pour trouver où une `PendingQuestion` est créée et de quel `sessionId` elle dispose.

- [ ] **Step 2: Ajouter le writer fin/erreur dans `sdkAgent.ts`**

Au point où l'event `result` est traité (à côté de la dérivation des logs), ajouter :

```ts
import { buildNotification } from '../notifications/build.js';
import { insertAndEmit } from '../notifications/insert.js';
import { getDb } from '../db.js';
// ... dans le handler de result (ev.event === 'result') :
try {
	const type = ev.is_error ? 'agent_error' : 'agent_done';
	const notif = buildNotification({
		type,
		title: '',
		url: `/workbench?session=${sessionId}`,
		entityRef: { kind: 'session', id: sessionId },
		payload: { agent: agentName ?? '', session: sessionId },
		dedupeParts: [sessionId, String(ev.num_turns ?? 0)],
	});
	insertAndEmit(getDb(), notif);
} catch (err) {
	console.error('[notifications] failed to write agent result notif', err);
}
```

Adapter `agentName`/`sessionId` aux variables réellement disponibles dans le scope. Le `try/catch` garantit qu'un échec notif ne casse jamais le flux agent (cf. Risque #2 : table potentiellement absente au tout premier boot).

- [ ] **Step 3: Ajouter le writer bloqué dans `permissions.ts`**

À l'endroit où une `PendingQuestion` est créée/enregistrée (elle a `id` + `sessionId`) :

```ts
import { buildNotification } from '../notifications/build.js';
import { insertAndEmit } from '../notifications/insert.js';
import { getDb } from '../db.js';
// ... quand une PendingQuestion est créée :
try {
	insertAndEmit(getDb(), buildNotification({
		type: 'agent_blocked',
		title: '',
		url: `/workbench?session=${sessionId}`,
		entityRef: { kind: 'session', id: sessionId },
		payload: { session: sessionId },
		dedupeParts: [sessionId, pendingQuestion.id],
	}));
} catch (err) {
	console.error('[notifications] failed to write agent_blocked notif', err);
}
```

Adapter `sessionId` / `pendingQuestion.id` aux noms réels.

- [ ] **Step 4: Build agent**

Run: `npm run build` (ou le script de build du package agent — vérifier `package.json`). Sinon `npx tsc -p packages/agent`.
Expected: compile sans erreur.

- [ ] **Step 5: Vérification manuelle end-to-end**

`npm run dev`, ouvrir `curl -N http://localhost:4001/notifications/stream` dans un terminal, lancer un agent depuis l'UI et le laisser finir (ou déclencher une AskUserQuestion). Expected : un event `data:` `agent_done`/`agent_blocked` apparaît dans le `curl`. Vérifier aussi en base : `sqlite3 data/devora.db "SELECT type,dedupe_key FROM notifications ORDER BY created_at DESC LIMIT 3;"`.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/sdk/sdkAgent.ts packages/agent/src/sdk/permissions.ts
git commit -m "feat(notifications): agent writers (done/error in sdkAgent, blocked in permissions)"
```

---

### Task 7: Poller GitHub (`githubPoller`) + démarrage

**Files:**
- Create: `packages/agent/src/notifications/githubPoller.ts`
- Modify: `packages/agent/src/index.ts` (démarrer le poller au boot)

**Interfaces:**
- Consumes: `diffGithubState` + `GithubState` (Task 3), `insertAndEmit` (Task 4), `getDb()`, la résolution de token (`packages/agent/src/helpers.ts`), `repo_paths` en base.
- Produces: `startGithubPoller(): () => void` (retourne un `stop`).

Pas de test unitaire du poller lui-même (I/O) — sa logique décisionnelle est déjà couverte par `diff.test.ts` (Task 3). Une fonction pure de mapping REST→`GithubState` peut être extraite et testée si le temps le permet (optionnel, non bloquant).

- [ ] **Step 1: Vérifier la résolution de token sans requête**

Lire `packages/agent/src/helpers.ts` : identifier la fonction qui fait `execFileSync(findGh(), ['auth','token'])` (ou `GITHUB_TOKEN`). Le poller n'a pas de `req` → appeler ce chemin direct, pas `resolveGitHubToken(req)`. Si seule la version request-bound existe, extraire un `getLocalGithubToken(): string | null` dans `helpers.ts` et l'utiliser des deux côtés.

- [ ] **Step 2: Implémenter `githubPoller.ts`**

```ts
import { getDb } from '../db.js';
import { insertAndEmit } from './insert.js';
import { diffGithubState, type GithubState, type PrSnapshot, type NotifThreadSnapshot } from './diff.js';
import { getLocalGithubToken } from '../helpers.js';

const GH = 'https://api.github.com';
const DEFAULT_INTERVAL = 60_000;

function ghHeaders(token: string) {
	return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

function watchedRepos(): string[] {
	const rows = getDb().prepare('SELECT repo_full_name FROM repo_paths').all() as { repo_full_name: string }[];
	return rows.map(r => r.repo_full_name).filter(r => r.includes('/'));
}

async function fetchState(token: string): Promise<GithubState> {
	const state: GithubState = { prs: {}, threads: {} };
	// GitHub notifications (mentions / review_requested)
	const nres = await fetch(`${GH}/notifications`, { headers: ghHeaders(token) });
	if (nres.ok) {
		const threads = await nres.json() as Array<Record<string, any>>;
		for (const t of threads) {
			const id = String(t.id);
			state.threads[id] = {
				id, reason: t.reason, title: t.subject?.title ?? '',
				url: t.subject?.url ?? t.repository?.html_url ?? '',
				repo: t.repository?.full_name ?? '',
			};
		}
	}
	// Open PRs + checks + review decision, per watched repo
	for (const repo of watchedRepos()) {
		const [owner, name] = repo.split('/');
		const pres = await fetch(`${GH}/repos/${owner}/${name}/pulls?state=open&per_page=30`, { headers: ghHeaders(token) });
		if (!pres.ok) continue;
		const prs = await pres.json() as Array<Record<string, any>>;
		for (const pr of prs) {
			const sha = pr.head?.sha ?? '';
			let checkStatus: PrSnapshot['checkStatus'] = null;
			const cres = await fetch(`${GH}/repos/${owner}/${name}/commits/${sha}/check-runs`, { headers: ghHeaders(token) });
			if (cres.ok) {
				const { check_runs = [] } = await cres.json() as { check_runs: Array<{ status: string; conclusion: string | null }> };
				if (check_runs.length) {
					if (check_runs.some(c => c.conclusion === 'failure' || c.conclusion === 'timed_out')) checkStatus = 'failure';
					else if (check_runs.some(c => c.status !== 'completed')) checkStatus = 'pending';
					else checkStatus = 'success';
				}
			}
			state.prs[`${repo}#${pr.number}`] = {
				repo, number: pr.number, url: pr.html_url, title: pr.title, headSha: sha,
				checkStatus, reviewDecision: null, merged: !!pr.merged_at,
			};
		}
	}
	return state;
}

export function startGithubPoller(): () => void {
	let prev: GithubState = { prs: {}, threads: {} };
	let stopped = false;
	let timer: ReturnType<typeof setTimeout>;

	async function tick() {
		if (stopped) return;
		let interval = DEFAULT_INTERVAL;
		try {
			const token = getLocalGithubToken();
			if (token) {
				const next = await fetchState(token);
				const delta = diffGithubState(prev, next);
				for (const n of delta) insertAndEmit(getDb(), n); // INSERT OR IGNORE absorbe les doublons au boot
				prev = next;
			}
		} catch (err) {
			console.error('[notifications] github poller tick failed', err);
		} finally {
			if (!stopped) timer = setTimeout(tick, interval);
		}
	}

	timer = setTimeout(tick, 3_000); // léger délai au boot (laisse Next créer le schéma)
	return () => { stopped = true; clearTimeout(timer); };
}
```

Note `reviewDecision` : l'API REST `/pulls` ne renvoie pas le review decision directement. En v1, dériver un proxy simple depuis `/pulls/{n}/reviews` (dernier review par user : `APPROVED`/`CHANGES_REQUESTED`) **ou** laisser `null` et documenter que `pr_approved`/`changes_requested` s'appuient sur ce fetch. Décision d'implémentation : ajouter un fetch `/pulls/${pr.number}/reviews` et calculer `reviewDecision` = état du dernier review non-commenté. Garder l'appel borné (per_page=100, dernier gagne).

- [ ] **Step 3: Démarrer le poller dans `index.ts`**

```ts
import { startGithubPoller } from './notifications/githubPoller.js';
// ... après le listen du serveur :
const stopPoller = startGithubPoller();
process.on('SIGTERM', () => { stopPoller(); });
process.on('SIGINT', () => { stopPoller(); });
```

- [ ] **Step 4: Build + vérification manuelle**

Run: build agent (Task 6 step 4). Puis `npm run dev`, `curl -N http://localhost:4001/notifications/stream`. Provoquer un changement d'état GitHub simple (ex. push un commit qui casse le CI d'une PR ouverte d'un repo surveillé) — ou vérifier qu'au moins le tick ne throw pas (logs) et que les threads existants n'inondent pas la base (grâce à `INSERT OR IGNORE`). Vérifier le rate-limit : pas de boucle serrée.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/notifications/githubPoller.ts packages/agent/src/index.ts packages/agent/src/helpers.ts
git commit -m "feat(notifications): server-side GitHub poller (CI/PR/notifs) feeding SSE"
```

---

### Task 8: Routes CRUD Next (`/api/notifications`)

**Files:**
- Create: `src/app/api/notifications/route.ts` (GET)
- Create: `src/app/api/notifications/mark-read/route.ts` (PATCH)
- Create: `src/app/api/notifications/mark-all-read/route.ts` (POST)

**Interfaces:**
- Consumes: `db` + `notifications` (Task 1), `requireAuth`/`isAuthError`.
- Produces: endpoints REST consommés par les hooks (Task 10).

Pas de test unitaire (routes = I/O + auth). Vérification via `curl`.

- [ ] **Step 1: `GET /api/notifications`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { desc, isNull, sql } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;
	const { searchParams } = new URL(req.url);
	if (searchParams.get('count') === '1') {
		const row = db.select({ c: sql<number>`count(*)` }).from(notifications).where(isNull(notifications.read_at)).get();
		return NextResponse.json({ unread: row?.c ?? 0 });
	}
	const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
	const q = db.select().from(notifications).orderBy(desc(notifications.created_at)).limit(limit);
	const rows = searchParams.get('unread') === '1'
		? db.select().from(notifications).where(isNull(notifications.read_at)).orderBy(desc(notifications.created_at)).limit(limit).all()
		: q.all();
	return NextResponse.json(rows);
}
```

- [ ] **Step 2: `PATCH /api/notifications/mark-read`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { inArray, sql } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;
	try {
		const { ids } = await req.json() as { ids: string[] };
		if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });
		db.update(notifications).set({ read_at: sql`datetime('now')` }).where(inArray(notifications.id, ids)).run();
		return NextResponse.json({ ok: true, updated: ids.length });
	} catch (e) {
		return NextResponse.json({ error: String(e) }, { status: 500 });
	}
}
```

- [ ] **Step 3: `POST /api/notifications/mark-all-read`**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { isNull, sql } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function POST() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;
	try {
		db.update(notifications).set({ read_at: sql`datetime('now')` }).where(isNull(notifications.read_at)).run();
		return NextResponse.json({ ok: true });
	} catch (e) {
		return NextResponse.json({ error: String(e) }, { status: 500 });
	}
}
```

- [ ] **Step 4: Vérification `curl`**

`npm run dev`, puis :
`curl "http://localhost:4000/api/notifications?count=1"` → `{"unread": N}`
`curl "http://localhost:4000/api/notifications?limit=5"` → tableau.

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat(notifications): Next CRUD routes (list, mark-read, mark-all-read)"
```

---

### Task 9: Reducer client pur (`notificationsReducer.ts`)

**Files:**
- Create: `src/lib/notificationsReducer.ts`
- Test: `src/lib/notificationsReducer.test.ts`

**Interfaces:**
- Consumes: `AppNotification` (Task 1).
- Produces:
  - `prependNotification(list: AppNotification[], incoming: AppNotification, cap?: number): AppNotification[]`
  - `titleFor(n: AppNotification, t: (key: string, vars?: Record<string, string>) => string): string`
  - `iconKeyFor(source: NotificationSource): string`
  - `groupByDay(list: AppNotification[]): Array<{ day: string; items: AppNotification[] }>`
  - `unreadCount(list: AppNotification[]): number`

- [ ] **Step 1: Écrire le test qui échoue `notificationsReducer.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { prependNotification, titleFor, unreadCount, groupByDay } from './notificationsReducer';
import type { AppNotification } from '@/types';

const mk = (over: Partial<AppNotification> = {}): AppNotification => ({
	id: 'a', source: 'agent', type: 'agent_done', priority: 'normal',
	title: '', body: '', url: '/w', entity_ref: null, payload: {}, read_at: null,
	created_at: '2026-07-18 10:00:00', ...over,
});

describe('prependNotification', () => {
	it('adds to front and dedups by id', () => {
		const list = [mk({ id: '1' })];
		const out = prependNotification(list, mk({ id: '2' }));
		expect(out.map(n => n.id)).toEqual(['2', '1']);
		const dup = prependNotification(out, mk({ id: '2' }));
		expect(dup.map(n => n.id)).toEqual(['2', '1']);
	});
	it('caps the list length', () => {
		const list = Array.from({ length: 5 }, (_, i) => mk({ id: String(i) }));
		expect(prependNotification(list, mk({ id: 'x' }), 3)).toHaveLength(3);
	});
});

describe('unreadCount', () => {
	it('counts null read_at', () => {
		expect(unreadCount([mk({ read_at: null }), mk({ id: 'b', read_at: '2026-07-18' })])).toBe(1);
	});
});

describe('titleFor', () => {
	it('uses t(type, payload) and falls back to n.title', () => {
		const t = (k: string, v?: Record<string, string>) => `${k}:${v?.repo ?? ''}`;
		expect(titleFor(mk({ type: 'ci_failed', payload: { repo: 'o/r' } }), t)).toBe('ci_failed:o/r');
	});
});

describe('groupByDay', () => {
	it('groups by calendar day, newest first', () => {
		const g = groupByDay([mk({ id: '1', created_at: '2026-07-18 09:00:00' }), mk({ id: '2', created_at: '2026-07-17 09:00:00' })]);
		expect(g.map(x => x.day)).toEqual(['2026-07-18', '2026-07-17']);
	});
});
```

- [ ] **Step 2: Lancer → échoue**

Run: `npx vitest run src/lib/notificationsReducer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `notificationsReducer.ts`**

```ts
import type { AppNotification, NotificationSource } from '@/types';

export function prependNotification(list: AppNotification[], incoming: AppNotification, cap = 200): AppNotification[] {
	const filtered = list.filter(n => n.id !== incoming.id);
	return [incoming, ...filtered].slice(0, cap);
}

export function unreadCount(list: AppNotification[]): number {
	return list.reduce((acc, n) => acc + (n.read_at ? 0 : 1), 0);
}

export function titleFor(n: AppNotification, t: (key: string, vars?: Record<string, string>) => string): string {
	const translated = t(n.type, n.payload);
	if (translated && translated !== n.type) return translated;
	return n.title || n.type;
}

export function iconKeyFor(source: NotificationSource): string {
	return source; // mappé en composant côté UI
}

export function groupByDay(list: AppNotification[]): Array<{ day: string; items: AppNotification[] }> {
	const groups = new Map<string, AppNotification[]>();
	for (const n of list) {
		const day = (n.created_at ?? '').slice(0, 10);
		if (!groups.has(day)) groups.set(day, []);
		groups.get(day)!.push(n);
	}
	return [...groups.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([day, items]) => ({ day, items }));
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npx vitest run src/lib/notificationsReducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificationsReducer.ts src/lib/notificationsReducer.test.ts
git commit -m "feat(notifications): pure client reducer (prepend, group, title)"
```

---

### Task 10: Hooks front (`useNotifications`, `useNotificationsStream`, `useMarkNotifications`) + `getAgentSseUrl`

**Files:**
- Modify: `src/lib/local-fetch.ts` (ajouter `getAgentSseUrl()`)
- Create: `src/hooks/useNotifications.ts`
- Create: `src/hooks/useNotificationsStream.ts`
- Create: `src/hooks/useMarkNotifications.ts`

**Interfaces:**
- Consumes: `apiFetch`, React Query `queryClient`, `prependNotification`/`unreadCount` (Task 9), `AppNotification`.
- Produces:
  - `useNotifications(): { notifications: AppNotification[]; unread: number; isLoading: boolean }`
  - `useNotificationsStream(): void` (effet, monté une fois)
  - `useMarkNotifications(): { markRead(ids: string[]): void; markAllRead(): void }`
  - `getAgentSseUrl(): string`

- [ ] **Step 1: Ajouter `getAgentSseUrl()` dans `src/lib/local-fetch.ts`**

Sur le modèle de `getAgentWsUrl()` mais en HTTP :

```ts
export function getAgentSseUrl(): string {
	const base = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:4001';
	return base.replace(/\/$/, '') + '/notifications/stream';
}
```

(Vérifier le nom exact de la base utilisée par `getAgentWsUrl` et réutiliser la même résolution.)

- [ ] **Step 2: `useNotifications.ts`**

```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { unreadCount } from '@/lib/notificationsReducer';
import type { AppNotification } from '@/types';

export function useNotifications() {
	const { data, isLoading } = useQuery({
		queryKey: ['notifications'],
		queryFn: async () => (await apiFetch('/api/notifications?limit=50')) as AppNotification[],
		staleTime: 30_000,
	});
	const notifications = data ?? [];
	return { notifications, unread: unreadCount(notifications), isLoading };
}
```

- [ ] **Step 3: `useNotificationsStream.ts`**

```ts
'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAgentSseUrl } from '@/lib/local-fetch';
import { prependNotification } from '@/lib/notificationsReducer';
import type { AppNotification } from '@/types';

export function useNotificationsStream() {
	const qc = useQueryClient();
	useEffect(() => {
		const es = new EventSource(getAgentSseUrl());
		es.onmessage = (e) => {
			try {
				const n = JSON.parse(e.data) as AppNotification;
				qc.setQueryData<AppNotification[]>(['notifications'], (prev) => prependNotification(prev ?? [], n));
			} catch { /* ignore malformed */ }
		};
		es.onerror = () => {
			// EventSource reconnecte tout seul ; resync pour rattraper les inserts manqués
			qc.invalidateQueries({ queryKey: ['notifications'] });
		};
		return () => es.close();
	}, [qc]);
}
```

- [ ] **Step 4: `useMarkNotifications.ts`**

```ts
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { AppNotification } from '@/types';

export function useMarkNotifications() {
	const qc = useQueryClient();
	const patch = (updater: (n: AppNotification) => AppNotification) =>
		qc.setQueryData<AppNotification[]>(['notifications'], (prev) => (prev ?? []).map(updater));

	const markRead = useMutation({
		mutationFn: (ids: string[]) => apiFetch('/api/notifications/mark-read', { method: 'PATCH', body: JSON.stringify({ ids }) }),
		onMutate: async (ids) => {
			const prev = qc.getQueryData<AppNotification[]>(['notifications']);
			const now = new Date().toISOString();
			patch((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n));
			return { prev };
		},
		onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev); },
		onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
	});

	const markAllRead = useMutation({
		mutationFn: () => apiFetch('/api/notifications/mark-all-read', { method: 'POST' }),
		onMutate: async () => {
			const prev = qc.getQueryData<AppNotification[]>(['notifications']);
			const now = new Date().toISOString();
			patch((n) => (n.read_at ? n : { ...n, read_at: now }));
			return { prev };
		},
		onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev); },
		onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
	});

	return { markRead: (ids: string[]) => markRead.mutate(ids), markAllRead: () => markAllRead.mutate() };
}
```

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/local-fetch.ts src/hooks/useNotifications.ts src/hooks/useNotificationsStream.ts src/hooks/useMarkNotifications.ts
git commit -m "feat(notifications): front hooks (query, SSE stream, mark-read)"
```

---

### Task 11: i18n — namespace `notifications` (5 locales)

**Files:**
- Modify: `src/config/translate/en.json`, `fr.json`, `es.json`, `de.json`, `pt.json`

**Interfaces:**
- Produces: namespace `notifications` avec un libellé par `type` (interpolé depuis `payload`) + labels UI. Consommé par `titleFor` (Task 9) et les composants (Task 12/13).

- [ ] **Step 1: Ajouter le namespace `notifications` à `fr.json`**

```json
"notifications": {
	"title": "Notifications",
	"empty": "Aucune notification",
	"markAllRead": "Tout marquer lu",
	"seeAll": "Tout voir",
	"filterAll": "Tout",
	"filterAgents": "Agents",
	"filterCi": "CI",
	"filterGithub": "GitHub",
	"filterPr": "PR",
	"agent_done": "L'agent a terminé",
	"agent_error": "L'agent a échoué",
	"agent_blocked": "L'agent attend ta réponse",
	"ci_failed": "CI échouée — {repo} #{number}",
	"ci_passed": "CI réussie — {repo} #{number}",
	"mention": "Mention — {repo}",
	"review_requested": "Review demandée — {repo}",
	"pr_merged": "PR mergée — {repo} #{number}",
	"pr_approved": "PR approuvée — {repo} #{number}",
	"changes_requested": "Changements demandés — {repo} #{number}"
}
```

- [ ] **Step 2: Répliquer traduit dans `en.json`**

```json
"notifications": {
	"title": "Notifications",
	"empty": "No notifications",
	"markAllRead": "Mark all read",
	"seeAll": "See all",
	"filterAll": "All",
	"filterAgents": "Agents",
	"filterCi": "CI",
	"filterGithub": "GitHub",
	"filterPr": "PR",
	"agent_done": "Agent finished",
	"agent_error": "Agent failed",
	"agent_blocked": "Agent is waiting for you",
	"ci_failed": "CI failed — {repo} #{number}",
	"ci_passed": "CI passed — {repo} #{number}",
	"mention": "Mention — {repo}",
	"review_requested": "Review requested — {repo}",
	"pr_merged": "PR merged — {repo} #{number}",
	"pr_approved": "PR approved — {repo} #{number}",
	"changes_requested": "Changes requested — {repo} #{number}"
}
```

- [ ] **Step 3: Ajouter `es.json`, `de.json`, `pt.json`**

`es` :
```json
"notifications": {
	"title": "Notificaciones", "empty": "Sin notificaciones", "markAllRead": "Marcar todo leído", "seeAll": "Ver todo",
	"filterAll": "Todo", "filterAgents": "Agentes", "filterCi": "CI", "filterGithub": "GitHub", "filterPr": "PR",
	"agent_done": "El agente terminó", "agent_error": "El agente falló", "agent_blocked": "El agente espera tu respuesta",
	"ci_failed": "CI falló — {repo} #{number}", "ci_passed": "CI correcta — {repo} #{number}",
	"mention": "Mención — {repo}", "review_requested": "Revisión solicitada — {repo}",
	"pr_merged": "PR fusionada — {repo} #{number}", "pr_approved": "PR aprobada — {repo} #{number}",
	"changes_requested": "Cambios solicitados — {repo} #{number}"
}
```
`de` :
```json
"notifications": {
	"title": "Benachrichtigungen", "empty": "Keine Benachrichtigungen", "markAllRead": "Alle als gelesen markieren", "seeAll": "Alle anzeigen",
	"filterAll": "Alle", "filterAgents": "Agents", "filterCi": "CI", "filterGithub": "GitHub", "filterPr": "PR",
	"agent_done": "Agent fertig", "agent_error": "Agent fehlgeschlagen", "agent_blocked": "Agent wartet auf dich",
	"ci_failed": "CI fehlgeschlagen — {repo} #{number}", "ci_passed": "CI erfolgreich — {repo} #{number}",
	"mention": "Erwähnung — {repo}", "review_requested": "Review angefragt — {repo}",
	"pr_merged": "PR gemergt — {repo} #{number}", "pr_approved": "PR genehmigt — {repo} #{number}",
	"changes_requested": "Änderungen angefragt — {repo} #{number}"
}
```
`pt` :
```json
"notifications": {
	"title": "Notificações", "empty": "Sem notificações", "markAllRead": "Marcar tudo como lido", "seeAll": "Ver tudo",
	"filterAll": "Tudo", "filterAgents": "Agentes", "filterCi": "CI", "filterGithub": "GitHub", "filterPr": "PR",
	"agent_done": "O agente terminou", "agent_error": "O agente falhou", "agent_blocked": "O agente aguarda a sua resposta",
	"ci_failed": "CI falhou — {repo} #{number}", "ci_passed": "CI passou — {repo} #{number}",
	"mention": "Menção — {repo}", "review_requested": "Revisão solicitada — {repo}",
	"pr_merged": "PR mesclada — {repo} #{number}", "pr_approved": "PR aprovada — {repo} #{number}",
	"changes_requested": "Alterações solicitadas — {repo} #{number}"
}
```

Ajouter aussi la clé `sidebar.notifications` dans les 5 fichiers (« Notifications » / traductions).

- [ ] **Step 4: Vérifier le JSON**

Run: `node -e "['en','fr','es','de','pt'].forEach(l=>JSON.parse(require('fs').readFileSync('src/config/translate/'+l+'.json','utf8')))"`
Expected: aucune erreur (JSON valide).

- [ ] **Step 5: Commit**

```bash
git add src/config/translate/
git commit -m "feat(notifications): i18n namespace across 5 locales"
```

---

### Task 12: UI — `NotificationItem` + `NotificationsMenu` + cloche Header

**Files:**
- Create: `src/components/notifications/NotificationItem.tsx`
- Create: `src/components/notifications/NotificationsMenu.tsx`
- Create: `src/components/notifications/sourceIcon.tsx`
- Modify: `src/components/layout/Header.tsx` (cloche + badge dans le cluster droit)
- Modify: `src/components/layout/AppShell.tsx` (monter `useNotificationsStream` une fois)

**Interfaces:**
- Consumes: `useNotifications`, `useMarkNotifications` (Task 10), `titleFor` (Task 9), i18n (Task 11).
- Produces: composants réutilisés par la page (Task 13).

Pas de test (UI).

- [ ] **Step 1: `sourceIcon.tsx`**

```tsx
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import MergeRoundedIcon from '@mui/icons-material/MergeRounded';
import type { NotificationSource } from '@/types';

export function SourceIcon({ source, fontSize = 'small' }: { source: NotificationSource; fontSize?: 'small' | 'inherit' | 'medium' }) {
	switch (source) {
		case 'agent': return <SmartToyRoundedIcon fontSize={fontSize} />;
		case 'ci': return <BuildRoundedIcon fontSize={fontSize} />;
		case 'github': return <GitHubIcon fontSize={fontSize} />;
		case 'pr': return <MergeRoundedIcon fontSize={fontSize} />;
	}
}
```

- [ ] **Step 2: `NotificationItem.tsx`**

```tsx
'use client';
import { Box, ListItemButton, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { titleFor } from '@/lib/notificationsReducer';
import { SourceIcon } from './sourceIcon';
import type { AppNotification } from '@/types';

export function NotificationItem({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
	const t = useTranslations('notifications');
	const router = useRouter();
	const title = titleFor(n, (k, v) => t(k, v));
	const handleClick = () => {
		onRead(n.id);
		if (!n.url) return;
		if (n.url.startsWith('/')) router.push(n.url);
		else window.open(n.url, '_blank', 'noopener');
	};
	return (
		<ListItemButton onClick={handleClick} sx={{ alignItems: 'flex-start', gap: 1.5, py: 1 }}>
			<Box sx={{ mt: 0.3, color: 'text.secondary' }}><SourceIcon source={n.source} /></Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" sx={{ fontWeight: n.read_at ? 400 : 600 }} noWrap>{title}</Typography>
				{n.body ? <Typography variant="caption" color="text.secondary" noWrap>{n.body}</Typography> : null}
			</Box>
			{!n.read_at && <Box sx={{ mt: 0.8, width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />}
		</ListItemButton>
	);
}
```

- [ ] **Step 3: `NotificationsMenu.tsx`**

```tsx
'use client';
import { Menu, Box, Button, Divider, List, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotifications } from '@/hooks/useMarkNotifications';
import { NotificationItem } from './NotificationItem';

export function NotificationsMenu({ anchorEl, onClose }: { anchorEl: HTMLElement | null; onClose: () => void }) {
	const t = useTranslations('notifications');
	const router = useRouter();
	const { notifications } = useNotifications();
	const { markRead, markAllRead } = useMarkNotifications();
	const recent = notifications.slice(0, 10);
	return (
		<Menu anchorEl={anchorEl} open={!!anchorEl} onClose={onClose}
			slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1 }}>
				<Typography variant="subtitle2">{t('title')}</Typography>
				<Button size="small" onClick={() => markAllRead()}>{t('markAllRead')}</Button>
			</Box>
			<Divider />
			{recent.length === 0
				? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('empty')}</Typography>
				: <List dense disablePadding>{recent.map(n => <NotificationItem key={n.id} n={n} onRead={(id) => { markRead([id]); onClose(); }} />)}</List>}
			<Divider />
			<Button fullWidth onClick={() => { onClose(); router.push('/notifications'); }}>{t('seeAll')}</Button>
		</Menu>
	);
}
```

- [ ] **Step 4: Cloche dans `Header.tsx`**

Dans le cluster droit (`Box gap:1.5`, ~ligne 75), **avant** l'Avatar :

```tsx
import { useState } from 'react';
import { IconButton, Badge } from '@mui/material';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationsMenu } from '@/components/notifications/NotificationsMenu';
// ... dans le composant :
const { unread } = useNotifications();
const [bellAnchor, setBellAnchor] = useState<HTMLElement | null>(null);
// ... dans le JSX, avant l'Avatar :
<IconButton onClick={(e) => setBellAnchor(e.currentTarget)} aria-label="notifications">
	<Badge badgeContent={unread} color="error" max={99}><NotificationsRoundedIcon /></Badge>
</IconButton>
<NotificationsMenu anchorEl={bellAnchor} onClose={() => setBellAnchor(null)} />
```

- [ ] **Step 5: Monter le stream dans `AppShell.tsx`**

```tsx
import { useNotificationsStream } from '@/hooks/useNotificationsStream';
// ... au début du composant AppShell :
useNotificationsStream();
```

- [ ] **Step 6: Vérification build + run**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK. Puis `npm run dev`, vérifier la cloche dans le Header, badge = compteur non-lus, clic ouvre le menu, clic item navigue + décrémente.

- [ ] **Step 7: Commit**

```bash
git add src/components/notifications/ src/components/layout/Header.tsx src/components/layout/AppShell.tsx
git commit -m "feat(notifications): header bell, dropdown menu, live SSE mount"
```

---

### Task 13: UI — page `/notifications` + entrée Sidebar

**Files:**
- Create: `src/app/(app)/notifications/page.tsx`
- Create: `src/components/notifications/NotificationsPage.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (entrée `mainItems` + badge)

**Interfaces:**
- Consumes: `useNotifications`, `useMarkNotifications`, `groupByDay` (Task 9), `NotificationItem` (Task 12), i18n (Task 11).
- Produces: page complète accessible depuis la Sidebar.

Pas de test (UI).

- [ ] **Step 1: `NotificationsPage.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Box, Chip, Stack, Typography, Button, List, Divider } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotifications } from '@/hooks/useMarkNotifications';
import { groupByDay } from '@/lib/notificationsReducer';
import { NotificationItem } from './NotificationItem';
import type { NotificationSource } from '@/types';

type Filter = 'all' | NotificationSource;

export function NotificationsPage() {
	const t = useTranslations('notifications');
	const { notifications } = useNotifications();
	const { markRead, markAllRead } = useMarkNotifications();
	const [filter, setFilter] = useState<Filter>('all');

	const filtered = filter === 'all' ? notifications : notifications.filter(n => n.source === filter);
	const groups = groupByDay(filtered);
	const filters: { key: Filter; label: string }[] = [
		{ key: 'all', label: t('filterAll') }, { key: 'agent', label: t('filterAgents') },
		{ key: 'ci', label: t('filterCi') }, { key: 'github', label: t('filterGithub') }, { key: 'pr', label: t('filterPr') },
	];

	return (
		<Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
				<Typography variant="h5">{t('title')}</Typography>
				<Button size="small" onClick={() => markAllRead()}>{t('markAllRead')}</Button>
			</Box>
			<Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
				{filters.map(f => (
					<Chip key={f.key} label={f.label} color={filter === f.key ? 'primary' : 'default'}
						onClick={() => setFilter(f.key)} size="small" />
				))}
			</Stack>
			{groups.length === 0
				? <Typography color="text.secondary">{t('empty')}</Typography>
				: groups.map(g => (
					<Box key={g.day} sx={{ mb: 2 }}>
						<Typography variant="caption" color="text.secondary">{g.day}</Typography>
						<Divider sx={{ my: 0.5 }} />
						<List dense disablePadding>
							{g.items.map(n => <NotificationItem key={n.id} n={n} onRead={(id) => markRead([id])} />)}
						</List>
					</Box>
				))}
		</Box>
	);
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import { NotificationsPage } from '@/components/notifications/NotificationsPage';
export default function Page() {
	return <NotificationsPage />;
}
```

- [ ] **Step 3: Entrée Sidebar avec badge**

Dans `src/components/layout/Sidebar.tsx`, ajouter à `mainItems` (~ligne 177) un item `{ label: t('notifications'), href: '/notifications', icon: <NotificationsRoundedIcon /> }`. Pour le badge sur l'icône, décorer via `useNotifications().unread` :

```tsx
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import { Badge } from '@mui/material';
import { useNotifications } from '@/hooks/useNotifications';
// ... dans le composant :
const { unread } = useNotifications();
// item icon :
icon: <Badge badgeContent={unread} color="error" max={99}><NotificationsRoundedIcon /></Badge>
```

(Suivre la façon exacte dont `mainItems` construit ses items et rend `icon` ; réutiliser `t` du namespace `sidebar` pour le label `sidebar.notifications`.)

- [ ] **Step 4: Vérification build + run**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK. `npm run dev` → l'entrée Notifications apparaît dans la Sidebar avec badge, la page liste groupée par jour, les filtres marchent, « Tout marquer lu » vide le badge.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/notifications/" src/components/notifications/NotificationsPage.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(notifications): inbox page + sidebar entry with badge"
```

---

### Task 14: Vérification finale end-to-end

**Files:** aucun (validation).

- [ ] **Step 1: Suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent (build, diff, insert, reducer).

- [ ] **Step 2: Lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur.

- [ ] **Step 3: Scénario manuel complet**

`npm run dev` (Next + agent). Ouvrir l'app :
1. Lancer un agent, le laisser finir → notif `agent_done` apparaît en live (badge +1, item dans le menu).
2. Déclencher une AskUserQuestion → notif `agent_blocked` (priority high) en live.
3. Cliquer une notif agent → navigue vers `/workbench?session=…` + marque lue (badge -1).
4. « Tout marquer lu » → badge à 0.
5. Couper le serveur agent 10 s puis le relancer → le front resync (invalidateQueries via `onerror`), pas de doublons.
6. Vérifier la table : `sqlite3 data/devora.db "SELECT type, dedupe_key, read_at FROM notifications ORDER BY created_at DESC LIMIT 10;"` — pas de doublon de `dedupe_key`.

- [ ] **Step 4: Commit final (si ajustements)**

```bash
git add -A
git commit -m "chore(notifications): final e2e verification fixes"
```

---

## Notes d'exécution

- **Ordre de démarrage** : l'app Next doit avoir tourné au moins une fois pour créer la table `notifications` (migrations) avant que le poller/agent n'écrive. `dev-auto-port.mjs` lance les deux ; les `try/catch` des writers absorbent une table absente au tout premier boot.
- **Rate-limit GitHub** : le poller borne aux `repo_paths` et respecte l'intervalle ; si un 403 rate-limit survient, il log et skippe le tick (à durcir en Task 7 si besoin via `Retry-After`).
- **Réutilisation** : `NotificationItem` est partagé entre le menu (Task 12) et la page (Task 13) — ne pas dupliquer.
