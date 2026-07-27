# Normalisation des timestamps en ISO 8601 UTC

Date : 2026-07-27

## Problème

Les heures affichées dans Activity ont deux heures de retard : `06:13` alors qu'il est `08:13` sur la machine.

Ce n'est pas un défaut d'affichage isolé. Deux bugs se superposent.

**1. Le stockage est ambigu.** `datetime('now')` écrit `2026-07-27 06:19:28` — de l'UTC, sans marqueur de fuseau. Rien dans la chaîne ne dit qu'il s'agit d'UTC.

**2. JavaScript lit cette forme comme de l'heure locale.** Pour une chaîne séparée par une espace et sans offset, V8 applique le fuseau local. `new Date('2026-07-27 06:19:28')` donne donc `04:19Z`, et l'affichage rend `06:19` — la valeur UTC telle quelle, soit deux heures de retard en été à Paris.

Les deux couches du code font des lectures contradictoires du même stockage :

| Couche | Hypothèse | Verdict |
|---|---|---|
| `recap.ts:127` — `date(l.created_at, 'localtime')` | stocké en UTC | correct |
| `formatTime` et ~14 autres `new Date(col)` | stocké en local | faux |

**3. Les formats sont déjà mélangés en base.** Huit sites écrivent via `datetime('now')` explicite, quatre autres laissent le défaut SQL de la colonne s'appliquer — même format — et une dizaine écrivent via `new Date().toISOString()` (`2026-07-27T06:19:28.828Z`). La table `app_settings` contient les deux formes : 3 lignes ISO, 1 ligne SQLite.

Ce mélange casse aussi le tri, silencieusement. L'ordre lexicographique place l'espace (`0x20`) avant le `T` (`0x54`) :

```
2026-07-27 06:19:28     ← trié en premier
2026-07-27T05:00:00Z    ← pourtant antérieur d'une heure
```

Tout `ORDER BY created_at` mélangeant les deux formats renvoie donc un ordre faux.

## Objectif

Une seule représentation en base, sans ambiguïté, telle que `new Date(valeur)` rende partout l'heure locale de la machine — sans qu'aucun consommateur n'ait à le savoir.

## Format cible

ISO 8601 UTC avec millisecondes et suffixe `Z` : `2026-07-27T06:20:58.828Z`.

C'est déjà ce que produisent les huit sites en `toISOString()`. On aligne le reste sur eux plutôt que l'inverse — moins de code à changer, et c'est le format que `new Date()` interprète correctement par contrat, pas par chance d'implémentation.

**La précision doit être uniforme.** Mélanger secondes et millisecondes réintroduit le bug de tri à l'intérieur d'une même seconde, le point (`0x2E`) précédant le `Z` (`0x5A`) :

```
2026-07-27T06:19:28.500Z    ← trié en premier
2026-07-27T06:19:28Z        ← pourtant antérieur
```

D'où `strftime('%Y-%m-%dT%H:%M:%fZ', ...)` — le `%f` produit `28.828`, identique au rendu de `toISOString()`.

## Les écritures

Quatre familles. La plus importante est celle qu'un `grep` ne trouve pas.

**Les sites `toISOString()`** — inchangés, ils produisent déjà le format cible.

**Les 8 sites de `datetime('now')` explicite** — 4 dans `packages/agent` (`docSession.ts:70`, `docTools.ts:46`, `docs.ts:55`, `docs.ts:63`) et 4 dans `src/app/api` (`tasks/route.ts:92` et `:95`, `docs/route.ts:116`, `notifications/mark-read/route.ts:19`). Une constante partagée les remplace :

```ts
export const NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
```

**Les 4 `INSERT` en SQL brut qui omettent la colonne** — et c'est ici que se joue la correction réelle.

Ces requêtes ne mentionnent jamais `created_at` : elles laissent le **défaut SQL de la colonne** s'appliquer, c'est-à-dire `datetime('now')`, l'ancien format. Aucun `grep` sur `datetime('now')` ne les révèle, et le `$defaultFn` de Drizzle décrit plus bas ne les couvre pas non plus — ce sont des appels `better-sqlite3` directs, Drizzle n'est pas dans la boucle.

| Site | Colonne alimentée |
|---|---|
| `packages/agent/src/sdk/sdkAgent.ts:361` — `writeActivityLog` | `agent_activity_logs.created_at` |
| `packages/agent/src/routes/sessions.ts:253` | `agent_activity_logs.created_at` |
| `packages/agent/src/sdk/transcriptStore.ts:26` — `appendEvent` | `agent_chat_messages.created_at` |
| `packages/agent/src/notifications/insert.ts:12` — `insertNotification` | `notifications.created_at` |

