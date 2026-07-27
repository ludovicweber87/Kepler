# Normalisation des timestamps en ISO 8601 UTC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire que toutes les dates stockées en base soient de l'ISO 8601 UTC non ambigu, pour que `new Date(valeur)` rende partout l'heure locale de la machine — l'onglet Activity affiche aujourd'hui deux heures de retard.

**Architecture:** Le stockage passe au format `2026-07-27T06:20:58.828Z`. Trois fronts : les écritures (défaut de schéma Drizzle, SQL explicite, et surtout les `INSERT` bruts qui omettent la colonne), une migration unique qui convertit l'existant, et zéro changement côté lecture — une fois le stockage sans ambiguïté, les consommateurs sont corrects sans le savoir.

**Tech Stack:** SQLite (better-sqlite3) + Drizzle ORM, Next.js 16 (`src/`), serveur agent Node (`packages/agent/`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-timestamps-utc-design.md`

## Global Constraints

- **Format cible, à la lettre :** `strftime('%Y-%m-%dT%H:%M:%fZ', ...)` côté SQL, `new Date().toISOString()` côté JS. Les deux produisent des millisecondes. **Ne jamais utiliser `%S` à la place de `%f`** : mélanger les précisions recasse le tri à l'intérieur d'une même seconde (`.500Z` se trie avant `Z`).
- **Deux runners de tests.** `src/**/*.test.ts` et `packages/agent/src/{notifications,routes}/**/*.test.ts` tournent sous **Vitest** (`npm run test:web`). Tout le reste de `packages/agent` tourne sous **`node:test`** (`npm test --workspace packages/agent`). Le fichier de test de ce plan vit dans `src/`, donc Vitest.
- **`better-sqlite3` fonctionne sous Vitest** malgré l'environnement `jsdom` — précédent : `packages/agent/src/notifications/insert.test.ts`.
- **ESM dans `packages/agent`** : suffixe `.js` sur tous les imports relatifs, y compris vers des `.ts`.
- **Ne jamais toucher `~/.devora/devora.db`.** Toute vérification de migration se fait sur une copie dans `/tmp`.
- **Ne pas exécuter `drizzle-kit`.** Les migrations de ce dépôt sont écrites à la main depuis la `0008` ; lancer `generate` produirait un snapshot divergent.
- Échec de test **pré-existant** à ignorer : `packages/agent/src/routes/parsePorcelain.test.ts` est un test Vitest que le runner `node:test` du workspace ramasse et ne sait pas exécuter.

---

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `src/db/schema.ts` | Le helper `timestamp()` — défaut JS au lieu de défaut SQL | 1 |
| `src/db/schema.test.ts` (créé) | Prouve qu'un insert Drizzle omettant la colonne écrit bien du `Z` | 1 |
| `packages/agent/src/helpers.ts` | La constante `NOW_ISO` partagée par le serveur agent | 2 |
| `packages/agent/src/sdk/{sdkAgent,transcriptStore,docSession,docTools}.ts`, `routes/{sessions,docs}.ts`, `notifications/insert.ts` | Les 8 écritures du serveur agent | 2 |
| `src/app/api/{tasks,docs,notifications/mark-read}/route.ts` | Les 4 écritures de l'API Next | 3 |
| `src/db/migrations/0024_timestamps_utc.sql` (créé) + `meta/_journal.json` | La conversion de l'existant | 4 |
| `src/db/migrations/0024_timestamps_utc.test.ts` (créé) | Le SQL de migration, testé sur une base en mémoire | 4 |

**Ordre :** les écritures d'abord (1→3), la migration ensuite (4). Si on migrait en premier, chaque action d'agent réintroduirait des lignes à l'ancien format entre la migration et la fin du chantier.

---

### Task 1: Le défaut de schéma passe côté JavaScript

**Files:**
- Modify: `src/db/schema.ts:5`
- Test: `src/db/schema.test.ts` (créé)

**Interfaces:**
- Consumes: rien
- Produces: le helper `timestamp()` produit désormais une valeur ISO UTC à l'insert, sans défaut SQL.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/db/schema.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { appSettings } from './schema';

/**
 * La table est créée avec le DEFAULT SQL hérité, exactement comme dans la base
 * réelle : la migration ne le retire pas (SQLite ne sait pas modifier un défaut
 * de colonne). Le test vérifie donc que Drizzle fournit sa propre valeur et que
 * ce défaut résiduel ne s'applique jamais.
 */
function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec(`CREATE TABLE app_settings (
		id text PRIMARY KEY NOT NULL,
		key text NOT NULL UNIQUE,
		value text DEFAULT '',
		updated_at text DEFAULT (datetime('now'))
	);`);
	return { sqlite, db: drizzle(sqlite) };
}

describe('helper timestamp() du schéma', () => {
	it("écrit de l'ISO UTC quand la colonne est omise à l'insert", () => {
		const { sqlite, db } = makeDb();
		db.insert(appSettings).values({ key: 'k', value: 'v' }).run();
		const row = sqlite.prepare('SELECT updated_at FROM app_settings').get() as {
			updated_at: string;
		};
		// L'assertion qui compte : un `.default(sql...)` resté à côté du
		// `$defaultFn` ferait gagner le défaut SQL, et cette valeur finirait
		// par une seconde sans Z.
		expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	it('produit une valeur relisible par Date sans décalage', () => {
		const { sqlite, db } = makeDb();
		const before = Date.now();
		db.insert(appSettings).values({ key: 'k2', value: 'v' }).run();
		const row = sqlite.prepare("SELECT updated_at FROM app_settings WHERE key='k2'").get() as {
			updated_at: string;
		};
		const parsed = new Date(row.updated_at).getTime();
		// Une valeur interprétée dans le mauvais fuseau dériverait d'heures.
		expect(Math.abs(parsed - before)).toBeLessThan(5000);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:web -- src/db/schema.test.ts`
Expected: FAIL — la valeur vaut `2026-07-27 06:19:28` (défaut SQL), la regex ne matche pas.

- [ ] **Step 3: Modifier le helper**

Dans `src/db/schema.ts`, remplacer la ligne 5 :

```ts
const timestamp = () => text().default(sql`(datetime('now'))`);
```

par :

```ts
// Défaut côté JS et non côté SQL : `datetime('now')` produit de l'UTC sans
// marqueur de fuseau, que `new Date()` relit ensuite comme de l'heure locale.
// Le `.default(sql...)` ne doit PAS être conservé à côté : le dialecte SQLite de
// Drizzle teste `col.default` avant `col.defaultFn`, donc les deux ensemble
// laisseraient l'ancien format s'écrire.
const timestamp = () => text().$defaultFn(() => new Date().toISOString());
```

Si `sql` n'est plus utilisé ailleurs dans le fichier, retirer son import — le linter le signalera.

- [ ] **Step 4: Lancer le test**

Run: `npm run test:web -- src/db/schema.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts
git commit -m "fix(db): le defaut de timestamp passe en ISO UTC cote JS"
```

---

### Task 2: Les écritures du serveur agent

**Files:**
- Modify: `packages/agent/src/helpers.ts` (ajout de `NOW_ISO`)
- Modify: `packages/agent/src/sdk/sdkAgent.ts:361`, `packages/agent/src/sdk/transcriptStore.ts:26`, `packages/agent/src/sdk/docSession.ts:70`, `packages/agent/src/sdk/docTools.ts:46`
- Modify: `packages/agent/src/routes/sessions.ts:253`, `packages/agent/src/routes/docs.ts:55` et `:63`
- Modify: `packages/agent/src/notifications/insert.ts:12`

**Interfaces:**
- Consumes: rien
- Produces: `NOW_ISO` — fragment SQL `"strftime('%Y-%m-%dT%H:%M:%fZ','now')"`, exporté depuis `packages/agent/src/helpers.ts`

- [ ] **Step 1: Ajouter la constante**

À la fin de `packages/agent/src/helpers.ts` :

```ts
/**
 * Horodatage SQL au format ISO 8601 UTC avec millisecondes — le seul format
 * écrit en base. `datetime('now')` produit de l'UTC sans marqueur de fuseau,
 * que JavaScript relit comme de l'heure locale. Le `%f` (et non `%S`) est
 * requis : mélanger les précisions casse le tri lexicographique.
 */
export const NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
```

- [ ] **Step 2: Corriger les 4 écritures qui nomment déjà la colonne**

`packages/agent/src/sdk/docSession.ts:70` — dans l'`INSERT` de `ensureDocSessionRow`, remplacer `datetime('now')` par `${NOW_ISO}` (le littéral est déjà un template) :

```ts
      `INSERT INTO agent_sessions (id, session_id, project_path, project_name, agent_name, status, origin, started_at)
       VALUES (?, ?, ?, ?, ?, 'ready', 'doc', ${NOW_ISO})`,
```

`packages/agent/src/sdk/docTools.ts:46` :

```ts
  db.prepare(`UPDATE docs SET content = ?, updated_at = ${NOW_ISO} WHERE id = ?`).run(content, docId);
```

`packages/agent/src/routes/docs.ts:55` :

```ts
	db.prepare(
		`UPDATE docs SET status = ?, error = ?, updated_at = ${NOW_ISO} WHERE id = ?`,
	).run(status, error, docId);
```

`packages/agent/src/routes/docs.ts:63` :

```ts
	db.prepare(
		`UPDATE docs SET content = ?, status = 'ready', error = NULL, updated_at = ${NOW_ISO} WHERE id = ?`,
	).run(content, docId);
```

Ajouter l'import `NOW_ISO` en tête de chacun de ces quatre fichiers (depuis `'../helpers.js'` pour `sdk/` et `routes/`).

- [ ] **Step 3: Corriger les 4 `INSERT` qui omettent la colonne**

Ce sont eux qui font revenir le bug : sans valeur explicite, c'est le `DEFAULT (datetime('now'))` inscrit dans le DDL de la table qui s'applique.

`packages/agent/src/sdk/sdkAgent.ts:361` — `writeActivityLog`, la fonction qui alimente l'onglet Activity :

```ts
      d.prepare(`INSERT INTO agent_activity_logs (id, agent_session_id, content, log_type, created_at) VALUES (?, ?, ?, ?, ${NOW_ISO})`)
        .run(randomUUID(), row.id, content, logType);
```

`packages/agent/src/routes/sessions.ts:253` :

```ts
			db.prepare(
				`INSERT INTO agent_activity_logs (id, agent_session_id, content, log_type, created_at) VALUES (?, ?, ?, ?, ${NOW_ISO})`,
			).run(randomUUID(), session.id, summary, 'summary');
```

`packages/agent/src/sdk/transcriptStore.ts:26` — `appendEvent` :

```ts
  d.prepare(
    `INSERT INTO agent_chat_messages (id, agent_session_id, seq, role, event_type, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ${NOW_ISO})`,
  ).run(randomUUID(), sessionId, seq, role, safe.event, JSON.stringify(safe));
```

`packages/agent/src/notifications/insert.ts:12` — l'`INSERT` utilise des paramètres nommés ; ajouter la colonne et son expression, sans toucher à l'objet passé à `.run()` :

```ts
	const info = db.prepare(
		`INSERT OR IGNORE INTO notifications
		 (id, source, type, priority, title, body, url, entity_ref, payload, dedupe_key, read_at, created_at)
		 VALUES (@id, @source, @type, @priority, @title, @body, @url, @entity_ref, @payload, @dedupe_key, NULL, ${NOW_ISO})`
	).run({
```

Attention à l'import dans `notifications/insert.ts` : le chemin est `'../helpers.js'`.

- [ ] **Step 4: Vérifier qu'aucune écriture n'a été oubliée**

Run:
```bash
grep -rn "datetime('now')" packages/agent/src --include="*.ts" | grep -v "\.test\.ts"
```
Expected: aucun résultat.

- [ ] **Step 5: Compiler et lancer la suite agent**

Run: `npx tsc --noEmit -p packages/agent && npm test --workspace packages/agent`
Expected: compilation propre ; tests au vert hormis `parsePorcelain.test.ts`, l'échec pré-existant.

`packages/agent/src/notifications/insert.test.ts` couvre `insertNotification` : il doit rester vert. S'il crée sa table de test sans colonne `created_at`, l'ajouter à son DDL.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src
git commit -m "fix(agents): horodatages ISO UTC pour toutes les ecritures du serveur agent"
```

---

### Task 3: Les écritures de l'API Next

**Files:**
- Modify: `src/app/api/tasks/route.ts:92` et `:95`, `src/app/api/docs/route.ts:116`, `src/app/api/notifications/mark-read/route.ts:19`

**Interfaces:**
- Consumes: rien
- Produces: rien

- [ ] **Step 1: Remplacer les fragments SQL par du JavaScript**

Ces quatre sites passent un `sql\`(datetime('now'))\`` à Drizzle. On les aligne sur les huit autres écritures de l'API, qui utilisent déjà `new Date().toISOString()` — pas besoin d'un fragment SQL ici, et une expression JS est plus lisible qu'un `strftime`.

`src/app/api/tasks/route.ts` :

```ts
		if ('done' in body) {
			updates.completed_at = body.done ? new Date().toISOString() : null;
		}

		updates.updated_at = new Date().toISOString();
```

`src/app/api/docs/route.ts:116` :

```ts
			updates.updated_at = new Date().toISOString();
```

`src/app/api/notifications/mark-read/route.ts:19` :

```ts
		db.update(notifications)
			.set({ read_at: new Date().toISOString() })
```

Retirer l'import `sql` de `drizzle-orm` dans chacun de ces fichiers s'il n'y sert plus — le linter le signalera.

- [ ] **Step 2: Vérifier qu'il ne reste rien**

Run:
```bash
grep -rn "datetime('now')" src/app src/db --include="*.ts" | grep -v migrations
```
Expected: aucun résultat.

- [ ] **Step 3: Compiler et linter**

Run: `npx tsc --noEmit && npx eslint src/app/api/tasks/route.ts src/app/api/docs/route.ts src/app/api/notifications/mark-read/route.ts`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/app/api
git commit -m "fix(api): horodatages ISO UTC dans les routes tasks, docs et notifications"
```

---

### Task 4: La migration de l'existant

**Files:**
- Create: `src/db/migrations/0024_timestamps_utc.sql`
- Modify: `src/db/migrations/meta/_journal.json`
- Test: `src/db/migrations/0024_timestamps_utc.test.ts` (créé)

**Interfaces:**
- Consumes: rien
- Produces: rien

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/db/migrations/0024_timestamps_utc.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = readFileSync(join(process.cwd(), 'src/db/migrations/0024_timestamps_utc.sql'), 'utf8');

/** Une base minimale portant les deux formats et une colonne nullable. */
function seed() {
	const db = new Database(':memory:');
	db.exec(`CREATE TABLE agent_activity_logs (id text PRIMARY KEY, created_at text);`);
	db.exec(`CREATE TABLE agent_sessions (
		id text PRIMARY KEY, started_at text, ended_at text,
		report_published_at text, archived_at text);`);
	db.prepare('INSERT INTO agent_activity_logs VALUES (?, ?)').run('a', '2026-07-27 06:19:28');
	db.prepare('INSERT INTO agent_activity_logs VALUES (?, ?)').run('b', '2026-07-27T05:00:00.000Z');
	db.prepare('INSERT INTO agent_sessions VALUES (?, ?, ?, ?, ?)').run(
		's', '2026-07-27 06:19:28', null, null, null,
	);
	return db;
}

/**
 * N'applique que les instructions portant sur les tables de la base d'essai —
 * la migration réelle en touche quatorze, on n'en amorce que deux ici.
 */
function applyFor(db: Database.Database, tables: string[]) {
	const wanted = new Set(tables);
	for (const stmt of MIGRATION.split(';')) {
		const s = stmt.trim();
		if (!s) continue;
		const table = /^UPDATE\s+(\w+)\s/.exec(s)?.[1];
		if (table && wanted.has(table)) db.exec(s);
	}
}

describe('migration 0024 — timestamps en ISO UTC', () => {
	it("préserve l'instant, sans décalage de fuseau", () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const row = db.prepare("SELECT created_at FROM agent_activity_logs WHERE id='a'").get() as {
			created_at: string;
		};
		// 06:19:28 UTC doit rester 06:19:28 UTC. Une migration qui « corrigerait »
		// l'affichage en décalant de 2h corromprait les données.
		expect(row.created_at).toBe('2026-07-27T06:19:28.000Z');
	});

	it('laisse intacte une ligne déjà au format cible', () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const row = db.prepare("SELECT created_at FROM agent_activity_logs WHERE id='b'").get() as {
			created_at: string;
		};
		expect(row.created_at).toBe('2026-07-27T05:00:00.000Z');
	});

	it('est idempotente', () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const first = db.prepare('SELECT id, created_at FROM agent_activity_logs ORDER BY id').all();
		applyFor(db, ['agent_activity_logs']);
		const second = db.prepare('SELECT id, created_at FROM agent_activity_logs ORDER BY id').all();
		expect(second).toEqual(first);
	});

	it('rétablit un tri chronologique correct', () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const ids = (
			db.prepare('SELECT id FROM agent_activity_logs ORDER BY created_at').all() as {
				id: string;
			}[]
		).map((r) => r.id);
		// 'b' (05:00Z) précède 'a' (06:19Z). Avant migration, l'ordre lexicographique
		// plaçait 'a' en premier parce que l'espace précède le T.
		expect(ids).toEqual(['b', 'a']);
	});

	it('préserve les NULL des colonnes nullables', () => {
		const db = seed();
		applyFor(db, ['agent_sessions']);
		const row = db.prepare("SELECT * FROM agent_sessions WHERE id='s'").get() as Record<
			string,
			unknown
		>;
		expect(row.started_at).toBe('2026-07-27T06:19:28.000Z');
		expect(row.ended_at).toBeNull();
		expect(row.archived_at).toBeNull();
		expect(row.report_published_at).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:web -- src/db/migrations/0024_timestamps_utc.test.ts`
Expected: FAIL — `ENOENT`, le fichier de migration n'existe pas encore.

- [ ] **Step 3: Écrire la migration**

Créer `src/db/migrations/0024_timestamps_utc.sql`.

`datetime('now')` écrivait de l'UTC sans marqueur de fuseau, que JavaScript relit comme de l'heure locale. On convertit l'existant au format ISO complet. Le `NOT LIKE '%Z'` rend chaque instruction idempotente ; le `IS NOT NULL` explicite l'intention sur les colonnes nullables.

Les tables `persona_groups`, `pipeline_runs` et `pipeline_run_steps` sont **volontairement absentes** : supprimées par la migration `0018`, elles ne survivent que comme dérive dans certaines bases et feraient échouer la migration ailleurs.

```sql
-- Normalisation des horodatages en ISO 8601 UTC (`2026-07-27T06:19:28.828Z`).
-- Liste de colonnes explicite et jamais dérivée d'un LIKE '%_at' : `docs.format`
-- correspondrait à ce motif (le `_` de SQL vaut un caractère quelconque).

UPDATE agent_activity_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';

UPDATE agent_chat_messages SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';

UPDATE agent_sessions SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at) WHERE started_at IS NOT NULL AND started_at NOT LIKE '%Z';
UPDATE agent_sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', ended_at) WHERE ended_at IS NOT NULL AND ended_at NOT LIKE '%Z';
UPDATE agent_sessions SET report_published_at = strftime('%Y-%m-%dT%H:%M:%fZ', report_published_at) WHERE report_published_at IS NOT NULL AND report_published_at NOT LIKE '%Z';
UPDATE agent_sessions SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', archived_at) WHERE archived_at IS NOT NULL AND archived_at NOT LIKE '%Z';

UPDATE app_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';

UPDATE daily_recaps SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';

UPDATE doc_categories SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';

UPDATE doc_category_links SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';

UPDATE docs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
UPDATE docs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';

UPDATE notifications SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', read_at) WHERE read_at IS NOT NULL AND read_at NOT LIKE '%Z';

UPDATE personas SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
UPDATE personas SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';

UPDATE project_boards SET fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', fetched_at) WHERE fetched_at IS NOT NULL AND fetched_at NOT LIKE '%Z';

UPDATE repo_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';

UPDATE tab_orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';

UPDATE tasks SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z';
UPDATE tasks SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) WHERE completed_at IS NOT NULL AND completed_at NOT LIKE '%Z';
```

- [ ] **Step 4: Lancer le test**

Run: `npm run test:web -- src/db/migrations/0024_timestamps_utc.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Déclarer la migration au journal**

`migrate()` est piloté par le journal : un `.sql` sans entrée est ignoré en silence. Ajouter à la fin du tableau `entries` de `src/db/migrations/meta/_journal.json` :

```json
  {
   "idx": 24,
   "version": "6",
   "when": 1786100000000,
   "tag": "0024_timestamps_utc",
   "breakpoints": true
  }
```

Vérifier que `tag` est identique au nom du fichier sans extension — une divergence ferait échouer la lecture.

- [ ] **Step 6: Vérifier la migration sur une COPIE de la base réelle**

Ne jamais exécuter ceci sur `~/.devora/devora.db`.

```bash
cp ~/.devora/devora.db /tmp/devora-tz-test.db

# Avant : combien de valeurs à l'ancien format, et combien de NULL.
sqlite3 /tmp/devora-tz-test.db "
SELECT 'ancien format', count(*) FROM agent_activity_logs WHERE created_at NOT LIKE '%Z';
SELECT 'null started_at', count(*) FROM agent_sessions WHERE started_at IS NULL;
SELECT 'null ended_at', count(*) FROM agent_sessions WHERE ended_at IS NULL;
SELECT 'total logs', count(*) FROM agent_activity_logs;"

sqlite3 /tmp/devora-tz-test.db < src/db/migrations/0024_timestamps_utc.sql

# Après : plus aucune valeur à l'ancien format, NULL et totaux inchangés.
sqlite3 /tmp/devora-tz-test.db "
SELECT 'ancien format', count(*) FROM agent_activity_logs WHERE created_at NOT LIKE '%Z';
SELECT 'null started_at', count(*) FROM agent_sessions WHERE started_at IS NULL;
SELECT 'null ended_at', count(*) FROM agent_sessions WHERE ended_at IS NULL;
SELECT 'total logs', count(*) FROM agent_activity_logs;"
```

Expected : « ancien format » passe à `0`, les comptes de NULL et le total sont **identiques** avant et après.

Le contrôle des NULL n'est pas décoratif : `strftime` renvoie `NULL` sur une valeur malformée, et une ligne ainsi vidée n'apparaîtrait plus dans le compte « ancien format ». Sans ce second contrôle, une corruption passerait inaperçue.

Nettoyer : `rm /tmp/devora-tz-test.db`

- [ ] **Step 7: Lancer les deux suites complètes**

Run: `npm run test:web && npm test --workspace packages/agent`
Expected: vert, hormis les échecs pré-existants (`parsePorcelain.test.ts` côté agent, 2 cas de `useAgentChat.test.ts` côté web).

- [ ] **Step 8: Appliquer la migration sur la vraie base et vérifier à l'œil**

Run: `npm run dev`, attendre le démarrage (les migrations tournent à l'import de `src/db/index.ts`), puis ouvrir une session dans l'app et regarder l'onglet **Activity**.

Expected : les heures affichées correspondent à l'horloge de la machine. Comparer avec `date "+%H:%M"`.

Vérifier aussi qu'une **nouvelle** ligne d'activité s'affiche à la bonne heure — c'est ce qui valide la Task 2, la migration seule ne corrigeant que l'historique.

- [ ] **Step 9: Commit**

```bash
git add src/db/migrations/0024_timestamps_utc.sql src/db/migrations/0024_timestamps_utc.test.ts src/db/migrations/meta/_journal.json
git commit -m "fix(db): migration des horodatages existants en ISO UTC"
```

---

## Vérification finale

- [ ] `grep -rn "datetime('now')" src packages --include="*.ts" | grep -v migrations` — aucun résultat
- [ ] `npx tsc --noEmit` — propre
- [ ] `npm run lint` — aucune erreur nouvelle
- [ ] `npm run build` — succès
- [ ] `npm run test:web` — vert hormis les 2 échecs pré-existants de `useAgentChat.test.ts`
- [ ] `npm test --workspace packages/agent` — vert hormis `parsePorcelain.test.ts`
- [ ] Activity affiche l'heure de la machine, sur l'historique **et** sur une ligne fraîche