Le premier est précisément la fonction qui écrit les lignes affichées dans l'onglet Activity — le symptôme d'origine. Sans ces quatre corrections, la migration réparerait l'historique et le bug reviendrait à la première action d'un agent.

Chacun de ces `INSERT` doit donc nommer la colonne et lui passer `NOW_ISO` explicitement, comme le fait déjà correctement `recap.ts:192`.

**Les défauts du schéma Drizzle** — et c'est ici que la solution évidente est la mauvaise.

SQLite ne sait pas modifier le défaut d'une colonne : `ALTER TABLE ... ALTER COLUMN` n'existe pas. Changer le défaut des 17 colonnes qui en portent un imposerait la procédure de reconstruction en douze étapes, table par table — un risque sans commune mesure avec le bug corrigé.

À la place, le helper `timestamp()` de `src/db/schema.ts` passe d'un défaut SQL à un défaut JavaScript :

```ts
const timestamp = () => text().$defaultFn(() => new Date().toISOString());
```

**Le `.default(sql...)` doit disparaître, pas cohabiter.** C'est contre-intuitif et c'est le piège de cette section : dans `drizzle-orm/sqlite-core/dialect.js`, la construction d'un `INSERT` teste `col.default` **en premier** et ne consulte `col.defaultFn` que dans la branche `else`. Une colonne portant les deux continuerait donc à écrire l'ancien format, silencieusement, sur toutes les tables — exactement le bug qu'on prétend corriger. Garder le défaut SQL « au cas où » ne serait pas une précaution : ce serait la panne.

**Le diff DDL n'est pas un sujet ici.** Retirer `.default()` modifie le snapshot que produit `drizzle-kit generate` — mais ce dépôt n'exécute jamais `drizzle-kit` : aucun script npm ne l'appelle, et les migrations sont écrites à la main (horodatages ronds dans le journal, `ALTER` rédigés directement). Le `DEFAULT (datetime('now'))` reste donc inscrit dans le DDL des tables existantes, inoffensif tant qu'aucune écriture ne l'atteint — ce dont se chargent les corrections des quatre `INSERT` bruts ci-dessus.

**Contrepartie assumée** : la source de vérité du timestamp se déplace de SQLite vers Node. Les deux tournent sur la même machine — application locale mono-utilisateur — donc aucune divergence n'est possible aujourd'hui. Si la base devenait distante, c'est l'horloge de l'app qui ferait foi.

**À vérifier à l'implémentation, par un test et non par raisonnement** : qu'un `db.insert()` Drizzle omettant la colonne produise bien une valeur terminée par `Z`. C'est l'assertion qui distingue un `$defaultFn` actif d'un `$defaultFn` masqué par un défaut SQL résiduel.

## La migration

Un `UPDATE` par colonne, sur une liste **explicite**.

**Jamais de découverte par pattern.** `docs.format` correspond à `LIKE '%_at'`, le `_` de SQL valant un caractère quelconque : `form` + `at`. Une migration générée par ce critère écraserait la colonne d'énumération du format des docs avec une date. La liste ci-dessous est figée dans le fichier de migration.

Forme de chaque instruction :

```sql
UPDATE agent_activity_logs
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z';
```

Le `NOT LIKE '%Z'` rend la migration idempotente et laisse intactes les lignes déjà au format cible. Le `IS NOT NULL` protège les colonnes nullables (`ended_at`, `archived_at`, `read_at`, `completed_at`…), sur lesquelles `strftime` renverrait `NULL` de toute façon, mais l'intention doit être lisible.

**Trois tables sont exclues bien qu'elles existent dans la base de Ludovic.** `persona_groups`, `pipeline_runs` et `pipeline_run_steps` ont été créées par la migration `0016` puis supprimées par la `0018`. Elles ne figurent pas dans `src/db/schema.ts`. Elles ne subsistent dans `~/.devora/devora.db` (vides) qu'au titre de la **dérive de migration** connue : `ensureSchema.ts` ajoute les tables et colonnes manquantes mais ne supprime jamais les surnuméraires.

Les inclure ferait passer la migration sur cette base précise — et échouer avec `no such table` sur un clone frais, en CI, ou le jour où la dérive est réconciliée. Elles sont donc hors liste. Nettoyer ces vestiges est un sujet distinct.

**Les 22 colonnes concernées**, réparties sur 14 tables :

| Table | Colonnes |
|---|---|
| `agent_activity_logs` | `created_at` |
| `agent_chat_messages` | `created_at` |
| `agent_sessions` | `started_at`, `ended_at`, `report_published_at`, `archived_at` |
| `app_settings` | `updated_at` |
| `daily_recaps` | `created_at` |
| `doc_categories` | `created_at` |
| `doc_category_links` | `created_at` |
| `docs` | `created_at`, `updated_at` |
| `notifications` | `created_at`, `read_at` |
| `personas` | `created_at`, `updated_at` |
| `project_boards` | `fetched_at` |
| `repo_settings` | `updated_at` |
| `tab_orders` | `updated_at` |
| `tasks` | `created_at`, `updated_at`, `completed_at` |

`__drizzle_migrations` est exclue : c'est la table interne de Drizzle, son `created_at` est un entier epoch et ne suit pas cette convention.

Volume principal : `agent_activity_logs`, environ 7 900 lignes.

**Vérification supplémentaire, non négociable.** `strftime` renvoie `NULL` sur une valeur malformée, vide, ou avec un `t`/`z` minuscule — et une ligne ainsi vidée n'apparaîtrait plus dans le compte des lignes « ne finissant pas par Z », donc le contrôle prévu ne la verrait pas. La vérification compare donc aussi le **nombre de NULL par colonne, avant et après**. Il doit être identique. Aucune anomalie n'existe dans les données actuelles — les 22 colonnes ont été inspectées sur une copie — mais la migration est irréversible.

## Les lectures

**Rien à changer.** Une fois le stockage sans ambiguïté, `new Date(valeur)` rend l'heure locale du navigateur sur les quelque quinze sites d'affichage — donc l'heure de la machine, ce qui est l'attendu.

Pas de helper de parsing tolérant : il laisserait le stockage ambigu, ne corrigerait pas le tri, et imposerait une discipline que chaque futur `new Date(colonne)` finirait par oublier.

`recap.ts` continue de fonctionner sans modification : SQLite 3.51 accepte `date('2026-07-27T06:19:28.828Z', 'localtime')` et rend la date locale correcte — vérifié.

## Tests

La convention du repo est « logique pure uniquement ». **Ce changement n'en contient presque aucune** : c'est une migration SQL, un helper de schéma d'une ligne, et le remplacement d'une constante. Inventer un module JS de normalisation pour avoir quelque chose à tester produirait du code existant uniquement pour son test — le contraire de ce que la convention cherche.

Le vrai risque est dans le SQL de la migration, et il se teste. `src/db/migrations/0024_timestamps_utc.test.ts` (Vitest, `better-sqlite3` en mémoire) :

- une table amorcée avec les deux formats d'origine ; après application du SQL, toutes les valeurs finissent par `Z` et le nombre de lignes est inchangé ;
- **l'instant est préservé** : `2026-07-27 06:19:28` devient `2026-07-27T06:19:28.000Z` — même instant, pas un décalage de fuseau appliqué au passage. C'est l'assertion qui compte : une migration qui décalerait toutes les dates de deux heures « corrigerait » l'affichage tout en corrompant les données ;
- idempotence : réappliquer le SQL ne change plus rien ;
- ordre : après conversion, deux lignes issues des deux formats se trient dans l'ordre chronologique réel ;
- `NULL` préservé sur les colonnes nullables.

C'est un écart assumé à la convention : le test touche SQLite plutôt que de la logique pure. Il est justifié parce que la migration est irréversible et s'exécute sur ~7 900 lignes de données réelles.

**Vérification de la migration** sur une **copie** de la base réelle, jamais sur `~/.devora/devora.db` : compter avant/après, par colonne, les lignes ne finissant pas par `Z`. Toutes doivent être à zéro après application, et le nombre de lignes doit être inchangé.

**Vérification manuelle** : relancer l'app et confirmer que l'heure affichée dans Activity correspond à l'horloge de la machine.

## Fichiers touchés

**Créés** — `src/db/migrations/0024_timestamps_utc.sql` et son entrée de journal, `src/db/migrations/0024_timestamps_utc.test.ts`.

**Modifiés** — `src/db/schema.ts` (helper `timestamp()`, suppression du `.default(sql...)`), les 4 fichiers de `packages/agent/src` portant un `datetime('now')` explicite, les 4 routes de `src/app/api` dans le même cas, et les 4 sites d'`INSERT` brut qui omettent la colonne (`sdkAgent.ts`, `sessions.ts`, `transcriptStore.ts`, `notifications/insert.ts`).
